/**
 * ReviewResultCard - 审核结果展示组件
 *
 * 展示质量审核的详细结果，包括：
 * - 质量等级徽章
 * - 总分和五维评分
 * - 问题列表
 * - 改进建议
 */

'use client';

import React from 'react';
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  BookOpen,
  Scale,
  Link2,
  Clock,
  Lightbulb,
} from 'lucide-react';
import { cn } from '@/lib/utils/common';

// ==================== Types ====================

export type QualityLevel =
  | 'excellent'
  | 'good'
  | 'acceptable'
  | 'needs_revision'
  | 'rejected';

export interface ReviewScores {
  breadth: number;
  depth: number;
  evidence: number;
  coherence: number;
  currency: number;
}

export interface ReviewIssue {
  type: string;
  severity: 'critical' | 'major' | 'minor';
  description: string;
  affectedSection?: string;
}

export interface DimensionReviewResult {
  qualityLevel: QualityLevel;
  overallScore: number;
  scores: ReviewScores;
  issues: ReviewIssue[];
  suggestions: string[];
  needsReresearch: boolean;
  reresearchFocus?: string[];
}

export interface OverallReviewResult {
  qualityLevel: QualityLevel;
  overallScore: number;
  dimensionReviews: Array<{
    dimensionId: string;
    dimensionName: string;
    qualityLevel: QualityLevel;
    overallScore: number;
  }>;
  crossDimensionIssues: ReviewIssue[];
  coverageAnalysis: {
    coveredAspects: string[];
    missingAspects: string[];
    coverageScore: number;
  };
  recommendations: string[];
  needsReresearch: boolean;
  dimensionsToReresearch: string[];
}

export interface ReviewResultCardProps {
  reviewResult: DimensionReviewResult | OverallReviewResult;
  type: 'dimension' | 'overall';
  dimensionName?: string;
  compact?: boolean;
}

// ==================== Constants ====================

const qualityLevelConfig: Record<
  QualityLevel,
  {
    label: string;
    color: string;
    bgColor: string;
    icon: React.ElementType;
  }
> = {
  excellent: {
    label: '优秀',
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-100 dark:bg-emerald-900/30',
    icon: CheckCircle,
  },
  good: {
    label: '良好',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    icon: TrendingUp,
  },
  acceptable: {
    label: '可接受',
    color: 'text-yellow-600 dark:text-yellow-400',
    bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
    icon: Minus,
  },
  needs_revision: {
    label: '需修订',
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-100 dark:bg-orange-900/30',
    icon: AlertTriangle,
  },
  rejected: {
    label: '拒绝',
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
    icon: XCircle,
  },
};

const scoreLabels: Record<
  keyof ReviewScores,
  { label: string; icon: React.ElementType }
> = {
  breadth: { label: '广度', icon: Target },
  depth: { label: '深度', icon: TrendingDown },
  evidence: { label: '证据', icon: BookOpen },
  coherence: { label: '连贯', icon: Link2 },
  currency: { label: '时效', icon: Clock },
};

const severityConfig: Record<
  ReviewIssue['severity'],
  { label: string; color: string; bgColor: string }
> = {
  critical: {
    label: '严重',
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
  },
  major: {
    label: '重要',
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-100 dark:bg-orange-900/30',
  },
  minor: {
    label: '次要',
    color: 'text-yellow-600 dark:text-yellow-400',
    bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
  },
};

// ==================== Helper Functions ====================

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-600 dark:text-emerald-400';
  if (score >= 60) return 'text-blue-600 dark:text-blue-400';
  if (score >= 40) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
}

function getScoreBarColor(score: number): string {
  if (score >= 80) return 'bg-emerald-500';
  if (score >= 60) return 'bg-blue-500';
  if (score >= 40) return 'bg-yellow-500';
  return 'bg-red-500';
}

// ==================== Sub Components ====================

/**
 * 质量等级徽章
 */
function QualityBadge({ level }: { level: QualityLevel }) {
  const config = qualityLevelConfig[level] || qualityLevelConfig.acceptable;
  const Icon = config.icon;

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1',
        config.bgColor
      )}
    >
      <Icon className={cn('h-4 w-4', config.color)} />
      <span className={cn('text-sm font-medium', config.color)}>
        {config.label}
      </span>
    </div>
  );
}

/**
 * 分数进度条
 */
function ScoreBar({
  label,
  score,
  icon: Icon,
}: {
  label: string;
  score: number;
  icon: React.ElementType;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
          <Icon className="h-3 w-3" />
          {label}
        </span>
        <span className={cn('font-medium', getScoreColor(score))}>{score}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            getScoreBarColor(score)
          )}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

/**
 * 问题列表
 */
function IssuesList({
  issues,
  compact,
}: {
  issues: ReviewIssue[];
  compact?: boolean;
}) {
  if (issues.length === 0) return null;

  const displayIssues = compact ? issues.slice(0, 3) : issues;

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400">
        问题 ({issues.length})
      </h4>
      <div className="space-y-1.5">
        {displayIssues.map((issue, idx) => {
          const severityConf = severityConfig[issue.severity];
          return (
            <div
              key={idx}
              className={cn(
                'rounded-md px-2 py-1.5 text-xs',
                severityConf.bgColor
              )}
            >
              <span className={cn('font-medium', severityConf.color)}>
                [{severityConf.label}]
              </span>{' '}
              <span className="text-gray-700 dark:text-gray-300">
                {issue.description}
              </span>
            </div>
          );
        })}
        {compact && issues.length > 3 && (
          <div className="text-xs text-gray-500">
            还有 {issues.length - 3} 个问题...
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 建议列表
 */
function SuggestionsList({
  suggestions,
  compact,
}: {
  suggestions: string[];
  compact?: boolean;
}) {
  if (suggestions.length === 0) return null;

  const displaySuggestions = compact ? suggestions.slice(0, 2) : suggestions;

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400">
        改进建议 ({suggestions.length})
      </h4>
      <div className="space-y-1">
        {displaySuggestions.map((suggestion, idx) => (
          <div
            key={idx}
            className="flex items-start gap-1.5 text-xs text-gray-600 dark:text-gray-400"
          >
            <Lightbulb className="mt-0.5 h-3 w-3 flex-shrink-0 text-yellow-500" />
            <span>{suggestion}</span>
          </div>
        ))}
        {compact && suggestions.length > 2 && (
          <div className="text-xs text-gray-500">
            还有 {suggestions.length - 2} 条建议...
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== Main Component ====================

/**
 * 审核结果卡片
 */
export function ReviewResultCard({
  reviewResult,
  type,
  dimensionName,
  compact = false,
}: ReviewResultCardProps) {
  const isDimensionReview = type === 'dimension';
  const dimResult = reviewResult as DimensionReviewResult;
  const overallResult = reviewResult as OverallReviewResult;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <QualityBadge level={reviewResult.qualityLevel as QualityLevel} />
          {dimensionName && (
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {dimensionName}
            </span>
          )}
        </div>
        <div
          className={cn(
            'text-2xl font-bold',
            getScoreColor(reviewResult.overallScore)
          )}
        >
          {typeof reviewResult.overallScore === 'number'
            ? reviewResult.overallScore.toFixed(0)
            : reviewResult.overallScore}
          <span className="text-sm font-normal text-gray-400">/100</span>
        </div>
      </div>

      {/* Five Dimension Scores (only for dimension review) */}
      {isDimensionReview && dimResult.scores && (
        <div className="mb-4 grid grid-cols-5 gap-2">
          {(Object.keys(scoreLabels) as Array<keyof ReviewScores>).map(
            (key) => (
              <ScoreBar
                key={key}
                label={scoreLabels[key].label}
                score={dimResult.scores[key]}
                icon={scoreLabels[key].icon}
              />
            )
          )}
        </div>
      )}

      {/* Dimension Summary (only for overall review) */}
      {!isDimensionReview && overallResult.dimensionReviews && (
        <div className="mb-4 space-y-1">
          <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400">
            维度评分
          </h4>
          <div className="flex flex-wrap gap-2">
            {overallResult.dimensionReviews.map((dim) => (
              <div
                key={dim.dimensionId}
                className={cn(
                  'rounded-md px-2 py-1 text-xs',
                  qualityLevelConfig[dim.qualityLevel as QualityLevel]
                    ?.bgColor || 'bg-gray-100 dark:bg-gray-700'
                )}
              >
                <span className="text-gray-700 dark:text-gray-300">
                  {dim.dimensionName}
                </span>
                <span
                  className={cn(
                    'ml-1 font-medium',
                    getScoreColor(dim.overallScore)
                  )}
                >
                  {dim.overallScore}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Issues */}
      {isDimensionReview && (
        <IssuesList issues={dimResult.issues || []} compact={compact} />
      )}
      {!isDimensionReview && (
        <IssuesList
          issues={overallResult.crossDimensionIssues || []}
          compact={compact}
        />
      )}

      {/* Suggestions */}
      {isDimensionReview && (
        <div className="mt-3">
          <SuggestionsList
            suggestions={dimResult.suggestions || []}
            compact={compact}
          />
        </div>
      )}
      {!isDimensionReview && (
        <div className="mt-3">
          <SuggestionsList
            suggestions={overallResult.recommendations || []}
            compact={compact}
          />
        </div>
      )}

      {/* Re-research Notice */}
      {reviewResult.needsReresearch && (
        <div className="mt-3 flex items-center gap-2 rounded-md bg-orange-100 px-3 py-2 dark:bg-orange-900/30">
          <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
          <span className="text-xs text-orange-700 dark:text-orange-300">
            需要重新研究
            {isDimensionReview &&
              dimResult.reresearchFocus &&
              dimResult.reresearchFocus.length > 0 && (
                <span>: {dimResult.reresearchFocus.join(', ')}</span>
              )}
            {!isDimensionReview &&
              overallResult.dimensionsToReresearch &&
              overallResult.dimensionsToReresearch.length > 0 && (
                <span>
                  : {overallResult.dimensionsToReresearch.length} 个维度
                </span>
              )}
          </span>
        </div>
      )}
    </div>
  );
}

export default ReviewResultCard;
