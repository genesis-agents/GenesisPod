'use client';

/**
 * Topic Team Panel - 紧凑型研究团队面板
 *
 * 参考 AI Writing 的 WritingCanvasView 设计，用于左侧边栏
 * 包含：团队 Canvas、进度条、操作按钮、图例
 */

import { useMemo } from 'react';
import type { TopicDimension } from '@/types/topic-research';
import { DimensionStatus } from '@/types/topic-research';

// 简化的刷新进度类型
interface SimpleRefreshProgress {
  phase: string;
  progress: number;
  message: string;
  currentDimension?: string;
  completedDimensions: number;
  totalDimensions: number;
}

// 研究团队配置
const RESEARCH_COORDINATOR = {
  id: 'coordinator',
  name: '研究协调员',
  icon: '🎯',
  bgColor: '#8B5CF6',
};

const QUALITY_REVIEWER = {
  id: 'reviewer',
  name: '质量审核',
  icon: '🔍',
  bgColor: '#F59E0B',
};

const REPORT_SYNTHESIZER = {
  id: 'synthesizer',
  name: '报告撰写',
  icon: '📊',
  bgColor: '#EC4899',
};

// 维度样式映射
const DIMENSION_STYLES: Record<string, { icon: string; bgColor: string }> = {
  policy: { icon: '📜', bgColor: '#3B82F6' },
  market: { icon: '📈', bgColor: '#10B981' },
  competition: { icon: '⚔️', bgColor: '#F59E0B' },
  technology: { icon: '💡', bgColor: '#6366F1' },
  investment: { icon: '💰', bgColor: '#EF4444' },
  talent: { icon: '👥', bgColor: '#06B6D4' },
  international: { icon: '🌍', bgColor: '#8B5CF6' },
  application: { icon: '🔧', bgColor: '#F97316' },
  default: { icon: '🔍', bgColor: '#6B7280' },
};

function getDimensionStyle(name: string): { icon: string; bgColor: string } {
  const lowerName = name.toLowerCase();
  if (lowerName.includes('政策') || lowerName.includes('法规'))
    return DIMENSION_STYLES.policy;
  if (lowerName.includes('市场')) return DIMENSION_STYLES.market;
  if (lowerName.includes('竞争')) return DIMENSION_STYLES.competition;
  if (lowerName.includes('技术')) return DIMENSION_STYLES.technology;
  if (lowerName.includes('投资') || lowerName.includes('融资'))
    return DIMENSION_STYLES.investment;
  if (lowerName.includes('人才')) return DIMENSION_STYLES.talent;
  if (lowerName.includes('国际')) return DIMENSION_STYLES.international;
  if (lowerName.includes('应用')) return DIMENSION_STYLES.application;
  return DIMENSION_STYLES.default;
}

interface TopicTeamPanelProps {
  topicName: string;
  dimensions: TopicDimension[];
  isRefreshing: boolean;
  refreshProgress: SimpleRefreshProgress | null;
  onStartRefresh?: () => void;
  onCancelRefresh?: () => void;
}

export function TopicTeamPanel({
  topicName,
  dimensions,
  isRefreshing,
  refreshProgress,
  onStartRefresh,
  onCancelRefresh,
}: TopicTeamPanelProps) {
  const safeDimensions = dimensions || [];

  // 计算研究员状态
  const researchers = useMemo(() => {
    return safeDimensions.map((dim, index) => {
      const style = getDimensionStyle(dim.name);
      const isActive = refreshProgress?.currentDimension === dim.name;

      let isCompleted = false;
      let isFailed = false;

      if (isRefreshing && refreshProgress) {
        isCompleted = index < refreshProgress.completedDimensions;
        isFailed = false;
      } else {
        isCompleted = dim.status === DimensionStatus.COMPLETED;
        isFailed = dim.status === DimensionStatus.FAILED;
      }

      return {
        id: dim.id,
        name: dim.name,
        icon: style.icon,
        bgColor: style.bgColor,
        isActive,
        isCompleted,
        isFailed,
      };
    });
  }, [safeDimensions, refreshProgress, isRefreshing]);

  // 协调员状态
  const coordinatorStatus = useMemo(() => {
    const phase = refreshProgress?.phase;
    const isActive =
      (isRefreshing && !phase) ||
      phase === 'starting' ||
      phase === 'researching';
    return {
      ...RESEARCH_COORDINATOR,
      isActive,
      isCompleted: phase === 'completed',
    };
  }, [refreshProgress?.phase, isRefreshing]);

  // 审核员状态
  const reviewerStatus = useMemo(() => {
    const phase = refreshProgress?.phase;
    return {
      ...QUALITY_REVIEWER,
      isActive: phase === 'reviewing',
      isCompleted: phase === 'synthesizing' || phase === 'completed',
    };
  }, [refreshProgress?.phase]);

  // 撰写员状态
  const synthesizerStatus = useMemo(() => {
    const phase = refreshProgress?.phase;
    return {
      ...REPORT_SYNTHESIZER,
      isActive: phase === 'synthesizing',
      isCompleted: phase === 'completed',
    };
  }, [refreshProgress?.phase]);

  // 进度统计
  const stats = useMemo(() => {
    const completed = refreshProgress?.completedDimensions || 0;
    const total = refreshProgress?.totalDimensions || safeDimensions.length;
    const progress = refreshProgress?.progress || 0;
    return { completed, total, progress };
  }, [refreshProgress, safeDimensions.length]);

  // 计算紧凑型布局的节点位置
  const canvasWidth = 320;
  const canvasHeight = 340;

  const nodePositions = useMemo(() => {
    const positions: Record<string, { x: number; y: number }> = {};
    const centerX = canvasWidth / 2;

    // 协调员在顶部
    positions.coordinator = { x: centerX, y: 45 };

    // 研究员分两行布局
    const maxPerRow = 3;
    const rows = Math.ceil(researchers.length / maxPerRow);
    const startY = 120;
    const rowGap = 70;

    researchers.forEach((_, index) => {
      const row = Math.floor(index / maxPerRow);
      const col = index % maxPerRow;
      const itemsInRow = Math.min(
        maxPerRow,
        researchers.length - row * maxPerRow
      );
      const totalWidth = itemsInRow * 90;
      const startX = (canvasWidth - totalWidth) / 2 + 45;

      positions[researchers[index].id] = {
        x: startX + col * 90,
        y: startY + row * rowGap,
      };
    });

    // 审核员和撰写员在底部
    const bottomY = startY + rows * rowGap + 40;
    positions.reviewer = { x: centerX - 60, y: bottomY };
    positions.synthesizer = { x: centerX + 60, y: bottomY };

    return positions;
  }, [researchers]);

  // 阶段映射
  const phaseDisplay: Record<string, string> = {
    idle: '空闲',
    starting: '启动中',
    researching: '研究中',
    reviewing: '审核中',
    synthesizing: '生成报告',
    completed: '已完成',
    failed: '失败',
  };

  return (
    <div className="flex h-full flex-col bg-white">
      {/* 头部信息 */}
      <div className="border-b border-gray-100 px-4 py-3">
        <div className="flex items-center justify-between">
          <h3 className="truncate text-sm font-semibold text-gray-800">
            {topicName}
          </h3>
          <span
            className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
              isRefreshing
                ? 'bg-blue-100 text-blue-700'
                : stats.progress >= 100
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-600'
            }`}
          >
            {refreshProgress?.phase
              ? phaseDisplay[refreshProgress.phase] || refreshProgress.phase
              : isRefreshing
                ? '研究中'
                : stats.progress >= 100
                  ? '已完成'
                  : '待研究'}
          </span>
        </div>

        {/* 进度条 */}
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-xs text-gray-500">
            <span>研究进度</span>
            <span>
              {stats.completed} / {stats.total} 维度
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div
              className={`h-full transition-all duration-500 ${
                isRefreshing ? 'bg-blue-500' : 'bg-green-500'
              }`}
              style={{ width: `${Math.min(stats.progress, 100)}%` }}
            />
          </div>
        </div>

        {/* 当前消息 */}
        {isRefreshing && refreshProgress?.message && (
          <p className="mt-2 truncate text-xs text-blue-600">
            {refreshProgress.message}
          </p>
        )}
      </div>

      {/* Canvas 区域 */}
      <div className="flex-1 overflow-hidden">
        <svg
          viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
          className="h-full w-full"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* 背景网格 */}
          <defs>
            <pattern
              id="team-grid"
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
          <rect width="100%" height="100%" fill="url(#team-grid)" />

          {/* 连接线：协调员 -> 研究员 */}
          {researchers.map((researcher) => {
            const from = nodePositions.coordinator;
            const to = nodePositions[researcher.id];
            if (!from || !to) return null;

            return (
              <line
                key={`coord-${researcher.id}`}
                x1={from.x}
                y1={from.y + 20}
                x2={to.x}
                y2={to.y - 20}
                stroke={
                  researcher.isActive
                    ? '#3B82F6'
                    : researcher.isCompleted
                      ? '#10B981'
                      : '#E5E7EB'
                }
                strokeWidth={researcher.isActive ? 2 : 1.5}
                strokeDasharray={
                  researcher.isCompleted || researcher.isActive ? 'none' : '3,3'
                }
                className={researcher.isActive ? 'animate-pulse' : ''}
              />
            );
          })}

          {/* 连接线：研究员 -> 底部节点 */}
          {researchers.map((researcher) => {
            const from = nodePositions[researcher.id];
            const toReviewer = nodePositions.reviewer;
            const toSynthesizer = nodePositions.synthesizer;
            if (!from || !toReviewer || !toSynthesizer) return null;

            // 连接到最近的底部节点
            const target =
              from.x < canvasWidth / 2 ? toReviewer : toSynthesizer;

            return (
              <line
                key={`${researcher.id}-bottom`}
                x1={from.x}
                y1={from.y + 20}
                x2={target.x}
                y2={target.y - 20}
                stroke={researcher.isCompleted ? '#10B981' : '#E5E7EB'}
                strokeWidth={1.5}
                strokeDasharray={researcher.isCompleted ? 'none' : '3,3'}
              />
            );
          })}

          {/* 协调员节点 */}
          <CompactAgentNode
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
              <CompactAgentNode
                key={researcher.id}
                x={pos.x}
                y={pos.y}
                agent={researcher}
              />
            );
          })}

          {/* 审核员节点 */}
          <CompactAgentNode
            x={nodePositions.reviewer.x}
            y={nodePositions.reviewer.y}
            agent={reviewerStatus}
          />

          {/* 撰写员节点 */}
          <CompactAgentNode
            x={nodePositions.synthesizer.x}
            y={nodePositions.synthesizer.y}
            agent={synthesizerStatus}
          />
        </svg>
      </div>

      {/* 图例 */}
      <div className="border-t border-gray-100 px-4 py-2">
        <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-gray-500">
          <div className="flex items-center gap-1">
            <div className="h-2 w-2 animate-pulse rounded-full bg-blue-500"></div>
            <span>研究中</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-green-500"></div>
            <span>已完成</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-red-500"></div>
            <span>失败</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-gray-300"></div>
            <span>待研究</span>
          </div>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="border-t border-gray-100 p-3">
        <div className="flex gap-2">
          {isRefreshing ? (
            <button
              onClick={onCancelRefresh}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-100"
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
              取消研究
            </button>
          ) : (
            <button
              onClick={onStartRefresh}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
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
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              开始研究
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// 紧凑型 Agent 节点
interface CompactAgentNodeProps {
  x: number;
  y: number;
  agent: {
    id: string;
    name: string;
    icon: string;
    bgColor: string;
    isActive?: boolean;
    isCompleted?: boolean;
    isFailed?: boolean;
  };
  isLeader?: boolean;
}

function CompactAgentNode({ x, y, agent, isLeader }: CompactAgentNodeProps) {
  const radius = isLeader ? 22 : 18;

  const statusColor = agent.isActive
    ? '#3B82F6'
    : agent.isFailed
      ? '#EF4444'
      : agent.isCompleted
        ? '#10B981'
        : '#D1D5DB';

  return (
    <g className="cursor-pointer">
      {/* 活跃状态光晕 */}
      {agent.isActive && (
        <>
          <circle
            cx={x}
            cy={y}
            r={radius + 10}
            fill="none"
            stroke={statusColor}
            strokeWidth="1.5"
            opacity="0.3"
          >
            <animate
              attributeName="r"
              from={radius + 6}
              to={radius + 16}
              dur="1.2s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              from="0.4"
              to="0"
              dur="1.2s"
              repeatCount="indefinite"
            />
          </circle>
          <circle cx={x} cy={y} r={radius + 4} fill={statusColor} opacity="0.2">
            <animate
              attributeName="opacity"
              values="0.2;0.4;0.2"
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
        r={radius + 2}
        fill="none"
        stroke={statusColor}
        strokeWidth={agent.isActive ? 2.5 : 2}
      />

      {/* 主圆 */}
      <circle
        cx={x}
        cy={y}
        r={radius}
        fill={agent.bgColor}
        className="drop-shadow-sm"
      />

      {/* 图标 */}
      <text
        x={x}
        y={y + 1}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={isLeader ? 14 : 12}
      >
        {agent.icon}
      </text>

      {/* Leader 皇冠 */}
      {isLeader && (
        <text x={x} y={y - radius - 4} textAnchor="middle" fontSize="10">
          👑
        </text>
      )}

      {/* 名称 */}
      <text
        x={x}
        y={y + radius + 12}
        textAnchor="middle"
        fontSize="9"
        fontWeight="500"
        fill="#4B5563"
      >
        {agent.name.length > 6 ? agent.name.slice(0, 6) : agent.name}
      </text>
    </g>
  );
}
