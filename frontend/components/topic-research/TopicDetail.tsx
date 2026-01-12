'use client';

/**
 * Topic Detail Component
 *
 * 专题详情页面 - 使用新的左右分栏布局
 */

import { useEffect } from 'react';
import type { ResearchTopic } from '@/types/topic-research';
import { useTopicResearchStore } from '@/stores/topicResearchStore';
import { TopicResearchLayout } from './TopicResearchLayout';

interface TopicDetailProps {
  topic: ResearchTopic;
  onBack: () => void;
}

export function TopicDetail({ topic, onBack }: TopicDetailProps) {
  const {
    dimensions,
    currentReport,
    evidence,
    isRefreshing,
    refreshProgress,
    isLoadingReports,
    isLoadingEvidence,
    fetchDimensions,
    fetchLatestReport,
    fetchEvidence,
    triggerRefresh,
    cancelRefresh,
    exportReport,
  } = useTopicResearchStore();

  // Load data
  useEffect(() => {
    fetchDimensions(topic.id);
    fetchLatestReport(topic.id);
  }, [topic.id, fetchDimensions, fetchLatestReport]);

  // Load evidence when report is available
  useEffect(() => {
    if (currentReport?.id) {
      fetchEvidence(topic.id, currentReport.id);
    }
  }, [topic.id, currentReport?.id, fetchEvidence]);

  const handleRefresh = () => {
    triggerRefresh(topic.id);
  };

  const handleCancelRefresh = async () => {
    try {
      await cancelRefresh(topic.id, 'current');
    } catch {
      // Error is already handled in store
    }
  };

  const handleExport = async (format: 'pdf' | 'docx') => {
    if (!currentReport) return;
    try {
      const url = await exportReport(topic.id, currentReport.id, { format });
      window.open(url, '_blank');
    } catch {
      // Error is already handled in store
    }
  };

  return (
    <TopicResearchLayout
      topic={topic}
      dimensions={dimensions}
      report={currentReport}
      evidence={evidence}
      isRefreshing={isRefreshing}
      refreshProgress={refreshProgress}
      isLoadingReport={isLoadingReports}
      isLoadingEvidence={isLoadingEvidence}
      onStartRefresh={handleRefresh}
      onCancelRefresh={handleCancelRefresh}
      onExportReport={handleExport}
      onBack={onBack}
    />
  );
}
