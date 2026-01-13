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

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Typography from '@tiptap/extension-typography';
import TurndownService from 'turndown';
import type { TopicReport } from '@/types/topic-research';
import { TextSelectionContextMenu } from './TextSelectionContextMenu';
import type { AIEditOperation } from './types';

// View modes: preview, richtext (WYSIWYG), source (raw markdown)
type ViewMode = 'preview' | 'richtext' | 'source';

// Initialize Turndown for HTML to Markdown conversion
const turndownService = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
});

// Simple markdown to HTML converter (for TipTap)
function markdownToHtml(markdown: string): string {
  let html = markdown
    // Headers
    .replace(/^### (.*$)/gm, '<h3>$1</h3>')
    .replace(/^## (.*$)/gm, '<h2>$1</h2>')
    .replace(/^# (.*$)/gm, '<h1>$1</h1>')
    // Bold and italic
    .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    // Horizontal rule
    .replace(/^---$/gm, '<hr>')
    // Lists
    .replace(/^- (.*)$/gm, '<li>$1</li>')
    .replace(/^(\d+)\. (.*)$/gm, '<li>$2</li>')
    // Line breaks
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');

  // Wrap in paragraphs if not already wrapped
  if (!html.startsWith('<')) {
    html = '<p>' + html + '</p>';
  }

  return html;
}

// Annotation type for highlighting
interface ReportAnnotation {
  id: string;
  selectedText: string;
  startOffset: number;
  endOffset: number;
  color: 'yellow' | 'green' | 'blue' | 'pink' | 'purple';
  status: 'active' | 'resolved' | 'archived';
}

interface ReportEditorProps {
  report: TopicReport | null;
  isLoading?: boolean;
  onSave?: (content: string) => Promise<void>;
  onAIEdit?: (
    operation: AIEditOperation,
    selection?: string
  ) => Promise<string>;
  onAddAnnotation?: (data: {
    selectedText: string;
    startOffset: number;
    endOffset: number;
    color: 'yellow' | 'green' | 'blue' | 'pink' | 'purple';
  }) => void;
  /** Annotations for highlighting in preview */
  annotations?: ReportAnnotation[];
  /** Currently highlighted annotation ID (for navigation) */
  highlightedAnnotationId?: string | null;
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

// Markdown toolbar icons
const BoldIcon = ({ className }: { className?: string }) => (
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
      d="M6 4h8a4 4 0 014 4 4 4 0 01-4 4H6V4zm0 8h9a4 4 0 014 4 4 4 0 01-4 4H6v-8z"
    />
  </svg>
);

const ItalicIcon = ({ className }: { className?: string }) => (
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
      d="M10 4h4m-2 0v16m-4 0h8"
    />
  </svg>
);

const HeadingIcon = ({ className }: { className?: string }) => (
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
      d="M4 6h16M4 12h16M4 18h7"
    />
  </svg>
);

const ListIcon = ({ className }: { className?: string }) => (
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
      d="M4 6h16M4 10h16M4 14h16M4 18h16"
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

// Citation badge component with hover tooltip
interface CitationBadgeProps {
  index: number;
  evidence: {
    title?: string | null;
    url?: string | null;
    snippet?: string | null;
    domain?: string | null;
  };
}

function CitationBadge({ index, evidence }: CitationBadgeProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <span
      className="relative inline-block"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <sup className="cursor-pointer rounded bg-purple-100 px-1 py-0.5 text-xs font-medium text-purple-700 transition-colors hover:bg-purple-200">
        [{index}]
      </sup>

      {isHovered && (
        <div className="absolute bottom-full left-1/2 z-50 mb-2 w-72 -translate-x-1/2 rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 border-8 border-transparent border-t-white" />
          <div className="flex items-start gap-2">
            <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-purple-100 text-xs font-bold text-purple-700">
              {index}
            </span>
            <div className="min-w-0 flex-1">
              <h4 className="line-clamp-2 text-sm font-medium text-gray-900">
                {evidence.title || '未知来源'}
              </h4>
              {evidence.snippet && (
                <p className="mt-1 line-clamp-2 text-xs text-gray-600">
                  {evidence.snippet}
                </p>
              )}
              {evidence.url && (
                <a
                  href={evidence.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                  onClick={(e) => e.stopPropagation()}
                >
                  查看来源 →
                </a>
              )}
              {evidence.domain && (
                <span className="mt-1 inline-block text-xs text-gray-400">
                  {evidence.domain}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </span>
  );
}

export function ReportEditor({
  report,
  isLoading = false,
  onSave,
  onAIEdit,
  onAddAnnotation,
  annotations = [],
  highlightedAnnotationId,
}: ReportEditorProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('preview');
  const [editContent, setEditContent] = useState('');
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [isAIProcessing, setIsAIProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement>(null);
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
    if (report?.evidence) {
      report.evidence.forEach((ev, idx) => {
        map.set(ev.id, idx + 1); // 1-based index for citations
      });
    }
    return map;
  }, [report?.evidence]);

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

    // Build markdown from report structure
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
          ? new Date(ev.publishedAt).toLocaleDateString('zh-CN')
          : '';
        const dateStr = date ? ` (${date})` : '';

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

  // Update TipTap editor when switching to richtext mode
  useEffect(() => {
    if (viewMode === 'richtext' && tiptapEditor) {
      const html = markdownToHtml(editContent);
      tiptapEditor.commands.setContent(html);
    }
  }, [viewMode, tiptapEditor]);

  // Sync TipTap content when editContent changes from source mode
  useEffect(() => {
    if (viewMode === 'source' && tiptapEditor) {
      // Mark that we need to sync when switching back to richtext
    }
  }, [editContent, viewMode, tiptapEditor]);

  // Check if we're in any edit mode
  const isEditing = viewMode === 'richtext' || viewMode === 'source';

  // Handle AI edit operation from context menu
  const handleAIEditFromMenu = useCallback(
    async (operation: AIEditOperation, selectedText: string) => {
      if (!onAIEdit) return;

      setIsAIProcessing(true);
      try {
        const result = await onAIEdit(operation, selectedText);
        if (viewMode === 'source' && editorRef.current) {
          // Replace selected text or append result
          const start = editorRef.current.selectionStart;
          const end = editorRef.current.selectionEnd;
          if (start !== end) {
            const newContent =
              editContent.substring(0, start) +
              result +
              editContent.substring(end);
            setEditContent(newContent);
          } else {
            setEditContent((prev) => prev + '\n\n' + result);
          }
        } else if (viewMode === 'richtext' && tiptapEditor) {
          // Insert at cursor or replace selection
          tiptapEditor.commands.insertContent(result);
        }
      } catch (error) {
        console.error('AI edit failed:', error);
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
      if (viewMode === 'source' && editorRef.current) {
        const start = editorRef.current.selectionStart;
        const end = editorRef.current.selectionEnd;
        selectedText = editContent.substring(start, end);
      } else if (viewMode === 'richtext' && tiptapEditor) {
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
      console.error('Save failed:', error);
    } finally {
      setIsSaving(false);
    }
  }, [onSave, editContent]);

  // Insert markdown formatting (for source mode)
  const insertMarkdown = useCallback(
    (prefix: string, suffix: string = '') => {
      if (!editorRef.current) return;

      const start = editorRef.current.selectionStart;
      const end = editorRef.current.selectionEnd;
      const selectedText = editContent.substring(start, end);

      const newContent =
        editContent.substring(0, start) +
        prefix +
        selectedText +
        suffix +
        editContent.substring(end);

      setEditContent(newContent);

      // Focus and set cursor position
      setTimeout(() => {
        if (editorRef.current) {
          editorRef.current.focus();
          const newCursorPos =
            start + prefix.length + selectedText.length + suffix.length;
          editorRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }
      }, 0);
    },
    [editContent]
  );

  // Word count
  const wordCount = useMemo(() => {
    const content = isEditing ? editContent : markdownContent;
    // Count Chinese characters and English words
    const chineseChars = (content.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishWords = (content.match(/[a-zA-Z]+/g) || []).length;
    return chineseChars + englishWords;
  }, [isEditing, editContent, markdownContent]);

  // Annotation color map for background highlights
  const annotationColorMap: Record<string, string> = {
    yellow: 'bg-yellow-200',
    green: 'bg-green-200',
    blue: 'bg-blue-200',
    pink: 'bg-pink-200',
    purple: 'bg-purple-200',
  };

  // Scroll to highlighted annotation when it changes
  useEffect(() => {
    if (highlightedAnnotationId && previewRef.current) {
      const highlightEl = previewRef.current.querySelector(
        `[data-annotation-id="${highlightedAnnotationId}"]`
      );
      if (highlightEl) {
        highlightEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [highlightedAnnotationId]);

  // Process text to add annotation highlights
  const processTextWithAnnotations = useCallback(
    (text: string): React.ReactNode => {
      if (!text || annotations.length === 0) return text;

      // Sort annotations by start position (descending) to process from end to start
      const activeAnnotations = annotations.filter(
        (a) => a.status === 'active'
      );
      if (activeAnnotations.length === 0) return text;

      // Find all annotation matches in the text
      const matches: Array<{
        start: number;
        end: number;
        annotation: ReportAnnotation;
      }> = [];

      activeAnnotations.forEach((annotation) => {
        const idx = text.indexOf(annotation.selectedText);
        if (idx !== -1) {
          matches.push({
            start: idx,
            end: idx + annotation.selectedText.length,
            annotation,
          });
        }
      });

      if (matches.length === 0) return text;

      // Sort by start position
      matches.sort((a, b) => a.start - b.start);

      // Build result with highlighted spans
      const parts: React.ReactNode[] = [];
      let lastEnd = 0;

      matches.forEach((match, idx) => {
        // Add text before this match
        if (match.start > lastEnd) {
          parts.push(text.slice(lastEnd, match.start));
        }

        // Skip overlapping matches
        if (match.start < lastEnd) return;

        const isHighlighted = match.annotation.id === highlightedAnnotationId;
        const colorClass =
          annotationColorMap[match.annotation.color] || 'bg-yellow-200';

        parts.push(
          <mark
            key={`ann-${idx}`}
            data-annotation-id={match.annotation.id}
            className={`${colorClass} ${isHighlighted ? 'ring-2 ring-purple-500 ring-offset-1' : ''} rounded px-0.5 transition-all`}
            title={`批注: ${match.annotation.selectedText.slice(0, 50)}...`}
          >
            {match.annotation.selectedText}
          </mark>
        );

        lastEnd = match.end;
      });

      // Add remaining text
      if (lastEnd < text.length) {
        parts.push(text.slice(lastEnd));
      }

      return parts;
    },
    [annotations, highlightedAnnotationId, annotationColorMap]
  );

  // Process text to convert citation patterns [1], [2] to interactive components
  const processTextWithCitations = useCallback(
    (text: string): React.ReactNode => {
      if (!text || !report?.evidence?.length) return text;

      // Match [1], [2], [1, 2] patterns
      const citationPattern = /\[(\d+(?:\s*,\s*\d+)*)\]/g;
      const parts: React.ReactNode[] = [];
      let lastIndex = 0;
      let match: RegExpExecArray | null;

      citationPattern.lastIndex = 0;

      while ((match = citationPattern.exec(text)) !== null) {
        // Add text before match
        if (match.index > lastIndex) {
          parts.push(text.slice(lastIndex, match.index));
        }

        // Parse indices
        const indices = match[1].split(/\s*,\s*/).map((s) => parseInt(s, 10));

        // Create citation badges with tooltip
        indices.forEach((idx, i) => {
          const evidence = report.evidence?.[idx - 1];
          if (evidence) {
            parts.push(
              <CitationBadge
                key={`cite-${match!.index}-${idx}-${i}`}
                index={idx}
                evidence={evidence}
              />
            );
          } else {
            // Unknown citation
            parts.push(
              <sup
                key={`cite-unknown-${match!.index}-${i}`}
                className="rounded bg-gray-100 px-1 py-0.5 text-xs text-gray-500"
              >
                [{idx}]
              </sup>
            );
          }
        });

        lastIndex = match.index + match[0].length;
      }

      // Add remaining text
      if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex));
      }

      return parts.length === 1 ? parts[0] : parts;
    },
    [report?.evidence]
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
        <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1">
          <button
            onClick={() => setViewMode('preview')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              viewMode === 'preview'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
            title="预览模式"
          >
            <PreviewIcon className="h-4 w-4" />
            <span>预览</span>
          </button>
          <button
            onClick={() => {
              // Sync content to TipTap before switching
              if (tiptapEditor) {
                const html = markdownToHtml(editContent);
                tiptapEditor.commands.setContent(html);
              }
              setViewMode('richtext');
            }}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              viewMode === 'richtext'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
            title="富文本编辑"
          >
            <RichTextIcon className="h-4 w-4" />
            <span>编辑</span>
          </button>
          <button
            onClick={() => setViewMode('source')}
            className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium transition-colors ${
              viewMode === 'source'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
            title="源码编辑 (Markdown)"
          >
            <CodeIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">{wordCount} 字</span>

          {isEditing && (
            <>
              {/* Preview button in edit mode */}
              <button
                onClick={() => setShowPreviewModal(true)}
                className="flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-200"
                title="预览 (悬浮窗口)"
              >
                <PreviewIcon className="h-4 w-4" />
                <span>预览</span>
              </button>

              <button
                onClick={() => setShowAIPanel(!showAIPanel)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  showAIPanel
                    ? 'bg-purple-100 text-purple-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <AIIcon className="h-4 w-4" />
                <span>AI 编辑</span>
              </button>

              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:bg-blue-400"
              >
                {isSaving ? '保存中...' : '保存'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Markdown toolbar (only in source mode) */}
      {viewMode === 'source' && (
        <div className="flex items-center gap-1 border-b border-gray-100 bg-gray-50 px-4 py-1.5">
          <button
            onClick={() => insertMarkdown('**', '**')}
            className="rounded p-1.5 text-gray-600 hover:bg-gray-200"
            title="粗体 (Ctrl+B)"
          >
            <BoldIcon className="h-4 w-4" />
          </button>
          <button
            onClick={() => insertMarkdown('*', '*')}
            className="rounded p-1.5 text-gray-600 hover:bg-gray-200"
            title="斜体 (Ctrl+I)"
          >
            <ItalicIcon className="h-4 w-4" />
          </button>
          <div className="mx-1 h-4 w-px bg-gray-300" />
          <button
            onClick={() => insertMarkdown('## ')}
            className="rounded p-1.5 text-gray-600 hover:bg-gray-200"
            title="标题"
          >
            <HeadingIcon className="h-4 w-4" />
          </button>
          <button
            onClick={() => insertMarkdown('- ')}
            className="rounded p-1.5 text-gray-600 hover:bg-gray-200"
            title="列表"
          >
            <ListIcon className="h-4 w-4" />
          </button>
          <div className="mx-1 h-4 w-px bg-gray-300" />
          <button
            onClick={() => insertMarkdown('[', '](url)')}
            className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-200"
            title="链接"
          >
            链接
          </button>
          <button
            onClick={() => insertMarkdown('> ')}
            className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-200"
            title="引用"
          >
            引用
          </button>
          <button
            onClick={() => insertMarkdown('```\n', '\n```')}
            className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-200"
            title="代码块"
          >
            代码
          </button>
        </div>
      )}

      {/* TipTap toolbar (only in richtext mode) */}
      {viewMode === 'richtext' && tiptapEditor && (
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
            <BoldIcon className="h-4 w-4" />
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
            <ItalicIcon className="h-4 w-4" />
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
            <HeadingIcon className="h-4 w-4" />
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
            <ListIcon className="h-4 w-4" />
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
            onClick={() => tiptapEditor.chain().focus().toggleCodeBlock().run()}
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

      {/* Content area */}
      <div className="flex-1 overflow-hidden">
        {viewMode === 'preview' && (
          <div ref={previewRef} className="h-full overflow-auto p-6">
            <article className="prose prose-gray max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  // Custom link component to open in new tab
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
                  // Process text nodes for citations and annotation highlighting
                  p: ({ children, ...props }) => (
                    <p {...props}>
                      {typeof children === 'string'
                        ? processTextWithCitations(children)
                        : Array.isArray(children)
                          ? children.map((child, i) =>
                              typeof child === 'string' ? (
                                <span key={i}>
                                  {processTextWithCitations(child)}
                                </span>
                              ) : (
                                child
                              )
                            )
                          : children}
                    </p>
                  ),
                  li: ({ children, ...props }) => (
                    <li {...props}>
                      {typeof children === 'string'
                        ? processTextWithCitations(children)
                        : Array.isArray(children)
                          ? children.map((child, i) =>
                              typeof child === 'string' ? (
                                <span key={i}>
                                  {processTextWithCitations(child)}
                                </span>
                              ) : (
                                child
                              )
                            )
                          : children}
                    </li>
                  ),
                  strong: ({ children, ...props }) => (
                    <strong {...props}>
                      {typeof children === 'string'
                        ? processTextWithCitations(children)
                        : children}
                    </strong>
                  ),
                  em: ({ children, ...props }) => (
                    <em {...props}>
                      {typeof children === 'string'
                        ? processTextWithCitations(children)
                        : children}
                    </em>
                  ),
                }}
              >
                {markdownContent}
              </ReactMarkdown>
            </article>

            {/* Context menu for preview mode */}
            <TextSelectionContextMenu
              containerRef={previewRef}
              onAIEdit={onAIEdit ? handleAIEditFromMenu : undefined}
              onAddAnnotation={onAddAnnotation}
              isAIProcessing={isAIProcessing}
            />
          </div>
        )}

        {viewMode === 'richtext' && (
          <div ref={richTextRef} className="h-full overflow-auto bg-white">
            <EditorContent editor={tiptapEditor} className="h-full" />

            {/* Context menu for richtext mode */}
            <TextSelectionContextMenu
              containerRef={richTextRef}
              onAIEdit={onAIEdit ? handleAIEditFromMenu : undefined}
              onAddAnnotation={onAddAnnotation}
              isAIProcessing={isAIProcessing}
            />
          </div>
        )}

        {viewMode === 'source' && (
          <textarea
            ref={editorRef}
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="font-mono h-full w-full resize-none border-none p-6 text-sm focus:outline-none"
            placeholder="在此编辑报告内容..."
          />
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
