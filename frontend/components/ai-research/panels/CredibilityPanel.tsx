/**
 * CredibilityPanel - 可信度面板组件
 *
 * Phase 2.2: 可信度与追溯
 *
 * 功能：
 * - 展示研究报告的可信度评估
 * - 数据来源评估（权威性、多样性）
 * - 时效性评估
 * - 覆盖度评估
 * - AI分析质量指标
 * - 局限性声明
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  BookOpen,
  Clock,
  Layers,
  Brain,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Star,
  TrendingUp,
  Building,
  Newspaper,
  GraduationCap,
  FileText,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { cn, safeString } from '@/lib/utils/common';
import { logger } from '@/lib/utils/logger';
import { useI18n } from '@/lib/i18n';
import {
  getCredibilityReport,
  regenerateCredibilityReport,
  recalculateCredibilityScores,
  type CredibilityReportData,
} from '@/lib/api/topic-research';

// ==================== Types ====================

export interface SourceBreakdown {
  government: number;
  academic: number;
  industry: number;
  news?: number; // API 返回
  newsMajor?: number; // 内部使用
  newsOther?: number; // 内部使用
  blog: number;
  other?: number;
  total: number;
}

export interface TimeBreakdown {
  within1Month: number;
  within3Months: number;
  within6Months: number;
  within1Year?: number;
  older: number;
  unknown?: number;
  total: number;
}

export interface CoverageDetail {
  dimensionId: string;
  dimensionName: string;
  sourceCount?: number; // API 返回
  sourcesCount?: number; // 内部使用
  targetCount: number;
  status:
    | 'sufficient'
    | 'moderate'
    | 'insufficient'
    | 'excellent'
    | 'good'
    | 'fair'
    | 'poor';
  coveragePercent?: number;
}

export interface AiQualityMetrics {
  planningRounds: number;
  revisionAverage: number;
  approvalRate: number;
  averageConfidence?: string;
  totalAgentActivities: number;
}

export interface CredibilityReport {
  id?: string;
  reportId?: string;
  overallScore: number;
  authorityScore: number;
  diversityScore: number;
  timelinessScore: number;
  coverageScore: number;
  sourceBreakdown: SourceBreakdown;
  timeBreakdown: TimeBreakdown;
  coverageDetails: CoverageDetail[];
  aiQualityMetrics: AiQualityMetrics;
  limitations: string[];
  createdAt?: string;
}

// Props: 支持两种模式 - 传入 reportId 自动获取数据，或传入 credibility 直接展示
export interface CredibilityPanelProps {
  // 模式1: 传入 reportId，组件自动获取数据
  reportId?: string;
  topicId?: string;
  // 模式2: 直接传入数据
  credibility?: CredibilityReport | null;
  isLoading?: boolean;
  onRefresh?: () => void;
}

// ==================== Helper Functions ====================

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-green-600 dark:text-green-400';
  if (score >= 60) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
}

function getScoreBgColor(score: number): string {
  if (score >= 80) return 'bg-green-500';
  if (score >= 60) return 'bg-yellow-500';
  return 'bg-red-500';
}

function getStars(score: number): number {
  if (score >= 90) return 5;
  if (score >= 80) return 4;
  if (score >= 60) return 3;
  if (score >= 40) return 2;
  return 1;
}

// ==================== Sub Components ====================

/**
 * 评分指示器
 */
function ScoreIndicator({
  score,
  label,
  size = 'normal',
}: {
  score: number;
  label: string;
  size?: 'normal' | 'large';
}) {
  const stars = getStars(score);
  const sizeClass = size === 'large' ? 'w-24 h-24' : 'w-16 h-16';
  const fontSize = size === 'large' ? 'text-2xl' : 'text-lg';

  return (
    <div className="text-center">
      <div
        className={cn(
          'relative mx-auto flex items-center justify-center rounded-full',
          sizeClass,
          'bg-gray-100 dark:bg-gray-800'
        )}
      >
        {/* 背景圆环 */}
        <svg className="absolute inset-0 h-full w-full -rotate-90">
          <circle
            cx="50%"
            cy="50%"
            r="45%"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            className="text-gray-200 dark:text-gray-700"
          />
          <circle
            cx="50%"
            cy="50%"
            r="45%"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            strokeDasharray={`${score * 2.83} 283`}
            className={getScoreColor(score)}
          />
        </svg>
        <span className={cn('font-bold', fontSize, getScoreColor(score))}>
          {Math.round(score)}
        </span>
      </div>
      <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
        {label}
      </div>
      <div className="mt-1 flex justify-center gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star
            key={i}
            className={cn(
              'h-3 w-3',
              i <= stars
                ? 'fill-yellow-400 text-yellow-400'
                : 'text-gray-300 dark:text-gray-600'
            )}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * 来源分布条
 */
function SourceDistributionBar({ breakdown }: { breakdown: SourceBreakdown }) {
  const total = breakdown.total || 1;
  // 处理 API 返回的 news 字段和内部的 newsMajor/newsOther 字段
  const newsCount =
    breakdown.news ?? (breakdown.newsMajor ?? 0) + (breakdown.newsOther ?? 0);
  const sources = [
    {
      key: 'government',
      label: '政府/官方',
      count: breakdown.government || 0,
      color: 'bg-red-500',
      icon: Building,
    },
    {
      key: 'academic',
      label: '学术研究',
      count: breakdown.academic || 0,
      color: 'bg-blue-500',
      icon: GraduationCap,
    },
    {
      key: 'industry',
      label: '行业报告',
      count: breakdown.industry || 0,
      color: 'bg-purple-500',
      icon: FileText,
    },
    {
      key: 'news',
      label: '新闻媒体',
      count: newsCount,
      color: 'bg-green-500',
      icon: Newspaper,
    },
    {
      key: 'blog',
      label: '博客/其他',
      count: (breakdown.blog || 0) + (breakdown.other || 0),
      color: 'bg-gray-400',
      icon: BookOpen,
    },
  ].filter((s) => s.count > 0);

  return (
    <div className="space-y-2">
      {/* 分布条 */}
      <div className="flex h-3 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
        {sources.map((source) => (
          <div
            key={source.key}
            className={cn(source.color, 'transition-all')}
            style={{ width: `${(source.count / total) * 100}%` }}
            title={`${source.label}: ${source.count} (${Math.round((source.count / total) * 100)}%)`}
          />
        ))}
      </div>

      {/* 图例 */}
      <div className="flex flex-wrap gap-3 text-xs">
        {sources.map((source) => {
          const Icon = source.icon;
          return (
            <div key={source.key} className="flex items-center gap-1">
              <div className={cn('h-2 w-2 rounded-full', source.color)} />
              <Icon className="h-3 w-3 text-gray-400" />
              <span className="text-gray-600 dark:text-gray-400">
                {source.label}: {source.count} (
                {Math.round((source.count / total) * 100)}%)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 时效性分布
 * ★ 显示所有时间段，包括 unknown（日期未知）
 */
function TimelinessDistribution({ breakdown }: { breakdown: TimeBreakdown }) {
  const total = breakdown.total || 1;

  // ★ 计算 unknown 数量（如果后端没传，根据 total 推算）
  const unknownCount =
    breakdown.unknown ??
    Math.max(
      0,
      total -
        (breakdown.within1Month || 0) -
        (breakdown.within3Months || 0) -
        (breakdown.within6Months || 0) -
        (breakdown.within1Year || 0) -
        (breakdown.older || 0)
    );

  // ★ 完整的时间段列表
  const allPeriods = [
    {
      key: '1m',
      label: '1个月内',
      count: breakdown.within1Month || 0,
      color: 'bg-green-500',
    },
    {
      key: '3m',
      label: '1-3个月',
      count: breakdown.within3Months || 0,
      color: 'bg-blue-500',
    },
    {
      key: '6m',
      label: '3-6个月',
      count: breakdown.within6Months || 0,
      color: 'bg-yellow-500',
    },
    {
      key: '1y',
      label: '6-12个月',
      count: breakdown.within1Year || 0,
      color: 'bg-orange-400',
    },
    {
      key: 'older',
      label: '1年以上',
      count: breakdown.older || 0,
      color: 'bg-gray-400',
    },
    {
      key: 'unknown',
      label: '日期未知',
      count: unknownCount,
      color: 'bg-gray-300',
    },
  ];

  // ★ 只显示有数据的时间段
  const periods = allPeriods.filter((p) => p.count > 0);

  // ★ 如果所有已知时间段都为 0，显示提示
  if (periods.length === 0) {
    return (
      <div className="py-4 text-center text-sm text-gray-500">
        暂无时效性数据
      </div>
    );
  }

  // ★ 如果只有 unknown，显示特殊提示
  if (periods.length === 1 && periods[0].key === 'unknown') {
    return (
      <div className="space-y-2">
        <div className="rounded-lg bg-yellow-50 p-3 text-sm text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300">
          <AlertTriangle className="mr-1.5 inline h-4 w-4" />
          所有来源的发布日期未知，无法评估时效性
        </div>
        <div className="flex items-center gap-2">
          <div className="w-20 text-xs text-gray-500">日期未知</div>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div className="h-full w-full bg-gray-300" />
          </div>
          <div className="w-16 text-right text-xs text-gray-600 dark:text-gray-400">
            {unknownCount} (100%)
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {periods.map((period) => (
        <div key={period.key} className="flex items-center gap-2">
          <div className="w-20 text-xs text-gray-500">{period.label}</div>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              className={cn(period.color, 'h-full transition-all')}
              style={{ width: `${(period.count / total) * 100}%` }}
            />
          </div>
          <div className="w-16 text-right text-xs text-gray-600 dark:text-gray-400">
            {period.count} ({Math.round((period.count / total) * 100)}%)
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * 覆盖度列表
 */
function CoverageList({ details }: { details: CoverageDetail[] }) {
  // 将 API 返回的 status 映射到内部 status
  const normalizeStatus = (
    status: CoverageDetail['status']
  ): 'sufficient' | 'moderate' | 'insufficient' => {
    if (status === 'excellent' || status === 'good' || status === 'sufficient')
      return 'sufficient';
    if (status === 'fair' || status === 'moderate') return 'moderate';
    return 'insufficient';
  };

  const statusConfig: Record<
    string,
    { icon: typeof CheckCircle; color: string; label: string }
  > = {
    sufficient: { icon: CheckCircle, color: 'text-green-500', label: '充分' },
    moderate: { icon: AlertCircle, color: 'text-yellow-500', label: '一般' },
    insufficient: { icon: XCircle, color: 'text-red-500', label: '不足' },
  };

  // ★ 默认状态配置
  const defaultStatusInfo = {
    icon: AlertCircle,
    color: 'text-gray-500',
    label: '未知',
  };

  return (
    <div className="space-y-2">
      {details.map((detail) => {
        const normalizedStatus = normalizeStatus(detail.status);
        // ★ 安全访问：使用 fallback
        const statusInfo = statusConfig[normalizedStatus] || defaultStatusInfo;
        const Icon = statusInfo.icon;
        // 支持 sourceCount（API）和 sourcesCount（内部）两种字段名
        const sourceCount = detail.sourceCount ?? detail.sourcesCount ?? 0;
        const percentage = Math.min(
          100,
          (sourceCount / detail.targetCount) * 100
        );

        return (
          <div key={detail.dimensionId} className="flex items-center gap-2">
            <Icon className={cn('h-4 w-4', statusInfo.color)} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between text-sm">
                <span className="truncate text-gray-700 dark:text-gray-300">
                  {detail.dimensionName}
                </span>
                <span className="ml-2 text-gray-500">
                  {sourceCount}/{detail.targetCount}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                <div
                  className={cn(
                    'h-full transition-all',
                    normalizedStatus === 'sufficient'
                      ? 'bg-green-500'
                      : normalizedStatus === 'moderate'
                        ? 'bg-yellow-500'
                        : 'bg-red-500'
                  )}
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * 可折叠区块
 */
function CollapsibleSection({
  title,
  icon: Icon,
  defaultExpanded = true,
  children,
}: {
  title: string;
  icon: React.ElementType;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className="overflow-hidden rounded-lg border bg-white dark:bg-gray-800">
      <div
        className="flex cursor-pointer items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-gray-500" />
          <span className="font-medium text-gray-900 dark:text-white">
            {title}
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-gray-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-400" />
        )}
      </div>
      {isExpanded && (
        <div className="border-t border-gray-100 px-3 pb-3 dark:border-gray-700">
          {children}
        </div>
      )}
    </div>
  );
}

// ==================== Main Component ====================

export function CredibilityPanel({
  reportId,
  topicId,
  credibility: propCredibility,
  isLoading: propIsLoading = false,
  onRefresh: propOnRefresh,
}: CredibilityPanelProps) {
  // 内部状态：用于 reportId 模式
  const [fetchedCredibility, setFetchedCredibility] =
    useState<CredibilityReportData | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // ★ 重新计算证据可信度的状态
  const [isRecalculatingEvidence, setIsRecalculatingEvidence] = useState(false);
  const [recalculateResult, setRecalculateResult] = useState<{
    updated: number;
    avgScore: number;
  } | null>(null);

  // 判断使用哪种模式
  const useReportIdMode = !!reportId && !!topicId;
  const credibility = useReportIdMode ? fetchedCredibility : propCredibility;
  const isLoading = useReportIdMode ? isFetching : propIsLoading;

  // 获取数据
  const fetchData = useCallback(async () => {
    if (!reportId || !topicId) return;

    setIsFetching(true);
    setFetchError(null);
    try {
      const data = await getCredibilityReport(topicId, reportId);
      // 转换 API 数据格式到组件内部格式
      setFetchedCredibility({
        ...data,
        // 确保字段兼容
        sourceBreakdown: {
          ...data.sourceBreakdown,
          newsMajor: data.sourceBreakdown.news || 0,
          newsOther: 0,
        },
        timeBreakdown: {
          ...data.timeBreakdown,
          total:
            data.timeBreakdown.total ||
            data.timeBreakdown.within1Month +
              data.timeBreakdown.within3Months +
              data.timeBreakdown.within6Months +
              data.timeBreakdown.within1Year +
              (data.timeBreakdown.older || 0),
        },
        coverageDetails: data.coverageDetails.map((d) => ({
          ...d,
          sourcesCount: d.sourceCount,
          status:
            d.status === 'excellent' || d.status === 'good'
              ? 'sufficient'
              : d.status === 'fair'
                ? 'moderate'
                : 'insufficient',
        })),
      } as unknown as CredibilityReportData);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : '获取可信度报告失败');
    } finally {
      setIsFetching(false);
    }
  }, [reportId, topicId]);

  // 刷新数据
  const handleRefresh = useCallback(async () => {
    if (useReportIdMode && reportId && topicId) {
      setIsFetching(true);
      setFetchError(null);
      try {
        const data = await regenerateCredibilityReport(topicId, reportId);
        setFetchedCredibility(data as unknown as CredibilityReportData);
      } catch (err) {
        setFetchError(
          err instanceof Error ? err.message : '重新生成可信度报告失败'
        );
      } finally {
        setIsFetching(false);
      }
    } else if (propOnRefresh) {
      propOnRefresh();
    }
  }, [useReportIdMode, reportId, topicId, propOnRefresh]);

  // ★ 重新计算证据可信度
  const handleRecalculateEvidence = useCallback(async () => {
    if (!reportId || !topicId || isRecalculatingEvidence) return;

    setIsRecalculatingEvidence(true);
    setRecalculateResult(null);

    try {
      const result = await recalculateCredibilityScores(topicId, reportId);
      setRecalculateResult(result);
      // 重新计算后刷新可信度报告
      await fetchData();
    } catch (err) {
      logger.error('Failed to recalculate evidence credibility:', err);
    } finally {
      setIsRecalculatingEvidence(false);
    }
  }, [reportId, topicId, isRecalculatingEvidence, fetchData]);

  // 初始加载
  useEffect(() => {
    if (useReportIdMode) {
      fetchData();
    }
  }, [useReportIdMode, fetchData]);

  const onRefresh = useReportIdMode ? handleRefresh : propOnRefresh;

  // 错误状态
  if (fetchError) {
    return (
      <div className="flex h-64 flex-col items-center justify-center text-center">
        <AlertTriangle className="mb-3 h-12 w-12 text-red-300" />
        <div className="mb-1 text-lg font-medium text-gray-900 dark:text-white">
          加载失败
        </div>
        <div className="mb-3 text-sm text-gray-500">
          {safeString(fetchError)}
        </div>
        <button
          onClick={fetchData}
          className="rounded-lg bg-blue-500 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-600"
        >
          重试
        </button>
      </div>
    );
  }

  // 加载状态
  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <Shield className="mx-auto mb-2 h-8 w-8 animate-pulse text-blue-500" />
          <div className="text-sm text-gray-500">分析可信度...</div>
        </div>
      </div>
    );
  }

  // 无数据
  if (!credibility) {
    return (
      <div className="flex h-64 flex-col items-center justify-center text-center">
        <Shield className="mb-3 h-12 w-12 text-gray-300" />
        <div className="mb-1 text-lg font-medium text-gray-900 dark:text-white">
          暂无可信度报告
        </div>
        <div className="mb-3 text-sm text-gray-500">
          完成研究后将自动生成可信度评估
        </div>
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="rounded-lg bg-blue-500 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-600"
          >
            重新分析
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
          <Shield className="h-5 w-5" />
          研究可信度报告
        </h2>
        <div className="flex items-center gap-3">
          {/* ★ 重新计算证据可信度按钮 */}
          {reportId && topicId && (
            <button
              onClick={handleRecalculateEvidence}
              disabled={isRecalculatingEvidence}
              className="flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-sm text-gray-600 transition-colors hover:border-orange-400 hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
              title="重新计算所有证据的可信度评分"
            >
              <RefreshCw
                className={cn(
                  'h-3.5 w-3.5',
                  isRecalculatingEvidence && 'animate-spin'
                )}
              />
              {isRecalculatingEvidence ? '计算中...' : '重算证据'}
            </button>
          )}
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
            >
              重新分析
            </button>
          )}
        </div>
      </div>

      {/* ★ 重新计算结果提示 */}
      {recalculateResult && (
        <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-900/30 dark:text-green-300">
          <CheckCircle className="mr-1.5 inline h-4 w-4" />
          已更新 {recalculateResult.updated} 条证据的可信度，平均分:{' '}
          {recalculateResult.avgScore}%
        </div>
      )}

      {/* 总体评分 */}
      <div className="rounded-lg bg-gradient-to-r from-blue-50 to-purple-50 p-6 dark:from-blue-950/30 dark:to-purple-950/30">
        <div className="flex flex-wrap items-center justify-center gap-8">
          <ScoreIndicator
            score={credibility.overallScore}
            label="整体可信度"
            size="large"
          />
          <div className="grid grid-cols-2 gap-6">
            <ScoreIndicator score={credibility.authorityScore} label="权威性" />
            <ScoreIndicator score={credibility.diversityScore} label="多样性" />
            <ScoreIndicator
              score={credibility.timelinessScore}
              label="时效性"
            />
            <ScoreIndicator score={credibility.coverageScore} label="覆盖度" />
          </div>
        </div>
      </div>

      {/* 数据来源评估 */}
      <CollapsibleSection title="数据来源评估" icon={BookOpen}>
        <div className="pt-3">
          <SourceDistributionBar breakdown={credibility.sourceBreakdown} />
        </div>
      </CollapsibleSection>

      {/* 时效性评估 */}
      <CollapsibleSection title="时效性评估" icon={Clock}>
        <div className="pt-3">
          <TimelinessDistribution breakdown={credibility.timeBreakdown} />
        </div>
      </CollapsibleSection>

      {/* 覆盖度评估 */}
      <CollapsibleSection title="覆盖度评估" icon={Layers}>
        <div className="pt-3">
          <CoverageList details={credibility.coverageDetails} />
        </div>
      </CollapsibleSection>

      {/* AI分析质量 */}
      <CollapsibleSection title="AI分析质量" icon={Brain}>
        <div className="grid grid-cols-2 gap-4 pt-3 md:grid-cols-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {credibility.aiQualityMetrics.planningRounds}
            </div>
            <div className="text-xs text-gray-500">规划轮次</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {credibility.aiQualityMetrics.revisionAverage.toFixed(1)}
            </div>
            <div className="text-xs text-gray-500">平均修订次数</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
              {Math.round(credibility.aiQualityMetrics.approvalRate)}%
            </div>
            <div className="text-xs text-gray-500">审核通过率</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
              {credibility.aiQualityMetrics.totalAgentActivities}
            </div>
            <div className="text-xs text-gray-500">Agent活动数</div>
          </div>
        </div>
      </CollapsibleSection>

      {/* 局限性声明 */}
      {credibility.limitations.length > 0 && (
        <CollapsibleSection
          title="局限性声明"
          icon={AlertTriangle}
          defaultExpanded={false}
        >
          <div className="space-y-2 pt-3">
            {credibility.limitations.map((limitation, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2 rounded-lg bg-yellow-50 p-2 text-sm text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-300"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>{limitation}</span>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}
    </div>
  );
}

export default CredibilityPanel;
