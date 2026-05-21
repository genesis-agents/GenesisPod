'use client';

/**
 * 对话式整理（ADR-006 P2）。复用平台 agent 工具循环的 SSE 客户端，
 * 逐事件渲染工具动作 + 总结。P1 范围：书签（scope=BOOKMARKS）。
 *
 * 注：单步撤销（Q2）需后端 reverse-batch 端点，列为 P2 后续；本组件先把
 * 「理解意图 → 真实改库 → 看得到做了什么」闭环跑通。
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send,
  FolderPlus,
  Tag,
  ArrowRight,
  CheckCircle2,
  Search,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils/common';
import { EmptyState } from '@/components/ui/states';
import { useAuth } from '@/contexts/AuthContext';
import {
  streamOrganizeMessage,
  type OrganizeStreamEvent,
  type OrganizeStreamRequestBody,
} from '@/lib/api/organize-chat-stream';

type ToolAction = { tool: string };

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  tools: ToolAction[];
  pending?: boolean;
  error?: boolean;
}

const TOOL_META: Record<string, { label: string; icon: typeof Tag }> = {
  'organize-create-collection': { label: '新建集合', icon: FolderPlus },
  'organize-tag-items': { label: '打标签', icon: Tag },
  'organize-move-items': { label: '移动', icon: ArrowRight },
  'organize-set-status': { label: '改状态', icon: CheckCircle2 },
  'organize-list-collections': { label: '读取集合', icon: Search },
  'organize-list-items': { label: '读取条目', icon: Search },
};

function ToolChip({ tool }: { tool: string }) {
  const meta = TOOL_META[tool] ?? { label: tool, icon: Sparkles };
  const Icon = meta.icon;
  return (
    <span className="inline-flex items-center gap-1 rounded-lg bg-violet-50 px-2 py-1 text-xs text-violet-700">
      <Icon className="h-3 w-3" />
      {meta.label}
    </span>
  );
}

export function OrganizeChatMode({
  scope = 'BOOKMARKS',
  onChanged,
}: {
  scope?: OrganizeStreamRequestBody['scope'];
  onChanged?: () => void;
}) {
  const { accessToken: token } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming || !token) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
      tools: [],
    };
    const asstId = `a-${Date.now()}`;
    const asstMsg: ChatMessage = {
      id: asstId,
      role: 'assistant',
      content: '',
      tools: [],
      pending: true,
    };
    setMessages((m) => [...m, userMsg, asstMsg]);
    setInput('');
    setStreaming(true);

    const patch = (fn: (x: ChatMessage) => ChatMessage) =>
      setMessages((m) => m.map((x) => (x.id === asstId ? fn(x) : x)));

    const onEvent = (e: OrganizeStreamEvent) => {
      if (e.type === 'tool' && e.phase === 'result') {
        patch((x) => ({ ...x, tools: [...x.tools, { tool: e.tool }] }));
      } else if (e.type === 'chunk') {
        patch((x) => ({ ...x, content: x.content + e.content }));
      }
    };

    const result = await streamOrganizeMessage(
      token,
      { message: text, scope, sessionId },
      onEvent
    );
    setStreaming(false);

    if (result.ok) {
      setSessionId(result.sessionId);
      patch((x) => ({
        ...x,
        content: result.summary || x.content || '已完成整理',
        pending: false,
      }));
      onChanged?.();
    } else {
      patch((x) => ({
        ...x,
        content: result.partialSummary
          ? `${result.partialSummary}\n\n⚠ ${result.error}`
          : `⚠ ${result.error}`,
        pending: false,
        error: true,
      }));
    }
  }, [input, streaming, token, scope, sessionId, onChanged]);

  return (
    <div className="flex h-[420px] flex-col">
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-3">
        {messages.length === 0 ? (
          <EmptyState
            icon={<Sparkles className="h-6 w-6 text-violet-400" />}
            title="用对话整理你的库"
            description="例如：「把所有 AI 论文归到新集合『AI 论文』并打标 LLM，已读的别动」"
          />
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                'flex',
                m.role === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              <div
                className={cn(
                  'max-w-[85%] rounded-2xl px-3 py-2 text-sm',
                  m.role === 'user'
                    ? 'bg-violet-600 text-white'
                    : m.error
                      ? 'bg-red-50 text-red-700'
                      : 'bg-gray-100 text-gray-800'
                )}
              >
                {m.tools.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1">
                    {m.tools.map((t, i) => (
                      <ToolChip key={`${m.id}-${i}`} tool={t.tool} />
                    ))}
                  </div>
                )}
                <p className="whitespace-pre-wrap">
                  {m.content || (m.pending ? '整理中…' : '')}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="flex items-end gap-2 border-t border-gray-100 p-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={2}
          placeholder="下达整理指令，Enter 发送 / Shift+Enter 换行"
          disabled={streaming}
          className="flex-1 resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 outline-none focus:border-violet-400 disabled:bg-gray-50"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={streaming || !input.trim()}
          className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg bg-violet-600 px-3 text-sm font-medium text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
          {streaming ? '整理中' : '发送'}
        </button>
      </div>
    </div>
  );
}
