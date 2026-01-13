'use client';

/**
 * Research Team Panel - SVG Star Topology
 *
 * 星型拓扑团队可视化:
 * - Leader (👑) 在中心
 * - 维度研究员 (🔍) 围绕 Leader
 * - 质量审核 (✅) 和 报告撰写 (📊) 在底部
 */

import { useMemo } from 'react';
import type {
  AgentInfo,
  TeamInfo,
  MissionStatus,
} from '@/lib/api/topic-research';

interface ResearchTeamPanelProps {
  teamInfo: TeamInfo | null;
  missionStatus: MissionStatus | null;
  isRefreshing: boolean;
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
  // 计算节点位置 - 星型拓扑
  const nodeLayout = useMemo(() => {
    const canvasWidth = 260;
    const canvasHeight = 280;
    const centerX = canvasWidth / 2;
    const centerY = 90;

    const nodes: {
      id: string;
      type: string;
      role: string;
      status: AgentInfo['status'];
      x: number;
      y: number;
      icon: string;
      color: typeof agentColors.leader;
    }[] = [];

    // Leader 节点 - 中心
    nodes.push({
      id: 'leader',
      type: 'leader',
      role: '研究协调员',
      status: isRefreshing ? 'working' : 'idle',
      x: centerX,
      y: centerY,
      icon: agentIcons.leader,
      color: agentColors.leader,
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

    for (let i = 0; i < researcherCount; i++) {
      const researcher = researchers[i];
      const angle = startAngle + (i / researcherCount) * 2 * Math.PI;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);

      nodes.push({
        id: researcher?.id || `researcher_${i}`,
        type: 'dimension_researcher',
        role: researcher?.assignedDimensions?.[0] || '维度研究员',
        status: researcher?.status || 'idle',
        x,
        y,
        icon: agentIcons.dimension_researcher,
        color: agentColors.dimension_researcher,
      });
    }

    // 质量审核 - 左下
    const reviewer = reviewers[0];
    nodes.push({
      id: reviewer?.id || 'reviewer',
      type: 'quality_reviewer',
      role: '质量审核',
      status: reviewer?.status || 'idle',
      x: centerX - 50,
      y: canvasHeight - 50,
      icon: agentIcons.quality_reviewer,
      color: agentColors.quality_reviewer,
    });

    // 报告撰写 - 右下
    const writer = writers[0];
    nodes.push({
      id: writer?.id || 'writer',
      type: 'report_writer',
      role: '报告撰写',
      status: writer?.status || 'idle',
      x: centerX + 50,
      y: canvasHeight - 50,
      icon: agentIcons.report_writer,
      color: agentColors.report_writer,
    });

    return { nodes, canvasWidth, canvasHeight, centerX, centerY };
  }, [teamInfo, isRefreshing]);

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
          研究团队
        </h4>
        {teamInfo?.leaderModel && (
          <p className="mt-0.5 text-xs text-gray-400">
            Leader: {teamInfo.leaderModel}
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
            />
          ))}
        </svg>
      </div>

      {/* Legend */}
      <div className="border-t border-gray-100 px-3 py-2">
        <div className="flex items-center justify-center gap-3 text-xs text-gray-400">
          <div className="flex items-center gap-1">
            <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
            <span>进行中</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            <span>完成</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-gray-300" />
            <span>待开始</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Agent Node 组件
interface AgentNodeProps {
  id: string;
  x: number;
  y: number;
  icon: string;
  role: string;
  status: AgentInfo['status'];
  color: typeof agentColors.leader;
  isLeader?: boolean;
}

function AgentNode({
  x,
  y,
  icon,
  role,
  status,
  color,
  isLeader,
}: AgentNodeProps) {
  const radius = isLeader ? 22 : 16;
  const style = statusStyles[status];

  return (
    <g>
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

      {/* 角色标签 */}
      <text
        x={x}
        y={y + radius + 12}
        textAnchor="middle"
        fontSize={9}
        fontWeight={500}
        fill={status === 'working' ? color.bg : '#6B7280'}
      >
        {role.length > 6 ? role.slice(0, 6) : role}
      </text>
    </g>
  );
}
