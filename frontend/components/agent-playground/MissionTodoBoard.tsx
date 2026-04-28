'use client';

/**
 * MissionTodoBoard —— 任务列表（参考 Topic Insights ResearchTodoList 风格）
 *
 * 单一扁平表格，每行 = 1 个真实任务（dim 研究 / critic 警示 / reconciler 缺口）。
 * 不展示 system-stage 阶段行（mission 进度由其它组件呈现）。
 * 章节重写聚合到 dim 行的 artifacts，不单独成行。
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
  ScanSearch,
  ShieldAlert,
} from 'lucide-react';
import type {
  MissionTodo,
  MissionTodoStatus,
} from '@/lib/agent-playground/todo-ledger';

interface Props {
  todos: MissionTodo[];
  themeSummary?: string;
  selectedKey?: string | null;
  onSelect?: (todoId: string | null) => void;
  missionFailed?: boolean;
  missionFailedMessage?: string;
}

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
    label: '待启动',
    cls: 'text-gray-600 bg-gray-50 ring-gray-200',
    Icon: Circle,
  },
};

const STATUS_PRIORITY: Record<MissionTodoStatus, number> = {
  in_progress: 0,
  blocked: 1,
  pending: 2,
  done: 3,
  failed: 4,
  cancelled: 5,
};

// 任务类型 emoji / 图标
function taskTypeMeta(td: MissionTodo): { emoji: string; Icon: typeof Brain } {
  if (td.scope === 'dimension') return { emoji: '🔍', Icon: Search };
  if (td.scope === 'chapter') return { emoji: '📝', Icon: PenLine };
  if (td.scope === 'review') {
    if (td.origin === 'critic-blindspot')
      return { emoji: '⚠️', Icon: ShieldAlert };
    if (td.origin === 'reconciler-gap')
      return { emoji: '🧩', Icon: ScanSearch };
    return { emoji: '✅', Icon: Gavel };
  }
  return { emoji: '🧠', Icon: Brain };
}

function roleLabel(role: string): string {
  switch (role) {
    case 'leader':
      return 'Leader';
    case 'researcher':
      return 'Researcher';
    case 'analyst':
      return 'Analyst';
    case 'writer':
      return 'Writer';
    case 'reviewer':
      return 'Reviewer';
    case 'critic':
      return 'Critic';
    case 'reconciler':
      return 'Reconciler';
    case 'mission':
      return 'Mission';
    default:
      return role;
  }
}

function originLabel(td: MissionTodo): string {
  switch (td.origin) {
    case 'leader-plan':
      return 'Leader 拆维度';
    case 'leader-assess-retry':
      return 'Leader 评审重派';
    case 'leader-assess-replace':
      return 'Leader 换 spec';
    case 'leader-assess-extend':
      return 'Leader 追加';
    case 'leader-assess-abort':
      return 'Leader 放弃';
    case 'leader-chat-create':
      return 'Leader Chat 追加';
    case 'self-heal-retry':
      return '自愈重试';
    case 'reviewer-revise':
      return 'Reviewer 重写';
    case 'critic-blindspot':
      return 'Critic 警示';
    case 'reconciler-gap':
      return 'Reconciler 缺口';
    case 'system-stage':
      return '系统阶段';
  }
}

export function MissionTodoBoard({
  todos,
  selectedKey,
  onSelect,
  missionFailed,
  missionFailedMessage,
}: Props) {
  // 仅展示真实工作任务；system-stage 阶段不进入此表格
  const workTodos = todos.filter(
    (td) => td.scope !== 'system' && td.scope !== 'chapter'
  );

  // 排序：按状态优先级 → 按创建时间
  const sorted = [...workTodos].sort((a, b) => {
    const sd = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
    if (sd !== 0) return sd;
    return a.createdAt - b.createdAt;
  });

  const counts = workTodos.reduce(
    (acc, td) => {
      acc[td.status] = (acc[td.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<MissionTodoStatus, number>
  );

  if (workTodos.length === 0) {
    if (missionFailed) {
      return (
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
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-10 text-center">
        <Lightbulb className="mx-auto mb-2 h-7 w-7 text-amber-400" />
        <p className="text-sm font-medium text-gray-700">
          等 Leader 拆完维度，任务会动态出现
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header bar —— 只保留任务列表标题 + 状态计数 */}
      <div className="flex items-center justify-between rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-violet-500" />
          <h3 className="text-sm font-semibold text-gray-900">任务列表</h3>
          <span className="text-xs text-gray-500">
            · 共 {workTodos.length} 项
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

      {/* 单一扁平表格 */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full table-fixed">
          <thead className="border-b border-gray-200 bg-gray-50/80">
            <tr>
              <th className="w-12 px-2 py-2.5 text-center text-xs font-semibold text-gray-600">
                序号
              </th>
              <th className="w-[44%] px-3 py-2.5 text-left text-xs font-semibold text-gray-600">
                任务
              </th>
              <th className="w-[18%] px-2 py-2.5 text-left text-xs font-semibold text-gray-600">
                负责
              </th>
              <th className="w-[14%] px-2 py-2.5 text-left text-xs font-semibold text-gray-600">
                类型
              </th>
              <th className="w-[14%] px-2 py-2.5 text-center text-xs font-semibold text-gray-600">
                状态
              </th>
              <th className="w-[8%] px-2 py-2.5 text-center text-xs font-semibold text-gray-600">
                详情
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {sorted.map((td, idx) => {
              const status = STATUS_BADGE[td.status];
              const SIcon = status.Icon;
              const isSelected = selectedKey === td.id;
              const meta = taskTypeMeta(td);
              const rowCls =
                td.status === 'in_progress'
                  ? 'bg-blue-50/40 border-l-4 border-l-blue-400'
                  : td.status === 'done'
                    ? 'bg-green-50/30 border-l-4 border-l-green-400'
                    : td.status === 'failed'
                      ? 'bg-red-50/30 border-l-4 border-l-red-400'
                      : td.status === 'cancelled'
                        ? 'bg-gray-50/40 border-l-4 border-l-gray-300 opacity-70'
                        : 'bg-white border-l-4 border-l-transparent';
              return (
                <tr
                  key={td.id}
                  onClick={() => onSelect?.(isSelected ? null : td.id)}
                  className={`cursor-pointer transition-all hover:bg-violet-50/30 ${rowCls} ${isSelected ? 'ring-2 ring-violet-400' : ''}`}
                >
                  <td className="px-2 py-2 text-center text-xs text-gray-500">
                    {idx + 1}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-start gap-2">
                      <span className="flex-shrink-0 text-base leading-none">
                        {meta.emoji}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div
                          className="truncate text-sm font-medium text-gray-900"
                          title={td.title}
                        >
                          {td.title}
                        </div>
                        {td.artifacts.length > 0 && (
                          <div className="mt-0.5 flex flex-wrap gap-1">
                            {td.artifacts.map((a, i) => (
                              <span
                                key={`${a.kind}-${i}`}
                                className="inline-flex items-center gap-1 rounded bg-gray-50 px-1.5 py-0.5 text-[10px] text-gray-600 ring-1 ring-gray-200"
                                title={a.label}
                              >
                                <span className="text-gray-400">{a.label}</span>
                                {a.value !== undefined && (
                                  <span className="font-mono font-semibold text-gray-800">
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
                  <td
                    className="truncate px-2 py-2 text-xs text-gray-600"
                    title={`${roleLabel(td.assignee.role)}${td.assignee.agentId ? ' · ' + td.assignee.agentId : ''}`}
                  >
                    {roleLabel(td.assignee.role)}
                  </td>
                  <td className="px-2 py-2 text-[11px] text-gray-500">
                    {originLabel(td)}
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
                  <td className="px-2 py-2 text-center text-[11px] text-violet-600 hover:text-violet-700">
                    查看 →
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
