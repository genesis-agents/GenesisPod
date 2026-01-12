'use client';

/**
 * Topic Detail Component
 *
 * 专题详情页面 - 使用新的左右分栏布局
 * v7.0: 支持 Leader 驱动的研究模式
 */

import { useEffect, useCallback } from 'react';
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
    missionStatus,
    teamInfo,
    isLoadingReports,
    isLoadingEvidence,
    fetchDimensions,
    fetchLatestReport,
    fetchEvidence,
    fetchMissionStatus,
    fetchTeamInfo,
    startLeaderPlan,
    cancelMission,
    exportReport,
    sendLeaderInstruction,
  } = useTopicResearchStore();

  // Load initial data
  useEffect(() => {
    fetchDimensions(topic.id);
    fetchLatestReport(topic.id);
    fetchMissionStatus(topic.id);
    fetchTeamInfo(topic.id);
  }, [
    topic.id,
    fetchDimensions,
    fetchLatestReport,
    fetchMissionStatus,
    fetchTeamInfo,
  ]);

  // Load evidence when report is available
  useEffect(() => {
    if (currentReport?.id) {
      fetchEvidence(topic.id, currentReport.id);
    }
  }, [topic.id, currentReport?.id, fetchEvidence]);

  // Poll mission status when refreshing
  useEffect(() => {
    if (!isRefreshing) return;

    const interval = setInterval(() => {
      fetchMissionStatus(topic.id);
      fetchTeamInfo(topic.id);
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(interval);
  }, [topic.id, isRefreshing, fetchMissionStatus, fetchTeamInfo]);

  // Start Leader-driven research
  const handleStartResearch = useCallback(() => {
    startLeaderPlan(topic.id);
  }, [topic.id, startLeaderPlan]);

  const handleCancelRefresh = useCallback(async () => {
    try {
      await cancelMission(topic.id);
    } catch {
      // Error is already handled in store
    }
  }, [topic.id, cancelMission]);

  const handleExport = useCallback(
    async (format: 'pdf' | 'docx') => {
      if (!currentReport) return;
      try {
        const url = await exportReport(topic.id, currentReport.id, { format });
        window.open(url, '_blank');
      } catch {
        // Error is already handled in store
      }
    },
    [topic.id, currentReport, exportReport]
  );

  const handleSendLeaderInstruction = useCallback(
    async (instruction: string) => {
      try {
        await sendLeaderInstruction(topic.id, instruction);
      } catch {
        // Error is already handled in store
      }
    },
    [topic.id, sendLeaderInstruction]
  );

  return (
    <TopicResearchLayout
      topic={topic}
      dimensions={dimensions}
      report={currentReport}
      evidence={evidence}
      isRefreshing={isRefreshing}
      refreshProgress={refreshProgress}
      missionStatus={missionStatus}
      teamInfo={teamInfo}
      isLoadingReport={isLoadingReports}
      isLoadingEvidence={isLoadingEvidence}
      onStartRefresh={handleStartResearch}
      onCancelRefresh={handleCancelRefresh}
      onExportReport={handleExport}
      onBack={onBack}
      onSendLeaderInstruction={handleSendLeaderInstruction}
    />
  );
}
