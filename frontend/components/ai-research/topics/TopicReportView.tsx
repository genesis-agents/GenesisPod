'use client';

/**
 * Topic Report View - 报告显示组件
 *
 * 负责展示报告内容，支持两种视图模式：
 * 1. 连续视图 (continuous) - 整篇报告滚动
 * 2. 章节视图 (chapter) - 分章节导航
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { X, RefreshCw } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import {
  aiEditReport,
  regenerateReportContent,
  type AIEditOperation as AIEditOperationType,
} from '@/lib/api/topic-research';
import { createFeedbackFromAnnotation } from '@/lib/api/research-feedback';
import { ReportEditPanel } from '../reports/ReportEditPanel';
import { ChapterizedReportView } from '../reports/ChapterizedReportView';
import { ReportRevisionHistory } from '../reports/ReportRevisionHistory';
import { ReportAnnotations } from '../annotations/ReportAnnotations';
import { useTopicContent } from './TopicContentContext';
import type { ReportAnnotation } from './TopicContentContext';

import { logger } from '@/lib/utils/logger';
// Icons
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

const DocumentIcon = ({ className }: { className?: string }) => (
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
      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
    />
  </svg>
);

const HistoryIcon = ({ className }: { className?: string }) => (
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

type ReportViewMode = 'continuous' | 'chapter';
type SidePanelType = null | 'history' | 'annotations';

interface TopicReportViewProps {
  onOpenAIEdit: (selection: {
    text: string;
    startOffset: number;
    endOffset: number;
    selectorPrefix?: string;
    selectorSuffix?: string;
  }) => void;
  onAIEdit: (
    operation: string,
    selection?: { text: string } | string
  ) => Promise<string>;
}

export function TopicReportView({
  onOpenAIEdit,
  onAIEdit,
}: TopicReportViewProps) {
  const { t } = useTranslation();
  const {
    topicId,
    report,
    dimensions,
    evidence,
    isLoadingReport,
    annotations,
    highlightedAnnotationId,
    setHighlightedAnnotationId,
    revisions,
    currentUserId,
    currentUserName,
    onAnnotationAdd,
    onAnnotationUpdate,
    onAnnotationDelete,
    onAnnotationResolve,
    onAnnotationReply,
    onRollbackVersion,
  } = useTopicContent();

  const [reportViewMode, setReportViewMode] =
    useState<ReportViewMode>('continuous');
  const [sidePanelType, setSidePanelType] = useState<SidePanelType>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);

  const reportContentRef = useRef<HTMLDivElement>(null);

  // ★ 将批注提交为反馈
  const handleSubmitFeedback = useCallback(
    async (annotationId: string) => {
      try {
        await createFeedbackFromAnnotation(annotationId);
        onAnnotationResolve?.(annotationId);
        logger.info('Annotation submitted as feedback:', annotationId);
      } catch (error) {
        logger.error('Failed to submit annotation as feedback:', error);
      }
    },
    [onAnnotationResolve]
  );

  // Handle regenerate report content
  const handleRegenerateReport = useCallback(async () => {
    if (!topicId || !report?.id || isRegenerating) return;

    setIsRegenerating(true);
    try {
      await regenerateReportContent(topicId, report.id);
      // 刷新页面以获取新内容
      window.location.reload();
    } catch (error) {
      logger.error('Failed to regenerate report:', error);
      alert('重新生成报告失败，请稍后重试');
    } finally {
      setIsRegenerating(false);
    }
  }, [topicId, report?.id, isRegenerating]);

  // Handle AI edit for report
  const handleAIEdit = useCallback(
    async (operation: string, selection?: { text: string } | string) => {
      if (!topicId || !report?.id) {
        logger.error('Cannot AI edit: missing topicId or reportId');
        return '';
      }
      try {
        const result = await aiEditReport(topicId, report.id, {
          operation: operation as AIEditOperationType,
          selectedText:
            typeof selection === 'string'
              ? selection
              : selection?.text || undefined,
        });
        return result.editedContent || '';
      } catch (error) {
        logger.error('AI edit failed:', error);
        return '';
      }
    },
    [topicId, report?.id]
  );

  // Handle annotation add
  const handleAnnotationAdd = useCallback(
    (data: {
      selectedText: string;
      startOffset: number;
      endOffset: number;
      color: ReportAnnotation['color'];
    }) => {
      onAnnotationAdd({
        reportId: report?.id || '',
        userId: currentUserId || 'anonymous',
        userName: currentUserName,
        selectedText: data.selectedText,
        content: '',
        startOffset: data.startOffset,
        endOffset: data.endOffset,
        color: data.color,
        status: 'active',
      });
    },
    [report?.id, currentUserId, currentUserName, onAnnotationAdd]
  );

  // Adapter for ChapterizedReportView onAddAnnotation
  const handleChapterAnnotationAdd = useCallback(
    (data: {
      selectedText: string;
      startOffset: number;
      endOffset: number;
      color: 'yellow' | 'green' | 'blue' | 'pink' | 'purple';
      selectorPrefix?: string;
      selectorSuffix?: string;
    }) => {
      handleAnnotationAdd({
        selectedText: data.selectedText,
        startOffset: data.startOffset,
        endOffset: data.endOffset,
        color: data.color,
      });
    },
    [handleAnnotationAdd]
  );

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/50 px-4 py-2.5">
        {/* Left: View mode + version info */}
        <div className="flex items-center gap-3">
          {/* View mode toggle */}
          <div className="flex rounded-lg border border-gray-200 bg-white p-0.5">
            <button
              onClick={() => setReportViewMode('continuous')}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                reportViewMode === 'continuous'
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              title="连续视图"
            >
              <ListIcon className="h-3.5 w-3.5" />
              <span>连续</span>
            </button>
            <button
              onClick={() => setReportViewMode('chapter')}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                reportViewMode === 'chapter'
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              title="章节视图"
            >
              <DocumentIcon className="h-3.5 w-3.5" />
              <span>章节</span>
            </button>
          </div>
          {report && (
            <span className="text-xs text-gray-400">
              v{report.version} · {report.totalSources}源
            </span>
          )}
        </div>

        {/* Center: Report title */}
        <div className="flex-1 text-center">
          <h3 className="text-sm font-semibold text-gray-800">
            {report?.title || '洞察报告'}
          </h3>
        </div>

        {/* Right: Action buttons */}
        <div className="flex items-center gap-2">
          {/* Regenerate button */}
          <button
            onClick={handleRegenerateReport}
            disabled={isRegenerating}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            title="重新生成报告内容"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isRegenerating ? 'animate-spin' : ''}`}
            />
            <span>{isRegenerating ? '生成中...' : '重新生成'}</span>
          </button>

          {/* History button */}
          <button
            onClick={() =>
              setSidePanelType(sidePanelType === 'history' ? null : 'history')
            }
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
              sidePanelType === 'history'
                ? 'bg-blue-100 text-blue-700'
                : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            }`}
            title="版本历史"
          >
            <HistoryIcon className="h-3.5 w-3.5" />
            <span>历史</span>
            {revisions.length > 0 && (
              <span className="rounded-full bg-gray-200 px-1.5 py-0.5 text-xs">
                {revisions.length}
              </span>
            )}
          </button>

          {/* Annotations button */}
          <button
            onClick={() =>
              setSidePanelType(
                sidePanelType === 'annotations' ? null : 'annotations'
              )
            }
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
              sidePanelType === 'annotations'
                ? 'bg-purple-100 text-purple-700'
                : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            }`}
            title="批注"
          >
            <AnnotationIcon className="h-3.5 w-3.5" />
            <span>批注</span>
            {annotations.length > 0 && (
              <span className="rounded-full bg-gray-200 px-1.5 py-0.5 text-xs">
                {annotations.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Main report content */}
        <div
          ref={reportContentRef}
          className={`flex-1 overflow-hidden ${sidePanelType ? 'border-r border-gray-200' : ''}`}
        >
          {reportViewMode === 'continuous' && (
            <ReportEditPanel
              report={report}
              evidence={evidence}
              revisions={revisions}
              annotations={annotations}
              currentUserId={currentUserId || 'anonymous'}
              currentUserName={currentUserName}
              isLoading={isLoadingReport}
              hideToolbar={true}
              sidePanelType={sidePanelType}
              onSidePanelChange={setSidePanelType}
              onOpenAIEdit={onOpenAIEdit}
              onAIEdit={handleAIEdit}
              onRollback={
                onRollbackVersion
                  ? async (revisionId: string) => {
                      onRollbackVersion(revisionId);
                    }
                  : undefined
              }
              onAnnotationAdd={onAnnotationAdd}
              onAnnotationUpdate={onAnnotationUpdate}
              onAnnotationDelete={onAnnotationDelete}
              onAnnotationResolve={onAnnotationResolve}
              onAnnotationReply={onAnnotationReply}
            />
          )}

          {reportViewMode === 'chapter' && (
            <ChapterizedReportView
              report={report}
              dimensions={dimensions}
              evidence={evidence}
              isLoading={isLoadingReport}
              onOpenAIEdit={onOpenAIEdit}
              onAIEdit={handleAIEdit}
              onAddAnnotation={handleChapterAnnotationAdd}
              annotations={annotations.map((a) => ({
                id: a.id,
                selectedText: a.selectedText,
                startOffset: a.startOffset,
                endOffset: a.endOffset,
                color: a.color,
                status: a.status,
                selectorPrefix: a.selectorPrefix,
                selectorSuffix: a.selectorSuffix,
              }))}
              highlightedAnnotationId={highlightedAnnotationId}
            />
          )}

          {!report && (
            <div className="flex h-full items-center justify-center py-20 text-gray-500">
              {t('topicResearch.noReport')}
            </div>
          )}
        </div>

        {/* Side panel for history/annotations */}
        {sidePanelType === 'history' && (
          <div className="w-80 flex-shrink-0 overflow-hidden bg-white">
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
                <h3 className="text-sm font-semibold text-gray-700">
                  版本历史
                </h3>
                <button
                  onClick={() => setSidePanelType(null)}
                  className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 overflow-auto">
                <ReportRevisionHistory
                  revisions={revisions.map((rev) => ({
                    id: rev.id,
                    version: rev.version,
                    title: rev.summary || `版本 ${rev.version}`,
                    summary: rev.summary || '',
                    changeType: 'edit' as const,
                    changeDescription: rev.summary || '报告更新',
                    author: '系统',
                    createdAt:
                      typeof rev.createdAt === 'string'
                        ? rev.createdAt
                        : (rev.createdAt as Date).toISOString(),
                    wordCount: 0,
                    wordCountDelta: 0,
                  }))}
                  currentVersion={report?.version || 1}
                  isLoading={false}
                  onRollback={
                    onRollbackVersion
                      ? async (revisionId: string) => {
                          onRollbackVersion(revisionId);
                        }
                      : undefined
                  }
                />
              </div>
            </div>
          </div>
        )}

        {sidePanelType === 'annotations' && (
          <div className="w-80 flex-shrink-0 overflow-hidden bg-white">
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
                <h3 className="text-sm font-semibold text-gray-700">批注</h3>
                <button
                  onClick={() => setSidePanelType(null)}
                  className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 overflow-auto">
                <ReportAnnotations
                  annotations={annotations}
                  currentUserId={currentUserId}
                  isLoading={false}
                  onUpdate={onAnnotationUpdate}
                  onDelete={onAnnotationDelete}
                  onResolve={onAnnotationResolve}
                  onReply={onAnnotationReply}
                  onSubmitFeedback={handleSubmitFeedback}
                  onNavigate={(annotationId: string) => {
                    setHighlightedAnnotationId(annotationId);
                    setTimeout(() => {
                      setHighlightedAnnotationId(null);
                    }, 3000);
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
