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
import { useTranslation } from '@/lib/i18n';
import { ModelBadge } from '@/components/ai-research/ModelBadge';
import type {
  MissionStatus,
  TaskStatus,
  TeamInfo,
} from '@/lib/api/topic-research';
// TaskStatus is used in type annotations below

/**
 * ★ 类型守卫：验证是否为非空字符串数组
 * 防止后端返回无效数据导致渲染错误
 */
function isValidStringArray(value: unknown): value is string[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every(
    (item) => typeof item === 'string' && item.trim().length > 0
  );
}

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
  onContinueRefresh?: () => void;
  onCancelRefresh?: () => void;
  /** 错误信息 */
  error?: string | null;
  /** ★ 是否有编辑权限（只有创建者/管理员才能运行任务） */
  canEdit?: boolean;
  /** ★ 团队信息（包含 Agent 使用的 AI 模型） */
  teamInfo?: TeamInfo | null;
  /** V5: 研究深度 */
  researchDepth?: 'quick' | 'standard' | 'thorough';
  onResearchDepthChange?: (depth: 'quick' | 'standard' | 'thorough') => void;
}

// Agent 角色定义
type ResearchAgentRole = 'leader' | 'researcher' | 'reviewer' | 'synthesizer';

interface ResearchAgent {
  id: string;
  role: ResearchAgentRole;
  name: string;
  status: 'idle' | 'working' | 'completed' | 'error';
  /** ★ 具体工作状态：研究中、审核中、修订中、整合中 */
  workingStatus?: string;
  taskCount: number;
  completedCount: number;
}

// Agent icon and color mapping (name will be translated)
const AGENT_ICON_MAP: Record<
  ResearchAgentRole,
  { icon: string; color: string }
> = {
  leader: { icon: '👑', color: 'purple' },
  researcher: { icon: '🔍', color: 'blue' },
  reviewer: { icon: '✅', color: 'green' },
  synthesizer: { icon: '📝', color: 'orange' },
};

// ★ 默认显示信息，用于未知角色
const DEFAULT_AGENT_ICON = { icon: '🤖', color: 'gray' };

// Agent 显示信息工厂函数
const getAgentDisplayFactory = (t: (key: string) => string) => {
  return (role: string): { name: string; icon: string; color: string } => {
    const roleKey = role.toLowerCase() as ResearchAgentRole;
    const iconInfo = AGENT_ICON_MAP[roleKey] || DEFAULT_AGENT_ICON;
    const nameKey = `topicResearch.agentNames.${roleKey}`;
    return {
      name: t(nameKey) || role,
      ...iconInfo,
    };
  };
};

// Agent 角色详细信息工厂函数
// ★ v8.0: 技能和工具由 Leader 根据任务动态分配，这里显示的是角色的能力范围
const getAgentRoleInfoFactory = (t: (key: string) => string) => {
  return (
    role: string
  ): { description: string; capabilities: string[]; note: string } => {
    const roleKey = role.toLowerCase() as ResearchAgentRole;
    const validRoles: ResearchAgentRole[] = [
      'leader',
      'researcher',
      'reviewer',
      'synthesizer',
    ];

    // Helper to parse comma-separated capabilities string into array
    const parseCapabilities = (capStr: string): string[] => {
      return capStr
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    };

    if (validRoles.includes(roleKey)) {
      return {
        description: t(`topicResearch.agentDescriptions.${roleKey}`),
        capabilities: parseCapabilities(
          t(`topicResearch.agentCapabilities.${roleKey}`)
        ),
        note:
          roleKey === 'leader'
            ? t('topicResearch.agentNotes.leader')
            : t('topicResearch.agentNotes.worker'),
      };
    }

    return {
      description: t('topicResearch.agentDescriptions.default'),
      capabilities: parseCapabilities(
        t('topicResearch.agentCapabilities.default')
      ),
      note: t('topicResearch.agentNotes.worker'),
    };
  };
};

// Phase display mapping factory
const getPhaseDisplay = (
  t: (key: string) => string
): Record<string, string> => ({
  idle: t('topicResearch.status.idle'),
  unknown: t('topicResearch.status.idle'),
  planning: t('topicResearch.status.planning'),
  PLANNING: t('topicResearch.status.planning'),
  researching: t('topicResearch.status.researching'),
  RESEARCHING: t('topicResearch.status.researching'),
  EXECUTING: t('topicResearch.status.executing'),
  reviewing: t('topicResearch.status.reviewing'),
  REVIEWING: t('topicResearch.status.reviewing'),
  synthesizing: t('topicResearch.status.synthesizing'),
  SYNTHESIZING: t('topicResearch.status.synthesizing'),
  completed: t('topicResearch.status.completed'),
  COMPLETED: t('topicResearch.status.completed'),
  failed: t('topicResearch.status.failed'),
  FAILED: t('topicResearch.status.failed'),
  paused: t('topicResearch.status.paused'),
  PAUSED: t('topicResearch.status.paused'),
  cancelled: t('topicResearch.status.cancelled'),
  CANCELLED: t('topicResearch.status.cancelled'),
});

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
  onContinueRefresh,
  onCancelRefresh,
  error,
  canEdit = true,
  teamInfo,
  researchDepth = 'standard',
  onResearchDepthChange,
}: TopicTeamPanelProps) {
  const { t } = useTranslation();
  const phaseDisplay = useMemo(() => getPhaseDisplay(t), [t]);
  const getAgentDisplay = useMemo(() => getAgentDisplayFactory(t), [t]);
  const getAgentRoleInfo = useMemo(() => getAgentRoleInfoFactory(t), [t]);
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
      // ★ 如果任务已完成/取消/错误，直接返回 false
      // 不再检查子任务状态，避免已完成的任务显示为"进行中"
      if (
        ['COMPLETED', 'CANCELLED', 'ERROR', 'FAILED'].includes(
          missionStatus.status
        )
      ) {
        return false;
      }
      // 检查 mission 状态是否是活动状态
      if (
        ['PLANNING', 'EXECUTING', 'REVIEWING'].includes(missionStatus.status)
      ) {
        return true;
      }
      // 只在非终止状态下检查子任务
      // 检查是否有正在执行的任务（不包括 PENDING/ASSIGNED，因为这些可能是未开始的任务）
      if (missionStatus.tasks?.some((t) => t.status === 'EXECUTING')) {
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

    // 添加研究员
    // ★ v7.5: 动态收集所有参与研究的 Agent（从任务的 assignedAgent 字段）
    // 这样新创建的任务（如通过 Leader 对话添加的维度）也会显示对应的 Agent
    const uniqueAgentIds = new Set<string>();
    dimensionTasks.forEach((t) => {
      if (t.assignedAgent) {
        uniqueAgentIds.add(t.assignedAgent);
      }
    });

    // 合并 leaderPlan 中的分配信息（用于获取 Agent 名称等元信息）
    const agentAssignments = missionStatus?.leaderPlan?.agentAssignments || [];
    const researcherAssignments = agentAssignments.filter(
      (a) => a.agentType === 'dimension_researcher'
    );

    // 把 leaderPlan 中的 agentId 也加入
    researcherAssignments.forEach((a) => {
      if (a.agentId) uniqueAgentIds.add(a.agentId);
    });

    // 如果没有任何 Agent，使用默认逻辑
    if (uniqueAgentIds.size === 0 && dimensionTasks.length > 0) {
      // 兜底：按任务数量估算（最大 6 个）
      const fallbackCount = Math.max(1, Math.min(dimensionTasks.length, 6));
      for (let i = 0; i < fallbackCount; i++) {
        uniqueAgentIds.add(`researcher-${i}`);
      }
    }

    // 遍历所有唯一的 Agent
    const sortedAgentIds = Array.from(uniqueAgentIds).sort();
    sortedAgentIds.forEach((agentId, i) => {
      // 查找 leaderPlan 中的分配信息（如果有）
      const assignment = researcherAssignments.find(
        (a) => a.agentId === agentId
      );

      // 通过 assignedAgent 匹配任务
      const assignedTasks = dimensionTasks.filter(
        (t) => t.assignedAgent === agentId
      );

      const hasExecuting = assignedTasks.some((t) => t.status === 'EXECUTING');
      const hasNeedsRevision = assignedTasks.some(
        (t) => t.status === 'NEEDS_REVISION'
      );
      const allCompleted =
        assignedTasks.length > 0 &&
        assignedTasks.every((t) => t.status === 'COMPLETED');

      // ★ 确定具体工作状态
      let workingStatus: string | undefined;
      if (hasExecuting) {
        workingStatus = t('topicResearch.workingStatus.researching');
      } else if (hasNeedsRevision) {
        workingStatus = t('topicResearch.workingStatus.revising');
      }

      // ★ 从 agentId 提取更友好的名称
      // agentId 格式如: researcher_美国AI政策洞察_1737xxx 或 researcher_strategy_governance
      let displayName =
        assignment?.role ||
        t('topicResearch.agentNames.researcherIndex', { index: i + 1 });
      if (!assignment?.role && agentId.startsWith('researcher_')) {
        const parts = agentId.replace('researcher_', '').split('_');
        // 取第一个有意义的部分作为名称，移除时间戳
        const namePart = parts.find((p) => p && !/^\d{10,}$/.test(p));
        if (namePart) {
          displayName =
            namePart.length > 8 ? namePart.substring(0, 8) + '...' : namePart;
        }
      }

      agentList.push({
        id: agentId,
        role: 'researcher',
        name: displayName,
        status:
          hasExecuting || hasNeedsRevision
            ? 'working'
            : allCompleted
              ? 'completed'
              : 'idle',
        workingStatus,
        taskCount: assignedTasks.length,
        completedCount: assignedTasks.filter((t) => t.status === 'COMPLETED')
          .length,
      });
    });

    // 审核员
    if (reviewTasks.length > 0) {
      const hasExecuting = reviewTasks.some(
        (task) => task.status === 'EXECUTING'
      );
      const allCompleted = reviewTasks.every(
        (task) => task.status === 'COMPLETED'
      );
      agentList.push({
        id: 'reviewer',
        role: 'reviewer',
        name: t('topicResearch.agentNames.qualityReviewer'),
        status: hasExecuting ? 'working' : allCompleted ? 'completed' : 'idle',
        workingStatus: hasExecuting
          ? t('topicResearch.workingStatus.reviewing')
          : undefined,
        taskCount: reviewTasks.length,
        completedCount: reviewTasks.filter(
          (task) => task.status === 'COMPLETED'
        ).length,
      });
    }

    // 撰写者
    if (synthesisTasks.length > 0) {
      const hasExecuting = synthesisTasks.some(
        (task) => task.status === 'EXECUTING'
      );
      const allCompleted = synthesisTasks.every(
        (task) => task.status === 'COMPLETED'
      );
      agentList.push({
        id: 'synthesizer',
        role: 'synthesizer',
        name: t('topicResearch.agentNames.reportWriter'),
        status: hasExecuting ? 'working' : allCompleted ? 'completed' : 'idle',
        workingStatus: hasExecuting
          ? t('topicResearch.workingStatus.integrating')
          : undefined,
        taskCount: synthesisTasks.length,
        completedCount: synthesisTasks.filter(
          (task) => task.status === 'COMPLETED'
        ).length,
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

  // ★ 统一状态计算：综合考虑 currentPhase 和 isMissionActive，确保上下一致
  const rawPhase =
    missionStatus?.currentPhase || refreshProgress?.phase || 'idle';

  // ★ 修复状态不一致：如果有任务正在执行但 currentPhase 显示为 idle/unknown，强制显示为 researching
  const currentPhase = useMemo(() => {
    // 如果后端返回的 phase 是明确的状态，直接使用
    if (
      [
        'planning',
        'PLANNING',
        'researching',
        'RESEARCHING',
        'EXECUTING',
        'reviewing',
        'REVIEWING',
        'completed',
        'COMPLETED',
        'failed',
        'FAILED',
      ].includes(rawPhase)
    ) {
      return rawPhase;
    }
    // 如果 isMissionActive 为 true，但 phase 是 idle/unknown，强制显示为 researching
    if (isMissionActive) {
      return 'researching';
    }
    // 检查 missionStatus.status 是否为活动状态
    if (
      missionStatus?.status &&
      ['PLANNING', 'EXECUTING', 'REVIEWING'].includes(missionStatus.status)
    ) {
      return missionStatus.status.toLowerCase();
    }
    return rawPhase;
  }, [rawPhase, isMissionActive, missionStatus?.status]);

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
            <span className="text-gray-400">
              {t('topicResearch.common.totalTasks', { count: stats.total })}
            </span>
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
            <span>{t('topicResearch.common.overallProgress')}</span>
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
          teamInfo={teamInfo}
          missionStatus={missionStatus}
          getAgentDisplay={getAgentDisplay}
          getAgentRoleInfo={getAgentRoleInfo}
        />
      </div>

      {/* Task List - 按状态排序 */}
      <div className="flex-1 overflow-y-auto">
        {!hasMission ? (
          <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
            <div className="mb-3 text-3xl">👑</div>
            <p className="text-sm font-medium text-gray-700">
              {t('topicResearch.common.waitingForLeader')}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {t('topicResearch.common.clickStartHint')}
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
            {t('topicResearch.common.phase')}:{' '}
            {phaseDisplay[currentPhase] || currentPhase}
          </span>
          {/* ★ 统一使用 currentPhase 显示状态，与上方保持一致 */}
          <span
            className={`rounded-full px-2 py-0.5 ${
              currentPhase === 'completed'
                ? 'bg-green-100 text-green-700'
                : currentPhase === 'failed'
                  ? 'bg-red-100 text-red-700'
                  : [
                        'planning',
                        'PLANNING',
                        'researching',
                        'RESEARCHING',
                        'EXECUTING',
                        'reviewing',
                        'REVIEWING',
                      ].includes(currentPhase)
                    ? 'bg-blue-100 text-blue-700'
                    : missionStatus &&
                        ['PAUSED', 'CANCELLED'].includes(
                          missionStatus.status || ''
                        )
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-gray-100 text-gray-600'
            }`}
          >
            {[
              'planning',
              'PLANNING',
              'researching',
              'RESEARCHING',
              'EXECUTING',
              'reviewing',
              'REVIEWING',
            ].includes(currentPhase)
              ? t('topicResearch.status.inProgress')
              : missionStatus &&
                  ['PAUSED', 'CANCELLED'].includes(missionStatus.status || '')
                ? t('topicResearch.status.paused')
                : currentPhase === 'completed'
                  ? t('topicResearch.status.completed')
                  : currentPhase === 'failed'
                    ? t('topicResearch.status.failed')
                    : t('topicResearch.status.idle')}
          </span>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <div className="mb-1 flex items-center gap-2 font-medium">
              <span>⚠️</span>
              <span>{t('topicResearch.errors.startResearchFailed')}</span>
            </div>
            <p className="text-xs text-red-600">
              {typeof error === 'string'
                ? error
                : t('topicResearch.errors.startResearchFailed')}
            </p>
          </div>
        )}

        {/* V5: Research Depth Badge (when mission is active) */}
        {isMissionActive && researchDepth && (
          <div className="mb-2 flex items-center gap-1.5 rounded-md bg-gray-50 px-2.5 py-1.5 text-xs text-gray-600">
            <span className="font-medium text-gray-500">
              {t('topicResearch.researchDepth.label')}:
            </span>
            <span
              className={`rounded px-1.5 py-0.5 font-medium ${
                researchDepth === 'thorough'
                  ? 'bg-purple-100 text-purple-700'
                  : researchDepth === 'quick'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-blue-100 text-blue-700'
              }`}
            >
              {t(`topicResearch.researchDepth.${researchDepth}`)}
            </span>
          </div>
        )}

        {/* V5: Research Depth Selector */}
        {!isMissionActive && canEdit && onResearchDepthChange && (
          <div className="mb-2">
            <div className="mb-1 text-xs font-medium text-gray-500">
              {t('topicResearch.researchDepth.label')}
            </div>
            <div className="grid grid-cols-3 gap-1">
              {(['quick', 'standard', 'thorough'] as const).map((depth) => {
                const labels: Record<string, string> = {
                  quick: t('topicResearch.researchDepth.quick'),
                  standard: t('topicResearch.researchDepth.standard'),
                  thorough: t('topicResearch.researchDepth.thorough'),
                };
                const descriptions: Record<string, string> = {
                  quick: t('topicResearch.researchDepth.quickDesc'),
                  standard: t('topicResearch.researchDepth.standardDesc'),
                  thorough: t('topicResearch.researchDepth.thoroughDesc'),
                };
                const isSelected = researchDepth === depth;
                return (
                  <button
                    key={depth}
                    onClick={() => onResearchDepthChange(depth)}
                    className={`rounded-md px-2 py-1.5 text-xs transition-all ${
                      isSelected
                        ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-300'
                        : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                    }`}
                    title={descriptions[depth]}
                  >
                    <div className="font-medium">{labels[depth]}</div>
                    <div className="mt-0.5 text-[10px] opacity-70">
                      {descriptions[depth]}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Action Buttons - 三个等宽按钮：开始/更新/取消 */}
        {/* ★ 权限提示：没有编辑权限时显示提示 */}
        {!canEdit && (
          <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            <span className="font-medium">
              {t('topicResearch.common.readOnlyMode')}
            </span>{' '}
            -{t('topicResearch.sharing.readOnlyHint')}
          </div>
        )}
        <div className="grid grid-cols-3 gap-2">
          {/* 开始按钮 - 从头开始新研究 */}
          <button
            onClick={onStartRefresh}
            disabled={isMissionActive || !canEdit}
            title={
              !canEdit
                ? t('topicResearch.common.needEditPermission')
                : undefined
            }
            className={`flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
              isMissionActive || !canEdit
                ? 'cursor-not-allowed border border-gray-200 bg-gray-100 text-gray-400'
                : 'bg-blue-600 text-white shadow-sm hover:bg-blue-700'
            }`}
          >
            <span>▶</span>
            {t('topicResearch.common.start')}
          </button>

          {/* 更新按钮 - 在现有基础上更新 */}
          <button
            onClick={onContinueRefresh}
            disabled={isMissionActive || !missionStatus || !canEdit}
            title={
              !canEdit
                ? t('topicResearch.common.needEditPermission')
                : undefined
            }
            className={`flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
              isMissionActive || !missionStatus || !canEdit
                ? 'cursor-not-allowed border border-gray-200 bg-gray-100 text-gray-400'
                : 'bg-green-600 text-white shadow-sm hover:bg-green-700'
            }`}
          >
            <span>🔄</span>
            {t('topicResearch.common.update')}
          </button>

          {/* 取消按钮 - 停止当前任务 */}
          <button
            onClick={onCancelRefresh}
            disabled={!isMissionActive || !canEdit}
            title={
              !canEdit
                ? t('topicResearch.common.needEditPermission')
                : undefined
            }
            className={`flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
              !isMissionActive || !canEdit
                ? 'cursor-not-allowed border border-gray-200 bg-gray-100 text-gray-400'
                : 'border border-red-200 bg-red-50 text-red-600 hover:bg-red-100'
            }`}
          >
            <span>⏹</span>
            {t('topicResearch.common.cancel')}
          </button>
        </div>
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
  teamInfo,
  missionStatus,
  getAgentDisplay,
  getAgentRoleInfo,
}: {
  agents: ResearchAgent[];
  currentPhase: string;
  isRefreshing: boolean;
  hoveredAgent: string | null;
  onHover: (id: string | null) => void;
  selectedAgent: string | null;
  onSelect: (id: string | null) => void;
  teamInfo?: TeamInfo | null;
  missionStatus?: MissionStatus | null;
  getAgentDisplay: (role: string) => {
    name: string;
    icon: string;
    color: string;
  };
  getAgentRoleInfo: (role: string) => {
    description: string;
    capabilities: string[];
    note: string;
  };
}) {
  const { t } = useTranslation();
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

          {/* ★ 工作状态标签 */}
          {agent.workingStatus && (
            <text
              textAnchor="middle"
              y={nodeRadius + 22}
              className="animate-pulse fill-blue-600 font-medium"
              style={{ fontSize: '8px' }}
            >
              {agent.workingStatus}
            </text>
          )}

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
          <span>{t('topicResearch.common.working')}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 rounded-full bg-green-500"></div>
          <span>{t('topicResearch.status.completed')}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 rounded-full bg-gray-400"></div>
          <span>{t('topicResearch.status.idle')}</span>
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
                    ? t('topicResearch.common.taskProgress', {
                        completed: agent.completedCount,
                        total: agent.taskCount,
                      })
                    : t('topicResearch.common.noTasks')}
                </div>
                {agent.status === 'working' && (
                  <div className="mt-0.5 text-blue-600">
                    {t('topicResearch.common.executing')}
                  </div>
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
              {/* 点击外部关闭 - 透明遮罩 */}
              <div
                className="absolute inset-0 z-20"
                onClick={() => onSelect(null)}
              />
              {/* 详情卡片 */}
              <div className="absolute left-1/2 top-1/2 z-30 w-[280px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-gray-200 bg-white p-4 shadow-lg">
                {/* 头部 - 名称 */}
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50">
                      <span className="text-xl">{display.icon}</span>
                    </div>
                    <div>
                      <div className="font-semibold text-gray-800">
                        {agent.name}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">
                          {display.name}
                        </span>
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
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
                            ? t('topicResearch.common.working')
                            : agent.status === 'completed'
                              ? t('topicResearch.status.completed')
                              : agent.status === 'error'
                                ? t('common.error')
                                : t('topicResearch.status.idle')}
                        </span>
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

                {/* Task Progress */}
                {agent.taskCount > 0 && (
                  <div className="mb-3 rounded-lg bg-gray-50 px-3 py-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">
                        {t('topicResearch.common.taskProgressLabel')}
                      </span>
                      <span className="font-medium text-gray-700">
                        {t('topicResearch.common.taskProgressValue', {
                          completed: agent.completedCount,
                          total: agent.taskCount,
                        })}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-200">
                      <div
                        className={`h-full transition-all ${
                          agent.completedCount === agent.taskCount
                            ? 'bg-green-500'
                            : 'bg-blue-500'
                        }`}
                        style={{
                          width: `${(agent.completedCount / agent.taskCount) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* 职责描述 */}
                <div className="mb-3">
                  <div className="mb-1 text-xs font-medium text-gray-500">
                    📋 {t('topicResearch.common.responsibilities')}
                  </div>
                  <p className="text-sm text-gray-700">
                    {roleInfo.description}
                  </p>
                </div>

                {/* ★ v8.0: 技能 - 优先显示 Leader 分配的真实技能 */}
                {(() => {
                  // 从 teamInfo 获取匹配的 Agent 信息
                  const teamAgent = teamInfo?.agents?.find(
                    (ta) => ta.id === agent.id || ta.id.includes(agent.id)
                  );
                  // ★ 使用类型守卫验证数据有效性
                  const realSkills = isValidStringArray(teamAgent?.skills)
                    ? teamAgent.skills
                    : undefined;
                  const realTools = isValidStringArray(teamAgent?.tools)
                    ? teamAgent.tools
                    : undefined;
                  const hasRealData = !!realSkills || !!realTools;

                  return (
                    <>
                      {/* 技能 */}
                      <div className="mb-3">
                        <div className="mb-1.5 text-xs font-medium text-gray-500">
                          🎯{' '}
                          {hasRealData
                            ? t('topicResearch.common.assignedSkills')
                            : t('topicResearch.common.capabilityRange')}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {realSkills ? (
                            realSkills.map((skill: string, i: number) => (
                              <span
                                key={i}
                                className="rounded-full bg-blue-50 px-2.5 py-1 text-xs text-blue-700"
                              >
                                {skill}
                              </span>
                            ))
                          ) : roleInfo.capabilities &&
                            roleInfo.capabilities.length > 0 ? (
                            roleInfo.capabilities.map(
                              (cap: string, i: number) => (
                                <span
                                  key={i}
                                  className="rounded-full bg-gray-50 px-2.5 py-1 text-xs text-gray-600"
                                >
                                  {cap}
                                </span>
                              )
                            )
                          ) : (
                            <span className="italic text-gray-400">
                              {t('topicResearch.common.pendingAssignment')}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 工具 - 仅当有真实数据时显示 */}
                      {hasRealData && realTools && realTools.length > 0 && (
                        <div className="mb-3">
                          <div className="mb-1.5 text-xs font-medium text-gray-500">
                            🔧 {t('topicResearch.common.assignedTools')}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {realTools.map((tool: string, i: number) => (
                              <span
                                key={i}
                                className="rounded-full bg-green-50 px-2.5 py-1 text-xs text-green-700"
                              >
                                {tool}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 配置说明 - 仅当没有真实数据时显示 */}
                      {!hasRealData && (
                        <div className="mb-3">
                          <div className="mb-1.5 text-xs font-medium text-gray-500">
                            ⚙️ {t('topicResearch.common.configMethod')}
                          </div>
                          <p className="text-xs italic text-gray-600">
                            {roleInfo.note}
                          </p>
                        </div>
                      )}
                    </>
                  );
                })()}

                {/* ★ AI 模型 - 显示 Agent 实际使用的模型 */}
                <div>
                  <div className="mb-1.5 text-xs font-medium text-gray-500">
                    🤖 {t('topicResearch.common.aiModel')}
                  </div>
                  <div className="rounded-lg bg-gradient-to-r from-indigo-50 to-purple-50 px-3 py-2">
                    {agent.role === 'leader' ? (
                      <span className="font-mono text-sm font-medium text-indigo-700">
                        {teamInfo?.leaderModel ||
                          t('topicResearch.common.notSpecified')}
                      </span>
                    ) : (
                      (() => {
                        // 获取分配给该 Agent 的实际任务及其模型
                        const tasks = missionStatus?.tasks || [];
                        const dimensionTasks = tasks.filter(
                          (t: TaskStatus) => t.taskType === 'dimension_research'
                        );
                        const reviewTasks = tasks.filter(
                          (t: TaskStatus) => t.taskType === 'quality_review'
                        );
                        const synthesisTasks = tasks.filter(
                          (t: TaskStatus) => t.taskType === 'report_synthesis'
                        );

                        let assignedTasks: TaskStatus[] = [];
                        if (agent.role === 'researcher') {
                          // 研究员按 round-robin 分配
                          const researcherIndex = parseInt(
                            agent.id.replace('researcher-', ''),
                            10
                          );
                          const researcherCount = agents.filter(
                            (a) => a.role === 'researcher'
                          ).length;
                          assignedTasks = dimensionTasks.filter(
                            (_: TaskStatus, idx: number) =>
                              idx % researcherCount === researcherIndex
                          );
                        } else if (agent.role === 'reviewer') {
                          assignedTasks = reviewTasks;
                        } else if (agent.role === 'synthesizer') {
                          assignedTasks = synthesisTasks;
                        }

                        // 收集唯一的模型（displayName 优先，fallback 到 modelId）
                        const modelEntries = new Map<
                          string,
                          { id: string; displayName?: string }
                        >();
                        for (const task of assignedTasks) {
                          if (task.modelId && !modelEntries.has(task.modelId)) {
                            modelEntries.set(task.modelId, {
                              id: task.modelId,
                              displayName: task.modelDisplayName,
                            });
                          }
                        }
                        const models = [...modelEntries.values()];

                        if (models.length === 0) {
                          return (
                            <span className="font-mono text-sm text-gray-400">
                              {t('topicResearch.common.notSpecified')}
                            </span>
                          );
                        }

                        return (
                          <div className="flex flex-wrap gap-1">
                            {models.map((model, idx: number) => (
                              <span key={model.id}>
                                <ModelBadge
                                  modelId={model.id}
                                  displayName={model.displayName}
                                  variant="compact"
                                />
                                {idx < models.length - 1 && ', '}
                              </span>
                            ))}
                          </div>
                        );
                      })()
                    )}
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

/**
 * 根据进度百分比返回当前阶段描述
 * 进度阶段（匹配后端 dimension-mission.service.ts 的进度计算）：
 * - 0-10%: 收集中 (搜索资料)
 * - 10-30%: 规划中 (Leader 规划大纲)
 * - 30-80%: 研究中 (研究员撰写章节)
 * - 80-100%: 整合中 (Leader 整合报告)
 */
function getProgressStage(progress: number): string {
  if (progress < 10) return '收集中';
  if (progress < 30) return '规划中';
  if (progress < 80) return '研究中';
  return '整合中';
}

function TaskItem({ task }: { task: TaskStatus }) {
  const { t } = useTranslation();
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

      {/* 状态标签（不显示具体进度） */}
      <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${colorClass}`}>
        {task.status === 'COMPLETED'
          ? t('topicResearch.common.completed')
          : task.status === 'FAILED'
            ? t('topicResearch.common.failed')
            : task.status === 'EXECUTING'
              ? t('topicResearch.common.inProgress')
              : task.status === 'NEEDS_REVISION'
                ? t('topicResearch.common.needsRevision')
                : t('topicResearch.common.pendingProcess')}
      </span>
    </div>
  );
}
