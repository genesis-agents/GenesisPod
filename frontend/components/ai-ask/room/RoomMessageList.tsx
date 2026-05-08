'use client';

import { useMemo } from 'react';
import { Bot, User, Info } from 'lucide-react';
import type { AskRoomMember, AskRoomMessage } from '@/types/ask-room';
import { useAskRoomStore } from '@/stores/ask-room.store';

interface RoomMessageListProps {
  messages: AskRoomMessage[];
  members: AskRoomMember[];
}

export function RoomMessageList({ messages, members }: RoomMessageListProps) {
  const pending = useAskRoomStore((s) => s.pending);
  const memberById = useMemo(
    () => new Map(members.map((m) => [m.id, m])),
    [members]
  );

  // 已落库消息 + 流式 pending（不在 messages 中的）
  const merged = useMemo(() => {
    const items: Array<{
      key: string;
      sequenceNum: number;
      kind: 'message' | 'pending';
      message?: AskRoomMessage;
      pending?: (typeof pending)[string];
    }> = [];
    const messageIds = new Set(messages.map((m) => m.id));
    for (const m of messages) {
      items.push({
        key: m.id,
        sequenceNum: m.sequenceNum ?? 0,
        kind: 'message',
        message: m,
      });
    }
    for (const p of Object.values(pending)) {
      if (messageIds.has(p.id)) continue;
      items.push({
        key: p.id,
        sequenceNum: p.sequenceNum,
        kind: 'pending',
        pending: p,
      });
    }
    return items.sort((a, b) => a.sequenceNum - b.sequenceNum);
  }, [messages, pending]);

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 px-4 py-3 dark:bg-gray-950">
      <div className="mx-auto flex max-w-3xl flex-col gap-3">
        {merged.length === 0 && (
          <div className="text-center text-sm text-gray-400">
            还没有消息，发个开场白吧
          </div>
        )}
        {merged.map((item) => {
          if (item.kind === 'message' && item.message) {
            return (
              <MessageBubble
                key={item.key}
                message={item.message}
                member={
                  item.message.senderMemberId
                    ? memberById.get(item.message.senderMemberId)
                    : undefined
                }
              />
            );
          }
          if (item.kind === 'pending' && item.pending) {
            return (
              <PendingBubble
                key={item.key}
                memberId={item.pending.memberId}
                member={memberById.get(item.pending.memberId)}
                status={item.pending.status}
                partialText={item.pending.partialText}
              />
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}

interface MessageBubbleProps {
  message: AskRoomMessage;
  member?: AskRoomMember;
}

function MessageBubble({ message, member }: MessageBubbleProps) {
  if (message.senderType === 'USER') {
    return (
      <div className="flex justify-end">
        <div className="flex max-w-[80%] items-start gap-2">
          <div className="whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-blue-500 px-3 py-2 text-sm text-white">
            {message.content}
          </div>
          <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30">
            <User size={14} />
          </div>
        </div>
      </div>
    );
  }
  if (message.senderType === 'SYSTEM') {
    return (
      <div className="flex justify-center">
        <div className="flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400">
          <Info size={12} />
          {message.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div className="flex max-w-[80%] items-start gap-2">
        <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30">
          <Bot size={14} />
        </div>
        <div className="rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-sm shadow-sm dark:bg-gray-800">
          <div className="mb-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
            {member?.displayName ?? 'AI'}
          </div>
          <div className="whitespace-pre-wrap text-gray-800 dark:text-gray-100">
            {message.content}
          </div>
        </div>
      </div>
    </div>
  );
}

interface PendingBubbleProps {
  memberId: string;
  member?: AskRoomMember;
  status: 'thinking' | 'streaming' | 'done';
  partialText: string;
}

function PendingBubble({ member, status, partialText }: PendingBubbleProps) {
  return (
    <div className="flex justify-start">
      <div className="flex max-w-[80%] items-start gap-2">
        <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30">
          <Bot size={14} />
        </div>
        <div className="rounded-2xl rounded-tl-sm bg-white/70 px-3 py-2 text-sm shadow-sm dark:bg-gray-800/70">
          <div className="mb-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
            {member?.displayName ?? 'AI'}
            {status === 'thinking' && <span className="ml-1">思考中…</span>}
            {status === 'streaming' && <span className="ml-1">回复中…</span>}
          </div>
          {partialText && (
            <div className="whitespace-pre-wrap text-gray-800 dark:text-gray-100">
              {partialText}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
