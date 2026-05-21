'use client';

/**
 * 对话式整理（ADR-006 P2）。复用 canonical `LeaderChatDock`（与「与 Leader 对话」
 * 同款浮层对话框），消费 streamOrganizeMessage 的 SSE，逐事件把工具动作渲染为 chip。
 * P1 范围：书签（scope=BOOKMARKS）。
 */
import { useState, useCallback } from 'react';
import {
  FolderPlus,
  Tag,
  ArrowRight,
  CheckCircle2,
  Search,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  LeaderChatDock,
  type LeaderChatMessage,
} from '@/components/common/leader-chat';
import {
  streamOrganizeMessage,
  type OrganizeStreamEvent,
  type OrganizeStreamRequestBody,
} from '@/lib/api/organize-chat-stream';

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

const SCOPE_LABEL: Record<
  NonNullable<OrganizeStreamRequestBody['scope']>,
  string
> = {
  BOOKMARKS: '书签',
  NOTES: '笔记',
  EXTERNAL: '外部连接',
};

export function OrganizeChatMode({
  open,
  onClose,
  scope = 'BOOKMARKS',
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  scope?: OrganizeStreamRequestBody['scope'];
  onChanged?: () => void;
}) {
  const { accessToken: token } = useAuth();
  const [messages, setMessages] = useState<LeaderChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | undefined>();

  const handleSend = useCallback(
    async (text: string) => {
      if (!token) return;
      setSending(true);
      setError(null);

      const userId = `u-${Date.now()}`;
      const asstId = `a-${Date.now()}`;
      const now = new Date().toISOString();
      setMessages((prev) => [
        ...prev,
        { id: userId, role: 'user', content: text, createdAt: now },
        {
          id: asstId,
          role: 'assistant',
          content: '__THINKING__',
          createdAt: now,
          meta: { tools: [] },
        },
      ]);

      const patch = (fn: (m: LeaderChatMessage) => LeaderChatMessage) =>
        setMessages((prev) => prev.map((m) => (m.id === asstId ? fn(m) : m)));

      const onEvent = (e: OrganizeStreamEvent) => {
        if (e.type === 'tool' && e.phase === 'result') {
          patch((m) => {
            const tools = (m.meta?.tools as { tool: string }[]) ?? [];
            return {
              ...m,
              meta: { ...m.meta, tools: [...tools, { tool: e.tool }] },
            };
          });
        } else if (e.type === 'chunk') {
          patch((m) => ({
            ...m,
            content:
              (m.content === '__THINKING__' ? '' : m.content) + e.content,
          }));
        }
      };

      const result = await streamOrganizeMessage(
        token,
        { message: text, scope, sessionId },
        onEvent
      );
      setSending(false);

      if (result.ok) {
        setSessionId(result.sessionId);
        patch((m) => ({
          ...m,
          content:
            result.summary ||
            (m.content === '__THINKING__' ? '已完成整理' : m.content),
        }));
        onChanged?.();
      } else {
        setError(result.error);
        patch((m) => ({
          ...m,
          content: result.partialSummary || `整理未完成：${result.error}`,
        }));
      }
    },
    [token, scope, sessionId, onChanged]
  );

  const renderTools = (msg: LeaderChatMessage) => {
    const tools = (msg.meta?.tools as { tool: string }[]) ?? [];
    if (tools.length === 0) return null;
    return (
      <div className="mt-2 flex flex-wrap gap-1">
        {tools.map((t, i) => (
          <ToolChip key={`${msg.id}-${i}`} tool={t.tool} />
        ))}
      </div>
    );
  };

  return (
    <LeaderChatDock
      open={open}
      onClose={onClose}
      messages={messages}
      sending={sending}
      error={error}
      onSend={handleSend}
      title="AI 整理助手"
      subtitle={`对话整理 · ${SCOPE_LABEL[scope ?? 'BOOKMARKS']}`}
      accentColor="violet"
      assistantName="整理助手"
      labels={{
        emptyTitle: '用对话整理你的库',
        emptyHint:
          '例如：「把所有 AI 论文归到新集合『AI 论文』并打标 LLM，已读的别动」',
        placeholder: '下达整理指令…',
      }}
      renderAssistantBodyExtra={renderTools}
    />
  );
}
