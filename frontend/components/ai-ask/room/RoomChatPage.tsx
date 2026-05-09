'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ChevronDown,
  Loader2,
  Settings2,
  Users,
} from 'lucide-react';
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

const MODE_LABELS: Record<AskRoomMode, string> = {
  FREECHAT: '自由群聊',
  PARALLEL_MERGE: '并行合并',
  DEBATE: '辩论',
  VOTE: '投票',
  REVIEW: '评审',
  HANDOFF: '交接',
};

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
  // 2026-05-08（screenshot 41）：header 之前固定显示 roomConfig.defaultMode，
  // 用户在 composer 切换协作模式（如 辩论）时不会更新。改为追踪 composer 当前
  // 模式，header 反映用户实际将发送的 mode。
  const [activeMode, setActiveMode] = useState<AskRoomMode>('FREECHAT');
  const [roomTitle, setRoomTitle] = useState<string>('AI 团队房间');

  // 初次加载（含 setLoading，会替换整个页面为 "加载房间..."）
  const initialLoad = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const detail = await askRoomService.getRoom(roomId);
      const cfg = detail.session.roomConfig;
      if (typeof cfg.defaultMode === 'string') {
        setDefaultMode(cfg.defaultMode as AskRoomMode);
      }
      if (detail.session.title) {
        setRoomTitle(detail.session.title);
      }
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

  // turn.complete / turn.error 后的刷新：只刷 members + roomConfig，
  // **绝不**触碰 messages / setLoading（之前的 reload 会把页面闪回 "加载房间..."
  // 然后 messages: [] 清空整个对话，用户看到一闪而过回到初始 EmptyState）。
  const refreshMeta = useCallback(async () => {
    try {
      const detail = await askRoomService.getRoom(roomId);
      const cfg = detail.session.roomConfig;
      if (typeof cfg.defaultMode === 'string') {
        setDefaultMode(cfg.defaultMode as AskRoomMode);
      }
      if (detail.session.title) {
        setRoomTitle(detail.session.title);
      }
      setMembers(detail.members);
    } catch (e) {
      logger.warn(`refreshMeta failed: ${(e as Error).message}`);
    }
  }, [roomId, setMembers]);

  useEffect(() => {
    void initialLoad();
    return () => reset();
  }, [initialLoad, reset]);

  const onEvent = useCallback(
    (event: AskRoomServerEvent) => {
      if (event.kind === 'turn.error') {
        setError(`AI 响应失败：${event.error}`);
        logger.warn('[RoomChat] turn error', event);
        void refreshMeta();
      }
      if (event.kind === 'turn.complete') {
        if (event.status === 'FAILED') {
          setError(
            (prev) => prev ?? 'AI 未返回内容（请检查模型配置 / API Key / 余额）'
          );
        }
        logger.debug('[RoomChat] turn ended', event);
        void refreshMeta();
      }
    },
    [refreshMeta]
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

  const activeMembers = useMemo(
    () => members.filter((m: AskRoomMember) => m.enabled && !m.deletedAt),
    [members]
  );

  if (loading) {
    return (
      <div className="flex h-full w-full flex-1 items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50/30">
        <div className="flex items-center gap-3 text-sm text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
          加载房间...
        </div>
      </div>
    );
  }

  const isStreaming = currentTurnStatus === 'RUNNING';

  // ★ 宽度问题修复：父级 AppShell <main> 是 flex row，子项默认按内容宽度；
  //   必须显式 w-full + flex-1，否则右半屏空白
  return (
    <div className="flex h-full w-full flex-1 flex-col bg-gradient-to-br from-slate-50 to-blue-50/30">
      {/* 商务大气 Header（参考 NewAskRoomModal 风格） */}
      <header className="border-b border-gray-200/80 bg-white/80 px-6 py-4 backdrop-blur-sm">
        <div className="flex w-full items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => router.push('/ai-ask')}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
            aria-label="返回"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          <div className="flex flex-1 items-center gap-3 truncate">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md">
              <Users className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-base font-semibold text-gray-900">
                {roomTitle}
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                  {MODE_LABELS[activeMode]}
                </span>
                <span>· {activeMembers.length} 名 AI 成员</span>
                {isStreaming && (
                  <span className="flex items-center gap-1 text-blue-600">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"></span>
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-blue-500"></span>
                    </span>
                    生成中
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 在线成员头像簇 */}
          {activeMembers.length > 0 && (
            <div className="hidden items-center md:flex">
              {activeMembers.slice(0, 4).map((m, i) => (
                <div
                  key={m.id}
                  title={m.displayName}
                  style={{ marginLeft: i === 0 ? 0 : -8 }}
                  className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-gradient-to-br from-emerald-400 to-teal-500 text-[11px] font-semibold text-white shadow-sm"
                >
                  {m.displayName.slice(0, 1).toUpperCase()}
                </div>
              ))}
              {activeMembers.length > 4 && (
                <div
                  style={{ marginLeft: -8 }}
                  className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-gray-100 text-[11px] font-semibold text-gray-600 shadow-sm"
                >
                  +{activeMembers.length - 4}
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => setMemberPanelOpen(true)}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-all hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
          >
            <Settings2 className="h-4 w-4" />
            <span className="hidden sm:inline">成员管理</span>
            <ChevronDown className="hidden h-3.5 w-3.5 text-gray-400 sm:inline" />
          </button>
        </div>
      </header>

      {/* Error 浮条 */}
      {error && (
        <div className="border-b border-red-200/60 bg-red-50/80 px-6 py-2.5 backdrop-blur-sm">
          <div className="flex w-full items-center gap-2 text-sm text-red-700">
            <span className="font-medium">出错了：</span>
            {error}
            <button
              type="button"
              onClick={() => setError(null)}
              className="ml-auto text-xs text-red-500 hover:text-red-700"
            >
              关闭
            </button>
          </div>
        </div>
      )}

      {/* 消息区 + 输入区 */}
      <RoomMessageList messages={messages} members={members} />

      <RoomComposer
        members={members}
        defaultMode={defaultMode}
        disabled={loading}
        isStreaming={isStreaming}
        onModeChange={setActiveMode}
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
