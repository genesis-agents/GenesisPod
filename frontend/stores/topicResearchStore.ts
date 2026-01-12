/**
 * Topic Research Zustand Store
 *
 * 专题研究模块的状态管理
 */

import { create } from 'zustand';
import type {
  ResearchTopic,
  TopicDimension,
  TopicReport,
  TopicEvidence,
  TopicSchedule,
  TopicRefreshLog,
  TopicStats,
  ResearchTemplate,
  RefreshStatusResponse,
  ReportComparisonResult,
  CreateTopicDto,
  UpdateTopicDto,
  ListTopicsDto,
  TriggerRefreshDto,
  AddDimensionDto,
  UpdateDimensionDto,
  ReorderDimensionsDto,
  ExportReportDto,
  CompareReportsDto,
  ListEvidenceDto,
  UpdateScheduleDto,
  ListLogsDto,
  ResearchTopicType,
} from '@/types/topic-research';
import * as api from '@/lib/api/topic-research';
import type {
  MissionStatus,
  TeamInfo,
  ResearchMission,
} from '@/lib/api/topic-research';

interface TopicResearchState {
  // Topics
  topics: ResearchTopic[];
  currentTopic: ResearchTopic | null;
  isLoadingTopics: boolean;

  // Dimensions
  dimensions: TopicDimension[];
  isLoadingDimensions: boolean;

  // Reports
  reports: TopicReport[];
  currentReport: TopicReport | null;
  isLoadingReports: boolean;
  hasMoreReports: boolean;
  reportsCursor: string | null;

  // Evidence
  evidence: TopicEvidence[];
  isLoadingEvidence: boolean;
  evidenceTotal: number;

  // Refresh
  refreshStatus: RefreshStatusResponse | null;
  isRefreshing: boolean;
  refreshProgress: {
    phase: string;
    progress: number;
    message: string;
    currentDimension?: string;
    completedDimensions: number;
    totalDimensions: number;
  } | null;
  refreshStream: { close: () => void } | null;

  // Leader/Mission
  currentMission: ResearchMission | null;
  missionStatus: MissionStatus | null;
  teamInfo: TeamInfo | null;
  isLoadingMission: boolean;

  // Schedule & Logs
  schedule: TopicSchedule | null;
  logs: TopicRefreshLog[];
  isLoadingLogs: boolean;

  // Stats
  stats: TopicStats | null;

  // Templates
  templates: ResearchTemplate[];
  isLoadingTemplates: boolean;

  // Comparison
  comparisonResult: ReportComparisonResult | null;

  // Error
  error: string | null;

  // Actions - Topics
  fetchTopics: (options?: ListTopicsDto) => Promise<void>;
  fetchTopic: (topicId: string) => Promise<void>;
  createTopic: (dto: CreateTopicDto) => Promise<ResearchTopic>;
  updateTopic: (topicId: string, dto: UpdateTopicDto) => Promise<void>;
  deleteTopic: (topicId: string) => Promise<void>;
  setCurrentTopic: (topic: ResearchTopic | null) => void;

  // Actions - Dimensions
  fetchDimensions: (topicId: string) => Promise<void>;
  addDimension: (topicId: string, dto: AddDimensionDto) => Promise<void>;
  updateDimension: (
    topicId: string,
    dimensionId: string,
    dto: UpdateDimensionDto
  ) => Promise<void>;
  deleteDimension: (topicId: string, dimensionId: string) => Promise<void>;
  refreshDimension: (topicId: string, dimensionId: string) => Promise<void>;
  reorderDimensions: (
    topicId: string,
    dto: ReorderDimensionsDto
  ) => Promise<void>;

  // Actions - Refresh
  triggerRefresh: (topicId: string, dto?: TriggerRefreshDto) => Promise<void>;
  cancelRefresh: (topicId: string, jobId: string) => Promise<void>;
  fetchRefreshStatus: (topicId: string) => Promise<void>;
  startRefreshProgressStream: (topicId: string) => void;
  stopRefreshProgressStream: () => void;

  // Actions - Leader/Mission
  startLeaderPlan: (topicId: string, userPrompt?: string) => Promise<void>;
  fetchMissionStatus: (topicId: string) => Promise<void>;
  fetchTeamInfo: (topicId: string) => Promise<void>;
  sendLeaderInstruction: (
    topicId: string,
    instruction: string
  ) => Promise<void>;
  retryMission: (topicId: string, taskIds?: string[]) => Promise<void>;

  // Actions - Reports
  fetchReports: (topicId: string, loadMore?: boolean) => Promise<void>;
  fetchLatestReport: (topicId: string) => Promise<void>;
  fetchReport: (topicId: string, reportId: string) => Promise<void>;
  exportReport: (
    topicId: string,
    reportId: string,
    dto: ExportReportDto
  ) => Promise<string>;
  compareReports: (topicId: string, dto: CompareReportsDto) => Promise<void>;
  setCurrentReport: (report: TopicReport | null) => void;

  // Actions - Evidence
  fetchEvidence: (
    topicId: string,
    reportId: string,
    options?: ListEvidenceDto
  ) => Promise<void>;

  // Actions - Schedule
  fetchSchedule: (topicId: string) => Promise<void>;
  updateSchedule: (topicId: string, dto: UpdateScheduleDto) => Promise<void>;

  // Actions - Logs
  fetchLogs: (topicId: string, options?: ListLogsDto) => Promise<void>;

  // Actions - Stats
  fetchStats: (topicId: string) => Promise<void>;

  // Actions - Templates
  fetchTemplates: (type: ResearchTopicType) => Promise<void>;
  createFromTemplate: (
    templateId: string,
    overrides?: Partial<CreateTopicDto>
  ) => Promise<ResearchTopic>;

  // Actions - UI
  clearError: () => void;
  resetStore: () => void;
}

export const useTopicResearchStore = create<TopicResearchState>((set, get) => ({
  // Initial state
  topics: [],
  currentTopic: null,
  isLoadingTopics: false,
  dimensions: [],
  isLoadingDimensions: false,
  reports: [],
  currentReport: null,
  isLoadingReports: false,
  hasMoreReports: false,
  reportsCursor: null,
  evidence: [],
  isLoadingEvidence: false,
  evidenceTotal: 0,
  refreshStatus: null,
  isRefreshing: false,
  refreshProgress: null,
  refreshStream: null,
  currentMission: null,
  missionStatus: null,
  teamInfo: null,
  isLoadingMission: false,
  schedule: null,
  logs: [],
  isLoadingLogs: false,
  stats: null,
  templates: [],
  isLoadingTemplates: false,
  comparisonResult: null,
  error: null,

  // ==================== Topics ====================

  fetchTopics: async (options) => {
    set({ isLoadingTopics: true, error: null });
    try {
      const topics = await api.getTopics(options);
      set({ topics, isLoadingTopics: false });
    } catch (error) {
      set({
        isLoadingTopics: false,
        error:
          error instanceof Error ? error.message : 'Failed to fetch topics',
      });
      throw error;
    }
  },

  fetchTopic: async (topicId) => {
    try {
      const topic = await api.getTopic(topicId);
      set({ currentTopic: topic });
      // Update topics list
      set((state) => ({
        topics: state.topics.map((t) => (t.id === topicId ? topic : t)),
      }));
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch topic',
      });
      throw error;
    }
  },

  createTopic: async (dto) => {
    const topic = await api.createTopic(dto);
    set((state) => ({ topics: [topic, ...state.topics] }));
    return topic;
  },

  updateTopic: async (topicId, dto) => {
    const topic = await api.updateTopic(topicId, dto);
    set((state) => ({
      topics: state.topics.map((t) => (t.id === topicId ? topic : t)),
      currentTopic:
        state.currentTopic?.id === topicId ? topic : state.currentTopic,
    }));
  },

  deleteTopic: async (topicId) => {
    await api.deleteTopic(topicId);
    set((state) => ({
      topics: state.topics.filter((t) => t.id !== topicId),
      currentTopic:
        state.currentTopic?.id === topicId ? null : state.currentTopic,
    }));
  },

  setCurrentTopic: (topic) => {
    set({ currentTopic: topic });
  },

  // ==================== Dimensions ====================

  fetchDimensions: async (topicId) => {
    set({ isLoadingDimensions: true, error: null });
    try {
      const dimensions = await api.getDimensions(topicId);
      set({ dimensions, isLoadingDimensions: false });
    } catch (error) {
      set({
        isLoadingDimensions: false,
        error:
          error instanceof Error ? error.message : 'Failed to fetch dimensions',
      });
      throw error;
    }
  },

  addDimension: async (topicId, dto) => {
    const dimension = await api.addDimension(topicId, dto);
    set((state) => ({ dimensions: [...state.dimensions, dimension] }));
  },

  updateDimension: async (topicId, dimensionId, dto) => {
    const dimension = await api.updateDimension(topicId, dimensionId, dto);
    set((state) => ({
      dimensions: state.dimensions.map((d) =>
        d.id === dimensionId ? dimension : d
      ),
    }));
  },

  deleteDimension: async (topicId, dimensionId) => {
    await api.deleteDimension(topicId, dimensionId);
    set((state) => ({
      dimensions: state.dimensions.filter((d) => d.id !== dimensionId),
    }));
  },

  refreshDimension: async (topicId, dimensionId) => {
    await api.refreshDimension(topicId, dimensionId);
    // Refresh dimensions to get updated status
    await get().fetchDimensions(topicId);
  },

  reorderDimensions: async (topicId, dto) => {
    const dimensions = await api.reorderDimensions(topicId, dto);
    set({ dimensions });
  },

  // ==================== Refresh ====================

  triggerRefresh: async (topicId, dto) => {
    set({ isRefreshing: true, error: null });
    try {
      await api.triggerRefresh(topicId, dto);
      // Start listening to progress
      get().startRefreshProgressStream(topicId);
    } catch (error) {
      set({
        isRefreshing: false,
        error:
          error instanceof Error ? error.message : 'Failed to trigger refresh',
      });
      throw error;
    }
  },

  cancelRefresh: async (topicId, jobId) => {
    try {
      await api.cancelRefresh(topicId, jobId);
      get().stopRefreshProgressStream();
      set({ isRefreshing: false, refreshProgress: null });
    } catch (error) {
      set({
        error:
          error instanceof Error ? error.message : 'Failed to cancel refresh',
      });
      throw error;
    }
  },

  fetchRefreshStatus: async (topicId) => {
    try {
      const status = await api.getRefreshStatus(topicId);
      set({ refreshStatus: status, isRefreshing: status.isRunning });
    } catch (error) {
      set({
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch refresh status',
      });
      throw error;
    }
  },

  startRefreshProgressStream: (topicId) => {
    // Close existing stream
    get().stopRefreshProgressStream();

    const stream = api.createRefreshProgressStream(topicId, {
      onProgress: (event) => {
        set({ refreshProgress: event });
      },
      onComplete: async (event) => {
        set({
          isRefreshing: false,
          refreshProgress: null,
        });
        get().stopRefreshProgressStream();
        // Refresh topic and report data
        await get().fetchTopic(topicId);
        await get().fetchLatestReport(topicId);
      },
      onError: (event) => {
        set({
          isRefreshing: false,
          refreshProgress: null,
          error: event.error,
        });
        get().stopRefreshProgressStream();
      },
    });

    set({ refreshStream: stream });
  },

  stopRefreshProgressStream: () => {
    const { refreshStream } = get();
    if (refreshStream) {
      refreshStream.close();
      set({ refreshStream: null });
    }
  },

  // ==================== Leader/Mission ====================

  startLeaderPlan: async (topicId, userPrompt) => {
    set({ isRefreshing: true, isLoadingMission: true, error: null });
    try {
      const mission = await api.leaderPlan(topicId, { userPrompt });
      set({ currentMission: mission, isLoadingMission: false });
      // Start polling for mission status
      get().fetchMissionStatus(topicId);
    } catch (error) {
      set({
        isRefreshing: false,
        isLoadingMission: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to start leader plan',
      });
      throw error;
    }
  },

  fetchMissionStatus: async (topicId) => {
    try {
      const status = await api.getMission(topicId);
      set({ missionStatus: status });

      // Update refresh state based on mission status
      if (status) {
        const isActive = ['PLANNING', 'EXECUTING', 'REVIEWING'].includes(
          status.status
        );
        set({
          isRefreshing: isActive,
          refreshProgress: isActive
            ? {
                phase: status.currentPhase,
                progress: status.progress,
                message: `${status.completedTasks}/${status.totalTasks} 任务完成`,
                completedDimensions: status.completedTasks,
                totalDimensions: status.totalTasks,
              }
            : null,
        });

        // If completed, fetch the latest report
        if (status.status === 'COMPLETED') {
          get().fetchLatestReport(topicId);
        }
      }
    } catch (error) {
      set({
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch mission status',
      });
    }
  },

  fetchTeamInfo: async (topicId) => {
    try {
      const teamInfo = await api.getTeam(topicId);
      set({ teamInfo });
    } catch (error) {
      set({
        error:
          error instanceof Error ? error.message : 'Failed to fetch team info',
      });
    }
  },

  sendLeaderInstruction: async (topicId, instruction) => {
    try {
      await api.sendLeaderMessage(topicId, instruction);
      // Refresh mission status after sending instruction
      get().fetchMissionStatus(topicId);
    } catch (error) {
      set({
        error:
          error instanceof Error
            ? error.message
            : 'Failed to send leader instruction',
      });
      throw error;
    }
  },

  retryMission: async (topicId, taskIds) => {
    set({ isRefreshing: true, error: null });
    try {
      await api.retryMission(topicId, taskIds);
      // Refresh mission status
      get().fetchMissionStatus(topicId);
    } catch (error) {
      set({
        isRefreshing: false,
        error:
          error instanceof Error ? error.message : 'Failed to retry mission',
      });
      throw error;
    }
  },

  // ==================== Reports ====================

  fetchReports: async (topicId, loadMore = false) => {
    set({ isLoadingReports: true, error: null });
    try {
      const cursor = loadMore ? (get().reportsCursor ?? undefined) : undefined;
      const response = await api.getReports(topicId, { cursor, limit: 10 });

      set((state) => ({
        reports: loadMore
          ? [...state.reports, ...response.reports]
          : response.reports,
        hasMoreReports: response.hasMore,
        reportsCursor: response.nextCursor || null,
        isLoadingReports: false,
      }));
    } catch (error) {
      set({
        isLoadingReports: false,
        error:
          error instanceof Error ? error.message : 'Failed to fetch reports',
      });
      throw error;
    }
  },

  fetchLatestReport: async (topicId) => {
    try {
      const report = await api.getLatestReport(topicId);
      set({ currentReport: report });
    } catch (error) {
      set({
        currentReport: null,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch latest report',
      });
      // Don't throw here as missing report is not critical
    }
  },

  fetchReport: async (topicId, reportId) => {
    try {
      const report = await api.getReport(topicId, reportId);
      set({ currentReport: report });
    } catch (error) {
      set({
        error:
          error instanceof Error ? error.message : 'Failed to fetch report',
      });
      throw error;
    }
  },

  exportReport: async (topicId, reportId, dto) => {
    const result = await api.exportReport(topicId, reportId, dto);
    return result.downloadUrl;
  },

  compareReports: async (topicId, dto) => {
    try {
      const result = await api.compareReports(topicId, dto);
      set({ comparisonResult: result });
    } catch (error) {
      set({
        error:
          error instanceof Error ? error.message : 'Failed to compare reports',
      });
      throw error;
    }
  },

  setCurrentReport: (report) => {
    set({ currentReport: report });
  },

  // ==================== Evidence ====================

  fetchEvidence: async (topicId, reportId, options) => {
    set({ isLoadingEvidence: true, error: null });
    try {
      const response = await api.getEvidence(topicId, reportId, options);
      set({
        evidence: response.evidence,
        evidenceTotal: response.total,
        isLoadingEvidence: false,
      });
    } catch (error) {
      set({
        isLoadingEvidence: false,
        error:
          error instanceof Error ? error.message : 'Failed to fetch evidence',
      });
      throw error;
    }
  },

  // ==================== Schedule ====================

  fetchSchedule: async (topicId) => {
    try {
      const schedule = await api.getSchedule(topicId);
      set({ schedule });
    } catch (error) {
      set({
        error:
          error instanceof Error ? error.message : 'Failed to fetch schedule',
      });
      throw error;
    }
  },

  updateSchedule: async (topicId, dto) => {
    const schedule = await api.updateSchedule(topicId, dto);
    set({ schedule });
  },

  // ==================== Logs ====================

  fetchLogs: async (topicId, options) => {
    set({ isLoadingLogs: true, error: null });
    try {
      const logs = await api.getLogs(topicId, options);
      set({ logs, isLoadingLogs: false });
    } catch (error) {
      set({
        isLoadingLogs: false,
        error: error instanceof Error ? error.message : 'Failed to fetch logs',
      });
      throw error;
    }
  },

  // ==================== Stats ====================

  fetchStats: async (topicId) => {
    try {
      const stats = await api.getStats(topicId);
      set({ stats });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch stats',
      });
      throw error;
    }
  },

  // ==================== Templates ====================

  fetchTemplates: async (type) => {
    set({ isLoadingTemplates: true, error: null });
    try {
      const templates = await api.getTemplates(type);
      set({ templates, isLoadingTemplates: false });
    } catch (error) {
      set({
        isLoadingTemplates: false,
        error:
          error instanceof Error ? error.message : 'Failed to fetch templates',
      });
      throw error;
    }
  },

  createFromTemplate: async (templateId, overrides) => {
    const topic = await api.createFromTemplate(templateId, overrides);
    set((state) => ({ topics: [topic, ...state.topics] }));
    return topic;
  },

  // ==================== UI ====================

  clearError: () => {
    set({ error: null });
  },

  resetStore: () => {
    get().stopRefreshProgressStream();
    set({
      topics: [],
      currentTopic: null,
      isLoadingTopics: false,
      dimensions: [],
      isLoadingDimensions: false,
      reports: [],
      currentReport: null,
      isLoadingReports: false,
      hasMoreReports: false,
      reportsCursor: null,
      evidence: [],
      isLoadingEvidence: false,
      evidenceTotal: 0,
      refreshStatus: null,
      isRefreshing: false,
      refreshProgress: null,
      refreshStream: null,
      schedule: null,
      logs: [],
      isLoadingLogs: false,
      stats: null,
      templates: [],
      isLoadingTemplates: false,
      comparisonResult: null,
      error: null,
    });
  },
}));
