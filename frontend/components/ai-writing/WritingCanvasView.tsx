'use client';

import { useMemo, useState, useCallback } from 'react';

/**
 * Writing Agent 角色类型
 */
export type WritingAgentRole =
  | 'story-architect'
  | 'bible-keeper'
  | 'writer'
  | 'consistency-checker'
  | 'editor';

/**
 * 写作任务状态
 */
export type WritingTaskStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'FAILED'
  | 'REVIEWING';

/**
 * 写作 Agent 接口
 */
export interface WritingAgent {
  id: string;
  name: string;
  role: WritingAgentRole;
  status: 'idle' | 'working' | 'completed' | 'error';
  currentTask?: string;
  completedTasks: number;
  totalTasks: number;
}

/**
 * 写作任务接口
 */
export interface WritingTask {
  id: string;
  name: string;
  description: string;
  status: WritingTaskStatus;
  assignedTo: string; // Agent ID
  dependsOn: string[]; // Task IDs
  progress: number; // 0-100
  result?: string;
}

/**
 * 写作任务（Mission）接口
 */
export interface WritingMission {
  id: string;
  title: string;
  status: 'PLANNING' | 'IN_PROGRESS' | 'REVIEWING' | 'COMPLETED' | 'FAILED';
  phase:
    | 'idle'
    | 'parsing'
    | 'planning'
    | 'executing'
    | 'reviewing'
    | 'delivering'
    | 'completed'
    | 'failed';
  tasks: WritingTask[];
  progress: number;
  wordCount: number;
  targetWordCount: number;
}

interface WritingCanvasViewProps {
  mission: WritingMission | null;
  agents: WritingAgent[];
  workingAgentIds: Set<string>;
  onAgentClick?: (agent: WritingAgent) => void;
  onTaskClick?: (task: WritingTask) => void;
}

// Agent 角色对应的显示名称和图标
const AGENT_DISPLAY_INFO: Record<
  WritingAgentRole,
  { name: string; icon: string; color: string }
> = {
  'story-architect': { name: '架构师', icon: '🏛️', color: 'purple' },
  'bible-keeper': { name: '守护者', icon: '📖', color: 'indigo' },
  writer: { name: '写作者', icon: '✍️', color: 'blue' },
  'consistency-checker': { name: '检查员', icon: '🔍', color: 'yellow' },
  editor: { name: '编辑', icon: '📝', color: 'green' },
};

// 根据状态获取颜色
const getAgentStatusColor = (
  agent: WritingAgent,
  isWorking: boolean
): { bg: string; border: string; glow: string } => {
  if (isWorking) {
    return {
      bg: 'fill-blue-500',
      border: 'stroke-blue-600',
      glow: 'drop-shadow-[0_0_8px_rgba(59,130,246,0.6)]',
    };
  }
  if (agent.role === 'story-architect') {
    return {
      bg: 'fill-purple-500',
      border: 'stroke-purple-600',
      glow: 'drop-shadow-[0_0_6px_rgba(168,85,247,0.4)]',
    };
  }
  if (agent.status === 'completed') {
    return {
      bg: 'fill-green-500',
      border: 'stroke-green-600',
      glow: '',
    };
  }
  if (agent.status === 'error') {
    return {
      bg: 'fill-red-500',
      border: 'stroke-red-600',
      glow: '',
    };
  }
  return {
    bg: 'fill-gray-400',
    border: 'stroke-gray-500',
    glow: '',
  };
};

// 任务连线颜色
const getTaskConnectionColor = (status: WritingTaskStatus): string => {
  switch (status) {
    case 'IN_PROGRESS':
      return 'stroke-blue-400';
    case 'COMPLETED':
      return 'stroke-green-400';
    case 'REVIEWING':
      return 'stroke-purple-400';
    case 'FAILED':
      return 'stroke-red-400';
    default:
      return 'stroke-gray-300';
  }
};

// 计算节点位置 - 写作团队特定布局
function calculateWritingNodePositions(
  agents: WritingAgent[],
  width: number,
  height: number
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const centerX = width / 2;

  // 找到 Leader (Story Architect)
  const leader = agents.find((a) => a.role === 'story-architect');
  const bibleKeeper = agents.find((a) => a.role === 'bible-keeper');
  const writers = agents.filter((a) => a.role === 'writer');
  const checkers = agents.filter((a) => a.role === 'consistency-checker');
  const editors = agents.filter((a) => a.role === 'editor');

  // 布局：
  //         Story Architect (顶部中心)
  //              |
  //        Bible Keeper (第二行中心)
  //        /    |    \
  //   Writer1  Writer2  Writer3 (第三行)
  //        \    |    /
  //    Checker1  Checker2 (第四行)
  //              |
  //           Editor (底部中心)

  const row1Y = 50; // Leader
  const row2Y = 120; // Bible Keeper
  const row3Y = 190; // Writers
  const row4Y = 260; // Checkers
  const row5Y = 330; // Editor

  // Leader
  if (leader) {
    positions.set(leader.id, { x: centerX, y: row1Y });
  }

  // Bible Keeper
  if (bibleKeeper) {
    positions.set(bibleKeeper.id, { x: centerX, y: row2Y });
  }

  // Writers (horizontal spread)
  const writerSpacing = Math.min(120, (width - 100) / (writers.length + 1));
  writers.forEach((writer, index) => {
    const totalWidth = (writers.length - 1) * writerSpacing;
    const startX = centerX - totalWidth / 2;
    positions.set(writer.id, { x: startX + index * writerSpacing, y: row3Y });
  });

  // Checkers
  const checkerSpacing = Math.min(100, (width - 100) / (checkers.length + 1));
  checkers.forEach((checker, index) => {
    const totalWidth = (checkers.length - 1) * checkerSpacing;
    const startX = centerX - totalWidth / 2;
    positions.set(checker.id, { x: startX + index * checkerSpacing, y: row4Y });
  });

  // Editors
  editors.forEach((editor, index) => {
    positions.set(editor.id, {
      x: centerX + (index - (editors.length - 1) / 2) * 80,
      y: row5Y,
    });
  });

  return positions;
}

export default function WritingCanvasView({
  mission,
  agents,
  workingAgentIds,
  onAgentClick,
  onTaskClick,
}: WritingCanvasViewProps) {
  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null);
  const [hoveredTask, setHoveredTask] = useState<string | null>(null);
  const [canvasSize] = useState({ width: 450, height: 400 });

  // 计算节点位置
  const nodePositions = useMemo(() => {
    return calculateWritingNodePositions(
      agents,
      canvasSize.width,
      canvasSize.height
    );
  }, [agents, canvasSize]);

  // 获取 Agent 的任务统计
  const getAgentTasks = useCallback(
    (agentId: string) => {
      if (!mission?.tasks) return { completed: 0, inProgress: 0, total: 0 };
      const agentTasks = mission.tasks.filter((t) => t.assignedTo === agentId);
      return {
        completed: agentTasks.filter((t) => t.status === 'COMPLETED').length,
        inProgress: agentTasks.filter((t) => t.status === 'IN_PROGRESS').length,
        total: agentTasks.length,
      };
    },
    [mission?.tasks]
  );

  // 渲染工作流连线
  const renderWorkflowConnections = () => {
    const connections: JSX.Element[] = [];

    // 定义工作流顺序
    const workflow: [WritingAgentRole, WritingAgentRole][] = [
      ['story-architect', 'bible-keeper'],
      ['bible-keeper', 'writer'],
      ['writer', 'consistency-checker'],
      ['consistency-checker', 'editor'],
      ['editor', 'story-architect'], // 回环给 Leader 审核
    ];

    workflow.forEach(([fromRole, toRole], index) => {
      const fromAgents = agents.filter((a) => a.role === fromRole);
      const toAgents = agents.filter((a) => a.role === toRole);

      fromAgents.forEach((fromAgent) => {
        toAgents.forEach((toAgent) => {
          const fromPos = nodePositions.get(fromAgent.id);
          const toPos = nodePositions.get(toAgent.id);
          if (!fromPos || !toPos) return;

          // 根据当前阶段决定连线颜色
          let status: WritingTaskStatus = 'PENDING';
          if (mission) {
            const phaseOrder = [
              'parsing',
              'planning',
              'executing',
              'reviewing',
              'delivering',
            ];
            const rolePhaseMap: Record<WritingAgentRole, number> = {
              'story-architect': 0,
              'bible-keeper': 1,
              writer: 2,
              'consistency-checker': 3,
              editor: 4,
            };
            const currentPhaseIndex = phaseOrder.indexOf(mission.phase);
            const connectionPhaseIndex = rolePhaseMap[fromRole];

            if (currentPhaseIndex > connectionPhaseIndex) {
              status = 'COMPLETED';
            } else if (currentPhaseIndex === connectionPhaseIndex) {
              status = 'IN_PROGRESS';
            }
          }

          const isHovered =
            hoveredAgent === fromAgent.id || hoveredAgent === toAgent.id;

          // 计算贝塞尔曲线控制点
          const midX = (fromPos.x + toPos.x) / 2;
          const midY = (fromPos.y + toPos.y) / 2;
          const controlX = midX + (toPos.x - fromPos.x) * 0.1;
          const controlY = midY - Math.abs(toPos.y - fromPos.y) * 0.2;

          connections.push(
            <g key={`${fromAgent.id}-${toAgent.id}-${index}`}>
              <path
                d={`M ${fromPos.x} ${fromPos.y + 25} Q ${controlX} ${controlY} ${toPos.x} ${toPos.y - 25}`}
                className={`${getTaskConnectionColor(status)} fill-none transition-all duration-300 ${
                  isHovered ? 'stroke-[3]' : 'stroke-[1.5]'
                } ${status === 'IN_PROGRESS' ? 'animate-pulse' : ''}`}
                strokeDasharray={status === 'PENDING' ? '4 4' : 'none'}
                markerEnd="url(#arrowhead)"
              />
            </g>
          );
        });
      });
    });

    return connections;
  };

  // 渲染 Agent 节点
  const renderAgentNodes = () => {
    return agents.map((agent) => {
      const pos = nodePositions.get(agent.id);
      if (!pos) return null;

      const isLeader = agent.role === 'story-architect';
      const isWorking = workingAgentIds.has(agent.id);
      const stats = getAgentTasks(agent.id);
      const statusColors = getAgentStatusColor(agent, isWorking);
      const isHovered = hoveredAgent === agent.id;
      const nodeRadius = isLeader ? 30 : 25;
      const displayInfo = AGENT_DISPLAY_INFO[agent.role];

      return (
        <g
          key={agent.id}
          transform={`translate(${pos.x}, ${pos.y})`}
          onMouseEnter={() => setHoveredAgent(agent.id)}
          onMouseLeave={() => setHoveredAgent(null)}
          onClick={() => onAgentClick?.(agent)}
          style={{ cursor: 'pointer' }}
        >
          {/* 工作中的光晕效果 */}
          {(isWorking || isLeader) && (
            <circle
              r={nodeRadius + 8}
              className={`${statusColors.bg} opacity-20 ${isWorking ? 'animate-ping' : ''}`}
            />
          )}

          {/* 外圈 */}
          <circle
            r={nodeRadius + 4}
            className={`fill-white opacity-90 ${isHovered ? 'opacity-100' : ''}`}
            style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))' }}
          />

          {/* 主圆 */}
          <circle
            r={nodeRadius}
            className={`${statusColors.bg} ${statusColors.border} stroke-2 transition-all duration-300 ${
              statusColors.glow
            } ${isHovered ? 'scale-105' : ''}`}
            style={{
              transformOrigin: 'center',
              transform: isHovered ? 'scale(1.05)' : 'scale(1)',
            }}
          />

          {/* 角色图标 */}
          <text
            textAnchor="middle"
            dy="0.35em"
            style={{ fontSize: isLeader ? '18px' : '16px' }}
          >
            {displayInfo.icon}
          </text>

          {/* Leader 皇冠 */}
          {isLeader && (
            <text
              textAnchor="middle"
              y={-nodeRadius - 8}
              style={{ fontSize: '14px' }}
            >
              👑
            </text>
          )}

          {/* 角色名称 */}
          <text
            textAnchor="middle"
            y={nodeRadius + 14}
            className="fill-gray-800 font-semibold"
            style={{ fontSize: '10px' }}
          >
            {displayInfo.name}
          </text>

          {/* 任务计数徽章 */}
          {stats.total > 0 && (
            <g transform={`translate(${nodeRadius - 2}, ${-nodeRadius + 2})`}>
              <circle
                r="10"
                className="fill-white"
                style={{
                  stroke:
                    stats.completed === stats.total
                      ? '#22c55e'
                      : stats.inProgress > 0
                        ? '#3b82f6'
                        : '#d1d5db',
                  strokeWidth: 2,
                }}
              />
              <text
                textAnchor="middle"
                dy="0.35em"
                className={`font-bold ${
                  stats.completed === stats.total
                    ? 'fill-green-600'
                    : stats.inProgress > 0
                      ? 'fill-blue-600'
                      : 'fill-gray-600'
                }`}
                style={{ fontSize: '8px' }}
              >
                {stats.completed}/{stats.total}
              </text>
            </g>
          )}

          {/* 工作中指示器 */}
          {isWorking && (
            <g transform={`translate(${-nodeRadius + 2}, ${-nodeRadius + 2})`}>
              <circle r="6" className="animate-pulse fill-blue-500" />
              <circle r="2" className="fill-white" />
            </g>
          )}
        </g>
      );
    });
  };

  // 无任务状态
  if (!mission) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-4 text-center">
        <div className="mb-3 text-4xl">✍️</div>
        <p className="text-sm text-gray-500">
          开始写作任务后，这里将展示 AI 写作团队的协作视图
        </p>
      </div>
    );
  }

  // 阶段显示映射
  const phaseDisplay: Record<string, string> = {
    idle: '空闲',
    parsing: '解析中',
    planning: '规划中',
    executing: '执行中',
    reviewing: '审核中',
    delivering: '交付中',
    completed: '已完成',
    failed: '失败',
  };

  return (
    <div className="flex h-full flex-col">
      {/* 头部信息 */}
      <div className="border-b border-gray-100 px-3 py-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-600">
            {mission.title}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${
              mission.status === 'IN_PROGRESS'
                ? 'bg-blue-100 text-blue-700'
                : mission.status === 'COMPLETED'
                  ? 'bg-green-100 text-green-700'
                  : mission.status === 'FAILED'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-gray-100 text-gray-600'
            }`}
          >
            {phaseDisplay[mission.phase] || mission.status}
          </span>
        </div>
        {/* 进度条 */}
        <div className="mt-2">
          <div className="mb-1 flex justify-between text-xs text-gray-500">
            <span>进度</span>
            <span>
              {mission.wordCount} / {mission.targetWordCount} 字
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full bg-blue-500 transition-all duration-500"
              style={{ width: `${Math.min(mission.progress, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 overflow-hidden">
        <svg
          viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`}
          className="h-full w-full"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* 定义箭头标记 */}
          <defs>
            <marker
              id="arrowhead"
              markerWidth="6"
              markerHeight="6"
              refX="5"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 6 3, 0 6" className="fill-gray-400" />
            </marker>
            <pattern
              id="writing-grid"
              width="20"
              height="20"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 20 0 L 0 0 0 20"
                fill="none"
                stroke="#f0f0f0"
                strokeWidth="0.5"
              />
            </pattern>
          </defs>

          {/* 背景网格 */}
          <rect width="100%" height="100%" fill="url(#writing-grid)" />

          {/* 工作流连线 */}
          {renderWorkflowConnections()}

          {/* Agent 节点 */}
          {renderAgentNodes()}
        </svg>
      </div>

      {/* 图例 */}
      <div className="border-t border-gray-100 px-3 py-2">
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
          <div className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-purple-500"></div>
            <span>架构师</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-2 w-2 animate-pulse rounded-full bg-blue-500"></div>
            <span>工作中</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-green-500"></div>
            <span>已完成</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-gray-400"></div>
            <span>空闲</span>
          </div>
        </div>
      </div>

      {/* 悬停提示 */}
      {hoveredAgent &&
        (() => {
          const agent = agents.find((a) => a.id === hoveredAgent);
          const stats = getAgentTasks(hoveredAgent);
          const nodePos = nodePositions.get(hoveredAgent);
          if (!agent || !nodePos) return null;

          const tooltipX = (nodePos.x / canvasSize.width) * 100;
          const tooltipY = (nodePos.y / canvasSize.height) * 100;
          const showAbove = tooltipY > 40;
          const displayInfo = AGENT_DISPLAY_INFO[agent.role];

          return (
            <div
              className="pointer-events-none absolute z-10 max-w-[200px] rounded-lg bg-white/95 p-2 shadow-lg backdrop-blur"
              style={{
                left: `${Math.min(Math.max(tooltipX, 25), 75)}%`,
                top: showAbove ? `${tooltipY - 15}%` : `${tooltipY + 20}%`,
                transform: 'translateX(-50%)',
              }}
            >
              <div className="text-xs">
                <div className="font-medium text-gray-900">
                  {displayInfo.icon} {agent.name}
                  {agent.role === 'story-architect' && (
                    <span className="ml-1 text-purple-600">👑 Leader</span>
                  )}
                </div>
                <div className="mt-1 text-gray-500">{displayInfo.name}</div>
                {stats.total > 0 && (
                  <div className="mt-1 text-gray-500">
                    任务: {stats.completed}/{stats.total} 完成
                    {stats.inProgress > 0 && `, ${stats.inProgress} 执行中`}
                  </div>
                )}
                {agent.currentTask && (
                  <div className="mt-1 truncate text-blue-600">
                    正在: {agent.currentTask}
                  </div>
                )}
              </div>
            </div>
          );
        })()}
    </div>
  );
}
