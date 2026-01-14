/**
 * ResearchTimeline - 研究历史时间线组件
 *
 * Phase 2.3: 可信度与追溯 - 增强版
 *
 * 功能：
 * - 按研究会话分组展示（第N次研究）
 * - 每个会话包含：研究规划、维度研究进展、团队互动、研究成果
 * - 每个研究员支持展开思考阶段时间线
 * - 支持查看历史版本和对比
 */

'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  getResearchHistory,
  getAgentActivities,
  getTeamMessages,
  type ResearchHistoryItem,
  type AgentActivity,
  type TeamMessage,
} from '@/lib/api/topic-research';
import {
  Calendar,
  Clock,
  Target,
  Layers,
  ChevronDown,
  ChevronRight,
  FileText,
  CheckCircle,
  XCircle,
  AlertTriangle,
  TrendingUp,
  BookOpen,
  ArrowRight,
  Brain,
  Search,
  MessageSquare,
  Users,
  Lightbulb,
  Database,
  Award,
} from 'lucide-react';
import { cn } from '@/lib/utils/common';

// ==================== Types ====================

export type ResearchStatus =
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'IN_PROGRESS';

export type ThinkingPhase =
  | 'understanding'
  | 'searching'
  | 'writing'
  | 'reviewing'
  | 'integrating';

export type AgentRole = 'leader' | 'researcher' | 'reviewer' | 'synthesizer';

export interface ResearchTimelineProps {
  // 模式1: 传入 topicId，组件自动获取数据
  topicId?: string;
  // 模式2: 直接传入数据
  histories?: ResearchHistoryItem[];
  activities?: AgentActivity[];
  messages?: TeamMessage[];
  currentResearchNumber?: number;
  isLoading?: boolean;
  onSelectResearch?: (history: ResearchHistoryItem) => void;
  onCompareVersions?: (fromVersion: number, toVersion: number) => void;
  onViewReport?: (version: number) => void;
}

// ==================== Helper Functions ====================

// 扩展的 Activity 类型（包含 metadata 中的可选字段）
interface ExtendedAgentActivity extends AgentActivity {
  thinkingPhase?: ThinkingPhase;
  thinkingContent?: string;
  searchResults?: {
    total: number;
    filtered: number;
    sources: Array<{ domain: string; count: number }>;
  };
  writingProgress?: {
    sections: Array<{
      title: string;
      status: 'pending' | 'writing' | 'reviewing' | 'completed';
      revisions: number;
    }>;
    current?: string;
  };
  durationMs?: number;
}

// 从 metadata 中提取扩展字段
function getExtendedActivity(activity: AgentActivity): ExtendedAgentActivity {
  const metadata = activity.metadata || {};
  return {
    ...activity,
    thinkingPhase: metadata.thinkingPhase as ThinkingPhase | undefined,
    thinkingContent: metadata.thinkingContent as string | undefined,
    searchResults:
      metadata.searchResults as ExtendedAgentActivity['searchResults'],
    writingProgress:
      metadata.writingProgress as ExtendedAgentActivity['writingProgress'],
    durationMs: metadata.durationMs as number | undefined,
  };
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(ms: number): string {
  if (ms < 60000) return `${Math.round(ms / 1000)}秒`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}分钟`;
  return `${Math.floor(ms / 3600000)}小时${Math.floor((ms % 3600000) / 60000)}分钟`;
}

const statusConfig: Record<
  ResearchStatus,
  {
    icon: React.ElementType;
    label: string;
    color: string;
    borderColor: string;
  }
> = {
  COMPLETED: {
    icon: CheckCircle,
    label: '已完成',
    color: 'text-green-600 dark:text-green-400',
    borderColor: 'border-green-300 dark:border-green-700',
  },
  FAILED: {
    icon: XCircle,
    label: '失败',
    color: 'text-red-600 dark:text-red-400',
    borderColor: 'border-red-300 dark:border-red-700',
  },
  CANCELLED: {
    icon: AlertTriangle,
    label: '已取消',
    color: 'text-yellow-600 dark:text-yellow-400',
    borderColor: 'border-yellow-300 dark:border-yellow-700',
  },
  IN_PROGRESS: {
    icon: Clock,
    label: '进行中',
    color: 'text-blue-600 dark:text-blue-400',
    borderColor: 'border-blue-300 dark:border-blue-700 shadow-md',
  },
};

const phaseConfig: Record<
  ThinkingPhase,
  {
    icon: React.ElementType;
    label: string;
    color: string;
  }
> = {
  understanding: {
    icon: Brain,
    label: '理解',
    color: 'text-purple-600 dark:text-purple-400',
  },
  searching: {
    icon: Search,
    label: '搜索',
    color: 'text-blue-600 dark:text-blue-400',
  },
  writing: {
    icon: FileText,
    label: '撰写',
    color: 'text-green-600 dark:text-green-400',
  },
  reviewing: {
    icon: CheckCircle,
    label: '审核',
    color: 'text-yellow-600 dark:text-yellow-400',
  },
  integrating: {
    icon: Layers,
    label: '整合',
    color: 'text-indigo-600 dark:text-indigo-400',
  },
};

// ==================== Sub Components ====================

/**
 * 思考阶段时间线（单个研究员的思考过程）
 */
function ThinkingPhasesTimeline({
  activities,
}: {
  activities: ExtendedAgentActivity[];
}) {
  if (activities.length === 0) return null;

  return (
    <div className="mt-2 space-y-2 border-l-2 border-gray-200 pl-3 dark:border-gray-700">
      {activities.map((activity) => {
        const phase = activity.thinkingPhase;
        const phaseInfo = phase ? phaseConfig[phase] : null;
        const Icon = phaseInfo?.icon || Brain;

        return (
          <div key={activity.id} className="relative">
            {/* 时间线节点 */}
            <div
              className={cn(
                'absolute -left-[17px] top-1 h-3 w-3 rounded-full border-2 border-white dark:border-gray-800',
                activity.activityType === 'COMPLETED'
                  ? 'bg-green-500'
                  : activity.activityType === 'FAILED'
                    ? 'bg-red-500'
                    : 'animate-pulse bg-blue-500'
              )}
            />

            {/* 阶段内容 */}
            <div className="rounded-lg bg-gray-50 p-2 text-xs dark:bg-gray-800/50">
              <div className="mb-1 flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <Icon className={cn('h-3 w-3', phaseInfo?.color)} />
                  <span className="font-medium text-gray-900 dark:text-white">
                    {phaseInfo?.label || activity.phase || '进行中'}
                  </span>
                </div>
                {activity.durationMs && (
                  <span className="text-gray-500">
                    {formatDuration(activity.durationMs)}
                  </span>
                )}
              </div>

              {/* 思考内容 */}
              {activity.thinkingContent && (
                <div className="mb-1 text-gray-700 dark:text-gray-300">
                  {activity.thinkingContent}
                </div>
              )}

              {/* 搜索结果统计 */}
              {phase === 'searching' && activity.searchResults && (
                <div className="mt-1 flex items-center gap-2 text-gray-500">
                  <Database className="h-3 w-3" />
                  <span>
                    检索 {activity.searchResults.total} 条，筛选{' '}
                    {activity.searchResults.filtered} 条
                  </span>
                  {Array.isArray(activity.searchResults.sources) &&
                    activity.searchResults.sources.length > 0 && (
                      <span className="text-gray-400">
                        (来源:{' '}
                        {activity.searchResults.sources
                          .slice(0, 2)
                          .map((s) => s.domain)
                          .join(', ')}
                        )
                      </span>
                    )}
                </div>
              )}

              {/* 撰写进度 */}
              {phase === 'writing' &&
                activity.writingProgress &&
                Array.isArray(activity.writingProgress.sections) && (
                  <div className="mt-1 space-y-0.5">
                    {activity.writingProgress.sections.map((section, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-1 text-gray-600 dark:text-gray-400"
                      >
                        <div
                          className={cn(
                            'h-1.5 w-1.5 rounded-full',
                            section.status === 'completed'
                              ? 'bg-green-500'
                              : section.status === 'writing'
                                ? 'bg-yellow-500'
                                : 'bg-gray-300'
                          )}
                        />
                        <span>{section.title}</span>
                        {section.revisions > 0 && (
                          <span className="text-gray-400">
                            (修订{section.revisions}次)
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * 研究员卡片（按维度）
 */
function ResearcherCard({
  dimensionName,
  activities,
  citations,
}: {
  dimensionName: string;
  activities: ExtendedAgentActivity[];
  citations: number;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const completedActivities = activities.filter(
    (a) => a.activityType === 'COMPLETED'
  );
  const status =
    completedActivities.length === activities.length
      ? 'completed'
      : activities.some((a) => a.activityType === 'FAILED')
        ? 'failed'
        : 'in_progress';

  const totalDuration = activities.reduce(
    (sum, a) => sum + (a.durationMs || 0),
    0
  );

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border bg-white dark:bg-gray-800',
        status === 'completed' && 'border-green-200 dark:border-green-800',
        status === 'failed' && 'border-red-200 dark:border-red-800',
        status === 'in_progress' && 'border-blue-200 dark:border-blue-800'
      )}
    >
      {/* 头部 */}
      <div
        className="flex cursor-pointer items-center gap-2 p-2.5"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-full',
            status === 'completed' && 'bg-green-100 dark:bg-green-900',
            status === 'failed' && 'bg-red-100 dark:bg-red-900',
            status === 'in_progress' && 'bg-blue-100 dark:bg-blue-900'
          )}
        >
          <BookOpen
            className={cn(
              'h-3.5 w-3.5',
              status === 'completed' && 'text-green-600 dark:text-green-400',
              status === 'failed' && 'text-red-600 dark:text-red-400',
              status === 'in_progress' && 'text-blue-600 dark:text-blue-400'
            )}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-gray-900 dark:text-white">
            {dimensionName}
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            {totalDuration > 0 && (
              <span className="flex items-center gap-0.5">
                <Clock className="h-3 w-3" />
                {formatDuration(totalDuration)}
              </span>
            )}
            {citations > 0 && (
              <span className="flex items-center gap-0.5">
                <Award className="h-3 w-3" />
                {citations}条引用
              </span>
            )}
            <span
              className={cn(
                'rounded px-1 py-0.5',
                status === 'completed' &&
                  'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
                status === 'failed' &&
                  'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
                status === 'in_progress' &&
                  'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
              )}
            >
              {completedActivities.length}/{activities.length} 阶段完成
            </span>
          </div>
        </div>

        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-gray-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-gray-400" />
        )}
      </div>

      {/* 展开：思考阶段时间线 */}
      {isExpanded && (
        <div className="border-t border-gray-100 p-2.5 dark:border-gray-700">
          <ThinkingPhasesTimeline activities={activities} />
        </div>
      )}
    </div>
  );
}

/**
 * Leader 规划部分
 */
function LeaderPlanSection({
  goal,
  strategy,
}: {
  goal?: string;
  strategy?: string;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!goal && !strategy) return null;

  return (
    <div className="overflow-hidden rounded-lg border border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/30">
      <div
        className="flex cursor-pointer items-center gap-2 p-2.5"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <Target className="h-4 w-4 text-orange-600 dark:text-orange-400" />
        <span className="font-medium text-orange-900 dark:text-orange-200">
          Leader 研究规划
        </span>
        {isExpanded ? (
          <ChevronDown className="ml-auto h-4 w-4 text-orange-600" />
        ) : (
          <ChevronRight className="ml-auto h-4 w-4 text-orange-600" />
        )}
      </div>

      {isExpanded && (
        <div className="space-y-2 border-t border-orange-200 p-2.5 text-sm dark:border-orange-800">
          {goal && (
            <div>
              <div className="mb-1 text-xs font-medium text-orange-700 dark:text-orange-400">
                研究目标
              </div>
              <div className="text-gray-700 dark:text-gray-300">{goal}</div>
            </div>
          )}
          {strategy && (
            <div>
              <div className="mb-1 text-xs font-medium text-orange-700 dark:text-orange-400">
                研究策略
              </div>
              <div className="text-gray-700 dark:text-gray-300">{strategy}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 维度研究进展部分
 */
function DimensionProgressSection({
  dimensionActivities,
  dimensionsUpdated,
}: {
  dimensionActivities: Map<string, ExtendedAgentActivity[]>;
  dimensionsUpdated: string[];
}) {
  if (dimensionActivities.size === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
        <Layers className="h-4 w-4" />
        <span>维度研究进展</span>
        <span className="text-xs text-gray-500">
          ({dimensionsUpdated.length} 个维度更新)
        </span>
      </div>
      <div className="space-y-2">
        {Array.from(dimensionActivities.entries()).map(
          ([dimensionName, activities]) => (
            <ResearcherCard
              key={dimensionName}
              dimensionName={dimensionName}
              activities={activities}
              citations={0} // TODO: 从实际数据获取引用数
            />
          )
        )}
      </div>
    </div>
  );
}

/**
 * 团队互动部分
 */
function TeamInteractionSection({ messages }: { messages: TeamMessage[] }) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (messages.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-lg border border-purple-200 bg-purple-50 dark:border-purple-800 dark:bg-purple-950/30">
      <div
        className="flex cursor-pointer items-center gap-2 p-2.5"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <MessageSquare className="h-4 w-4 text-purple-600 dark:text-purple-400" />
        <span className="font-medium text-purple-900 dark:text-purple-200">
          团队互动
        </span>
        <span className="ml-auto text-xs text-purple-600">
          {messages.length} 条消息
        </span>
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-purple-600" />
        ) : (
          <ChevronRight className="h-4 w-4 text-purple-600" />
        )}
      </div>

      {isExpanded && (
        <div className="max-h-48 space-y-1.5 overflow-y-auto border-t border-purple-200 p-2.5 dark:border-purple-800">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className="rounded bg-white p-2 text-xs dark:bg-purple-900/30"
            >
              <div className="mb-0.5 flex items-center gap-1.5 text-purple-700 dark:text-purple-300">
                <Users className="h-3 w-3" />
                <span className="font-medium">{msg.senderName}</span>
                <span className="text-gray-500">
                  {formatDate(msg.createdAt)}
                </span>
              </div>
              <div className="text-gray-700 dark:text-gray-300">
                {msg.content}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 研究成果部分
 */
function OutcomeSection({ history }: { history: ResearchHistoryItem }) {
  const netChange = (history.wordsAdded || 0) - (history.wordsRemoved || 0);
  const dimensionsUpdated = Array.isArray(history.dimensionsUpdated)
    ? history.dimensionsUpdated
    : [];
  const dimensionsKept = Array.isArray(history.dimensionsKept)
    ? history.dimensionsKept
    : [];

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-2.5 dark:border-gray-700 dark:bg-gray-800/50">
      <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
        <TrendingUp className="h-4 w-4" />
        <span>研究成果</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
        <div className="rounded bg-blue-100 p-1.5 dark:bg-blue-900/30">
          <div className="mb-0.5 text-blue-600 dark:text-blue-400">
            更新维度
          </div>
          <div className="text-lg font-semibold text-blue-700 dark:text-blue-300">
            {dimensionsUpdated.length}
          </div>
        </div>

        <div className="rounded bg-gray-100 p-1.5 dark:bg-gray-900/30">
          <div className="mb-0.5 text-gray-600 dark:text-gray-400">
            保留维度
          </div>
          <div className="text-lg font-semibold text-gray-700 dark:text-gray-300">
            {dimensionsKept.length}
          </div>
        </div>

        {(history.wordsAdded > 0 || history.wordsRemoved > 0) && (
          <div
            className={cn(
              'rounded p-1.5',
              netChange >= 0
                ? 'bg-green-100 dark:bg-green-900/30'
                : 'bg-red-100 dark:bg-red-900/30'
            )}
          >
            <div
              className={cn(
                'mb-0.5',
                netChange >= 0
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400'
              )}
            >
              字数变化
            </div>
            <div
              className={cn(
                'text-lg font-semibold',
                netChange >= 0
                  ? 'text-green-700 dark:text-green-300'
                  : 'text-red-700 dark:text-red-300'
              )}
            >
              {netChange >= 0 ? '+' : ''}
              {netChange}
            </div>
          </div>
        )}

        {history.newSourcesCount > 0 && (
          <div className="rounded bg-purple-100 p-1.5 dark:bg-purple-900/30">
            <div className="mb-0.5 text-purple-600 dark:text-purple-400">
              新增来源
            </div>
            <div className="text-lg font-semibold text-purple-700 dark:text-purple-300">
              {history.newSourcesCount}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 研究会话卡片
 */
function SessionCard({
  history,
  dimensionActivities,
  sessionMessages,
  isCurrent,
  onSelect,
  onCompare,
  onViewReport,
}: {
  history: ResearchHistoryItem;
  dimensionActivities: Map<string, ExtendedAgentActivity[]>;
  sessionMessages: TeamMessage[];
  isCurrent: boolean;
  onSelect?: () => void;
  onCompare?: () => void;
  onViewReport?: (version: number) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(isCurrent);
  const status = statusConfig[history.status];
  const StatusIcon = status.icon;

  return (
    <div className="space-y-3">
      {/* 会话分隔线 */}
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gray-300 to-transparent dark:via-gray-700" />
        <div
          className={cn(
            'flex items-center gap-2 rounded-full border-2 px-3 py-1 text-sm font-medium',
            status.borderColor,
            isCurrent && 'bg-blue-50 dark:bg-blue-950/30'
          )}
        >
          <StatusIcon className={cn('h-4 w-4', status.color)} />
          <span className="text-gray-900 dark:text-white">
            第 {history.researchNumber} 次研究
          </span>
          <span className="text-xs text-gray-500">
            {formatDate(history.startedAt)}
          </span>
          {history.totalDurationMs && (
            <span className="text-xs text-gray-500">
              耗时 {formatDuration(history.totalDurationMs)}
            </span>
          )}
        </div>
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gray-300 to-transparent dark:via-gray-700" />
      </div>

      {/* 会话卡片主体 */}
      <div
        className={cn(
          'overflow-hidden rounded-lg border-2 bg-white dark:bg-gray-800',
          status.borderColor
        )}
      >
        {/* 快速预览头部 */}
        <div
          className="flex cursor-pointer items-center gap-3 p-3"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2 text-sm">
              <span className={cn('font-medium', status.color)}>
                {status.label}
              </span>
              {history.reportVersionAfter && (
                <span className="text-gray-500">
                  报告版本: v
                  {history.reportVersionBefore && (
                    <>
                      {history.reportVersionBefore}
                      <ArrowRight className="mx-0.5 inline h-3 w-3" />
                    </>
                  )}
                  {history.reportVersionAfter}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <Layers className="h-3 w-3" />
                更新{' '}
                {Array.isArray(history.dimensionsUpdated)
                  ? history.dimensionsUpdated.length
                  : 0}{' '}
                个维度
              </span>
              {history.newSourcesCount > 0 && (
                <span className="flex items-center gap-1">
                  <Database className="h-3 w-3" />
                  新增 {history.newSourcesCount} 条来源
                </span>
              )}
              {sessionMessages.length > 0 && (
                <span className="flex items-center gap-1">
                  <MessageSquare className="h-3 w-3" />
                  {sessionMessages.length} 条互动
                </span>
              )}
            </div>
          </div>

          {isExpanded ? (
            <ChevronDown className="h-5 w-5 text-gray-400" />
          ) : (
            <ChevronRight className="h-5 w-5 text-gray-400" />
          )}
        </div>

        {/* 展开内容 */}
        {isExpanded && (
          <div className="space-y-3 border-t border-gray-200 p-3 dark:border-gray-700">
            {/* Leader 规划 */}
            <LeaderPlanSection
              goal={history.researchGoal}
              strategy={history.researchStrategy}
            />

            {/* 维度研究进展 */}
            <DimensionProgressSection
              dimensionActivities={dimensionActivities}
              dimensionsUpdated={
                Array.isArray(history.dimensionsUpdated)
                  ? history.dimensionsUpdated
                  : []
              }
            />

            {/* 团队互动 */}
            <TeamInteractionSection messages={sessionMessages} />

            {/* 研究成果 */}
            <OutcomeSection history={history} />

            {/* 操作按钮 */}
            <div className="flex flex-wrap items-center gap-2">
              {onSelect && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect();
                  }}
                  className="flex items-center gap-1 rounded-lg bg-blue-500 px-2.5 py-1.5 text-xs text-white transition-colors hover:bg-blue-600"
                >
                  <Target className="h-3.5 w-3.5" />
                  查看详情
                </button>
              )}

              {onViewReport && history.reportVersionAfter && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewReport(history.reportVersionAfter!);
                  }}
                  className="flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  <FileText className="h-3.5 w-3.5" />
                  查看报告 v{history.reportVersionAfter}
                </button>
              )}

              {onCompare &&
                history.reportVersionBefore &&
                history.reportVersionAfter && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onCompare();
                    }}
                    className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                  >
                    <TrendingUp className="h-3.5 w-3.5" />
                    对比版本
                  </button>
                )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== Main Component ====================

export function ResearchTimeline({
  topicId,
  histories: propHistories,
  activities: propActivities,
  messages: propMessages,
  currentResearchNumber,
  isLoading: propIsLoading = false,
  onSelectResearch,
  onCompareVersions,
  onViewReport,
}: ResearchTimelineProps) {
  const [filter, setFilter] = useState<'all' | 'current' | 'previous'>('all');

  // 自动获取数据（如果提供了 topicId）
  const [fetchedHistories, setFetchedHistories] = useState<
    ResearchHistoryItem[]
  >([]);
  const [fetchedActivities, setFetchedActivities] = useState<AgentActivity[]>(
    []
  );
  const [fetchedMessages, setFetchedMessages] = useState<TeamMessage[]>([]);
  const [isFetching, setIsFetching] = useState(false);

  useEffect(() => {
    if (!topicId) return;

    const fetchData = async () => {
      setIsFetching(true);
      try {
        const [historiesData, activitiesData, messagesData] = await Promise.all(
          [
            getResearchHistory(topicId),
            getAgentActivities(topicId).catch(() => []),
            getTeamMessages(topicId).catch(() => []),
          ]
        );
        setFetchedHistories(historiesData);
        setFetchedActivities(activitiesData);
        setFetchedMessages(messagesData);
      } catch (error) {
        console.error('Failed to fetch research timeline data:', error);
        setFetchedHistories([]);
        setFetchedActivities([]);
        setFetchedMessages([]);
      } finally {
        setIsFetching(false);
      }
    };

    fetchData();
  }, [topicId]);

  // 使用传入的数据或获取的数据（确保有默认空数组）
  const histories = propHistories || fetchedHistories || [];
  const activities = propActivities || fetchedActivities || [];
  const messages = propMessages || fetchedMessages || [];
  const isLoading = propIsLoading || isFetching;

  // 按研究序号倒序排列
  const sortedHistories = useMemo(() => {
    if (!histories || histories.length === 0) return [];
    return [...histories].sort((a, b) => b.researchNumber - a.researchNumber);
  }, [histories]);

  // 过滤
  const filteredHistories = useMemo(() => {
    return sortedHistories.filter((h) => {
      if (filter === 'current')
        return h.researchNumber === currentResearchNumber;
      if (filter === 'previous')
        return h.researchNumber !== currentResearchNumber;
      return true;
    });
  }, [sortedHistories, filter, currentResearchNumber]);

  // 按会话分组活动和消息
  const sessionData = useMemo(() => {
    if (!filteredHistories || filteredHistories.length === 0) return [];

    return filteredHistories.map((history) => {
      // 该会话的所有活动（安全检查）
      const safeActivities = activities || [];
      const sessionActivities = safeActivities.filter(
        (a) => a.missionId === history.missionId
      );

      // 按维度分组活动（转换为扩展类型）
      const dimensionActivities = new Map<string, ExtendedAgentActivity[]>();
      sessionActivities.forEach((activity) => {
        const key = activity.dimensionName || '其他活动';
        if (!dimensionActivities.has(key)) {
          dimensionActivities.set(key, []);
        }
        dimensionActivities.get(key)!.push(getExtendedActivity(activity));
      });

      // 该会话的消息（安全检查）
      const safeMessages = messages || [];
      const sessionMessages = safeMessages.filter(
        (m) => m.missionId === history.missionId
      );

      return {
        history,
        dimensionActivities,
        sessionMessages,
      };
    });
  }, [filteredHistories, activities, messages]);

  // 加载状态
  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <Clock className="mx-auto mb-2 h-8 w-8 animate-pulse text-blue-500" />
          <div className="text-sm text-gray-500">加载研究历史...</div>
        </div>
      </div>
    );
  }

  // 无历史
  if (!histories || histories.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center text-center">
        <Calendar className="mb-3 h-12 w-12 text-gray-300" />
        <div className="mb-1 text-lg font-medium text-gray-900 dark:text-white">
          暂无研究历史
        </div>
        <div className="text-sm text-gray-500">
          开始研究后，历史记录将显示在这里
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 标题和筛选 */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          研究历史时间线
        </h2>
        <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
          {(['all', 'current', 'previous'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'rounded-md px-3 py-1 text-xs transition-colors',
                filter === f
                  ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              )}
            >
              {f === 'all' ? '全部' : f === 'current' ? '本次' : '历史'}
            </button>
          ))}
        </div>
      </div>

      {/* 统计 */}
      <div className="flex items-center gap-4 text-sm text-gray-500">
        <span>共 {histories.length} 次研究</span>
        <span>
          {histories.filter((h) => h.status === 'COMPLETED').length} 次成功
        </span>
      </div>

      {/* 会话列表 */}
      <div className="space-y-4">
        {sessionData.map(
          ({ history, dimensionActivities, sessionMessages }) => (
            <SessionCard
              key={history.id}
              history={history}
              dimensionActivities={dimensionActivities}
              sessionMessages={sessionMessages}
              isCurrent={history.researchNumber === currentResearchNumber}
              onSelect={
                onSelectResearch ? () => onSelectResearch(history) : undefined
              }
              onCompare={
                onCompareVersions &&
                history.reportVersionBefore &&
                history.reportVersionAfter
                  ? () =>
                      onCompareVersions(
                        history.reportVersionBefore!,
                        history.reportVersionAfter!
                      )
                  : undefined
              }
              onViewReport={onViewReport}
            />
          )
        )}
      </div>
    </div>
  );
}

export default ResearchTimeline;
