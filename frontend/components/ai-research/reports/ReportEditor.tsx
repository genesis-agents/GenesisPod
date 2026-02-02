'use client';

/**
 * Report Editor Component
 *
 * v10.0 报告编辑器:
 * - 三种视图模式（预览/富文本编辑/源码编辑）
 * - 富文本编辑器（TipTap WYSIWYG）
 * - 右键上下文菜单支持（AI编辑、批注）
 * - Markdown 工具栏（源码模式）
 * - AI 浮动工具栏（选中文本时显示）
 *
 * 参考 PRD: docs/prd/topic-research-report-editing.md
 */

import { useState, useCallback, useMemo, useRef, useEffect, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Typography from '@tiptap/extension-typography';
import Highlight from '@tiptap/extension-highlight';
import type {
  TopicReport,
  TopicEvidence,
  ReportChart,
} from '@/types/topic-research';
import { TextSelectionContextMenu } from '../panels/TextSelectionContextMenu';
import { FigureRenderer, FigureGallery } from '../charts';
import type { AIEditOperation } from '../types';
import { markdownToHtml, turndownService } from '@/lib/markdown/markdownToHtml';
import { useReportTextProcessor } from '@/lib/report/useReportTextProcessor';
import { createMarkdownComponents } from '@/lib/report/createMarkdownComponents';
import { TipTapToolbar } from '../editor/TipTapToolbar';
import { ViewModeToggle } from '../editor/ViewModeToggle';
import {
  splitTextIntoSegments,
  findAnnotationMatches,
  normalizeWhitespace,
  type Annotation as PreprocessorAnnotation,
  type AnnotationColor,
} from '@/lib/annotation';
import {
  AnnotatedText,
  useScrollToAnnotation,
} from '../annotations/AnnotatedText';
import { formatDateSafe } from '@/lib/utils/date';

import { logger } from '@/lib/utils/logger';
// View modes: preview, edit (WYSIWYG)
type ViewMode = 'preview' | 'edit';

// Color mapping for annotation highlights (matches AnnotatedText component)
const ANNOTATION_COLOR_CLASSES: Record<AnnotationColor, string> = {
  yellow: 'bg-yellow-200',
  green: 'bg-green-200',
  blue: 'bg-blue-200',
  pink: 'bg-pink-200',
  purple: 'bg-purple-200',
};

/**
 * Apply annotation highlights to HTML content for TipTap editor
 * Uses the same matching algorithm as preview mode (splitTextIntoSegments)
 * to ensure consistent highlighting across modes.
 */
function applyAnnotationHighlightsToHtml(
  html: string,
  annotations: PreprocessorAnnotation[]
): string {
  if (!annotations || annotations.length === 0) {
    return html;
  }

  // SSR guard
  if (typeof document === 'undefined') return html;

  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;

  // Process each text node using the same algorithm as preview mode
  const walker = document.createTreeWalker(tempDiv, NodeFilter.SHOW_TEXT, null);
  const textNodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    textNodes.push(node as Text);
  }

  // Process text nodes in reverse order to avoid offset issues when modifying DOM
  for (let i = textNodes.length - 1; i >= 0; i--) {
    const textNode = textNodes[i];
    const text = textNode.textContent || '';
    if (!text.trim()) continue;

    // Use the same splitTextIntoSegments function as preview mode
    const segments = splitTextIntoSegments(text, annotations);

    // If no annotations found in this text node, skip
    if (segments.length === 1 && !segments[0].annotationId) {
      continue;
    }

    // Create a document fragment with the annotated segments
    const fragment = document.createDocumentFragment();
    for (const segment of segments) {
      if (segment.annotationId && segment.color) {
        // Annotated segment - wrap in <mark>
        const colorClass =
          ANNOTATION_COLOR_CLASSES[segment.color] || 'bg-yellow-200';
        const mark = document.createElement('mark');
        mark.className = `${colorClass} px-0.5 rounded annotation-highlight`;
        mark.setAttribute('data-annotation-id', segment.annotationId);
        mark.textContent = segment.text;
        fragment.appendChild(mark);
      } else {
        // Plain text segment
        fragment.appendChild(document.createTextNode(segment.text));
      }
    }

    // Replace the text node with the fragment
    textNode.parentNode?.replaceChild(fragment, textNode);
  }

  return tempDiv.innerHTML;
}

// Annotation type for highlighting
interface ReportAnnotation {
  id: string;
  selectedText: string;
  startOffset: number;
  endOffset: number;
  color: 'yellow' | 'green' | 'blue' | 'pink' | 'purple';
  status: 'active' | 'resolved' | 'archived';
  /** Context before the selection for reliable matching */
  selectorPrefix?: string;
  /** Context after the selection for reliable matching */
  selectorSuffix?: string;
}

interface ReportEditorProps {
  report: TopicReport | null;
  /** Evidence data for citation display - if not provided, falls back to report.evidence */
  evidence?: TopicEvidence[];
  isLoading?: boolean;
  onSave?: (content: string) => Promise<void>;
  /**
   * New AI edit callback - opens modal for AI editing
   * (Preferred over onAIEdit)
   */
  onOpenAIEdit?: (selection: {
    text: string;
    startOffset: number;
    endOffset: number;
    selectorPrefix?: string;
    selectorSuffix?: string;
  }) => void;
  /**
   * Legacy AI edit callback
   * @deprecated Use onOpenAIEdit instead
   */
  onAIEdit?: (
    operation: AIEditOperation,
    selection?: string
  ) => Promise<string>;
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
  /**
   * Whether to show annotation highlights in the content.
   * When false, annotations are still available for adding but not displayed as highlights.
   * This allows clean reading when annotation panel is closed.
   * Default: true (show highlights)
   */
  showAnnotationHighlights?: boolean;
}

/**
 * Custom comparison function for React.memo
 *
 * Prevents unnecessary re-renders when parent state changes (like sidePanelType)
 * but the actual content data hasn't changed.
 *
 * With React Controlled Highlighting, we now render annotations inline via React.
 * This means we need to compare:
 * - report, evidence, isLoading - core data
 * - annotations - content for highlighting
 * - highlightedAnnotationId - for scroll-to and highlight state
 *
 * What we DON'T compare:
 * - Callback functions (onSave, onAIEdit, onAddAnnotation) - parent may use inline functions
 */
function areReportEditorPropsEqual(
  prevProps: ReportEditorProps,
  nextProps: ReportEditorProps
): boolean {
  // Compare core data props
  if (prevProps.report !== nextProps.report) return false;
  if (prevProps.evidence !== nextProps.evidence) return false;
  if (prevProps.isLoading !== nextProps.isLoading) return false;

  // Compare highlightedAnnotationId (needed for React Controlled Highlighting)
  if (prevProps.highlightedAnnotationId !== nextProps.highlightedAnnotationId)
    return false;

  // Compare showAnnotationHighlights
  if (prevProps.showAnnotationHighlights !== nextProps.showAnnotationHighlights)
    return false;

  // Deep compare annotations
  const prevAnnotations = prevProps.annotations || [];
  const nextAnnotations = nextProps.annotations || [];
  if (prevAnnotations.length !== nextAnnotations.length) return false;

  for (let i = 0; i < prevAnnotations.length; i++) {
    const prev = prevAnnotations[i];
    const next = nextAnnotations[i];
    if (
      prev.id !== next.id ||
      prev.selectedText !== next.selectedText ||
      prev.color !== next.color ||
      prev.status !== next.status
    ) {
      return false;
    }
  }

  // All data props are equal - skip re-render
  return true;
}

// Icons
const PreviewIcon = ({ className }: { className?: string }) => (
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

const RichTextIcon = ({ className }: { className?: string }) => (
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

// AI Edit buttons config
const aiEditButtons: readonly {
  readonly key: AIEditOperation;
  readonly label: string;
  readonly icon: string;
  readonly description: string;
}[] = [
  {
    key: 'rewrite',
    label: '重写',
    icon: '🔄',
    description: '完全重写选中内容',
  },
  { key: 'polish', label: '润色', icon: '✨', description: '优化语言表达' },
  { key: 'expand', label: '扩写', icon: '📈', description: '补充更多细节' },
  { key: 'compress', label: '缩写', icon: '📉', description: '精简内容' },
  { key: 'style', label: '风格', icon: '🎨', description: '调整写作风格' },
] as const;

/**
 * Extract markdown from a fullReport field that may contain embedded JSON.
 * Handles two cases:
 * - Entire string is JSON: parse and extract fullText
 * - JSON block embedded within markdown: find it, extract fullText, replace inline
 */
function extractMarkdownFromJsonReport(content: string): string {
  // Case A: Entire content is JSON
  const trimmed = content.trimStart();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      const ft =
        parsed.fullText ||
        parsed.executiveSummary?.fullText ||
        (typeof parsed.executiveSummary === 'string'
          ? parsed.executiveSummary
          : null);
      if (ft && typeof ft === 'string') return ft;
    } catch {
      // Not valid JSON as a whole, may have JSON embedded
    }
  }

  // Case B: JSON block embedded in markdown
  // Look for a line starting with { followed by "executiveSummary" or "fullText"
  const jsonStartPattern = /\n(\{)\s*\n\s*"(?:executiveSummary|fullText)"/;
  const match = jsonStartPattern.exec(content);
  if (!match || match.index === undefined) return content;

  const startIdx = match.index + 1; // skip the \n, point to {
  // Find matching closing brace
  let braceCount = 0;
  let endIdx = -1;
  for (let i = startIdx; i < content.length; i++) {
    if (content[i] === '{') braceCount++;
    if (content[i] === '}') braceCount--;
    if (braceCount === 0) {
      endIdx = i + 1;
      break;
    }
  }
  if (endIdx <= startIdx) return content;

  const jsonBlock = content.slice(startIdx, endIdx);
  try {
    const parsed = JSON.parse(jsonBlock);
    const ft =
      parsed.executiveSummary?.fullText ||
      parsed.fullText ||
      (typeof parsed.executiveSummary === 'string'
        ? parsed.executiveSummary
        : null);
    if (ft && typeof ft === 'string') {
      // Replace the JSON block with the extracted markdown
      return content.slice(0, startIdx) + ft + content.slice(endIdx);
    }
  } catch {
    // JSON parse failed
  }

  return content;
}

function ReportEditorInner({
  report,
  evidence: evidenceProp,
  isLoading = false,
  onSave,
  onOpenAIEdit,
  onAIEdit,
  onAddAnnotation,
  annotations = [],
  highlightedAnnotationId,
  showAnnotationHighlights = true,
}: ReportEditorProps) {
  // Use passed evidence or fall back to report.evidence
  const evidence = evidenceProp || report?.evidence || [];
  const [viewMode, setViewMode] = useState<ViewMode>('preview');
  const [editContent, setEditContent] = useState('');
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [isAIProcessing, setIsAIProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const richTextRef = useRef<HTMLDivElement>(null);

  // TipTap editor for rich text mode
  const tiptapEditor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: '开始编辑报告...',
      }),
      Typography,
      Highlight.configure({
        multicolor: true,
        HTMLAttributes: {
          class: 'annotation-highlight',
        },
      }),
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

  // Build evidence map for citation lookup (evidenceId -> index)
  const evidenceMap = useMemo(() => {
    const map = new Map<string, number>();
    if (evidence.length > 0) {
      evidence.forEach((ev, idx) => {
        map.set(ev.id, idx + 1); // 1-based index for citations
      });
    }
    return map;
  }, [evidence]);

  // Helper to format citation references like [1][2][3]
  const formatCitations = useCallback(
    (evidenceIds: string[] | undefined) => {
      if (!evidenceIds || evidenceIds.length === 0) return '';
      const citations = evidenceIds
        .map((id) => evidenceMap.get(id))
        .filter((idx): idx is number => idx !== undefined)
        .map((idx) => `[${idx}]`)
        .join('');
      return citations ? ` ${citations}` : '';
    },
    [evidenceMap]
  );

  // Get markdown content from report - filter out placeholder text
  const markdownContent = useMemo(() => {
    if (!report) return '';

    // ★ Priority 0: Clean fullReport - extract markdown from JSON (pure or embedded)
    let resolvedFullReport = report.fullReport;
    if (resolvedFullReport) {
      resolvedFullReport = extractMarkdownFromJsonReport(resolvedFullReport);
    }

    // ★ Priority 1: Use resolvedFullReport if it's valid markdown (has chart placeholders or is long enough)
    if (resolvedFullReport && resolvedFullReport.trim().length > 100) {
      const hasChartPlaceholders = resolvedFullReport.includes('<!-- chart:');
      const looksLikeMarkdown =
        resolvedFullReport.includes('#') || resolvedFullReport.includes('**');
      if (hasChartPlaceholders || looksLikeMarkdown) {
        return resolvedFullReport;
      }
    }

    // ★ Priority 2: Build markdown from report structure (default for old reports)
    const parts: string[] = [];

    // Title
    if (report.title) {
      parts.push(`# ${report.title}\n`);
    }

    // Helper to check if content is just a placeholder
    const isPlaceholder = (text: string | undefined | null): boolean => {
      if (!text) return true;
      const trimmed = text.trim();
      // Only filter if content is EXACTLY a placeholder or very short
      return (
        trimmed === '请查看详细内容' ||
        trimmed === '详细内容待生成' ||
        trimmed === '...' ||
        trimmed.length < 5
      );
    };

    // Summary - filter placeholder
    if (report.summary && !isPlaceholder(report.summary)) {
      parts.push(`## 摘要\n\n${report.summary}\n`);
    }

    // Highlights - filter placeholders (关键发现/核心洞察)
    if (report.highlights && report.highlights.length > 0) {
      const validHighlights = report.highlights.filter(
        (h) => h.content && !isPlaceholder(h.content)
      );
      if (validHighlights.length > 0) {
        parts.push(`## 关键发现\n\n`);
        validHighlights.forEach((h, idx) => {
          // 使用带序号的列表项，突出显示
          parts.push(`**${idx + 1}. ${h.title}**\n\n${h.content}\n\n`);
        });
      }
    }

    // Dimension analyses - filter placeholders
    if (report.dimensionAnalyses && report.dimensionAnalyses.length > 0) {
      report.dimensionAnalyses.forEach((analysis, idx) => {
        const dimName = analysis.dimension?.name || `维度 ${idx + 1}`;
        parts.push(`## ${dimName}\n`);

        if (analysis.summary && !isPlaceholder(analysis.summary)) {
          parts.push(`${analysis.summary}\n`);
        }

        if (analysis.keyFindings && analysis.keyFindings.length > 0) {
          const validFindings = analysis.keyFindings.filter(
            (f) => f.finding && !isPlaceholder(f.finding)
          );
          if (validFindings.length > 0) {
            parts.push(`### 关键发现\n\n`);
            validFindings.forEach((f, fIdx) => {
              const citations = formatCitations(f.evidenceIds);
              // 使用有序列表格式，确保正确渲染
              parts.push(`${fIdx + 1}. **${f.finding}**${citations}\n\n`);
            });
          }
        }

        // Add trends with citations
        if (analysis.trends && analysis.trends.length > 0) {
          parts.push(`### 趋势\n`);
          analysis.trends.forEach((t, tIdx) => {
            const citations = formatCitations(t.evidenceIds);
            const directionMap: Record<string, string> = {
              increasing: '📈 上升',
              decreasing: '📉 下降',
              stable: '➡️ 稳定',
              emerging: '🌱 新兴',
            };
            const direction = directionMap[t.direction] || t.direction;
            parts.push(
              `${tIdx + 1}. **${direction}**: ${t.trend} (${t.timeframe})${citations}\n`
            );
          });
        }

        // Add challenges with citations
        if (analysis.challenges && analysis.challenges.length > 0) {
          parts.push(`### 挑战\n`);
          analysis.challenges.forEach((c, cIdx) => {
            const citations = formatCitations(c.evidenceIds);
            parts.push(
              `${cIdx + 1}. **${c.challenge}** - ${c.impact}${citations}\n`
            );
          });
        }

        // Add opportunities with citations
        if (analysis.opportunities && analysis.opportunities.length > 0) {
          parts.push(`### 机遇\n`);
          analysis.opportunities.forEach((o, oIdx) => {
            const citations = formatCitations(o.evidenceIds);
            parts.push(
              `${oIdx + 1}. **${o.opportunity}** - ${o.potential}${citations}\n`
            );
          });
        }

        if (
          analysis.detailedContent &&
          !isPlaceholder(analysis.detailedContent)
        ) {
          parts.push(`\n${analysis.detailedContent}\n`);
        }
      });
    }

    // Add References section with rich information
    if (report.evidence && report.evidence.length > 0) {
      parts.push(`\n---\n\n## 参考文献\n\n`);
      report.evidence.forEach((ev, idx) => {
        let domain = ev.domain;
        if (!domain) {
          try {
            domain = new URL(ev.url).hostname;
          } catch {
            domain = '来源';
          }
        }
        const date = ev.publishedAt
          ? formatDateSafe(ev.publishedAt, 'date')
          : '';
        const dateStr = date && date !== '--' ? ` (${date})` : '';

        // Reference with sequence number, clickable title, source info
        parts.push(`**[${idx + 1}]** [${ev.title}](${ev.url})\n`);
        parts.push(`*${domain}*${dateStr}\n`);

        // Add snippet/quote if available
        if (ev.snippet) {
          parts.push(
            `> ${ev.snippet.slice(0, 200)}${ev.snippet.length > 200 ? '...' : ''}\n`
          );
        }

        parts.push(`\n`);
      });
    }

    return parts.join('\n') || '暂无报告内容';
  }, [report, formatCitations]);

  // Initialize edit content when report changes
  useEffect(() => {
    setEditContent(markdownContent);
  }, [markdownContent]);

  // Convert annotations to PreprocessorAnnotation format for TipTap highlighting
  // Only include annotations if showAnnotationHighlights is true
  const tiptapAnnotations: PreprocessorAnnotation[] = useMemo(
    () =>
      showAnnotationHighlights
        ? (annotations || []).map((a) => ({
            id: a.id,
            selectedText: a.selectedText,
            startOffset: a.startOffset,
            endOffset: a.endOffset,
            selectorPrefix: a.selectorPrefix,
            selectorSuffix: a.selectorSuffix,
            color: a.color,
            status: a.status,
          }))
        : [],
    [annotations, showAnnotationHighlights]
  );

  // Update TipTap editor when switching to richtext mode or annotations change
  // Note: editContent is intentionally excluded from deps to avoid re-render loops
  // (TipTap is the source of truth for content when in richtext mode)
  useEffect(() => {
    if (viewMode === 'edit' && tiptapEditor) {
      const html = markdownToHtml(editContent);
      // Apply annotation highlights to the HTML before setting content
      const highlightedHtml = applyAnnotationHighlightsToHtml(
        html,
        tiptapAnnotations
      );
      tiptapEditor.commands.setContent(highlightedHtml);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, tiptapEditor, tiptapAnnotations]);

  const isEditing = viewMode === 'edit';

  // Handle AI edit operation from context menu
  const handleAIEditFromMenu = useCallback(
    async (operation: AIEditOperation, selectedText: string) => {
      if (!onAIEdit) return;

      setIsAIProcessing(true);
      try {
        const result = await onAIEdit(operation, selectedText);
        if (viewMode === 'edit' && tiptapEditor) {
          tiptapEditor.commands.insertContent(result);
        }
      } catch (error) {
        logger.error('AI edit failed:', error);
      } finally {
        setIsAIProcessing(false);
      }
    },
    [onAIEdit, viewMode, editContent, tiptapEditor]
  );

  // Handle AI edit operation from panel
  const handleAIEdit = useCallback(
    async (operation: AIEditOperation) => {
      if (!onAIEdit) return;

      let selectedText = '';
      if (viewMode === 'edit' && tiptapEditor) {
        const { from, to } = tiptapEditor.state.selection;
        selectedText = tiptapEditor.state.doc.textBetween(from, to);
      }

      await handleAIEditFromMenu(operation, selectedText);
    },
    [onAIEdit, viewMode, editContent, tiptapEditor, handleAIEditFromMenu]
  );

  // Handle save
  const handleSave = useCallback(async () => {
    if (!onSave) return;

    setIsSaving(true);
    try {
      await onSave(editContent);
    } catch (error) {
      logger.error('Save failed:', error);
    } finally {
      setIsSaving(false);
    }
  }, [onSave, editContent]);

  // Word count
  const wordCount = useMemo(() => {
    const content = isEditing ? editContent : markdownContent;
    // Count Chinese characters and English words
    const chineseChars = (content.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishWords = (content.match(/[a-zA-Z]+/g) || []).length;
    return chineseChars + englishWords;
  }, [isEditing, editContent, markdownContent]);

  // Automatically switch to preview mode when highlighted annotation changes
  useEffect(() => {
    if (highlightedAnnotationId && viewMode !== 'preview') {
      setViewMode('preview');
    }
  }, [highlightedAnnotationId, viewMode]);

  // Convert ReportAnnotation to PreprocessorAnnotation
  // Only include annotations if showAnnotationHighlights is true
  const preprocessorAnnotations: PreprocessorAnnotation[] = useMemo(
    () =>
      showAnnotationHighlights
        ? (annotations || []).map((a) => ({
            id: a.id,
            selectedText: a.selectedText,
            startOffset: a.startOffset,
            endOffset: a.endOffset,
            selectorPrefix: a.selectorPrefix,
            selectorSuffix: a.selectorSuffix,
            color: a.color,
            status: a.status,
          }))
        : [],
    [annotations, showAnnotationHighlights]
  );

  // Hook for scrolling to annotations
  const scrollToAnnotation = useScrollToAnnotation();

  // Handle annotation click - scroll to annotation panel
  const handleAnnotationClick = useCallback((annotationId: string) => {
    // Dispatch custom event for annotation panel to handle
    window.dispatchEvent(
      new CustomEvent('annotation-click', { detail: { annotationId } })
    );
  }, []);

  // Use shared hook for text processing with citations and annotations
  const { processText, processTextWithCitations } = useReportTextProcessor({
    evidence,
    preprocessorAnnotations,
    highlightedAnnotationId: highlightedAnnotationId ?? null,
    onAnnotationClick: handleAnnotationClick,
  });

  // Handle scroll to annotation when highlightedAnnotationId changes
  useEffect(() => {
    if (highlightedAnnotationId && previewRef.current) {
      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => {
        scrollToAnnotation(highlightedAnnotationId, previewRef.current!);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [highlightedAnnotationId, scrollToAnnotation]);

  // ★ Parse markdown content and extract chart placeholders
  // Chart placeholders format: <!-- chart:chart-id -->
  const contentSegments = useMemo(() => {
    if (!markdownContent) return [];

    // Split by chart placeholder pattern
    const chartPattern = /<!--\s*chart:([a-zA-Z0-9_-]+)\s*-->/g;
    const segments: Array<{ type: 'markdown' | 'chart'; content: string }> = [];

    let lastIndex = 0;
    let match;
    // ★ 防止同一 chart ID 被多次渲染
    const seenChartIds = new Set<string>();

    while ((match = chartPattern.exec(markdownContent)) !== null) {
      // Add markdown segment before the chart
      if (match.index > lastIndex) {
        segments.push({
          type: 'markdown',
          content: markdownContent.slice(lastIndex, match.index),
        });
      }

      const chartId = match[1];
      // ★ 同一 ID 只渲染第一次出现，后续跳过
      if (!seenChartIds.has(chartId)) {
        seenChartIds.add(chartId);
        segments.push({
          type: 'chart',
          content: chartId,
        });
      }

      lastIndex = match.index + match[0].length;
    }

    // Add remaining markdown content
    if (lastIndex < markdownContent.length) {
      segments.push({
        type: 'markdown',
        content: markdownContent.slice(lastIndex),
      });
    }

    return segments;
  }, [markdownContent]);

  // ★ Create charts map for quick lookup
  const chartsMap = useMemo(() => {
    const map = new Map<string, ReportChart>();
    if (report?.charts) {
      for (const chart of report.charts) {
        map.set(chart.id, chart);
      }
    }
    return map;
  }, [report?.charts]);

  // ★ Track which charts have been rendered inline
  const renderedChartIds = useMemo(() => {
    const ids = new Set<string>();
    for (const segment of contentSegments) {
      if (segment.type === 'chart') {
        ids.add(segment.content);
      }
    }
    return ids;
  }, [contentSegments]);

  // ★ 性能优化：memoize 未渲染的图表（未在正文中内联显示的），按 ID 去重
  const unrenderedCharts = useMemo(() => {
    if (!report?.charts) return [];
    const seen = new Set<string>();
    return report.charts.filter((chart) => {
      if (renderedChartIds.has(chart.id) || seen.has(chart.id)) return false;
      seen.add(chart.id);
      return true;
    });
  }, [report?.charts, renderedChartIds]);

  // ★ ReactMarkdown component for rendering markdown segments
  const renderMarkdownSegment = useCallback(
    (content: string, key: string) => (
      <ReactMarkdown
        key={key}
        remarkPlugins={[remarkGfm]}
        components={createMarkdownComponents(processText)}
      >
        {content}
      </ReactMarkdown>
    ),
    [processText]
  );

  // ★ ReactMarkdown content with React Controlled Highlighting and inline charts
  // Annotations are now rendered inline via processText → AnnotatedText component
  // This eliminates DOM manipulation conflicts that caused React error #310
  const memoizedMarkdownContent = useMemo(
    () => (
      <article className="prose prose-gray max-w-none">
        {contentSegments.map((segment, index) => {
          if (segment.type === 'markdown') {
            return renderMarkdownSegment(segment.content, `md-${index}`);
          } else {
            // Render chart (supports both reference images and generated charts)
            const chart = chartsMap.get(segment.content);
            if (chart) {
              return (
                <div key={`chart-${index}`} className="my-6">
                  <FigureRenderer chart={chart} />
                </div>
              );
            }
            // Chart not found, render placeholder
            return (
              <div
                key={`chart-missing-${index}`}
                className="my-6 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-center text-sm text-gray-500"
              >
                图表未找到: {segment.content}
              </div>
            );
          }
        })}
      </article>
    ),
    [contentSegments, chartsMap, renderMarkdownSegment]
  );

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

  if (!report) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500">暂无报告</p>
          <p className="mt-1 text-sm text-gray-400">开始研究后将在此显示报告</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2">
        {/* View mode toggle */}
        <ViewModeToggle
          modes={[
            {
              key: 'preview',
              label: '预览',
              icon: <PreviewIcon className="h-4 w-4" />,
            },
            {
              key: 'edit',
              label: '编辑',
              icon: <RichTextIcon className="h-4 w-4" />,
            },
          ]}
          activeMode={viewMode}
          onModeChange={(mode) => {
            if (mode === 'edit' && tiptapEditor) {
              const html = markdownToHtml(editContent);
              tiptapEditor.commands.setContent(html);
            }
            setViewMode(mode as ViewMode);
          }}
        />

        {/* Actions */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{wordCount} 字</span>

          {isEditing && (
            <>
              <button
                onClick={() => setShowPreviewModal(true)}
                className="rounded-lg p-1.5 text-gray-600 transition-colors hover:bg-gray-100"
                title="预览"
              >
                <PreviewIcon className="h-4 w-4" />
              </button>

              <button
                onClick={() => setShowAIPanel(!showAIPanel)}
                className={`rounded-lg p-1.5 transition-colors ${
                  showAIPanel
                    ? 'bg-purple-100 text-purple-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
                title="AI 编辑"
              >
                <AIIcon className="h-4 w-4" />
              </button>

              <button
                onClick={handleSave}
                disabled={isSaving}
                className="rounded-lg bg-blue-600 p-1.5 text-white transition-colors hover:bg-blue-700 disabled:bg-blue-400"
                title={isSaving ? '保存中...' : '保存'}
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
                    d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
                  />
                </svg>
              </button>
            </>
          )}
        </div>
      </div>

      {/* TipTap toolbar (only in edit mode) */}
      {viewMode === 'edit' && tiptapEditor && (
        <TipTapToolbar editor={tiptapEditor} />
      )}

      {/* Content area */}
      <div className="flex-1 overflow-hidden">
        {viewMode === 'preview' && (
          <div
            ref={previewRef}
            className="relative h-full overflow-y-auto overflow-x-hidden p-6"
          >
            {/* Mode indicator */}
            <div className="absolute right-6 top-6 z-10">
              <span className="flex items-center gap-1 rounded-full bg-blue-100 px-2 py-1 text-xs text-blue-700">
                <PreviewIcon className="h-3 w-3" />
                预览模式
              </span>
            </div>

            {/* Markdown content with React Controlled annotation highlighting */}
            {memoizedMarkdownContent}

            {/* Charts Section - 仅显示未在正文中渲染的图表（向后兼容旧报告） */}
            {unrenderedCharts.length > 0 && (
              <div className="mt-8 border-t border-gray-200 pt-6">
                <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
                  <svg
                    className="h-5 w-5 text-blue-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                    />
                  </svg>
                  数据可视化
                </h3>
                <FigureGallery charts={unrenderedCharts} columns={2} />
              </div>
            )}

            {/* Context menu for preview mode */}
            <TextSelectionContextMenu
              containerRef={previewRef}
              onOpenAIEdit={onOpenAIEdit}
              onAIEdit={onAIEdit ? handleAIEditFromMenu : undefined}
              onAddAnnotation={onAddAnnotation}
              isAIProcessing={isAIProcessing}
            />
          </div>
        )}

        {viewMode === 'edit' && (
          <div
            ref={richTextRef}
            className="relative h-full overflow-auto border-l-4 border-amber-300 bg-amber-50/30 p-6"
          >
            {/* Mode indicator */}
            <div className="absolute right-6 top-6 z-10">
              <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-700">
                <RichTextIcon className="h-3 w-3" />
                编辑模式
              </span>
            </div>

            {/* Apply same prose styling as preview mode for consistent appearance */}
            <EditorContent
              editor={tiptapEditor}
              className="prose prose-gray prose-headings:font-semibold prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg prose-h4:text-base prose-h5:text-sm prose-h6:text-sm prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-1 prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline prose-code:text-purple-600 prose-code:bg-purple-50 prose-code:px-1 prose-code:rounded max-w-none"
            />

            {/* Context menu for richtext mode */}
            <TextSelectionContextMenu
              containerRef={richTextRef}
              onOpenAIEdit={onOpenAIEdit}
              onAIEdit={onAIEdit ? handleAIEditFromMenu : undefined}
              onAddAnnotation={onAddAnnotation}
              isAIProcessing={isAIProcessing}
            />
          </div>
        )}
      </div>

      {/* AI Edit Panel */}
      {showAIPanel && isEditing && (
        <div className="border-t border-gray-200 bg-gray-50 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500">AI 编辑:</span>
            {aiEditButtons.map((btn) => (
              <button
                key={btn.key}
                onClick={() => handleAIEdit(btn.key)}
                disabled={isAIProcessing}
                title={btn.description}
                className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50"
              >
                <span>{btn.icon}</span>
                {btn.label}
              </button>
            ))}
            {isAIProcessing && (
              <span className="ml-2 flex items-center gap-1 text-xs text-purple-600">
                <div className="h-3 w-3 animate-spin rounded-full border border-purple-600 border-t-transparent" />
                AI 处理中...
              </span>
            )}
          </div>
        </div>
      )}

      {/* Preview Modal (floating preview) */}
      {showPreviewModal && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30"
            onClick={() => setShowPreviewModal(false)}
          />
          <div className="fixed right-4 top-20 z-50 max-h-[80vh] w-[500px] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
              <span className="text-sm font-medium text-gray-700">预览</span>
              <button
                onClick={() => setShowPreviewModal(false)}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
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
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <div className="max-h-[calc(80vh-48px)] overflow-auto p-4">
              <article className="prose prose-gray prose-sm max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    a: ({ href, children }) => (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        {children}
                      </a>
                    ),
                  }}
                >
                  {editContent}
                </ReactMarkdown>
              </article>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Memoized ReportEditor
 *
 * Uses custom comparison to prevent re-renders when only highlightedAnnotationId
 * or callback references change. This is critical to avoid React DOM reconciliation
 * conflicts with AnnotationHighlighter's direct DOM manipulation.
 */
export const ReportEditor = memo(ReportEditorInner, areReportEditorPropsEqual);
