/**
 * Mode Adapter 抽象接口
 *
 * 设计：teams-mode.md §5（mode → harness pattern 适配）
 *
 * 各 mode（FREECHAT / PARALLEL_MERGE / DEBATE / VOTE / REVIEW / HANDOFF）
 * 实现该接口，把 Ask 的 turn 翻译成对应 harness pattern 调用。
 */

import type {
  AskMessage,
  AskRoomMember,
  AskRoomMode,
  AskRoomTurn,
  AskSession,
} from "@prisma/client";
import type { AskRoomServerEvent } from "../gateway/ask-room-events.types";

export interface ModeContext {
  session: AskSession;
  members: AskRoomMember[];
  triggerMessage: AskMessage;
  history: AskMessage[];
  turn: AskRoomTurn;
  /** 用户在 send 时显式指定的 mode-specific options */
  modeOptions?: Record<string, unknown>;
  /** 用户 id（用于 billing referenceId） */
  userId: string;
  /** turn 维度的 sequenceNum 起点（gateway 从这里开始往上递增） */
  sequenceNumStart: number;
  signal: AbortSignal;
}

export interface PendingMessage {
  /** 在 adapter 入口生成的 messageId（亦贯穿 thinking / partial / done 事件） */
  id: string;
  senderType: "AI" | "SYSTEM";
  senderMemberId: string | null;
  content: string;
  modelId: string | null;
  modelName: string | null;
  tokens: number;
  parentMessageId?: string | null;
  /**
   * 该消息落库时使用的 sequenceNum（房间维度单调递增）。
   * 与 participant.done 事件的 sequenceNum 一致，不与 thinking 事件相同。
   * 评审 W2 v3 R2：明确语义，避免 W3 adapter（PARALLEL_MERGE / DEBATE）误用。
   */
  sequenceNum: number;
}

export interface ModeResult {
  messages: PendingMessage[];
  metadata: Record<string, unknown>;
}

export interface IModeAdapter {
  readonly mode: AskRoomMode;
  execute(
    ctx: ModeContext,
    onEvent: (e: AskRoomServerEvent) => void,
  ): Promise<ModeResult>;
}
