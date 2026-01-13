'use client';

/**
 * Chapterized Report View Component
 *
 * 章节化报告视图 - 参考 AI Writing 样式:
 * - 每个维度作为独立章节卡片
 * - 点击卡片进入编辑面板
 * - 显示章节状态、摘要预览、字数
 * - 便于分工协作
 * - 支持引用链接 [1], [2] 可点击跳转到参考文献
 */

import { useState, useMemo, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CitedMarkdown } from './deep-research/citations';
import type { SourceReference } from './deep-research/citations/types';
import type {
  TopicReport,
  TopicDimension,
  TopicEvidence,
} from '@/types/topic-research';

interface ChapterizedReportViewProps {
  report: TopicReport | null;
  dimensions: TopicDimension[];
  evidence?: TopicEvidence[];
  isLoading?: boolean;
  onEditChapter?: (chapterId: string, content: string) => void;
  onAIEditChapter?: (chapterId: string, operation: string) => Promise<void>;
}

// Chapter status type
type ChapterStatus = 'pending' | 'in_progress' | 'completed' | 'needs_review';

// Chapter data structure
interface Chapter {
  id: string;
  chapterNumber: number;
  title: string;
  dimensionId?: string;
  type: 'summary' | 'dimension' | 'conclusion' | 'references';
  status: ChapterStatus;
  outline: string; // Brief description/outline
  content: string; // Full content
  wordCount: number;
}

// Icons
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

const CloseIcon = ({ className }: { className?: string }) => (
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
      d="M6 18L18 6M6 6l12 12"
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

export function ChapterizedReportView({
  report,
  dimensions,
  evidence = [],
  isLoading = false,
  onEditChapter,
  onAIEditChapter,
}: ChapterizedReportViewProps) {
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');

  // Convert evidence to SourceReference format for citation linking
  const sources: SourceReference[] = useMemo(() => {
    return evidence.map((ev) => ({
      id: ev.id,
      title: ev.title,
      content: ev.snippet || null,
      abstract: ev.snippet || null,
    }));
  }, [evidence]);

  // Build chapters from report and dimensions
  const chapters = useMemo<Chapter[]>(() => {
    if (!report) return [];

    const result: Chapter[] = [];
    let chapterNum = 1;

    // Add dimension chapters
    if (report.dimensionAnalyses && report.dimensionAnalyses.length > 0) {
      report.dimensionAnalyses.forEach((analysis) => {
        const dimName = analysis.dimension?.name || `维度 ${chapterNum}`;
        const dimId = analysis.dimension?.id || `dim-${chapterNum}`;

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
        const outline = analysis.summary?.slice(0, 100) || dimName;

        result.push({
          id: dimId,
          chapterNumber: chapterNum,
          title: dimName,
          dimensionId: dimId,
          type: 'dimension',
          status,
          outline,
          content,
          wordCount: content.length,
        });

        chapterNum++;
      });
    }

    return result;
  }, [report, dimensions]);

  // Open chapter for viewing/editing
  const openChapter = useCallback((chapter: Chapter) => {
    setSelectedChapter(chapter);
    setEditContent(chapter.content);
    setIsEditing(false);
  }, []);

  // Close chapter panel
  const closeChapter = useCallback(() => {
    setSelectedChapter(null);
    setIsEditing(false);
    setEditContent('');
  }, []);

  // Start editing
  const startEditing = useCallback(() => {
    setIsEditing(true);
  }, []);

  // Save edit
  const saveEdit = useCallback(() => {
    if (selectedChapter && onEditChapter) {
      onEditChapter(selectedChapter.id, editContent);
    }
    setIsEditing(false);
  }, [selectedChapter, editContent, onEditChapter]);

  // Cancel editing
  const cancelEdit = useCallback(() => {
    if (selectedChapter) {
      setEditContent(selectedChapter.content);
    }
    setIsEditing(false);
  }, [selectedChapter]);

  // Calculate stats
  const stats = useMemo(() => {
    const total = chapters.length;
    const completed = chapters.filter((c) => c.status === 'completed').length;
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
          <span className="mb-4 text-4xl">📝</span>
          <p className="mt-2 text-gray-500">暂无报告内容</p>
          <p className="mt-1 text-sm text-gray-400">开始研究后将在此显示章节</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Chapter List */}
      <div
        className={`flex-1 overflow-auto p-4 ${selectedChapter ? 'hidden lg:block lg:w-1/2' : ''}`}
      >
        {/* Stats Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="text-sm text-gray-500">
            共 {stats.total} 章 · {stats.completed} 已完成 ·{' '}
            {stats.totalWords.toLocaleString()} 字
          </div>
        </div>

        {/* Chapter Cards */}
        <div className="space-y-2">
          {chapters.map((chapter) => (
            <button
              key={chapter.id}
              onClick={() => openChapter(chapter)}
              className={`block w-full rounded-xl border p-4 text-left transition-all ${
                selectedChapter?.id === chapter.id
                  ? 'border-blue-300 bg-blue-50'
                  : 'border-gray-100 bg-white hover:border-blue-200 hover:bg-blue-50/50'
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Status Icon */}
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium ${
                    chapter.status === 'completed'
                      ? 'bg-green-100 text-green-700'
                      : chapter.status === 'in_progress'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {chapter.status === 'completed' ? (
                    <CheckIcon className="h-4 w-4" />
                  ) : (
                    chapter.chapterNumber
                  )}
                </span>

                {/* Chapter Info */}
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-gray-800">
                    第{chapter.chapterNumber}章 {chapter.title}
                  </div>

                  {/* Outline/Summary */}
                  {chapter.outline && chapter.outline !== chapter.title && (
                    <div className="mt-1 line-clamp-2 text-xs text-gray-400">
                      {chapter.outline}
                    </div>
                  )}

                  {/* Content Preview */}
                  {chapter.content && (
                    <div className="mt-2 line-clamp-3 whitespace-pre-wrap text-xs text-gray-500">
                      {chapter.content.slice(0, 200)}
                      {chapter.content.length > 200 ? '...' : ''}
                    </div>
                  )}
                </div>

                {/* Word Count Badge */}
                {chapter.wordCount > 0 && (
                  <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                    {chapter.wordCount.toLocaleString()} 字
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Chapter Edit Panel */}
      {selectedChapter && (
        <div className="fixed inset-0 z-50 bg-white lg:relative lg:w-1/2 lg:border-l lg:border-gray-200">
          {/* Panel Header */}
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <div className="flex items-center gap-3">
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium ${
                  selectedChapter.status === 'completed'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                {selectedChapter.status === 'completed' ? (
                  <CheckIcon className="h-4 w-4" />
                ) : (
                  selectedChapter.chapterNumber
                )}
              </span>
              <div>
                <h3 className="font-medium text-gray-900">
                  第{selectedChapter.chapterNumber}章 {selectedChapter.title}
                </h3>
                <p className="text-xs text-gray-500">
                  {selectedChapter.wordCount.toLocaleString()} 字
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!isEditing ? (
                <>
                  <button
                    onClick={startEditing}
                    className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    <EditIcon className="h-4 w-4" />
                    编辑
                  </button>
                  {onAIEditChapter && (
                    <button
                      onClick={() =>
                        onAIEditChapter(selectedChapter.id, 'polish')
                      }
                      className="flex items-center gap-1.5 rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 text-sm font-medium text-purple-700 hover:bg-purple-100"
                    >
                      <AIIcon className="h-4 w-4" />
                      AI 润色
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button
                    onClick={cancelEdit}
                    className="rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
                  >
                    取消
                  </button>
                  <button
                    onClick={saveEdit}
                    className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
                  >
                    保存
                  </button>
                </>
              )}
              <button
                onClick={closeChapter}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Panel Content */}
          <div className="h-[calc(100%-57px)] overflow-auto p-4">
            {isEditing ? (
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="font-mono h-full w-full resize-none rounded-lg border border-gray-300 p-4 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder="编辑章节内容..."
              />
            ) : sources.length > 0 ? (
              // Use CitedMarkdown when we have sources for citation linking
              <CitedMarkdown
                content={selectedChapter.content || '暂无内容'}
                sources={sources}
              />
            ) : (
              // Fallback to plain markdown when no sources
              <article className="prose prose-sm prose-gray max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {selectedChapter.content || '暂无内容'}
                </ReactMarkdown>
              </article>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
