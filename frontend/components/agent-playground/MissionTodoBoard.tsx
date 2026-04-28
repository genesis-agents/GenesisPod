'use client';

/**
 * MissionTodoBoard —— Leader 主持下的动态任务全景台账
 *
 * 取代旧 TaskListPanel：
 *   - 顶部：S1-S11 阶段进度条（细的 stepper，告诉用户 mission 当前在哪一段）
 *   - 主体：todoLedger 时间序排列，按 origin 着色 + parentId 缩进
 *   - 点击行 → onSelect(todoId)，由外层 drawer 展示该 todo 的完整故事
 */

import React from 'react';
import {
  Brain,
  Search,
  GitBranch,
  PenLine,
  Gavel,
  Loader2,
  Circle,
  CheckCircle2,
  X as XIcon,
  ListChecks,
  Lightbulb,
  AlertTriangle,
  Sparkles,
  RotateCcw,
  ScanSearch,
  ShieldAlert,
  PiggyBank,
  Database,
  ChevronRight,
} from 'lucide-react';
import type {
  MissionTodo,
  MissionTodoOrigin,
  MissionTodoStatus,
  SystemStageId,
} from '@/lib/agent-playground/todo-ledger';

interface Props {
  todos: MissionTodo[];
  themeSummary?: string;
  selectedKey?: string | null;
  onSelect?: (todoId: string | null) => void;
  /** mission 是否已失败 + 失败消息 —— 让任务列表能自渲染明确的失败兜底 */
  missionFailed?: boolean;
  missionFailedMessage?: string;
}

const STATUS_ROW_STYLES: Record<MissionTodoStatus, string> = {
  in_progress:
    'bg-blue-50/60 border-l-4 border-l-blue-400 hover:bg-blue-100/60',
  done: 'bg-green-50/40 border-l-4 border-l-green-400 hover:bg-green-100/40',
  failed: 'bg-red-50/40 border-l-4 border-l-red-400 hover:bg-red-100/40',
  cancelled:
    'bg-gray-50/60 border-l-4 border-l-gray-300 opacity-70 hover:bg-gray-100/60',
  blocked: 'bg-amber-50/40 border-l-4 border-l-amber-400 hover:bg-amber-100/40',
  pending:
    'bg-white border-l-4 border-l-transparent hover:bg-gray-50 hover:border-l-gray-300',
};

const STATUS_BADGE: Record<
  MissionTodoStatus,
  { label: string; cls: string; Icon: typeof Circle; spin?: boolean }
> = {
  done: {
    label: '已完成',
    cls: 'text-green-700 bg-green-50 ring-green-200',
    Icon: CheckCircle2,
  },
  in_progress: {
    label: '进行中',
    cls: 'text-blue-700 bg-blue-50 ring-blue-200',
    Icon: Loader2,
    spin: true,
  },
  blocked: {
    label: '阻塞',
    cls: 'text-amber-700 bg-amber-50 ring-amber-200',
    Icon: AlertTriangle,
  },
  failed: {
    label: '失败',
    cls: 'text-red-700 bg-red-50 ring-red-200',
    Icon: XIcon,
  },
  cancelled: {
    label: '已放弃',
    cls: 'text-gray-600 bg-gray-100 ring-gray-200',
    Icon: XIcon,
  },
  pending: {
    label: '待生成',
    cls: 'text-gray-600 bg-gray-50 ring-gray-200',
    Icon: Circle,
  },
};

const ORIGIN_META: Record<
  MissionTodoOrigin,
  { label: string; cls: string; Icon: typeof Brain }
> = {
  'leader-plan': {
    label: 'Leader 拆维度',
    cls: 'bg-violet-50 text-violet-700 ring-violet-200',
    Icon: Brain,
  },
  'leader-assess-retry': {
    label: 'Leader 评审重派',
    cls: 'bg-violet-50 text-violet-700 ring-violet-200',
    Icon: RotateCcw,
  },
  'leader-assess-replace': {
    label: 'Leader 换 spec',
    cls: 'bg-violet-50 text-violet-700 ring-violet-200',
    Icon: RotateCcw,
  },
  'leader-assess-extend': {
    label: 'Leader 追加维度',
    cls: 'bg-violet-50 text-violet-700 ring-violet-200',
    Icon: Sparkles,
  },
  'leader-assess-abort': {
    label: 'Leader 放弃维度',
    cls: 'bg-amber-50 text-amber-700 ring-amber-200',
    Icon: XIcon,
  },
  'leader-chat-create': {
    label: 'Leader Chat 追加',
    cls: 'bg-violet-50 text-violet-700 ring-violet-200',
    Icon: Sparkles,
  },
  'self-heal-retry': {
    label: '自愈重试',
    cls: 'bg-orange-50 text-orange-700 ring-orange-200',
    Icon: RotateCcw,
  },
  'reviewer-revise': {
    label: 'Reviewer 重写',
    cls: 'bg-pink-50 text-pink-700 ring-pink-200',
    Icon: PenLine,
  },
  'critic-blindspot': {
    label: 'Critic 警示',
    cls: 'bg-red-50 text-red-700 ring-red-200',
    Icon: ShieldAlert,
  },
  'reconciler-gap': {
    label: 'Reconciler 缺口',
    cls: 'bg-sky-50 text-sky-700 ring-sky-200',
    Icon: ScanSearch,
  },
  'system-stage': {
    label: '系统阶段',
    cls: 'bg-gray-50 text-gray-700 ring-gray-200',
    Icon: ListChecks,
  },
};

const STAGE_ORDER: SystemStageId[] = [
  's1-budget',
  's2-leader-plan',
  's3-researchers',
  's4-leader-assess',
  's5-reconciler',
  's6-analyst',
  's7-writer-outline',
  's8-writer-draft',
  's9-critic-l4',
  's10-leader-signoff',
  's11-persist',
];

const STAGE_META: Record<SystemStageId, { short: string; Icon: typeof Brain }> =
  {
    's1-budget': { short: '预算', Icon: PiggyBank },
    's2-leader-plan': { short: '拆维度', Icon: Brain },
    's3-researchers': { short: '研究', Icon: Search },
    's4-leader-assess': { short: '评审', Icon: Brain },
    's5-reconciler': { short: '对账', Icon: ScanSearch },
    's6-analyst': { short: '综合', Icon: GitBranch },
    's7-writer-outline': { short: '大纲', Icon: PenLine },
    's8-writer-draft': { short: '撰写', Icon: PenLine },
    's9-critic-l4': { short: '元审', Icon: ShieldAlert },
    's10-leader-signoff': { short: '签字', Icon: Gavel },
    's11-persist': { short: '落库', Icon: Database },
  };

function renderRoleIcon(role: string, className: string) {
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
                : ListChecks;
  return <Icon className={className} />;
}

export function MissionTodoBoard({
  todos,
  themeSummary,
  selectedKey,
  onSelect,
  missionFailed,
  missionFailedMessage,
}: Props) {
  // 上方阶段进度条 —— 从 todos 中找 system 类 todo 的状态
  const systemTodoMap = new Map<SystemStageId, MissionTodo>();
  for (const td of todos) {
    if (td.systemStageId) systemTodoMap.set(td.systemStageId, td);
  }

  // 主体：把非系统 todos 提取（dim / chapter / review）+ 系统 todos 时间穿插
  // 但用户更想看"任务流"，所以策略：先按 createdAt 排序所有 todos，但 system todos
  // 单独一行用紧凑节点呈现（在阶段进度条里），主体只展示 work todos（dim / chapter / review）。
  const workTodos = todos.filter((td) => td.scope !== 'system');

  // 缩进映射：parentId 链
  const childrenOf = new Map<string, MissionTodo[]>();
  const rootTodos: MissionTodo[] = [];
  for (const td of workTodos) {
    if (td.parentId && workTodos.some((p) => p.id === td.parentId)) {
      const arr = childrenOf.get(td.parentId) ?? [];
      arr.push(td);
      childrenOf.set(td.parentId, arr);
    } else {
      rootTodos.push(td);
    }
  }
  rootTodos.sort((a, b) => a.createdAt - b.createdAt);

  const counts = workTodos.reduce(
    (acc, td) => {
      acc[td.status] = (acc[td.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<MissionTodoStatus, number>
  );

  const renderRow = (td: MissionTodo, depth: number) => {
    const status = STATUS_BADGE[td.status];
    const SIcon = status.Icon;
    const origin = ORIGIN_META[td.origin];
    const OriginIcon = origin.Icon;
    const isSelected = selectedKey === td.id;
    const children = childrenOf.get(td.id) ?? [];
    return (
      <React.Fragment key={td.id}>
        <tr
          onClick={() => onSelect?.(isSelected ? null : td.id)}
          className={`cursor-pointer transition-all duration-150 ${STATUS_ROW_STYLES[td.status]} ${isSelected ? 'ring-2 ring-violet-400' : ''}`}
        >
          <td className="px-3 py-2">
            <div
              className="flex items-start gap-2"
              style={{ paddingLeft: `${depth * 18}px` }}
            >
              {depth > 0 && (
                <ChevronRight className="mt-0.5 h-3 w-3 flex-shrink-0 text-gray-300" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-semibold ring-1 ${origin.cls}`}
                    title={origin.label}
                  >
                    <OriginIcon className="h-2.5 w-2.5" />
                    {origin.label}
                  </span>
                  <span
                    className="truncate text-sm font-medium text-gray-900"
                    title={td.title}
                  >
                    {td.title}
                  </span>
                </div>
                {td.reasonText && (
                  <p
                    className="mt-0.5 line-clamp-1 text-[11px] text-gray-500"
                    title={td.reasonText}
                  >
                    {td.reasonText}
                  </p>
                )}
                {td.artifacts.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {td.artifacts.map((a, i) => (
                      <span
                        key={`${a.kind}-${i}`}
                        className="inline-flex items-center gap-1 rounded bg-white px-1.5 py-0.5 text-[10px] text-gray-700 ring-1 ring-gray-200"
                      >
                        <span className="text-gray-500">{a.label}</span>
                        {a.value !== undefined && (
                          <span className="font-mono font-semibold text-gray-900">
                            {a.value}
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </td>
          <td className="px-2 py-2 text-xs text-gray-600">
            <span className="inline-flex items-center gap-1.5">
              {renderRoleIcon(td.assignee.role, 'h-3 w-3 text-gray-400')}
              <span className="truncate">
                {td.assignee.role}
                {td.assignee.agentId ? ` · ${td.assignee.agentId}` : ''}
              </span>
            </span>
          </td>
          <td className="px-2 py-2 text-center">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${status.cls}`}
            >
              <SIcon
                className={`h-3 w-3 ${status.spin ? 'animate-spin' : ''}`}
              />
              {status.label}
            </span>
          </td>
        </tr>
        {children
          .sort((a, b) => a.createdAt - b.createdAt)
          .map((child) => renderRow(child, depth + 1))}
      </React.Fragment>
    );
  };

  return (
    <div className="space-y-3">
      {themeSummary && (
        <div className="rounded-2xl border border-violet-100 bg-violet-50/40 px-4 py-3">
          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-600">
            Theme summary
          </p>
          <p className="text-[13px] leading-relaxed text-violet-900">
            {themeSummary}
          </p>
        </div>
      )}

      {/* Mission Phase Progress —— S1-S11 阶段进度条 */}
      <div className="rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
        <div className="mb-2 flex items-baseline justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-500" />
            <h3 className="text-sm font-semibold text-gray-900">
              Mission 进度
            </h3>
            <span className="text-xs text-gray-500">
              · {STAGE_ORDER.length} 个阶段
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {STAGE_ORDER.map((sid, i) => {
            const td = systemTodoMap.get(sid);
            const status = td?.status ?? 'pending';
            const meta = STAGE_META[sid];
            const Icon = meta.Icon;
            const tone =
              status === 'done'
                ? 'bg-emerald-100 text-emerald-700 ring-emerald-300'
                : status === 'in_progress'
                  ? 'bg-blue-100 text-blue-700 ring-blue-300 animate-pulse'
                  : status === 'failed'
                    ? 'bg-red-100 text-red-700 ring-red-300'
                    : status === 'cancelled'
                      ? 'bg-gray-100 text-gray-500 ring-gray-200'
                      : 'bg-gray-50 text-gray-400 ring-gray-200';
            return (
              <React.Fragment key={sid}>
                <button
                  type="button"
                  disabled={!td}
                  onClick={() => td && onSelect?.(td.id)}
                  className={`flex shrink-0 flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 ring-1 transition-all ${tone} ${td ? 'hover:ring-2' : ''}`}
                  title={td?.title ?? sid}
                >
                  <div className="flex items-center gap-1">
                    <Icon className="h-3 w-3" />
                    <span className="text-[10px] font-medium">
                      {meta.short}
                    </span>
                  </div>
                  <span className="text-[9px]">
                    {status === 'done'
                      ? '✓'
                      : status === 'in_progress'
                        ? '⟳'
                        : status === 'failed'
                          ? '✗'
                          : '○'}
                  </span>
                </button>
                {i < STAGE_ORDER.length - 1 && (
                  <span className="font-mono text-[10px] text-gray-300">→</span>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Header bar */}
      <div className="flex items-center justify-between rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-violet-500" />
          <h3 className="text-sm font-semibold text-gray-900">任务列表</h3>
          <span className="text-xs text-gray-500">
            · {workTodos.length} 项任务
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {(
            ['done', 'in_progress', 'pending', 'failed', 'cancelled'] as const
          ).map((k) =>
            counts[k] ? (
              <span key={k} className="flex items-center gap-1 text-gray-500">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    k === 'done'
                      ? 'bg-emerald-500'
                      : k === 'in_progress'
                        ? 'animate-pulse bg-blue-500'
                        : k === 'failed'
                          ? 'bg-red-500'
                          : k === 'cancelled'
                            ? 'bg-gray-400'
                            : 'bg-gray-300'
                  }`}
                />
                {STATUS_BADGE[k].label} {counts[k]}
              </span>
            ) : null
          )}
        </div>
      </div>

      {/* Work todos table */}
      {workTodos.length === 0 ? (
        missionFailed ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-700">
                  Mission 失败 · 任务列表为空
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-red-800">
                  Leader 拆维度阶段就挂了，没有产生任何子任务。
                </p>
                {missionFailedMessage && (
                  <pre className="font-mono mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-white/70 p-2 text-[11px] leading-relaxed text-red-900 ring-1 ring-red-200">
                    {missionFailedMessage}
                  </pre>
                )}
                <p className="mt-2 text-[11px] text-red-700/80">
                  点击上方进度条「拆维度」格子查看 Leader 诊断详情，或在 Mission
                  列表页 Rerun 重试。
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-10 text-center">
            <Lightbulb className="mx-auto mb-2 h-7 w-7 text-amber-400" />
            <p className="text-sm font-medium text-gray-700">
              等 Leader 拆完维度，任务会动态出现
            </p>
            <p className="mt-1 text-[11px] text-gray-500">
              Leader / Reviewer / Critic / Reconciler
              的每个决策都会向任务列表追加新条目
            </p>
          </div>
        )
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <table className="w-full table-fixed">
            <thead className="border-b border-gray-200 bg-gray-50/80">
              <tr>
                <th className="w-[58%] px-3 py-2.5 text-left text-xs font-semibold text-gray-600">
                  任务 · 起因 · 产出
                </th>
                <th className="w-[24%] px-2 py-2.5 text-left text-xs font-semibold text-gray-600">
                  执行者
                </th>
                <th className="w-[18%] px-2 py-2.5 text-center text-xs font-semibold text-gray-600">
                  状态
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {rootTodos.map((td) => renderRow(td, 0))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
