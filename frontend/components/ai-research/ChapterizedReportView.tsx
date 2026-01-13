'use client';

/**
 * Chapterized Report View Component
 *
 * 章节化报告视图:
 * - 每个维度作为独立章节展示
 * - 支持展开/收起章节
 * - 支持单独编辑每个章节
 * - 便于分工协作
 */

import { useState, useMemo, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { TopicReport, TopicDimension } from '@/types/topic-research';

interface ChapterizedReportViewProps {
  report: TopicReport | null;
  dimensions: TopicDimension[];
  isLoading?: boolean;
  onEditChapter?: (chapterId: string, content: string) => void;
  onAIEditChapter?: (chapterId: string, operation: string) => Promise<void>;
}

// Chapter status type
type ChapterStatus = 'pending' | 'in_progress' | 'completed' | 'needs_review';

// Chapter data structure
interface Chapter {
  id: string;
  title: string;
  dimensionId?: string;
  type: 'summary' | 'dimension' | 'conclusion' | 'references';
  status: ChapterStatus;
  content: string;
  wordCount: number;
  assignee?: string;
  lastUpdated?: Date;
}

// Icons
const ChevronDownIcon = ({ className }: { className?: string }) => (
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
      d="M19 9l-7 7-7-7"
    />
  </svg>
);

const ChevronRightIcon = ({ className }: { className?: string }) => (
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
      d="M9 5l7 7-7 7"
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

const ClockIcon = ({ className }: { className?: string }) => (
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
      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

const AIIcon = ({ className }: { className?: string }) => (
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
      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
    />
  </svg>
);

// Status badge component
function StatusBadge({ status }: { status: ChapterStatus }) {
  const config = {
    pending: {
      label: '待开始',
      bgColor: 'bg-gray-100',
      textColor: 'text-gray-600',
    },
    in_progress: {
      label: '进行中',
      bgColor: 'bg-blue-100',
      textColor: 'text-blue-700',
    },
    completed: {
      label: '已完成',
      bgColor: 'bg-green-100',
      textColor: 'text-green-700',
    },
    needs_review: {
      label: '待审核',
      bgColor: 'bg-yellow-100',
      textColor: 'text-yellow-700',
    },
  };

  const { label, bgColor, textColor } = config[status];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${bgColor} ${textColor}`}
    >
      {status === 'completed' && <CheckIcon className="h-3 w-3" />}
      {status === 'in_progress' && <ClockIcon className="h-3 w-3" />}
      {label}
    </span>
  );
}

export function ChapterizedReportView({
  report,
  dimensions,
  isLoading = false,
  onEditChapter,
  onAIEditChapter,
}: ChapterizedReportViewProps) {
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(
    new Set()
  );
  const [editingChapter, setEditingChapter] = useState<string | null>(null);
  const [editContent, setEditContent] = useState<string>('');

  // Build chapters from report and dimensions
  const chapters = useMemo<Chapter[]>(() => {
    if (!report) return [];

    const result: Chapter[] = [];
    let chapterIndex = 0;

    // Add summary chapter if exists
    if (report.summary && report.summary.trim().length > 5) {
      result.push({
        id: 'summary',
        title: '摘要',
        type: 'summary',
        status: 'completed',
        content: report.summary,
        wordCount: report.summary.length,
      });
    }

    // Add highlights as a chapter
    if (report.highlights && report.highlights.length > 0) {
      const validHighlights = report.highlights.filter(
        (h) => h.content && h.content.trim().length > 5
      );
      if (validHighlights.length > 0) {
        const highlightContent = validHighlights
          .map((h, idx) => `### ${idx + 1}. ${h.title}\n\n${h.content}`)
          .join('\n\n');
        result.push({
          id: 'highlights',
          title: '关键发现',
          type: 'summary',
          status: 'completed',
          content: highlightContent,
          wordCount: highlightContent.length,
        });
      }
    }

    // Add dimension chapters
    if (report.dimensionAnalyses && report.dimensionAnalyses.length > 0) {
      report.dimensionAnalyses.forEach((analysis, idx) => {
        const dimName = analysis.dimension?.name || `维度 ${idx + 1}`;
        const dimId = analysis.dimension?.id || `dim-${idx}`;

        // Find corresponding dimension for status
        const dimension = dimensions.find((d) => d.id === dimId);
        let status: ChapterStatus = 'pending';
        if (dimension?.status === 'COMPLETED') {
          status = 'completed';
        } else if (dimension?.status === 'RESEARCHING') {
          status = 'in_progress';
        }

        // Build chapter content
        const parts: string[] = [];

        if (analysis.summary && analysis.summary.trim().length > 5) {
          parts.push(analysis.summary);
        }

        // Key findings
        if (analysis.keyFindings && analysis.keyFindings.length > 0) {
          const validFindings = analysis.keyFindings.filter(
            (f) => f.finding && f.finding.trim().length > 3
          );
          if (validFindings.length > 0) {
            parts.push('\n### 关键发现\n');
            validFindings.forEach((f, fIdx) => {
              parts.push(`${fIdx + 1}. **${f.finding}**`);
            });
          }
        }

        // Trends
        if (analysis.trends && analysis.trends.length > 0) {
          parts.push('\n### 趋势分析\n');
          analysis.trends.forEach((t, tIdx) => {
            const directionMap: Record<string, string> = {
              increasing: '📈 上升',
              decreasing: '📉 下降',
              stable: '➡️ 稳定',
              emerging: '🌱 新兴',
            };
            const direction = directionMap[t.direction] || t.direction;
            parts.push(
              `${tIdx + 1}. **${direction}**: ${t.trend} (${t.timeframe})`
            );
          });
        }

        // Challenges
        if (analysis.challenges && analysis.challenges.length > 0) {
          parts.push('\n### 挑战\n');
          analysis.challenges.forEach((c, cIdx) => {
            parts.push(`${cIdx + 1}. **${c.challenge}** - ${c.impact}`);
          });
        }

        // Opportunities
        if (analysis.opportunities && analysis.opportunities.length > 0) {
          parts.push('\n### 机遇\n');
          analysis.opportunities.forEach((o, oIdx) => {
            parts.push(`${oIdx + 1}. **${o.opportunity}** - ${o.potential}`);
          });
        }

        // Detailed content
        if (
          analysis.detailedContent &&
          analysis.detailedContent.trim().length > 5
        ) {
          parts.push('\n' + analysis.detailedContent);
        }

        const content = parts.join('\n');

        result.push({
          id: dimId,
          title: dimName,
          dimensionId: dimId,
          type: 'dimension',
          status,
          content,
          wordCount: content.length,
          assignee: undefined, // TODO: Add assignee support when available
        });

        chapterIndex++;
      });
    }

    return result;
  }, [report, dimensions]);

  // Toggle chapter expansion
  const toggleChapter = useCallback((chapterId: string) => {
    setExpandedChapters((prev) => {
      const next = new Set(prev);
      if (next.has(chapterId)) {
        next.delete(chapterId);
      } else {
        next.add(chapterId);
      }
      return next;
    });
  }, []);

  // Start editing a chapter
  const startEditing = useCallback((chapter: Chapter) => {
    setEditingChapter(chapter.id);
    setEditContent(chapter.content);
    // Ensure chapter is expanded
    setExpandedChapters((prev) => new Set([...prev, chapter.id]));
  }, []);

  // Save chapter edit
  const saveEdit = useCallback(() => {
    if (editingChapter && onEditChapter) {
      onEditChapter(editingChapter, editContent);
    }
    setEditingChapter(null);
    setEditContent('');
  }, [editingChapter, editContent, onEditChapter]);

  // Cancel editing
  const cancelEdit = useCallback(() => {
    setEditingChapter(null);
    setEditContent('');
  }, []);

  // Expand all chapters
  const expandAll = useCallback(() => {
    setExpandedChapters(new Set(chapters.map((c) => c.id)));
  }, [chapters]);

  // Collapse all chapters
  const collapseAll = useCallback(() => {
    setExpandedChapters(new Set());
  }, []);

  // Calculate stats
  const stats = useMemo(() => {
    const total = chapters.filter((c) => c.type === 'dimension').length;
    const completed = chapters.filter(
      (c) => c.type === 'dimension' && c.status === 'completed'
    ).length;
    const totalWords = chapters.reduce((sum, c) => sum + c.wordCount, 0);
    return { total, completed, totalWords };
  }, [chapters]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
          <p className="text-sm text-gray-500">加载报告中...</p>
        </div>
      </div>
    );
  }

  if (!report || chapters.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500">暂无报告内容</p>
          <p className="mt-1 text-sm text-gray-400">开始研究后将在此显示章节</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header with stats and controls */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-gray-900">章节视图</h2>
          <div className="flex items-center gap-3 text-sm text-gray-500">
            <span>共 {stats.total} 章</span>
            <span className="text-green-600">{stats.completed} 已完成</span>
            <span>{stats.totalWords} 字</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={expandAll}
            className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
          >
            展开全部
          </button>
          <button
            onClick={collapseAll}
            className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
          >
            收起全部
          </button>
        </div>
      </div>

      {/* Chapter list */}
      <div className="flex-1 overflow-auto">
        <div className="divide-y divide-gray-100">
          {chapters.map((chapter, index) => {
            const isExpanded = expandedChapters.has(chapter.id);
            const isEditing = editingChapter === chapter.id;

            return (
              <div
                key={chapter.id}
                className={`bg-white ${isEditing ? 'ring-2 ring-inset ring-blue-500' : ''}`}
              >
                {/* Chapter header */}
                <div
                  className={`flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50 ${
                    isExpanded ? 'bg-gray-50' : ''
                  }`}
                  onClick={() => toggleChapter(chapter.id)}
                >
                  {/* Expand/collapse icon */}
                  <button className="flex-shrink-0 text-gray-400">
                    {isExpanded ? (
                      <ChevronDownIcon className="h-5 w-5" />
                    ) : (
                      <ChevronRightIcon className="h-5 w-5" />
                    )}
                  </button>

                  {/* Chapter number */}
                  {chapter.type === 'dimension' && (
                    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-medium text-blue-700">
                      {index}
                    </span>
                  )}

                  {/* Chapter title */}
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-medium text-gray-900">
                      {chapter.title}
                    </h3>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {chapter.wordCount} 字
                      {chapter.assignee && ` · 负责人: ${chapter.assignee}`}
                    </p>
                  </div>

                  {/* Status badge */}
                  <StatusBadge status={chapter.status} />

                  {/* Action buttons */}
                  <div
                    className="flex items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {!isEditing && (
                      <>
                        <button
                          onClick={() => startEditing(chapter)}
                          className="rounded p-1.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                          title="编辑章节"
                        >
                          <EditIcon className="h-4 w-4" />
                        </button>
                        {onAIEditChapter && (
                          <button
                            onClick={() =>
                              onAIEditChapter(chapter.id, 'polish')
                            }
                            className="rounded p-1.5 text-gray-400 hover:bg-purple-100 hover:text-purple-600"
                            title="AI 润色"
                          >
                            <AIIcon className="h-4 w-4" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Chapter content */}
                {isExpanded && (
                  <div className="border-t border-gray-100 bg-white">
                    {isEditing ? (
                      // Edit mode
                      <div className="p-4">
                        <textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className="font-mono h-64 w-full rounded-lg border border-gray-300 p-3 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                          placeholder="编辑章节内容..."
                        />
                        <div className="mt-3 flex items-center justify-end gap-2">
                          <button
                            onClick={cancelEdit}
                            className="rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
                          >
                            取消
                          </button>
                          <button
                            onClick={saveEdit}
                            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                          >
                            保存
                          </button>
                        </div>
                      </div>
                    ) : (
                      // Preview mode
                      <div className="p-4 pl-14">
                        <article className="prose prose-sm prose-gray max-w-none">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {chapter.content || '暂无内容'}
                          </ReactMarkdown>
                        </article>
                      </div>
                    )}
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
