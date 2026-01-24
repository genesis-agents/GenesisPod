/**
 * AgentThinkingTimeline - Agent思考时间线组件
 *
 * Phase 1.3: 信息展示优化
 *
 * 功能：
 * - 展示Agent的完整思考过程（理解→搜索→撰写→审核→整合）
 * - 按维度/Agent分组显示
 * - 支持展开/收起详细内容
 * - 显示时间和进度信息
 */

'use client';

import React, { useState, useMemo } from 'react';
import {
  Brain,
  Search,
  FileText,
  CheckCircle,
  Layers,
  ChevronDown,
  ChevronRight,
  Clock,
  AlertTriangle,
  Loader2,
  User,
  Users,
  BookOpen,
  Lightbulb,
  Target,
} from 'lucide-react';
import { cn } from '@/lib/utils/common';

// ==================== Types ====================

export type ThinkingPhase =
  | 'understanding'
  | 'searching'
  | 'writing'
  | 'reviewing'
  | 'integrating';

export type AgentRole = 'leader' | 'researcher' | 'reviewer' | 'synthesizer';

export type ActivityStatus =
  | 'THINKING'
  | 'PLANNING'
  | 'RESEARCHING'
  | 'WRITING'
  | 'REVIEWING'
  | 'COMPLETED'
  | 'FAILED';

export interface AgentActivity {
  id: string;
  topicId: string;
  missionId: string;
  agentId: string;
  agentName: string;
  agentRole: AgentRole;
  activityType: ActivityStatus;
  phase?: string;
  content: string;
  progress: number;
  // 增强字段 (Phase 1.2)
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
  actionTaken?: string;
  actionResult?: Record<string, unknown>;
  phaseStartedAt?: string;
  phaseEndedAt?: string;
  durationMs?: number;
  dimensionId?: string;
  dimensionName?: string;
  createdAt: string;
}

export interface AgentThinkingTimelineProps {
  activities: AgentActivity[];
  missionId?: string;
  groupBy?: 'dimension' | 'agent' | 'time';
  isLoading?: boolean;
  showCompleted?: boolean;
  onActivityClick?: (activity: AgentActivity) => void;
}

// ==================== Constants ====================

const phaseConfig: Record<
  ThinkingPhase,
  {
    icon: React.ElementType;
    label: string;
    color: string;
    bgColor: string;
  }
> = {
  understanding: {
    icon: Brain,
    label: '理解阶段',
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-100 dark:bg-purple-900/30',
  },
  searching: {
    icon: Search,
    label: '搜索阶段',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
  },
  writing: {
    icon: FileText,
    label: '撰写阶段',
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
  },
  reviewing: {
    icon: CheckCircle,
    label: '审核阶段',
    color: 'text-yellow-600 dark:text-yellow-400',
    bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
  },
  integrating: {
    icon: Layers,
    label: '整合阶段',
    color: 'text-indigo-600 dark:text-indigo-400',
    bgColor: 'bg-indigo-100 dark:bg-indigo-900/30',
  },
};

const roleConfig: Record<
  AgentRole,
  {
    icon: React.ElementType;
    label: string;
    color: string;
  }
> = {
  leader: {
    icon: Target,
    label: '研究协调员',
    color: 'text-orange-600 dark:text-orange-400',
  },
  researcher: {
    icon: BookOpen,
    label: '研究员',
    color: 'text-blue-600 dark:text-blue-400',
  },
  reviewer: {
    icon: CheckCircle,
    label: '审核员',
    color: 'text-green-600 dark:text-green-400',
  },
  synthesizer: {
    icon: Layers,
    label: '整合员',
    color: 'text-purple-600 dark:text-purple-400',
  },
};

// ==================== Helper Functions ====================

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}秒`;
  return `${Math.floor(ms / 60000)}分${Math.floor((ms % 60000) / 1000)}秒`;
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// ==================== Sub Components ====================

// ★ 默认 phase 配置
const defaultPhaseConfig = {
  icon: Brain,
  label: '处理中',
  color: 'text-gray-600 dark:text-gray-400',
  bgColor: 'bg-gray-100 dark:bg-gray-900/30',
};

// ★ 安全获取 phase 配置
function getPhaseConfig(phase: string) {
  const key = phase.toLowerCase();
  return (
    phaseConfig[key as ThinkingPhase] ||
    phaseConfig[phase as ThinkingPhase] ||
    defaultPhaseConfig
  );
}

/**
 * 思考阶段详情
 */
function PhaseDetail({ activity }: { activity: AgentActivity }) {
  const phase = activity.thinkingPhase;
  if (!phase) return null;

  const config = getPhaseConfig(phase);
  const Icon = config.icon;

  return (
    <div className={cn('mt-2 rounded-lg p-3', config.bgColor)}>
      <div className="mb-2 flex items-center gap-2">
        <Icon className={cn('h-4 w-4', config.color)} />
        <span className={cn('text-sm font-medium', config.color)}>
          {config.label}
        </span>
        {activity.durationMs && (
          <span className="ml-auto text-xs text-gray-500">
            耗时: {formatDuration(activity.durationMs)}
          </span>
        )}
      </div>

      {/* 思考内容 */}
      {activity.thinkingContent && (
        <div className="mb-2 text-sm text-gray-700 dark:text-gray-300">
          &ldquo;{activity.thinkingContent}&rdquo;
        </div>
      )}

      {/* 搜索结果 */}
      {phase === 'searching' && activity.searchResults && (
        <div className="space-y-1">
          <div className="text-xs text-gray-500">
            检索到 {activity.searchResults.total} 条结果，筛选{' '}
            {activity.searchResults.filtered} 条
          </div>
          {activity.searchResults.sources.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {activity.searchResults.sources.slice(0, 5).map((source, idx) => (
                <span
                  key={idx}
                  className="rounded bg-white px-1.5 py-0.5 text-xs dark:bg-gray-800"
                >
                  {source.domain} ({source.count})
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 写作进度 */}
      {phase === 'writing' && activity.writingProgress && (
        <div className="space-y-1">
          {activity.writingProgress.sections.map((section, idx) => (
            <div key={idx} className="flex items-center gap-2 text-xs">
              <span
                className={cn(
                  'h-2 w-2 rounded-full',
                  section.status === 'completed'
                    ? 'bg-green-500'
                    : section.status === 'writing'
                      ? 'animate-pulse bg-yellow-500'
                      : section.status === 'reviewing'
                        ? 'bg-blue-500'
                        : 'bg-gray-300'
                )}
              />
              <span className="text-gray-600 dark:text-gray-400">
                {section.title}
              </span>
              {section.revisions > 0 && (
                <span className="text-gray-400">
                  (修订 {section.revisions} 次)
                </span>
              )}
              {section.status === 'completed' && (
                <CheckCircle className="h-3 w-3 text-green-500" />
              )}
            </div>
          ))}
        </div>
      )}

      {/* 行动结果 */}
      {activity.actionTaken && (
        <div className="mt-2 text-xs text-gray-500">
          <span className="font-medium">行动：</span> {activity.actionTaken}
        </div>
      )}
    </div>
  );
}

/**
 * 单个活动卡片
 */
function ActivityCard({
  activity,
  isExpanded,
  onToggle,
  onClick,
}: {
  activity: AgentActivity;
  isExpanded: boolean;
  onToggle: () => void;
  onClick?: () => void;
}) {
  const roleInfo = roleConfig[activity.agentRole] || roleConfig.researcher;
  const RoleIcon = roleInfo.icon;

  const isCompleted = activity.activityType === 'COMPLETED';
  const isFailed = activity.activityType === 'FAILED';
  const isActive = !isCompleted && !isFailed;

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border transition-all duration-200',
        isCompleted && 'border-green-200 dark:border-green-800',
        isFailed && 'border-red-200 dark:border-red-800',
        isActive && 'border-blue-200 shadow-sm dark:border-blue-800',
        'bg-white dark:bg-gray-800'
      )}
    >
      {/* 头部 */}
      <div
        className={cn(
          'flex cursor-pointer items-center gap-3 p-3',
          isActive && 'bg-blue-50 dark:bg-blue-950/30'
        )}
        onClick={onToggle}
      >
        {/* Agent 图标 */}
        <div
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-full',
            isActive
              ? 'bg-blue-100 dark:bg-blue-900'
              : isCompleted
                ? 'bg-green-100 dark:bg-green-900'
                : 'bg-red-100 dark:bg-red-900'
          )}
        >
          {isActive ? (
            <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400" />
          ) : isCompleted ? (
            <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
          )}
        </div>

        {/* Agent 信息 */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <RoleIcon className={cn('h-4 w-4', roleInfo.color)} />
            <span className="truncate font-medium text-gray-900 dark:text-white">
              {activity.agentName}
            </span>
            {activity.dimensionName && (
              <span className="truncate text-xs text-gray-500">
                ({activity.dimensionName})
              </span>
            )}
          </div>
          <div className="truncate text-sm text-gray-500">
            {activity.content}
          </div>
        </div>

        {/* 右侧信息 */}
        <div className="flex items-center gap-2 text-xs text-gray-400">
          {activity.progress > 0 && activity.progress < 100 && (
            <span>{activity.progress}%</span>
          )}
          <span>{formatTime(activity.createdAt)}</span>
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </div>
      </div>

      {/* 展开内容 */}
      {isExpanded && (
        <div className="border-t border-gray-100 px-3 pb-3 dark:border-gray-700">
          {/* 进度条 */}
          {activity.progress > 0 && (
            <div className="mt-3">
              <div className="mb-1 flex justify-between text-xs text-gray-500">
                <span>进度</span>
                <span>{activity.progress}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                <div
                  className={cn(
                    'h-full transition-all duration-300',
                    isCompleted
                      ? 'bg-green-500'
                      : isFailed
                        ? 'bg-red-500'
                        : 'bg-blue-500'
                  )}
                  style={{ width: `${activity.progress}%` }}
                />
              </div>
            </div>
          )}

          {/* 阶段详情 */}
          <PhaseDetail activity={activity} />

          {/* 点击查看更多 */}
          {onClick && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClick();
              }}
              className="mt-3 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400"
            >
              查看完整详情 →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 维度分组
 */
function DimensionGroup({
  dimensionName,
  activities,
  expandedIds,
  onToggle,
  onActivityClick,
}: {
  dimensionName: string;
  activities: AgentActivity[];
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  onActivityClick?: (activity: AgentActivity) => void;
}) {
  const [isGroupExpanded, setIsGroupExpanded] = useState(true);

  const completedCount = activities.filter(
    (a) => a.activityType === 'COMPLETED'
  ).length;
  const isAllCompleted = completedCount === activities.length;

  return (
    <div className="overflow-hidden rounded-lg border bg-gray-50 dark:bg-gray-900/50">
      {/* 分组头部 */}
      <div
        className={cn(
          'flex cursor-pointer items-center gap-3 p-3',
          isAllCompleted
            ? 'bg-green-50 dark:bg-green-950/30'
            : 'bg-white dark:bg-gray-800'
        )}
        onClick={() => setIsGroupExpanded(!isGroupExpanded)}
      >
        <div
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-full',
            isAllCompleted
              ? 'bg-green-100 dark:bg-green-900'
              : 'bg-blue-100 dark:bg-blue-900'
          )}
        >
          <BookOpen
            className={cn(
              'h-4 w-4',
              isAllCompleted ? 'text-green-600' : 'text-blue-600'
            )}
          />
        </div>
        <div className="flex-1">
          <div className="font-medium text-gray-900 dark:text-white">
            {dimensionName || '未分类'}
          </div>
          <div className="text-xs text-gray-500">
            {completedCount}/{activities.length} 个活动已完成
          </div>
        </div>
        {isGroupExpanded ? (
          <ChevronDown className="h-5 w-5 text-gray-400" />
        ) : (
          <ChevronRight className="h-5 w-5 text-gray-400" />
        )}
      </div>

      {/* 活动列表 */}
      {isGroupExpanded && (
        <div className="space-y-2 bg-white p-3 dark:bg-gray-800/50">
          {activities.map((activity) => (
            <ActivityCard
              key={activity.id}
              activity={activity}
              isExpanded={expandedIds.has(activity.id)}
              onToggle={() => onToggle(activity.id)}
              onClick={
                onActivityClick ? () => onActivityClick(activity) : undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== Main Component ====================

export function AgentThinkingTimeline({
  activities,
  missionId,
  groupBy = 'dimension',
  isLoading = false,
  showCompleted = true,
  onActivityClick,
}: AgentThinkingTimelineProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // ★ 安全处理：确保 activities 是数组
  const safeActivities = Array.isArray(activities) ? activities : [];

  // 过滤活动
  const filteredActivities = useMemo(() => {
    let result = safeActivities;
    if (missionId) {
      result = result.filter((a) => a.missionId === missionId);
    }
    if (!showCompleted) {
      result = result.filter((a) => a.activityType !== 'COMPLETED');
    }
    return result;
  }, [safeActivities, missionId, showCompleted]);

  // 按维度分组
  const groupedByDimension = useMemo(() => {
    const groups = new Map<string, AgentActivity[]>();
    filteredActivities.forEach((activity) => {
      const key = activity.dimensionName || '其他活动';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(activity);
    });
    return groups;
  }, [filteredActivities]);

  // 切换展开
  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 加载状态
  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto mb-2 h-8 w-8 animate-spin text-blue-500" />
          <div className="text-sm text-gray-500">加载Agent活动...</div>
        </div>
      </div>
    );
  }

  // 无活动
  if (filteredActivities.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center text-center">
        <Brain className="mb-3 h-12 w-12 text-gray-300" />
        <div className="mb-1 text-lg font-medium text-gray-900 dark:text-white">
          暂无Agent活动
        </div>
        <div className="text-sm text-gray-500">
          开始研究后，Agent的思考过程将显示在这里
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 统计信息 */}
      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>共 {filteredActivities.length} 个活动</span>
        <span>
          {
            filteredActivities.filter((a) => a.activityType === 'COMPLETED')
              .length
          }{' '}
          个已完成
        </span>
      </div>

      {/* 按维度分组显示 */}
      {groupBy === 'dimension' && (
        <div className="space-y-4">
          {Array.from(groupedByDimension.entries()).map(([dimName, acts]) => (
            <DimensionGroup
              key={dimName}
              dimensionName={dimName}
              activities={acts}
              expandedIds={expandedIds}
              onToggle={toggleExpand}
              onActivityClick={onActivityClick}
            />
          ))}
        </div>
      )}

      {/* 按时间顺序显示 */}
      {groupBy === 'time' && (
        <div className="space-y-2">
          {filteredActivities
            .sort(
              (a, b) =>
                new Date(b.createdAt).getTime() -
                new Date(a.createdAt).getTime()
            )
            .map((activity) => (
              <ActivityCard
                key={activity.id}
                activity={activity}
                isExpanded={expandedIds.has(activity.id)}
                onToggle={() => toggleExpand(activity.id)}
                onClick={
                  onActivityClick ? () => onActivityClick(activity) : undefined
                }
              />
            ))}
        </div>
      )}
    </div>
  );
}

export default AgentThinkingTimeline;
