'use client';

/**
 * Topic Research Canvas - 专题研究团队可视化组件
 *
 * 参考 AI Writing Canvas 设计，使用树形结构展示研究团队：
 * - 研究协调员 (Leader) 在顶部，带皇冠
 * - 各维度研究员以树形排列
 * - 报告撰写员在底部
 * - 连接线展示研究工作流程
 * - 进度徽章和实时状态指示
 */

import { useMemo } from 'react';
import type { TopicDimension } from '@/types/topic-research';
import { DimensionStatus } from '@/types/topic-research';

// 简化的刷新进度类型（匹配 store 中的定义）
interface SimpleRefreshProgress {
  phase: string;
  progress: number;
  message: string;
  currentDimension?: string;
  completedDimensions: number;
  totalDimensions: number;
}

// 研究团队基础配置
const RESEARCH_COORDINATOR = {
  id: 'coordinator',
  name: '研究协调员',
  role: 'leader' as const,
  icon: '🎯',
  bgColor: '#8B5CF6', // violet
  description: '协调研究流程，分配任务',
};

const QUALITY_REVIEWER = {
  id: 'reviewer',
  name: '质量审核员',
  role: 'reviewer' as const,
  icon: '🔍',
  bgColor: '#F59E0B', // amber
  description: '审核研究质量，检查广度深度',
};

const REPORT_SYNTHESIZER = {
  id: 'synthesizer',
  name: '报告撰写员',
  role: 'synthesizer' as const,
  icon: '📊',
  bgColor: '#EC4899', // pink
  description: '汇总分析结果，生成报告',
};

// 维度研究员图标和颜色映射
const DIMENSION_STYLES: Record<string, { icon: string; bgColor: string }> = {
  policy: { icon: '📜', bgColor: '#3B82F6' }, // blue
  market: { icon: '📈', bgColor: '#10B981' }, // green
  competition: { icon: '⚔️', bgColor: '#F59E0B' }, // amber
  technology: { icon: '💡', bgColor: '#6366F1' }, // indigo
  investment: { icon: '💰', bgColor: '#EF4444' }, // red
  talent: { icon: '👥', bgColor: '#06B6D4' }, // cyan
  international: { icon: '🌍', bgColor: '#8B5CF6' }, // violet
  application: { icon: '🔧', bgColor: '#F97316' }, // orange
  // 默认
  default: { icon: '🔍', bgColor: '#6B7280' }, // gray
};

// 根据维度名称推断样式
function getDimensionStyle(dimension: TopicDimension): {
  icon: string;
  bgColor: string;
} {
  const name = dimension.name.toLowerCase();
  if (name.includes('政策') || name.includes('法规'))
    return DIMENSION_STYLES.policy;
  if (name.includes('市场')) return DIMENSION_STYLES.market;
  if (name.includes('竞争')) return DIMENSION_STYLES.competition;
  if (name.includes('技术')) return DIMENSION_STYLES.technology;
  if (name.includes('投资') || name.includes('融资'))
    return DIMENSION_STYLES.investment;
  if (name.includes('人才')) return DIMENSION_STYLES.talent;
  if (name.includes('国际')) return DIMENSION_STYLES.international;
  if (name.includes('应用')) return DIMENSION_STYLES.application;
  return DIMENSION_STYLES.default;
}

interface TopicResearchCanvasProps {
  topicName: string;
  dimensions: TopicDimension[];
  isRefreshing: boolean;
  refreshProgress: SimpleRefreshProgress | null;
  onStartRefresh?: () => void;
  onCancelRefresh?: () => void;
  embedded?: boolean;
}

export function TopicResearchCanvas({
  topicName,
  dimensions,
  isRefreshing,
  refreshProgress,
  onStartRefresh,
  onCancelRefresh,
  embedded = false,
}: TopicResearchCanvasProps) {
  // 安全处理 dimensions
  const safeDimensions = dimensions || [];

  // 计算研究员状态
  const researchers = useMemo(() => {
    return safeDimensions.map((dim) => {
      const style = getDimensionStyle(dim);
      const isActive = refreshProgress?.currentDimension === dim.name;
      const isCompleted = dim.status === DimensionStatus.COMPLETED;
      const isFailed = dim.status === DimensionStatus.FAILED;

      return {
        id: dim.id,
        name: `${dim.name}研究员`,
        shortName: dim.name,
        role: 'researcher' as const,
        icon: style.icon,
        bgColor: style.bgColor,
        description: dim.description || '',
        isActive,
        isCompleted,
        isFailed,
        status: dim.status,
      };
    });
  }, [safeDimensions, refreshProgress?.currentDimension]);

  // 协调员状态
  const coordinatorStatus = useMemo(() => {
    const phase = refreshProgress?.phase;
    return {
      ...RESEARCH_COORDINATOR,
      isActive: phase === 'starting' || phase === 'researching',
      isCompleted: phase === 'completed',
      isFailed: phase === 'failed',
    };
  }, [refreshProgress?.phase]);

  // 审核员状态
  const reviewerStatus = useMemo(() => {
    const phase = refreshProgress?.phase;
    return {
      ...QUALITY_REVIEWER,
      isActive: phase === 'reviewing',
      isCompleted: phase === 'synthesizing' || phase === 'completed',
      isFailed: phase === 'failed',
    };
  }, [refreshProgress?.phase]);

  // 撰写员状态
  const synthesizerStatus = useMemo(() => {
    const phase = refreshProgress?.phase;
    return {
      ...REPORT_SYNTHESIZER,
      isActive: phase === 'synthesizing',
      isCompleted: phase === 'completed',
      isFailed: phase === 'failed',
    };
  }, [refreshProgress?.phase]);

  // 进度统计
  const stats = useMemo(() => {
    const completed = refreshProgress?.completedDimensions || 0;
    const total = refreshProgress?.totalDimensions || safeDimensions.length;
    const progress = refreshProgress?.progress || 0;
    return { completed, total, progress };
  }, [refreshProgress, safeDimensions.length]);

  // 计算节点位置
  const nodePositions = useMemo(() => {
    const canvasWidth = 800;
    const positions: Record<string, { x: number; y: number }> = {};

    // 协调员在顶部中央
    positions.coordinator = { x: canvasWidth / 2, y: 60 };

    // 研究员分布在中间区域（最多每行4个）
    const researchersPerRow = Math.min(4, researchers.length);
    const rows = Math.ceil(researchers.length / researchersPerRow);
    const startY = 180;
    const rowHeight = 120;

    researchers.forEach((_, index) => {
      const row = Math.floor(index / researchersPerRow);
      const col = index % researchersPerRow;
      const itemsInThisRow = Math.min(
        researchersPerRow,
        researchers.length - row * researchersPerRow
      );
      const rowWidth = itemsInThisRow * 160;
      const startX = (canvasWidth - rowWidth) / 2 + 80;

      positions[researchers[index].id] = {
        x: startX + col * 160,
        y: startY + row * rowHeight,
      };
    });

    // 审核员在研究员下方
    positions.reviewer = {
      x: canvasWidth / 2,
      y: startY + rows * rowHeight + 60,
    };

    // 撰写员在最底部
    positions.synthesizer = {
      x: canvasWidth / 2,
      y: startY + rows * rowHeight + 180,
    };

    return positions;
  }, [researchers]);

  // 计算画布高度
  const canvasHeight = useMemo(() => {
    const rows = Math.ceil(researchers.length / 4);
    return 180 + rows * 120 + 240 + 40; // 增加审核员层的高度
  }, [researchers.length]);

  return (
    <div
      className={`flex flex-col bg-gradient-to-br from-slate-50 via-white to-blue-50 ${
        embedded
          ? 'h-full rounded-xl border border-gray-200'
          : 'fixed inset-0 z-50'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white/90 px-6 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-slate-800">
            {topicName} - 研究团队
          </h2>
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${
              isRefreshing
                ? 'bg-blue-100 text-blue-700'
                : stats.progress >= 100
                  ? 'bg-green-100 text-green-700'
                  : 'bg-slate-100 text-slate-600'
            }`}
          >
            {isRefreshing
              ? '研究中'
              : stats.progress >= 100
                ? '已完成'
                : '待研究'}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* 进度统计 */}
          <div className="flex items-center gap-4 text-sm text-slate-600">
            <span>
              维度: {stats.completed}/{stats.total}
            </span>
            <span>进度: {Math.round(stats.progress)}%</span>
          </div>

          {/* 操作按钮 */}
          {isRefreshing ? (
            <button
              onClick={onCancelRefresh}
              className="rounded-lg bg-red-100 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-200"
            >
              取消研究
            </button>
          ) : (
            <button
              onClick={onStartRefresh}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              开始研究
            </button>
          )}
        </div>
      </div>

      {/* 进度消息 */}
      {isRefreshing && refreshProgress?.message && (
        <div className="border-b border-slate-200 bg-blue-50 px-6 py-2">
          <p className="text-sm text-blue-700">{refreshProgress.message}</p>
        </div>
      )}

      {/* Canvas */}
      <div className="flex-1 overflow-auto p-6">
        <svg
          width="100%"
          height={canvasHeight}
          viewBox={`0 0 800 ${canvasHeight}`}
          className="mx-auto"
        >
          {/* 背景网格 */}
          <defs>
            <pattern
              id="grid"
              width="40"
              height="40"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 40 0 L 0 0 0 40"
                fill="none"
                stroke="#e2e8f0"
                strokeWidth="0.5"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />

          {/* 连接线：协调员 -> 研究员 */}
          {researchers.map((researcher) => {
            const from = nodePositions.coordinator;
            const to = nodePositions[researcher.id];
            if (!from || !to) return null;

            const midY = (from.y + to.y) / 2;
            const path = `M ${from.x} ${from.y + 35} Q ${from.x} ${midY} ${to.x} ${to.y - 35}`;

            return (
              <path
                key={`coord-${researcher.id}`}
                d={path}
                fill="none"
                stroke={
                  researcher.isActive
                    ? '#3B82F6'
                    : researcher.isCompleted
                      ? '#10B981'
                      : '#CBD5E1'
                }
                strokeWidth={researcher.isActive ? 3 : 2}
                strokeDasharray={researcher.isCompleted ? 'none' : '5,5'}
                className={researcher.isActive ? 'animate-pulse' : ''}
              />
            );
          })}

          {/* 连接线：研究员 -> 审核员 */}
          {researchers.map((researcher) => {
            const from = nodePositions[researcher.id];
            const to = nodePositions.reviewer;
            if (!from || !to) return null;

            const midY = (from.y + to.y) / 2;
            const path = `M ${from.x} ${from.y + 35} Q ${from.x} ${midY} ${to.x} ${to.y - 35}`;

            return (
              <path
                key={`${researcher.id}-reviewer`}
                d={path}
                fill="none"
                stroke={researcher.isCompleted ? '#10B981' : '#CBD5E1'}
                strokeWidth={2}
                strokeDasharray={researcher.isCompleted ? 'none' : '5,5'}
              />
            );
          })}

          {/* 连接线：审核员 -> 撰写员 */}
          {(() => {
            const from = nodePositions.reviewer;
            const to = nodePositions.synthesizer;
            if (!from || !to) return null;

            const allCompleted = researchers.every((r) => r.isCompleted);
            const path = `M ${from.x} ${from.y + 35} L ${to.x} ${to.y - 35}`;

            return (
              <path
                d={path}
                fill="none"
                stroke={allCompleted ? '#10B981' : '#CBD5E1'}
                strokeWidth={3}
                strokeDasharray={allCompleted ? 'none' : '5,5'}
              />
            );
          })()}

          {/* 协调员节点 */}
          <AgentNode
            x={nodePositions.coordinator.x}
            y={nodePositions.coordinator.y}
            agent={coordinatorStatus}
            isLeader
          />

          {/* 研究员节点 */}
          {researchers.map((researcher) => {
            const pos = nodePositions[researcher.id];
            if (!pos) return null;
            return (
              <AgentNode
                key={researcher.id}
                x={pos.x}
                y={pos.y}
                agent={researcher}
              />
            );
          })}

          {/* 审核员节点 */}
          <AgentNode
            x={nodePositions.reviewer.x}
            y={nodePositions.reviewer.y}
            agent={reviewerStatus}
          />

          {/* 撰写员节点 */}
          <AgentNode
            x={nodePositions.synthesizer.x}
            y={nodePositions.synthesizer.y}
            agent={synthesizerStatus}
          />
        </svg>

        {/* 图例 */}
        <div className="mt-6 flex items-center justify-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-blue-500"></div>
            <span className="text-slate-600">研究中</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-green-500"></div>
            <span className="text-slate-600">已完成</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-red-500"></div>
            <span className="text-slate-600">失败</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-slate-300"></div>
            <span className="text-slate-600">待研究</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Agent 节点组件
interface AgentNodeProps {
  x: number;
  y: number;
  agent: {
    id: string;
    name: string;
    shortName?: string;
    icon: string;
    bgColor: string;
    description?: string;
    isActive?: boolean;
    isCompleted?: boolean;
    isFailed?: boolean;
  };
  isLeader?: boolean;
}

function AgentNode({ x, y, agent, isLeader }: AgentNodeProps) {
  const radius = isLeader ? 35 : 30;

  // 状态颜色
  const statusColor = agent.isActive
    ? '#3B82F6' // blue
    : agent.isFailed
      ? '#EF4444' // red
      : agent.isCompleted
        ? '#10B981' // green
        : '#9CA3AF'; // gray

  return (
    <g className="cursor-pointer">
      {/* 活跃时的多层闪光效果 */}
      {agent.isActive && (
        <>
          {/* 最外层扩散光环 */}
          <circle
            cx={x}
            cy={y}
            r={radius + 20}
            fill="none"
            stroke={statusColor}
            strokeWidth="2"
            opacity="0.2"
          >
            <animate
              attributeName="r"
              from={radius + 10}
              to={radius + 30}
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
          {/* 中层脉冲光环 */}
          <circle
            cx={x}
            cy={y}
            r={radius + 12}
            fill="none"
            stroke={statusColor}
            strokeWidth="3"
            opacity="0.5"
          >
            <animate
              attributeName="r"
              from={radius + 8}
              to={radius + 18}
              dur="1s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              from="0.6"
              to="0.1"
              dur="1s"
              repeatCount="indefinite"
            />
          </circle>
          {/* 内层呼吸光环 */}
          <circle cx={x} cy={y} r={radius + 6} fill={statusColor} opacity="0.3">
            <animate
              attributeName="opacity"
              values="0.3;0.6;0.3"
              dur="0.8s"
              repeatCount="indefinite"
            />
          </circle>
        </>
      )}

      {/* 状态环 */}
      <circle
        cx={x}
        cy={y}
        r={radius + 4}
        fill="none"
        stroke={statusColor}
        strokeWidth={agent.isActive ? 4 : 3}
      >
        {agent.isActive && (
          <animate
            attributeName="stroke-width"
            values="3;5;3"
            dur="0.6s"
            repeatCount="indefinite"
          />
        )}
      </circle>

      {/* 主圆 */}
      <circle
        cx={x}
        cy={y}
        r={radius}
        fill={agent.bgColor}
        className="drop-shadow-lg"
      >
        {agent.isActive && (
          <animate
            attributeName="r"
            values={`${radius};${radius + 2};${radius}`}
            dur="0.6s"
            repeatCount="indefinite"
          />
        )}
      </circle>

      {/* 图标 */}
      <text
        x={x}
        y={y + 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={isLeader ? 24 : 20}
      >
        {agent.icon}
      </text>

      {/* Leader 皇冠 */}
      {isLeader && (
        <text x={x} y={y - radius - 8} textAnchor="middle" fontSize="16">
          👑
        </text>
      )}

      {/* 名称 */}
      <text
        x={x}
        y={y + radius + 18}
        textAnchor="middle"
        fontSize="12"
        fontWeight="500"
        fill="#374151"
      >
        {agent.shortName || agent.name}
      </text>

      {/* 状态标签 */}
      {(agent.isActive || agent.isCompleted || agent.isFailed) && (
        <g>
          <rect
            x={x - 20}
            y={y + radius + 28}
            width="40"
            height="16"
            rx="8"
            fill={statusColor}
          />
          <text
            x={x}
            y={y + radius + 39}
            textAnchor="middle"
            fontSize="9"
            fill="white"
            fontWeight="500"
          >
            {agent.isActive ? '研究中' : agent.isFailed ? '失败' : '完成'}
          </text>
        </g>
      )}
    </g>
  );
}
