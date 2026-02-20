'use client';

/**
 * AI Slides V5.0 - Right Panel (Preview Area)
 *
 * Contains:
 * - Top toolbar: Title + Export
 * - Slide preview area (scaled iframe)
 * - Page navigator
 * - Bottom collapsible AI chat panel
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Eye,
  Terminal,
  Brain,
  Download,
  ChevronDown,
  FileText,
  Loader2,
  MessageSquare,
  Send,
  CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils/common';
import { useSlidesStore, toast } from '@/stores';
import { logger } from '@/lib/utils/logger';
import { sanitizeSlideHtml } from '@/lib/utils/sanitize';
import { CodePreview } from './CodePreview';
import { ThinkingPanel } from './ThinkingPanel';
import { SavePointSelector } from './SavePointSelector';
import { PreviewToolbar } from './PreviewToolbar';
import { PageNavigator } from './PageNavigator';
import { config } from '@/lib/utils/config';
import { useI18n } from '@/lib/i18n/i18n-context';

type ViewMode = 'preview' | 'code' | 'thinking';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface RightPanelProps {
  title?: string;
  sessionId?: string;
  /** Chat messages managed by parent (SlidesWorkspace) */
  chatMessages?: ChatMessage[];
  /** True while the parent is waiting for an AI response */
  chatLoading?: boolean;
  onCheckpointRestore?: (checkpointId: string) => Promise<void>;
  onCreateCheckpoint?: () => void;
  onFactCheck?: () => Promise<void>;
  onAIEdit?: (
    action: 'fix-layout' | 'polish-content' | 'mark-edit'
  ) => Promise<void>;
  onAdvanced?: () => void;
  onSendMessage?: (message: string) => void;
  className?: string;
}

export function RightPanel({
  title,
  sessionId,
  chatMessages: chatMessagesProp = [],
  chatLoading = false,
  onCheckpointRestore,
  onCreateCheckpoint,
  onFactCheck,
  onAIEdit,
  onAdvanced,
  onSendMessage,
  className,
}: RightPanelProps) {
  const { t } = useI18n();
  const {
    pages,
    selectedPageIndex,
    setSelectedPageIndex,
    session,
    generating,
    progress,
  } = useSlidesStore();

  const completedCount = pages.filter((p) => p.status === 'completed').length;
  const totalPages = generating
    ? (progress?.totalPages ?? pages.length)
    : pages.length;
  const [viewMode, setViewMode] = useState<ViewMode>('preview');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exporting, setExporting] = useState<'pptx' | 'pdf' | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // AI chat state
  const [chatCollapsed, setChatCollapsed] = useState(true);
  const [inputValue, setInputValue] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatMessages = chatMessagesProp;

  const currentPage = pages[selectedPageIndex];
  const hasPages = pages.length > 0;

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (!chatCollapsed && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, chatCollapsed]);

  // Handle send chat message — parent (SlidesWorkspace) manages message state
  const handleSend = useCallback(() => {
    const msg = inputValue.trim();
    if (!msg || generating || chatLoading) return;

    setInputValue('');

    if (onSendMessage) {
      onSendMessage(msg);
    }
  }, [inputValue, generating, chatLoading, onSendMessage]);

  // Handle export
  const handleExport = useCallback(
    async (format: 'pptx' | 'pdf') => {
      const currentSessionId = sessionId || session?.id;
      if (!currentSessionId) {
        toast.warning(t('office.slides.pleaseGenerateFirst'));
        return;
      }

      setExporting(format);
      setShowExportMenu(false);

      try {
        const response = await fetch(
          `${config.apiUrl}/ai-office/slides/sessions/${currentSessionId}/export`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ format, quality: 'high' }),
          }
        );

        if (!response.ok) {
          throw new Error(t('office.slides.exportError'));
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `slides.${format}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        toast.success(
          t('office.slides.exportSuccess', { format: format.toUpperCase() })
        );
      } catch (error) {
        logger.error('[RightPanel] Export failed:', error);
        toast.error(t('office.slides.exportError'));
      } finally {
        setExporting(null);
      }
    },
    [sessionId, session?.id, t]
  );

  // Measure container for scaling
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setDimensions({ width, height });
        }
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Slide scaling calculations
  const SLIDE_WIDTH = 1280;
  const SLIDE_HEIGHT = 720;
  const PADDING = 48;

  const availableWidth = Math.max(dimensions.width - PADDING, 100);
  const availableHeight = Math.max(dimensions.height - PADDING, 100);
  const scale = Math.min(
    availableWidth / SLIDE_WIDTH,
    availableHeight / SLIDE_HEIGHT
  );
  const scaledWidth = Math.floor(SLIDE_WIDTH * scale);
  const scaledHeight = Math.floor(SLIDE_HEIGHT * scale);

  // Enhance HTML for rendering
  const enhanceHtml = useCallback((html: string, zoomScale: number): string => {
    const styles = `
      <style>
        * { -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
        html { zoom: ${zoomScale}; }
        body { margin: 0; padding: 0; width: ${SLIDE_WIDTH}px; height: ${SLIDE_HEIGHT}px; overflow: hidden; }
      </style>
    `;
    if (html.includes('</head>')) {
      return html.replace('</head>', styles + '</head>');
    }
    return styles + html;
  }, []);

  return (
    <div className={cn('flex flex-1 flex-col bg-slate-100', className)}>
      {/* Top Toolbar */}
      <div className="flex-shrink-0 border-b border-slate-200 bg-white px-4 py-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="min-w-0 truncate text-sm font-semibold text-slate-800">
            {title || t('office.slides.title')}
          </h2>

          {/* Progress pill */}
          {(hasPages || generating) && (
            <div
              className={cn(
                'flex flex-shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
                generating
                  ? 'bg-blue-50 text-blue-700'
                  : 'bg-green-50 text-green-700'
              )}
            >
              {generating ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3 w-3" />
              )}
              <span>
                {completedCount}/{totalPages} 页{generating ? '' : '完成'}
              </span>
            </div>
          )}

          <div className="flex flex-shrink-0 items-center gap-2">
            {/* Save Point Selector */}
            <SavePointSelector
              sessionId={sessionId}
              onRestore={onCheckpointRestore}
              onCreateNew={onCreateCheckpoint}
            />

            {/* Export Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                disabled={!hasPages || exporting !== null}
                className={cn(
                  'flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors',
                  hasPages && !exporting
                    ? 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                    : 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400'
                )}
              >
                {exporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                <span>{t('common.export')}</span>
                <ChevronDown className="h-3 w-3" />
              </button>

              {showExportMenu && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowExportMenu(false)}
                  />
                  <div className="absolute right-0 z-20 mt-2 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                    <button
                      onClick={() => handleExport('pptx')}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      <Download className="h-4 w-4" />
                      {t('office.slides.downloadPPTX')}
                    </button>
                    <button
                      onClick={() => handleExport('pdf')}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      <FileText className="h-4 w-4" />
                      {t('office.slides.downloadPDF')}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Preview Area */}
      <div
        ref={containerRef}
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4"
      >
        {viewMode === 'preview' &&
          (currentPage?.html ? (
            <div
              className="rounded-lg shadow-2xl ring-1 ring-slate-900/10"
              style={{
                width: scaledWidth,
                height: scaledHeight,
                overflow: 'hidden',
              }}
            >
              <iframe
                srcDoc={enhanceHtml(sanitizeSlideHtml(currentPage.html), scale)}
                style={{
                  width: scaledWidth,
                  height: scaledHeight,
                  border: 'none',
                  display: 'block',
                }}
                sandbox="allow-same-origin"
                title={`Slide ${selectedPageIndex + 1} preview`}
              />
            </div>
          ) : (
            <div className="text-center">
              {currentPage?.status === 'generating' ? (
                <div>
                  <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-orange-400" />
                  <p className="text-sm text-slate-500">
                    {t('office.slides.generatingPage', {
                      number: currentPage.pageNumber,
                    })}
                  </p>
                </div>
              ) : (
                <div>
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-200">
                    <Eye className="h-8 w-8 text-slate-400" />
                  </div>
                  <p className="text-sm text-slate-500">
                    {hasPages
                      ? t('office.slides.selectPageToPreview')
                      : t('office.slides.startGenerating')}
                  </p>
                </div>
              )}
            </div>
          ))}

        {viewMode === 'code' && (
          <CodePreview
            html={currentPage?.html}
            isVisible={true}
            className="h-full w-full"
          />
        )}

        {viewMode === 'thinking' && (
          <ThinkingPanel isVisible={true} className="h-full w-full" />
        )}
      </div>

      {/* Bottom Controls */}
      <div className="flex-shrink-0 border-t border-slate-200 bg-white px-4 py-3">
        {/* Tab Bar: Preview | Code | Thinking */}
        <div className="mb-3 flex items-center justify-center gap-1">
          <button
            onClick={() => setViewMode('preview')}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              viewMode === 'preview'
                ? 'bg-orange-100 text-orange-700'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
            )}
          >
            <Eye className="h-4 w-4" />
            {t('office.slides.preview')}
          </button>
          <button
            onClick={() => setViewMode('code')}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              viewMode === 'code'
                ? 'bg-orange-100 text-orange-700'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
            )}
          >
            <Terminal className="h-4 w-4" />
            {t('office.slides.code')}
          </button>
          <button
            onClick={() => setViewMode('thinking')}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              viewMode === 'thinking'
                ? 'bg-orange-100 text-orange-700'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
            )}
          >
            <Brain className="h-4 w-4" />
            {t('office.slides.thinking')}
          </button>
        </div>

        {/* Action Buttons: Fact check | AI Edit | Advanced */}
        <PreviewToolbar
          sessionId={sessionId}
          pageIndex={selectedPageIndex}
          onFactCheck={onFactCheck}
          onAIEdit={onAIEdit}
          onAdvanced={onAdvanced}
          disabled={!hasPages}
          className="mb-3"
        />

        {/* Page Navigator */}
        <PageNavigator
          currentPage={selectedPageIndex + 1}
          totalPages={pages.length}
          onPageChange={(page) => setSelectedPageIndex(page - 1)}
        />
      </div>

      {/* Bottom AI Chat Panel */}
      <div className="flex-shrink-0 border-t border-slate-200 bg-white">
        {/* Collapse/expand header */}
        <button
          onClick={() => setChatCollapsed(!chatCollapsed)}
          className="flex h-10 w-full items-center gap-2 px-4 transition-colors hover:bg-slate-50"
        >
          <MessageSquare className="h-4 w-4 text-blue-600" />
          <span className="text-sm font-medium text-slate-700">AI 修改</span>
          {chatMessages.length > 0 && (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
              {chatMessages.length}
            </span>
          )}
          <ChevronDown
            className={cn(
              'ml-auto h-4 w-4 text-slate-400 transition-transform duration-200',
              !chatCollapsed && 'rotate-180'
            )}
          />
        </button>

        {/* Expanded: messages + input */}
        {!chatCollapsed && (
          <>
            {/* Messages area */}
            <div className="h-40 overflow-y-auto border-t border-slate-100 bg-slate-50 px-4 py-2">
              {chatMessages.length === 0 ? (
                <div className="flex h-full items-center justify-center text-xs text-slate-400">
                  描述你想修改的内容，AI 将实时更新幻灯片
                </div>
              ) : (
                <div className="space-y-2">
                  {chatMessages.map((msg, i) => (
                    <div
                      key={i}
                      className={cn(
                        'rounded-lg px-3 py-2 text-sm',
                        msg.role === 'user'
                          ? 'ml-8 bg-blue-600 text-white'
                          : 'mr-8 border border-slate-200 bg-white text-slate-700'
                      )}
                    >
                      {msg.content}
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
              )}
            </div>

            {/* Input row */}
            <div className="flex gap-2 border-t border-slate-100 px-3 py-2">
              <input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="如：把第3页的标题改为..."
                className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={generating || chatLoading}
              />
              <button
                onClick={handleSend}
                disabled={!inputValue.trim() || generating || chatLoading}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-sm transition-colors',
                  inputValue.trim() && !generating && !chatLoading
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'cursor-not-allowed bg-slate-100 text-slate-400'
                )}
              >
                {chatLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default RightPanel;
