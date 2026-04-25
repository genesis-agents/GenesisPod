'use client';

/**
 * TaskListPanel — 任务列表 tab（完全照搬 TI ResearchTodoList 表格样式）
 *
 * 单一扁平 <table>，列：序号 / 任务 / 负责人 / 模型 / 状态 / 操作
 * 行的左边框颜色按状态着色（in_progress 蓝 / completed 绿 / failed 红 / pending 灰）
 * 点击行展开"任务说明"
 */

import React, { useState } from 'react';
import {
  ListChecks,
  Brain,
  Search,
  GitBranch,
  PenLine,
  Gavel,
  Loader2,
  Circle,
  CheckCircle2,
  X as XIcon,
  ChevronDown,
  ChevronRight,
  Lightbulb,
  Cpu,
} from 'lucide-react';
import type {
  AgentLiveState,
  MissionState,
  StageState,
} from '@/lib/agent-playground/derive';

interface Props {
  mission: MissionState;
  stages: StageState[];
  agents: AgentLiveState[];
  /** 受控选中态：当外层（详情页）需要把任务详情显示在抽屉里时使用 */
  selectedKey?: string | null;
  onSelect?: (
    row: {
      key: string;
      title: string;
      subtitle?: string;
      rationale?: string;
      ownerLabel: string;
      status: 'pending' | 'running' | 'done' | 'failed';
      modelHint: string;
    } | null
  ) => void;
}

type RowStatus = 'pending' | 'running' | 'done' | 'failed';

type TaskRow = {
  key: string;
  index: number;
  type: 'leader' | 'researcher' | 'analyst' | 'writer' | 'reviewer';
  title: string;
  subtitle?: string;
  rationale?: string;
  ownerLabel: string;
  status: RowStatus;
  modelHint: string;
  Icon: typeof Brain;
};

const ROLE_ICON = {
  leader: Brain,
  researcher: Search,
  analyst: GitBranch,
  writer: PenLine,
  reviewer: Gavel,
};

const TYPE_EMOJI: Record<TaskRow['type'], string> = {
  leader: '🧠',
  researcher: '🔍',
  analyst: '🧩',
  writer: '📝',
  reviewer: '⚖️',
};

const STATUS_ROW_STYLES: Record<RowStatus, string> = {
  running: 'bg-blue-50/60 border-l-4 border-l-blue-400 hover:bg-blue-100/60',
  done: 'bg-green-50/40 border-l-4 border-l-green-400 hover:bg-green-100/40',
  failed: 'bg-red-50/40 border-l-4 border-l-red-400 hover:bg-red-100/40',
  pending:
    'bg-white border-l-4 border-l-transparent hover:bg-gray-50 hover:border-l-gray-300',
};

const STATUS_BADGE: Record<
  RowStatus,
  { label: string; cls: string; Icon: typeof Circle; spin?: boolean }
> = {
  done: {
    label: '已完成',
    cls: 'text-green-700 bg-green-50 ring-green-200',
    Icon: CheckCircle2,
  },
  running: {
    label: '进行中',
    cls: 'text-blue-700 bg-blue-50 ring-blue-200',
    Icon: Loader2,
    spin: true,
  },
  failed: {
    label: '失败',
    cls: 'text-red-700 bg-red-50 ring-red-200',
    Icon: XIcon,
  },
  pending: {
    label: '待生成',
    cls: 'text-gray-600 bg-gray-50 ring-gray-200',
    Icon: Circle,
  },
};

function statusOfStage(s: StageState['status']): RowStatus {
  if (s === 'done') return 'done';
  if (s === 'running') return 'running';
  if (s === 'failed') return 'failed';
  return 'pending';
}

export function TaskListPanel({
  mission,
  stages,
  agents,
  selectedKey,
  onSelect,
}: Props) {
  const [internalExpanded, setInternalExpanded] = useState<string | null>(null);
  const expandedKey = onSelect !== undefined ? selectedKey : internalExpanded;
  const dims = mission.dimensions ?? [];
  const stageMap = new Map(stages.map((s) => [s.id, s]));

  const rows: TaskRow[] = [];
  let idx = 1;

  // Leader row
  rows.push({
    key: 'leader',
    index: idx++,
    type: 'leader',
    title: '拆分研究维度',
    subtitle: 'Leader 规划',
    rationale:
      mission.themeSummary ??
      'Leader 分析 topic 后产出主题摘要并拆分多个研究维度。',
    ownerLabel: 'Research Leader',
    status: statusOfStage(stageMap.get('leader')?.status ?? 'pending'),
    modelHint: 'planning',
    Icon: ROLE_ICON.leader,
  });

  // Per-dimension researcher rows
  const researchersStage = stageMap.get('researchers');
  for (const d of dims) {
    const matched = agents.find(
      (a) => a.role === 'researcher' && a.dimension === d.name
    );
    let st: RowStatus;
    if (matched) {
      st =
        matched.phase === 'completed'
          ? 'done'
          : matched.phase === 'failed'
            ? 'failed'
            : matched.phase === 'running'
              ? 'running'
              : 'pending';
    } else {
      st = statusOfStage(researchersStage?.status ?? 'pending');
    }
    rows.push({
      key: `researcher-${d.id ?? d.name}`,
      index: idx++,
      type: 'researcher',
      title: `维度研究：${d.name}`,
      subtitle: matched?.agentId ?? 'Dimension Researcher',
      rationale: d.rationale,
      ownerLabel: matched?.agentId ?? `Researcher #${idx - 1}`,
      status: st,
      modelHint: 'search',
      Icon: ROLE_ICON.researcher,
    });
  }

  for (const role of ['analyst', 'writer', 'reviewer'] as const) {
    const stage = stageMap.get(role);
    rows.push({
      key: role,
      index: idx++,
      type: role,
      title:
        role === 'analyst'
          ? '整合多维度研究'
          : role === 'writer'
            ? '撰写研究报告'
            : '质量评审与共识',
      subtitle:
        role === 'analyst'
          ? 'Analyst 反思校验'
          : role === 'writer'
            ? 'Writer 自愈循环'
            : 'Reviewer 多 Judge 投票',
      rationale:
        role === 'analyst'
          ? 'Analyst 用 Reflexion loop 整合所有维度的发现，由 self+critical verifier 自动 critique → revise，确保结论稳定。'
          : role === 'writer'
            ? 'Writer 用 ReAct loop 把整合后的 insights 写成结构化 Markdown 报告，outputSchema 失败时自动 retry。'
            : 'Reviewer 调用多个 Judge 并行评分，达成共识；< 70 分会触发 Writer 重写。',
      ownerLabel:
        role === 'analyst'
          ? 'Research Analyst'
          : role === 'writer'
            ? 'Report Writer'
            : 'Quality Reviewer',
      status: statusOfStage(stage?.status ?? 'pending'),
      modelHint:
        role === 'analyst'
          ? 'reasoning'
          : role === 'writer'
            ? 'long-form'
            : 'judge',
      Icon: ROLE_ICON[role],
    });
  }

  const counts = rows.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<RowStatus, number>
  );

  return (
    <div className="space-y-3">
      {/* Theme summary banner */}
      {mission.themeSummary && (
        <div className="rounded-2xl border border-violet-100 bg-violet-50/40 px-4 py-3">
          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-600">
            Theme summary
          </p>
          <p className="text-[13px] leading-relaxed text-violet-900">
            {mission.themeSummary}
          </p>
        </div>
      )}

      {/* Header bar */}
      <div className="flex items-center justify-between rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-violet-500" />
          <h3 className="text-sm font-semibold text-gray-900">任务列表</h3>
          <span className="text-xs text-gray-500">· 共 {rows.length} 项</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {(['done', 'running', 'pending', 'failed'] as const).map((k) =>
            counts[k] ? (
              <span key={k} className="flex items-center gap-1 text-gray-500">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    k === 'done'
                      ? 'bg-emerald-500'
                      : k === 'running'
                        ? 'animate-pulse bg-blue-500'
                        : k === 'failed'
                          ? 'bg-red-500'
                          : 'bg-gray-400'
                  }`}
                />
                {STATUS_BADGE[k].label} {counts[k]}
              </span>
            ) : null
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full table-fixed">
          <thead className="border-b border-gray-200 bg-gray-50/80">
            <tr>
              <th className="w-12 whitespace-nowrap px-2 py-2.5 text-center text-xs font-semibold text-gray-600">
                序号
              </th>
              <th className="w-[36%] whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold text-gray-600">
                任务
              </th>
              <th className="w-[20%] whitespace-nowrap px-2 py-2.5 text-left text-xs font-semibold text-gray-600">
                负责人
              </th>
              <th className="w-[16%] whitespace-nowrap px-2 py-2.5 text-left text-xs font-semibold text-gray-600">
                模型
              </th>
              <th className="w-[14%] whitespace-nowrap px-2 py-2.5 text-center text-xs font-semibold text-gray-600">
                状态
              </th>
              <th className="w-12 whitespace-nowrap px-2 py-2.5 text-center text-xs font-semibold text-gray-600">
                操作
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {rows.map((r) => {
              const RoleIcon = r.Icon;
              const isExpanded = expandedKey === r.key;
              const SBadge = STATUS_BADGE[r.status];
              const SIcon = SBadge.Icon;
              return (
                <React.Fragment key={r.key}>
                  <tr
                    onClick={() => {
                      const next = isExpanded ? null : r.key;
                      if (onSelect) {
                        onSelect(
                          next
                            ? {
                                key: r.key,
                                title: r.title,
                                subtitle: r.subtitle,
                                rationale: r.rationale,
                                ownerLabel: r.ownerLabel,
                                status: r.status,
                                modelHint: r.modelHint,
                              }
                            : null
                        );
                      } else {
                        setInternalExpanded(next);
                      }
                    }}
                    className={`cursor-pointer transition-all duration-150 ${STATUS_ROW_STYLES[r.status]}`}
                  >
                    {/* 序号 + 展开 chevron */}
                    <td className="px-2 py-2 text-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const next = isExpanded ? null : r.key;
                          if (onSelect) {
                            onSelect(
                              next
                                ? {
                                    key: r.key,
                                    title: r.title,
                                    subtitle: r.subtitle,
                                    rationale: r.rationale,
                                    ownerLabel: r.ownerLabel,
                                    status: r.status,
                                    modelHint: r.modelHint,
                                  }
                                : null
                            );
                          } else {
                            setInternalExpanded(next);
                          }
                        }}
                        className="inline-flex items-center gap-0.5 text-xs text-gray-400 hover:text-gray-600"
                        title="查看任务说明"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-3 w-3" />
                        ) : (
                          <ChevronRight className="h-3 w-3" />
                        )}
                        <span>{r.index}</span>
                      </button>
                    </td>

                    {/* 任务名称 */}
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="flex-shrink-0 text-sm">
                          {TYPE_EMOJI[r.type]}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div
                            className="truncate text-sm font-medium text-gray-900"
                            title={r.title}
                          >
                            {r.title}
                          </div>
                          {r.subtitle && (
                            <div
                              className="truncate text-xs text-gray-400"
                              title={r.subtitle}
                            >
                              {r.subtitle}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* 负责人 */}
                    <td
                      className="truncate px-2 py-2 text-xs text-gray-600"
                      title={r.ownerLabel}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <RoleIcon className="h-3 w-3 text-gray-400" />
                        <span className="truncate">{r.ownerLabel}</span>
                      </span>
                    </td>

                    {/* 模型 */}
                    <td className="px-2 py-2">
                      <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-600">
                        <Cpu className="h-2.5 w-2.5" />
                        {r.modelHint}
                      </span>
                    </td>

                    {/* 状态 */}
                    <td className="px-2 py-2 text-center">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${SBadge.cls}`}
                      >
                        <SIcon
                          className={`h-3 w-3 ${SBadge.spin ? 'animate-spin' : ''}`}
                        />
                        {SBadge.label}
                      </span>
                    </td>

                    {/* 操作 */}
                    <td className="px-2 py-2 text-center text-gray-300">—</td>
                  </tr>

                  {/* 展开的任务说明行 */}
                  {!onSelect && isExpanded && r.rationale && (
                    <tr className="bg-amber-50/40">
                      <td colSpan={6} className="px-4 py-3">
                        <div className="flex items-start gap-3 text-sm">
                          <Lightbulb className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
                          <div className="flex-1">
                            <div className="mb-1 text-xs font-semibold text-amber-700">
                              任务说明
                            </div>
                            <p className="text-[13px] leading-relaxed text-gray-800">
                              {r.rationale}
                            </p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
