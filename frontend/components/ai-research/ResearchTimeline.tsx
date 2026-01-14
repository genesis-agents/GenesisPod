/**
 * ResearchTimeline - 研究历史时间线组件
 *
 * Phase 2.3: 可信度与追溯
 *
 * 功能：
 * - 展示多次研究的历史记录
 * - 每次研究的目标、策略、成果摘要
 * - 支持快速切换查看不同研究
 * - 显示版本对比入口
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar,
  Clock,
  Target,
  Layers,
  Plus,
  Minus,
  ChevronDown,
  ChevronRight,
  FileText,
  CheckCircle,
  XCircle,
  AlertTriangle,
  TrendingUp,
  BookOpen,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils/common';
import {
  getResearchHistory,
  type ResearchHistoryItem as ApiResearchHistoryItem,
} from '@/lib/api/topic-research';

// ==================== Types ====================

export type ResearchStatus =
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'IN_PROGRESS';

export interface ResearchHistoryItem {
  id: string;
  topicId: string;
  missionId: string;
  researchNumber: number;
  startedAt: string;
  completedAt?: string;
  status: ResearchStatus;
  // 研究目标
  researchGoal?: string;
  researchStrategy?: string;
  // 研究结果
  dimensionsUpdated: string[];
  dimensionsKept: string[];
  wordsAdded: number;
  wordsRemoved: number;
  newSourcesCount: number;
  totalDurationMs?: number;
  // 报告版本
  reportVersionBefore?: number;
  reportVersionAfter?: number;
}

// Props: 支持两种模式 - 传入 topicId 自动获取数据，或传入 histories 直接展示
export interface ResearchTimelineProps {
  // 模式1: 传入 topicId，组件自动获取数据
  topicId?: string;
  // 模式2: 直接传入数据
  histories?: ResearchHistoryItem[];
  currentResearchNumber?: number;
  isLoading?: boolean;
  onSelectResearch?: (history: ResearchHistoryItem) => void;
  onCompareVersions?: (fromVersion: number, toVersion: number) => void;
  onViewReport?: (version: number) => void;
}

// ==================== Helper Functions ====================

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('zh-CN', {
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
    bgColor: string;
  }
> = {
  COMPLETED: {
    icon: CheckCircle,
    label: '已完成',
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
  },
  FAILED: {
    icon: XCircle,
    label: '失败',
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
  },
  CANCELLED: {
    icon: AlertTriangle,
    label: '已取消',
    color: 'text-yellow-600 dark:text-yellow-400',
    bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
  },
  IN_PROGRESS: {
    icon: Clock,
    label: '进行中',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
  },
};

// ==================== Sub Components ====================

/**
 * 研究成果摘要卡片
 */
function ResearchSummaryCard({ history }: { history: ResearchHistoryItem }) {
  const hasWordChanges = history.wordsAdded > 0 || history.wordsRemoved > 0;
  const netChange = history.wordsAdded - history.wordsRemoved;

  return (
    <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
      {/* 更新维度 */}
      <div className="rounded-lg bg-blue-50 p-2 dark:bg-blue-950/30">
        <div className="mb-1 flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
          <TrendingUp className="h-3 w-3" />
          更新维度
        </div>
        <div className="text-lg font-semibold text-blue-700 dark:text-blue-300">
          {history.dimensionsUpdated.length}
        </div>
      </div>

      {/* 保留维度 */}
      <div className="rounded-lg bg-gray-50 p-2 dark:bg-gray-900/30">
        <div className="mb-1 flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
          <Layers className="h-3 w-3" />
          保留维度
        </div>
        <div className="text-lg font-semibold text-gray-700 dark:text-gray-300">
          {history.dimensionsKept.length}
        </div>
      </div>

      {/* 字数变化 */}
      {hasWordChanges && (
        <div
          className={cn(
            'rounded-lg p-2',
            netChange >= 0
              ? 'bg-green-50 dark:bg-green-950/30'
              : 'bg-red-50 dark:bg-red-950/30'
          )}
        >
          <div className="mb-1 flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
            <FileText className="h-3 w-3" />
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

      {/* 新增来源 */}
      {history.newSourcesCount > 0 && (
        <div className="rounded-lg bg-purple-50 p-2 dark:bg-purple-950/30">
          <div className="mb-1 flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400">
            <BookOpen className="h-3 w-3" />
            新增来源
          </div>
          <div className="text-lg font-semibold text-purple-700 dark:text-purple-300">
            {history.newSourcesCount}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 单次研究卡片
 */
function ResearchCard({
  history,
  isExpanded,
  isCurrent,
  onToggle,
  onSelect,
  onCompare,
  onViewReport,
}: {
  history: ResearchHistoryItem;
  isExpanded: boolean;
  isCurrent: boolean;
  onToggle: () => void;
  onSelect?: () => void;
  onCompare?: () => void;
  onViewReport?: (version: number) => void;
}) {
  const status = statusConfig[history.status];
  const StatusIcon = status.icon;

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-lg border transition-all duration-200',
        'bg-white dark:bg-gray-800',
        isCurrent && 'ring-2 ring-blue-500',
        history.status === 'COMPLETED' &&
          'border-green-200 dark:border-green-800',
        history.status === 'FAILED' && 'border-red-200 dark:border-red-800',
        history.status === 'IN_PROGRESS' &&
          'border-blue-200 dark:border-blue-800'
      )}
    >
      {/* 当前标记 */}
      {isCurrent && (
        <div className="absolute right-0 top-0 rounded-bl bg-blue-500 px-2 py-0.5 text-xs text-white">
          当前
        </div>
      )}

      {/* 时间线连接点 */}
      <div className="absolute bottom-0 left-0 top-0 w-1">
        <div className={cn('h-full w-full', status.bgColor)} />
      </div>

      {/* 头部 */}
      <div
        className="flex cursor-pointer items-center gap-3 p-4 pl-5"
        onClick={onToggle}
      >
        {/* 序号 */}
        <div
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-full font-bold',
            status.bgColor,
            status.color
          )}
        >
          #{history.researchNumber}
        </div>

        {/* 主要信息 */}
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span className="font-medium text-gray-900 dark:text-white">
              第 {history.researchNumber} 次研究
            </span>
            <span
              className={cn(
                'flex items-center gap-1 rounded px-1.5 py-0.5 text-xs',
                status.bgColor,
                status.color
              )}
            >
              <StatusIcon className="h-3 w-3" />
              {status.label}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatDate(history.startedAt)}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatTime(history.startedAt)}
            </span>
            {history.totalDurationMs && (
              <span>耗时 {formatDuration(history.totalDurationMs)}</span>
            )}
          </div>
        </div>

        {/* 版本信息 */}
        {history.reportVersionAfter && (
          <div className="text-right">
            <div className="text-xs text-gray-500">报告版本</div>
            <div className="font-medium text-gray-900 dark:text-white">
              {history.reportVersionBefore && (
                <>
                  v{history.reportVersionBefore}
                  <ArrowRight className="mx-1 inline h-3 w-3" />
                </>
              )}
              v{history.reportVersionAfter}
            </div>
          </div>
        )}

        {/* 展开图标 */}
        <div>
          {isExpanded ? (
            <ChevronDown className="h-5 w-5 text-gray-400" />
          ) : (
            <ChevronRight className="h-5 w-5 text-gray-400" />
          )}
        </div>
      </div>

      {/* 展开内容 */}
      {isExpanded && (
        <div className="border-t border-gray-100 px-4 pb-4 pl-5 dark:border-gray-700">
          {/* 研究目标 */}
          {history.researchGoal && (
            <div className="mt-3">
              <div className="mb-1 flex items-center gap-1 text-xs text-gray-500">
                <Target className="h-3 w-3" />
                研究目标
              </div>
              <div className="text-sm text-gray-700 dark:text-gray-300">
                {history.researchGoal}
              </div>
            </div>
          )}

          {/* 研究策略 */}
          {history.researchStrategy && (
            <div className="mt-3">
              <div className="mb-1 flex items-center gap-1 text-xs text-gray-500">
                <Layers className="h-3 w-3" />
                研究策略
              </div>
              <div className="text-sm text-gray-700 dark:text-gray-300">
                {history.researchStrategy}
              </div>
            </div>
          )}

          {/* 更新的维度列表 */}
          {history.dimensionsUpdated.length > 0 && (
            <div className="mt-3">
              <div className="mb-1 text-xs text-gray-500">更新的维度：</div>
              <div className="flex flex-wrap gap-1">
                {history.dimensionsUpdated.map((dim, idx) => (
                  <span
                    key={idx}
                    className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                  >
                    {dim}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 研究成果摘要 */}
          <ResearchSummaryCard history={history} />

          {/* 操作按钮 */}
          <div className="mt-4 flex items-center gap-2">
            {onSelect && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect();
                }}
                className="flex items-center gap-1 rounded-lg bg-blue-500 px-3 py-1.5 text-sm text-white transition-colors hover:bg-blue-600"
              >
                <Target className="h-4 w-4" />
                查看详情
              </button>
            )}

            {onViewReport && history.reportVersionAfter && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onViewReport(history.reportVersionAfter!);
                }}
                className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                <FileText className="h-4 w-4" />
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
                  className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                >
                  <TrendingUp className="h-4 w-4" />
                  对比 v{history.reportVersionBefore} → v
                  {history.reportVersionAfter}
                </button>
              )}
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== Main Component ====================

export function ResearchTimeline({
  histories,
  currentResearchNumber,
  isLoading = false,
  onSelectResearch,
  onCompareVersions,
  onViewReport,
}: ResearchTimelineProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'all' | 'current' | 'previous'>('all');

  // 确保 histories 有默认值
  const safeHistories = histories || [];

  // 按研究序号倒序排列
  const sortedHistories = [...safeHistories].sort(
    (a, b) => b.researchNumber - a.researchNumber
  );

  // 过滤
  const filteredHistories = sortedHistories.filter((h) => {
    if (filter === 'current') return h.researchNumber === currentResearchNumber;
    if (filter === 'previous')
      return h.researchNumber !== currentResearchNumber;
    return true;
  });

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
          <Clock className="mx-auto mb-2 h-8 w-8 animate-pulse text-blue-500" />
          <div className="text-sm text-gray-500">加载研究历史...</div>
        </div>
      </div>
    );
  }

  // 无历史
  if (safeHistories.length === 0) {
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
        <span>共 {safeHistories.length} 次研究</span>
        <span>
          {safeHistories.filter((h) => h.status === 'COMPLETED').length} 次成功
        </span>
      </div>

      {/* 时间线列表 */}
      <div className="space-y-3">
        {filteredHistories.map((history) => (
          <ResearchCard
            key={history.id}
            history={history}
            isExpanded={expandedIds.has(history.id)}
            isCurrent={history.researchNumber === currentResearchNumber}
            onToggle={() => toggleExpand(history.id)}
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
        ))}
      </div>
    </div>
  );
}

export default ResearchTimeline;
