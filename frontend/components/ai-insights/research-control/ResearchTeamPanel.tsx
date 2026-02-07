'use client';

/**
 * Research Team Panel - SVG Star Topology
 *
 * 星型拓扑团队可视化:
 * - Leader (👑) 在中心
 * - 维度研究员 (🔍) 围绕 Leader
 * - 质量审核 (✅) 和 报告撰写 (📊) 在底部
 *
 * 功能:
 * - 点击 Agent 弹出详情
 * - 悬停显示 Tooltip
 * - 每个 Agent 有唯一名称
 */

import { useMemo, useState, useCallback } from 'react';
import { useI18n } from '@/lib/i18n';
import type {
  AgentInfo,
  TeamInfo,
  MissionStatus,
} from '@/lib/api/topic-insights';

/**
 * ★ 类型守卫：验证是否为非空字符串数组
 * 防止后端返回无效数据导致渲染错误
 */
function isValidStringArray(value: unknown): value is string[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every(
    (item) => typeof item === 'string' && item.trim().length > 0
  );
}

interface ResearchTeamPanelProps {
  teamInfo: TeamInfo | null;
  missionStatus: MissionStatus | null;
  isRefreshing: boolean;
}

// Agent 节点完整信息（用于弹窗显示）
interface AgentNodeInfo {
  id: string;
  type: string;
  name: string;
  role: string;
  status: AgentInfo['status'];
  x: number;
  y: number;
  icon: string;
  color: typeof agentColors.leader;
  description?: string;
  capabilities?: string[];
  note?: string;
  currentTask?: string;
  completedTasks?: number;
  totalTasks?: number;
  /** ★ Agent 使用的 AI 模型名称 */
  model?: string;
  /** ★ v8.0: Leader 分配给此 Agent 的技能 */
  skills?: string[];
  /** ★ v8.0: Leader 分配给此 Agent 的工具 */
  tools?: string[];
}

// Agent 颜色配置
const agentColors = {
  leader: { bg: '#8B5CF6', text: '#FFFFFF', glow: '#C4B5FD' }, // 紫色
  dimension_researcher: { bg: '#3B82F6', text: '#FFFFFF', glow: '#93C5FD' }, // 蓝色
  quality_reviewer: { bg: '#10B981', text: '#FFFFFF', glow: '#6EE7B7' }, // 绿色
  report_writer: { bg: '#F59E0B', text: '#FFFFFF', glow: '#FCD34D' }, // 橙色
};

// Agent 图标
const agentIcons = {
  leader: '👑',
  dimension_researcher: '🔍',
  quality_reviewer: '✅',
  report_writer: '📊',
};

// 状态样式
const statusStyles = {
  idle: { stroke: '#D1D5DB', fill: '#F9FAFB' },
  working: { stroke: '#3B82F6', fill: '#EFF6FF' },
  completed: { stroke: '#10B981', fill: '#F0FDF4' },
  failed: { stroke: '#EF4444', fill: '#FEF2F2' },
};

export function ResearchTeamPanel({
  teamInfo,
  missionStatus,
  isRefreshing,
}: ResearchTeamPanelProps) {
  const { t } = useI18n();

  // Agent 角色信息映射
  // ★ v8.0: 能力由 Leader 根据任务动态分配
  const agentRoleInfo = useMemo(
    () => ({
      leader: {
        name: t(
          'topicResearch.researchControl.teamPanel.agentRoles.leader.name'
        ),
        description: t(
          'topicResearch.researchControl.teamPanel.agentRoles.leader.description'
        ),
        capabilities: ['智能规划', '任务协调', '质量把控', '结果整合'],
        note: t(
          'topicResearch.researchControl.teamPanel.agentRoles.leader.note'
        ),
      },
      dimension_researcher: {
        name: t(
          'topicResearch.researchControl.teamPanel.agentRoles.dimensionResearcher.name'
        ),
        description: t(
          'topicResearch.researchControl.teamPanel.agentRoles.dimensionResearcher.description'
        ),
        capabilities: ['信息检索', '内容分析', '报告撰写'],
        note: t(
          'topicResearch.researchControl.teamPanel.agentRoles.dimensionResearcher.note'
        ),
      },
      quality_reviewer: {
        name: t(
          'topicResearch.researchControl.teamPanel.agentRoles.qualityReviewer.name'
        ),
        description: t(
          'topicResearch.researchControl.teamPanel.agentRoles.qualityReviewer.description'
        ),
        capabilities: ['质量审核', '一致性检查', '准确性验证'],
        note: t(
          'topicResearch.researchControl.teamPanel.agentRoles.qualityReviewer.note'
        ),
      },
      report_writer: {
        name: t(
          'topicResearch.researchControl.teamPanel.agentRoles.reportWriter.name'
        ),
        description: t(
          'topicResearch.researchControl.teamPanel.agentRoles.reportWriter.description'
        ),
        capabilities: ['内容整合', '报告生成', '格式优化'],
        note: t(
          'topicResearch.researchControl.teamPanel.agentRoles.reportWriter.note'
        ),
      },
    }),
    [t]
  );

  // 选中的 Agent（用于显示详情弹窗）
  const [selectedAgent, setSelectedAgent] = useState<AgentNodeInfo | null>(
    null
  );
  // 悬停的 Agent（用于显示 Tooltip）
  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null);

  // 计算节点位置 - 星型拓扑
  const nodeLayout = useMemo(() => {
    const canvasWidth = 260;
    const canvasHeight = 280;
    const centerX = canvasWidth / 2;
    const centerY = 90;

    const nodes: AgentNodeInfo[] = [];

    // Leader 节点 - 中心
    const leaderInfo = agentRoleInfo.leader;
    nodes.push({
      id: 'leader',
      type: 'leader',
      name: 'Leader',
      role: leaderInfo.name,
      status: isRefreshing ? 'working' : 'idle',
      x: centerX,
      y: centerY,
      icon: agentIcons.leader,
      color: agentColors.leader,
      description: leaderInfo.description,
      capabilities: leaderInfo.capabilities,
      note: leaderInfo.note,
      // ★ Leader 的模型来自 teamInfo.leaderModel，如果不存在则从 missionStatus 获取
      model:
        teamInfo?.leaderModel ||
        missionStatus?.leaderModelId ||
        missionStatus?.leaderModelName ||
        undefined,
    });

    // 从 teamInfo 获取 agents，或者使用默认配置
    const agents = teamInfo?.agents || [];

    // 分类 agents
    const researchers = agents.filter((a) => a.type === 'dimension_researcher');
    const reviewers = agents.filter((a) => a.type === 'quality_reviewer');
    const writers = agents.filter((a) => a.type === 'report_writer');

    // 维度研究员 - 围绕 Leader 的环形布局
    const researcherCount = Math.max(researchers.length, 4);
    const radius = 70;
    const startAngle = -Math.PI / 2; // 从顶部开始

    const researcherInfo = agentRoleInfo.dimension_researcher;
    for (let i = 0; i < researcherCount; i++) {
      const researcher = researchers[i];
      const angle = startAngle + (i / researcherCount) * 2 * Math.PI;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      const dimensionName = researcher?.assignedDimensions?.[0];

      nodes.push({
        id: researcher?.id || `researcher_${i}`,
        type: 'dimension_researcher',
        name: `研究员${i + 1}`,
        role: dimensionName || researcherInfo.name,
        status: researcher?.status || 'idle',
        x,
        y,
        icon: agentIcons.dimension_researcher,
        color: agentColors.dimension_researcher,
        description: dimensionName
          ? t(
              'topicResearch.researchControl.teamPanel.agentRoles.dimensionResearcher.assignedTo',
              { dimension: dimensionName }
            )
          : researcherInfo.description,
        capabilities: researcherInfo.capabilities,
        note: researcherInfo.note,
        currentTask: dimensionName,
        // ★ 从 API 返回的 agent 信息获取模型
        model: researcher?.model,
        // ★ v8.0: 从 API 返回的 agent 信息获取 skills/tools
        skills: researcher?.skills,
        tools: researcher?.tools,
      });
    }

    // 质量审核 - 左下
    const reviewer = reviewers[0];
    const reviewerInfo = agentRoleInfo.quality_reviewer;
    nodes.push({
      id: reviewer?.id || 'reviewer',
      type: 'quality_reviewer',
      name: '审核',
      role: reviewerInfo.name,
      status: reviewer?.status || 'idle',
      x: centerX - 50,
      y: canvasHeight - 50,
      icon: agentIcons.quality_reviewer,
      color: agentColors.quality_reviewer,
      description: reviewerInfo.description,
      capabilities: reviewerInfo.capabilities,
      note: reviewerInfo.note,
      // ★ 从 API 返回的 agent 信息获取模型
      model: reviewer?.model,
      // ★ v8.0: 从 API 返回的 agent 信息获取 skills/tools
      skills: reviewer?.skills,
      tools: reviewer?.tools,
    });

    // 报告撰写 - 右下
    const writer = writers[0];
    const writerInfo = agentRoleInfo.report_writer;
    nodes.push({
      id: writer?.id || 'writer',
      type: 'report_writer',
      name: '撰写',
      role: writerInfo.name,
      status: writer?.status || 'idle',
      x: centerX + 50,
      y: canvasHeight - 50,
      icon: agentIcons.report_writer,
      color: agentColors.report_writer,
      description: writerInfo.description,
      capabilities: writerInfo.capabilities,
      note: writerInfo.note,
      // ★ 从 API 返回的 agent 信息获取模型
      model: writer?.model,
      // ★ v8.0: 从 API 返回的 agent 信息获取 skills/tools
      skills: writer?.skills,
      tools: writer?.tools,
    });

    return { nodes, canvasWidth, canvasHeight, centerX, centerY };
  }, [teamInfo, isRefreshing, agentRoleInfo, t]);

  const { nodes, canvasWidth, canvasHeight, centerX, centerY } = nodeLayout;

  // 获取连线
  const connections = useMemo(() => {
    const lines: {
      from: (typeof nodes)[0];
      to: (typeof nodes)[0];
      active: boolean;
    }[] = [];

    const leader = nodes.find((n) => n.type === 'leader');
    if (!leader) return lines;

    // Leader 到所有研究员的连线
    const researchers = nodes.filter((n) => n.type === 'dimension_researcher');
    researchers.forEach((researcher) => {
      lines.push({
        from: leader,
        to: researcher,
        active:
          researcher.status === 'working' || researcher.status === 'completed',
      });
    });

    // 研究员到审核和撰写的连线
    const reviewer = nodes.find((n) => n.type === 'quality_reviewer');
    const writer = nodes.find((n) => n.type === 'report_writer');

    if (reviewer) {
      lines.push({
        from: leader,
        to: reviewer,
        active:
          reviewer.status === 'working' || reviewer.status === 'completed',
      });
    }

    if (writer) {
      lines.push({
        from: leader,
        to: writer,
        active: writer.status === 'working' || writer.status === 'completed',
      });
    }

    return lines;
  }, [nodes]);

  return (
    <div className="flex h-full flex-col">
      {/* Team Title */}
      <div className="border-b border-gray-100 px-3 py-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {t('topicResearch.researchControl.teamPanel.title')}
        </h4>
        {teamInfo?.leaderModel && (
          <p className="mt-0.5 text-xs text-gray-400">
            {t('topicResearch.researchControl.teamPanel.leaderModel', {
              model: teamInfo.leaderModel,
            })}
          </p>
        )}
      </div>

      {/* SVG Canvas */}
      <div className="flex-1 overflow-hidden p-2">
        <svg
          viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
          className="h-full w-full"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* 背景网格 */}
          <defs>
            <pattern
              id="star-grid"
              width="20"
              height="20"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="10" cy="10" r="0.5" fill="#E5E7EB" />
            </pattern>

            {/* 发光效果 */}
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <rect width="100%" height="100%" fill="url(#star-grid)" />

          {/* 连线 */}
          {connections.map((conn, idx) => (
            <line
              key={idx}
              x1={conn.from.x}
              y1={conn.from.y}
              x2={conn.to.x}
              y2={conn.to.y}
              stroke={conn.active ? '#3B82F6' : '#E5E7EB'}
              strokeWidth={conn.active ? 2 : 1}
              strokeDasharray={conn.active ? '0' : '4 2'}
              opacity={conn.active ? 1 : 0.5}
            />
          ))}

          {/* 节点 */}
          {nodes.map((node) => (
            <AgentNode
              key={node.id}
              {...node}
              isLeader={node.type === 'leader'}
              isHovered={hoveredAgent === node.id}
              onMouseEnter={() => setHoveredAgent(node.id)}
              onMouseLeave={() => setHoveredAgent(null)}
              onClick={() => setSelectedAgent(node)}
            />
          ))}
        </svg>

        {/* 悬停 Tooltip */}
        {hoveredAgent && !selectedAgent && (
          <AgentTooltip
            agent={nodes.find((n) => n.id === hoveredAgent)!}
            canvasWidth={canvasWidth}
            canvasHeight={canvasHeight}
          />
        )}
      </div>

      {/* Agent 详情弹窗 */}
      {selectedAgent && (
        <AgentDetailModal
          agent={selectedAgent}
          onClose={() => setSelectedAgent(null)}
        />
      )}

      {/* Legend */}
      <div className="border-t border-gray-100 px-3 py-2">
        <div className="flex items-center justify-center gap-3 text-xs text-gray-400">
          <div className="flex items-center gap-1">
            <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
            <span>
              {t('topicResearch.researchControl.teamPanel.legend.inProgress')}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            <span>
              {t('topicResearch.researchControl.teamPanel.legend.completed')}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-gray-300" />
            <span>
              {t('topicResearch.researchControl.teamPanel.legend.idle')}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Agent Node 组件
interface AgentNodeProps extends AgentNodeInfo {
  isLeader?: boolean;
  isHovered?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onClick?: () => void;
}

function AgentNode({
  x,
  y,
  icon,
  name,
  role,
  status,
  color,
  isLeader,
  isHovered,
  onMouseEnter,
  onMouseLeave,
  onClick,
}: AgentNodeProps) {
  const radius = isLeader ? 22 : 16;
  const style = statusStyles[status];

  return (
    <g
      style={{ cursor: 'pointer' }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
    >
      {/* 悬停时的高亮效果 */}
      {isHovered && (
        <circle
          cx={x}
          cy={y}
          r={radius + 6}
          fill="none"
          stroke={color.bg}
          strokeWidth={2}
          opacity={0.5}
        />
      )}

      {/* 活跃时的发光效果 */}
      {status === 'working' && (
        <circle
          cx={x}
          cy={y}
          r={radius + 8}
          fill="none"
          stroke={color.glow}
          strokeWidth={2}
          opacity={0.4}
        >
          <animate
            attributeName="r"
            from={radius + 4}
            to={radius + 12}
            dur="1.5s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            from="0.4"
            to="0"
            dur="1.5s"
            repeatCount="indefinite"
          />
        </circle>
      )}

      {/* 主圆圈 */}
      <circle
        cx={x}
        cy={y}
        r={radius}
        fill={
          status === 'working' || status === 'completed' ? color.bg : style.fill
        }
        stroke={
          status === 'working' || status === 'completed'
            ? color.bg
            : style.stroke
        }
        strokeWidth={2}
        filter={status === 'working' ? 'url(#glow)' : undefined}
      />

      {/* 图标 */}
      <text
        x={x}
        y={y}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={isLeader ? 14 : 11}
      >
        {icon}
      </text>

      {/* 状态指示器 */}
      {(status === 'working' || status === 'completed') && (
        <circle
          cx={x + radius - 3}
          cy={y - radius + 3}
          r={5}
          fill={status === 'working' ? '#3B82F6' : '#10B981'}
          stroke="#FFFFFF"
          strokeWidth={1.5}
        >
          {status === 'working' && (
            <animate
              attributeName="opacity"
              values="1;0.5;1"
              dur="1s"
              repeatCount="indefinite"
            />
          )}
        </circle>
      )}

      {/* 失败指示器 */}
      {status === 'failed' && (
        <g transform={`translate(${x + radius - 4}, ${y - radius + 4})`}>
          <circle r={6} fill="#EF4444" />
          <text
            x={0}
            y={0}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={8}
            fill="#FFFFFF"
            fontWeight="bold"
          >
            ✗
          </text>
        </g>
      )}

      {/* Agent 名称标签 */}
      <text
        x={x}
        y={y + radius + 12}
        textAnchor="middle"
        fontSize={9}
        fontWeight={500}
        fill={status === 'working' ? color.bg : '#6B7280'}
      >
        {name.length > 6 ? name.slice(0, 6) : name}
      </text>
    </g>
  );
}

// Agent Tooltip 组件
function AgentTooltip({
  agent,
  canvasWidth,
  canvasHeight,
}: {
  agent: AgentNodeInfo;
  canvasWidth: number;
  canvasHeight: number;
}) {
  const { t } = useI18n();
  const tooltipX = (agent.x / canvasWidth) * 100;
  const tooltipY = (agent.y / canvasHeight) * 100;
  const showAbove = tooltipY > 50;

  return (
    <div
      className="pointer-events-none absolute z-10 max-w-[180px] rounded-lg border border-gray-200 bg-white/95 p-2 shadow-lg backdrop-blur"
      style={{
        left: `${Math.min(Math.max(tooltipX, 20), 80)}%`,
        top: showAbove ? `${tooltipY - 12}%` : `${tooltipY + 15}%`,
        transform: 'translateX(-50%)',
      }}
    >
      <div className="text-xs">
        <div className="flex items-center gap-1 font-medium text-gray-900">
          {agent.icon} {agent.name}
          {agent.type === 'leader' && (
            <span className="ml-1 text-purple-600">👑</span>
          )}
        </div>
        <div className="mt-0.5 text-gray-500">{agent.role}</div>
        {agent.currentTask && (
          <div className="mt-1 truncate text-blue-600">
            {t(
              'topicResearch.researchControl.teamPanel.agentDetail.currentTask'
            )}{' '}
            {agent.currentTask}
          </div>
        )}
        <div className="mt-1 text-gray-400">
          {t('topicResearch.researchControl.teamPanel.agentDetail.clickToView')}
        </div>
      </div>
    </div>
  );
}

// Agent 详情弹窗组件
function AgentDetailModal({
  agent,
  onClose,
}: {
  agent: AgentNodeInfo;
  onClose: () => void;
}) {
  const { t } = useI18n();

  const statusText = {
    idle: t('topicResearch.researchControl.teamPanel.agentDetail.statusIdle'),
    working: t(
      'topicResearch.researchControl.teamPanel.agentDetail.statusWorking'
    ),
    completed: t(
      'topicResearch.researchControl.teamPanel.agentDetail.statusCompleted'
    ),
    failed: t(
      'topicResearch.researchControl.teamPanel.agentDetail.statusFailed'
    ),
  };

  const statusColor = {
    idle: 'bg-gray-100 text-gray-700',
    working: 'bg-blue-100 text-blue-700',
    completed: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
  };

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/20 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-xs rounded-xl border border-gray-200 bg-white shadow-xl">
        {/* 头部 */}
        <div
          className="rounded-t-xl px-4 py-3"
          style={{ backgroundColor: `${agent.color.bg}15` }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{agent.icon}</span>
              <div>
                <h3 className="font-semibold text-gray-900">
                  {agent.name}
                  {agent.type === 'leader' && <span className="ml-1">👑</span>}
                </h3>
                <p className="text-xs text-gray-500">{agent.role}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
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
        </div>

        {/* 内容 */}
        <div className="p-4">
          {/* 状态 */}
          <div className="mb-3 flex items-center gap-2">
            <span className="text-xs text-gray-500">
              {t('topicResearch.researchControl.teamPanel.agentDetail.status')}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${statusColor[agent.status]}`}
            >
              {statusText[agent.status]}
            </span>
          </div>

          {/* 描述 */}
          {agent.description && (
            <div className="mb-3">
              <p className="text-xs text-gray-500">
                {t(
                  'topicResearch.researchControl.teamPanel.agentDetail.responsibilities'
                )}
              </p>
              <p className="mt-1 text-sm text-gray-700">{agent.description}</p>
            </div>
          )}

          {/* ★ v8.0: 技能 - 优先显示 Leader 分配的真实技能 */}
          {(() => {
            // ★ 使用类型守卫验证数据有效性
            const realSkills = isValidStringArray(agent.skills)
              ? agent.skills
              : undefined;
            const realTools = isValidStringArray(agent.tools)
              ? agent.tools
              : undefined;
            const hasRealData = !!realSkills || !!realTools;

            return (
              <>
                {/* 技能 */}
                <div className="mb-3">
                  <p className="text-xs text-gray-500">
                    {hasRealData
                      ? t(
                          'topicResearch.researchControl.teamPanel.agentDetail.assignedSkills'
                        )
                      : t(
                          'topicResearch.researchControl.teamPanel.agentDetail.capabilities'
                        )}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {realSkills ? (
                      realSkills.map((skill, i) => (
                        <span
                          key={i}
                          className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700"
                        >
                          {skill}
                        </span>
                      ))
                    ) : agent.capabilities && agent.capabilities.length > 0 ? (
                      agent.capabilities.map((cap: string, i: number) => (
                        <span
                          key={i}
                          className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
                        >
                          {cap}
                        </span>
                      ))
                    ) : (
                      <span className="italic text-gray-400">
                        {t(
                          'topicResearch.researchControl.teamPanel.agentDetail.pendingAssignment'
                        )}
                      </span>
                    )}
                  </div>
                </div>

                {/* 工具 - 仅当有真实数据时显示 */}
                {realTools && (
                  <div className="mb-3">
                    <p className="text-xs text-gray-500">
                      {t(
                        'topicResearch.researchControl.teamPanel.agentDetail.assignedTools'
                      )}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {realTools.map((tool, i) => (
                        <span
                          key={i}
                          className="rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700"
                        >
                          {tool}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* 配置说明 - 仅当没有真实数据时显示 */}
                {!hasRealData && agent.note && (
                  <div className="mb-3">
                    <p className="text-xs text-gray-500">
                      {t(
                        'topicResearch.researchControl.teamPanel.agentDetail.configMethod'
                      )}
                    </p>
                    <p className="mt-1 text-xs italic text-gray-600">
                      {agent.note}
                    </p>
                  </div>
                )}
              </>
            );
          })()}

          {/* ★ AI 模型 - 始终显示，帮助用户了解使用哪个模型 */}
          <div className="mb-3">
            <p className="text-xs text-gray-500">
              {t('topicResearch.researchControl.teamPanel.agentDetail.aiModel')}
            </p>
            <p className="mt-1 text-sm font-medium text-purple-600">
              {agent.model ||
                t(
                  'topicResearch.researchControl.teamPanel.agentDetail.modelNotSpecified'
                )}
            </p>
          </div>

          {/* 当前任务 */}
          {agent.currentTask && (
            <div className="rounded-lg bg-blue-50 p-2">
              <p className="text-xs text-blue-600">
                {t(
                  'topicResearch.researchControl.teamPanel.agentDetail.currentTask'
                )}{' '}
                {agent.currentTask}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
