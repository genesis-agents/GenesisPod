'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  TeamMission,
  AgentTask,
  MissionStatus,
  AgentTaskStatus,
} from '@/types/ai-group';
import { useAiGroupStore } from '@/stores/aiGroupStore';

interface MissionProgressPanelProps {
  topicId: string;
  onCreateMission?: () => void;
}

// Status colors and labels
const missionStatusConfig: Record<
  MissionStatus,
  { color: string; bgColor: string; label: string; icon: string }
> = {
  PENDING: {
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
    label: '待开始',
    icon: '⏳',
  },
  PLANNING: {
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
    label: '规划中',
    icon: '📋',
  },
  IN_PROGRESS: {
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-100',
    label: '执行中',
    icon: '⚡',
  },
  REVIEW: {
    color: 'text-purple-600',
    bgColor: 'bg-purple-100',
    label: '审核中',
    icon: '🔍',
  },
  COMPLETED: {
    color: 'text-green-600',
    bgColor: 'bg-green-100',
    label: '已完成',
    icon: '✅',
  },
  FAILED: {
    color: 'text-red-600',
    bgColor: 'bg-red-100',
    label: '失败',
    icon: '❌',
  },
  CANCELLED: {
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
    label: '已取消',
    icon: '🚫',
  },
};

const taskStatusConfig: Record<
  AgentTaskStatus,
  {
    color: string;
    bgColor: string;
    borderColor: string;
    icon: string;
    label: string;
  }
> = {
  PENDING: {
    color: 'text-gray-500',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-200',
    icon: '○',
    label: '等待中',
  },
  IN_PROGRESS: {
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    icon: '◐',
    label: '执行中',
  },
  BLOCKED: {
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    icon: '⊘',
    label: '阻塞',
  },
  AWAITING_REVIEW: {
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
    icon: '◉',
    label: '待审核',
  },
  REVISION_NEEDED: {
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
    icon: '↻',
    label: '需修订',
  },
  COMPLETED: {
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    icon: '✓',
    label: '已完成',
  },
  CANCELLED: {
    color: 'text-gray-400',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-200',
    icon: '○',
    label: '已取消',
  },
};

export default function MissionProgressPanel({
  topicId,
  onCreateMission,
}: MissionProgressPanelProps) {
  const {
    missions,
    isLoadingMissions,
    fetchMissions,
    cancelMission,
    typingAIs,
  } = useAiGroupStore();

  const [expandedMissions, setExpandedMissions] = useState<Set<string>>(
    new Set()
  );
  const [detailMission, setDetailMission] = useState<TeamMission | null>(null);

  // Load missions on mount
  useEffect(() => {
    fetchMissions(topicId);
  }, [topicId, fetchMissions]);

  // Polling for active missions - refresh every 5 seconds when there are active missions
  useEffect(() => {
    const hasActiveMissions =
      missions &&
      missions.some(
        (m) =>
          m.status === 'IN_PROGRESS' ||
          m.status === 'PLANNING' ||
          m.status === 'REVIEW' ||
          m.status === 'PENDING'
      );

    if (hasActiveMissions) {
      const intervalId = setInterval(() => {
        fetchMissions(topicId);
      }, 5000); // Poll every 5 seconds

      return () => clearInterval(intervalId);
    }
  }, [missions, topicId, fetchMissions]);

  // Auto-expand active missions
  useEffect(() => {
    if (missions && missions.length > 0) {
      const activeMissionIds = missions
        .filter(
          (m) =>
            m.status === 'IN_PROGRESS' ||
            m.status === 'PLANNING' ||
            m.status === 'REVIEW'
        )
        .map((m) => m.id);

      if (activeMissionIds.length > 0) {
        setExpandedMissions(new Set(activeMissionIds));
      }
    }
  }, [missions]);

  const handleCancelMission = async (missionId: string) => {
    if (confirm('确定要取消此任务吗？')) {
      await cancelMission(topicId, missionId);
    }
  };

  const toggleMissionExpand = (missionId: string) => {
    setExpandedMissions((prev) => {
      const next = new Set(prev);
      if (next.has(missionId)) {
        next.delete(missionId);
      } else {
        next.add(missionId);
      }
      return next;
    });
  };

  // Ensure missions is always an array
  const missionsList = missions || [];

  const activeMissions = missionsList.filter(
    (m) =>
      m.status === 'IN_PROGRESS' ||
      m.status === 'PLANNING' ||
      m.status === 'REVIEW' ||
      m.status === 'PENDING'
  );

  const completedMissions = missionsList.filter(
    (m) =>
      m.status === 'COMPLETED' ||
      m.status === 'FAILED' ||
      m.status === 'CANCELLED'
  );

  // Detail view modal
  if (detailMission) {
    return (
      <MissionDetailView
        mission={detailMission}
        typingAIs={typingAIs}
        onBack={() => setDetailMission(null)}
        onCancel={() => handleCancelMission(detailMission.id)}
      />
    );
  }

  if (isLoadingMissions) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h3 className="font-semibold text-gray-900">Team Missions</h3>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <h3 className="font-semibold text-gray-900">Team Missions</h3>
        <button
          onClick={onCreateMission}
          className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
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
              d="M12 4v16m8-8H4"
            />
          </svg>
          New
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {missionsList.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-4">
            <div className="mb-3 text-4xl">🎯</div>
            <p className="mb-4 text-center text-sm text-gray-500">
              暂无任务，创建一个让AI团队开始工作！
            </p>
            <button
              onClick={onCreateMission}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-2 text-sm font-medium text-white hover:from-blue-700 hover:to-purple-700"
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
                  d="M12 4v16m8-8H4"
                />
              </svg>
              创建任务
            </button>
          </div>
        ) : (
          <div className="space-y-3 p-3">
            {/* Active Missions */}
            {activeMissions.length > 0 && (
              <div className="space-y-3">
                {activeMissions.map((mission) => (
                  <MissionCard
                    key={mission.id}
                    mission={mission}
                    isExpanded={expandedMissions.has(mission.id)}
                    onToggle={() => toggleMissionExpand(mission.id)}
                    onViewDetail={() => setDetailMission(mission)}
                    onCancel={() => handleCancelMission(mission.id)}
                    typingAIs={typingAIs}
                  />
                ))}
              </div>
            )}

            {/* Completed Missions */}
            {completedMissions.length > 0 && (
              <div className="pt-2">
                <div className="mb-2 flex items-center gap-2 px-1">
                  <div className="h-px flex-1 bg-gray-200"></div>
                  <span className="text-xs font-medium uppercase tracking-wider text-gray-400">
                    历史任务
                  </span>
                  <div className="h-px flex-1 bg-gray-200"></div>
                </div>
                <div className="space-y-2">
                  {completedMissions.slice(0, 5).map((mission) => (
                    <MissionCard
                      key={mission.id}
                      mission={mission}
                      isExpanded={expandedMissions.has(mission.id)}
                      onToggle={() => toggleMissionExpand(mission.id)}
                      onViewDetail={() => setDetailMission(mission)}
                      onCancel={() => {}}
                      typingAIs={typingAIs}
                      isCompact
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Mission Card Component (列表视图)
function MissionCard({
  mission,
  isExpanded,
  onToggle,
  onViewDetail,
  onCancel,
  typingAIs,
  isCompact = false,
}: {
  mission: TeamMission;
  isExpanded: boolean;
  onToggle: () => void;
  onViewDetail: () => void;
  onCancel: () => void;
  typingAIs: Set<string>;
  isCompact?: boolean;
}) {
  const statusConfig = missionStatusConfig[mission.status];
  const isActive =
    mission.status === 'IN_PROGRESS' ||
    mission.status === 'PLANNING' ||
    mission.status === 'REVIEW';
  const isPending = mission.status === 'PENDING';

  // Calculate task statistics
  const tasks = mission.tasks || [];
  const completedCount = tasks.filter((t) => t.status === 'COMPLETED').length;
  const inProgressCount = tasks.filter(
    (t) => t.status === 'IN_PROGRESS'
  ).length;

  return (
    <div
      className={`rounded-xl border transition-all ${
        isExpanded
          ? 'border-blue-300 shadow-md'
          : isCompact
            ? 'border-gray-100 bg-gray-50/50'
            : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      {/* Card Header */}
      <div
        className={`flex cursor-pointer items-center gap-3 ${
          isCompact ? 'p-3' : 'p-4'
        }`}
        onClick={onToggle}
      >
        {/* Status Icon */}
        <div className="relative">
          <div
            className={`flex items-center justify-center rounded-full text-lg ${
              isCompact ? 'h-8 w-8' : 'h-10 w-10'
            } ${statusConfig.bgColor}`}
          >
            {statusConfig.icon}
          </div>
          {isActive && (
            <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 animate-pulse rounded-full border-2 border-white bg-green-500"></div>
          )}
        </div>

        {/* Title and Meta */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`truncate font-medium text-gray-900 ${
                isCompact ? 'text-sm' : ''
              }`}
            >
              {mission.title}
            </span>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusConfig.bgColor} ${statusConfig.color}`}
            >
              {statusConfig.label}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
            <span>👑 {mission.leader?.displayName || 'Unknown'}</span>
            {tasks.length > 0 && (
              <>
                <span>•</span>
                <span>
                  {completedCount}/{tasks.length} 已完成
                </span>
              </>
            )}
          </div>
        </div>

        {/* Expand Arrow */}
        <svg
          className={`h-5 w-5 shrink-0 text-gray-400 transition-transform ${
            isExpanded ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </div>

      {/* Progress Bar */}
      {!isCompact && tasks.length > 0 && (
        <div className="px-4 pb-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div
              className={`h-full transition-all duration-500 ${
                mission.status === 'COMPLETED'
                  ? 'bg-green-500'
                  : mission.status === 'FAILED'
                    ? 'bg-red-500'
                    : 'bg-gradient-to-r from-blue-500 to-purple-500'
              }`}
              style={{
                width: `${tasks.length > 0 ? (completedCount / tasks.length) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Expanded Content - Quick Summary */}
      {isExpanded && (
        <div className="border-t border-gray-100 p-3">
          {/* Quick Stats */}
          {tasks.length > 0 && (
            <div className="mb-3 grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-blue-50 p-2 text-center">
                <div className="text-lg font-semibold text-blue-600">
                  {inProgressCount}
                </div>
                <div className="text-xs text-blue-600">执行中</div>
              </div>
              <div className="rounded-lg bg-green-50 p-2 text-center">
                <div className="text-lg font-semibold text-green-600">
                  {completedCount}
                </div>
                <div className="text-xs text-green-600">已完成</div>
              </div>
            </div>
          )}

          {/* View Detail Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onViewDetail();
            }}
            className="w-full rounded-lg bg-gray-100 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
          >
            查看详情
          </button>

          {/* Cancel Button (for active missions) */}
          {(isActive || isPending) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCancel();
              }}
              className="mt-2 w-full rounded-lg py-2 text-sm text-red-600 hover:bg-red-50"
            >
              取消任务
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Mission Detail View (详情视图 - 全屏)
function MissionDetailView({
  mission,
  typingAIs,
  onBack,
  onCancel,
}: {
  mission: TeamMission;
  typingAIs: Set<string>;
  onBack: () => void;
  onCancel: () => void;
}) {
  const statusConfig = missionStatusConfig[mission.status];
  const tasks = mission.tasks || [];
  const isActive =
    mission.status === 'IN_PROGRESS' ||
    mission.status === 'PLANNING' ||
    mission.status === 'REVIEW';
  const isPending = mission.status === 'PENDING';

  // Calculate stats
  const completedCount = tasks.filter((t) => t.status === 'COMPLETED').length;
  const inProgressCount = tasks.filter(
    (t) => t.status === 'IN_PROGRESS'
  ).length;
  const awaitingReviewCount = tasks.filter(
    (t) => t.status === 'AWAITING_REVIEW'
  ).length;
  const revisionCount = tasks.filter(
    (t) => t.status === 'REVISION_NEEDED'
  ).length;
  const pendingCount = tasks.filter((t) => t.status === 'PENDING').length;

  // Calculate performance metrics
  const totalRevisions = tasks.reduce(
    (sum, t) => sum + (t.revisionCount || 0),
    0
  );
  const avgRevisions =
    tasks.length > 0 ? (totalRevisions / tasks.length).toFixed(1) : '0';

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3">
        <button onClick={onBack} className="rounded-lg p-1 hover:bg-gray-100">
          <svg
            className="h-5 w-5 text-gray-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-lg">{statusConfig.icon}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusConfig.bgColor} ${statusConfig.color}`}
            >
              {statusConfig.label}
            </span>
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-auto">
        {/* Mission Info */}
        <div className="border-b border-gray-100 p-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {mission.title}
          </h2>
          {mission.description && (
            <p className="mt-2 whitespace-pre-wrap text-sm text-gray-600">
              {mission.description}
            </p>
          )}
          <div className="mt-3 flex items-center gap-4 text-sm text-gray-500">
            <span className="flex items-center gap-1">
              👑 {mission.leader?.displayName || 'Unknown'}
            </span>
            <span>
              创建于{' '}
              {new Date(mission.createdAt).toLocaleString('zh-CN', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
        </div>

        {/* Progress Overview */}
        {tasks.length > 0 && (
          <div className="border-b border-gray-100 p-4">
            <h3 className="mb-3 text-sm font-semibold text-gray-700">
              📊 任务进度
            </h3>
            {/* Progress Bar */}
            <div className="mb-3">
              <div className="mb-1 flex items-center justify-between text-sm text-gray-600">
                <span>完成进度</span>
                <span className="font-medium">
                  {completedCount}/{tasks.length} (
                  {Math.round((completedCount / tasks.length) * 100)}%)
                </span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-gray-100">
                <div
                  className={`h-full transition-all duration-500 ${
                    mission.status === 'COMPLETED'
                      ? 'bg-green-500'
                      : mission.status === 'FAILED'
                        ? 'bg-red-500'
                        : 'bg-gradient-to-r from-blue-500 to-purple-500'
                  }`}
                  style={{
                    width: `${(completedCount / tasks.length) * 100}%`,
                  }}
                />
              </div>
            </div>
            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-2 text-center">
              {inProgressCount > 0 && (
                <div className="rounded-lg bg-blue-50 p-2">
                  <div className="text-lg font-bold text-blue-600">
                    {inProgressCount}
                  </div>
                  <div className="text-xs text-blue-600">执行中</div>
                </div>
              )}
              {awaitingReviewCount > 0 && (
                <div className="rounded-lg bg-purple-50 p-2">
                  <div className="text-lg font-bold text-purple-600">
                    {awaitingReviewCount}
                  </div>
                  <div className="text-xs text-purple-600">待审核</div>
                </div>
              )}
              {revisionCount > 0 && (
                <div className="rounded-lg bg-orange-50 p-2">
                  <div className="text-lg font-bold text-orange-600">
                    {revisionCount}
                  </div>
                  <div className="text-xs text-orange-600">待修订</div>
                </div>
              )}
              {pendingCount > 0 && (
                <div className="rounded-lg bg-gray-50 p-2">
                  <div className="text-lg font-bold text-gray-600">
                    {pendingCount}
                  </div>
                  <div className="text-xs text-gray-600">等待中</div>
                </div>
              )}
              <div className="rounded-lg bg-green-50 p-2">
                <div className="text-lg font-bold text-green-600">
                  {completedCount}
                </div>
                <div className="text-xs text-green-600">已完成</div>
              </div>
            </div>
          </div>
        )}

        {/* Task List */}
        <div className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">
            📋 子任务详情
          </h3>
          {tasks.length > 0 ? (
            <div className="space-y-3">
              {tasks.map((task, index) => (
                <TaskDetailCard
                  key={task.id}
                  task={task}
                  isWorking={typingAIs.has(task.assignedToId)}
                  taskNumber={index + 1}
                />
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-gray-500">
              {mission.status === 'PLANNING' ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></div>
                  <span>Leader 正在分析和规划任务...</span>
                </div>
              ) : mission.status === 'PENDING' ? (
                '任务即将开始'
              ) : (
                '暂无子任务'
              )}
            </div>
          )}
        </div>

        {/* Final Result (for completed missions) */}
        {mission.status === 'COMPLETED' && mission.finalResult && (
          <div className="border-t border-gray-100 bg-gradient-to-r from-green-50 to-emerald-50 p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-green-800">
              🏆 最终成果
            </h3>
            <div className="rounded-lg bg-white/60 p-4">
              <div className="whitespace-pre-wrap text-sm text-gray-700">
                {mission.finalResult}
              </div>
            </div>
          </div>
        )}

        {/* Performance Summary (for completed missions) */}
        {mission.status === 'COMPLETED' && tasks.length > 0 && (
          <div className="border-t border-gray-100 p-4">
            <h3 className="mb-3 text-sm font-semibold text-gray-700">
              📈 绩效总结
            </h3>
            <div className="rounded-lg bg-gray-50 p-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-gray-500">总子任务数</div>
                  <div className="text-lg font-semibold text-gray-900">
                    {tasks.length}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">完成率</div>
                  <div className="text-lg font-semibold text-green-600">
                    {Math.round((completedCount / tasks.length) * 100)}%
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">平均修订次数</div>
                  <div className="text-lg font-semibold text-gray-900">
                    {avgRevisions}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">参与成员</div>
                  <div className="text-lg font-semibold text-gray-900">
                    {new Set(tasks.map((t) => t.assignedToId)).size}
                  </div>
                </div>
              </div>

              {/* Per-agent performance */}
              <div className="mt-4 border-t border-gray-200 pt-4">
                <div className="mb-2 text-xs font-medium text-gray-500">
                  成员贡献
                </div>
                <div className="space-y-2">
                  {Array.from(
                    new Map(
                      tasks.map((t) => [t.assignedToId, t.assignedTo])
                    ).values()
                  ).map((agent) => {
                    if (!agent) return null;
                    const agentTasks = tasks.filter(
                      (t) => t.assignedToId === agent.id
                    );
                    const agentCompleted = agentTasks.filter(
                      (t) => t.status === 'COMPLETED'
                    ).length;
                    const agentRevisions = agentTasks.reduce(
                      (sum, t) => sum + (t.revisionCount || 0),
                      0
                    );
                    return (
                      <div
                        key={agent.id}
                        className="flex items-center justify-between rounded-lg bg-white p-2"
                      >
                        <div className="flex items-center gap-2">
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-purple-400 to-blue-400 text-xs text-white">
                            {agent.displayName?.charAt(0) || 'A'}
                          </div>
                          <span className="text-sm font-medium">
                            {agent.displayName}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-green-600">
                            ✓ {agentCompleted}/{agentTasks.length}
                          </span>
                          {agentRevisions > 0 && (
                            <span className="text-orange-600">
                              ↻ {agentRevisions}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Failed Mission Info */}
        {mission.status === 'FAILED' && (
          <div className="border-t border-gray-100 bg-red-50 p-4">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-red-800">
              ⚠️ 任务失败
            </h3>
            <div className="text-sm text-red-700">
              {mission.summary || '任务执行过程中遇到问题，请查看详细日志'}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Actions */}
      {(isActive || isPending) && (
        <div className="border-t border-gray-200 p-4">
          <button
            onClick={onCancel}
            className="w-full rounded-lg bg-red-50 py-2.5 text-sm font-medium text-red-600 hover:bg-red-100"
          >
            取消任务
          </button>
        </div>
      )}
    </div>
  );
}

// Task Detail Card Component (详情视图中的任务卡片)
function TaskDetailCard({
  task,
  isWorking,
  taskNumber,
}: {
  task: AgentTask;
  isWorking: boolean;
  taskNumber: number;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const statusConfig = taskStatusConfig[task.status];

  const hasResult = !!task.result;
  const hasFeedback = !!task.leaderFeedback;

  return (
    <div
      className={`rounded-xl border transition-all ${
        isExpanded ? 'border-blue-300 shadow-sm' : statusConfig.borderColor
      } ${statusConfig.bgColor}`}
    >
      {/* Task Header */}
      <div
        className="flex cursor-pointer items-start gap-3 p-3"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* Task Number & Status */}
        <div className="flex flex-col items-center gap-1">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
            {taskNumber}
          </div>
          {isWorking ? (
            <svg
              className="h-4 w-4 animate-spin text-blue-600"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          ) : (
            <span className={`text-sm ${statusConfig.color}`}>
              {statusConfig.icon}
            </span>
          )}
        </div>

        {/* Task Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <div className="font-medium text-gray-900">{task.title}</div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                <span
                  className={`rounded-full px-2 py-0.5 ${statusConfig.bgColor} ${statusConfig.color}`}
                >
                  {statusConfig.label}
                </span>
                <span className="flex items-center gap-1 text-gray-500">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-gradient-to-br from-purple-400 to-blue-400 text-[10px] text-white">
                    {task.assignedTo?.displayName?.charAt(0) || 'A'}
                  </span>
                  {task.assignedTo?.displayName || 'Unknown'}
                </span>
                {task.revisionCount > 0 && (
                  <span className="text-orange-500">
                    修订 {task.revisionCount}次
                  </span>
                )}
              </div>
            </div>
            <svg
              className={`h-5 w-5 shrink-0 text-gray-400 transition-transform ${
                isExpanded ? 'rotate-180' : ''
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>

          {/* Working Status */}
          {isWorking && (
            <div className="mt-2 flex items-center gap-2 text-xs text-blue-600">
              <span className="flex gap-0.5">
                <span
                  className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-500"
                  style={{ animationDelay: '0ms' }}
                ></span>
                <span
                  className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-500"
                  style={{ animationDelay: '150ms' }}
                ></span>
                <span
                  className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-500"
                  style={{ animationDelay: '300ms' }}
                ></span>
              </span>
              正在思考和处理中...
            </div>
          )}
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="space-y-3 border-t border-gray-200/50 p-3">
          {/* Task Description */}
          {task.description && task.description !== task.title && (
            <div>
              <div className="mb-1 text-xs font-medium text-gray-500">
                任务描述
              </div>
              <div className="whitespace-pre-wrap text-sm text-gray-700">
                {task.description}
              </div>
            </div>
          )}

          {/* Task Result */}
          {hasResult && (
            <div className="rounded-lg bg-white/80 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium text-gray-600">
                📝 执行成果
              </div>
              <div className="max-h-64 overflow-auto whitespace-pre-wrap text-sm text-gray-700">
                {task.result}
              </div>
            </div>
          )}

          {/* Leader Feedback */}
          {hasFeedback && (
            <div
              className={`rounded-lg p-3 ${
                task.status === 'COMPLETED'
                  ? 'bg-green-100/60'
                  : task.status === 'REVISION_NEEDED'
                    ? 'bg-orange-100/60'
                    : 'bg-purple-100/60'
              }`}
            >
              <div className="mb-2 flex items-center gap-2 text-xs font-medium text-gray-600">
                👑 Leader 评审
                {task.status === 'COMPLETED' && (
                  <span className="rounded-full bg-green-200 px-2 py-0.5 text-xs text-green-700">
                    ✓ 通过
                  </span>
                )}
                {task.status === 'REVISION_NEEDED' && (
                  <span className="rounded-full bg-orange-200 px-2 py-0.5 text-xs text-orange-700">
                    需修订
                  </span>
                )}
              </div>
              <div className="whitespace-pre-wrap text-sm text-gray-700">
                {task.leaderFeedback}
              </div>
            </div>
          )}

          {/* Timestamps */}
          <div className="flex flex-wrap gap-3 border-t border-gray-200/50 pt-2 text-xs text-gray-400">
            {task.startedAt && (
              <span>
                开始:{' '}
                {new Date(task.startedAt).toLocaleString('zh-CN', {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            )}
            {task.completedAt && (
              <span>
                完成:{' '}
                {new Date(task.completedAt).toLocaleString('zh-CN', {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
