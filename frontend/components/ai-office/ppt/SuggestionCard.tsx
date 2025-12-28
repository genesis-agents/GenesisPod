'use client';

/**
 * SuggestionCard - 质量建议卡片
 *
 * 功能：
 * 1. 显示质量检查发现的问题
 * 2. 显示修复建议和操作
 * 3. 支持一键自动修复
 * 4. 支持忽略/关闭建议
 *
 * API 调用：
 * - POST /api/ai-office/slides/{id}/apply-suggestion - 应用修复建议
 */

import React, { useState } from 'react';
import {
  AlertTriangle,
  AlertCircle,
  Info,
  Copy,
  LayoutGrid,
  FileText,
  Palette,
  PlusCircle,
  MinusCircle,
  Wand2,
  Check,
  X,
  Loader2,
  ChevronDown,
  ChevronUp,
  Scissors,
  Merge,
  Database,
  FileQuestion,
  Sparkles,
} from 'lucide-react';
import { useApiPost } from '@/hooks/core/useApi';

// ============================================
// 类型定义
// ============================================

export interface QualityIssue {
  id: string;
  type:
    | 'duplicate'
    | 'layout_overflow'
    | 'content_sparse'
    | 'content_dense'
    | 'inconsistency'
    | 'missing_data'
    | 'source_unverified'
    | 'fabrication_suspected'
    | 'data_point_missing';
  severity: 'error' | 'warning' | 'info';
  pages: number[];
  description: string;
  details?: Record<string, unknown>;
}

export interface Suggestion {
  id: string;
  issueId: string;
  action:
    | 'merge'
    | 'split'
    | 'adjust_layout'
    | 'add_content'
    | 'remove_content'
    | 'unify_style';
  description: string;
  autoFixable: boolean;
  priority: 'high' | 'medium' | 'low';
  actionData?: Record<string, unknown>;
}

export interface SmartSplitSuggestion extends Suggestion {
  action: 'split';
  actionData: {
    slideIndex: number;
    splitStrategy: 'by_topic' | 'by_paragraph' | 'by_bullet' | 'by_section';
    suggestedParts: number;
    splitPoints: string[];
    estimatedWordCounts: number[];
  };
}

interface SuggestionCardProps {
  pptId: string;
  issue: QualityIssue;
  suggestion?: Suggestion;
  onApplied?: () => void;
  onDismissed?: () => void;
  className?: string;
}

// ============================================
// 工具函数
// ============================================

const getIssueTypeInfo = (
  type: QualityIssue['type']
): { label: string; icon: React.ReactNode; color: string } => {
  const typeMap: Record<
    QualityIssue['type'],
    { label: string; icon: React.ReactNode; color: string }
  > = {
    duplicate: {
      label: '重复内容',
      icon: <Copy className="h-4 w-4" />,
      color: 'text-orange-500',
    },
    layout_overflow: {
      label: '布局溢出',
      icon: <LayoutGrid className="h-4 w-4" />,
      color: 'text-red-500',
    },
    content_sparse: {
      label: '内容过少',
      icon: <FileText className="h-4 w-4" />,
      color: 'text-yellow-500',
    },
    content_dense: {
      label: '内容过多',
      icon: <FileText className="h-4 w-4" />,
      color: 'text-orange-500',
    },
    inconsistency: {
      label: '样式不一致',
      icon: <Palette className="h-4 w-4" />,
      color: 'text-purple-500',
    },
    missing_data: {
      label: '数据缺失',
      icon: <Database className="h-4 w-4" />,
      color: 'text-yellow-500',
    },
    source_unverified: {
      label: '来源未验证',
      icon: <FileQuestion className="h-4 w-4" />,
      color: 'text-yellow-500',
    },
    fabrication_suspected: {
      label: '疑似捏造',
      icon: <AlertTriangle className="h-4 w-4" />,
      color: 'text-red-500',
    },
    data_point_missing: {
      label: '数据点缺失',
      icon: <Database className="h-4 w-4" />,
      color: 'text-orange-500',
    },
  };

  return (
    typeMap[type] || {
      label: '未知问题',
      icon: <Info className="h-4 w-4" />,
      color: 'text-gray-500',
    }
  );
};

const getSeverityInfo = (
  severity: QualityIssue['severity']
): {
  label: string;
  icon: React.ReactNode;
  bgColor: string;
  textColor: string;
} => {
  const severityMap: Record<
    QualityIssue['severity'],
    { label: string; icon: React.ReactNode; bgColor: string; textColor: string }
  > = {
    error: {
      label: '错误',
      icon: <AlertCircle className="h-4 w-4" />,
      bgColor: 'bg-red-50 dark:bg-red-900/20',
      textColor: 'text-red-600 dark:text-red-400',
    },
    warning: {
      label: '警告',
      icon: <AlertTriangle className="h-4 w-4" />,
      bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
      textColor: 'text-yellow-600 dark:text-yellow-400',
    },
    info: {
      label: '提示',
      icon: <Info className="h-4 w-4" />,
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
      textColor: 'text-blue-600 dark:text-blue-400',
    },
  };

  return severityMap[severity];
};

const getActionInfo = (
  action: Suggestion['action']
): { label: string; icon: React.ReactNode } => {
  const actionMap: Record<
    Suggestion['action'],
    { label: string; icon: React.ReactNode }
  > = {
    merge: { label: '合并页面', icon: <Merge className="h-4 w-4" /> },
    split: { label: '拆分页面', icon: <Scissors className="h-4 w-4" /> },
    adjust_layout: {
      label: '调整布局',
      icon: <LayoutGrid className="h-4 w-4" />,
    },
    add_content: {
      label: '添加内容',
      icon: <PlusCircle className="h-4 w-4" />,
    },
    remove_content: {
      label: '删除内容',
      icon: <MinusCircle className="h-4 w-4" />,
    },
    unify_style: { label: '统一样式', icon: <Palette className="h-4 w-4" /> },
  };

  return actionMap[action];
};

const getPriorityColor = (priority: Suggestion['priority']): string => {
  const priorityColors: Record<Suggestion['priority'], string> = {
    high: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    medium:
      'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    low: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  };

  return priorityColors[priority];
};

// ============================================
// 主组件
// ============================================

export const SuggestionCard: React.FC<SuggestionCardProps> = ({
  pptId,
  issue,
  suggestion,
  onApplied,
  onDismissed,
  className = '',
}) => {
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState<
    'idle' | 'applying' | 'applied' | 'dismissed'
  >('idle');

  const { execute: applySuggestion, loading: applying } = useApiPost(
    `/api/ai-office/slides/${pptId}/apply-suggestion`
  );

  const issueTypeInfo = getIssueTypeInfo(issue.type);
  const severityInfo = getSeverityInfo(issue.severity);
  const actionInfo = suggestion ? getActionInfo(suggestion.action) : null;

  const handleApply = async () => {
    if (!suggestion) return;

    try {
      setStatus('applying');
      await applySuggestion({
        suggestionId: suggestion.id,
        action: 'apply',
      });
      setStatus('applied');
      onApplied?.();
    } catch (e) {
      console.error('Failed to apply suggestion:', e);
      setStatus('idle');
    }
  };

  const handleDismiss = async () => {
    if (!suggestion) return;

    try {
      await applySuggestion({
        suggestionId: suggestion.id,
        action: 'dismiss',
      });
      setStatus('dismissed');
      onDismissed?.();
    } catch (e) {
      console.error('Failed to dismiss suggestion:', e);
    }
  };

  // 如果已应用或已忽略，显示简化状态
  if (status === 'applied' || status === 'dismissed') {
    return (
      <div
        className={`rounded-lg border p-3 ${
          status === 'applied'
            ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20'
            : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800'
        } ${className}`}
      >
        <div className="flex items-center gap-2 text-sm">
          {status === 'applied' ? (
            <>
              <Check className="h-4 w-4 text-green-500" />
              <span className="text-green-700 dark:text-green-400">已修复</span>
            </>
          ) : (
            <>
              <X className="h-4 w-4 text-gray-400" />
              <span className="text-gray-500">已忽略</span>
            </>
          )}
          <span className="text-gray-500 dark:text-gray-400">
            - {issue.description}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`overflow-hidden rounded-lg border ${severityInfo.bgColor} ${
        issue.severity === 'error'
          ? 'border-red-200 dark:border-red-800'
          : issue.severity === 'warning'
            ? 'border-yellow-200 dark:border-yellow-800'
            : 'border-blue-200 dark:border-blue-800'
      } ${className}`}
    >
      {/* 头部 */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-4">
          {/* 左侧：问题信息 */}
          <div className="flex-1">
            {/* 标签行 */}
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {/* 严重程度 */}
              <span
                className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs ${severityInfo.textColor}`}
              >
                {severityInfo.icon}
                {severityInfo.label}
              </span>

              {/* 问题类型 */}
              <span
                className={`inline-flex items-center gap-1 rounded bg-white/50 px-2 py-0.5 text-xs dark:bg-black/20 ${issueTypeInfo.color}`}
              >
                {issueTypeInfo.icon}
                {issueTypeInfo.label}
              </span>

              {/* 受影响页面 */}
              {issue.pages.length > 0 && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  第 {issue.pages.map((p) => p + 1).join(', ')} 页
                </span>
              )}

              {/* 优先级标签 */}
              {suggestion && (
                <span
                  className={`rounded px-2 py-0.5 text-xs ${getPriorityColor(suggestion.priority)}`}
                >
                  {suggestion.priority === 'high'
                    ? '高优先级'
                    : suggestion.priority === 'medium'
                      ? '中优先级'
                      : '低优先级'}
                </span>
              )}
            </div>

            {/* 问题描述 */}
            <p className="mb-2 text-sm text-gray-800 dark:text-gray-200">
              {issue.description}
            </p>

            {/* 建议操作 */}
            {suggestion && (
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <Wand2 className="h-4 w-4 text-purple-500" />
                <span>建议操作：</span>
                <span className="flex items-center gap-1 font-medium text-gray-800 dark:text-gray-200">
                  {actionInfo?.icon}
                  {actionInfo?.label}
                </span>
                {suggestion.autoFixable && (
                  <span className="inline-flex items-center gap-1 rounded bg-green-100 px-2 py-0.5 text-xs text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    <Sparkles className="h-3 w-3" />
                    可自动修复
                  </span>
                )}
              </div>
            )}
          </div>

          {/* 右侧：操作按钮 */}
          {suggestion && (
            <div className="flex items-center gap-2">
              {suggestion.autoFixable && (
                <button
                  onClick={handleApply}
                  disabled={applying}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-1.5 text-sm text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
                >
                  {applying ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      修复中...
                    </>
                  ) : (
                    <>
                      <Wand2 className="h-4 w-4" />
                      自动修复
                    </>
                  )}
                </button>
              )}
              <button
                onClick={handleDismiss}
                disabled={applying}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-200 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-700"
              >
                <X className="h-4 w-4" />
                忽略
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 详情展开区域 */}
      {(issue.details ||
        (suggestion?.actionData && suggestion.action === 'split')) && (
        <>
          <button
            onClick={() => setExpanded(!expanded)}
            className="border-current/10 flex w-full items-center justify-center gap-1 border-t py-2 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
          >
            {expanded ? (
              <>
                收起详情 <ChevronUp className="h-3 w-3" />
              </>
            ) : (
              <>
                查看详情 <ChevronDown className="h-3 w-3" />
              </>
            )}
          </button>

          {expanded && (
            <div className="px-4 pb-4">
              {/* 智能拆分建议详情 */}
              {suggestion?.action === 'split' && suggestion.actionData && (
                <SmartSplitDetails
                  actionData={
                    suggestion.actionData as SmartSplitSuggestion['actionData']
                  }
                />
              )}

              {/* 数据点缺失详情 */}
              {issue.type === 'data_point_missing' && issue.details && (
                <DataPointDetails
                  details={issue.details as Record<string, unknown>}
                />
              )}

              {/* 来源验证详情 */}
              {(issue.type === 'source_unverified' ||
                issue.type === 'fabrication_suspected') &&
                issue.details && (
                  <SourceVerificationDetails
                    details={issue.details as Record<string, unknown>}
                  />
                )}

              {/* 通用详情 */}
              {!['split'].includes(suggestion?.action || '') &&
                ![
                  'data_point_missing',
                  'source_unverified',
                  'fabrication_suspected',
                ].includes(issue.type) &&
                issue.details && <GenericDetails details={issue.details} />}
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ============================================
// 详情子组件
// ============================================

interface SmartSplitDetailsProps {
  actionData: SmartSplitSuggestion['actionData'];
}

const SmartSplitDetails: React.FC<SmartSplitDetailsProps> = ({
  actionData,
}) => {
  const strategyLabels: Record<string, string> = {
    by_topic: '按主题拆分',
    by_paragraph: '按段落拆分',
    by_bullet: '按要点拆分',
    by_section: '按章节拆分',
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3 text-sm">
        <div className="rounded bg-white/50 p-2 dark:bg-black/20">
          <div className="mb-1 text-xs text-gray-500">拆分策略</div>
          <div className="font-medium">
            {strategyLabels[actionData.splitStrategy]}
          </div>
        </div>
        <div className="rounded bg-white/50 p-2 dark:bg-black/20">
          <div className="mb-1 text-xs text-gray-500">建议拆分</div>
          <div className="font-medium">{actionData.suggestedParts} 页</div>
        </div>
        <div className="rounded bg-white/50 p-2 dark:bg-black/20">
          <div className="mb-1 text-xs text-gray-500">原页面</div>
          <div className="font-medium">第 {actionData.slideIndex + 1} 页</div>
        </div>
      </div>

      {actionData.splitPoints.length > 0 && (
        <div>
          <div className="mb-2 text-xs text-gray-500">拆分点建议：</div>
          <ul className="space-y-1">
            {actionData.splitPoints.map((point, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm">
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                  {idx + 1}
                </span>
                <span className="text-gray-700 dark:text-gray-300">
                  {point}
                </span>
                {actionData.estimatedWordCounts[idx] && (
                  <span className="text-xs text-gray-400">
                    (~{actionData.estimatedWordCounts[idx]} 字)
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

interface DataPointDetailsProps {
  details: Record<string, unknown>;
}

const DataPointDetails: React.FC<DataPointDetailsProps> = ({ details }) => {
  const missingDataPoints =
    (details.missingDataPoints as Array<{
      id: string;
      value: string;
      type: string;
    }>) || [];
  const coverageRate = (details.coverageRate as number) || 0;

  const typeLabels: Record<string, string> = {
    percentage: '百分比',
    currency: '金额',
    number: '数字',
    date: '日期',
    other: '其他',
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <div className="text-sm">
          <span className="text-gray-500">数据点覆盖率：</span>
          <span
            className={`font-medium ${
              coverageRate >= 80
                ? 'text-green-600'
                : coverageRate >= 50
                  ? 'text-yellow-600'
                  : 'text-red-600'
            }`}
          >
            {coverageRate.toFixed(0)}%
          </span>
        </div>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
          <div
            className={`h-full rounded-full ${
              coverageRate >= 80
                ? 'bg-green-500'
                : coverageRate >= 50
                  ? 'bg-yellow-500'
                  : 'bg-red-500'
            }`}
            style={{ width: `${coverageRate}%` }}
          />
        </div>
      </div>

      {missingDataPoints.length > 0 && (
        <div>
          <div className="mb-2 text-xs text-gray-500">缺失的数据点：</div>
          <div className="flex flex-wrap gap-2">
            {missingDataPoints.map((dp) => (
              <span
                key={dp.id}
                className="inline-flex items-center gap-1 rounded bg-red-100 px-2 py-1 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400"
              >
                <span className="font-medium">{dp.value}</span>
                <span className="text-xs opacity-70">
                  ({typeLabels[dp.type] || dp.type})
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

interface SourceVerificationDetailsProps {
  details: Record<string, unknown>;
}

const SourceVerificationDetails: React.FC<SourceVerificationDetailsProps> = ({
  details,
}) => {
  const contentSnippet = (details.contentSnippet as string) || '';
  const sourceRelevance = (details.sourceRelevance as number) || 0;
  const suspiciousContent = (details.suspiciousContent as string[]) || [];
  const expectedSource = (details.expectedSource as string) || '';

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <div className="text-sm">
          <span className="text-gray-500">来源相关度：</span>
          <span
            className={`font-medium ${
              sourceRelevance >= 80
                ? 'text-green-600'
                : sourceRelevance >= 50
                  ? 'text-yellow-600'
                  : 'text-red-600'
            }`}
          >
            {sourceRelevance.toFixed(0)}%
          </span>
        </div>
      </div>

      {contentSnippet && (
        <div>
          <div className="mb-1 text-xs text-gray-500">问题内容片段：</div>
          <div className="rounded bg-white/50 p-2 text-sm italic text-gray-700 dark:bg-black/20 dark:text-gray-300">
            "{contentSnippet}"
          </div>
        </div>
      )}

      {suspiciousContent.length > 0 && (
        <div>
          <div className="mb-1 text-xs text-gray-500">可疑内容：</div>
          <ul className="space-y-1">
            {suspiciousContent.map((content, idx) => (
              <li
                key={idx}
                className="rounded bg-red-50 px-2 py-1 text-sm text-red-600 dark:bg-red-900/10 dark:text-red-400"
              >
                {content}
              </li>
            ))}
          </ul>
        </div>
      )}

      {expectedSource && (
        <div>
          <div className="mb-1 text-xs text-gray-500">期望来源：</div>
          <div className="text-sm text-gray-700 dark:text-gray-300">
            {expectedSource}
          </div>
        </div>
      )}
    </div>
  );
};

interface GenericDetailsProps {
  details: Record<string, unknown>;
}

const GenericDetails: React.FC<GenericDetailsProps> = ({ details }) => {
  return (
    <div className="rounded bg-white/50 p-2 dark:bg-black/20">
      <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-gray-600 dark:text-gray-400">
        {JSON.stringify(details, null, 2)}
      </pre>
    </div>
  );
};

export default SuggestionCard;
