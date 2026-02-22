'use client';

/**
 * Global AI Bar — 路线图支柱六 6b
 *
 * Cmd+K 唤起的全局 AI 对话入口。
 * 支持快速操作（深度研究 / 写报告 / 团队分析 / 问答），
 * 输入后路由到对应模块并传递 query 参数。
 */

import { useEffect, useRef, KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  X,
  BookOpen,
  FileText,
  Users,
  MessageSquare,
  ArrowRight,
  Command,
} from 'lucide-react';
import {
  QuickAction,
  GlobalAIBarState,
  GlobalAIBarActions,
} from './useGlobalAIBar';

// ─────────────────────────────────────────────────────────
// Quick action config
// ─────────────────────────────────────────────────────────

interface ActionConfig {
  id: QuickAction;
  label: string;
  description: string;
  path: string;
  queryParam: string;
  Icon: React.ComponentType<{ className?: string }>;
  colorClass: string;
}

const QUICK_ACTIONS: ActionConfig[] = [
  {
    id: 'research',
    label: '深度研究',
    description: '多步骤 AI 研究报告',
    path: '/ai-research',
    queryParam: 'q',
    Icon: BookOpen,
    colorClass: 'text-blue-400',
  },
  {
    id: 'write',
    label: '写报告',
    description: '长文写作助手',
    path: '/ai-writing',
    queryParam: 'q',
    Icon: FileText,
    colorClass: 'text-green-400',
  },
  {
    id: 'teams',
    label: '团队分析',
    description: '多 Agent 协作辩论',
    path: '/ai-teams',
    queryParam: 'topic',
    Icon: Users,
    colorClass: 'text-purple-400',
  },
  {
    id: 'ask',
    label: '问答',
    description: '多模型智能问答',
    path: '/ai-ask',
    queryParam: 'q',
    Icon: MessageSquare,
    colorClass: 'text-orange-400',
  },
];

// ─────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────

type Props = GlobalAIBarState & GlobalAIBarActions;

export function GlobalAIBar({
  isOpen,
  query,
  selectedAction,
  close,
  setQuery,
  setSelectedAction,
}: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const getEffectiveAction = (): ActionConfig => {
    const found = QUICK_ACTIONS.find((a) => a.id === selectedAction);
    return found ?? QUICK_ACTIONS[3]; // default: ask
  };

  const handleSubmit = () => {
    const trimmed = query.trim();
    if (!trimmed) return;

    const action = getEffectiveAction();
    const params = new URLSearchParams({ [action.queryParam]: trimmed });
    close();
    router.push(`${action.path}?${params.toString()}`);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleActionClick = (action: ActionConfig) => {
    setSelectedAction(action.id === selectedAction ? null : action.id);
    inputRef.current?.focus();
  };

  if (!isOpen) return null;

  const activeAction = selectedAction
    ? QUICK_ACTIONS.find((a) => a.id === selectedAction)
    : null;
  const placeholderText = activeAction
    ? `${activeAction.description}...`
    : '描述你的任务，或选择一个快速操作';

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={close}
        aria-hidden="true"
      />

      {/* Bar container */}
      <div
        role="dialog"
        aria-label="Global AI Bar"
        aria-modal="true"
        className="fixed left-1/2 top-[20%] z-50 w-full max-w-2xl -translate-x-1/2 px-4"
      >
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-gray-900 shadow-2xl">
          {/* Input row */}
          <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
            <Search className="h-5 w-5 shrink-0 text-gray-400" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholderText}
              className="flex-1 bg-transparent text-base text-white placeholder-gray-500 outline-none"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="rounded p-1 text-gray-400 hover:text-white"
                aria-label="清空输入"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={handleSubmit}
              disabled={!query.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white transition-colors hover:bg-blue-500 disabled:opacity-40"
            >
              发送
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Quick actions */}
          <div className="flex gap-2 px-4 py-3">
            {QUICK_ACTIONS.map((action) => {
              const isActive = selectedAction === action.id;
              return (
                <button
                  key={action.id}
                  onClick={() => handleActionClick(action)}
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                    isActive
                      ? 'border-blue-500/60 bg-blue-500/20 text-white'
                      : 'border-white/10 text-gray-400 hover:border-white/20 hover:text-white'
                  }`}
                >
                  <action.Icon
                    className={`h-3.5 w-3.5 ${isActive ? 'text-blue-400' : action.colorClass}`}
                  />
                  {action.label}
                </button>
              );
            })}
          </div>

          {/* Hint footer */}
          <div className="flex items-center justify-between border-t border-white/10 px-4 py-2 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <Command className="h-3 w-3" />
              <span>K</span>
              <span className="ml-1">唤起 / 关闭</span>
            </span>
            <span>Enter 发送 &nbsp;·&nbsp; Esc 关闭</span>
          </div>
        </div>
      </div>
    </>
  );
}
