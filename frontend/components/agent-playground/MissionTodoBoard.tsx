'use client';

/**
 * MissionTodoBoard —— 任务列表（design system v1）
 *
 * 单一扁平表格，每行 = 1 个真实任务（dim 研究 / critic 警示 / reconciler 缺口）。
 * 不展示 system-stage 阶段行。章节重写聚合到 dim 行的 artifacts，不单独成行。
 *
 * 全程使用 playground-ui primitives + design tokens。
 */

import React, { useState } from 'react';
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
  PiggyBank,
  GitBranch,
  Gavel,
  Database,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils/common';
import type {
  MissionTodo,
  MissionTodoStatus,
  MissionTodoAssignee,
} from '@/lib/agent-playground/todo-ledger';
import type { AgentLiveState } from '@/lib/agent-playground/derive';
import { Card, StatusPill, RoleChip } from '@/components/playground-ui';
import { statusToken } from '@/lib/playground-design/tokens';
import {
  AgentInspector,
  type AgentInspectorAgent,
} from '@/components/common/agent-inspector';

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

/** 任务类型图标（按 scope+systemStageId+origin） */
function taskIcon(td: MissionTodo): LucideIcon {
  if (td.systemStageId) {
    switch (td.systemStageId) {
      case 's1-budget':
        return PiggyBank;
      case 's2-leader-plan':
      case 's4-leader-assess':
      case 's10-leader-signoff':
        return Brain;
      case 's3-researchers':
        return Search;
      case 's5-reconciler':
        return ScanSearch;
      case 's6-analyst':
        return GitBranch;
      case 's7-writer-outline':
      case 's8-writer-draft':
        return PenLine;
      case 's9-critic-l4':
        return ShieldAlert;
      case 's11-persist':
        return Database;
    }
  }
  if (td.scope === 'dimension') return Search;
  if (td.scope === 'chapter') return PenLine;
  if (td.scope === 'review') {
    if (td.origin === 'critic-blindspot') return ShieldAlert;
    if (td.origin === 'reconciler-gap') return ScanSearch;
    return Gavel;
  }
  return Brain;
}

/** 起因 badge 文案 */
function originLabel(td: MissionTodo): string {
  // system stage：统一 4 字术语
  if (td.systemStageId) {
    switch (td.systemStageId) {
      case 's1-budget':
        return '预算估算';
      case 's2-leader-plan':
        return '维度规划';
      case 's3-researchers':
        return '并行研究';
      case 's4-leader-assess':
        return '研究初审';
      case 's5-reconciler':
        return '跨维对账';
      case 's6-analyst':
        return '综合分析';
      case 's7-writer-outline':
        return '章节规划';
      case 's8-writer-draft':
        return '撰写报告';
      case 's9-critic-l4':
        return '独立复审';
      case 's10-leader-signoff':
        return '终审签字';
      case 's11-persist':
        return '落库归档';
    }
  }
  switch (td.origin) {
    case 'leader-plan':
      return 'Leader 维度规划';
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

/** assignee role → inspector 资料映射（覆盖 leader/researcher/analyst/writer/reviewer + reconciler/critic/mission） */
const ROLE_INSPECTOR_PROFILE: Record<
  MissionTodoAssignee['role'],
  {
    name: string;
    description: string;
    Icon: LucideIcon;
    loop: string;
    modelHint: string;
    skills: string[];
    tools: string[];
    verifiers?: string[];
  }
> = {
  leader: {
    name: 'Research Leader',
    description: '分析 topic、规划维度、组织 mission 全程编排与签字',
    Icon: Brain,
    loop: 'ReAct',
    modelHint: 'planning · 系统配置 CHAT 模型（BYOK）',
    skills: ['topic-decomposition', 'planning', 'sign-off'],
    tools: [],
  },
  researcher: {
    name: 'Dimension Researcher',
    description: '并行调研单一维度，搜证 / 提取 finding / 输出 dim summary',
    Icon: Search,
    loop: 'ReAct',
    modelHint: 'search · 系统配置 CHAT 模型（BYOK）',
    skills: ['evidence-gathering', 'finding-extraction'],
    tools: ['web-search', 'arxiv-search', 'github-search', 'web-scraper'],
  },
  reconciler: {
    name: 'Reconciler',
    description: '跨维对账：事实表抽取 / 冲突检测 / 重叠检测 / 缺口识别',
    Icon: ScanSearch,
    loop: 'ReAct',
    modelHint: 'reasoning · 系统配置 CHAT 模型（BYOK）',
    skills: ['fact-extraction', 'conflict-detection', 'gap-analysis'],
    tools: [],
  },
  analyst: {
    name: 'Research Analyst',
    description: '整合多维度发现，做交叉验证、矛盾消解、洞察归纳',
    Icon: GitBranch,
    loop: 'Reflexion',
    modelHint: 'reasoning · 系统配置 CHAT 模型（BYOK）',
    skills: ['critical-review', 'synthesis'],
    tools: [],
    verifiers: ['self', 'critical'],
  },
  writer: {
    name: 'Report Writer',
    description: '把 insights 写成结构化 Markdown 报告（章节 outline + draft）',
    Icon: PenLine,
    loop: 'ReAct',
    modelHint: 'long-form · 系统配置 CHAT 模型（BYOK）',
    skills: ['outline', 'draft', 'citation-normalization'],
    tools: [],
  },
  reviewer: {
    name: 'Quality Reviewer',
    description: '调用多个 Judge 并行评分，达成共识；< 70 分触发 Writer 重写',
    Icon: Gavel,
    loop: 'JudgeConsensus',
    modelHint: 'judge × 3 · 系统配置 CHAT 模型（BYOK）',
    skills: ['10-dim-grading', 'critique'],
    tools: [],
  },
  critic: {
    name: 'L4 Independent Critic',
    description: '独立复审：盲点 / 偏见 / 改进建议（不参与生产，避免自我确认）',
    Icon: ShieldAlert,
    loop: 'ReAct',
    modelHint: 'critical · 系统配置 CHAT 模型（BYOK）',
    skills: ['blindspot-detection', 'bias-flagging'],
    tools: [],
  },
  mission: {
    name: 'Mission Orchestrator',
    description: '系统级编排：预算闸 / 状态机 / 持久化 / 取消信号',
    Icon: Sparkles,
    loop: 'system',
    modelHint: '不调用 LLM',
    skills: ['budget-gate', 'state-machine', 'persistence'],
    tools: [],
  },
};

/** 解析 todo 到对应 agent 的实时实例（用于 inspector 实例计数 / recentThought） */
function resolveAssigneeAgents(
  todo: MissionTodo,
  agents: AgentLiveState[]
): AgentLiveState[] {
  if (todo.agentRefId) {
    const exact = agents.filter(
      (a) =>
        a.agentId === todo.agentRefId ||
        a.agentId.startsWith(`${todo.agentRefId}.`)
    );
    if (exact.length > 0) return exact;
  }
  if (todo.assignee.dimensionName) {
    return agents.filter(
      (a) =>
        a.role === 'researcher' && a.dimension === todo.assignee.dimensionName
    );
  }
  if (
    todo.assignee.role === 'leader' ||
    todo.assignee.role === 'analyst' ||
    todo.assignee.role === 'writer' ||
    todo.assignee.role === 'reviewer' ||
    todo.assignee.role === 'researcher'
  ) {
    return agents.filter((a) => a.role === todo.assignee.role);
  }
  return [];
}

function buildAssigneeInspectorPayload(
  todo: MissionTodo,
  agents: AgentLiveState[]
): AgentInspectorAgent {
  const profile = ROLE_INSPECTOR_PROFILE[todo.assignee.role];
  const matched = resolveAssigneeAgents(todo, agents);
  const running = matched.filter((a) => a.phase === 'running').length;
  const done = matched.filter((a) => a.phase === 'completed').length;
  const failed = matched.filter((a) => a.phase === 'failed').length;
  const totalIters = matched.reduce((s, a) => s + (a.iterations ?? 0), 0);

  let recentThought: string | undefined;
  for (let i = matched.length - 1; i >= 0 && !recentThought; i--) {
    const trace = matched[i].trace;
    for (let j = trace.length - 1; j >= 0; j--) {
      if (trace[j].kind === 'thought' && trace[j].text) {
        recentThought = trace[j].text;
        break;
      }
    }
  }

  const modelId = matched.find((a) => a.modelId)?.modelId;
  const dimName = todo.assignee.dimensionName;
  return {
    name: profile.name + (dimName ? ` · ${dimName}` : ''),
    description: profile.description,
    icon: profile.Icon,
    iconClassName: 'bg-violet-50 text-violet-600',
    statusLabel:
      todo.status === 'done'
        ? '已完成'
        : todo.status === 'in_progress'
          ? '进行中'
          : todo.status === 'failed'
            ? '失败'
            : todo.status === 'cancelled'
              ? '已放弃'
              : '待启动',
    statusColorClass:
      todo.status === 'done'
        ? 'text-emerald-600'
        : todo.status === 'in_progress'
          ? 'text-blue-600'
          : todo.status === 'failed'
            ? 'text-red-600'
            : 'text-gray-500',
    totalInstances: matched.length || undefined,
    instanceCounts: matched.length
      ? {
          running,
          completed: done,
          failed,
          iterations: totalIters,
        }
      : undefined,
    config: [
      { label: 'Loop', value: profile.loop },
      { label: '模型', value: modelId ?? profile.modelHint },
      ...(todo.assignee.agentId
        ? [{ label: '实例 ID', value: todo.assignee.agentId }]
        : []),
      ...(dimName ? [{ label: '维度', value: dimName }] : []),
      { label: '技能', chips: profile.skills },
      ...(profile.tools.length > 0
        ? [{ label: '工具', chips: profile.tools }]
        : []),
      ...(profile.verifiers
        ? [{ label: 'Verifier', chips: profile.verifiers }]
        : []),
    ],
    recentThought,
  };
}

export function MissionTodoBoard({
  todos,
  selectedKey,
  onSelect,
  missionFailed,
  missionFailedMessage,
  agents,
}: Props) {
  const [inspectorTodo, setInspectorTodo] = useState<MissionTodo | null>(null);
  // 任务列表包含 system 阶段 + 工作任务（chapter 重写聚合到 dim，不进表）
  const workTodos = todos.filter((td) => td.scope !== 'chapter');

  // ─── 树状排序：parent 紧跟 children，children 缩进显示 ───
  // 1. 索引 parent → children
  const childrenByParent = new Map<string, MissionTodo[]>();
  for (const td of workTodos) {
    if (td.parentId) {
      const arr = childrenByParent.get(td.parentId) ?? [];
      arr.push(td);
      childrenByParent.set(td.parentId, arr);
    }
  }
  // 2. depth 计算（最多 2 层：system → dim → retry）
  const depthOf = (td: MissionTodo): number => {
    if (!td.parentId) return 0;
    const parent = workTodos.find((x) => x.id === td.parentId);
    return parent ? depthOf(parent) + 1 : 1;
  };
  // 3. DFS 展开顺序：root 按 createdAt，每个 root 后紧跟它的递归 children（也按 createdAt）
  const sorted: MissionTodo[] = [];
  const roots = workTodos
    .filter((t) => !t.parentId || !workTodos.some((p) => p.id === t.parentId))
    .sort((a, b) => a.createdAt - b.createdAt);
  const visit = (td: MissionTodo) => {
    sorted.push(td);
    const kids = (childrenByParent.get(td.id) ?? []).sort(
      (a, b) => a.createdAt - b.createdAt
    );
    for (const k of kids) visit(k);
  };
  for (const r of roots) visit(r);

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
                Leader 在维度规划阶段就挂了，没有产生任何子任务。
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
                    <div
                      className="flex items-start gap-2"
                      style={{ paddingLeft: `${depthOf(td) * 18}px` }}
                    >
                      {depthOf(td) > 0 && (
                        <span
                          className="mt-1 inline-block h-3 w-3 flex-shrink-0 border-b-2 border-l-2 border-violet-200"
                          aria-hidden
                        />
                      )}
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
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setInspectorTodo(td);
                      }}
                      className="rounded-md focus:outline-none focus:ring-2 focus:ring-violet-300"
                      title="点击查看 Agent 详情"
                    >
                      <RoleChip
                        role={td.assignee.role}
                        agentId={td.assignee.agentId}
                        size="xs"
                      />
                    </button>
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

      {/* Assignee 点击 → Agent Inspector 弹窗 */}
      {inspectorTodo && (
        <AgentInspector
          open
          onClose={() => setInspectorTodo(null)}
          agent={buildAssigneeInspectorPayload(inspectorTodo, agents ?? [])}
          mode="modal"
        />
      )}
    </div>
  );
}
