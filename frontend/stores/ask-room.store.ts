/**
 * AI Ask Room - Zustand store
 *
 * 维护：
 *   - 当前 room 的 messages 累积（按 sequenceNum 排序）
 *   - per-member 当前流式状态（thinking / partial / done）
 *   - 当前 turn id + status
 *
 * 设计：sequenceNum 排序而非 createdAt（评审 v3 §8.0 决策）
 */

import { create } from 'zustand';
import type {
  AskRoomMember,
  AskRoomMessage,
  AskRoomServerEvent,
  AskRoomTurn,
  AskTurnStatus,
} from '@/types/ask-room';

interface PendingMessage {
  id: string;
  memberId: string;
  status: 'thinking' | 'streaming' | 'done';
  partialText: string;
  sequenceNum: number;
}

interface RoomState {
  sessionId: string | null;
  members: AskRoomMember[];
  messages: AskRoomMessage[];
  /** 流式中的 AI 消息（done 后由 messages 接管） */
  pending: Record<string, PendingMessage>;
  currentTurnId: string | null;
  currentTurnStatus: AskTurnStatus | null;
  /** turn 内最新的 sequenceNum（防乱序） */
  lastSeq: number;
}

interface RoomActions {
  setRoom: (input: {
    sessionId: string;
    members: AskRoomMember[];
    messages: AskRoomMessage[];
    recentTurns: AskRoomTurn[];
  }) => void;
  setMembers: (members: AskRoomMember[]) => void;
  appendUserMessage: (msg: AskRoomMessage) => void;
  applyEvent: (event: AskRoomServerEvent) => void;
  reset: () => void;
}

const initial: RoomState = {
  sessionId: null,
  members: [],
  messages: [],
  pending: {},
  currentTurnId: null,
  currentTurnStatus: null,
  lastSeq: 0,
};

export const useAskRoomStore = create<RoomState & RoomActions>((set) => ({
  ...initial,

  setRoom({ sessionId, members, messages, recentTurns }) {
    const lastTurn = recentTurns[0];
    set({
      sessionId,
      members,
      messages,
      pending: {},
      currentTurnId: lastTurn?.status === 'RUNNING' ? lastTurn.id : null,
      currentTurnStatus: lastTurn?.status ?? null,
      lastSeq:
        messages.reduce(
          (max, m) =>
            m.sequenceNum && m.sequenceNum > max ? m.sequenceNum : max,
          0
        ) ?? 0,
    });
  },

  setMembers(members) {
    set({ members });
  },

  appendUserMessage(msg) {
    set((s) => ({
      messages: [...s.messages, msg],
      lastSeq: msg.sequenceNum ?? s.lastSeq,
    }));
  },

  applyEvent(event) {
    set((s) => {
      // 评审 W6 重要 #4：所有事件严格单调；stale 直接丢弃。
      // 后端保证 turn.started seq 严格大于 user message seq。
      if (event.sequenceNum <= s.lastSeq) {
        return s;
      }

      const next: Partial<RoomState> = {
        lastSeq: event.sequenceNum,
      };

      switch (event.kind) {
        case 'turn.started':
          next.currentTurnId = event.turnId;
          next.currentTurnStatus = 'RUNNING';
          next.pending = {};
          break;

        case 'participant.thinking':
          next.pending = {
            ...s.pending,
            [event.messageId]: {
              id: event.messageId,
              memberId: event.memberId,
              status: 'thinking',
              partialText: '',
              sequenceNum: event.sequenceNum,
            },
          };
          break;

        case 'participant.partial': {
          const existing = s.pending[event.messageId] ?? {
            id: event.messageId,
            memberId: event.memberId,
            status: 'streaming' as const,
            partialText: '',
            sequenceNum: event.sequenceNum,
          };
          next.pending = {
            ...s.pending,
            [event.messageId]: {
              ...existing,
              status: 'streaming',
              partialText: existing.partialText + event.deltaText,
            },
          };
          break;
        }

        case 'participant.done': {
          // done 时 pending → final message。content 优先用 event.content（同步
          // adapter 直接推送的完整内容），否则回退到累积的 partialText（流式 adapter）。
          // 2026-05-08：之前永远用空 partialText 导致同步 adapter 气泡空白。
          const existing = s.pending[event.messageId];
          if (existing) {
            const { [event.messageId]: _drop, ...rest } = s.pending;
            void _drop;
            next.pending = rest;
            const finalMsg = {
              id: event.messageId,
              sessionId: s.sessionId ?? '',
              role: 'assistant',
              content: event.content ?? existing.partialText,
              modelId: null,
              modelName: null,
              tokens: event.tokensUsed,
              webSearch: false,
              senderType: 'AI' as const,
              senderMemberId: existing.memberId,
              mentionedMemberIds: [],
              turnId: event.turnId,
              parentMessageId: null,
              sequenceNum: event.sequenceNum,
              createdAt: new Date().toISOString(),
            };
            next.messages = [...s.messages, finalMsg];
          }
          break;
        }

        case 'leader.synthesis.started':
        case 'leader.synthesis.done':
        case 'round.start':
        case 'round.end':
        case 'vote.open':
        case 'vote.cast':
        case 'vote.closed':
        case 'handoff.request':
        case 'handoff.accepted':
        case 'handoff.rejected':
          // 当前 store 不专门追踪这些事件；UI 可订阅 onEvent 自行展示
          break;

        case 'system.notice': {
          // 2026-05-08：SYSTEM 提示（边界场景 / 错误兜底）。adapter 已同步
          // push 到 messages[] 持久化；这里作为 SYSTEM 消息进 store 即时显示。
          const finalMsg = {
            id: event.messageId,
            sessionId: s.sessionId ?? '',
            role: 'system',
            content: event.content,
            modelId: null,
            modelName: null,
            tokens: 0,
            webSearch: false,
            senderType: 'SYSTEM' as const,
            senderMemberId: null,
            mentionedMemberIds: [],
            turnId: event.turnId,
            parentMessageId: null,
            sequenceNum: event.sequenceNum,
            createdAt: new Date().toISOString(),
          };
          next.messages = [...s.messages, finalMsg];
          break;
        }

        case 'turn.complete':
          next.currentTurnStatus = event.status;
          break;

        case 'turn.error':
          next.currentTurnStatus = 'FAILED';
          break;

        default: {
          const _exhaustive: never = event;
          return _exhaustive;
        }
      }
      return next;
    });
  },

  reset() {
    set(initial);
  },
}));
