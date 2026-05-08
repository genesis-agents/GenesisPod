'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, X } from 'lucide-react';
import type { AskRoomMember, AskRoomMode } from '@/types/ask-room';

const MODE_LABELS: Record<AskRoomMode, string> = {
  FREECHAT: '自由群聊',
  PARALLEL_MERGE: '并行合并',
  DEBATE: '辩论',
  VOTE: '投票',
  REVIEW: '评审',
  HANDOFF: '交接',
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
    <div className="border-t border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as AskRoomMode)}
          disabled={disabled}
          className="rounded border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800"
        >
          {(Object.keys(MODE_LABELS) as AskRoomMode[]).map((m) => (
            <option key={m} value={m}>
              {MODE_LABELS[m]}
            </option>
          ))}
        </select>
        <div className="flex flex-wrap gap-1 text-xs">
          {enabledMembers.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => toggleMention(m.id)}
              disabled={disabled}
              className={`rounded-full border px-2 py-0.5 transition ${
                mentioned.has(m.id)
                  ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800'
              }`}
            >
              @{m.displayName}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
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
            isStreaming
              ? '正在生成回复...'
              : '输入消息（⌘+Enter 发送，可点击成员名 @ 路由）'
          }
          disabled={disabled || isStreaming}
          rows={2}
          className="flex-1 resize-none rounded border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:disabled:bg-gray-900"
        />
        {isStreaming ? (
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center gap-1 rounded bg-red-500 px-3 py-2 text-sm text-white hover:bg-red-600"
          >
            <X size={16} />
            取消
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={disabled || !text.trim()}
            className="flex items-center gap-1 rounded bg-blue-500 px-3 py-2 text-sm text-white hover:bg-blue-600 disabled:bg-gray-300"
          >
            <Send size={16} />
            发送
          </button>
        )}
      </div>
    </div>
  );
}
