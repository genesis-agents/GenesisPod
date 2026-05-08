'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users, ArrowLeft } from 'lucide-react';
import { askRoomService } from '@/services/ai-ask-room.service';
import { useAskRoomSocket } from '@/hooks/domain/useAskRoomSocket';
import { useAskRoomStore } from '@/stores/ask-room.store';
import { logger } from '@/lib/utils/logger';
import type {
  AskRoomMember,
  AskRoomMode,
  AskRoomServerEvent,
} from '@/types/ask-room';
import { RoomComposer } from './RoomComposer';
import { RoomMessageList } from './RoomMessageList';
import { RoomMemberPanel } from './RoomMemberPanel';

interface RoomChatPageProps {
  roomId: string;
}

export function RoomChatPage({ roomId }: RoomChatPageProps) {
  const router = useRouter();
  const session = useAskRoomStore((s) => s.sessionId);
  const members = useAskRoomStore((s) => s.members);
  const messages = useAskRoomStore((s) => s.messages);
  const currentTurnId = useAskRoomStore((s) => s.currentTurnId);
  const currentTurnStatus = useAskRoomStore((s) => s.currentTurnStatus);
  const setRoom = useAskRoomStore((s) => s.setRoom);
  const setMembers = useAskRoomStore((s) => s.setMembers);
  const appendUserMessage = useAskRoomStore((s) => s.appendUserMessage);
  const reset = useAskRoomStore((s) => s.reset);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [memberPanelOpen, setMemberPanelOpen] = useState(false);
  const [defaultMode, setDefaultMode] = useState<AskRoomMode>('FREECHAT');

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const detail = await askRoomService.getRoom(roomId);
      const cfg = detail.session.roomConfig;
      if (typeof cfg.defaultMode === 'string') {
        setDefaultMode(cfg.defaultMode as AskRoomMode);
      }
      // 详情 API 不返回 messages；W6 follow-up 补 GET /sessions/:id/messages
      // 当前只用 setRoom 的 messages 字段（后端尚未返回）；初始化为空
      setRoom({
        sessionId: detail.session.id,
        members: detail.members,
        messages: [],
        recentTurns: detail.recentTurns,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [roomId, setRoom]);

  useEffect(() => {
    void reload();
    return () => reset();
  }, [reload, reset]);

  const onEvent = useCallback(
    (event: AskRoomServerEvent) => {
      if (event.kind === 'turn.complete' || event.kind === 'turn.error') {
        // 评审 W6 重要 #5/#10：turn 结束 reload 拉最新 members + recentTurns。
        // messages 由 store.applyEvent 持续累积（participant.done 已转 final）。
        // follow-up F12：后端补 GET /rooms/:id/messages 后改拉真实落库内容覆盖
        logger.debug('[RoomChat] turn ended', event);
        void reload();
      }
    },
    [reload]
  );

  const socket = useAskRoomSocket({
    sessionId: session ?? roomId,
    enabled: !!session,
    onEvent,
    onJoinError: (reason) => setError(`Socket join 失败: ${reason}`),
  });

  const handleSend = async (input: {
    content: string;
    mode: AskRoomMode;
    mentionedMemberIds: string[];
  }) => {
    setError(null);
    // 乐观追加 user 消息（实际值由 backend 决定 sequenceNum，简化为 lastSeq+1）
    const lastSeq = useAskRoomStore.getState().lastSeq;
    appendUserMessage({
      id: `local-${Date.now()}`,
      sessionId: session ?? roomId,
      role: 'user',
      content: input.content,
      modelId: null,
      modelName: null,
      tokens: null,
      webSearch: false,
      senderType: 'USER',
      senderMemberId: null,
      mentionedMemberIds: input.mentionedMemberIds,
      turnId: null,
      parentMessageId: null,
      sequenceNum: lastSeq + 1,
      createdAt: new Date().toISOString(),
    });
    try {
      await askRoomService.sendMessage(roomId, {
        content: input.content,
        mode: input.mode,
        mentionedMemberIds: input.mentionedMemberIds,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleCancel = async () => {
    if (!currentTurnId) return;
    socket.cancelTurn(currentTurnId);
    try {
      await askRoomService.cancelTurn(roomId, currentTurnId);
    } catch (e) {
      logger.warn(`cancel turn failed: ${(e as Error).message}`);
    }
  };

  const handleAddMember = async (
    input: Parameters<typeof askRoomService.addMember>[1]
  ) => {
    const created = await askRoomService.addMember(roomId, input);
    setMembers([...members, created]);
  };

  const handleRemoveMember = async (memberId: string) => {
    await askRoomService.removeMember(roomId, memberId);
    setMembers(
      members.map((m) =>
        m.id === memberId ? { ...m, deletedAt: new Date().toISOString() } : m
      )
    );
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-500">
        加载中…
      </div>
    );
  }

  const isStreaming = currentTurnStatus === 'RUNNING';

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2 dark:border-gray-700 dark:bg-gray-900">
        <button
          type="button"
          onClick={() => router.push('/ai-ask')}
          className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
        >
          <ArrowLeft size={16} />
          返回
        </button>
        <div className="text-sm font-medium">AI 房间</div>
        <button
          type="button"
          onClick={() => setMemberPanelOpen(true)}
          className="flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-sm hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-800"
        >
          <Users size={14} />
          成员（{members.filter((m: AskRoomMember) => !m.deletedAt).length}）
        </button>
      </div>

      {error && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}

      <RoomMessageList messages={messages} members={members} />

      <RoomComposer
        members={members}
        defaultMode={defaultMode}
        disabled={loading}
        isStreaming={isStreaming}
        onSend={handleSend}
        onCancel={handleCancel}
      />

      {memberPanelOpen && (
        <RoomMemberPanel
          members={members}
          onAdd={handleAddMember}
          onRemove={handleRemoveMember}
          onClose={() => setMemberPanelOpen(false)}
        />
      )}
    </div>
  );
}
