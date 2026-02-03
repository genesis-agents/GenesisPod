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

export function SlidesWorkspace({ className }: SlidesWorkspaceProps) {
  const { t } = useI18n();
  const [showImportModal, setShowImportModal] = useState(false);
  // Local state for pending generation input
  const [pendingSourceText, setPendingSourceText] = useState<string>('');
  const [pendingTitle, setPendingTitle] = useState<string>('');

  const { session, pages, generating } = useSlidesStore();

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
      {/* Left Panel */}
      <LeftPanel
        pageCount={pages.length}
        fileSize={estimatedFileSize}
        onSuggestionExecute={handleSuggestionExecute}
        onSubmit={handleSubmit}
        onImportClick={() => setShowImportModal(true)}
        loading={generating}
        disabled={generating}
      />

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
