'use client';

/**
 * MissionTodoBoard —— 任务列表（design system v1）
 *
 * 单一扁平表格，每行 = 1 个真实任务（dim 研究 / critic 警示 / reconciler 缺口）。
 * 不展示 system-stage 阶段行。章节重写聚合到 dim 行的 artifacts，不单独成行。
 *
 * 全程使用 playground-ui primitives + design tokens。
 */

import React from 'react';
import {
  ListChecks,
  Lightbulb,
  AlertTriangle,
  Search,
  PenLine,
  ShieldAlert,
  ScanSearch,
  Brain,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils/common';
import type {
  MissionTodo,
  MissionTodoStatus,
} from '@/lib/agent-playground/todo-ledger';
import type { AgentLiveState } from '@/lib/agent-playground/derive';
import { Card, StatusPill, RoleChip } from '@/components/playground-ui';
import { statusToken } from '@/lib/playground-design/tokens';

interface Props {
  todos: MissionTodo[];
  themeSummary?: string;
  selectedKey?: string | null;
  onSelect?: (todoId: string | null) => void;
  missionFailed?: boolean;
  missionFailedMessage?: string;
  agents?: AgentLiveState[];
}

/** 解析 todo 到对应 agent 的 modelId */
function resolveModel(
  todo: MissionTodo,
  agents: AgentLiveState[]
): string | undefined {
  const ref = todo.agentRefId;
  if (ref) {
    const a =
      agents.find((x) => x.agentId === ref) ??
      agents.find((x) => x.agentId.startsWith(`${ref}.`));
    if (a?.modelId) return a.modelId;
  }
  if (todo.assignee.dimensionName) {
    const a = agents.find(
      (x) =>
        x.role === 'researcher' && x.dimension === todo.assignee.dimensionName
    );
    if (a?.modelId) return a.modelId;
  }
  const byRole = agents.find((x) => x.role === todo.assignee.role);
  return byRole?.modelId;
}

/** todo.status 映射到 StatusPill 的 status key */
function statusKey(s: MissionTodoStatus) {
  return s === 'done'
    ? 'done'
    : s === 'in_progress'
      ? 'running'
      : s === 'failed'
        ? 'failed'
        : s === 'cancelled'
          ? 'cancelled'
          : s === 'blocked'
            ? 'blocked'
            : 'pending';
}

/** 排序：进行中 > 待启动 > 已完成 > 失败 > 已放弃 */
const STATUS_PRIORITY: Record<MissionTodoStatus, number> = {
  in_progress: 0,
  pending: 1,
  blocked: 2,
  done: 3,
  failed: 4,
  cancelled: 5,
};

/** 任务类型图标（按 scope+origin） */
function taskIcon(td: MissionTodo): LucideIcon {
  if (td.scope === 'dimension') return Search;
  if (td.scope === 'chapter') return PenLine;
  if (td.scope === 'review') {
    if (td.origin === 'critic-blindspot') return ShieldAlert;
    if (td.origin === 'reconciler-gap') return ScanSearch;
    return ShieldAlert;
  }
  return Brain;
}

/** 起因 badge 文案 */
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
  agents,
}: Props) {
  // 仅展示真实工作任务；system / chapter 不进入此表格
  const workTodos = todos.filter(
    (td) => td.scope !== 'system' && td.scope !== 'chapter'
  );

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

  // ─── Empty state ───
  if (workTodos.length === 0) {
    if (missionFailed) {
      return (
        <Card className="bg-red-50/40" bordered>
          <div className="flex items-start gap-3 p-4">
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
        </Card>
      );
    }
    return (
      <Card className="px-4 py-10 text-center" bordered>
        <Lightbulb className="mx-auto mb-2 h-7 w-7 text-amber-400" />
        <p className="text-sm font-medium text-gray-700">
          等 Leader 拆完维度，任务会动态出现
        </p>
      </Card>
    );
  }

  // ─── Header bar ───
  const Header = (
    <Card className="flex items-center justify-between px-4 py-2.5" bordered>
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
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  k === 'done' && 'bg-emerald-500',
                  k === 'in_progress' && 'animate-pulse bg-blue-500',
                  k === 'failed' && 'bg-red-500',
                  k === 'cancelled' && 'bg-gray-400',
                  k === 'pending' && 'bg-gray-300'
                )}
              />
              {statusToken[statusKey(k)].label} {counts[k]}
            </span>
          ) : null
        )}
      </div>
    </Card>
  );

  // ─── Table ───
  return (
    <div className="space-y-3">
      {Header}
      <Card className="overflow-hidden" bordered>
        <table className="w-full table-fixed">
          <thead className="border-b border-gray-200 bg-gray-50/80">
            <tr>
              <th className="w-10 px-2 py-2.5 text-center text-xs font-semibold text-gray-600">
                #
              </th>
              <th className="w-[42%] px-3 py-2.5 text-left text-xs font-semibold text-gray-600">
                任务名称
              </th>
              <th className="w-[18%] px-2 py-2.5 text-left text-xs font-semibold text-gray-600">
                负责人
              </th>
              <th className="w-[14%] px-2 py-2.5 text-left text-xs font-semibold text-gray-600">
                模型
              </th>
              <th className="w-[14%] px-2 py-2.5 text-center text-xs font-semibold text-gray-600">
                状态
              </th>
              <th className="w-[8%] px-2 py-2.5 text-center text-xs font-semibold text-gray-600">
                操作
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {sorted.map((td, idx) => {
              const isSelected = selectedKey === td.id;
              const Icon = taskIcon(td);
              const sk = statusKey(td.status);
              const rowCls = cn(
                'cursor-pointer transition-all hover:bg-violet-50/30',
                td.status === 'in_progress' &&
                  'bg-blue-50/40 border-l-4 border-l-blue-400',
                td.status === 'done' && 'border-l-4 border-l-emerald-400',
                td.status === 'failed' &&
                  'bg-red-50/30 border-l-4 border-l-red-400',
                td.status === 'cancelled' &&
                  'bg-gray-50/40 border-l-4 border-l-gray-300 opacity-70',
                td.status === 'pending' && 'border-l-4 border-l-transparent',
                td.status === 'blocked' &&
                  'bg-amber-50/30 border-l-4 border-l-amber-400',
                isSelected && 'ring-2 ring-violet-400'
              );
              const modelId = agents ? resolveModel(td, agents) : undefined;
              return (
                <tr
                  key={td.id}
                  onClick={() => onSelect?.(isSelected ? null : td.id)}
                  className={rowCls}
                >
                  <td className="px-2 py-2 text-center text-xs text-gray-500">
                    {idx + 1}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-start gap-2">
                      <Icon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
                      <div className="min-w-0 flex-1">
                        <div
                          className="line-clamp-1 text-sm font-medium text-gray-900"
                          title={td.title}
                        >
                          {td.title}
                        </div>
                        <p
                          className="line-clamp-1 text-[11px] text-gray-500"
                          title={td.reasonText || originLabel(td)}
                        >
                          {originLabel(td)}
                          {td.reasonText && ` · ${td.reasonText}`}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <RoleChip
                      role={td.assignee.role}
                      agentId={td.assignee.agentId}
                      size="xs"
                    />
                  </td>
                  <td className="px-2 py-2">
                    {modelId ? (
                      <span
                        title={modelId}
                        className="font-mono inline-flex items-center gap-1 rounded bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-700 ring-1 ring-gray-200"
                      >
                        {modelId.length > 14
                          ? modelId.slice(0, 14) + '…'
                          : modelId}
                      </span>
                    ) : (
                      <span className="text-[10px] text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-center">
                    <StatusPill status={sk} size="sm" />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <span className="inline-flex items-center gap-0.5 text-[11px] text-violet-600 hover:text-violet-700">
                      详情 <ChevronRight className="h-3 w-3" />
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
