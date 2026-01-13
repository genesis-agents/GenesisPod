'use client';

/**
 * Topic Team Panel - Leader-driven Research Panel
 *
 * v7.0: 参照 AI Writing 设计
 * - 顶部：简洁团队可视化
 * - 中间：任务清单（显示 Leader 规划的步骤）
 * - 底部：进度条 + 操作按钮
 */

import { useState, useMemo } from 'react';
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
}

// 任务类型显示名称
const taskTypeLabels: Record<string, string> = {
  dimension_research: '维度研究',
  quality_review: '质量审核',
  report_synthesis: '报告撰写',
};

// 状态图标映射
const statusIcons: Record<string, string> = {
  PENDING: '○',
  EXECUTING: '◐',
  COMPLETED: '✓',
  FAILED: '✕',
  NEEDS_REVISION: '↻',
};

// 状态颜色映射
const statusColors: Record<
  string,
  { bg: string; text: string; border: string }
> = {
  PENDING: {
    bg: 'bg-gray-50',
    text: 'text-gray-500',
    border: 'border-gray-200',
  },
  EXECUTING: {
    bg: 'bg-blue-50',
    text: 'text-blue-600',
    border: 'border-blue-300',
  },
  COMPLETED: {
    bg: 'bg-green-50',
    text: 'text-green-600',
    border: 'border-green-300',
  },
  FAILED: { bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-300' },
  NEEDS_REVISION: {
    bg: 'bg-yellow-50',
    text: 'text-yellow-600',
    border: 'border-yellow-300',
  },
};

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

export function TopicTeamPanel({
  topicName,
  missionStatus,
  isRefreshing,
  refreshProgress,
  onStartRefresh,
  onCancelRefresh,
}: TopicTeamPanelProps) {
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());

  // 从 missionStatus 提取任务
  const tasks = missionStatus?.tasks || [];

  // 按类型分组任务
  const taskGroups = useMemo(() => {
    const dimensionTasks = tasks.filter(
      (t) => t.taskType === 'dimension_research'
    );
    const reviewTask = tasks.find((t) => t.taskType === 'quality_review');
    const synthesisTask = tasks.find((t) => t.taskType === 'report_synthesis');
    return { dimensionTasks, reviewTask, synthesisTask };
  }, [tasks]);

  // 计算统计
  const stats = useMemo(() => {
    const completed = missionStatus?.completedTasks || 0;
    const total = missionStatus?.totalTasks || 0;
    const progress = missionStatus?.progress || 0;
    const executing = tasks.filter((t) => t.status === 'EXECUTING').length;
    const failed = tasks.filter((t) => t.status === 'FAILED').length;
    return { completed, total, progress, executing, failed };
  }, [missionStatus, tasks]);

  // 当前阶段
  const currentPhase =
    missionStatus?.currentPhase || refreshProgress?.phase || 'idle';
  const hasMission = !!missionStatus && tasks.length > 0;

  const toggleTask = (taskId: string) => {
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Header */}
      <div className="border-b border-gray-100 px-4 py-3">
        <div className="flex items-center justify-between">
          <h3 className="truncate text-sm font-medium text-gray-800">
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
          <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
            <span className="text-green-600">✓ {stats.completed}</span>
            {stats.executing > 0 && (
              <span className="text-blue-600">◐ {stats.executing}</span>
            )}
            {stats.failed > 0 && (
              <span className="text-red-600">✕ {stats.failed}</span>
            )}
            <span className="text-gray-400">共 {stats.total} 个任务</span>
          </div>
        )}

        {/* Progress bar */}
        <div className="mt-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
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

      {/* Team Visualization - Compact */}
      <div className="border-b border-gray-100 px-4 py-3">
        <CompactTeamVisualization
          dimensionCount={taskGroups.dimensionTasks.length}
          hasReviewer={!!taskGroups.reviewTask}
          hasSynthesizer={!!taskGroups.synthesisTask}
          isRefreshing={isRefreshing}
          currentPhase={currentPhase}
        />
      </div>

      {/* Task List */}
      <div className="flex-1 overflow-y-auto">
        {!hasMission ? (
          <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
              <span className="text-xl">👑</span>
            </div>
            <p className="text-sm font-medium text-gray-700">
              等待 Leader 规划
            </p>
            <p className="mt-1 text-xs text-gray-500">
              点击"开始研究"后，Leader 将分析任务并分配研究员
            </p>
          </div>
        ) : (
          <div className="space-y-2 p-3">
            {/* 维度研究任务 */}
            {taskGroups.dimensionTasks.length > 0 && (
              <div className="mb-3">
                <div className="mb-2 flex items-center gap-2 text-xs font-medium text-gray-500">
                  <span className="h-4 w-4 rounded bg-blue-100 text-center text-blue-600">
                    🔍
                  </span>
                  <span>维度研究 ({taskGroups.dimensionTasks.length})</span>
                </div>
                {taskGroups.dimensionTasks.map((task) => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    isExpanded={expandedTasks.has(task.id)}
                    onToggle={() => toggleTask(task.id)}
                  />
                ))}
              </div>
            )}

            {/* 质量审核任务 */}
            {taskGroups.reviewTask && (
              <div className="mb-3">
                <div className="mb-2 flex items-center gap-2 text-xs font-medium text-gray-500">
                  <span className="h-4 w-4 rounded bg-green-100 text-center text-green-600">
                    ✓
                  </span>
                  <span>质量审核</span>
                </div>
                <TaskItem
                  task={taskGroups.reviewTask}
                  isExpanded={expandedTasks.has(taskGroups.reviewTask.id)}
                  onToggle={() => toggleTask(taskGroups.reviewTask!.id)}
                />
              </div>
            )}

            {/* 报告撰写任务 */}
            {taskGroups.synthesisTask && (
              <div>
                <div className="mb-2 flex items-center gap-2 text-xs font-medium text-gray-500">
                  <span className="h-4 w-4 rounded bg-orange-100 text-center text-orange-600">
                    📊
                  </span>
                  <span>报告撰写</span>
                </div>
                <TaskItem
                  task={taskGroups.synthesisTask}
                  isExpanded={expandedTasks.has(taskGroups.synthesisTask.id)}
                  onToggle={() => toggleTask(taskGroups.synthesisTask!.id)}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="border-t border-gray-100 p-3">
        {isRefreshing ? (
          <button
            onClick={onCancelRefresh}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
          >
            <span>□</span>
            取消任务
          </button>
        ) : (
          <button
            onClick={onStartRefresh}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            <span>▶</span>
            开始研究
          </button>
        )}
      </div>
    </div>
  );
}

// 紧凑型团队可视化
function CompactTeamVisualization({
  dimensionCount,
  hasReviewer,
  hasSynthesizer,
  isRefreshing,
  currentPhase,
}: {
  dimensionCount: number;
  hasReviewer: boolean;
  hasSynthesizer: boolean;
  isRefreshing: boolean;
  currentPhase: string;
}) {
  const showPlaceholder = dimensionCount === 0;

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Leader */}
      <div className="flex flex-col items-center">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-full border-2 ${
            isRefreshing
              ? 'border-purple-400 bg-purple-50'
              : 'border-gray-300 bg-gray-50'
          }`}
        >
          <span className="text-lg">👑</span>
        </div>
        <span className="mt-1 text-xs text-purple-600">Leader</span>
      </div>

      {/* Connection line */}
      <div
        className={`h-4 w-px ${isRefreshing ? 'bg-purple-300' : 'bg-gray-200'}`}
      />

      {/* Researchers row */}
      <div className="flex items-center justify-center gap-2">
        {showPlaceholder ? (
          // 占位符 - 等待分配
          <div className="flex items-center gap-1 rounded-full border border-dashed border-gray-300 px-3 py-1 text-xs text-gray-400">
            <span>?</span>
            <span>等待分配研究员...</span>
          </div>
        ) : (
          // 显示研究员数量
          <>
            {Array.from({ length: Math.min(dimensionCount, 4) }).map((_, i) => (
              <div
                key={i}
                className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${
                  currentPhase === 'researching'
                    ? 'border-blue-400 bg-blue-50'
                    : 'border-gray-300 bg-gray-50'
                }`}
              >
                <span className="text-sm">🔍</span>
              </div>
            ))}
            {dimensionCount > 4 && (
              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-300 bg-gray-50 text-xs text-gray-500">
                +{dimensionCount - 4}
              </div>
            )}
          </>
        )}
      </div>

      {/* Bottom row - Reviewer & Synthesizer */}
      {(hasReviewer || hasSynthesizer) && (
        <>
          <div
            className={`h-4 w-px ${isRefreshing ? 'bg-gray-300' : 'bg-gray-200'}`}
          />
          <div className="flex items-center gap-4">
            {hasReviewer && (
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${
                    currentPhase === 'reviewing'
                      ? 'border-green-400 bg-green-50'
                      : 'border-gray-300 bg-gray-50'
                  }`}
                >
                  <span className="text-sm">✅</span>
                </div>
                <span className="mt-0.5 text-[10px] text-green-600">审核</span>
              </div>
            )}
            {hasSynthesizer && (
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${
                    currentPhase === 'synthesizing'
                      ? 'border-orange-400 bg-orange-50'
                      : 'border-gray-300 bg-gray-50'
                  }`}
                >
                  <span className="text-sm">📊</span>
                </div>
                <span className="mt-0.5 text-[10px] text-orange-600">撰写</span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// 任务项组件
function TaskItem({
  task,
  isExpanded,
  onToggle,
}: {
  task: TaskStatus;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const colors = statusColors[task.status] || statusColors.PENDING;
  const icon = statusIcons[task.status] || '○';

  return (
    <div className={`mb-2 rounded-lg border ${colors.border} ${colors.bg}`}>
      <button className="w-full px-3 py-2 text-left" onClick={onToggle}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium ${colors.text}`}>{icon}</span>
            <span className="text-sm text-gray-800">
              {task.dimensionName || task.title}
            </span>
          </div>
          <span className="text-xs text-gray-400">
            {isExpanded ? '▲' : '▼'}
          </span>
        </div>
      </button>

      {isExpanded && task.reviewStatus && (
        <div className="border-t border-gray-100 px-3 py-2 text-xs text-gray-500">
          <p>状态: {task.reviewStatus}</p>
        </div>
      )}
    </div>
  );
}
