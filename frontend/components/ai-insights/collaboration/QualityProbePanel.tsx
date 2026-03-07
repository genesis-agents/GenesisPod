'use client';

/**
 * Quality Probe Panel - 质量探针面板
 *
 * 显示报告生成全链路的质量追踪数据：
 * - 综合评分和等级
 * - 5 个维度的分项评分
 * - 主要问题列表
 * - 证据质量、维度缺陷、后处理统计
 *
 * 嵌入到"协作动态" tab 中作为补充面板
 */

import { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileSearch,
  Loader2,
  RefreshCw,
  Shield,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils/common';
import { useI18n } from '@/lib/i18n';
import {
  getReportQualitySummary,
  type ReportQualitySummary,
} from '@/lib/api/topic-insights';
import { logger } from '@/lib/utils/logger';

interface QualityProbePanelProps {
  topicId: string;
  reportId: string | undefined;
  className?: string;
}

const GRADE_CONFIG: Record<
  string,
  { color: string; bg: string; border: string; label: string }
> = {
  A: {
    color: 'text-green-700',
    bg: 'bg-green-50',
    border: 'border-green-200',
    label: 'Excellent',
  },
  B: {
    color: 'text-blue-700',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    label: 'Good',
  },
  C: {
    color: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    label: 'Fair',
  },
  D: {
    color: 'text-orange-700',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    label: 'Poor',
  },
  F: {
    color: 'text-red-700',
    bg: 'bg-red-50',
    border: 'border-red-200',
    label: 'Fail',
  },
};

const SCORE_LABELS: Record<string, string> = {
  formatting: '格式正确性',
  completeness: '内容完整性',
  sourceQuality: '来源质量',
  structure: '结构清晰度',
  languageConsistency: '语言一致性',
};

function ScoreBar({
  label,
  score,
  maxScore = 100,
}: {
  label: string;
  score: number;
  maxScore?: number;
}) {
  const percentage = Math.min(100, Math.max(0, (score / maxScore) * 100));
  const color =
    score >= 80
      ? 'bg-green-500'
      : score >= 60
        ? 'bg-blue-500'
        : score >= 40
          ? 'bg-amber-500'
          : 'bg-red-500';

  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 text-xs text-gray-600">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            color
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="w-8 shrink-0 text-right text-xs font-medium text-gray-700">
        {score}
      </span>
    </div>
  );
}

function IssueItem({
  issue,
}: {
  issue: {
    category: string;
    description: string;
    severity: string;
    count: number;
  };
}) {
  const isError = issue.severity === 'error';
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-md px-2 py-1.5 text-xs',
        isError ? 'bg-red-50' : 'bg-amber-50'
      )}
    >
      {isError ? (
        <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-red-500" />
      ) : (
        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
      )}
      <div className="flex-1">
        <span className={isError ? 'text-red-700' : 'text-amber-700'}>
          {issue.description}
        </span>
      </div>
      <span
        className={cn(
          'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
          isError ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
        )}
      >
        {issue.count}
      </span>
    </div>
  );
}

export function QualityProbePanel({
  topicId,
  reportId,
  className,
}: QualityProbePanelProps) {
  const { t } = useI18n();
  const [summary, setSummary] = useState<ReportQualitySummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    if (!topicId || !reportId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await getReportQualitySummary(topicId, reportId);
      setSummary(data);
    } catch (err) {
      logger.error('[QualityProbePanel] Failed to fetch quality summary:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to load quality data'
      );
    } finally {
      setIsLoading(false);
    }
  }, [topicId, reportId]);

  useEffect(() => {
    void fetchSummary();
  }, [fetchSummary]);

  if (!reportId) return null;

  const gradeConfig = summary
    ? GRADE_CONFIG[summary.grade] || GRADE_CONFIG.F
    : GRADE_CONFIG.C;

  return (
    <div
      className={cn(
        'rounded-lg border bg-white transition-all duration-300',
        className
      )}
    >
      {/* Header */}
      <div
        className="flex cursor-pointer items-center gap-2 border-b px-4 py-2 hover:bg-gray-50"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <Shield className="h-4 w-4 text-indigo-600" />
        <span className="text-sm font-medium">
          {t('topicResearch.qualityProbe.title', { defaultValue: '质量探针' })}
        </span>

        {/* Grade badge */}
        {summary && (
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-xs font-bold',
              gradeConfig.bg,
              gradeConfig.color,
              gradeConfig.border,
              'border'
            )}
          >
            {summary.grade} ({summary.overallScore})
          </span>
        )}

        {isLoading && (
          <Loader2 className="h-3 w-3 animate-spin text-gray-400" />
        )}

        <div className="ml-auto flex items-center gap-1">
          <button
            className="rounded p-1 transition-colors hover:bg-gray-100"
            onClick={(e) => {
              e.stopPropagation();
              void fetchSummary();
            }}
            title="Refresh"
          >
            <RefreshCw className="h-3 w-3 text-gray-400" />
          </button>
          {isCollapsed ? (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronUp className="h-4 w-4 text-gray-400" />
          )}
        </div>
      </div>

      {/* Content */}
      {!isCollapsed && (
        <div className="space-y-3 p-3">
          {isLoading && !summary && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
            </div>
          )}

          {error && (
            <div className="rounded-md bg-gray-50 p-3 text-center text-xs text-gray-500">
              {error === 'Failed to load quality data'
                ? t('topicResearch.qualityProbe.noData', {
                    defaultValue: '暂无质量追踪数据（新版报告生成后可用）',
                  })
                : error}
            </div>
          )}

          {!summary && !isLoading && !error && (
            <div className="rounded-md bg-gray-50 p-3 text-center text-xs text-gray-500">
              <FileSearch className="mx-auto mb-1 h-5 w-5 text-gray-400" />
              {t('topicResearch.qualityProbe.noData', {
                defaultValue: '暂无质量追踪数据（新版报告生成后可用）',
              })}
            </div>
          )}

          {summary && (
            <>
              {/* Score overview */}
              <div
                className={cn(
                  'rounded-lg border p-3',
                  gradeConfig.bg,
                  gradeConfig.border
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn('text-2xl font-bold', gradeConfig.color)}
                    >
                      {summary.grade}
                    </span>
                    <div>
                      <div
                        className={cn('text-sm font-medium', gradeConfig.color)}
                      >
                        {summary.overallScore}/100
                      </div>
                      <div className="text-[10px] text-gray-500">
                        {summary.dimensionCount}{' '}
                        {t('topicResearch.qualityProbe.dimensions', {
                          defaultValue: '维度',
                        })}{' '}
                        / {summary.evidenceCount}{' '}
                        {t('topicResearch.qualityProbe.sources', {
                          defaultValue: '来源',
                        })}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-gray-500">
                      {t('topicResearch.qualityProbe.pipeline', {
                        defaultValue: '管道版本',
                      })}
                    </div>
                    <div className="text-xs font-medium text-gray-600">
                      {summary.pipelineVersion}
                    </div>
                  </div>
                </div>
              </div>

              {/* Score bars */}
              <div className="space-y-2">
                <div className="flex items-center gap-1 text-xs font-medium text-gray-700">
                  <TrendingUp className="h-3 w-3" />
                  {t('topicResearch.qualityProbe.scoreBreakdown', {
                    defaultValue: '分项评分',
                  })}
                </div>
                {Object.entries(summary.scores).map(([key, value]) => (
                  <ScoreBar
                    key={key}
                    label={SCORE_LABELS[key] || key}
                    score={value}
                  />
                ))}
              </div>

              {/* Post-processing fixes */}
              {summary.postProcessingFixes > 0 && (
                <div className="flex items-center gap-2 rounded-md bg-blue-50 px-3 py-1.5 text-xs text-blue-700">
                  <CheckCircle2 className="h-3 w-3" />
                  {t('topicResearch.qualityProbe.fixesApplied', {
                    defaultValue: `后处理自动修复 ${summary.postProcessingFixes} 处`,
                    count: summary.postProcessingFixes,
                  })}
                </div>
              )}

              {/* Top issues */}
              {summary.topIssues.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1 text-xs font-medium text-gray-700">
                    <AlertTriangle className="h-3 w-3" />
                    {t('topicResearch.qualityProbe.mainIssues', {
                      defaultValue: '主要问题',
                    })}
                  </div>
                  {summary.topIssues.slice(0, 5).map((issue, idx) => (
                    <IssueItem key={idx} issue={issue} />
                  ))}
                </div>
              )}

              {summary.topIssues.length === 0 && (
                <div className="flex items-center gap-2 rounded-md bg-green-50 px-3 py-1.5 text-xs text-green-700">
                  <CheckCircle2 className="h-3 w-3" />
                  {t('topicResearch.qualityProbe.noIssues', {
                    defaultValue: '未检测到质量问题',
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default QualityProbePanel;
