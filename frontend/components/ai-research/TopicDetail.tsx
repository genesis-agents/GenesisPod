'use client';

/**
 * Topic Detail Component
 *
 * 专题详情页面 - 使用新的左右分栏布局
 * v7.0: 支持 Leader 驱动的研究模式
 * v7.1: 集成 WebSocket 实时事件推送
 */

import { useEffect, useCallback } from 'react';
import type { ResearchTopic } from '@/types/topic-research';
import { useTopicResearchStore } from '@/stores/topicResearchStore';
import { useResearchWebSocket } from '@/hooks/useResearchWebSocket';
import { TopicResearchLayout } from './TopicResearchLayout';

interface TopicDetailProps {
  topic: ResearchTopic;
  onBack: () => void;
  /** ★ 初始视图（用于分享链接直接跳转到报告） */
  initialView?: string | null;
}

export function TopicDetail({ topic, onBack, initialView }: TopicDetailProps) {
  const {
    dimensions,
    currentReport,
    reports,
    evidence,
    isRefreshing,
    refreshProgress,
    missionStatus,
    teamInfo,
    teamMessages,
    agentActivities,
    isLoadingReports,
    isLoadingEvidence,
    error,
    fetchDimensions,
    fetchLatestReport,
    fetchReports,
    fetchReport,
    fetchEvidence,
    fetchMissionStatus,
    fetchTeamInfo,
    fetchTeamData,
    startLeaderPlan,
    cancelMission,
    retryMission,
    exportReport,
    sendLeaderInstruction,
    deleteReport,
    resetTopicData,
  } = useTopicResearchStore();

  // WebSocket 实时事件
  const {
    events: wsEvents,
    isConnected: wsConnected,
    clearEvents: clearWsEvents,
  } = useResearchWebSocket(topic.id, { enabled: true });

  // Load initial data
  useEffect(() => {
    // ★ 切换专题时先清空旧数据，避免显示上一个专题的脏数据
    resetTopicData();

    // 加载新专题的数据
    fetchDimensions(topic.id);
    fetchLatestReport(topic.id);
    fetchReports(topic.id); // Load all report versions for version history
    fetchMissionStatus(topic.id);
    fetchTeamInfo(topic.id);
    fetchTeamData(topic.id); // Load persisted team messages and agent activities
  }, [
    topic.id,
    resetTopicData,
    fetchDimensions,
    fetchLatestReport,
    fetchReports,
    fetchMissionStatus,
    fetchTeamInfo,
    fetchTeamData,
  ]);

  // Load evidence when report is available
  useEffect(() => {
    if (currentReport?.id) {
      // Request all evidence (up to 100, backend max limit)
      fetchEvidence(topic.id, currentReport.id, { pageSize: 100 });
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

  // ★ 当任务完成时自动刷新报告和维度
  useEffect(() => {
    if (missionStatus?.status === 'COMPLETED') {
      // 任务完成后刷新报告数据
      fetchLatestReport(topic.id);
      // ★ 同时刷新维度状态，让章节视图显示完成标记
      fetchDimensions(topic.id);
    }
  }, [missionStatus?.status, topic.id, fetchLatestReport, fetchDimensions]);

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

  // Continue/Resume research - 继续被暂停或取消的任务
  const handleContinueResearch = useCallback(async () => {
    try {
      await retryMission(topic.id);
    } catch {
      // Error is already handled in store
    }
  }, [topic.id, retryMission]);

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

  // Handle version rollback - load the selected report version
  const handleRollbackVersion = useCallback(
    async (reportId: string) => {
      try {
        await fetchReport(topic.id, reportId);
      } catch {
        // Error is already handled in store
      }
    },
    [topic.id, fetchReport]
  );

  // Handle delete report - delete and refresh the report list
  const handleDeleteReport = useCallback(
    async (reportId: string) => {
      try {
        await deleteReport(topic.id, reportId);
        // Refresh reports list and fetch the latest remaining report
        await fetchReports(topic.id);
        await fetchLatestReport(topic.id);
      } catch {
        // Error is already handled in store
      }
    },
    [topic.id, deleteReport, fetchReports, fetchLatestReport]
  );

  // ★ 安全处理：确保 reports 是数组，防止 undefined 报错
  const safeReports = Array.isArray(reports) ? reports : [];

  // Convert reports to revisions format (exclude current report)
  const revisions = safeReports
    .filter((r) => r.id !== currentReport?.id)
    .map((r) => ({
      id: r.id,
      version: r.version,
      createdAt: r.generatedAt ? new Date(r.generatedAt) : new Date(),
      summary: r.title || `版本 ${r.version}`,
    }));

  return (
    <TopicResearchLayout
      topic={topic}
      dimensions={dimensions}
      report={currentReport}
      evidence={evidence}
      revisions={revisions}
      isRefreshing={isRefreshing}
      refreshProgress={refreshProgress}
      missionStatus={missionStatus}
      teamInfo={teamInfo}
      isLoadingReport={isLoadingReports}
      isLoadingEvidence={isLoadingEvidence}
      onStartRefresh={handleStartResearch}
      onContinueRefresh={handleContinueResearch}
      onCancelRefresh={handleCancelRefresh}
      onExportReport={handleExport}
      onBack={onBack}
      onSendLeaderInstruction={handleSendLeaderInstruction}
      onRollbackVersion={handleRollbackVersion}
      onDeleteReport={handleDeleteReport}
      wsEvents={wsEvents}
      wsConnected={wsConnected}
      onClearWsEvents={clearWsEvents}
      error={error}
      initialView={initialView}
    />
  );
}
