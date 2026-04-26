'use client';

/**
 * LeaderChatModal — 浮动聊天框，与 mission Leader 讨论
 *
 * 触发：在团队拓扑中点击 Leader 节点 → 弹出此 modal
 * 后端：/api/v1/agent-playground/missions/:id/leader-chat
 *
 * 特性：
 *   - 宽 560px（默认） / 全屏可用
 *   - assistant 回复用 ReactMarkdown 渲染（GFM 表格 + 列表 + 粗体 + 链接）
 *   - 支持最小化为右下角浮球，再次点击 Leader 节点 / 浮球可恢复
 */

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  X as XIcon,
  Brain,
  Send,
  Loader2,
  User as UserIcon,
  Minus,
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

const MD_COMPONENTS = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-2 leading-relaxed last:mb-0">{children}</p>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="mb-2 ml-4 list-disc space-y-0.5 last:mb-0">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="mb-2 ml-4 list-decimal space-y-0.5 last:mb-0">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="leading-relaxed">{children}</li>
  ),
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="mb-1.5 mt-2 text-[14px] font-semibold">{children}</h3>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h4 className="mb-1 mt-2 text-[13px] font-semibold">{children}</h4>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h5 className="mb-1 mt-2 text-[12px] font-semibold">{children}</h5>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em className="italic">{children}</em>
  ),
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => {
    const safe = href && /^https?:\/\//i.test(href) ? href : undefined;
    return safe ? (
      <a
        href={safe}
        target="_blank"
        rel="noopener noreferrer"
        className="break-words text-violet-600 underline decoration-violet-300 underline-offset-2 hover:text-violet-700"
      >
        {children}
      </a>
    ) : (
      <span>{children}</span>
    );
  },
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="font-mono rounded bg-gray-100 px-1 py-0.5 text-[11px]">
      {children}
    </code>
  ),
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre className="font-mono my-2 overflow-x-auto rounded bg-gray-900 p-2 text-[11px] text-gray-100">
      {children}
    </pre>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="my-2 border-l-2 border-violet-300 bg-violet-50/40 px-2 py-1 text-gray-700">
      {children}
    </blockquote>
  ),
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="my-2 overflow-x-auto">
      <table className="min-w-full border-collapse text-[11px]">
        {children}
      </table>
    </div>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="border border-gray-200 bg-gray-50 px-2 py-1 text-left font-semibold">
      {children}
    </th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="border border-gray-200 px-2 py-1 align-top">{children}</td>
  ),
};

export function LeaderChatModal({ missionId, topic, open, onClose }: Props) {
  const [messages, setMessages] = useState<LeaderChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // open 状态变化时重置 minimized；明确关闭时也清掉 minimize
  useEffect(() => {
    if (open) setMinimized(false);
  }, [open]);

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
    if (open && !minimized) {
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [open, minimized]);

  useEffect(() => {
    if (!minimized) {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages.length, minimized]);

  if (!open) return null;

  // ── 最小化态：右下角浮球 ──
  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-2xl transition-transform hover:scale-105"
        title="恢复 Leader 对话"
      >
        <Brain className="h-6 w-6" />
        {messages.length > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] font-bold text-violet-600 ring-2 ring-violet-500">
            {messages.length}
          </span>
        )}
      </button>
    );
  }

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);

    // 1) 乐观插入用户消息 + thinking 占位
    const tempUserId = `tmp-user-${Date.now()}`;
    const tempThinkingId = `tmp-thinking-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: tempUserId,
        role: 'user',
        content: text,
        tokensUsed: null,
        createdAt: new Date().toISOString(),
      },
      {
        id: tempThinkingId,
        role: 'assistant',
        content: '__THINKING__', // 渲染时识别为 typing indicator
        tokensUsed: null,
        createdAt: new Date().toISOString(),
      },
    ]);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    // 2) 调用 API
    try {
      const { user, assistant } = await sendLeaderChat(missionId, text);
      // 3) 用真实记录替换占位
      setMessages((prev) =>
        prev
          .filter((m) => m.id !== tempUserId && m.id !== tempThinkingId)
          .concat(user, assistant)
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      // 失败时移除 thinking 占位（保留用户消息让用户能复制 / 重发）
      setMessages((prev) => prev.filter((m) => m.id !== tempThinkingId));
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
        className="flex h-[88vh] w-full flex-col overflow-hidden rounded-t-2xl border border-gray-200 bg-white shadow-2xl sm:h-[80vh] sm:w-[560px] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 bg-gradient-to-r from-violet-500 to-purple-600 px-4 py-3 text-white">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/20">
              <Brain className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">与 Leader 对话</p>
              <p className="line-clamp-1 text-[11px] text-white/80">
                {topic ?? 'Research mission'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMinimized(true)}
              className="rounded-full p-1.5 text-white/90 transition-colors hover:bg-white/20"
              title="最小化"
            >
              <Minus className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1.5 text-white/90 transition-colors hover:bg-white/20"
              title="关闭"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto bg-gray-50/40 px-4 py-4"
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
            <ul className="space-y-4">
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
                  <div className="max-w-[80%]">
                    <div
                      className={`rounded-2xl px-3 py-2 text-[13px] leading-relaxed ${
                        m.role === 'user'
                          ? 'rounded-tr-sm bg-violet-600 text-white'
                          : 'rounded-tl-sm bg-white text-gray-800 ring-1 ring-gray-100'
                      }`}
                    >
                      {m.role === 'user' ? (
                        <p className="whitespace-pre-wrap break-words">
                          {m.content}
                        </p>
                      ) : m.content === '__THINKING__' ? (
                        <div className="flex items-center gap-1.5 py-1">
                          <span className="inline-flex gap-1">
                            <span
                              className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-400"
                              style={{ animationDelay: '0ms' }}
                            />
                            <span
                              className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-400"
                              style={{ animationDelay: '150ms' }}
                            />
                            <span
                              className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-400"
                              style={{ animationDelay: '300ms' }}
                            />
                          </span>
                          <span className="text-[12px] text-gray-500">
                            Leader 思考中…
                          </span>
                        </div>
                      ) : (
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={MD_COMPONENTS}
                        >
                          {m.content}
                        </ReactMarkdown>
                      )}
                    </div>
                    {m.content !== '__THINKING__' && (
                      <p
                        className={`mt-1 px-1 text-[10px] ${
                          m.role === 'user'
                            ? 'text-right text-gray-400'
                            : 'text-gray-400'
                        }`}
                      >
                        <ClientDate date={m.createdAt} format="time" />
                        {m.tokensUsed && m.tokensUsed > 0 ? (
                          <span> · {m.tokensUsed} tk</span>
                        ) : null}
                      </p>
                    )}
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
