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

import { useState, useMemo, useCallback, useEffect, useRef, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Typography from '@tiptap/extension-typography';
import TurndownService from 'turndown';
import { CitedMarkdown } from './deep-research/citations';
import type { SourceReference } from './deep-research/citations/types';
import { TextSelectionContextMenu } from './TextSelectionContextMenu';
import { AnnotationHighlighter } from './AnnotationHighlighter';
import type { AIEditOperation } from './types';
import type {
  TopicReport,
  TopicDimension,
  TopicEvidence,
} from '@/types/topic-research';

// Initialize Turndown for HTML to Markdown conversion
const turndownService = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
});

// Comprehensive markdown to HTML converter (for TipTap)
function markdownToHtml(markdown: string): string {
  // First normalize and clean the markdown
  let normalized = markdown
    .replace(/\r\n/g, '\n') // Normalize Windows line endings
    .replace(/\\#/g, '#') // Remove escaped hash symbols (common from AI output)
    .replace(/\\-/g, '-') // Remove escaped dashes
    .replace(/\\\*/g, '*') // Remove escaped asterisks
    .replace(/\\\[/g, '[') // Remove escaped brackets
    .replace(/\\\]/g, ']')
    .replace(/\n{3,}/g, '\n\n') // Collapse 3+ newlines to 2
    .trim();

  // Process line by line for better control
  const lines = normalized.split('\n');
  const processedLines: string[] = [];
  let inList = false;
  let listType: 'ul' | 'ol' | null = null;

  for (const line of lines) {
    let processed = line;

    // Headers (h1-h6) - must be at start of line
    const headerMatch = processed.match(/^(#{1,6})\s+(.+)$/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const content = headerMatch[2];
      // Close any open list
      if (inList) {
        processedLines.push(listType === 'ul' ? '</ul>' : '</ol>');
        inList = false;
        listType = null;
      }
      processedLines.push(
        `<h${level}>${processInlineMarkdown(content)}</h${level}>`
      );
      continue;
    }

    // Horizontal rule
    if (/^-{3,}$/.test(processed.trim()) || /^\*{3,}$/.test(processed.trim())) {
      if (inList) {
        processedLines.push(listType === 'ul' ? '</ul>' : '</ol>');
        inList = false;
        listType = null;
      }
      processedLines.push('<hr>');
      continue;
    }

    // Unordered list item
    const ulMatch = processed.match(/^[-*]\s+(.+)$/);
    if (ulMatch) {
      if (!inList || listType !== 'ul') {
        if (inList) processedLines.push(listType === 'ul' ? '</ul>' : '</ol>');
        processedLines.push('<ul>');
        inList = true;
        listType = 'ul';
      }
      processedLines.push(`<li>${processInlineMarkdown(ulMatch[1])}</li>`);
      continue;
    }

    // Ordered list item
    const olMatch = processed.match(/^\d+\.\s+(.+)$/);
    if (olMatch) {
      if (!inList || listType !== 'ol') {
        if (inList) processedLines.push(listType === 'ul' ? '</ul>' : '</ol>');
        processedLines.push('<ol>');
        inList = true;
        listType = 'ol';
      }
      processedLines.push(`<li>${processInlineMarkdown(olMatch[1])}</li>`);
      continue;
    }

    // Close list if we hit a non-list line
    if (inList && processed.trim()) {
      processedLines.push(listType === 'ul' ? '</ul>' : '</ol>');
      inList = false;
      listType = null;
    }

    // Empty line
    if (!processed.trim()) {
      processedLines.push('');
      continue;
    }

    // Regular paragraph
    processedLines.push(`<p>${processInlineMarkdown(processed)}</p>`);
  }

  // Close any remaining list
  if (inList) {
    processedLines.push(listType === 'ul' ? '</ul>' : '</ol>');
  }

  // Join and clean up
  let html = processedLines
    .join('\n')
    .replace(/<\/p>\n<p>/g, '</p><p>') // Remove newlines between paragraphs
    .replace(/<p>\s*<\/p>/g, '') // Remove empty paragraphs
    .replace(/\n+/g, ''); // Remove remaining newlines

  return html || '<p></p>';
}

// Process inline markdown (bold, italic, links, code)
function processInlineMarkdown(text: string): string {
  return (
    text
      // Code (inline) - must come before bold/italic to preserve backticks
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // Bold and italic combined
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/___(.+?)___/g, '<strong><em>$1</em></strong>')
      // Bold
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/__(.+?)__/g, '<strong>$1</strong>')
      // Italic
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/_(.+?)_/g, '<em>$1</em>')
      // Links [text](url)
      .replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
      )
  );
}

// Annotation type for highlighting
interface ReportAnnotation {
  id: string;
  selectedText: string;
  startOffset: number;
  endOffset: number;
  color: 'yellow' | 'green' | 'blue' | 'pink' | 'purple';
  status?: 'active' | 'resolved' | 'archived';
  /** Context before the selection for reliable matching */
  selectorPrefix?: string;
  /** Context after the selection for reliable matching */
  selectorSuffix?: string;
}

interface ChapterizedReportViewProps {
  report: TopicReport | null;
  dimensions: TopicDimension[];
  evidence?: TopicEvidence[];
  isLoading?: boolean;
  onEditChapter?: (chapterId: string, content: string) => void;
  onAIEditChapter?: (chapterId: string, operation: string) => Promise<void>;
  /** AI edit callback for selected text (right-click menu) */
  onAIEdit?: (
    operation: AIEditOperation,
    selectedText: string
  ) => Promise<string>;
  /** Add annotation callback */
  onAddAnnotation?: (data: {
    selectedText: string;
    startOffset: number;
    endOffset: number;
    color: 'yellow' | 'green' | 'blue' | 'pink' | 'purple';
    /** Context before the selection for reliable matching */
    selectorPrefix?: string;
    /** Context after the selection for reliable matching */
    selectorSuffix?: string;
  }) => void;
  /** Annotations for highlighting in preview */
  annotations?: ReportAnnotation[];
  /** Currently highlighted annotation ID (for navigation) */
  highlightedAnnotationId?: string | null;
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
const BackIcon = ({ className }: { className?: string }) => (
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
      d="M10 19l-7-7m0 0l7-7m-7 7h18"
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

// View mode type (consistent with continuous view)
type ViewMode = 'preview' | 'edit' | 'source';

// Eye icon for preview mode
const EyeIcon = ({ className }: { className?: string }) => (
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
      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
    />
  </svg>
);

// Code icon for source view
const CodeIcon = ({ className }: { className?: string }) => (
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
      d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
    />
  </svg>
);

/**
 * Custom comparison function for React.memo
 *
 * CRITICAL: This prevents re-renders when parent state changes (like sidePanelType)
 * but the actual content data hasn't changed.
 *
 * Why this is necessary:
 * - AnnotationHighlighter modifies the DOM directly (adds <mark> elements)
 * - When React re-renders, it tries to reconcile virtual DOM with actual DOM
 * - But the actual DOM has been modified, causing "insertBefore" errors
 *
 * What we compare (DATA props only):
 * - report, dimensions, evidence, isLoading - core data
 * - annotations - content comparison via JSON (parent creates new array each render)
 *
 * What we DON'T compare:
 * - highlightedAnnotationId - handled by AnnotationHighlighter via CSS classes
 * - Callback functions (onEditChapter, onAIEdit, etc.) - parent uses inline functions,
 *   creating new references each render, but logic is the same
 */
function arePropsEqual(
  prevProps: ChapterizedReportViewProps,
  nextProps: ChapterizedReportViewProps
): boolean {
  // Compare DATA props only, not callbacks or highlightedAnnotationId
  // Callbacks are inline functions in parent, always new references but same logic

  // Quick reference checks for data props
  if (prevProps.report !== nextProps.report) return false;
  if (prevProps.dimensions !== nextProps.dimensions) return false;
  if (prevProps.evidence !== nextProps.evidence) return false;
  if (prevProps.isLoading !== nextProps.isLoading) return false;

  // Deep compare annotations (parent does .map() creating new array each time)
  const prevAnnotations = prevProps.annotations || [];
  const nextAnnotations = nextProps.annotations || [];
  if (prevAnnotations.length !== nextAnnotations.length) return false;

  // Compare annotation contents (not reference)
  for (let i = 0; i < prevAnnotations.length; i++) {
    const prev = prevAnnotations[i];
    const next = nextAnnotations[i];
    if (
      prev.id !== next.id ||
      prev.selectedText !== next.selectedText ||
      prev.color !== next.color
    ) {
      return false;
    }
  }

  // All data props are equal - skip re-render
  // highlightedAnnotationId and callbacks intentionally NOT compared
  return true;
}

function ChapterizedReportViewInner({
  report,
  dimensions,
  evidence = [],
  isLoading = false,
  onEditChapter,
  onAIEditChapter,
  onAIEdit,
  onAddAnnotation,
  annotations = [],
  highlightedAnnotationId,
}: ChapterizedReportViewProps) {
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('preview');
  const [editContent, setEditContent] = useState('');
  const [isAIProcessing, setIsAIProcessing] = useState(false);

  // Ref for preview container (used by context menu and AnnotationHighlighter)
  const previewRef = useRef<HTMLDivElement>(null);
  // Ref for edit container (used by context menu in edit mode)
  const editContainerRef = useRef<HTMLDivElement>(null);

  // Handle AI edit from context menu
  const handleAIEditFromMenu = useCallback(
    async (operation: AIEditOperation, selectedText: string) => {
      if (!onAIEdit) return;
      setIsAIProcessing(true);
      try {
        await onAIEdit(operation, selectedText);
      } finally {
        setIsAIProcessing(false);
      }
    },
    [onAIEdit]
  );

  // TipTap editor for rich text mode
  const tiptapEditor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: '开始编辑章节内容...',
      }),
      Typography,
    ],
    content: '',
    editable: true,
    onUpdate: ({ editor }) => {
      // Convert HTML to Markdown and update editContent
      const html = editor.getHTML();
      const markdown = turndownService.turndown(html);
      setEditContent(markdown);
    },
    editorProps: {
      attributes: {
        class: 'prose prose-gray max-w-none focus:outline-none min-h-full p-6',
      },
    },
  });

  // Update TipTap editor when switching to edit mode or when chapter changes
  useEffect(() => {
    if (viewMode === 'edit' && tiptapEditor && editContent) {
      const html = markdownToHtml(editContent);
      tiptapEditor.commands.setContent(html);
    }
  }, [viewMode, tiptapEditor, selectedChapter?.id]);

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

  // ★ Navigate to highlighted annotation when it changes
  // Auto-select the chapter containing the annotation and switch to preview mode
  // Note: Actual scrolling is handled by AnnotationHighlighter component
  useEffect(() => {
    if (!highlightedAnnotationId) return;

    // Find the annotation
    const annotation = annotations.find(
      (a) => a.id === highlightedAnnotationId
    );
    if (!annotation) return;

    // Find which chapter contains this annotation text
    const chapterWithAnnotation = chapters.find((chapter) =>
      chapter.content.includes(annotation.selectedText)
    );

    // If found and different from current, select that chapter
    if (
      chapterWithAnnotation &&
      chapterWithAnnotation.id !== selectedChapter?.id
    ) {
      setSelectedChapter(chapterWithAnnotation);
    }

    // Switch to preview mode if in edit mode
    if (viewMode === 'edit') {
      setViewMode('preview');
    }
  }, [
    highlightedAnnotationId,
    chapters,
    annotations,
    selectedChapter?.id,
    viewMode,
  ]);

  // Open chapter for viewing/editing
  const openChapter = useCallback((chapter: Chapter) => {
    setSelectedChapter(chapter);
    setEditContent(chapter.content);
    setViewMode('preview');
  }, []);

  // Close chapter panel
  const closeChapter = useCallback(() => {
    setSelectedChapter(null);
    setViewMode('preview');
    setEditContent('');
  }, []);

  // Save edit
  const saveEdit = useCallback(() => {
    if (selectedChapter && onEditChapter) {
      onEditChapter(selectedChapter.id, editContent);
    }
    setViewMode('preview');
  }, [selectedChapter, editContent, onEditChapter]);

  // Cancel editing (reset content and return to preview)
  const cancelEdit = useCallback(() => {
    if (selectedChapter) {
      setEditContent(selectedChapter.content);
    }
    setViewMode('preview');
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

  // If a chapter is selected, show ONLY the chapter content (full screen)
  if (selectedChapter) {
    return (
      <div className="flex h-full flex-col bg-white">
        {/* Header with back button */}
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <div className="flex items-center gap-3">
            {/* Back button */}
            <button
              onClick={closeChapter}
              className="flex items-center gap-1 rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              title="返回章节列表"
            >
              <BackIcon className="h-5 w-5" />
            </button>
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
            {/* View Mode Switcher - consistent with continuous view */}
            <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
              <button
                onClick={() => setViewMode('preview')}
                className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-sm transition-colors ${
                  viewMode === 'preview'
                    ? 'bg-white font-medium text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <EyeIcon className="h-4 w-4" />
                预览
              </button>
              <button
                onClick={() => setViewMode('edit')}
                className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-sm transition-colors ${
                  viewMode === 'edit'
                    ? 'bg-white font-medium text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <EditIcon className="h-4 w-4" />
                编辑
              </button>
              <button
                onClick={() => setViewMode('source')}
                className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-sm transition-colors ${
                  viewMode === 'source'
                    ? 'bg-white font-medium text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <CodeIcon className="h-4 w-4" />
              </button>
            </div>

            {/* Save/Cancel buttons when editing */}
            {(viewMode === 'edit' || viewMode === 'source') && (
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
          </div>
        </div>

        {/* TipTap toolbar (only in edit mode) */}
        {viewMode === 'edit' && tiptapEditor && (
          <div className="flex items-center gap-1 border-b border-gray-100 bg-gray-50 px-4 py-1.5">
            <button
              onClick={() => tiptapEditor.chain().focus().toggleBold().run()}
              className={`rounded p-1.5 ${
                tiptapEditor.isActive('bold')
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-200'
              }`}
              title="粗体 (Ctrl+B)"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 4h8a4 4 0 014 4 4 4 0 01-4 4H6V4zm0 8h9a4 4 0 014 4 4 4 0 01-4 4H6v-8z"
                />
              </svg>
            </button>
            <button
              onClick={() => tiptapEditor.chain().focus().toggleItalic().run()}
              className={`rounded p-1.5 ${
                tiptapEditor.isActive('italic')
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-200'
              }`}
              title="斜体 (Ctrl+I)"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 4h4m-2 0v16m-4 0h8"
                />
              </svg>
            </button>
            <div className="mx-1 h-4 w-px bg-gray-300" />
            <button
              onClick={() =>
                tiptapEditor.chain().focus().toggleHeading({ level: 2 }).run()
              }
              className={`rounded p-1.5 ${
                tiptapEditor.isActive('heading', { level: 2 })
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-200'
              }`}
              title="标题"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h7"
                />
              </svg>
            </button>
            <button
              onClick={() =>
                tiptapEditor.chain().focus().toggleBulletList().run()
              }
              className={`rounded p-1.5 ${
                tiptapEditor.isActive('bulletList')
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-200'
              }`}
              title="列表"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 10h16M4 14h16M4 18h16"
                />
              </svg>
            </button>
            <div className="mx-1 h-4 w-px bg-gray-300" />
            <button
              onClick={() =>
                tiptapEditor.chain().focus().toggleBlockquote().run()
              }
              className={`rounded px-2 py-1 text-xs ${
                tiptapEditor.isActive('blockquote')
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-200'
              }`}
              title="引用"
            >
              引用
            </button>
            <button
              onClick={() =>
                tiptapEditor.chain().focus().toggleCodeBlock().run()
              }
              className={`rounded px-2 py-1 text-xs ${
                tiptapEditor.isActive('codeBlock')
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-200'
              }`}
              title="代码块"
            >
              代码
            </button>
            <div className="mx-1 h-4 w-px bg-gray-300" />
            <button
              onClick={() => tiptapEditor.chain().focus().undo().run()}
              disabled={!tiptapEditor.can().undo()}
              className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-200 disabled:opacity-50"
              title="撤销"
            >
              撤销
            </button>
            <button
              onClick={() => tiptapEditor.chain().focus().redo().run()}
              disabled={!tiptapEditor.can().redo()}
              className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-200 disabled:opacity-50"
              title="重做"
            >
              重做
            </button>
          </div>
        )}

        {/* Chapter Content - Full Screen */}
        <div className="flex-1 overflow-auto">
          {viewMode === 'edit' ? (
            <div ref={editContainerRef} className="h-full bg-white p-6">
              {/* Apply same prose styling as preview mode for consistent appearance */}
              <EditorContent
                editor={tiptapEditor}
                className="prose prose-gray prose-headings:font-semibold prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg prose-h4:text-base prose-h5:text-sm prose-h6:text-sm prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-1 prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline prose-code:text-purple-600 prose-code:bg-purple-50 prose-code:px-1 prose-code:rounded max-w-none"
              />
              {/* ★ 右键菜单 - 编辑模式 */}
              <TextSelectionContextMenu
                containerRef={editContainerRef}
                onAIEdit={onAIEdit ? handleAIEditFromMenu : undefined}
                onAddAnnotation={onAddAnnotation}
                isAIProcessing={isAIProcessing}
              />
            </div>
          ) : viewMode === 'source' ? (
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="font-mono h-full w-full resize-none border-none p-6 text-sm focus:outline-none"
              placeholder="编辑 Markdown 源码..."
            />
          ) : (
            // Stable content wrapper - key only changes when content changes
            // This prevents React reconciliation conflicts with DOM modifications
            <div
              key={`preview-${selectedChapter?.id || 'none'}-${annotations?.length || 0}`}
              ref={previewRef}
              className="p-6"
            >
              {/* Memoized content - does NOT depend on highlightedAnnotationId */}
              {/* This prevents re-renders when only the highlight state changes */}
              {useMemo(
                () =>
                  sources.length > 0 ? (
                    <CitedMarkdown
                      content={selectedChapter.content || '暂无内容'}
                      sources={sources}
                    />
                  ) : (
                    <article className="prose prose-sm prose-gray max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {selectedChapter.content || '暂无内容'}
                      </ReactMarkdown>
                    </article>
                  ),
                [selectedChapter.content, sources]
              )}

              {/* ★ 右键菜单 - 与连续视图保持一致 */}
              <TextSelectionContextMenu
                containerRef={previewRef}
                onAIEdit={onAIEdit ? handleAIEditFromMenu : undefined}
                onAddAnnotation={onAddAnnotation}
                isAIProcessing={isAIProcessing}
              />

              {/* DOM-based annotation highlighter for cross-paragraph support */}
              {/* Receives highlightedAnnotationId but only updates CSS classes, not DOM structure */}
              <AnnotationHighlighter
                containerRef={previewRef}
                annotations={annotations || []}
                highlightedAnnotationId={highlightedAnnotationId}
                content={selectedChapter.content || ''}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  // Chapter List View (when no chapter is selected)
  return (
    <div className="flex h-full flex-col">
      {/* Stats Header */}
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div className="text-sm text-gray-500">
          共 {stats.total} 章 · {stats.completed} 已完成 ·{' '}
          {stats.totalWords.toLocaleString()} 字
        </div>
      </div>

      {/* Chapter Cards */}
      <div className="flex-1 overflow-auto p-4">
        <div className="space-y-2">
          {chapters.map((chapter) => (
            <button
              key={chapter.id}
              onClick={() => openChapter(chapter)}
              className="block w-full rounded-xl border border-gray-100 bg-white p-4 text-left transition-all hover:border-blue-200 hover:bg-blue-50/50"
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
    </div>
  );
}

/**
 * Memoized ChapterizedReportView
 *
 * Uses custom comparison to prevent re-renders when only highlightedAnnotationId changes.
 * This is critical to avoid React DOM reconciliation conflicts with AnnotationHighlighter's
 * direct DOM manipulation.
 */
export const ChapterizedReportView = memo(
  ChapterizedReportViewInner,
  arePropsEqual
);
