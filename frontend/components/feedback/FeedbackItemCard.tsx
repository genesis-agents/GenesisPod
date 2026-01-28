'use client';

import { useState } from 'react';
import ClientDate from '@/components/common/ClientDate';
import {
  type ResearchFeedbackItem,
  type ResearchFeedbackItemStatus,
  type ResearchFeedbackCategory,
  type FeedbackPriority,
  type ResearchFeedbackSource,
} from '@/hooks/domain/useResearchFeedback';
import {
  useUpdateFeedback,
  useDeleteFeedback,
  useAnalyzeFeedback,
} from '@/hooks/domain/useResearchFeedback';
import {
  AlertCircle,
  Bug,
  Lightbulb,
  MessageSquare,
  ThumbsUp,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Trash2,
  ExternalLink,
} from 'lucide-react';

interface FeedbackItemCardProps {
  item: ResearchFeedbackItem;
  onUpdate?: () => void;
  onCreateKnowledge?: (id: string) => void;
}

const categoryConfig: Record<
  ResearchFeedbackCategory,
  { label: string; icon: React.ReactNode; color: string }
> = {
  QUALITY_ISSUE: {
    label: '质量问题',
    icon: <AlertCircle className="h-4 w-4" />,
    color: 'bg-red-100 text-red-700',
  },
  CONTENT_ERROR: {
    label: '内容错误',
    icon: <Bug className="h-4 w-4" />,
    color: 'bg-orange-100 text-orange-700',
  },
  FEATURE_REQUEST: {
    label: '功能建议',
    icon: <Lightbulb className="h-4 w-4" />,
    color: 'bg-blue-100 text-blue-700',
  },
  IMPROVEMENT: {
    label: '改进建议',
    icon: <MessageSquare className="h-4 w-4" />,
    color: 'bg-green-100 text-green-700',
  },
  POSITIVE: {
    label: '正面反馈',
    icon: <ThumbsUp className="h-4 w-4" />,
    color: 'bg-purple-100 text-purple-700',
  },
};

const statusConfig: Record<
  ResearchFeedbackItemStatus,
  { label: string; color: string }
> = {
  PENDING: { label: '待处理', color: 'bg-gray-100 text-gray-700' },
  ANALYZING: { label: '分析中', color: 'bg-yellow-100 text-yellow-700' },
  REVIEWING: { label: '审核中', color: 'bg-blue-100 text-blue-700' },
  APPROVED: { label: '已批准', color: 'bg-green-100 text-green-700' },
  REJECTED: { label: '已拒绝', color: 'bg-red-100 text-red-700' },
  APPLIED: { label: '已应用', color: 'bg-emerald-100 text-emerald-700' },
  CLOSED: { label: '已关闭', color: 'bg-gray-100 text-gray-600' },
};

const priorityConfig: Record<
  FeedbackPriority,
  { label: string; color: string }
> = {
  CRITICAL: { label: '紧急', color: 'bg-red-500 text-white' },
  HIGH: { label: '高', color: 'bg-orange-500 text-white' },
  NORMAL: { label: '普通', color: 'bg-blue-500 text-white' },
  LOW: { label: '低', color: 'bg-gray-400 text-white' },
};

const sourceConfig: Record<
  ResearchFeedbackSource,
  { label: string; icon: React.ReactNode; color: string }
> = {
  REPORT_ANNOTATION: {
    label: '批注',
    icon: <MessageSquare className="h-3 w-3" />,
    color: 'bg-indigo-50 text-indigo-600 border border-indigo-200',
  },
  MANUAL: {
    label: '手动',
    icon: <Lightbulb className="h-3 w-3" />,
    color: 'bg-amber-50 text-amber-600 border border-amber-200',
  },
  SYSTEM: {
    label: '系统',
    icon: <AlertCircle className="h-3 w-3" />,
    color: 'bg-gray-50 text-gray-600 border border-gray-200',
  },
};

export function FeedbackItemCard({
  item,
  onUpdate,
  onCreateKnowledge,
}: FeedbackItemCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { execute: updateFeedback, loading: updating } = useUpdateFeedback();
  const { execute: deleteFeedback, loading: deleting } = useDeleteFeedback();
  const { execute: analyzeFeedback, loading: analyzing } = useAnalyzeFeedback();

  const category = item.category
    ? categoryConfig[item.category]
    : categoryConfig.IMPROVEMENT;
  const status = statusConfig[item.status];
  const priority = priorityConfig[item.priority];
  const source = sourceConfig[item.sourceType] || sourceConfig.MANUAL;

  const handleStatusChange = async (newStatus: ResearchFeedbackItemStatus) => {
    await updateFeedback(item.id, { status: newStatus });
    onUpdate?.();
  };

  const handleAnalyze = async () => {
    await analyzeFeedback(item.id);
    onUpdate?.();
  };

  const handleDelete = async () => {
    if (confirm('确定要删除这条反馈吗？')) {
      await deleteFeedback(item.id);
      onUpdate?.();
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {/* 来源标签 - 显示在最前面 */}
          <span
            className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs ${source.color}`}
            title={`来源: ${source.label}`}
          >
            {source.icon}
            {source.label}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${category.color}`}
          >
            <span className="flex items-center gap-1">
              {category.icon}
              {category.label}
            </span>
          </span>
          <span className={`rounded px-2 py-0.5 text-xs ${priority.color}`}>
            {priority.label}
          </span>
          <span className={`rounded px-2 py-0.5 text-xs ${status.color}`}>
            {status.label}
          </span>
        </div>
        <ClientDate
          date={item.createdAt}
          format="date"
          className="text-xs text-gray-400"
        />
      </div>

      {/* Content */}
      <div className="mt-3">
        <p className="line-clamp-2 text-sm text-gray-700">{item.content}</p>
        {item.selectedText && (
          <div className="mt-2 rounded bg-gray-50 p-2 text-xs text-gray-600">
            <span className="font-medium">选中文本：</span>
            <span className="italic">&ldquo;{item.selectedText}&rdquo;</span>
          </div>
        )}
      </div>

      {/* Meta */}
      <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
        {item.user && (
          <span className="flex items-center gap-1">
            {item.user.avatarUrl ? (
              <img
                src={item.user.avatarUrl}
                alt=""
                className="h-4 w-4 rounded-full"
              />
            ) : (
              <div className="h-4 w-4 rounded-full bg-gray-300" />
            )}
            {item.user.fullName || item.user.username || '用户'}
          </span>
        )}
        {item.topic && (
          <span className="flex items-center gap-1">
            <ExternalLink className="h-3 w-3" />
            {item.topic.name}
          </span>
        )}
      </div>

      {/* AI Analysis (expandable) */}
      {item.aiAnalysis && (
        <div className="mt-3 border-t pt-3">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex w-full items-center justify-between text-sm text-gray-600 hover:text-gray-900"
          >
            <span className="flex items-center gap-1">
              <Sparkles className="h-4 w-4 text-purple-500" />
              AI 分析结果
            </span>
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
          {isExpanded && (
            <div className="mt-2 space-y-2 rounded bg-purple-50 p-3 text-sm">
              <p>
                <span className="font-medium">摘要：</span>
                {item.aiAnalysis.summary}
              </p>
              <p>
                <span className="font-medium">根本原因：</span>
                {item.aiAnalysis.rootCause}
              </p>
              <p>
                <span className="font-medium">建议措施：</span>
                {item.aiAnalysis.suggestedAction}
              </p>
              {item.aiAnalysis.confidence !== undefined && (
                <p className="text-xs text-gray-500">
                  置信度：{(item.aiAnalysis.confidence * 100).toFixed(0)}%
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3">
        {item.status === 'PENDING' && (
          <button
            onClick={handleAnalyze}
            disabled={analyzing}
            className="flex items-center gap-1 rounded bg-purple-100 px-3 py-1.5 text-xs font-medium text-purple-700 hover:bg-purple-200 disabled:opacity-50"
          >
            {analyzing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3" />
            )}
            AI 分析
          </button>
        )}

        {item.status === 'REVIEWING' && (
          <>
            <button
              onClick={() => handleStatusChange('APPROVED')}
              disabled={updating}
              className="flex items-center gap-1 rounded bg-green-100 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-200"
            >
              <CheckCircle className="h-3 w-3" />
              批准
            </button>
            <button
              onClick={() => handleStatusChange('REJECTED')}
              disabled={updating}
              className="flex items-center gap-1 rounded bg-red-100 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-200"
            >
              <XCircle className="h-3 w-3" />
              拒绝
            </button>
          </>
        )}

        {item.status === 'APPROVED' && onCreateKnowledge && (
          <button
            onClick={() => onCreateKnowledge(item.id)}
            className="flex items-center gap-1 rounded bg-blue-100 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-200"
          >
            <Lightbulb className="h-3 w-3" />
            沉淀知识
          </button>
        )}

        <button
          onClick={handleDelete}
          disabled={deleting}
          className="ml-auto flex items-center gap-1 rounded px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 hover:text-red-600"
        >
          {deleting ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Trash2 className="h-3 w-3" />
          )}
          删除
        </button>
      </div>
    </div>
  );
}
