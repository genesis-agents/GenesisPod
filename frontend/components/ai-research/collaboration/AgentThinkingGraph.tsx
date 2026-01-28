'use client';

/**
 * Agent Thinking Graph Component
 *
 * v7.0 Agent 思考架构:
 * - 每个 Agent 可折叠区域
 * - 思考架构树形图
 * - 输出架构列表
 */

import { useState, useMemo } from 'react';
import type {
  MissionStatus,
  TaskStatus,
  LeaderDecision,
} from '@/lib/api/topic-research';
import ClientDate from '@/components/common/ClientDate';

interface AgentThinkingGraphProps {
  missionStatus: MissionStatus | null;
  leaderDecisions?: LeaderDecision[];
  isLoading?: boolean;
}

// Agent type colors
const agentTypeColors: Record<
  string,
  { bg: string; text: string; border: string }
> = {
  leader: {
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    border: 'border-purple-200',
  },
  dimension_researcher: {
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
  },
  quality_reviewer: {
    bg: 'bg-green-50',
    text: 'text-green-700',
    border: 'border-green-200',
  },
  report_writer: {
    bg: 'bg-orange-50',
    text: 'text-orange-700',
    border: 'border-orange-200',
  },
};

// Agent type icons
const agentTypeIcons: Record<string, string> = {
  leader: '👑',
  dimension_researcher: '🔍',
  quality_reviewer: '✅',
  report_writer: '📊',
};

// Status colors
const statusColors: Record<string, string> = {
  PENDING: 'text-gray-500',
  ASSIGNED: 'text-blue-500',
  EXECUTING: 'text-blue-600',
  COMPLETED: 'text-green-600',
  NEEDS_REVISION: 'text-orange-600',
  FAILED: 'text-red-600',
};

// Icons
const ChevronDownIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
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
);

const ChevronRightIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 5l7 7-7 7"
    />
  </svg>
);

const BrainIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
    />
  </svg>
);

export function AgentThinkingGraph({
  missionStatus,
  leaderDecisions = [],
  isLoading = false,
}: AgentThinkingGraphProps) {
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(
    new Set(['leader'])
  );

  // Group tasks by agent
  const agentGroups = useMemo(() => {
    if (!missionStatus?.tasks) return [];

    const groups: Map<
      string,
      { agent: string; type: string; tasks: TaskStatus[] }
    > = new Map();

    // Add Leader as first group
    groups.set('leader', {
      agent: 'leader',
      type: 'leader',
      tasks: [],
    });

    // Group tasks by assigned agent
    missionStatus.tasks.forEach((task) => {
      const agentId = task.assignedAgent;
      if (!groups.has(agentId)) {
        groups.set(agentId, {
          agent: agentId,
          type: task.taskType.includes('research')
            ? 'dimension_researcher'
            : task.taskType.includes('review')
              ? 'quality_reviewer'
              : task.taskType.includes('write')
                ? 'report_writer'
                : 'dimension_researcher',
          tasks: [],
        });
      }
      groups.get(agentId)!.tasks.push(task);
    });

    return Array.from(groups.values());
  }, [missionStatus]);

  // Toggle agent expansion
  const toggleAgent = (agentId: string) => {
    setExpandedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) {
        next.delete(agentId);
      } else {
        next.add(agentId);
      }
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-purple-600" />
          <p className="text-sm text-gray-500">加载思考架构...</p>
        </div>
      </div>
    );
  }

  if (!missionStatus) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center">
        <BrainIcon className="h-12 w-12 text-gray-300" />
        <p className="mt-3 text-gray-500">暂无 Agent 思考数据</p>
        <p className="mt-1 text-sm text-gray-400">
          开始研究后将在此显示思考过程
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-4">
      <div className="space-y-3">
        {agentGroups.map((group) => {
          const isExpanded = expandedAgents.has(group.agent);
          const colors =
            agentTypeColors[group.type] || agentTypeColors.dimension_researcher;
          const icon = agentTypeIcons[group.type] || '🤖';
          const completedTasks = group.tasks.filter(
            (t) => t.status === 'COMPLETED'
          ).length;
          const totalTasks = group.tasks.length;

          return (
            <div
              key={group.agent}
              className={`overflow-hidden rounded-lg border ${colors.border} ${colors.bg}`}
            >
              {/* Agent header */}
              <button
                onClick={() => toggleAgent(group.agent)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/50"
              >
                <span className="text-xl">{icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`font-medium ${colors.text}`}>
                      {group.type === 'leader'
                        ? 'Leader (研究协调员)'
                        : group.type === 'dimension_researcher'
                          ? '维度研究员'
                          : group.type === 'quality_reviewer'
                            ? '质量审核'
                            : '报告撰写'}
                    </span>
                    {totalTasks > 0 && (
                      <span className="text-xs text-gray-500">
                        {completedTasks}/{totalTasks}
                      </span>
                    )}
                  </div>
                  {group.agent !== 'leader' && (
                    <p className="truncate text-xs text-gray-500">
                      {group.agent}
                    </p>
                  )}
                </div>
                {isExpanded ? (
                  <ChevronDownIcon className="h-5 w-5 text-gray-400" />
                ) : (
                  <ChevronRightIcon className="h-5 w-5 text-gray-400" />
                )}
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div className="border-t border-gray-100 bg-white p-4">
                  {group.type === 'leader' ? (
                    <LeaderThinkingSection
                      missionStatus={missionStatus}
                      decisions={leaderDecisions}
                    />
                  ) : (
                    <AgentTasksSection tasks={group.tasks} />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Leader thinking section
interface LeaderThinkingSectionProps {
  missionStatus: MissionStatus;
  decisions: LeaderDecision[];
}

function LeaderThinkingSection({
  missionStatus,
  decisions,
}: LeaderThinkingSectionProps) {
  const plan = missionStatus.leaderPlan;

  return (
    <div className="space-y-4">
      {/* Task Understanding */}
      {plan?.taskUnderstanding && (
        <div>
          <h4 className="mb-2 text-sm font-medium text-gray-700">任务理解</h4>
          <div className="rounded-md bg-purple-50 p-3 text-sm">
            <p className="text-gray-700">
              <strong>主题:</strong> {plan.taskUnderstanding.topic}
            </p>
            <p className="mt-1 text-gray-700">
              <strong>范围:</strong> {plan.taskUnderstanding.scope}
            </p>
            {plan.taskUnderstanding.objectives && (
              <div className="mt-2">
                <strong className="text-gray-700">目标:</strong>
                <ul className="ml-4 mt-1 list-disc text-gray-600">
                  {plan.taskUnderstanding.objectives.map((obj, idx) => (
                    <li key={idx}>{obj}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Planned Dimensions */}
      {plan?.dimensions && plan.dimensions.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-medium text-gray-700">规划维度</h4>
          <div className="space-y-2">
            {plan.dimensions.map((dim, idx) => (
              <div
                key={dim.id || idx}
                className="rounded-md border border-gray-200 bg-gray-50 p-2 text-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-xs font-medium text-blue-700">
                    {idx + 1}
                  </span>
                  <span className="font-medium text-gray-700">{dim.name}</span>
                </div>
                {dim.description && (
                  <p className="mt-1 pl-7 text-gray-500">{dim.description}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Decisions */}
      {decisions.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-medium text-gray-700">决策历史</h4>
          <div className="space-y-2">
            {decisions.slice(0, 5).map((decision) => (
              <div
                key={decision.id}
                className="rounded-md border border-gray-200 p-2 text-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-700">
                    {decision.type === 'PLAN'
                      ? '规划'
                      : decision.type === 'REVIEW'
                        ? '审核'
                        : decision.type === 'ADJUST'
                          ? '调整'
                          : '干预'}
                  </span>
                  <ClientDate
                    date={decision.createdAt}
                    format="time"
                    className="text-xs text-gray-400"
                  />
                </div>
                {decision.reasoning && (
                  <p className="mt-1 text-gray-500">{decision.reasoning}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Agent tasks section
interface AgentTasksSectionProps {
  tasks: TaskStatus[];
}

function AgentTasksSection({ tasks }: AgentTasksSectionProps) {
  if (tasks.length === 0) {
    return <p className="text-sm text-gray-500">暂无任务</p>;
  }

  return (
    <div className="space-y-2">
      {tasks.map((task) => (
        <div key={task.id} className="rounded-md border border-gray-200 p-3">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span
                  className={`text-sm font-medium ${statusColors[task.status]}`}
                >
                  {task.status === 'PENDING'
                    ? '⏳'
                    : task.status === 'EXECUTING'
                      ? '🔄'
                      : task.status === 'COMPLETED'
                        ? '✅'
                        : task.status === 'FAILED'
                          ? '❌'
                          : '⚠️'}
                </span>
                <span className="text-sm font-medium text-gray-700">
                  {task.title}
                </span>
              </div>
              {task.dimensionName && (
                <p className="mt-1 text-xs text-gray-500">
                  维度: {task.dimensionName}
                </p>
              )}
            </div>
            <span className={`text-xs ${statusColors[task.status]}`}>
              {task.status === 'PENDING'
                ? '待执行'
                : task.status === 'ASSIGNED'
                  ? '已分配'
                  : task.status === 'EXECUTING'
                    ? '执行中'
                    : task.status === 'COMPLETED'
                      ? '已完成'
                      : task.status === 'NEEDS_REVISION'
                        ? '需修订'
                        : '失败'}
            </span>
          </div>
          {task.progress !== undefined &&
            task.progress > 0 &&
            task.progress < 100 && (
              <div className="mt-2">
                <div className="h-1 rounded-full bg-gray-200">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all"
                    style={{ width: `${task.progress}%` }}
                  />
                </div>
              </div>
            )}
        </div>
      ))}
    </div>
  );
}
