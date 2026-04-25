'use client';

/**
 * LeaderChatModal — 浮动聊天框，与 mission Leader 讨论
 *
 * 触发：在团队拓扑中点击 Leader 节点 → 弹出此 modal
 * 后端：/api/v1/agent-playground/missions/:id/leader-chat
 *   - GET 拉历史
 *   - POST 发送 + LLM 回复（双方都持久化）
 *
 * 视觉参考 TI 的 QuickCommandBar：底部 textarea + 发送按钮，
 * 上方滚动消息列表，user/assistant 气泡分明。
 */

import { useEffect, useRef, useState } from 'react';
import {
  X as XIcon,
  Brain,
  Send,
  Loader2,
  User as UserIcon,
} from 'lucide-react';
import {
  listLeaderChat,
  sendLeaderChat,
  type LeaderChatMessage,
} from '@/lib/api/agent-playground';
import { ClientDate } from '@/components/common/ClientDate';

interface Props {
  missionId: string;
  topic?: string;
  open: boolean;
  onClose: () => void;
}

export function LeaderChatModal({ missionId, topic, open, onClose }: Props) {
  const [messages, setMessages] = useState<LeaderChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    listLeaderChat(missionId)
      .then((msgs) => {
        if (!cancelled) {
          setMessages(msgs);
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

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages.length]);

  if (!open) return null;

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      const { user, assistant } = await sendLeaderChat(missionId, text);
      setMessages((prev) => [...prev, user, assistant]);
      setInput('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void handleSend();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-end bg-black/30 backdrop-blur-[2px] sm:items-center sm:justify-end sm:p-6"
      onClick={onClose}
    >
      <div
        className="flex h-[80vh] w-full flex-col overflow-hidden rounded-t-2xl border border-gray-200 bg-white shadow-2xl sm:h-[640px] sm:w-[440px] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 bg-gradient-to-r from-violet-500 to-purple-600 px-4 py-3 text-white">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20">
              <Brain className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold">与 Leader 对话</p>
              <p className="line-clamp-1 text-[11px] text-white/80">
                {topic ?? 'Research mission'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-white/90 transition-colors hover:bg-white/20"
            title="关闭"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto bg-gray-50/40 px-3 py-3"
        >
          {loading ? (
            <div className="flex items-center justify-center py-12 text-sm text-gray-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              加载历史对话…
            </div>
          ) : error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              {error}
            </div>
          ) : messages.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-200 bg-white p-6 text-center">
              <Brain className="mx-auto mb-2 h-8 w-8 text-violet-300" />
              <p className="text-sm font-medium text-gray-700">
                还没有对话记录
              </p>
              <p className="mt-1 text-[11px] text-gray-500">
                Leader 已掌握此 mission 的完整上下文（topic、维度、报告），
                直接问问看吧。
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {messages.map((m) => (
                <li
                  key={m.id}
                  className={`flex gap-2 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                      m.role === 'user'
                        ? 'bg-blue-100 text-blue-600'
                        : 'bg-violet-100 text-violet-600'
                    }`}
                  >
                    {m.role === 'user' ? (
                      <UserIcon className="h-3.5 w-3.5" />
                    ) : (
                      <Brain className="h-3.5 w-3.5" />
                    )}
                  </span>
                  <div
                    className={`max-w-[78%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed ${
                      m.role === 'user'
                        ? 'rounded-tr-sm bg-violet-600 text-white'
                        : 'rounded-tl-sm bg-white text-gray-800 ring-1 ring-gray-100'
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">
                      {m.content}
                    </p>
                    <p
                      className={`mt-1 text-[10px] ${
                        m.role === 'user' ? 'text-violet-100' : 'text-gray-400'
                      }`}
                    >
                      <ClientDate date={m.createdAt} format="time" />
                      {m.tokensUsed && m.tokensUsed > 0 ? (
                        <span> · {m.tokensUsed} tk</span>
                      ) : null}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-gray-100 bg-white p-3">
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                const ta = e.target;
                ta.style.height = 'auto';
                ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
              }}
              onKeyDown={onKeyDown}
              placeholder="向 Leader 提问（Ctrl/Cmd + Enter 发送）"
              rows={2}
              disabled={sending}
              className="flex-1 resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-[13px] leading-relaxed placeholder:text-gray-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100 disabled:cursor-not-allowed disabled:bg-gray-50"
            />
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={!input.trim() || sending}
              className="flex h-10 w-10 shrink-0 items-center justify-center self-end rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow transition-all hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
              title="发送"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
          {error && (
            <p className="mt-2 text-[11px] text-red-600">发送失败：{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
