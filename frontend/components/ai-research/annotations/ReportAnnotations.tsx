'use client';

/**
 * Report Annotations Component
 *
 * v7.0 报告批注功能:
 * - 文本选择批注
 * - 批注列表管理
 * - 批注高亮跳转
 */

import { useState, useCallback, useMemo } from 'react';
import { safeString } from '@/lib/utils/common';
import ClientDate from '@/components/common/ClientDate';

// Annotation types
interface ReportAnnotation {
  id: string;
  reportId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  selectedText: string;
  content: string;
  startOffset: number;
  endOffset: number;
  sectionId?: string;
  color: 'yellow' | 'green' | 'blue' | 'pink' | 'purple';
  status: 'active' | 'resolved' | 'archived';
  createdAt: string;
  updatedAt: string;
  replies?: AnnotationReply[];
}

interface AnnotationReply {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  content: string;
  createdAt: string;
}

interface ReportAnnotationsProps {
  annotations: ReportAnnotation[];
  currentUserId?: string;
  isLoading?: boolean;
  onAdd?: (
    annotation: Omit<
      ReportAnnotation,
      'id' | 'createdAt' | 'updatedAt' | 'replies'
    >
  ) => Promise<void>;
  onUpdate?: (annotationId: string, content: string) => Promise<void>;
  onDelete?: (annotationId: string) => Promise<void>;
  onResolve?: (annotationId: string) => Promise<void>;
  onReply?: (annotationId: string, content: string) => Promise<void>;
  onNavigate?: (annotationId: string) => void;
  /** ★ 提交批注为反馈 - 用于反馈闭环系统 */
  onSubmitFeedback?: (annotationId: string) => Promise<void>;
}

// Color config
const colorConfig: Record<
  string,
  { bg: string; border: string; text: string }
> = {
  yellow: {
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
    text: 'text-yellow-700',
  },
  green: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    text: 'text-green-700',
  },
  blue: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700' },
  pink: { bg: 'bg-pink-50', border: 'border-pink-200', text: 'text-pink-700' },
  purple: {
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    text: 'text-purple-700',
  },
};

// Icons
const AnnotationIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
    />
  </svg>
);

const CheckIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M5 13l4 4L19 7"
    />
  </svg>
);

const TrashIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
    />
  </svg>
);

const ReplyIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
    />
  </svg>
);

const NavigateIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

const EditIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
    />
  </svg>
);

// Filter types
type FilterStatus = 'all' | 'active' | 'resolved';

// Feedback icon
const FeedbackIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
    />
  </svg>
);

export function ReportAnnotations({
  annotations,
  currentUserId,
  isLoading = false,
  onAdd,
  onUpdate,
  onDelete,
  onResolve,
  onReply,
  onNavigate,
  onSubmitFeedback,
}: ReportAnnotationsProps) {
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [expandedAnnotations, setExpandedAnnotations] = useState<Set<string>>(
    new Set()
  );
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  // ★ 安全处理：确保 annotations 是数组
  const safeAnnotations = Array.isArray(annotations) ? annotations : [];

  // Filter annotations
  const filteredAnnotations = useMemo(() => {
    if (filterStatus === 'all') return safeAnnotations;
    return safeAnnotations.filter((a) => a.status === filterStatus);
  }, [safeAnnotations, filterStatus]);

  // Group by status
  const stats = useMemo(() => {
    const active = safeAnnotations.filter((a) => a.status === 'active').length;
    const resolved = safeAnnotations.filter(
      (a) => a.status === 'resolved'
    ).length;
    return { total: safeAnnotations.length, active, resolved };
  }, [safeAnnotations]);

  // Toggle expanded
  const toggleExpanded = useCallback((annotationId: string) => {
    setExpandedAnnotations((prev) => {
      const next = new Set(prev);
      if (next.has(annotationId)) {
        next.delete(annotationId);
      } else {
        next.add(annotationId);
      }
      return next;
    });
  }, []);

  // Handle reply
  const handleReply = useCallback(
    async (annotationId: string) => {
      if (!onReply || !replyContent.trim()) return;

      await onReply(annotationId, replyContent.trim());
      setReplyContent('');
      setReplyingTo(null);
    },
    [onReply, replyContent]
  );

  // Handle edit
  const handleEdit = useCallback(
    async (annotationId: string) => {
      if (!onUpdate || !editContent.trim()) return;

      await onUpdate(annotationId, editContent.trim());
      setEditingId(null);
      setEditContent('');
    },
    [onUpdate, editContent]
  );

  // Start editing
  const startEditing = useCallback((annotation: ReportAnnotation) => {
    setEditingId(annotation.id);
    setEditContent(annotation.content);
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
          <p className="text-sm text-gray-500">加载批注...</p>
        </div>
      </div>
    );
  }

  if (annotations.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center">
        <AnnotationIcon className="h-12 w-12 text-gray-300" />
        <p className="mt-3 text-gray-500">暂无批注</p>
        <p className="mt-1 text-sm text-gray-400">选择报告中的文字可添加批注</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-700">批注</h3>
            <p className="mt-0.5 text-xs text-gray-400">
              {stats.active} 个待处理，{stats.resolved} 个已解决
            </p>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="mt-3 flex gap-1">
          {[
            { key: 'all', label: `全部 (${stats.total})` },
            { key: 'active', label: `待处理 (${stats.active})` },
            { key: 'resolved', label: `已解决 (${stats.resolved})` },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilterStatus(tab.key as FilterStatus)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                filterStatus === tab.key
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Annotation list */}
      <div className="flex-1 overflow-auto p-4">
        <div className="space-y-3">
          {filteredAnnotations.map((annotation) => {
            const colors = colorConfig[annotation.color] || colorConfig.yellow;
            const isExpanded = expandedAnnotations.has(annotation.id);
            const isOwner = currentUserId === annotation.userId;
            const isEditing = editingId === annotation.id;

            return (
              <div
                key={annotation.id}
                className={`overflow-hidden rounded-lg border ${colors.border} ${colors.bg}`}
              >
                {/* Header */}
                <div className="flex items-start gap-3 p-3">
                  {/* Avatar */}
                  <div className="flex-shrink-0">
                    {annotation.userAvatar ? (
                      <img
                        src={annotation.userAvatar}
                        alt={annotation.userName}
                        className="h-8 w-8 rounded-full"
                      />
                    ) : (
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-full ${colors.text} bg-white`}
                      >
                        {annotation.userName.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900">
                        {annotation.userName}
                      </span>
                      <div className="flex items-center gap-1">
                        {annotation.status === 'resolved' && (
                          <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">
                            已解决
                          </span>
                        )}
                        <ClientDate
                          date={annotation.createdAt}
                          format="date"
                          className="text-xs text-gray-400"
                        />
                      </div>
                    </div>

                    {/* Selected text */}
                    <div className="mt-1 rounded bg-white/50 p-2 text-xs italic text-gray-500">
                      "
                      {annotation.selectedText.length > 100
                        ? annotation.selectedText.slice(0, 100) + '...'
                        : annotation.selectedText}
                      "
                    </div>

                    {/* Annotation content */}
                    {isEditing ? (
                      <div className="mt-2">
                        <textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className="w-full rounded border border-gray-200 p-2 text-sm focus:border-blue-400 focus:outline-none"
                          rows={3}
                        />
                        <div className="mt-2 flex gap-2">
                          <button
                            onClick={() => handleEdit(annotation.id)}
                            className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700"
                          >
                            保存
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="rounded bg-gray-200 px-3 py-1 text-xs text-gray-600 hover:bg-gray-300"
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-gray-700">
                        {safeString(annotation.content)}
                      </p>
                    )}

                    {/* Actions - icon-only buttons with tooltips */}
                    <div className="mt-3 flex items-center gap-1">
                      {/* Navigate */}
                      {onNavigate && (
                        <button
                          onClick={() => onNavigate(annotation.id)}
                          className="rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                          title="跳转到原文"
                        >
                          <NavigateIcon className="h-4 w-4" />
                        </button>
                      )}

                      {/* Reply */}
                      {onReply && (
                        <button
                          onClick={() => setReplyingTo(annotation.id)}
                          className="rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                          title="回复"
                        >
                          <ReplyIcon className="h-4 w-4" />
                        </button>
                      )}

                      {/* Resolve */}
                      {onResolve && annotation.status === 'active' && (
                        <button
                          onClick={() => onResolve(annotation.id)}
                          className="rounded p-1.5 text-green-400 transition-colors hover:bg-green-50 hover:text-green-600"
                          title="标记为已解决"
                        >
                          <CheckIcon className="h-4 w-4" />
                        </button>
                      )}

                      {/* Edit (owner only) */}
                      {onUpdate && isOwner && (
                        <button
                          onClick={() => startEditing(annotation)}
                          className="rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                          title="编辑"
                        >
                          <EditIcon className="h-4 w-4" />
                        </button>
                      )}

                      {/* Delete (owner only) */}
                      {onDelete && isOwner && (
                        <button
                          onClick={() => onDelete(annotation.id)}
                          className="rounded p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                          title="删除"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      )}

                      {/* Submit as Feedback */}
                      {onSubmitFeedback && (
                        <button
                          onClick={() => onSubmitFeedback(annotation.id)}
                          className="rounded p-1.5 text-blue-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
                          title="提交反馈"
                        >
                          <FeedbackIcon className="h-4 w-4" />
                        </button>
                      )}

                      {/* Expand replies */}
                      {annotation.replies && annotation.replies.length > 0 && (
                        <button
                          onClick={() => toggleExpanded(annotation.id)}
                          className="ml-auto rounded px-2 py-1 text-xs text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                        >
                          {isExpanded
                            ? '收起'
                            : `${annotation.replies.length} 条回复`}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Replies */}
                {isExpanded &&
                  annotation.replies &&
                  annotation.replies.length > 0 && (
                    <div className="border-t border-gray-100 bg-white/50 p-3">
                      <div className="space-y-3 pl-8">
                        {annotation.replies.map((reply) => (
                          <div key={reply.id} className="flex gap-2">
                            <div className="flex-shrink-0">
                              {reply.userAvatar ? (
                                <img
                                  src={reply.userAvatar}
                                  alt={reply.userName}
                                  className="h-6 w-6 rounded-full"
                                />
                              ) : (
                                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-xs text-gray-600">
                                  {reply.userName.charAt(0).toUpperCase()}
                                </div>
                              )}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-gray-700">
                                  {reply.userName}
                                </span>
                                <ClientDate
                                  date={reply.createdAt}
                                  format="date"
                                  className="text-xs text-gray-400"
                                />
                              </div>
                              <p className="mt-0.5 text-sm text-gray-600">
                                {safeString(reply.content)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                {/* Reply input */}
                {replyingTo === annotation.id && (
                  <div className="border-t border-gray-100 bg-white p-3">
                    <textarea
                      value={replyContent}
                      onChange={(e) => setReplyContent(e.target.value)}
                      placeholder="输入回复..."
                      className="w-full rounded border border-gray-200 p-2 text-sm focus:border-blue-400 focus:outline-none"
                      rows={2}
                    />
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => handleReply(annotation.id)}
                        disabled={!replyContent.trim()}
                        className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 disabled:bg-gray-300"
                      >
                        发送
                      </button>
                      <button
                        onClick={() => {
                          setReplyingTo(null);
                          setReplyContent('');
                        }}
                        className="rounded bg-gray-200 px-3 py-1 text-xs text-gray-600 hover:bg-gray-300"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
