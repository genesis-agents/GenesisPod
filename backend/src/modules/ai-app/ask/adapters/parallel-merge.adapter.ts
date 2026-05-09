/**
 * PARALLEL_MERGE mode adapter
 *
 * 设计：teams-mode.md §5.2 PARALLEL_MERGE 行 + §5.6 Leader Synthesis Spec
 *
 * 行为：
 *   1. 全部 enabled 成员并发各自跑一次 chat（Promise.all + concurrencyLimit）
 *   2. 单个成员失败不阻断其他（catch + 标记错误）
 *   3. 全部完成后由 leader（roomConfig.leaderModelId 或 role=LEADER 成员）合成
 *   4. 输出 N 条成员消息 + 1 条 leader 合成消息（N+1 总条）
 *
 * Billing：
 *   每次 chat 各自 BillingContext referenceId=turnId，消费独立扣费；
 *   并发 BillingContext 嵌套行为已通过 W3 启动前 spike 验证（v3 follow-up 已确认）。
 *
 * 流式：本期 chat() 同步返回完整内容；token-by-token 推送留 v0.3。
 */

import { Injectable, Logger } from "@nestjs/common";
import { v4 as uuid } from "uuid";
import { AIModelType, AskRoomMember, AskRoomMode } from "@prisma/client";
import { ChatFacade, type ChatMessage } from "@/modules/ai-harness/facade";
import {
  emitSystemNotice,
  type IModeAdapter,
  type ModeContext,
  type ModeResult,
  type PendingMessage,
} from "./mode-adapter.interface";
import type { AskRoomServerEvent } from "../gateway/ask-room-events.types";

const PARALLEL_CONCURRENCY = 4;
const SYNTHESIS_DISPLAY_NAME = "Leader Synthesis";

interface MemberResponse {
  member: AskRoomMember;
  messageId: string;
  content: string;
  tokensUsed: number;
  doneSeq: number;
  error?: string;
}

@Injectable()
export class ParallelMergeAdapter implements IModeAdapter {
  readonly mode = AskRoomMode.PARALLEL_MERGE;
  private readonly logger = new Logger(ParallelMergeAdapter.name);

  constructor(private readonly chatFacade: ChatFacade) {}

  async execute(
    ctx: ModeContext,
    onEvent: (e: AskRoomServerEvent) => void,
  ): Promise<ModeResult> {
    const enabled = ctx.members.filter((m) => m.enabled && !m.deletedAt);
    let seq = ctx.sequenceNumStart;
    if (enabled.length === 0) {
      const messages: PendingMessage[] = [];
      seq += 1;
      messages.push(
        emitSystemNotice(
          onEvent,
          ctx.turn.id,
          seq,
          "房间内没有可用的成员。请在右侧成员面板启用至少一名成员后重试。",
        ),
      );
      return {
        messages,
        metadata: { reason: "no_participants" },
      };
    }

    const leader = this.pickLeader(ctx, enabled);

    // 并发 fan-out
    const responses = await this.fanOut(enabled, ctx, onEvent, () => {
      seq += 1;
      return seq;
    });

    const successful = responses.filter((r) => !r.error);

    const messages: PendingMessage[] = responses.map((r) => ({
      id: r.messageId,
      senderType: "AI",
      senderMemberId: r.member.id,
      // 评审 W3 v4 R1 重要：错误消息脱敏，避免 provider 内部 stack/auth token 泄露。
      // rate limit / timeout / credits 等用户可见信息保留；其余统一兜底文案。
      content: r.error ? this.sanitizeErrorMessage(r.error) : r.content,
      modelId: r.member.modelId,
      modelName: null,
      tokens: r.tokensUsed,
      parentMessageId: ctx.triggerMessage.id,
      sequenceNum: r.doneSeq,
    }));

    if (successful.length === 0) {
      this.logger.warn(
        `[PARALLEL_MERGE] turn=${ctx.turn.id} all participants failed`,
      );
      seq += 1;
      messages.push(
        emitSystemNotice(
          onEvent,
          ctx.turn.id,
          seq,
          "所有成员暂时不可用，请稍后重试。可在右侧切换到 FREECHAT 模式由单成员单独回答。",
        ),
      );
      return {
        messages,
        metadata: { participantCount: enabled.length, allFailed: true },
      };
    }

    // Leader 合成
    // 2026-05-08：之前 synthesis 只发 leader.synthesis.started/done（无 content），
    // 而 done 在 store 是 no-op，合成消息只 push 到 messages[] 持久化但永远不
    // 流到前端 UI。修法：与其他 adapter 一致 emit participant.thinking + done
    // 让 synthesis 作为 leader AI 气泡自然渲染；leader.synthesis.* 事件保留
    // 用于未来 banner UI（"合成中..." 提示）。
    const synthesisMessageId = uuid();
    seq += 1;
    onEvent({
      kind: "leader.synthesis.started",
      turnId: ctx.turn.id,
      sequenceNum: seq,
    });
    seq += 1;
    onEvent({
      kind: "participant.thinking",
      turnId: ctx.turn.id,
      sequenceNum: seq,
      memberId: leader.id,
      messageId: synthesisMessageId,
    });

    let synthesis: { content: string; tokensUsed: number } | null = null;
    try {
      synthesis = await this.synthesize(successful, leader, ctx);
    } catch (err) {
      this.logger.error(
        `[PARALLEL_MERGE] leader synthesis failed turn=${ctx.turn.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // 评审 W3 v4 R1 重要：synthesis 失败语义。
    // 当所有/部分成员成功但 synthesis 失败：返回 N 条成员消息 + metadata.synthesisOk=false。
    // turn 仍标 COMPLETED，前端按 metadata.synthesisOk 决定是否展示"合成失败"提示。
    if (synthesis) {
      seq += 1;
      onEvent({
        kind: "participant.done",
        turnId: ctx.turn.id,
        sequenceNum: seq,
        memberId: leader.id,
        messageId: synthesisMessageId,
        tokensUsed: synthesis.tokensUsed,
        content: synthesis.content,
      });
      seq += 1;
      onEvent({
        kind: "leader.synthesis.done",
        turnId: ctx.turn.id,
        sequenceNum: seq,
        messageId: synthesisMessageId,
      });
      messages.push({
        id: synthesisMessageId,
        senderType: "AI",
        senderMemberId: leader.id,
        content: synthesis.content,
        modelId: leader.modelId,
        modelName: null,
        tokens: synthesis.tokensUsed,
        parentMessageId: ctx.triggerMessage.id,
        sequenceNum: seq,
      });
    } else {
      // synthesis 失败：emit done 占位避免 thinking 气泡悬挂；同时 push 到
      // messages[] 持久化，让 reload 后用户仍能看到失败提示（之前只 emit
      // 不 push 导致双源不一致）。
      const failContent =
        "[error] 综合答复生成失败，可基于上方各成员独立回答参考";
      seq += 1;
      onEvent({
        kind: "participant.done",
        turnId: ctx.turn.id,
        sequenceNum: seq,
        memberId: leader.id,
        messageId: synthesisMessageId,
        tokensUsed: 0,
        content: failContent,
      });
      messages.push({
        id: synthesisMessageId,
        senderType: "AI",
        senderMemberId: leader.id,
        content: failContent,
        modelId: leader.modelId,
        modelName: null,
        tokens: 0,
        parentMessageId: ctx.triggerMessage.id,
        sequenceNum: seq,
      });
    }

    return {
      messages,
      metadata: {
        participantCount: enabled.length,
        successCount: successful.length,
        synthesizedBy: leader.id,
        synthesisOk: synthesis !== null,
      },
    };
  }

  // ============ 内部 ============

  private pickLeader(
    ctx: ModeContext,
    enabled: AskRoomMember[],
  ): AskRoomMember {
    const cfg = (ctx.session.roomConfig ?? {}) as Record<string, unknown>;
    if (typeof cfg.leaderModelId === "string") {
      const byModel = enabled.find((m) => m.modelId === cfg.leaderModelId);
      if (byModel) return byModel;
    }
    return (
      enabled.find((m) => m.role === "LEADER") ??
      [...enabled].sort((a, b) => a.order - b.order)[0]
    );
  }

  private async fanOut(
    members: AskRoomMember[],
    ctx: ModeContext,
    onEvent: (e: AskRoomServerEvent) => void,
    nextSeq: () => number,
  ): Promise<MemberResponse[]> {
    const responses: MemberResponse[] = [];
    const queue = [...members];

    const worker = async (): Promise<void> => {
      while (queue.length > 0) {
        const member = queue.shift();
        if (!member) return;
        this.assertNotAborted(ctx.signal);
        const messageId = uuid();
        onEvent({
          kind: "participant.thinking",
          turnId: ctx.turn.id,
          sequenceNum: nextSeq(),
          memberId: member.id,
          messageId,
        });
        try {
          const result = await this.chatFacade.chat({
            messages: this.buildLlmMessages(ctx, member),
            model: member.modelId,
            modelType: AIModelType.CHAT,
            taskProfile: { creativity: "medium", outputLength: "standard" },
            billing: {
              userId: ctx.userId,
              moduleType: "ai-ask",
              operationType: "room-parallel-merge",
              referenceId: ctx.turn.id,
              description: `AI Ask Room PARALLEL_MERGE - ${member.displayName}`,
            },
          });
          const doneSeq = nextSeq();
          onEvent({
            kind: "participant.done",
            turnId: ctx.turn.id,
            sequenceNum: doneSeq,
            memberId: member.id,
            messageId,
            tokensUsed: result.tokensUsed ?? 0,
            content: result.content,
          });
          responses.push({
            member,
            messageId,
            content: result.content,
            tokensUsed: result.tokensUsed ?? 0,
            doneSeq,
          });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            `[PARALLEL_MERGE] member=${member.displayName} failed: ${errMsg}`,
          );
          // 2026-05-08 R2 评审：失败时 content 不再留空（之前前端气泡空白
          // 让用户以为成员"什么都没说"，与持久化的 sanitizeErrorMessage 双源
          // 不一致）。改为 emit 与持久化相同的脱敏错误占位。
          const sanitized = this.sanitizeErrorMessage(errMsg);
          const doneSeq = nextSeq();
          onEvent({
            kind: "participant.done",
            turnId: ctx.turn.id,
            sequenceNum: doneSeq,
            memberId: member.id,
            messageId,
            tokensUsed: 0,
            content: sanitized,
          });
          responses.push({
            member,
            messageId,
            content: "",
            tokensUsed: 0,
            doneSeq,
            error: errMsg,
          });
        }
      }
    };

    const workerCount = Math.min(PARALLEL_CONCURRENCY, members.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    // 保持成员原顺序
    responses.sort(
      (a, b) =>
        members.findIndex((m) => m.id === a.member.id) -
        members.findIndex((m) => m.id === b.member.id),
    );
    return responses;
  }

  private async synthesize(
    successful: MemberResponse[],
    leader: AskRoomMember,
    ctx: ModeContext,
  ): Promise<{ content: string; tokensUsed: number }> {
    const synthesisName =
      leader.role === "LEADER" ? leader.displayName : SYNTHESIS_DISPLAY_NAME;

    const userBlocks = successful
      .map((r) => {
        const safeName = r.member.displayName
          .replace(/[\[\]\r\n]/g, "")
          .slice(0, 40);
        return `[${safeName}] 的回答：\n${r.content}`;
      })
      .join("\n\n");

    const systemPrompt = [
      `你是 ${synthesisName}，正在主持一场多 AI 协作。本轮模式：PARALLEL_MERGE。`,
      "任务：基于下方 N 位成员的回答，输出一份综合答复。",
      "",
      "约束（不可违反）：",
      "1. 不得改变成员陈述的客观事实；如成员说法冲突，列出分歧并标注来源成员。",
      "2. 不得引入成员未提及的新事实。",
      "3. 强调「综合多视角」，列出共识与分歧。",
      "4. 输出语言匹配用户问题。",
      "",
      `用户问题：${ctx.triggerMessage.content}`,
    ].join("\n");

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userBlocks },
    ];

    const result = await this.chatFacade.chat({
      messages,
      model: leader.modelId,
      modelType: AIModelType.CHAT,
      taskProfile: { creativity: "medium", outputLength: "long" },
      billing: {
        userId: ctx.userId,
        moduleType: "ai-ask",
        operationType: "room-parallel-merge-synthesis",
        referenceId: ctx.turn.id,
        description: `AI Ask Room PARALLEL_MERGE synthesis - ${synthesisName}`,
      },
    });

    return {
      content: result.content,
      tokensUsed: result.tokensUsed ?? 0,
    };
  }

  private buildLlmMessages(
    ctx: ModeContext,
    member: AskRoomMember,
  ): ChatMessage[] {
    const systemParts: string[] = [];
    if (member.systemPrompt) {
      systemParts.push(member.systemPrompt);
    } else {
      systemParts.push(
        `你是 ${member.displayName}，与其他 AI 一起协助用户。请仅以 ${member.displayName} 的身份回答。`,
      );
    }
    // 2026-05-09（screenshot 43）：反 prompt 污染——同 freechat。
    // 用户消息中常含 @xx 提及，模型容易模仿 IM 群聊格式输出
    // "[<名字>]:" / "@xx:" / 多人对话等。强制要求只输出本次回答内容。
    systemParts.push(
      "请直接给出回答内容，不要在回答前加 `[<名字>]`、`<名字>:`、`@<名字>` 或类似的自报家门前缀；不要在回答中模拟多人对话或扮演其他成员。",
    );
    if (member.persona && typeof member.persona === "object") {
      systemParts.push(`【人设要点】\n${JSON.stringify(member.persona)}`);
    }
    return [
      { role: "system", content: systemParts.join("\n\n") },
      { role: "user", content: ctx.triggerMessage.content },
    ];
  }

  private assertNotAborted(signal: AbortSignal): void {
    if (signal.aborted) {
      throw new Error("PARALLEL_MERGE adapter aborted");
    }
  }

  /**
   * 评审 W3 v4 R1 重要：错误消息脱敏。
   * 白名单常见用户可见错误（rate limit / timeout / credits / quota），
   * 其余统一兜底"AI 服务暂时不可用"，避免 provider 内部 stack / auth 信息进入 DB / UI。
   */
  private sanitizeErrorMessage(raw: string): string {
    const safePatterns = [
      /rate limit/i,
      /timeout/i,
      /credits?/i,
      /quota/i,
      /content.*moderat/i,
      /context length/i,
    ];
    if (safePatterns.some((re) => re.test(raw))) {
      return `[error] ${raw.slice(0, 200)}`;
    }
    return "[error] AI 服务暂时不可用，请稍后重试";
  }
}
