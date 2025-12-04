'use client';

import { useEffect } from 'react';
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
  { color: string; bgColor: string; label: string }
> = {
  PENDING: { color: 'text-gray-600', bgColor: 'bg-gray-100', label: 'Pending' },
  PLANNING: {
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
    label: 'Planning',
  },
  IN_PROGRESS: {
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-100',
    label: 'In Progress',
  },
  REVIEW: {
    color: 'text-purple-600',
    bgColor: 'bg-purple-100',
    label: 'Review',
  },
  COMPLETED: {
    color: 'text-green-600',
    bgColor: 'bg-green-100',
    label: 'Completed',
  },
  FAILED: { color: 'text-red-600', bgColor: 'bg-red-100', label: 'Failed' },
  CANCELLED: {
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
    label: 'Cancelled',
  },
};

const taskStatusConfig: Record<
  AgentTaskStatus,
  { color: string; bgColor: string; icon: string }
> = {
  PENDING: { color: 'text-gray-400', bgColor: 'bg-gray-100', icon: '○' },
  IN_PROGRESS: { color: 'text-blue-500', bgColor: 'bg-blue-100', icon: '◐' },
  BLOCKED: { color: 'text-red-500', bgColor: 'bg-red-100', icon: '⊘' },
  AWAITING_REVIEW: {
    color: 'text-purple-500',
    bgColor: 'bg-purple-100',
    icon: '◉',
  },
  REVISION_NEEDED: {
    color: 'text-orange-500',
    bgColor: 'bg-orange-100',
    icon: '↻',
  },
  COMPLETED: { color: 'text-green-500', bgColor: 'bg-green-100', icon: '●' },
  CANCELLED: { color: 'text-gray-400', bgColor: 'bg-gray-100', icon: '○' },
};

export default function MissionProgressPanel({
  topicId,
  onCreateMission,
}: MissionProgressPanelProps) {
  const {
    missions,
    currentMission,
    isLoadingMissions,
    fetchMissions,
    fetchMission,
    cancelMission,
    setCurrentMission,
    typingAIs,
  } = useAiGroupStore();

  // Load missions on mount
  useEffect(() => {
    fetchMissions(topicId);
  }, [topicId, fetchMissions]);

  // Auto-select the most recent active mission
  useEffect(() => {
    if (!currentMission && missions && missions.length > 0) {
      const activeMission = missions.find(
        (m) =>
          m.status === 'IN_PROGRESS' ||
          m.status === 'PLANNING' ||
          m.status === 'REVIEW'
      );
      if (activeMission) {
        setCurrentMission(activeMission);
      }
    }
  }, [missions, currentMission, setCurrentMission]);

  const handleCancelMission = async (missionId: string) => {
    if (confirm('Are you sure you want to cancel this mission?')) {
      await cancelMission(topicId, missionId);
    }
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

  if (isLoadingMissions) {
    return (
      <div className="p-4">
        <div className="flex items-center justify-center py-8">
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
      <div className="flex-1 space-y-4 overflow-auto p-4">
        {activeMissions.length === 0 ? (
          <div className="py-8 text-center">
            <div className="mb-3 text-4xl">🎯</div>
            <p className="mb-4 text-sm text-gray-500">
              No active missions. Create one to get your AI team working!
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
              Create Mission
            </button>
          </div>
        ) : (
          activeMissions.map((mission) => (
            <MissionCard
              key={mission.id}
              mission={mission}
              isExpanded={currentMission?.id === mission.id}
              onToggle={() =>
                setCurrentMission(
                  currentMission?.id === mission.id ? null : mission
                )
              }
              onCancel={() => handleCancelMission(mission.id)}
              typingAIs={typingAIs}
            />
          ))
        )}

        {/* Completed missions section */}
        {missionsList.some(
          (m) => m.status === 'COMPLETED' || m.status === 'FAILED'
        ) && (
          <div className="border-t border-gray-200 pt-4">
            <h4 className="mb-3 text-xs font-medium uppercase tracking-wider text-gray-500">
              Completed
            </h4>
            <div className="space-y-2">
              {missionsList
                .filter(
                  (m) => m.status === 'COMPLETED' || m.status === 'FAILED'
                )
                .slice(0, 3)
                .map((mission) => (
                  <div
                    key={mission.id}
                    className="flex items-center gap-3 rounded-lg border border-gray-200 p-3"
                  >
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full ${
                        mission.status === 'COMPLETED'
                          ? 'bg-green-100 text-green-600'
                          : 'bg-red-100 text-red-600'
                      }`}
                    >
                      {mission.status === 'COMPLETED' ? '✓' : '✕'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-gray-900">
                        {mission.title}
                      </div>
                      <div className="text-xs text-gray-500">
                        {new Date(
                          mission.completedAt || mission.createdAt
                        ).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Mission Card Component
function MissionCard({
  mission,
  isExpanded,
  onToggle,
  onCancel,
  typingAIs,
}: {
  mission: TeamMission;
  isExpanded: boolean;
  onToggle: () => void;
  onCancel: () => void;
  typingAIs: Set<string>;
}) {
  const statusConfig = missionStatusConfig[mission.status];
  const isActive =
    mission.status === 'IN_PROGRESS' ||
    mission.status === 'PLANNING' ||
    mission.status === 'REVIEW';

  return (
    <div
      className={`rounded-xl border transition-all ${
        isExpanded
          ? 'border-blue-300 bg-blue-50/50'
          : 'border-gray-200 bg-white'
      }`}
    >
      {/* Card Header */}
      <div
        className="flex cursor-pointer items-center gap-3 p-4"
        onClick={onToggle}
      >
        <div className="relative">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-purple-100 to-blue-100 text-xl">
            👑
          </div>
          {isActive && (
            <div className="absolute -bottom-1 -right-1 h-3 w-3 animate-pulse rounded-full border-2 border-white bg-green-500"></div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-gray-900">
              {mission.title}
            </span>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusConfig.bgColor} ${statusConfig.color}`}
            >
              {statusConfig.label}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-xs text-gray-500">
              Led by {mission.leader?.displayName || 'Unknown'}
            </span>
            {mission.totalTasks > 0 && (
              <span className="text-xs text-gray-400">
                • {mission.completedTasks}/{mission.totalTasks} tasks
              </span>
            )}
          </div>
        </div>
        <svg
          className={`h-5 w-5 text-gray-400 transition-transform ${
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
      {mission.totalTasks > 0 && (
        <div className="px-4 pb-3">
          <div className="h-2 overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500"
              style={{ width: `${mission.progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Expanded Content */}
      {isExpanded && (
        <div className="space-y-4 border-t border-gray-200 p-4">
          {/* Task List */}
          {mission.tasks && mission.tasks.length > 0 ? (
            <div className="space-y-2">
              {mission.tasks.map((task) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  isWorking={typingAIs.has(task.assignedToId)}
                />
              ))}
            </div>
          ) : (
            <div className="py-4 text-center text-sm text-gray-500">
              {mission.status === 'PLANNING'
                ? 'Leader is planning tasks...'
                : 'No tasks created yet'}
            </div>
          )}

          {/* Actions */}
          {isActive && (
            <div className="flex justify-end pt-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCancel();
                }}
                className="text-sm text-red-600 hover:text-red-700"
              >
                Cancel Mission
              </button>
            </div>
          )}

          {/* Summary (for completed missions) */}
          {mission.status === 'COMPLETED' && mission.summary && (
            <div className="rounded-lg bg-green-50 p-3">
              <div className="mb-1 text-xs font-medium text-green-700">
                Mission Summary
              </div>
              <div className="text-sm text-green-800">{mission.summary}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Task Item Component
function TaskItem({
  task,
  isWorking,
}: {
  task: AgentTask;
  isWorking: boolean;
}) {
  const statusConfig = taskStatusConfig[task.status];

  return (
    <div className="flex items-start gap-3 rounded-lg border border-gray-100 bg-white p-3">
      <div
        className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-sm ${statusConfig.bgColor} ${statusConfig.color}`}
      >
        {isWorking ? (
          <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
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
          statusConfig.icon
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-gray-900">{task.title}</div>
        <div className="mt-0.5 text-xs text-gray-500">
          Assigned to {task.assignedTo?.displayName || 'Unknown'}
          {task.revisionCount > 0 && (
            <span className="ml-1 text-orange-500">
              (Revision {task.revisionCount})
            </span>
          )}
        </div>
        {task.leaderFeedback && task.status === 'REVISION_NEEDED' && (
          <div className="mt-2 rounded bg-orange-50 p-2 text-xs text-orange-600">
            Feedback: {task.leaderFeedback}
          </div>
        )}
      </div>
    </div>
  );
}
