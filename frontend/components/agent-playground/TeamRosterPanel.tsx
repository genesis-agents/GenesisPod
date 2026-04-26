'use client';

/**
 * TeamRosterPanel — SVG team-topology visualization
 *
 * 完全照搬 Topic Insights 的 TopicTeamPanel 视觉：
 *  - Section header (uppercase tracking-wide)
 *  - SVG TeamTopologyCanvas with avatar nodes + bezier connections
 *  - Per-role detail card (live thoughts, tasks, latency)
 *  - Bottom progress bar + consensus quality
 */

import { useMemo, useState } from 'react';
import {
  Brain,
  Search,
  GitBranch,
  PenLine,
  Gavel,
  CheckCircle2,
  Loader2,
  Lightbulb,
} from 'lucide-react';
import {
  TeamTopologyCanvas,
  type TeamTopologyNode,
  type TeamTopologyConnection,
  type TeamNodeStatus,
} from '@/components/common/team-topology';
import {
  AgentInspector,
  type AgentInspectorAgent,
} from '@/components/common/agent-inspector';
import type {
  AgentLiveState,
  AgentRole,
  StageState,
  StageId,
} from '@/lib/agent-playground/derive';

const ROLE_ROW: {
  role: AgentRole;
  stage: StageId;
  label: string;
  rowIdx: number;
}[] = [
  // 纯垂直流水线：每个角色独占一行，避免横向连线交叉
  { role: 'leader', stage: 'leader', label: 'Leader', rowIdx: 0 },
  { role: 'researcher', stage: 'researchers', label: 'Researcher', rowIdx: 1 },
  { role: 'analyst', stage: 'analyst', label: 'Analyst', rowIdx: 2 },
  { role: 'writer', stage: 'writer', label: 'Writer', rowIdx: 3 },
  { role: 'reviewer', stage: 'reviewer', label: 'Reviewer', rowIdx: 4 },
];

const ROLE_COLOR_KEY: Record<AgentRole, string> = {
  leader: 'purple',
  researcher: 'blue',
  analyst: 'amber',
  writer: 'rose',
  reviewer: 'emerald',
};

const ROLE_AVATAR: Record<AgentRole, string> = {
  leader: 'leader',
  researcher: 'researcher',
  analyst: 'analyst',
  writer: 'writer',
  reviewer: 'reviewer',
};

const ROLE_ICON: Record<AgentRole, typeof Brain> = {
  leader: Brain,
  researcher: Search,
  analyst: GitBranch,
  writer: PenLine,
  reviewer: Gavel,
};

function stageStatusToNodeStatus(s: StageState['status']): TeamNodeStatus {
  if (s === 'running') return 'working';
  if (s === 'done') return 'completed';
  if (s === 'failed') return 'failed';
  return 'idle';
}

const CollapseIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 9V5m0 0H5m4 0L4 10m11-1V5m0 0h4m-4 0l5 5M9 15v4m0 0H5m4 0l-5-5m11 5l5-5m-5 5v-4m0 4h4"
    />
  </svg>
);

interface Props {
  agents: AgentLiveState[];
  stages: StageState[];
  finalScore?: number;
  topic?: string;
  /** mission 维度（从 leader stage 输出，用于左下任务列表） */
  dimensions?: { id?: string; name: string; rationale?: string }[];
  /** mission 当前状态 — 决定按钮显示 */
  missionStatus?: 'running' | 'completed' | 'failed' | 'idle';
  onCollapse?: () => void;
  /** 点击 Leader 节点时触发（详情页用来打开 LeaderChatModal） */
  onLeaderClick?: () => void;
  /** 重新运行（用相同配置开新 mission） */
  onRerun?: () => void;
  /** 用相同 topic 进入新建表单（编辑配置后再跑） */
  onUpdate?: () => void;
  /** 取消运行中的 mission（暂未实现 → undefined） */
  onCancel?: () => void;
}

export function TeamRosterPanel({
  agents,
  stages,
  finalScore,
  dimensions,
  missionStatus = 'idle',
  onCollapse,
  onLeaderClick,
  onRerun,
  onUpdate,
  onCancel,
}: Props) {
  const stageMap = useMemo(
    () => new Map(stages.map((s) => [s.id, s])),
    [stages]
  );
  const [selectedRole, setSelectedRole] = useState<AgentRole | null>(null);

  const { nodes, connections, rows } = useMemo(() => {
    const nodes: TeamTopologyNode[] = [];
    const rowMap: Record<number, string[]> = {
      0: [],
      1: [],
      2: [],
      3: [],
      4: [],
    };

    // researcher 的并行实例 ids（用于 fan-out / fan-in 连线）
    const researcherIds: string[] = [];

    for (const r of ROLE_ROW) {
      const stage = stageMap.get(r.stage);
      const roleAgents = agents.filter((a) => a.role === r.role);
      const status = stageStatusToNodeStatus(stage?.status ?? 'pending');

      // ── Researcher 特殊处理 ──
      // 优先按 dimensions 数量画节点（包括尚未启动的——idle 占位），
      // 这样 SVG 节点数 = 表格里 dimension 数，永远一致。
      // 没有 dimensions（Leader 还没拆完）才退化用 roleAgents。
      if (r.role === 'researcher') {
        const targets =
          dimensions && dimensions.length > 0
            ? dimensions.map((d, idx) => ({
                idx,
                dimensionName: d.name,
                agent: agents.find(
                  (a) => a.role === 'researcher' && a.dimension === d.name
                ),
              }))
            : roleAgents.map((a, idx) => ({
                idx,
                dimensionName: a.dimension,
                agent: a,
              }));

        if (targets.length === 0) {
          // 完全没启动也没拆完 → 仍画一个 idle 占位节点保留连线
          nodes.push({
            id: 'researcher',
            name: 'Researcher',
            role: 'researcher',
            icon: ROLE_ICON.researcher,
            status: 'idle',
            colorKey: ROLE_COLOR_KEY.researcher,
            avatarRole: ROLE_AVATAR.researcher,
          });
          researcherIds.push('researcher');
          rowMap[r.rowIdx].push('researcher');
          continue;
        }

        targets.forEach(({ idx, dimensionName, agent }) => {
          const aStatus: TeamNodeStatus = agent
            ? agent.phase === 'running'
              ? 'working'
              : agent.phase === 'completed'
                ? 'completed'
                : agent.phase === 'failed'
                  ? 'failed'
                  : 'idle'
            : 'idle';
          const id = `researcher#${idx + 1}`;
          const label = dimensionName
            ? dimensionName.length > 6
              ? dimensionName.slice(0, 6) + '…'
              : dimensionName
            : `R${idx + 1}`;
          nodes.push({
            id,
            name: label,
            role: 'researcher',
            icon: ROLE_ICON.researcher,
            status: aStatus,
            statusLabel:
              aStatus === 'working'
                ? '调研中'
                : aStatus === 'completed'
                  ? '完成'
                  : aStatus === 'failed'
                    ? '失败'
                    : '待启动',
            colorKey: ROLE_COLOR_KEY.researcher,
            avatarRole: ROLE_AVATAR.researcher,
          });
          researcherIds.push(id);
          rowMap[r.rowIdx].push(id);
        });
        continue;
      }

      // ── 其他角色：单节点 ──
      const completed = roleAgents.filter(
        (a) => a.phase === 'completed'
      ).length;
      nodes.push({
        id: r.role,
        name: r.label,
        role: r.role,
        icon: ROLE_ICON[r.role],
        status,
        statusLabel:
          status === 'working'
            ? '运行中'
            : status === 'completed'
              ? '完成'
              : undefined,
        colorKey: ROLE_COLOR_KEY[r.role],
        isLeader: r.role === 'leader',
        avatarRole: ROLE_AVATAR[r.role],
        taskProgress:
          roleAgents.length > 0
            ? { completed, total: roleAgents.length }
            : undefined,
      });
      rowMap[r.rowIdx].push(r.role);
    }

    // ── Connections: fan-out from leader to all researchers, fan-in to analyst ──
    const ids = researcherIds.length > 0 ? researcherIds : ['researcher'];
    const connections: TeamTopologyConnection[] = [
      ...ids.map((rid) => ({ from: 'leader', to: rid })),
      ...ids.map((rid) => ({ from: rid, to: 'analyst' })),
      { from: 'analyst', to: 'writer' },
      { from: 'writer', to: 'reviewer' },
    ];

    return {
      nodes,
      connections,
      rows: [rowMap[0], rowMap[1], rowMap[2], rowMap[3], rowMap[4]],
    };
  }, [agents, stageMap]);

  const completedStages = stages.filter((s) => s.status === 'done').length;
  const totalStages = stages.length;
  const overallPct = Math.round((completedStages / totalStages) * 100);

  void selectedRole; // selection-driven detail rendered inside TeamTopologyCanvas

  return (
    <div className="flex h-full flex-col">
      {/* Section header */}
      <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Research Team
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{agents.length} agents</span>
          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              title="Collapse panel"
            >
              <CollapseIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* SVG team topology canvas */}
      <div className="border-b border-gray-100 px-3 py-3">
        <TeamTopologyCanvas
          nodes={nodes}
          rows={rows}
          connections={connections}
          heightClass="h-[300px]"
          viewBoxHeight={280}
          rowYPositions={[35, 95, 155, 215, 270]}
          patternId="agent-playground"
          renderDetail={(node, onClose) => {
            const role = node.role as AgentRole;
            const close = () => {
              onClose();
              setSelectedRole(null);
            };
            const agentData = buildAgentInspectorPayload(
              role,
              agents.filter((a) => a.role === role),
              stageMap.get(
                ROLE_ROW.find((r) => r.role === role)?.stage ?? 'leader'
              )
            );
            return (
              <AgentInspector
                open
                onClose={close}
                mode="modal"
                agent={agentData}
                onChat={
                  role === 'leader' && onLeaderClick
                    ? () => {
                        close();
                        onLeaderClick();
                      }
                    : undefined
                }
                chatLabel="与 Leader 对话"
              />
            );
          }}
          renderTooltip={(node) => (
            <div className="text-xs">
              <div className="font-semibold text-gray-800">{node.name}</div>
              <div className="mt-0.5 text-gray-500">
                {node.taskProgress
                  ? `${node.taskProgress.completed} / ${node.taskProgress.total} done`
                  : (node.statusLabel ?? 'Idle')}
              </div>
            </div>
          )}
        />
      </div>

      {/* Roster body — list of role rows with last-thought */}
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-1.5 p-3">
          {ROLE_ROW.map(({ role, stage, label }) => {
            const Icon = ROLE_ICON[role];
            const st = stageMap.get(stage);
            const roleAgents = agents.filter((a) => a.role === role);
            const lastThought = (() => {
              for (let i = roleAgents.length - 1; i >= 0; i--) {
                const trace = roleAgents[i].trace;
                for (let j = trace.length - 1; j >= 0; j--) {
                  if (trace[j].kind === 'thought' && trace[j].text) {
                    return trace[j].text;
                  }
                }
              }
              return null;
            })();
            const isActive = st?.status === 'running';
            const isDone = st?.status === 'done';

            return (
              <button
                key={role}
                type="button"
                onClick={() => setSelectedRole(role)}
                className="flex w-full items-start gap-2 rounded-lg border border-gray-100 bg-white px-2.5 py-2 text-left transition-all hover:border-violet-200 hover:bg-violet-50/30"
              >
                <span
                  className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                    isActive
                      ? 'bg-violet-100 text-violet-600'
                      : isDone
                        ? 'bg-emerald-100 text-emerald-600'
                        : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {isActive ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : isDone ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <Icon className="h-3.5 w-3.5" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[12px] font-semibold text-gray-900">
                      {label}
                    </span>
                    {roleAgents.length > 0 && (
                      <span className="text-[10px] text-gray-400">
                        {
                          roleAgents.filter((a) => a.phase === 'completed')
                            .length
                        }{' '}
                        / {roleAgents.length}
                      </span>
                    )}
                  </div>
                  {lastThought ? (
                    <p className="mt-0.5 line-clamp-1 text-[11px] text-gray-600">
                      <Lightbulb className="mr-0.5 inline h-2.5 w-2.5 text-amber-500" />
                      {lastThought}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-[11px] italic text-gray-400">
                      {st?.detail ?? (isDone ? 'Completed' : 'Idle')}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom progress bar */}
      <div className="border-t border-gray-100 bg-gray-50/50 px-3 py-2.5">
        <div className="mb-1.5 flex items-center justify-between text-[11px]">
          <span className="font-medium text-gray-700">Mission progress</span>
          <span className="font-mono text-gray-500">
            {completedStages} / {totalStages}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet-500 to-purple-600 transition-all"
            style={{ width: `${overallPct}%` }}
          />
        </div>
        {finalScore != null && (
          <div className="mt-2 flex items-center justify-between text-[11px]">
            <span className="font-medium text-gray-700">Consensus quality</span>
            <span
              className={`font-mono font-semibold ${
                finalScore >= 80
                  ? 'text-emerald-600'
                  : finalScore >= 60
                    ? 'text-amber-600'
                    : 'text-red-600'
              }`}
            >
              {finalScore} / 100
            </span>
          </div>
        )}

        {/* 显示当前 mission 关联的 dimensions 数 */}
        {dimensions && dimensions.length > 0 && (
          <div className="mt-2 flex items-center justify-between text-[11px]">
            <span className="font-medium text-gray-700">研究维度</span>
            <span className="font-mono text-gray-500">
              {dimensions.length} 个
            </span>
          </div>
        )}

        {/* 操作按钮：开始 / 更新 / 取消 */}
        {(onRerun || onUpdate || onCancel) && (
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {onRerun && (
              <button
                type="button"
                onClick={onRerun}
                disabled={missionStatus === 'running'}
                className="rounded-lg bg-gradient-to-r from-emerald-500 to-green-600 px-2 py-1.5 text-[11px] font-medium text-white shadow-sm transition-all hover:shadow-md disabled:cursor-not-allowed disabled:opacity-40"
                title="用相同配置启动一个新 mission"
              >
                {missionStatus === 'running' ? '运行中' : '开始'}
              </button>
            )}
            {onUpdate && (
              <button
                type="button"
                onClick={onUpdate}
                className="rounded-lg bg-gradient-to-r from-blue-500 to-violet-600 px-2 py-1.5 text-[11px] font-medium text-white shadow-sm transition-all hover:shadow-md"
                title="编辑 topic / depth / language 后重新启动"
              >
                更新
              </button>
            )}
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                disabled={missionStatus !== 'running'}
                className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-[11px] font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                title={
                  missionStatus === 'running'
                    ? '取消运行中的 mission'
                    : '只有运行中的 mission 可以取消'
                }
              >
                取消
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** 每个角色的能力 profile（来自 backend 各 .agent.ts 的定义） */
const ROLE_PROFILE: Record<
  AgentRole,
  {
    displayName: string;
    description: string;
    loop: string;
    modelHint: string;
    skills: string[];
    tools: string[];
    verifiers?: string[];
  }
> = {
  leader: {
    displayName: 'Research Leader',
    description: '分析 topic 并拆分研究维度，规划 mission 整体执行链路',
    loop: 'ReAct',
    modelHint: 'planning · 系统配置 CHAT 模型（BYOK）',
    skills: ['topic-decomposition', 'planning'],
    tools: [],
  },
  researcher: {
    displayName: 'Dimension Researcher',
    description:
      '并行调研每个维度，搜集证据、提取 findings、产出 dimension summary',
    loop: 'ReAct',
    modelHint: 'search · 系统配置 CHAT 模型（BYOK）',
    skills: ['evidence-gathering'],
    tools: ['web-search', 'arxiv-search', 'github-search', 'web-scraper'],
  },
  analyst: {
    displayName: 'Research Analyst',
    description: '整合多维度发现，做交叉验证、矛盾消解、洞察归纳',
    loop: 'Reflexion',
    modelHint: 'reasoning · 系统配置 CHAT 模型（BYOK）',
    skills: ['critical-review'],
    tools: [],
    verifiers: ['self', 'critical'],
  },
  writer: {
    displayName: 'Report Writer',
    description:
      '把 insights 写成结构化 Markdown 报告，outputSchema 失败自动 retry',
    loop: 'ReAct',
    modelHint: 'long-form · 系统配置 CHAT 模型（BYOK）',
    skills: [],
    tools: [],
  },
  reviewer: {
    displayName: 'Quality Reviewer',
    description: '调用多个 Judge 并行评分，达成共识；< 70 分会触发 Writer 重写',
    loop: 'JudgeConsensus',
    modelHint: 'judge × 3 · 系统配置 CHAT 模型（BYOK）',
    skills: [],
    tools: [],
  },
};

function buildAgentInspectorPayload(
  role: AgentRole,
  agents: AgentLiveState[],
  stage?: StageState
): AgentInspectorAgent {
  const Icon = ROLE_ICON[role];
  const profile = ROLE_PROFILE[role];
  const running = agents.filter((a) => a.phase === 'running').length;
  const done = agents.filter((a) => a.phase === 'completed').length;
  const failed = agents.filter((a) => a.phase === 'failed').length;
  const totalIters = agents.reduce((s, a) => s + (a.iterations ?? 0), 0);

  let recentThought: string | undefined;
  for (let i = agents.length - 1; i >= 0 && !recentThought; i--) {
    const trace = agents[i].trace;
    for (let j = trace.length - 1; j >= 0; j--) {
      if (trace[j].kind === 'thought' && trace[j].text) {
        recentThought = trace[j].text;
        break;
      }
    }
  }

  const statusLabel =
    stage?.status === 'done'
      ? '已完成'
      : stage?.status === 'running'
        ? '进行中'
        : stage?.status === 'failed'
          ? '失败'
          : '待启动';
  const statusColorClass =
    stage?.status === 'done'
      ? 'text-emerald-600'
      : stage?.status === 'running'
        ? 'text-blue-600'
        : stage?.status === 'failed'
          ? 'text-red-600'
          : 'text-gray-500';

  return {
    name: profile.displayName,
    description: profile.description,
    icon: Icon,
    iconClassName: 'bg-violet-50 text-violet-600',
    statusLabel,
    statusColorClass,
    totalInstances: agents.length,
    instanceCounts: {
      running,
      completed: done,
      failed,
      iterations: totalIters,
    },
    config: [
      { label: 'Loop', value: profile.loop },
      { label: '模型', value: profile.modelHint },
      { label: '技能', chips: profile.skills },
      { label: '工具', chips: profile.tools },
      ...(profile.verifiers && profile.verifiers.length > 0
        ? [{ label: 'Verifier', chips: profile.verifiers }]
        : []),
    ],
    recentThought,
  };
}
