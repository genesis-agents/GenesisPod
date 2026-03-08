'use client';

/**
 * Quality Probe Panel - 质量探针面板
 *
 * 显示报告生成全链路的质量追踪数据：
 * - 综合评分和等级
 * - 5 个维度的分项评分
 * - 主要问题列表（可点击展开查看具体内容）
 * - 证据质量、维度缺陷、后处理统计
 *
 * 嵌入到"协作动态" tab 中作为补充面板
 */

import { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
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
  getReportQualityDetails,
  type ReportQualitySummary,
  type ReportQualityDetails,
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

/** Map issue description keywords to defect scanner rule names */
const DESCRIPTION_TO_RULE: Record<string, string> = {
  'bare LaTeX': 'bareLatexCount',
  'broken $': 'brokenDollarNesting',
  pseudocode: 'pseudoCodeLines',
  'leaked meta': 'leakedMetaNotes',
  'missing headings': 'missingHeadings',
  'heading echoes': 'headingEchoes',
  'long list items': 'longListItems',
};

function getRuleFromDescription(description: string): string | undefined {
  for (const [keyword, rule] of Object.entries(DESCRIPTION_TO_RULE)) {
    if (description.toLowerCase().includes(keyword)) return rule;
  }
  return undefined;
}

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
  topicId,
  reportId,
  cachedDetails,
  onDetailsLoaded,
}: {
  issue: {
    category: string;
    description: string;
    severity: string;
    count: number;
  };
  topicId: string;
  reportId: string;
  cachedDetails: ReportQualityDetails | null;
  onDetailsLoaded: (details: ReportQualityDetails) => void;
}) {
  const isError = issue.severity === 'error';
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const rule = getRuleFromDescription(issue.description);

  const details = rule && cachedDetails?.details[rule];
  const dimensionBreakdown = cachedDetails?.dimensionBreakdown;

  const handleClick = useCallback(async () => {
    if (!rule) {
      setExpanded((v) => !v);
      return;
    }

    if (expanded) {
      setExpanded(false);
      return;
    }

    // If we already have details cached, just expand
    if (cachedDetails?.details[rule]) {
      setExpanded(true);
      return;
    }

    // Fetch details
    setLoading(true);
    try {
      const data = await getReportQualityDetails(topicId, reportId);
      if (data) onDetailsLoaded(data);
      setExpanded(true);
    } catch (err) {
      logger.error('[QualityProbePanel] Failed to fetch details:', err);
    } finally {
      setLoading(false);
    }
  }, [rule, expanded, cachedDetails, topicId, reportId, onDetailsLoaded]);

  // Get dimension breakdown for this rule
  const dimBreakdownForRule =
    rule && dimensionBreakdown
      ? dimensionBreakdown
          .filter((d) => {
            const defectKey = rule;
            return (d.defects[defectKey] ?? 0) > 0;
          })
          .map((d) => ({
            name: d.dimensionName,
            count: d.defects[rule] ?? 0,
          }))
          .sort((a, b) => b.count - a.count)
      : [];

  return (
    <div className="space-y-0">
      <div
        className={cn(
          'flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-xs transition-colors',
          isError
            ? 'bg-red-50 hover:bg-red-100'
            : 'bg-amber-50 hover:bg-amber-100',
          rule && 'cursor-pointer'
        )}
        onClick={() => void handleClick()}
      >
        {isError ? (
          <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-red-500" />
        ) : (
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
        )}
        <div className="flex flex-1 items-center gap-1">
          {rule &&
            (loading ? (
              <Loader2 className="h-3 w-3 shrink-0 animate-spin text-gray-400" />
            ) : expanded ? (
              <ChevronDown className="h-3 w-3 shrink-0 text-gray-400" />
            ) : (
              <ChevronRight className="h-3 w-3 shrink-0 text-gray-400" />
            ))}
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

      {/* Expanded detail panel */}
      {expanded && rule && (
        <div className="ml-5 mt-1 space-y-2 rounded-md border border-gray-200 bg-gray-50 p-2">
          {/* Dimension breakdown */}
          {dimBreakdownForRule.length > 0 && (
            <div className="space-y-0.5">
              <div className="text-[10px] font-medium text-gray-500">
                按维度分布
              </div>
              {dimBreakdownForRule.map((d) => (
                <div
                  key={d.name}
                  className="flex items-center justify-between text-[11px] text-gray-600"
                >
                  <span className="truncate">{d.name}</span>
                  <span className="font-mono ml-2 shrink-0 text-gray-500">
                    {d.count}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Actual defect lines */}
          {details && Array.isArray(details) && details.length > 0 && (
            <div className="space-y-0.5">
              <div className="text-[10px] font-medium text-gray-500">
                具体内容（L = 行号）
              </div>
              <div className="max-h-48 space-y-0.5 overflow-y-auto">
                {details.map((d, idx) => (
                  <div
                    key={idx}
                    className="flex gap-1.5 rounded bg-white px-1.5 py-1 text-[11px]"
                  >
                    <span className="font-mono shrink-0 text-gray-400">
                      L{d.line}
                    </span>
                    <span className="break-all text-gray-700">{d.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {details && Array.isArray(details) && details.length === 0 && (
            <div className="text-[11px] text-gray-400">
              此规则在完整报告中未检测到具体内容（可能已被后处理修复）
            </div>
          )}
        </div>
      )}
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
  const [detailsCache, setDetailsCache] = useState<ReportQualityDetails | null>(
    null
  );

  const fetchSummary = useCallback(async () => {
    if (!topicId || !reportId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await getReportQualitySummary(topicId, reportId);
      setSummary(data);
      setDetailsCache(null); // Clear details cache on refresh
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

  const handleDetailsLoaded = useCallback((details: ReportQualityDetails) => {
    setDetailsCache(details);
  }, []);

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
                    <IssueItem
                      key={idx}
                      issue={issue}
                      topicId={topicId}
                      reportId={reportId}
                      cachedDetails={detailsCache}
                      onDetailsLoaded={handleDetailsLoaded}
                    />
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
