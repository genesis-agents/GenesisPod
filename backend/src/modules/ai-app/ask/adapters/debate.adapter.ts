/**
 * DEBATE mode adapter
 *
 * 设计：teams-mode.md §5.2 DEBATE 行
 *
 * 行为：
 *   1. 选 RED / BLUE / 可选 JUDGE 三个成员（按 order / role 启发式）
 *   2. 把 AskRoomMember 投影成 IDebateAgent（chat 通过 ChatFacade 实现）
 *   3. 调用 harness DebatePattern.runDebate（多轮 RED → BLUE）
 *   4. 把 RoundResult 序列翻译成 PendingMessage + emit 流式事件
 *
 * 注意：本 adapter 是 W1 PR2 DebatePattern 的第一个真实消费方，
 * pattern 接口本身已通过 16/16 单测；adapter 只做投影和事件桥接。
 *
 * 流式：每回合调用 chat() 一次性返回内容；token streaming 留 v0.3。
 */

import { Injectable, Logger } from "@nestjs/common";
import { v4 as uuid } from "uuid";
import { AIModelType, AskRoomMember, AskRoomMode } from "@prisma/client";
import {
  ChatFacade,
  DebatePattern,
  type ChatMessage,
  type DebateRole,
  type DebateRoundResult,
  type IDebateAgent,
} from "@/modules/ai-harness/facade";
import type {
  IModeAdapter,
  ModeContext,
  ModeResult,
  PendingMessage,
} from "./mode-adapter.interface";
import type { AskRoomServerEvent } from "../gateway/ask-room-events.types";

const DEFAULT_DEBATE_ROUNDS = 3;

/**
 * 显式 abort 错误。runtime 通过 instanceof 区分 CANCELLED / FAILED。
 * 评审 W3 v4 R2 重要：避免与 chat 抛错混淆。
 */
export class DebateAbortError extends Error {
  constructor(reason = "DEBATE adapter aborted") {
    super(reason);
    this.name = "DebateAbortError";
  }
}

@Injectable()
export class DebateAdapter implements IModeAdapter {
  readonly mode = AskRoomMode.DEBATE;
  private readonly logger = new Logger(DebateAdapter.name);

  constructor(
    private readonly chatFacade: ChatFacade,
    private readonly debatePattern: DebatePattern,
  ) {}

  async execute(
    ctx: ModeContext,
    onEvent: (e: AskRoomServerEvent) => void,
  ): Promise<ModeResult> {
    const enabled = ctx.members.filter((m) => m.enabled && !m.deletedAt);
    const roles = this.assignRoles(enabled);
    if (!roles) {
      this.logger.warn(
        `[DEBATE] turn=${ctx.turn.id} not enough members for RED+BLUE`,
      );
      return { messages: [], metadata: { reason: "insufficient_members" } };
    }
    const { red, blue, judge } = roles;

    const cfg = (ctx.session.roomConfig ?? {}) as Record<string, unknown>;
    const maxRounds =
      typeof cfg.debateRounds === "number"
        ? cfg.debateRounds
        : DEFAULT_DEBATE_ROUNDS;
    const enableJudge = judge !== null;

    let seq = ctx.sequenceNumStart;
    const eventByRound = new Map<number, void>();

    const emitRoundStart = (round: number): void => {
      if (eventByRound.has(round)) return;
      eventByRound.set(round, undefined);
      seq += 1;
      onEvent({
        kind: "round.start",
        turnId: ctx.turn.id,
        sequenceNum: seq,
        round,
      });
    };

    const memberById = new Map(ctx.members.map((m) => [m.id, m]));
    const messageIdByRoundAndMember = new Map<string, string>();

    const buildAgent = (
      member: AskRoomMember,
      role: DebateRole,
    ): IDebateAgent => {
      const stance =
        role === "RED" ? "正方" : role === "BLUE" ? "反方" : "裁判";
      return {
        id: member.id,
        displayName: member.displayName,
        role,
        stance,
        metadata: {
          modelId: member.modelId,
          turnId: ctx.turn.id,
          sessionId: ctx.session.id,
        },
        chat: async ({ systemPrompt, history, userMessage }) => {
          if (ctx.signal.aborted) {
            throw new DebateAbortError();
          }
          // 评审 W3 v4 R2 阻塞：round 推断协议依赖 DebatePattern 实现细节。
          // 协议（W1 PR2 debate-pattern.ts:125-128, 152-156）：
          //   - 每回合 RED/BLUE 各自 history.push 2 entries（user prompt + assistant reply）
          //   - JUDGE 在 maxRounds 之后执行，自身 history 为空（独立 IDebateAgent），
          //     通过 history.length=0 但 results 已含 RED/BLUE 全部回合识别
          //   - 因此 history.length / 2 + 1 是当前 agent 自身的下一回合编号
          // 若 pattern 协议变更（如改 history 维护策略），此处会无声破坏。
          // 长期方案：让 pattern 显式向 chat 入参传 round（W1 follow-up F2 已登记）
          const round =
            role === "JUDGE"
              ? maxRounds + 1 // pattern 内 JUDGE.round=maxRounds+1（行 197）
              : Math.floor(history.length / 2) + 1;
          if (role !== "JUDGE") {
            emitRoundStart(round);
          }

          const messageId = uuid();
          messageIdByRoundAndMember.set(`${round}:${member.id}`, messageId);
          seq += 1;
          onEvent({
            kind: "participant.thinking",
            turnId: ctx.turn.id,
            sequenceNum: seq,
            memberId: member.id,
            messageId,
          });

          const llmMessages: ChatMessage[] = [
            { role: "system", content: systemPrompt },
            ...history,
            { role: "user", content: userMessage },
          ];
          const result = await this.chatFacade.chat({
            messages: llmMessages,
            model: member.modelId,
            modelType: AIModelType.CHAT,
            taskProfile: { creativity: "medium", outputLength: "standard" },
            billing: {
              userId: ctx.userId,
              moduleType: "ai-ask",
              operationType: "room-debate",
              referenceId: ctx.turn.id,
              description: `AI Ask Room DEBATE - ${member.displayName} (${role})`,
            },
          });

          seq += 1;
          onEvent({
            kind: "participant.done",
            turnId: ctx.turn.id,
            sequenceNum: seq,
            memberId: member.id,
            messageId,
            tokensUsed: result.tokensUsed ?? 0,
          });
          return { content: result.content, tokensUsed: result.tokensUsed };
        },
      };
    };

    const agents: IDebateAgent[] = [
      buildAgent(red, "RED"),
      buildAgent(blue, "BLUE"),
    ];
    if (enableJudge && judge) {
      agents.push(buildAgent(judge, "JUDGE"));
    }

    let results: DebateRoundResult[];
    try {
      results = await this.debatePattern.runDebate({
        topic: ctx.triggerMessage.content,
        agents,
        config: {
          maxRounds,
          enableJudge,
          signal: ctx.signal,
        },
      });
    } catch (err) {
      this.logger.error(
        `[DEBATE] runDebate failed turn=${ctx.turn.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }

    // round.end 事件（每个 round RED+BLUE 完成后发一次）
    const roundsCovered = new Set(
      results.filter((r) => r.role !== "JUDGE").map((r) => r.round),
    );
    for (const r of [...roundsCovered].sort((a, b) => a - b)) {
      seq += 1;
      onEvent({
        kind: "round.end",
        turnId: ctx.turn.id,
        sequenceNum: seq,
        round: r,
      });
    }

    const messages: PendingMessage[] = results.map((r) => {
      const member = memberById.get(r.speakerId);
      const lookupKey = `${r.round}:${r.speakerId}`;
      const messageId = messageIdByRoundAndMember.get(lookupKey) ?? uuid();
      seq += 1;
      return {
        id: messageId,
        senderType: "AI",
        senderMemberId: member?.id ?? null,
        content: r.content,
        modelId: member?.modelId ?? null,
        modelName: null,
        tokens: r.tokensUsed ?? 0,
        parentMessageId: ctx.triggerMessage.id,
        sequenceNum: seq,
      };
    });

    return {
      messages,
      metadata: {
        rounds: maxRounds,
        enableJudge,
        red: red.id,
        blue: blue.id,
        judge: judge?.id ?? null,
        speeches: results.length,
      },
    };
  }

  // ============ 内部 ============

  private assignRoles(members: AskRoomMember[]): {
    red: AskRoomMember;
    blue: AskRoomMember;
    judge: AskRoomMember | null;
  } | null {
    if (members.length < 2) return null;
    // 评审 W3 v4 R2 次要：order 相等 tiebreaker by id 保证确定性。
    const sorted = [...members].sort(
      (a, b) => a.order - b.order || a.id.localeCompare(b.id),
    );
    const leader = sorted.find((m) => m.role === "LEADER");
    const nonLeader = sorted.filter((m) => m.id !== leader?.id);

    let red: AskRoomMember | undefined;
    let blue: AskRoomMember | undefined;
    let judge: AskRoomMember | null = null;

    if (members.length >= 3) {
      red = nonLeader[0];
      blue = nonLeader[1];
      judge = leader ?? nonLeader[2] ?? null;
      // 评审 W3 v4 R2 阻塞：4+ 成员时 nonLeader[3..] 被丢弃，加 warn 提示用户。
      const excluded = members.length - (judge ? 3 : 2);
      if (excluded > 0) {
        this.logger.warn(
          `[DEBATE] room has ${members.length} members; ${excluded} excluded ` +
            `(only RED/BLUE${judge ? "/JUDGE" : ""} participate). ` +
            `Consider PARALLEL_MERGE for full participation.`,
        );
      }
    } else {
      red = sorted[0];
      blue = sorted[1];
    }

    if (!red || !blue) return null;
    return { red, blue, judge };
  }
}
