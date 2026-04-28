'use client';

/**
 * TodoDetailDrawer —— 单条 todo 的"完整故事"
 *
 * Header：
 *   - 4 层架构面包屑（AI-APP → AI-HARNESS → AI-ENGINE → AI-INFRA）
 *   - origin badge（Leader 拆维度 / Reviewer 重写 / Critic 警示...）
 *   - 起因（reasonText）
 *
 * Body：
 *   - 主时间线：narrativeLog 渲染为可读 timeline（人话，不是 JSON）
 *   - 产出物（artifacts）卡片化展示
 *   - 失败时优先显示失败原因
 *   - 底部 collapsed "开发者诊断视图"：原始 trace（仅在 agentRefId 命中 agent 时有内容）
 */

import React from 'react';
import {
  Brain,
  Search,
  GitBranch,
  PenLine,
  Gavel,
  Loader2,
  CheckCircle2,
  X as XIcon,
  Lightbulb,
  AlertTriangle,
  Sparkles,
  RotateCcw,
  ScanSearch,
  ShieldAlert,
  PiggyBank,
  Database,
  ChevronRight,
  Info,
} from 'lucide-react';
import type {
  MissionTodo,
  MissionTodoNarrativeItem,
} from '@/lib/agent-playground/todo-ledger';
import { deriveLayerBreadcrumb } from '@/lib/agent-playground/todo-ledger';
import type { AgentLiveState } from '@/lib/agent-playground/derive';

interface Props {
  todo: MissionTodo | undefined;
  agents: AgentLiveState[];
  onClose: () => void;
}

const TONE_STYLE: Record<
  NonNullable<MissionTodoNarrativeItem['tone']>,
  { ring: string; bg: string; chip: string; Icon: typeof Info }
> = {
  info: {
    ring: 'ring-sky-200',
    bg: 'bg-sky-50/60',
    chip: 'bg-sky-100 text-sky-700',
    Icon: Info,
  },
  success: {
    ring: 'ring-emerald-200',
    bg: 'bg-emerald-50/60',
    chip: 'bg-emerald-100 text-emerald-700',
    Icon: CheckCircle2,
  },
  warn: {
    ring: 'ring-amber-200',
    bg: 'bg-amber-50/60',
    chip: 'bg-amber-100 text-amber-700',
    Icon: AlertTriangle,
  },
  error: {
    ring: 'ring-red-200',
    bg: 'bg-red-50/60',
    chip: 'bg-red-100 text-red-700',
    Icon: AlertTriangle,
  },
};

function originLabel(origin: MissionTodo['origin']): {
  label: string;
  cls: string;
} {
  const map: Record<MissionTodo['origin'], { label: string; cls: string }> = {
    'leader-plan': {
      label: 'Leader 拆维度',
      cls: 'bg-violet-50 text-violet-700 ring-violet-200',
    },
    'leader-assess-retry': {
      label: 'Leader 评审重派',
      cls: 'bg-violet-50 text-violet-700 ring-violet-200',
    },
    'leader-assess-replace': {
      label: 'Leader 换 spec',
      cls: 'bg-violet-50 text-violet-700 ring-violet-200',
    },
    'leader-assess-extend': {
      label: 'Leader 追加维度',
      cls: 'bg-violet-50 text-violet-700 ring-violet-200',
    },
    'leader-assess-abort': {
      label: 'Leader 放弃维度',
      cls: 'bg-amber-50 text-amber-700 ring-amber-200',
    },
    'leader-chat-create': {
      label: 'Leader Chat 追加',
      cls: 'bg-violet-50 text-violet-700 ring-violet-200',
    },
    'self-heal-retry': {
      label: '自愈重试',
      cls: 'bg-orange-50 text-orange-700 ring-orange-200',
    },
    'reviewer-revise': {
      label: 'Reviewer 重写',
      cls: 'bg-pink-50 text-pink-700 ring-pink-200',
    },
    'critic-blindspot': {
      label: 'Critic 警示',
      cls: 'bg-red-50 text-red-700 ring-red-200',
    },
    'reconciler-gap': {
      label: 'Reconciler 缺口',
      cls: 'bg-sky-50 text-sky-700 ring-sky-200',
    },
    'system-stage': {
      label: '系统阶段',
      cls: 'bg-gray-50 text-gray-700 ring-gray-200',
    },
  };
  return map[origin];
}

function statusBadge(status: MissionTodo['status']): {
  label: string;
  cls: string;
  Icon: typeof Loader2;
  spin?: boolean;
} {
  switch (status) {
    case 'done':
      return {
        label: '已完成',
        cls: 'text-emerald-700 bg-emerald-50 ring-emerald-200',
        Icon: CheckCircle2,
      };
    case 'in_progress':
      return {
        label: '进行中',
        cls: 'text-blue-700 bg-blue-50 ring-blue-200',
        Icon: Loader2,
        spin: true,
      };
    case 'failed':
      return {
        label: '失败',
        cls: 'text-red-700 bg-red-50 ring-red-200',
        Icon: XIcon,
      };
    case 'cancelled':
      return {
        label: '已放弃',
        cls: 'text-gray-600 bg-gray-100 ring-gray-200',
        Icon: XIcon,
      };
    case 'blocked':
      return {
        label: '阻塞',
        cls: 'text-amber-700 bg-amber-50 ring-amber-200',
        Icon: AlertTriangle,
      };
    default:
      return {
        label: '待生成',
        cls: 'text-gray-600 bg-gray-50 ring-gray-200',
        Icon: Loader2,
      };
  }
}

function roleIcon(role: string, className: string) {
  const Icon =
    role === 'leader'
      ? Brain
      : role === 'researcher'
        ? Search
        : role === 'analyst'
          ? GitBranch
          : role === 'writer'
            ? PenLine
            : role === 'reviewer' || role === 'critic'
              ? Gavel
              : role === 'reconciler'
                ? ScanSearch
                : role === 'mission'
                  ? Sparkles
                  : ShieldAlert;
  return <Icon className={className} />;
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
}

export function TodoDetailDrawer({ todo, agents, onClose }: Props) {
  if (!todo) return null;

  const origin = originLabel(todo.origin);
  const status = statusBadge(todo.status);
  const StatusIcon = status.Icon;
  const layers = deriveLayerBreadcrumb(todo);

  // 找到 agent trace（如果有 agentRefId）
  const linkedAgent = todo.agentRefId
    ? agents.find(
        (a) =>
          a.agentId === todo.agentRefId ||
          a.agentId.startsWith(`${todo.agentRefId}.`)
      )
    : todo.assignee.dimensionName
      ? agents.find(
          (a) =>
            a.role === 'researcher' &&
            a.dimension === todo.assignee.dimensionName
        )
      : undefined;

  const wallSec =
    todo.startedAt && todo.endedAt
      ? `${((todo.endedAt - todo.startedAt) / 1000).toFixed(1)}s`
      : todo.startedAt
        ? '运行中…'
        : '—';

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-black/30 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-xl flex-col overflow-hidden border-l border-gray-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-gray-100 px-4 py-3">
          <div className="min-w-0">
            <span
              className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${origin.cls}`}
            >
              {origin.label}
            </span>
            <h3 className="mt-1 truncate text-base font-semibold text-gray-900">
              {todo.title}
            </h3>
            <p className="mt-0.5 truncate text-xs text-gray-500">
              {roleIcon(
                todo.assignee.role,
                'inline h-3 w-3 mr-1 align-middle text-gray-400'
              )}
              {todo.assignee.role}
              {todo.assignee.agentId ? ` · ${todo.assignee.agentId}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {/* 4-layer architecture breadcrumb */}
          <div className="rounded-xl border border-gray-100 bg-gradient-to-br from-violet-50/40 to-purple-50/30 p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-violet-600">
              4 层架构定位
            </p>
            <div className="flex flex-wrap items-center gap-1">
              {layers.map((l, i) => (
                <React.Fragment key={l.id}>
                  <div className="flex flex-col">
                    <span className="font-mono text-[10px] font-semibold text-violet-700">
                      {l.label}
                    </span>
                    <span className="text-[10px] text-gray-600">
                      {l.detail}
                    </span>
                  </div>
                  {i < layers.length - 1 && (
                    <ChevronRight className="h-3 w-3 text-gray-300" />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* 4 stat cards */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-gray-50 px-2 py-2">
              <p className="text-[9px] uppercase tracking-wide text-gray-500">
                状态
              </p>
              <p
                className={`mt-0.5 inline-flex items-center gap-1 text-xs font-semibold`}
              >
                <StatusIcon
                  className={`h-3 w-3 ${status.spin ? 'animate-spin' : ''}`}
                />
                {status.label}
              </p>
            </div>
            <div className="rounded-lg bg-gray-50 px-2 py-2">
              <p className="text-[9px] uppercase tracking-wide text-gray-500">
                耗时
              </p>
              <p className="font-mono mt-0.5 text-xs font-semibold text-gray-900">
                {wallSec}
              </p>
            </div>
            <div className="rounded-lg bg-gray-50 px-2 py-2">
              <p className="text-[9px] uppercase tracking-wide text-gray-500">
                叙事
              </p>
              <p className="font-mono mt-0.5 text-xs font-semibold text-gray-900">
                {todo.narrativeLog.length} 条
              </p>
            </div>
          </div>

          {/* Reason */}
          {todo.reasonText && (
            <div className="rounded-lg border border-violet-100 bg-violet-50/40 px-3 py-2">
              <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-600">
                起因
              </p>
              <p className="text-[12px] leading-relaxed text-gray-800">
                {todo.reasonText}
              </p>
            </div>
          )}

          {/* Artifacts */}
          {todo.artifacts.length > 0 && (
            <section className="rounded-lg border border-gray-100 bg-white">
              <div className="border-b border-gray-100 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-700">
                  产出物 · {todo.artifacts.length}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5 p-2">
                {todo.artifacts.map((a, i) => (
                  <span
                    key={`${a.kind}-${i}`}
                    className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200"
                  >
                    <span className="text-emerald-600/70">{a.label}</span>
                    {a.value !== undefined && (
                      <span className="font-mono font-semibold text-emerald-900">
                        {a.value}
                      </span>
                    )}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Narrative timeline —— 主视图，人话 */}
          <section className="rounded-lg border border-gray-100 bg-white">
            <div className="border-b border-gray-100 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-700">
                进展叙事 · {todo.narrativeLog.length} 条
              </p>
            </div>
            {todo.narrativeLog.length === 0 ? (
              <p className="px-3 py-4 text-center text-[11px] text-gray-500">
                {todo.status === 'pending'
                  ? '该任务尚未启动'
                  : '等待叙事事件流入…'}
              </p>
            ) : (
              <ol className="space-y-2 p-3">
                {todo.narrativeLog.map((n, i) => {
                  const tone = TONE_STYLE[n.tone ?? 'info'];
                  const Icon = tone.Icon;
                  return (
                    <li
                      key={`${n.ts}-${i}`}
                      className={`rounded-lg px-3 py-2 ring-1 ${tone.ring} ${tone.bg}`}
                    >
                      <div className="mb-1 flex items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${tone.chip}`}
                        >
                          <Icon className="h-2.5 w-2.5" />
                          {n.tone === 'success'
                            ? '完成'
                            : n.tone === 'warn'
                              ? '注意'
                              : n.tone === 'error'
                                ? '错误'
                                : '进展'}
                        </span>
                        <span className="font-mono text-[10px] text-gray-500">
                          {fmtTime(n.ts)}
                        </span>
                      </div>
                      <p className="text-[12px] leading-relaxed text-gray-800">
                        {n.text}
                      </p>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          {/* 失败原因优先显示 */}
          {todo.status === 'failed' && linkedAgent?.failureMessage && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
              <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-red-700">
                <AlertTriangle className="h-3.5 w-3.5" />
                失败原因（来自 agent lifecycle）
              </p>
              <p className="whitespace-pre-wrap break-words text-[12px] leading-relaxed text-red-800">
                {linkedAgent.failureMessage}
              </p>
            </div>
          )}

          {/* 子任务（如果有 children） */}
          {/* 子任务由父级 board 直接负责渲染 + 缩进，此处不再重复 */}

          {/* 开发者诊断视图：原始 trace (collapsed) */}
          {linkedAgent && linkedAgent.trace.length > 0 && (
            <details className="group rounded-lg border border-gray-200 bg-gray-50/40">
              <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 hover:bg-gray-100">
                <Lightbulb className="h-3.5 w-3.5" />
                开发者诊断视图 · 原始 ReAct trace · {
                  linkedAgent.trace.length
                }{' '}
                条
              </summary>
              <ul className="space-y-1.5 p-2">
                {linkedAgent.trace.map((t, i) => {
                  const dump = (v: unknown): string | null => {
                    if (v == null) return null;
                    if (typeof v === 'string') return v;
                    try {
                      return JSON.stringify(v, null, 2);
                    } catch {
                      return String(v);
                    }
                  };
                  const inputStr = dump(t.input);
                  const outputStr = dump(t.output);
                  return (
                    <li
                      key={`${t.ts}-${i}`}
                      className={`rounded-md px-2 py-1.5 text-[11px] leading-relaxed ${
                        t.kind === 'thought'
                          ? 'bg-amber-50 text-amber-900'
                          : t.kind === 'action'
                            ? 'bg-violet-50 text-violet-900'
                            : t.kind === 'observation'
                              ? t.error
                                ? 'bg-red-50 text-red-900'
                                : 'bg-sky-50 text-sky-900'
                              : t.kind === 'reflection'
                                ? 'bg-purple-50 text-purple-900'
                                : 'bg-red-50 text-red-900'
                      }`}
                    >
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-semibold">{t.kind}</span>
                        {t.toolId && (
                          <span className="font-mono rounded bg-white/60 px-1.5 text-[10px]">
                            {t.toolId}
                          </span>
                        )}
                        {t.latencyMs != null && (
                          <span className="font-mono text-[10px] opacity-60">
                            {t.latencyMs}ms
                          </span>
                        )}
                        {t.tokensUsed != null && t.tokensUsed > 0 && (
                          <span className="font-mono text-[10px] opacity-60">
                            +{t.tokensUsed}tk
                          </span>
                        )}
                      </div>
                      {t.text && (
                        <p className="mt-1 whitespace-pre-wrap break-words">
                          {t.text}
                        </p>
                      )}
                      {inputStr && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-[10px] opacity-70 hover:opacity-100">
                            ▸ input
                          </summary>
                          <pre className="font-mono mt-1 max-h-64 overflow-auto rounded bg-white/60 p-1.5 text-[10px] text-gray-700">
                            {inputStr.length > 6000
                              ? inputStr.slice(0, 6000) + '\n…(已截断)'
                              : inputStr}
                          </pre>
                        </details>
                      )}
                      {outputStr && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-[10px] opacity-70 hover:opacity-100">
                            ▸ output
                          </summary>
                          <pre className="font-mono mt-1 max-h-64 overflow-auto rounded bg-white/60 p-1.5 text-[10px] text-gray-700">
                            {outputStr.length > 6000
                              ? outputStr.slice(0, 6000) + '\n…(已截断)'
                              : outputStr}
                          </pre>
                        </details>
                      )}
                      {t.error && (
                        <p className="mt-1 whitespace-pre-wrap break-words font-medium">
                          ⚠{' '}
                          {t.error.length > 400
                            ? t.error.slice(0, 400) + '…'
                            : t.error}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
