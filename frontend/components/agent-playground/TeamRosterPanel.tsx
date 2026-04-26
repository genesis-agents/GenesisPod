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
  onCollapse?: () => void;
  /** 点击 Leader 节点时触发（详情页用来打开 LeaderChatModal） */
  onLeaderClick?: () => void;
}

export function TeamRosterPanel({
  agents,
  stages,
  finalScore,
  onCollapse,
  onLeaderClick,
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

    for (const r of ROLE_ROW) {
      const stage = stageMap.get(r.stage);
      const roleAgents = agents.filter((a) => a.role === r.role);
      const total = Math.max(roleAgents.length, 1);
      const completed = roleAgents.filter(
        (a) => a.phase === 'completed'
      ).length;
      const status = stageStatusToNodeStatus(stage?.status ?? 'pending');

      const node: TeamTopologyNode = {
        id: r.role,
        name: r.label,
        role: r.role,
        icon: ROLE_ICON[r.role],
        status,
        statusLabel:
          status === 'working'
            ? 'working'
            : status === 'completed'
              ? 'done'
              : undefined,
        colorKey: ROLE_COLOR_KEY[r.role],
        isLeader: r.role === 'leader',
        avatarRole: ROLE_AVATAR[r.role],
        taskProgress:
          roleAgents.length > 0
            ? { completed, total: roleAgents.length }
            : undefined,
      };
      nodes.push(node);
      rowMap[r.rowIdx].push(r.role);
      // Suppress unused-var lint
      void total;
    }

    // 单链流水线：leader → researcher → analyst → writer → reviewer
    // 不画 analyst↔writer 这种横向连线，避免线条交叉视觉混乱
    const connections: TeamTopologyConnection[] = [
      { from: 'leader', to: 'researcher' },
      { from: 'researcher', to: 'analyst' },
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
          renderDetail={(node, onClose) => (
            <>
              <div
                className="absolute inset-0 z-20"
                onClick={() => {
                  onClose();
                  setSelectedRole(null);
                }}
              />
              <RoleDetailCard
                role={node.role as AgentRole}
                agents={agents.filter(
                  (a) => a.role === (node.role as AgentRole)
                )}
                stage={stageMap.get(
                  ROLE_ROW.find((r) => r.role === (node.role as AgentRole))
                    ?.stage ?? 'leader'
                )}
                onChatWithLeader={
                  node.role === 'leader' && onLeaderClick
                    ? () => {
                        onClose();
                        setSelectedRole(null);
                        onLeaderClick();
                      }
                    : undefined
                }
                onClose={() => {
                  onClose();
                  setSelectedRole(null);
                }}
              />
            </>
          )}
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

function RoleDetailCard({
  role,
  agents,
  stage,
  onClose,
  onChatWithLeader,
}: {
  role: AgentRole;
  agents: AgentLiveState[];
  stage?: StageState;
  onClose: () => void;
  onChatWithLeader?: () => void;
}) {
  const Icon = ROLE_ICON[role];
  const profile = ROLE_PROFILE[role];
  const running = agents.filter((a) => a.phase === 'running').length;
  const done = agents.filter((a) => a.phase === 'completed').length;
  const failed = agents.filter((a) => a.phase === 'failed').length;
  const totalIters = agents.reduce((s, a) => s + (a.iterations ?? 0), 0);
  const lastThought = (() => {
    for (let i = agents.length - 1; i >= 0; i--) {
      const trace = agents[i].trace;
      for (let j = trace.length - 1; j >= 0; j--) {
        if (trace[j].kind === 'thought' && trace[j].text) {
          return trace[j].text;
        }
      }
    }
    return null;
  })();

  const statusLabel =
    stage?.status === 'done'
      ? '已完成'
      : stage?.status === 'running'
        ? '进行中'
        : stage?.status === 'failed'
          ? '失败'
          : '待启动';
  const statusColor =
    stage?.status === 'done'
      ? 'text-emerald-600'
      : stage?.status === 'running'
        ? 'text-blue-600'
        : stage?.status === 'failed'
          ? 'text-red-600'
          : 'text-gray-500';

  return (
    <div className="absolute left-1/2 top-1/2 z-30 max-h-[85%] w-[320px] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-gray-200 bg-white p-4 shadow-xl">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-50 text-violet-600">
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="truncate font-semibold text-gray-900">
              {profile.displayName}
            </div>
            <span className={`text-[11px] font-medium ${statusColor}`}>
              {statusLabel}
              {agents.length > 0 && (
                <span className="ml-1 text-gray-400">
                  · {agents.length} 实例
                </span>
              )}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <p className="mb-3 text-[11px] leading-relaxed text-gray-600">
        {profile.description}
      </p>

      {/* 当前实例计数 */}
      {agents.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1 text-[10px] font-medium">
          {running > 0 && (
            <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">
              {running} 进行中
            </span>
          )}
          {done > 0 && (
            <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">
              {done} 完成
            </span>
          )}
          {failed > 0 && (
            <span className="rounded bg-red-50 px-1.5 py-0.5 text-red-700">
              {failed} 失败
            </span>
          )}
          {totalIters > 0 && (
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-700">
              {totalIters} iter
            </span>
          )}
        </div>
      )}

      {/* 能力栏：loop / model / skills / tools */}
      <dl className="mb-3 space-y-1.5 text-[11px]">
        <div className="flex items-baseline gap-2">
          <dt className="w-16 shrink-0 text-gray-500">Loop</dt>
          <dd className="font-mono font-medium text-gray-800">
            {profile.loop}
          </dd>
        </div>
        <div className="flex items-baseline gap-2">
          <dt className="w-16 shrink-0 text-gray-500">模型</dt>
          <dd className="text-gray-700">{profile.modelHint}</dd>
        </div>
        <div className="flex items-baseline gap-2">
          <dt className="w-16 shrink-0 text-gray-500">技能</dt>
          <dd className="flex flex-wrap gap-1">
            {profile.skills.length === 0 ? (
              <span className="text-gray-400">—</span>
            ) : (
              profile.skills.map((s) => (
                <span
                  key={s}
                  className="font-mono rounded bg-violet-50 px-1.5 py-0.5 text-violet-700"
                >
                  {s}
                </span>
              ))
            )}
          </dd>
        </div>
        <div className="flex items-baseline gap-2">
          <dt className="w-16 shrink-0 text-gray-500">工具</dt>
          <dd className="flex flex-wrap gap-1">
            {profile.tools.length === 0 ? (
              <span className="text-gray-400">—</span>
            ) : (
              profile.tools.map((t) => (
                <span
                  key={t}
                  className="font-mono rounded bg-sky-50 px-1.5 py-0.5 text-sky-700"
                >
                  {t}
                </span>
              ))
            )}
          </dd>
        </div>
        {profile.verifiers && profile.verifiers.length > 0 && (
          <div className="flex items-baseline gap-2">
            <dt className="w-16 shrink-0 text-gray-500">Verifier</dt>
            <dd className="flex flex-wrap gap-1">
              {profile.verifiers.map((v) => (
                <span
                  key={v}
                  className="font-mono rounded bg-amber-50 px-1.5 py-0.5 text-amber-700"
                >
                  {v}
                </span>
              ))}
            </dd>
          </div>
        )}
      </dl>

      {lastThought && (
        <div className="rounded-lg bg-amber-50/60 px-2.5 py-2">
          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
            最近思考
          </p>
          <p className="text-[11px] leading-relaxed text-amber-900">
            <Lightbulb className="mr-1 inline h-3 w-3 text-amber-500" />
            {lastThought}
          </p>
        </div>
      )}

      {onChatWithLeader && (
        <button
          type="button"
          onClick={onChatWithLeader}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-500 to-purple-600 px-3 py-2 text-[12px] font-medium text-white shadow-sm transition-all hover:shadow-md"
        >
          <Lightbulb className="h-3.5 w-3.5" />与 Leader 对话
        </button>
      )}
    </div>
  );
}
