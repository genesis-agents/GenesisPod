'use client';

/**
 * Topic Team Panel - Leader-driven Research Panel
 *
 * v8.0: 参照 AI Writing 设计精髓
 * - SVG 协作视图：节点连线、状态动效、悬停提示
 * - 任务按状态分组：执行中优先
 * - 简洁进度统计 + 底部状态栏
 */

import { useMemo, useState } from 'react';
import type { MissionStatus, TaskStatus } from '@/lib/api/topic-research';

interface SimpleRefreshProgress {
  phase: string;
  progress: number;
  message: string;
  currentDimension?: string;
  completedDimensions: number;
  totalDimensions: number;
}

interface TopicTeamPanelProps {
  topicName: string;
  missionStatus?: MissionStatus | null;
  isRefreshing: boolean;
  refreshProgress: SimpleRefreshProgress | null;
  onStartRefresh?: () => void;
  onCancelRefresh?: () => void;
  /** 错误信息 */
  error?: string | null;
}

// Agent 角色定义
type ResearchAgentRole = 'leader' | 'researcher' | 'reviewer' | 'synthesizer';

interface ResearchAgent {
  id: string;
  role: ResearchAgentRole;
  name: string;
  status: 'idle' | 'working' | 'completed' | 'error';
  taskCount: number;
  completedCount: number;
}

// Agent 显示信息
const AGENT_DISPLAY: Record<
  ResearchAgentRole,
  { name: string; icon: string; color: string }
> = {
  leader: { name: 'Leader', icon: '👑', color: 'purple' },
  researcher: { name: '研究员', icon: '🔍', color: 'blue' },
  reviewer: { name: '审核员', icon: '✅', color: 'green' },
  synthesizer: { name: '撰写者', icon: '📝', color: 'orange' },
};

// ★ 默认显示信息，用于未知角色
const DEFAULT_AGENT_DISPLAY = { name: 'Agent', icon: '🤖', color: 'gray' };

// ★ 安全获取 Agent 显示信息
function getAgentDisplay(role: string): {
  name: string;
  icon: string;
  color: string;
} {
  // 尝试直接匹配
  if (role in AGENT_DISPLAY) {
    return AGENT_DISPLAY[role as ResearchAgentRole];
  }
  // 尝试小写匹配
  const lowerRole = role.toLowerCase();
  if (lowerRole in AGENT_DISPLAY) {
    return AGENT_DISPLAY[lowerRole as ResearchAgentRole];
  }
  return DEFAULT_AGENT_DISPLAY;
}

// Agent 角色详细信息
const AGENT_ROLE_INFO: Record<
  ResearchAgentRole,
  { description: string; skills: string[] }
> = {
  leader: {
    description:
      '负责规划研究大纲、分配任务给研究员、审核研究质量、整合最终结果',
    skills: ['大纲规划', '任务分配', '质量审核', '结果整合'],
  },
  researcher: {
    description: '负责深入研究特定维度，收集证据，撰写分析内容',
    skills: ['资料收集', '深度分析', '证据引用', '内容撰写'],
  },
  reviewer: {
    description: '负责审核研究内容的准确性、完整性和一致性',
    skills: ['质量检查', '一致性审核', '准确性验证'],
  },
  synthesizer: {
    description: '负责整合各维度研究结果，撰写最终综合报告',
    skills: ['报告整合', '内容润色', '格式规范'],
  },
};

// ★ 默认角色详细信息
const DEFAULT_AGENT_ROLE_INFO = {
  description: 'AI 研究助手',
  skills: ['研究', '分析'],
};

// ★ 安全获取角色详细信息
function getAgentRoleInfo(role: string): {
  description: string;
  skills: string[];
} {
  if (role in AGENT_ROLE_INFO) {
    return AGENT_ROLE_INFO[role as ResearchAgentRole];
  }
  const lowerRole = role.toLowerCase();
  if (lowerRole in AGENT_ROLE_INFO) {
    return AGENT_ROLE_INFO[lowerRole as ResearchAgentRole];
  }
  return DEFAULT_AGENT_ROLE_INFO;
}

// Phase display mapping
const phaseDisplay: Record<string, string> = {
  idle: '待研究',
  planning: '规划中',
  researching: '研究中',
  reviewing: '审核中',
  synthesizing: '撰写中',
  completed: '已完成',
  failed: '失败',
};

// 状态图标映射
const statusIcons: Record<string, string> = {
  PENDING: '⏳',
  EXECUTING: '🔄',
  COMPLETED: '✅',
  FAILED: '❌',
  NEEDS_REVISION: '↻',
};

// 状态颜色映射
const statusColors: Record<string, string> = {
  PENDING: 'bg-gray-100 text-gray-600',
  EXECUTING: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-700',
  NEEDS_REVISION: 'bg-yellow-100 text-yellow-700',
};

export function TopicTeamPanel({
  topicName,
  missionStatus,
  isRefreshing,
  refreshProgress,
  onStartRefresh,
  onCancelRefresh,
  error,
}: TopicTeamPanelProps) {
  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  // ★ 判断任务是否正在进行中 - 同时检查 isRefreshing 和 missionStatus
  // 这修复了一个 bug：当 isRefreshing 因为某种原因没有正确同步时，
  // 按钮仍然可以通过检查 missionStatus 来显示正确的状态
  const isMissionActive = useMemo(() => {
    // 如果 isRefreshing 已经是 true，直接返回
    if (isRefreshing) return true;
    // 检查 missionStatus 是否表示正在进行
    if (missionStatus) {
      // 检查 mission 状态是否是活动状态
      if (
        ['PLANNING', 'EXECUTING', 'REVIEWING'].includes(missionStatus.status)
      ) {
        return true;
      }
      // 检查是否有正在执行或待处理的任务
      if (
        missionStatus.tasks?.some(
          (t) =>
            t.status === 'EXECUTING' ||
            t.status === 'PENDING' ||
            t.status === 'ASSIGNED'
        )
      ) {
        return true;
      }
    }
    return false;
  }, [isRefreshing, missionStatus]);

  // 从 missionStatus 构建 agents
  const { agents, tasksByStatus, stats } = useMemo(() => {
    const tasks = missionStatus?.tasks || [];

    // 按类型分组任务
    const dimensionTasks = tasks.filter(
      (t) => t.taskType === 'dimension_research'
    );
    const reviewTasks = tasks.filter((t) => t.taskType === 'quality_review');
    const synthesisTasks = tasks.filter(
      (t) => t.taskType === 'report_synthesis'
    );

    // 构建 agents 列表
    const agentList: ResearchAgent[] = [
      {
        id: 'leader',
        role: 'leader',
        name: 'Research Leader',
        status: isRefreshing ? 'working' : 'idle',
        taskCount: tasks.length,
        completedCount: tasks.filter((t) => t.status === 'COMPLETED').length,
      },
    ];

    // 添加研究员（根据维度任务数量）
    const researcherCount = Math.max(1, Math.min(dimensionTasks.length, 4));
    for (let i = 0; i < researcherCount; i++) {
      const assignedTasks = dimensionTasks.filter(
        (_, idx) => idx % researcherCount === i
      );
      const hasExecuting = assignedTasks.some((t) => t.status === 'EXECUTING');
      const allCompleted =
        assignedTasks.length > 0 &&
        assignedTasks.every((t) => t.status === 'COMPLETED');

      agentList.push({
        id: `researcher-${i}`,
        role: 'researcher',
        name: `研究员 ${i + 1}`,
        status: hasExecuting ? 'working' : allCompleted ? 'completed' : 'idle',
        taskCount: assignedTasks.length,
        completedCount: assignedTasks.filter((t) => t.status === 'COMPLETED')
          .length,
      });
    }

    // 审核员
    if (reviewTasks.length > 0) {
      const hasExecuting = reviewTasks.some((t) => t.status === 'EXECUTING');
      const allCompleted = reviewTasks.every((t) => t.status === 'COMPLETED');
      agentList.push({
        id: 'reviewer',
        role: 'reviewer',
        name: '质量审核员',
        status: hasExecuting ? 'working' : allCompleted ? 'completed' : 'idle',
        taskCount: reviewTasks.length,
        completedCount: reviewTasks.filter((t) => t.status === 'COMPLETED')
          .length,
      });
    }

    // 撰写者
    if (synthesisTasks.length > 0) {
      const hasExecuting = synthesisTasks.some((t) => t.status === 'EXECUTING');
      const allCompleted = synthesisTasks.every(
        (t) => t.status === 'COMPLETED'
      );
      agentList.push({
        id: 'synthesizer',
        role: 'synthesizer',
        name: '报告撰写者',
        status: hasExecuting ? 'working' : allCompleted ? 'completed' : 'idle',
        taskCount: synthesisTasks.length,
        completedCount: synthesisTasks.filter((t) => t.status === 'COMPLETED')
          .length,
      });
    }

    // 按状态分组任务（用于任务列表）
    const byStatus = tasks.reduce(
      (acc, task) => {
        if (!acc[task.status]) acc[task.status] = [];
        acc[task.status].push(task);
        return acc;
      },
      {} as Record<string, TaskStatus[]>
    );

    // 统计
    const completed = missionStatus?.completedTasks || 0;
    const total = missionStatus?.totalTasks || 0;
    const progress = missionStatus?.progress || 0;
    const executing = tasks.filter((t) => t.status === 'EXECUTING').length;
    const failed = tasks.filter((t) => t.status === 'FAILED').length;

    return {
      agents: agentList,
      tasksByStatus: byStatus,
      stats: { completed, total, progress, executing, failed },
    };
  }, [missionStatus, isRefreshing]);

  const currentPhase =
    missionStatus?.currentPhase || refreshProgress?.phase || 'idle';
  const hasMission = !!missionStatus && (missionStatus.tasks?.length || 0) > 0;

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Header */}
      <div className="border-b border-gray-100 px-4 py-3">
        <div className="flex items-center justify-between">
          <h3 className="truncate text-sm font-semibold text-gray-800">
            {topicName}
          </h3>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              currentPhase === 'completed'
                ? 'bg-green-100 text-green-700'
                : currentPhase === 'failed'
                  ? 'bg-red-100 text-red-700'
                  : isRefreshing
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-600'
            }`}
          >
            {phaseDisplay[currentPhase] || currentPhase}
          </span>
        </div>

        {/* Progress stats */}
        {hasMission && (
          <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
            <span className="text-green-600">✅ {stats.completed}</span>
            {stats.executing > 0 && (
              <span className="text-blue-600">🔄 {stats.executing}</span>
            )}
            {stats.failed > 0 && (
              <span className="text-red-600">❌ {stats.failed}</span>
            )}
            <span className="text-gray-400">共 {stats.total} 个任务</span>
          </div>
        )}

        {/* Progress bar */}
        <div className="mt-3">
          <div className="h-2 overflow-hidden rounded-full bg-gray-100">
            <div
              className={`h-full transition-all duration-500 ${
                currentPhase === 'failed'
                  ? 'bg-red-500'
                  : currentPhase === 'completed'
                    ? 'bg-green-500'
                    : 'bg-blue-500'
              }`}
              style={{ width: `${stats.progress}%` }}
            />
          </div>
          <div className="mt-1 flex justify-between text-xs text-gray-400">
            <span>整体进度</span>
            <span>{Math.round(stats.progress)}%</span>
          </div>
        </div>
      </div>

      {/* SVG Team Visualization */}
      <div className="relative border-b border-gray-100">
        <TeamCanvasView
          agents={agents}
          currentPhase={currentPhase}
          isRefreshing={isRefreshing}
          hoveredAgent={hoveredAgent}
          onHover={setHoveredAgent}
          selectedAgent={selectedAgent}
          onSelect={setSelectedAgent}
        />
      </div>

      {/* Task List - Sorted by Status */}
      <div className="flex-1 overflow-y-auto">
        {!hasMission ? (
          <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
            <div className="mb-3 text-3xl">👑</div>
            <p className="text-sm font-medium text-gray-700">
              等待 Leader 规划
            </p>
            <p className="mt-1 text-xs text-gray-500">
              点击"开始研究"后，Leader 将分析任务并分配研究员
            </p>
          </div>
        ) : (
          <div className="space-y-1 p-3">
            {/* 执行中的任务 */}
            {tasksByStatus['EXECUTING']?.map((task) => (
              <TaskItem key={task.id} task={task} />
            ))}
            {/* 待处理的任务 */}
            {tasksByStatus['PENDING']?.map((task) => (
              <TaskItem key={task.id} task={task} />
            ))}
            {/* 需要修订的任务 */}
            {tasksByStatus['NEEDS_REVISION']?.map((task) => (
              <TaskItem key={task.id} task={task} />
            ))}
            {/* 已完成的任务 */}
            {tasksByStatus['COMPLETED']?.map((task) => (
              <TaskItem key={task.id} task={task} />
            ))}
            {/* 失败的任务 */}
            {tasksByStatus['FAILED']?.map((task) => (
              <TaskItem key={task.id} task={task} />
            ))}
          </div>
        )}
      </div>

      {/* Bottom Status Bar */}
      <div className="border-t border-gray-100 px-4 py-2">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="text-gray-500">
            阶段: {phaseDisplay[currentPhase] || currentPhase}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 ${
              currentPhase === 'completed'
                ? 'bg-green-100 text-green-700'
                : currentPhase === 'failed'
                  ? 'bg-red-100 text-red-700'
                  : isRefreshing
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-600'
            }`}
          >
            {isRefreshing ? '进行中' : '空闲'}
          </span>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <div className="mb-1 flex items-center gap-2 font-medium">
              <span>⚠️</span>
              <span>研究启动失败</span>
            </div>
            <p className="text-xs text-red-600">{error}</p>
          </div>
        )}

        {/* Action Button - ★ 使用 isMissionActive 而非 isRefreshing 来判断状态 */}
        {isMissionActive ? (
          <button
            onClick={onCancelRefresh}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
          >
            <span>⏹</span>
            取消任务
          </button>
        ) : (
          <button
            onClick={onStartRefresh}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            <span>▶</span>
            开始研究
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================
// SVG Team Canvas View - 参照 WritingCanvasView
// ============================================
function TeamCanvasView({
  agents,
  currentPhase,
  isRefreshing,
  hoveredAgent,
  onHover,
  selectedAgent,
  onSelect,
}: {
  agents: ResearchAgent[];
  currentPhase: string;
  isRefreshing: boolean;
  hoveredAgent: string | null;
  onHover: (id: string | null) => void;
  selectedAgent: string | null;
  onSelect: (id: string | null) => void;
}) {
  const canvasSize = { width: 320, height: 200 };

  // 计算节点位置
  const nodePositions = useMemo(() => {
    const positions = new Map<string, { x: number; y: number }>();
    const centerX = canvasSize.width / 2;

    const leader = agents.find((a) => a.role === 'leader');
    const researchers = agents.filter((a) => a.role === 'researcher');
    const reviewer = agents.find((a) => a.role === 'reviewer');
    const synthesizer = agents.find((a) => a.role === 'synthesizer');

    // 布局：Leader -> Researchers -> Reviewer/Synthesizer
    const row1Y = 40; // Leader
    const row2Y = 100; // Researchers
    const row3Y = 160; // Reviewer & Synthesizer

    if (leader) {
      positions.set(leader.id, { x: centerX, y: row1Y });
    }

    // Researchers 水平分布
    const spacing = Math.min(
      70,
      (canvasSize.width - 80) / (researchers.length + 1)
    );
    researchers.forEach((r, i) => {
      const totalWidth = (researchers.length - 1) * spacing;
      const startX = centerX - totalWidth / 2;
      positions.set(r.id, { x: startX + i * spacing, y: row2Y });
    });

    // Reviewer 和 Synthesizer
    if (reviewer && synthesizer) {
      positions.set(reviewer.id, { x: centerX - 50, y: row3Y });
      positions.set(synthesizer.id, { x: centerX + 50, y: row3Y });
    } else if (reviewer) {
      positions.set(reviewer.id, { x: centerX, y: row3Y });
    } else if (synthesizer) {
      positions.set(synthesizer.id, { x: centerX, y: row3Y });
    }

    return positions;
  }, [agents, canvasSize]);

  // 渲染连线
  const renderConnections = () => {
    const connections: JSX.Element[] = [];
    const leader = agents.find((a) => a.role === 'leader');
    const researchers = agents.filter((a) => a.role === 'researcher');
    const reviewer = agents.find((a) => a.role === 'reviewer');
    const synthesizer = agents.find((a) => a.role === 'synthesizer');

    if (!leader) return connections;
    const leaderPos = nodePositions.get(leader.id);
    if (!leaderPos) return connections;

    // Leader -> Researchers
    researchers.forEach((r, i) => {
      const rPos = nodePositions.get(r.id);
      if (!rPos) return;

      const isActive = currentPhase === 'researching' && r.status === 'working';
      connections.push(
        <path
          key={`leader-${r.id}`}
          d={`M ${leaderPos.x} ${leaderPos.y + 18} Q ${(leaderPos.x + rPos.x) / 2} ${(leaderPos.y + rPos.y) / 2 - 10} ${rPos.x} ${rPos.y - 18}`}
          className={`fill-none transition-all duration-300 ${
            isActive
              ? 'animate-pulse stroke-blue-400 stroke-[2]'
              : r.status === 'completed'
                ? 'stroke-green-400 stroke-[1.5]'
                : 'stroke-gray-200 stroke-[1]'
          }`}
          strokeDasharray={r.status === 'idle' ? '3 3' : 'none'}
        />
      );
    });

    // Researchers -> Reviewer/Synthesizer
    const bottomAgents = [reviewer, synthesizer].filter(
      Boolean
    ) as ResearchAgent[];
    researchers.forEach((r) => {
      const rPos = nodePositions.get(r.id);
      if (!rPos) return;

      bottomAgents.forEach((b) => {
        const bPos = nodePositions.get(b.id);
        if (!bPos) return;

        const isActive =
          (currentPhase === 'reviewing' && b.role === 'reviewer') ||
          (currentPhase === 'synthesizing' && b.role === 'synthesizer');
        connections.push(
          <path
            key={`${r.id}-${b.id}`}
            d={`M ${rPos.x} ${rPos.y + 18} Q ${(rPos.x + bPos.x) / 2} ${(rPos.y + bPos.y) / 2} ${bPos.x} ${bPos.y - 18}`}
            className={`fill-none transition-all duration-300 ${
              isActive
                ? 'animate-pulse stroke-blue-400 stroke-[2]'
                : b.status === 'completed'
                  ? 'stroke-green-400 stroke-[1.5]'
                  : 'stroke-gray-200 stroke-[1]'
            }`}
            strokeDasharray={b.status === 'idle' ? '3 3' : 'none'}
          />
        );
      });
    });

    return connections;
  };

  // 渲染节点
  const renderNodes = () => {
    return agents.map((agent) => {
      const pos = nodePositions.get(agent.id);
      if (!pos) return null;

      const display = getAgentDisplay(agent.role);
      const isLeader = agent.role === 'leader';
      const isWorking = agent.status === 'working';
      const isHovered = hoveredAgent === agent.id;
      const nodeRadius = isLeader ? 18 : 15;

      // 颜色
      const fillColor = isWorking
        ? 'fill-blue-500'
        : agent.status === 'completed'
          ? 'fill-green-500'
          : agent.status === 'error'
            ? 'fill-red-500'
            : isLeader
              ? 'fill-purple-500'
              : 'fill-gray-400';

      return (
        <g
          key={agent.id}
          transform={`translate(${pos.x}, ${pos.y})`}
          onMouseEnter={() => onHover(agent.id)}
          onMouseLeave={() => onHover(null)}
          onClick={() => onSelect(agent.id)}
          style={{ cursor: 'pointer' }}
        >
          {/* 工作中光晕 */}
          {isWorking && (
            <circle
              r={nodeRadius + 6}
              className="animate-ping fill-blue-400 opacity-30"
            />
          )}

          {/* 外圈 */}
          <circle
            r={nodeRadius + 3}
            className={`fill-white ${isHovered ? 'opacity-100' : 'opacity-90'}`}
            style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))' }}
          />

          {/* 主圈 */}
          <circle
            r={nodeRadius}
            className={`${fillColor} stroke-white stroke-2 transition-all duration-200 ${
              isHovered ? 'scale-110' : ''
            }`}
            style={{
              transformOrigin: 'center',
              filter: isWorking
                ? 'drop-shadow(0 0 6px rgba(59,130,246,0.5))'
                : isLeader
                  ? 'drop-shadow(0 0 4px rgba(168,85,247,0.4))'
                  : '',
            }}
          />

          {/* 图标 */}
          <text
            textAnchor="middle"
            dy="0.35em"
            style={{ fontSize: isLeader ? '14px' : '12px' }}
          >
            {display.icon}
          </text>

          {/* 名称 */}
          <text
            textAnchor="middle"
            y={nodeRadius + 12}
            className="fill-gray-700 font-medium"
            style={{ fontSize: '9px' }}
          >
            {display.name}
          </text>

          {/* 任务计数 */}
          {agent.taskCount > 0 && (
            <g transform={`translate(${nodeRadius - 2}, ${-nodeRadius + 2})`}>
              <circle
                r="8"
                className="fill-white"
                style={{
                  stroke:
                    agent.completedCount === agent.taskCount
                      ? '#22c55e'
                      : agent.status === 'working'
                        ? '#3b82f6'
                        : '#d1d5db',
                  strokeWidth: 1.5,
                }}
              />
              <text
                textAnchor="middle"
                dy="0.35em"
                className={`font-bold ${
                  agent.completedCount === agent.taskCount
                    ? 'fill-green-600'
                    : agent.status === 'working'
                      ? 'fill-blue-600'
                      : 'fill-gray-500'
                }`}
                style={{ fontSize: '7px' }}
              >
                {agent.completedCount}/{agent.taskCount}
              </text>
            </g>
          )}
        </g>
      );
    });
  };

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`}
        className="h-[200px] w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* 背景网格 */}
        <defs>
          <pattern
            id="research-grid"
            width="20"
            height="20"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 20 0 L 0 0 0 20"
              fill="none"
              stroke="#f5f5f5"
              strokeWidth="0.5"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#research-grid)" />

        {/* 连线 */}
        {renderConnections()}

        {/* 节点 */}
        {renderNodes()}
      </svg>

      {/* 图例 */}
      <div className="flex items-center justify-center gap-4 border-t border-gray-50 px-3 py-1.5 text-[10px] text-gray-500">
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 rounded-full bg-purple-500"></div>
          <span>Leader</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 animate-pulse rounded-full bg-blue-500"></div>
          <span>工作中</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 rounded-full bg-green-500"></div>
          <span>完成</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 rounded-full bg-gray-400"></div>
          <span>空闲</span>
        </div>
      </div>

      {/* 悬停提示 */}
      {hoveredAgent &&
        (() => {
          const agent = agents.find((a) => a.id === hoveredAgent);
          const pos = nodePositions.get(hoveredAgent);
          if (!agent || !pos) return null;

          const display = getAgentDisplay(agent.role);
          const tooltipX = (pos.x / canvasSize.width) * 100;
          const tooltipY = (pos.y / canvasSize.height) * 100;
          const showAbove = tooltipY > 50;

          return (
            <div
              className="pointer-events-none absolute z-10 rounded-lg bg-white/95 px-3 py-2 shadow-lg backdrop-blur"
              style={{
                left: `${Math.min(Math.max(tooltipX, 20), 80)}%`,
                top: showAbove ? `${tooltipY - 20}%` : `${tooltipY + 25}%`,
                transform: 'translateX(-50%)',
              }}
            >
              <div className="text-xs">
                <div className="font-semibold text-gray-800">
                  {display.icon} {agent.name}
                </div>
                <div className="mt-0.5 text-gray-500">
                  {agent.taskCount > 0
                    ? `任务: ${agent.completedCount}/${agent.taskCount} 完成`
                    : '暂无任务'}
                </div>
                {agent.status === 'working' && (
                  <div className="mt-0.5 text-blue-600">正在执行...</div>
                )}
              </div>
            </div>
          );
        })()}

      {/* Agent 详情弹窗 */}
      {selectedAgent &&
        (() => {
          const agent = agents.find((a) => a.id === selectedAgent);
          if (!agent) return null;

          const display = getAgentDisplay(agent.role);
          const roleInfo = getAgentRoleInfo(agent.role);

          return (
            <>
              {/* 背景遮罩 */}
              <div
                className="absolute inset-0 z-20 bg-black/10"
                onClick={() => onSelect(null)}
              />
              {/* 详情卡片 */}
              <div className="absolute left-1/2 top-1/2 z-30 w-[260px] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-4 shadow-xl">
                {/* 头部 */}
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{display.icon}</span>
                    <div>
                      <div className="font-semibold text-gray-800">
                        {agent.name}
                      </div>
                      <div className="text-xs text-gray-500">
                        {display.name}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => onSelect(null)}
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

                {/* 状态 */}
                <div className="mb-3 flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      agent.status === 'working'
                        ? 'bg-blue-100 text-blue-700'
                        : agent.status === 'completed'
                          ? 'bg-green-100 text-green-700'
                          : agent.status === 'error'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {agent.status === 'working'
                      ? '工作中'
                      : agent.status === 'completed'
                        ? '已完成'
                        : agent.status === 'error'
                          ? '出错'
                          : '空闲'}
                  </span>
                  {agent.taskCount > 0 && (
                    <span className="text-xs text-gray-500">
                      任务: {agent.completedCount}/{agent.taskCount}
                    </span>
                  )}
                </div>

                {/* 职责描述 */}
                <div className="mb-3">
                  <div className="mb-1 text-xs font-medium text-gray-500">
                    职责
                  </div>
                  <p className="text-sm text-gray-700">
                    {roleInfo.description}
                  </p>
                </div>

                {/* 技能列表 */}
                <div>
                  <div className="mb-1.5 text-xs font-medium text-gray-500">
                    能力
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {roleInfo.skills.map((skill, i) => (
                      <span
                        key={i}
                        className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </>
          );
        })()}
    </div>
  );
}

// ============================================
// Task Item - 简洁单行显示
// ============================================
function TaskItem({ task }: { task: TaskStatus }) {
  const icon = statusIcons[task.status] || '⏳';
  const colorClass = statusColors[task.status] || statusColors.PENDING;

  return (
    <div
      className={`flex items-center gap-2 rounded-md border border-gray-100 px-2.5 py-1.5 ${
        task.status === 'EXECUTING'
          ? 'border-blue-200 bg-blue-50/50'
          : task.status === 'COMPLETED'
            ? 'border-green-200 bg-green-50/30'
            : task.status === 'FAILED'
              ? 'border-red-200 bg-red-50/50'
              : 'bg-white'
      }`}
    >
      {/* 状态图标 */}
      <span className="text-xs">{icon}</span>

      {/* 任务名 */}
      <span className="min-w-0 flex-1 truncate text-xs text-gray-700">
        {task.dimensionName || task.title}
      </span>

      {/* 进度或状态 */}
      {task.status === 'EXECUTING' && task.progress !== undefined ? (
        <span
          className={`rounded-full px-1.5 py-0.5 text-[10px] ${colorClass}`}
        >
          {task.progress}%
        </span>
      ) : (
        <span
          className={`rounded-full px-1.5 py-0.5 text-[10px] ${colorClass}`}
        >
          {task.status === 'COMPLETED'
            ? '完成'
            : task.status === 'FAILED'
              ? '失败'
              : task.status === 'EXECUTING'
                ? '执行中'
                : task.status === 'NEEDS_REVISION'
                  ? '待修订'
                  : '待处理'}
        </span>
      )}
    </div>
  );
}
