'use client';

/**
 * Report Editor Component
 *
 * v8.0 报告编辑器:
 * - 三种视图模式（预览/编辑/分屏）
 * - 章节/小节多层级结构
 * - AI 浮动工具栏（选中文本时显示）
 * - AI 编辑预览对话框
 *
 * 参考 PRD: docs/prd/topic-research-report-editing.md
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { TopicReport } from '@/types/topic-research';
import { AIFloatingToolbar } from './AIFloatingToolbar';
import { AIEditPreviewDialog } from './AIEditPreviewDialog';
import type { AIEditOperation, TextSelection } from './types';

// View modes
type ViewMode = 'preview' | 'edit' | 'split';

interface ReportEditorProps {
  report: TopicReport | null;
  isLoading?: boolean;
  onSave?: (content: string) => Promise<void>;
  onAIEdit?: (
    operation: AIEditOperation,
    selection?: string
  ) => Promise<string>;
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

const SplitIcon = ({ className }: { className?: string }) => (
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
      d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
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
  readonly description: string;
}[] = [
  { key: 'rewrite', label: '重写', description: '完全重写选中内容' },
  { key: 'polish', label: '润色', description: '优化语言表达' },
  { key: 'expand', label: '扩写', description: '补充更多细节' },
  { key: 'compress', label: '缩写', description: '精简内容' },
  { key: 'style', label: '风格', description: '调整写作风格' },
] as const;

export function ReportEditor({
  report,
  isLoading = false,
  onSave,
  onAIEdit,
}: ReportEditorProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('preview');
  const [editContent, setEditContent] = useState('');
  const [selectedText, setSelectedText] = useState('');
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [isAIProcessing, setIsAIProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  // Get markdown content from report
  const markdownContent = useMemo(() => {
    if (!report) return '';

    // Build markdown from report structure
    const parts: string[] = [];

    // Title
    if (report.title) {
      parts.push(`# ${report.title}\n`);
    }

    // Summary
    if (report.summary) {
      parts.push(`## 摘要\n\n${report.summary}\n`);
    }

    // Highlights
    if (report.highlights && report.highlights.length > 0) {
      parts.push(`## 关键洞察\n`);
      report.highlights.forEach((h) => {
        parts.push(`### ${h.title}\n\n${h.content}\n`);
      });
    }

    // Dimension analyses
    if (report.dimensionAnalyses && report.dimensionAnalyses.length > 0) {
      report.dimensionAnalyses.forEach((analysis) => {
        const dimName = analysis.dimension?.name || '维度分析';
        parts.push(`## ${dimName}\n`);

        if (analysis.summary) {
          parts.push(`${analysis.summary}\n`);
        }

        if (analysis.keyFindings && analysis.keyFindings.length > 0) {
          parts.push(`### 关键发现\n`);
          analysis.keyFindings.forEach((f) => {
            parts.push(`- ${f.finding}\n`);
          });
        }

        if (analysis.detailedContent) {
          parts.push(`\n${analysis.detailedContent}\n`);
        }
      });
    }

    return parts.join('\n') || '暂无报告内容';
  }, [report]);

  // Initialize edit content when report changes
  useEffect(() => {
    setEditContent(markdownContent);
  }, [markdownContent]);

  // Handle text selection
  const handleTextSelection = useCallback(() => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim()) {
      setSelectedText(selection.toString());
    }
  }, []);

  // Handle AI edit operation
  const handleAIEdit = useCallback(
    async (operation: AIEditOperation) => {
      if (!onAIEdit) return;

      setIsAIProcessing(true);
      try {
        const result = await onAIEdit(operation, selectedText || undefined);
        if (viewMode === 'edit' || viewMode === 'split') {
          // Replace selected text or append result
          if (selectedText && editorRef.current) {
            const start = editorRef.current.selectionStart;
            const end = editorRef.current.selectionEnd;
            const newContent =
              editContent.substring(0, start) +
              result +
              editContent.substring(end);
            setEditContent(newContent);
          } else {
            setEditContent((prev) => prev + '\n\n' + result);
          }
        }
      } catch (error) {
        console.error('AI edit failed:', error);
      } finally {
        setIsAIProcessing(false);
      }
    },
    [onAIEdit, selectedText, viewMode, editContent]
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

  // Word count
  const wordCount = useMemo(() => {
    const content = viewMode === 'edit' ? editContent : markdownContent;
    // Count Chinese characters and English words
    const chineseChars = (content.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishWords = (content.match(/[a-zA-Z]+/g) || []).length;
    return chineseChars + englishWords;
  }, [viewMode, editContent, markdownContent]);

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
          >
            <PreviewIcon className="h-4 w-4" />
            <span>预览</span>
          </button>
          <button
            onClick={() => setViewMode('edit')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              viewMode === 'edit'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <EditIcon className="h-4 w-4" />
            <span>编辑</span>
          </button>
          <button
            onClick={() => setViewMode('split')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              viewMode === 'split'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <SplitIcon className="h-4 w-4" />
            <span>分屏</span>
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">{wordCount} 字</span>

          {(viewMode === 'edit' || viewMode === 'split') && (
            <>
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

      {/* Content area */}
      <div className="flex-1 overflow-hidden">
        {viewMode === 'preview' && (
          <div
            className="h-full overflow-auto p-6"
            onMouseUp={handleTextSelection}
          >
            <article className="prose prose-gray max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {markdownContent}
              </ReactMarkdown>
            </article>
          </div>
        )}

        {viewMode === 'edit' && (
          <textarea
            ref={editorRef}
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="font-mono h-full w-full resize-none border-none p-6 text-sm focus:outline-none"
            placeholder="在此编辑报告内容..."
          />
        )}

        {viewMode === 'split' && (
          <div className="flex h-full">
            <div className="w-1/2 border-r border-gray-200">
              <textarea
                ref={editorRef}
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="font-mono h-full w-full resize-none border-none p-6 text-sm focus:outline-none"
                placeholder="在此编辑报告内容..."
              />
            </div>
            <div
              className="w-1/2 overflow-auto p-6"
              onMouseUp={handleTextSelection}
            >
              <article className="prose prose-gray max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {editContent}
                </ReactMarkdown>
              </article>
            </div>
          </div>
        )}
      </div>

      {/* AI Edit Panel */}
      {showAIPanel && (viewMode === 'edit' || viewMode === 'split') && (
        <div className="border-t border-gray-200 bg-gray-50 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500">AI 编辑:</span>
            {aiEditButtons.map((btn) => (
              <button
                key={btn.key}
                onClick={() => handleAIEdit(btn.key)}
                disabled={isAIProcessing}
                title={btn.description}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50"
              >
                {btn.label}
              </button>
            ))}
            {selectedText && (
              <span className="ml-2 text-xs text-gray-400">
                已选中 {selectedText.length} 字符
              </span>
            )}
            {isAIProcessing && (
              <span className="ml-2 flex items-center gap-1 text-xs text-purple-600">
                <div className="h-3 w-3 animate-spin rounded-full border border-purple-600 border-t-transparent" />
                AI 处理中...
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
