'use client';

/**
 * Topic History Panel - 研究历史面板
 *
 * 展示专题的历史研究版本和对比功能
 */

import { ResearchTimeline } from '../collaboration/ResearchTimeline';

import { logger } from '@/lib/utils/logger';
interface TopicHistoryPanelProps {
  topicId: string;
  onSelectResearch?: (history: any) => void;
  onCompareVersions?: (from: any, to: any) => void;
  onViewReport?: (version: any) => void;
}

export function TopicHistoryPanel({
  topicId,
  onSelectResearch,
  onCompareVersions,
  onViewReport,
}: TopicHistoryPanelProps) {
  return (
    <div className="h-full overflow-y-auto">
      <ResearchTimeline
        topicId={topicId}
        onSelectResearch={(history) => {
          logger.debug('Selected research:', history);
          onSelectResearch?.(history);
        }}
        onCompareVersions={(from, to) => {
          logger.debug('Compare versions:', String(from), String(to));
          onCompareVersions?.(from, to);
        }}
        onViewReport={(version) => {
          logger.debug('View report version:', version);
          onViewReport?.(version);
        }}
      />
    </div>
  );
}
