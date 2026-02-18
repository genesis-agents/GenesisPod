'use client';

/**
 * AI Slides V5.0 - Slides Workspace
 *
 * Main workspace component combining:
 * - LeftPanel (file info, suggestions, input)
 * - RightPanel (preview, controls)
 *
 * This is the PRD Section 12 layout implementation.
 */

import React, { useState, useCallback } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils/common';
import { useSlidesStore } from '@/stores';
import { useCheckpoints } from '@/hooks/features/slides';
import { LeftPanel } from './LeftPanel';
import { RightPanel } from './RightPanel';
import { SourceImportModal } from './SourceImportModal';
import type { SlidesSourceData } from '@/hooks/features/slides';
import { logger } from '@/lib/utils/logger';
import { formatDateSafe } from '@/lib/utils/date';
import { useI18n } from '@/lib/i18n/i18n-context';

interface SlidesWorkspaceProps {
  className?: string;
}

// ============================================================================
// 辅助函数
// ============================================================================

function getPhaseName(phase: string | undefined): string {
  const names: Record<string, string> = {
    task_decomposition: '分析任务',
    outline_planning: '规划大纲',
    page_rendering: '生成页面',
    quality_review: '质量检查',
  };
  return phase ? names[phase] || phase : '处理中';
}

// ============================================================================
// 分段进度条组件
// ============================================================================

interface GenerationProgressStripProps {
  completedPages: number;
  totalPages: number;
  phase: string;
}

function GenerationProgressStrip({
  completedPages,
  totalPages,
  phase,
}: GenerationProgressStripProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-slate-600">{phase}</span>
        <span className="font-medium text-orange-600">
          {completedPages}/{totalPages} 页
        </span>
      </div>
      {/* 分段进度条：每段一页 */}
      <div className="flex gap-0.5">
        {Array.from({ length: totalPages }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'h-1.5 flex-1 rounded-full transition-colors duration-300',
              i < completedPages ? 'bg-orange-500' : 'bg-slate-200'
            )}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// 主组件
// ============================================================================

export function SlidesWorkspace({ className }: SlidesWorkspaceProps) {
  const { t } = useI18n();
  const [showImportModal, setShowImportModal] = useState(false);
  // Local state for pending generation input
  const [pendingSourceText, setPendingSourceText] = useState<string>('');
  const [pendingTitle, setPendingTitle] = useState<string>('');

  const { session, pages, generating, progress } = useSlidesStore();
  const completedCount = pages.filter((p) => p.status === 'completed').length;
  const totalPages = progress?.totalPages || 10;

  const { createCheckpoint, restoreCheckpoint } = useCheckpoints();

  // Calculate file size estimate
  const estimatedFileSize =
    pages.length > 0 ? `~${(pages.length * 0.05).toFixed(1)} MB` : undefined;

  // Handle input submission
  const handleSubmit = useCallback(
    (message: string, mode: 'professional' | 'creative') => {
      // Store pending source text locally
      setPendingSourceText(message);

      // If there's a title pattern, extract it
      const titleMatch = message.match(
        /^(?:创建|生成|制作)(?:关于)?[：:]?\s*(.+?)(?:的|相关)?(?:演示文稿|PPT|幻灯片)/
      );
      if (titleMatch) {
        setPendingTitle(titleMatch[1]);
      }

      // TODO: Connect to generation flow with pendingSourceText and pendingTitle
      logger.info('[SlidesWorkspace] Submit:', { message, mode });
    },
    []
  );

  // Handle import from modal
  const handleImport = useCallback((data: SlidesSourceData) => {
    // Store the imported source text locally
    setPendingSourceText(data.sourceText);
    if (data.metadata?.title) {
      setPendingTitle(data.metadata.title);
    }
    setShowImportModal(false);
  }, []);

  // Handle suggestion execution
  const handleSuggestionExecute = useCallback(
    async (suggestion: { id: string; action: string }) => {
      logger.debug('[SlidesWorkspace] Execute suggestion:', suggestion);
      // TODO: Implement suggestion actions
    },
    []
  );

  // Handle checkpoint restore
  const handleCheckpointRestore = useCallback(
    async (checkpointId: string) => {
      await restoreCheckpoint(checkpointId);
    },
    [restoreCheckpoint]
  );

  // Handle create checkpoint
  const handleCreateCheckpoint = useCallback(() => {
    createCheckpoint(
      t('office.slides.savePoint', { time: formatDateSafe(new Date(), 'time') })
    );
  }, [createCheckpoint, t]);

  // Handle fact check
  const handleFactCheck = useCallback(async () => {
    logger.debug('[SlidesWorkspace] Fact check triggered');
    // TODO: Implement fact check via AIEditService
  }, []);

  // Handle AI edit
  const handleAIEdit = useCallback(
    async (action: 'fix-layout' | 'polish-content' | 'mark-edit') => {
      logger.debug('[SlidesWorkspace] AI Edit:', action);
      // TODO: Implement AI edit via AIEditService
    },
    []
  );

  // Handle advanced options
  const handleAdvanced = useCallback(() => {
    logger.debug('[SlidesWorkspace] Advanced options clicked');
    // TODO: Show advanced options modal
  }, []);

  return (
    <div className={cn('flex h-full', className)}>
      {/* 左侧容器：进度条 + LeftPanel */}
      <div className="flex w-[340px] flex-shrink-0 flex-col border-r border-slate-200">
        {/* 生成中：分段进度条 */}
        {generating && (
          <div className="flex-shrink-0 border-b border-slate-100 bg-white px-4 py-3">
            <GenerationProgressStrip
              completedPages={completedCount}
              totalPages={totalPages}
              phase={getPhaseName(progress?.phase)}
            />
          </div>
        )}
        {/* 已完成：绿色状态条 */}
        {!generating && pages.length > 0 && (
          <div className="flex flex-shrink-0 items-center gap-2 border-b border-green-100 bg-green-50 px-4 py-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
            <span className="text-xs text-green-700">
              全部 {pages.length} 页已生成
            </span>
          </div>
        )}
        {/* LeftPanel 填充剩余空间 */}
        <LeftPanel
          pageCount={pages.length}
          fileSize={estimatedFileSize}
          onSuggestionExecute={handleSuggestionExecute}
          onSubmit={handleSubmit}
          onImportClick={() => setShowImportModal(true)}
          loading={generating}
          disabled={generating}
          className="!w-full flex-1 !border-r-0"
        />
      </div>

      {/* Right Panel */}
      <RightPanel
        title={session?.title || t('office.slides.title')}
        sessionId={session?.id}
        onCheckpointRestore={handleCheckpointRestore}
        onCreateCheckpoint={handleCreateCheckpoint}
        onFactCheck={handleFactCheck}
        onAIEdit={handleAIEdit}
        onAdvanced={handleAdvanced}
      />

      {/* Import Modal */}
      <SourceImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImport={handleImport}
      />
    </div>
  );
}

export default SlidesWorkspace;
