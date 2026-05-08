'use client';

import { useState, useRef, useEffect } from 'react';
import { AtSign, Send, X } from 'lucide-react';
import type { AskRoomMember, AskRoomMode } from '@/types/ask-room';

const MODE_LABELS: Record<AskRoomMode, string> = {
  FREECHAT: '自由群聊',
  PARALLEL_MERGE: '并行合并',
  DEBATE: '辩论',
  VOTE: '投票',
  REVIEW: '评审',
  HANDOFF: '交接',
};

const MODE_HINTS: Record<AskRoomMode, string> = {
  FREECHAT: '点击成员名 @ 路由；不 @ 时由 leader 决定',
  PARALLEL_MERGE: '全员并行回答 → leader 合成',
  DEBATE: '正反方多轮辩论',
  VOTE: '成员投票表决',
  REVIEW: '主答 + 评审 + 修订',
  HANDOFF: '由起始成员决定下一棒',
};

interface RoomComposerProps {
  members: AskRoomMember[];
  defaultMode: AskRoomMode;
  disabled?: boolean;
  onSend: (input: {
    content: string;
    mode: AskRoomMode;
    mentionedMemberIds: string[];
  }) => void;
  onCancel?: () => void;
  isStreaming?: boolean;
}

export function RoomComposer({
  members,
  defaultMode,
  disabled,
  onSend,
  onCancel,
  isStreaming,
}: RoomComposerProps) {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<AskRoomMode>(defaultMode);
  const [mentioned, setMentioned] = useState<Set<string>>(new Set());
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setMode(defaultMode);
  }, [defaultMode]);

  const enabledMembers = members.filter((m) => m.enabled && !m.deletedAt);

  const handleSubmit = () => {
    const content = text.trim();
    if (!content) return;
    onSend({
      content,
      mode,
      mentionedMemberIds: Array.from(mentioned),
    });
    setText('');
    setMentioned(new Set());
  };

  const toggleMention = (id: string) => {
    setMentioned((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="border-t border-gray-200/80 bg-white/90 px-6 py-4 backdrop-blur-sm">
      <div className="mx-auto max-w-4xl">
        {/* 协作模式 chips（替代 native select） */}
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {(Object.keys(MODE_LABELS) as AskRoomMode[]).map((m) => {
            const active = mode === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                disabled={disabled}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition-all ${
                  active
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {MODE_LABELS[m]}
              </button>
            );
          })}
          <span className="ml-2 text-[11px] text-gray-400">
            · {MODE_HINTS[mode]}
          </span>
        </div>

        {/* @mention chips（FREECHAT 模式） */}
        {mode === 'FREECHAT' && enabledMembers.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <AtSign className="h-3.5 w-3.5 text-gray-400" />
            {enabledMembers.map((m) => {
              const active = mentioned.has(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggleMention(m.id)}
                  disabled={disabled}
                  className={`rounded-full border px-2 py-0.5 text-xs transition-all ${
                    active
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {m.displayName}
                </button>
              );
            })}
          </div>
        )}

        {/* 输入框 + 发送 */}
        <div className="flex items-end gap-3 rounded-2xl border border-gray-200 bg-white p-2 shadow-sm transition-all focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/15">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder={
              isStreaming ? '正在生成回复...' : '输入消息（⌘+Enter 发送）'
            }
            disabled={disabled || isStreaming}
            rows={2}
            className="flex-1 resize-none border-0 bg-transparent px-3 py-2 text-sm leading-relaxed text-gray-900 placeholder:text-gray-400 focus:outline-none disabled:opacity-60"
          />
          {isStreaming ? (
            <button
              type="button"
              onClick={onCancel}
              className="flex h-10 items-center gap-1.5 rounded-xl bg-red-500 px-4 text-sm font-medium text-white transition-colors hover:bg-red-600"
            >
              <X className="h-4 w-4" />
              停止
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={disabled || !text.trim()}
              className="flex h-10 items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 text-sm font-medium text-white shadow-sm transition-all hover:from-blue-700 hover:to-indigo-700 disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
              发送
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
