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
  // 完全照搬 TI 拓扑：Leader → N Researchers → [Reviewer, Writer]
  // analyst 仍在 pipeline 执行，只是不在网络图绘出（避免 fan-in 乱线）
  { role: 'leader', stage: 'leader', label: 'Leader', rowIdx: 0 },
  {
    role: 'researcher',
    stage: 'researchers',
    label: 'Research Team',
    rowIdx: 1,
  },
  { role: 'reviewer', stage: 'reviewer', label: 'Reviewer', rowIdx: 2 },
  { role: 'writer', stage: 'writer', label: 'Writer', rowIdx: 2 },
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
  missionStatus?: 'running' | 'completed' | 'failed' | 'cancelled' | 'idle';
  onCollapse?: () => void;
  /** 点击 Leader 节点时触发（详情页用来打开 LeaderChatModal） */
  onLeaderClick?: () => void;
  /** 点击 Research Team 节点时触发（展开 group 内部 micro-pipeline） */
  onResearchTeamClick?: () => void;
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
  onResearchTeamClick,
  onRerun,
  onUpdate,
  onCancel,
}: Props) {
  const stageMap = useMemo(
    () => new Map(stages.map((s) => [s.id, s])),
    [stages]
  );
  const [selectedRole, setSelectedRole] = useState<AgentRole | null>(null);
  // 默认展开 Research Team group → 让用户能看到每个 Researcher#N 节点
  const [groupExpanded, setGroupExpanded] = useState(true);

  const { nodes, connections, rows, viewBoxHeight, rowYPositions } =
    useMemo(() => {
      const nodes: TeamTopologyNode[] = [];
      const rowMap: Record<number, string[]> = {
        0: [], // Leader
        1: [], // Research Team (group OR expanded researchers)
        2: [], // Analyst / Writer / Reviewer 横排
      };
      // researcher 实例节点 ids（展开时 fan-out / fan-in 用）
      const researcherInstanceIds: string[] = [];
      const researcherAgentsAll = agents.filter((a) => a.role === 'researcher');
      const dimCount =
        dimensions && dimensions.length > 0
          ? dimensions.length
          : researcherAgentsAll.length;

      for (const r of ROLE_ROW) {
        const stage = stageMap.get(r.stage);
        const roleAgents = agents.filter((a) => a.role === r.role);
        const status = stageStatusToNodeStatus(stage?.status ?? 'pending');

        // ── Researcher：展开为 N 个独立节点 OR 折叠为 group ──
        if (r.role === 'researcher') {
          const completedAgents = roleAgents.filter(
            (a) => a.phase === 'completed'
          ).length;
          const failedAgents = roleAgents.filter(
            (a) => a.phase === 'failed'
          ).length;
          const runningAgents = roleAgents.filter(
            (a) => a.phase === 'running'
          ).length;
          const groupStatus: TeamNodeStatus =
            failedAgents > 0
              ? 'failed'
              : runningAgents > 0
                ? 'working'
                : roleAgents.length > 0 && completedAgents === roleAgents.length
                  ? 'completed'
                  : stageStatusToNodeStatus(stage?.status ?? 'pending');

          if (groupExpanded && (dimCount > 0 || roleAgents.length > 0)) {
            // 展开：每个维度 / 实例一个节点
            // 优先按 dimensions 顺序生成，没有 dimensions 时用 agents
            const list =
              dimensions && dimensions.length > 0
                ? dimensions.map((d, idx) => ({
                    id: `researcher#${idx}`,
                    name: d.name,
                    agent: roleAgents.find(
                      (a) =>
                        a.dimension === d.name ||
                        a.agentId === `researcher#${idx}`
                    ),
                  }))
                : roleAgents.map((a, idx) => ({
                    id: a.agentId ?? `researcher#${idx}`,
                    name: a.dimension ?? `维度 ${idx + 1}`,
                    agent: a,
                  }));
            for (const item of list) {
              const phase = item.agent?.phase ?? 'pending';
              const itemStatus: TeamNodeStatus =
                phase === 'completed'
                  ? 'completed'
                  : phase === 'failed'
                    ? 'failed'
                    : phase === 'running'
                      ? 'working'
                      : 'idle';
              const shortName =
                item.name.length > 8 ? item.name.slice(0, 7) + '…' : item.name;
              nodes.push({
                id: item.id,
                name: shortName,
                role: 'researcher',
                icon: ROLE_ICON.researcher,
                status: itemStatus,
                statusLabel:
                  itemStatus === 'working'
                    ? '调研中'
                    : itemStatus === 'completed'
                      ? // ★ 2026-05-06 (P1-E): dim agent.phase=completed 只表示研究阶段完成，
                        //   后续还有 chapter writing / grade / signoff，避免用户误以为整个
                        //   mission 完成。改成"研究完成"更精确。
                        '研究完成'
                      : itemStatus === 'failed'
                        ? '失败'
                        : '待启动',
                colorKey: ROLE_COLOR_KEY.researcher,
                avatarRole: ROLE_AVATAR.researcher,
              });
              researcherInstanceIds.push(item.id);
              rowMap[r.rowIdx].push(item.id);
            }
          } else {
            // 折叠：单一 group 节点
            nodes.push({
              id: 'research-team',
              name: '研究团队',
              role: 'researcher',
              icon: ROLE_ICON.researcher,
              status: groupStatus,
              statusLabel:
                groupStatus === 'working'
                  ? `${runningAgents} 调研中`
                  : groupStatus === 'completed'
                    ? // ★ 2026-05-06 (P1-E): 同上，"研究阶段完成"语义更精确
                      `${completedAgents}/${dimCount} 研究完成`
                    : groupStatus === 'failed'
                      ? `${failedAgents} 失败`
                      : dimCount > 0
                        ? `${dimCount} 维度`
                        : '待启动',
              colorKey: ROLE_COLOR_KEY.researcher,
              avatarRole: ROLE_AVATAR.researcher,
              taskProgress:
                dimCount > 0
                  ? { completed: completedAgents, total: dimCount }
                  : undefined,
            });
            researcherInstanceIds.push('research-team');
            rowMap[r.rowIdx].push('research-team');
          }
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

      // 完全照搬 TI 拓扑：Leader → 每个 Researcher (fan-out)，
      //                    Leader → Reviewer / Writer (直连)
      // analyst 仍在 pipeline 执行，但不在网络图绘出（避免乱线）
      const connections: TeamTopologyConnection[] = [];
      if (groupExpanded && researcherInstanceIds.length > 1) {
        for (const rid of researcherInstanceIds) {
          connections.push({ from: 'leader', to: rid });
        }
      } else {
        const groupId = researcherInstanceIds[0] ?? 'research-team';
        connections.push({ from: 'leader', to: groupId });
      }
      connections.push({ from: 'leader', to: 'reviewer' });
      connections.push({ from: 'leader', to: 'writer' });

      // 展开时拉高画布让 fan-out/fan-in 不挤
      const expanded = groupExpanded && researcherInstanceIds.length > 1;
      const vbh = expanded ? 240 : 200;
      const ryp = expanded ? [40, 130, 215] : [40, 110, 175];

      return {
        nodes,
        connections,
        rows: [rowMap[0], rowMap[1], rowMap[2]],
        viewBoxHeight: vbh,
        rowYPositions: ryp,
      };
    }, [agents, stageMap, dimensions, groupExpanded]);

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
        {/* 展开 / 折叠 切换 + Micro-pipeline 入口 */}
        <div className="mb-2 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setGroupExpanded((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-medium text-gray-600 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700"
            title={
              groupExpanded
                ? '折叠为单一 Research Team Group 节点'
                : '展开 Research Team，查看每个 Researcher 实例'
            }
          >
            {groupExpanded ? '⊟ 折叠' : '⊞ 展开'} Research
          </button>
          {onResearchTeamClick && (
            <button
              type="button"
              onClick={onResearchTeamClick}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-medium text-gray-600 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700"
              title="打开 Micro Pipeline（章节流水线 + 5-axis 评分）"
            >
              Micro Pipeline →
            </button>
          )}
        </div>
        <TeamTopologyCanvas
          nodes={nodes}
          rows={rows}
          connections={connections}
          heightClass={viewBoxHeight === 240 ? 'h-[240px]' : 'h-[200px]'}
          viewBoxHeight={viewBoxHeight}
          rowYPositions={rowYPositions}
          patternId="agent-playground"
          renderDetail={(node, onClose) => {
            const close = () => {
              onClose();
              setSelectedRole(null);
            };
            // 折叠态：点 group → 打开 micro-pipeline modal
            if (node.id === 'research-team' && onResearchTeamClick) {
              close();
              onResearchTeamClick();
              return null;
            }
            // 展开态：点单个 researcher#N 节点 → 打开该实例的 inspector
            if (node.id.startsWith('researcher#')) {
              const researcher = agents.find((a) => a.agentId === node.id);
              if (researcher) {
                const agentData = buildAgentInspectorPayload(
                  'researcher',
                  [researcher],
                  stageMap.get('researchers')
                );
                // 覆盖 displayName 显示具体维度
                const enriched = {
                  ...agentData,
                  name: `${agentData.name} · ${researcher.dimension ?? node.name}`,
                };
                return (
                  <AgentInspector
                    open
                    onClose={close}
                    mode="modal"
                    agent={enriched}
                  />
                );
              }
            }
            const role = node.role as AgentRole;
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
          renderTooltip={(node) => {
            const isResearcherInst = node.id.startsWith('researcher#');
            const inst = isResearcherInst
              ? agents.find((a) => a.agentId === node.id)
              : undefined;
            return (
              <div className="text-xs">
                <div className="font-semibold text-gray-800">{node.name}</div>
                <div className="mt-0.5 text-gray-500">
                  {inst?.dimension
                    ? inst.dimension
                    : node.taskProgress
                      ? `${node.taskProgress.completed} / ${node.taskProgress.total} done`
                      : (node.statusLabel ?? 'Idle')}
                </div>
                {inst?.modelId && (
                  <div className="font-mono mt-0.5 text-[10px] text-gray-400">
                    {inst.modelId}
                  </div>
                )}
              </div>
            );
          }}
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
                    <p
                      className="mt-0.5 line-clamp-2 text-[11px] text-gray-600"
                      title={lastThought}
                    >
                      <Lightbulb className="mr-0.5 inline h-2.5 w-2.5 text-amber-500" />
                      {lastThought}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-[11px] italic text-gray-400">
                      {st?.detail ?? (isDone ? '已完成' : '待启动')}
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
          <span className="flex items-center gap-1.5">
            {missionStatus === 'cancelled' && (
              <span className="rounded-full bg-gray-200 px-1.5 py-0.5 text-[10px] font-semibold text-gray-700">
                已取消
              </span>
            )}
            {missionStatus === 'failed' && (
              <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                已失败
              </span>
            )}
            {missionStatus === 'completed' && (
              <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                已完成
              </span>
            )}
            {missionStatus === 'running' && (
              <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                进行中
              </span>
            )}
            <span className="font-mono text-gray-500">
              {completedStages} / {totalStages}
            </span>
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

        {/* 操作按钮：开始 / 更新 / 取消 —— 完全照搬 TI TopicTeamPanel 尺寸 + 样式 */}
        {(onRerun || onUpdate || onCancel) && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {onRerun && (
              <button
                type="button"
                onClick={onRerun}
                disabled={missionStatus === 'running'}
                className={`flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                  missionStatus === 'running'
                    ? 'cursor-not-allowed border border-gray-200 bg-gray-100 text-gray-400'
                    : 'bg-blue-600 text-white shadow-sm hover:bg-blue-700'
                }`}
                title="用相同配置启动一个新 mission"
              >
                <span>▶</span>
                开始
              </button>
            )}
            {onUpdate && (
              <button
                type="button"
                onClick={onUpdate}
                disabled={missionStatus === 'running'}
                className={`flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                  missionStatus === 'running'
                    ? 'cursor-not-allowed border border-gray-200 bg-gray-100 text-gray-400'
                    : 'bg-green-600 text-white shadow-sm hover:bg-green-700'
                }`}
                title="编辑 topic / depth / language 后重新启动"
              >
                <span>🔄</span>
                更新
              </button>
            )}
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                disabled={missionStatus !== 'running'}
                className={`flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                  missionStatus !== 'running'
                    ? 'cursor-not-allowed border border-gray-200 bg-gray-100 text-gray-400'
                    : 'border border-red-200 bg-red-50 text-red-600 hover:bg-red-100'
                }`}
                title={
                  missionStatus === 'running'
                    ? '取消运行中的 mission'
                    : '只有运行中的 mission 可以取消'
                }
              >
                <span>⏹</span>
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

export function buildAgentInspectorPayload(
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
