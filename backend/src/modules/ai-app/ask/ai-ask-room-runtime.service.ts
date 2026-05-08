/**
 * AskRoomRuntime - 消息级 turn 编排器
 *
 * 设计：teams-mode.md §6 turn 执行链路
 * 范围（W2 PR3）：
 *   - 选 mode（启发式 + roomConfig + 用户显式）
 *   - 创建 AskRoomTurn
 *   - 调用对应 adapter（本期仅 FREECHAT；其他 mode 抛"待 W3/W4 实现"）
 *   - 落库 adapter 产出的消息
 *   - 终结 turn
 *
 * AbortController 管理：
 *   - 内部维护 turnId -> AbortController 映射，cancelTurn 时调用 abort()
 *   - 关键：runtime 单例进程内有效；多实例部署需用 Redis pub-sub（W5 follow-up）
 */

import { Injectable, Logger } from "@nestjs/common";
import {
  AskMessage,
  AskRoomMember,
  AskRoomMode,
  AskTurnStatus,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "@/common/prisma/prisma.service";
import {
  AskRoomServerEvent,
  askRoomKey,
} from "./gateway/ask-room-events.types";
import { FreechatAdapter } from "./adapters/freechat.adapter";
import type {
  IModeAdapter,
  ModeContext,
} from "./adapters/mode-adapter.interface";
import { AskRoomService } from "./ai-ask-room.service";
import { SendRoomMessageDto } from "./dto/send-room-message.dto";

interface TurnEmitContext {
  sessionId: string;
  emit: (room: string, event: AskRoomServerEvent) => void;
}

const HISTORY_FOR_LLM = 20;

@Injectable()
export class AskRoomRuntimeService {
  private readonly logger = new Logger(AskRoomRuntimeService.name);
  private readonly turnAbortControllers = new Map<string, AbortController>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly roomService: AskRoomService,
    private readonly freechatAdapter: FreechatAdapter,
  ) {}

  /**
   * 处理一条用户消息：落库 USER 消息 -> 选 mode -> 跑 adapter -> 落库 AI 消息 -> 终结 turn。
   *
   * 调用方（controller / gateway）传入 emit 回调以推送流式事件。
   */
  async runTurn(input: {
    sessionId: string;
    userId: string;
    dto: SendRoomMessageDto;
    emit: TurnEmitContext["emit"];
  }): Promise<{ turnId: string; userMessageId: string }> {
    const { sessionId, userId, dto } = input;

    const session = await this.roomService.findUserRoom(sessionId, userId);
    const members = await this.prisma.askRoomMember.findMany({
      where: { sessionId, deletedAt: null },
      orderBy: { order: "asc" },
    });

    const mentionedIds = (dto.mentionedMemberIds ?? []).filter((id) =>
      members.some((m) => m.id === id),
    );

    const userMessage = await this.roomService.appendUserMessage(
      sessionId,
      dto.content,
      mentionedIds,
    );

    const mode = this.pickMode({
      explicit: dto.mode,
      sessionConfig: session.roomConfig,
      mentionedCount: mentionedIds.length,
      content: dto.content,
    });

    const participants = this.pickParticipants(mode, members, mentionedIds);

    const turn = await this.roomService.createTurn({
      sessionId,
      triggerMessageId: userMessage.id,
      mode,
      participantIds: participants.map((m) => m.id),
    });

    // 异步执行 adapter；不阻塞 controller 返回。
    // 评审 W2 v3 R1 重要：必须 .catch() 兜底防 unhandled rejection。
    void this.executeAdapterAsync({
      sessionId,
      userId,
      turnId: turn.id,
      mode,
      members,
      participants,
      userMessage,
      modeOptions: dto.modeOptions as Record<string, unknown> | undefined,
      emitContext: { sessionId, emit: input.emit },
    }).catch((err) => {
      this.logger.error(
        `[runTurn] turn=${turn.id} unhandled rejection: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    });

    return { turnId: turn.id, userMessageId: userMessage.id };
  }

  async cancelTurn(
    sessionId: string,
    turnId: string,
    userId: string,
  ): Promise<void> {
    await this.roomService.cancelTurn(sessionId, turnId, userId);
    const controller = this.turnAbortControllers.get(turnId);
    if (controller && !controller.signal.aborted) {
      controller.abort();
    }
  }

  // ============ 内部 ============

  private async executeAdapterAsync(input: {
    sessionId: string;
    userId: string;
    turnId: string;
    mode: AskRoomMode;
    members: AskRoomMember[];
    participants: AskRoomMember[];
    userMessage: AskMessage;
    modeOptions?: Record<string, unknown>;
    emitContext: TurnEmitContext;
  }): Promise<void> {
    const {
      sessionId,
      userId,
      turnId,
      mode,
      members,
      userMessage,
      modeOptions,
      emitContext,
    } = input;

    const room = askRoomKey(sessionId);
    const controller = new AbortController();
    this.turnAbortControllers.set(turnId, controller);

    const seqStart = userMessage.sequenceNum ?? 0;
    emitContext.emit(room, {
      kind: "turn.started",
      turnId,
      sequenceNum: seqStart + 1,
      mode,
      participantIds: input.participants.map((m) => m.id),
    });

    const adapter = this.resolveAdapter(mode);
    if (!adapter) {
      const errMsg = `Mode ${mode} adapter not implemented in W2 PR3`;
      this.logger.warn(errMsg);
      emitContext.emit(room, {
        kind: "turn.error",
        turnId,
        sequenceNum: seqStart + 2,
        error: errMsg,
      });
      emitContext.emit(room, {
        kind: "turn.complete",
        turnId,
        sequenceNum: seqStart + 3,
        status: "FAILED",
      });
      await this.roomService.finalizeTurn(turnId, AskTurnStatus.FAILED, {
        reason: "adapter_not_implemented",
      });
      this.turnAbortControllers.delete(turnId);
      return;
    }

    // 评审 W2 v3 R1 次要：用 sequenceNum 排序更可靠（createdAt 毫秒精度可能并列）。
    // 同时按 createdAt 兜底覆盖 SOLO 历史消息（这些消息无 sequenceNum）。
    const orderedDesc = await this.prisma.askMessage.findMany({
      where: { sessionId },
      orderBy: [
        { sequenceNum: { sort: "desc", nulls: "last" } },
        { createdAt: "desc" },
      ],
      take: HISTORY_FOR_LLM,
    });
    const history = orderedDesc.reverse();

    const turn = await this.prisma.askRoomTurn.findUniqueOrThrow({
      where: { id: turnId },
    });

    const ctx: ModeContext = {
      session: await this.prisma.askSession.findUniqueOrThrow({
        where: { id: sessionId },
      }),
      members,
      triggerMessage: userMessage,
      history,
      turn,
      modeOptions,
      userId,
      sequenceNumStart: seqStart + 1,
      signal: controller.signal,
    };

    try {
      const result = await adapter.execute(ctx, (event) => {
        emitContext.emit(room, event);
      });

      // 落库 adapter 产出的消息
      await this.persistMessages(sessionId, turnId, result.messages);

      const finalSeq = result.messages.length
        ? result.messages[result.messages.length - 1].sequenceNum + 1
        : seqStart + 2;
      emitContext.emit(room, {
        kind: "turn.complete",
        turnId,
        sequenceNum: finalSeq,
        status: "COMPLETED",
      });
      await this.roomService.finalizeTurn(turnId, AskTurnStatus.COMPLETED, {
        ...result.metadata,
        messageCount: result.messages.length,
      });
    } catch (err) {
      const cancelled = controller.signal.aborted;
      const errMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `[runTurn] turn=${turnId} ${cancelled ? "CANCELLED" : "FAILED"}: ${errMessage}`,
      );
      if (cancelled) {
        emitContext.emit(room, {
          kind: "turn.complete",
          turnId,
          sequenceNum: seqStart + 99,
          status: "CANCELLED",
        });
      } else {
        emitContext.emit(room, {
          kind: "turn.error",
          turnId,
          sequenceNum: seqStart + 99,
          error: errMessage,
        });
        emitContext.emit(room, {
          kind: "turn.complete",
          turnId,
          sequenceNum: seqStart + 100,
          status: "FAILED",
        });
      }
      await this.roomService.finalizeTurn(
        turnId,
        cancelled ? AskTurnStatus.CANCELLED : AskTurnStatus.FAILED,
        { error: errMessage },
      );
    } finally {
      this.turnAbortControllers.delete(turnId);
    }
  }

  private resolveAdapter(mode: AskRoomMode): IModeAdapter | null {
    switch (mode) {
      case AskRoomMode.FREECHAT:
        return this.freechatAdapter;
      // W3+ 实现：PARALLEL_MERGE / DEBATE / VOTE / REVIEW / HANDOFF
      default:
        return null;
    }
  }

  private pickMode(input: {
    explicit?: AskRoomMode;
    sessionConfig: Prisma.JsonValue;
    mentionedCount: number;
    content: string;
  }): AskRoomMode {
    if (input.explicit) return input.explicit;
    const cfg =
      input.sessionConfig && typeof input.sessionConfig === "object"
        ? (input.sessionConfig as Record<string, unknown>)
        : {};
    if (typeof cfg.defaultMode === "string") {
      const def = cfg.defaultMode as AskRoomMode;
      if (Object.values(AskRoomMode).includes(def)) return def;
    }
    if (input.mentionedCount > 0) return AskRoomMode.FREECHAT;
    return AskRoomMode.FREECHAT;
  }

  private pickParticipants(
    mode: AskRoomMode,
    members: AskRoomMember[],
    mentionedIds: string[],
  ): AskRoomMember[] {
    const enabled = members.filter((m) => m.enabled && !m.deletedAt);
    if (mode === AskRoomMode.FREECHAT) {
      if (mentionedIds.length > 0) {
        return enabled.filter((m) => mentionedIds.includes(m.id));
      }
      const leader = enabled.find((m) => m.role === "LEADER") ?? enabled[0];
      return leader ? [leader] : [];
    }
    return enabled;
  }

  private async persistMessages(
    sessionId: string,
    turnId: string,
    messages: Array<{
      id: string;
      senderType: "AI" | "SYSTEM";
      senderMemberId: string | null;
      content: string;
      modelId: string | null;
      modelName: string | null;
      tokens: number;
      parentMessageId?: string | null;
      sequenceNum: number;
    }>,
  ): Promise<void> {
    if (messages.length === 0) return;
    // 评审 W2 v3 R1 重要：用 callback 形式确保原子回滚（数组形式仅 best-effort）。
    await this.prisma.$transaction(async (tx) => {
      for (const m of messages) {
        await tx.askMessage.create({
          data: {
            id: m.id,
            sessionId,
            role: m.senderType === "AI" ? "assistant" : "system",
            senderType: m.senderType,
            senderMemberId: m.senderMemberId,
            content: m.content,
            modelId: m.modelId,
            modelName: m.modelName,
            tokens: m.tokens,
            parentMessageId: m.parentMessageId ?? null,
            sequenceNum: m.sequenceNum,
            turnId,
          },
        });
      }
    });
  }
}
