'use client';

/**
 * Topic Team Panel - Minimalist Business Style
 *
 * Clean, professional design with:
 * - Simple geometric shapes
 * - Muted color palette (grays, subtle blues)
 * - Clear hierarchy without clutter
 */

import { useMemo } from 'react';
import type { TopicDimension } from '@/types/topic-research';
import { DimensionStatus } from '@/types/topic-research';

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
  dimensions: TopicDimension[];
  isRefreshing: boolean;
  refreshProgress: SimpleRefreshProgress | null;
  onStartRefresh?: () => void;
  onCancelRefresh?: () => void;
}

// Phase display mapping
const phaseDisplay: Record<string, string> = {
  idle: '待研究',
  starting: '启动中',
  researching: '研究中',
  reviewing: '审核中',
  synthesizing: '生成报告',
  completed: '已完成',
  failed: '失败',
};

export function TopicTeamPanel({
  topicName,
  dimensions,
  isRefreshing,
  refreshProgress,
  onStartRefresh,
  onCancelRefresh,
}: TopicTeamPanelProps) {
  const safeDimensions = dimensions || [];

  // Calculate researcher states
  const researchers = useMemo(() => {
    return safeDimensions.map((dim, index) => {
      const isActive = refreshProgress?.currentDimension === dim.name;
      let isCompleted = false;
      let isFailed = false;

      if (isRefreshing && refreshProgress) {
        isCompleted = index < refreshProgress.completedDimensions;
      } else {
        isCompleted = dim.status === DimensionStatus.COMPLETED;
        isFailed = dim.status === DimensionStatus.FAILED;
      }

      return {
        id: dim.id,
        name: dim.name,
        isActive,
        isCompleted,
        isFailed,
      };
    });
  }, [safeDimensions, refreshProgress, isRefreshing]);

  // Progress stats
  const stats = useMemo(() => {
    const completed = refreshProgress?.completedDimensions || 0;
    const total = refreshProgress?.totalDimensions || safeDimensions.length;
    const progress = refreshProgress?.progress || 0;
    return { completed, total, progress };
  }, [refreshProgress, safeDimensions.length]);

  // Current phase
  const currentPhase =
    refreshProgress?.phase || (stats.progress >= 100 ? 'completed' : 'idle');

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Header */}
      <div className="border-b border-gray-100 px-4 py-3">
        <div className="flex items-center justify-between">
          <h3 className="truncate text-sm font-medium text-gray-700">
            {topicName}
          </h3>
          <span
            className={`flex-shrink-0 rounded px-2 py-0.5 text-xs font-medium ${
              isRefreshing
                ? 'bg-blue-50 text-blue-600'
                : stats.progress >= 100
                  ? 'bg-green-50 text-green-600'
                  : 'bg-gray-50 text-gray-500'
            }`}
          >
            {phaseDisplay[currentPhase] || currentPhase}
          </span>
        </div>

        {/* Progress bar */}
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-xs text-gray-400">
            <span>研究进度</span>
            <span>
              {stats.completed} / {stats.total}
            </span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-gray-100">
            <div
              className={`h-full transition-all duration-500 ${
                isRefreshing ? 'bg-blue-500' : 'bg-green-500'
              }`}
              style={{ width: `${Math.min(stats.progress, 100)}%` }}
            />
          </div>
        </div>

        {/* Current message */}
        {isRefreshing && refreshProgress?.message && (
          <p className="mt-2 truncate text-xs text-blue-500">
            {refreshProgress.message}
          </p>
        )}
      </div>

      {/* Team Visualization - Minimalist Style */}
      <div className="flex-1 overflow-hidden p-4">
        <MinimalistTeamCanvas
          researchers={researchers}
          isRefreshing={isRefreshing}
          currentPhase={currentPhase}
        />
      </div>

      {/* Legend */}
      <div className="border-t border-gray-100 px-4 py-2">
        <div className="flex items-center justify-center gap-4 text-xs text-gray-400">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-blue-500" />
            <span>研究中</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-green-500" />
            <span>完成</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-gray-300" />
            <span>待研究</span>
          </div>
        </div>
      </div>

      {/* Action Button */}
      <div className="border-t border-gray-100 p-3">
        {isRefreshing ? (
          <button
            onClick={onCancelRefresh}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
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
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800"
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
                d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            开始研究
          </button>
        )}
      </div>
    </div>
  );
}

// Minimalist Team Canvas Component
interface MinimalistTeamCanvasProps {
  researchers: Array<{
    id: string;
    name: string;
    isActive: boolean;
    isCompleted: boolean;
    isFailed: boolean;
  }>;
  isRefreshing: boolean;
  currentPhase: string;
}

function MinimalistTeamCanvas({
  researchers,
  isRefreshing,
  currentPhase,
}: MinimalistTeamCanvasProps) {
  const canvasWidth = 320;
  const canvasHeight = 320;

  // Calculate positions for a clean hierarchical layout
  const nodePositions = useMemo(() => {
    const positions: Record<string, { x: number; y: number }> = {};
    const centerX = canvasWidth / 2;

    // Coordinator at top
    positions.coordinator = { x: centerX, y: 40 };

    // Researchers in rows (max 3 per row)
    const maxPerRow = 3;
    const rowGap = 65;
    const startY = 110;

    researchers.forEach((_, index) => {
      const row = Math.floor(index / maxPerRow);
      const col = index % maxPerRow;
      const itemsInRow = Math.min(
        maxPerRow,
        researchers.length - row * maxPerRow
      );
      const colWidth = 85;
      const totalWidth = itemsInRow * colWidth;
      const startX = (canvasWidth - totalWidth) / 2 + colWidth / 2;

      positions[researchers[index].id] = {
        x: startX + col * colWidth,
        y: startY + row * rowGap,
      };
    });

    // Bottom row: Reviewer and Synthesizer
    const rows = Math.ceil(researchers.length / maxPerRow);
    const bottomY = startY + rows * rowGap + 20;
    positions.reviewer = { x: centerX - 50, y: bottomY };
    positions.synthesizer = { x: centerX + 50, y: bottomY };

    return positions;
  }, [researchers]);

  // Coordinator state
  const coordinatorActive =
    isRefreshing && ['starting', 'researching'].includes(currentPhase);
  const coordinatorCompleted = currentPhase === 'completed';

  // Reviewer state
  const reviewerActive = currentPhase === 'reviewing';
  const reviewerCompleted = ['synthesizing', 'completed'].includes(
    currentPhase
  );

  // Synthesizer state
  const synthesizerActive = currentPhase === 'synthesizing';
  const synthesizerCompleted = currentPhase === 'completed';

  return (
    <svg
      viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
      className="h-full w-full"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Subtle grid pattern */}
      <defs>
        <pattern
          id="minimalist-grid"
          width="40"
          height="40"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="20" cy="20" r="0.5" fill="#e5e7eb" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#minimalist-grid)" />

      {/* Connection lines - simple straight lines */}
      {researchers.map((researcher) => {
        const from = nodePositions.coordinator;
        const to = nodePositions[researcher.id];
        if (!from || !to) return null;

        return (
          <line
            key={`coord-${researcher.id}`}
            x1={from.x}
            y1={from.y + 16}
            x2={to.x}
            y2={to.y - 16}
            stroke={
              researcher.isCompleted
                ? '#10b981'
                : researcher.isActive
                  ? '#3b82f6'
                  : '#e5e7eb'
            }
            strokeWidth={1}
            strokeDasharray={
              researcher.isCompleted || researcher.isActive ? '0' : '4 2'
            }
          />
        );
      })}

      {/* Lines from researchers to bottom nodes */}
      {researchers.map((researcher, index) => {
        const from = nodePositions[researcher.id];
        const toNode =
          index < researchers.length / 2 ? 'reviewer' : 'synthesizer';
        const to = nodePositions[toNode];
        if (!from || !to) return null;

        return (
          <line
            key={`${researcher.id}-bottom`}
            x1={from.x}
            y1={from.y + 16}
            x2={to.x}
            y2={to.y - 16}
            stroke={researcher.isCompleted ? '#d1d5db' : '#e5e7eb'}
            strokeWidth={1}
            strokeDasharray="4 2"
          />
        );
      })}

      {/* Coordinator Node */}
      <MinimalistNode
        x={nodePositions.coordinator.x}
        y={nodePositions.coordinator.y}
        label="协调"
        isActive={coordinatorActive}
        isCompleted={coordinatorCompleted}
        isLeader
      />

      {/* Researcher Nodes */}
      {researchers.map((researcher) => {
        const pos = nodePositions[researcher.id];
        if (!pos) return null;
        return (
          <MinimalistNode
            key={researcher.id}
            x={pos.x}
            y={pos.y}
            label={
              researcher.name.length > 4
                ? researcher.name.slice(0, 4)
                : researcher.name
            }
            isActive={researcher.isActive}
            isCompleted={researcher.isCompleted}
            isFailed={researcher.isFailed}
          />
        );
      })}

      {/* Reviewer Node */}
      <MinimalistNode
        x={nodePositions.reviewer.x}
        y={nodePositions.reviewer.y}
        label="审核"
        isActive={reviewerActive}
        isCompleted={reviewerCompleted}
      />

      {/* Synthesizer Node */}
      <MinimalistNode
        x={nodePositions.synthesizer.x}
        y={nodePositions.synthesizer.y}
        label="撰写"
        isActive={synthesizerActive}
        isCompleted={synthesizerCompleted}
      />
    </svg>
  );
}

// Minimalist Node Component
interface MinimalistNodeProps {
  x: number;
  y: number;
  label: string;
  isActive?: boolean;
  isCompleted?: boolean;
  isFailed?: boolean;
  isLeader?: boolean;
}

function MinimalistNode({
  x,
  y,
  label,
  isActive,
  isCompleted,
  isFailed,
  isLeader,
}: MinimalistNodeProps) {
  const radius = isLeader ? 18 : 14;

  // Determine colors
  let fillColor = '#f3f4f6'; // gray-100
  let strokeColor = '#d1d5db'; // gray-300
  let textColor = '#6b7280'; // gray-500

  if (isActive) {
    fillColor = '#eff6ff'; // blue-50
    strokeColor = '#3b82f6'; // blue-500
    textColor = '#3b82f6';
  } else if (isCompleted) {
    fillColor = '#f0fdf4'; // green-50
    strokeColor = '#10b981'; // green-500
    textColor = '#10b981';
  } else if (isFailed) {
    fillColor = '#fef2f2'; // red-50
    strokeColor = '#ef4444'; // red-500
    textColor = '#ef4444';
  } else if (isLeader) {
    fillColor = '#f9fafb'; // gray-50
    strokeColor = '#6b7280'; // gray-500
    textColor = '#374151'; // gray-700
  }

  return (
    <g>
      {/* Active glow effect - subtle */}
      {isActive && (
        <circle
          cx={x}
          cy={y}
          r={radius + 6}
          fill="none"
          stroke={strokeColor}
          strokeWidth={1}
          opacity={0.3}
        >
          <animate
            attributeName="r"
            from={radius + 4}
            to={radius + 10}
            dur="1.5s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            from="0.3"
            to="0"
            dur="1.5s"
            repeatCount="indefinite"
          />
        </circle>
      )}

      {/* Main circle */}
      <circle
        cx={x}
        cy={y}
        r={radius}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={1.5}
      />

      {/* Status indicator dot */}
      {(isActive || isCompleted) && (
        <circle
          cx={x + radius - 2}
          cy={y - radius + 2}
          r={4}
          fill={isActive ? '#3b82f6' : '#10b981'}
        >
          {isActive && (
            <animate
              attributeName="opacity"
              values="1;0.5;1"
              dur="1s"
              repeatCount="indefinite"
            />
          )}
        </circle>
      )}

      {/* Label */}
      <text
        x={x}
        y={y + radius + 14}
        textAnchor="middle"
        fontSize={10}
        fontWeight={500}
        fill={textColor}
      >
        {label}
      </text>

      {/* Leader indicator */}
      {isLeader && (
        <text
          x={x}
          y={y + 1}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={12}
          fill={textColor}
        >
          C
        </text>
      )}
    </g>
  );
}
