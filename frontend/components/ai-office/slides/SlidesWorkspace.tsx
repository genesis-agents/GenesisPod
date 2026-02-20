'use client';

/**
 * AI Slides V5.0 - Slides Workspace
 *
 * Main workspace combining:
 * - LeftPanel (slide navigator, generating status, controls)
 * - RightPanel (preview, AI chat)
 */

import React, { useState, useCallback } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils/common';
import { useSlidesStore } from '@/stores';
import { useCheckpoints } from '@/hooks/features/slides';
import { LeftPanel } from './LeftPanel';
import { RightPanel } from './RightPanel';
import { logger } from '@/lib/utils/logger';
import { formatDateSafe } from '@/lib/utils/date';
import { useI18n } from '@/lib/i18n/i18n-context';

interface SlidesWorkspaceProps {
  className?: string;
}

export function SlidesWorkspace({ className }: SlidesWorkspaceProps) {
  const { t } = useI18n();
  const [leftCollapsed, setLeftCollapsed] = useState(false);

  const { session, setGenerating, setProgress } = useSlidesStore();

  const { createCheckpoint, restoreCheckpoint } = useCheckpoints();

  const handleCheckpointRestore = useCallback(
    async (checkpointId: string) => {
      await restoreCheckpoint(checkpointId);
    },
    [restoreCheckpoint]
  );

  const handleCreateCheckpoint = useCallback(() => {
    createCheckpoint(
      t('office.slides.savePoint', { time: formatDateSafe(new Date(), 'time') })
    );
  }, [createCheckpoint, t]);

  const handleFactCheck = useCallback(async () => {
    logger.debug('[SlidesWorkspace] Fact check triggered');
  }, []);

  const handleAIEdit = useCallback(
    async (action: 'fix-layout' | 'polish-content' | 'mark-edit') => {
      logger.debug('[SlidesWorkspace] AI Edit:', action);
    },
    []
  );

  const handleAdvanced = useCallback(() => {
    logger.debug('[SlidesWorkspace] Advanced options clicked');
  }, []);

  // Cancel stops UI generating state; actual SSE stream is managed by SlidesTab
  const handleCancel = useCallback(() => {
    setGenerating(false);
    setProgress(null);
    logger.info('[SlidesWorkspace] Generation cancelled by user');
  }, [setGenerating, setProgress]);

  // Re-generate is a no-op here — generation is triggered from SlidesTab's input form
  const handleGenerate = useCallback(() => {
    logger.info(
      '[SlidesWorkspace] Re-generate: use header form to start a new generation'
    );
  }, []);

  const handleSendMessage = useCallback((message: string) => {
    logger.info('[SlidesWorkspace] AI chat message:', message);
    // TODO: connect to AI edit service
  }, []);

  return (
    <div className={cn('flex h-full', className)}>
      {/* Left Panel: 280px slide navigator */}
      {!leftCollapsed && (
        <div className="flex w-[280px] flex-shrink-0 flex-col">
          <LeftPanel
            onCollapse={() => setLeftCollapsed(true)}
            onGenerate={handleGenerate}
            onCancel={handleCancel}
            className="flex-1"
          />
        </div>
      )}

      {/* Collapsed left panel: narrow expand strip */}
      {leftCollapsed && (
        <div className="flex flex-shrink-0 flex-col border-r border-slate-200 bg-white">
          <button
            onClick={() => setLeftCollapsed(false)}
            className="m-1 rounded p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            title="展开面板"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Right Panel */}
      <RightPanel
        title={session?.title || t('office.slides.title')}
        sessionId={session?.id}
        onCheckpointRestore={handleCheckpointRestore}
        onCreateCheckpoint={handleCreateCheckpoint}
        onFactCheck={handleFactCheck}
        onAIEdit={handleAIEdit}
        onAdvanced={handleAdvanced}
        onSendMessage={handleSendMessage}
      />
    </div>
  );
}

export default SlidesWorkspace;
