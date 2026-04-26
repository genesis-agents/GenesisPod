'use client';

/**
 * LeaderChatModal — Agent Playground 的 Leader 对话入口
 *
 * 自 2026-04-25 起改为基于平台 `LeaderChatDock` 实现，
 * 本文件只负责拉取历史 + 调用发送 API + 接到 dock。
 */

import { useEffect, useState } from 'react';
import {
  listLeaderChat,
  sendLeaderChat,
  type LeaderChatMessage as ApiLeaderChatMessage,
} from '@/lib/api/agent-playground';
import {
  LeaderChatDock,
  type LeaderChatMessage,
} from '@/components/common/leader-chat';

interface Props {
  missionId: string;
  topic?: string;
  open: boolean;
  onClose: () => void;
}

function toMessage(msg: ApiLeaderChatMessage): LeaderChatMessage {
  return {
    id: msg.id,
    role: msg.role,
    content: msg.content,
    tokensUsed: msg.tokensUsed,
    createdAt: msg.createdAt,
  };
}

export function LeaderChatModal({ missionId, topic, open, onClose }: Props) {
  const [messages, setMessages] = useState<LeaderChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // 加载历史
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    listLeaderChat(missionId)
      .then((msgs) => {
        if (!cancelled) {
          setMessages(msgs.map(toMessage));
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, missionId]);

  const handleSend = async (text: string) => {
    setSending(true);
    setError(null);

    // 乐观插入：用户消息 + thinking 占位
    const tempUserId = `tmp-user-${Date.now()}`;
    const tempThinkingId = `tmp-thinking-${Date.now()}`;
    const now = new Date().toISOString();
    setMessages((prev) => [
      ...prev,
      {
        id: tempUserId,
        role: 'user',
        content: text,
        tokensUsed: null,
        createdAt: now,
      },
      {
        id: tempThinkingId,
        role: 'assistant',
        content: '__THINKING__',
        tokensUsed: null,
        createdAt: now,
      },
    ]);

    try {
      const { user, assistant } = await sendLeaderChat(missionId, text);
      setMessages((prev) =>
        prev
          .filter((m) => m.id !== tempUserId && m.id !== tempThinkingId)
          .concat(toMessage(user), toMessage(assistant))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setMessages((prev) => prev.filter((m) => m.id !== tempThinkingId));
    } finally {
      setSending(false);
    }
  };

  return (
    <LeaderChatDock
      open={open}
      onClose={onClose}
      messages={messages}
      loading={loading}
      error={error}
      sending={sending}
      onSend={handleSend}
      title="与 Leader 对话"
      subtitle={topic ?? 'Research mission'}
      accentColor="violet"
    />
  );
}
