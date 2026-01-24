import { StateCreator } from 'zustand';
import type {
  TopicReport,
  TopicEvidence,
  TopicRefreshLog,
  ReportComparisonResult,
  ExportReportDto,
  CompareReportsDto,
  ListEvidenceDto,
  ListLogsDto,
} from '@/types/topic-research';
import * as api from '@/lib/api/topic-research';

export interface ReportSlice {
  // State - Reports
  reports: TopicReport[];
  currentReport: TopicReport | null;
  isLoadingReports: boolean;
  hasMoreReports: boolean;
  reportsCursor: string | null;

  // State - Evidence
  evidence: TopicEvidence[];
  isLoadingEvidence: boolean;
  evidenceTotal: number;

  // State - Logs
  logs: TopicRefreshLog[];
  isLoadingLogs: boolean;

  // State - Comparison
  comparisonResult: ReportComparisonResult | null;

  // Actions - Reports
  fetchReports: (topicId: string, loadMore?: boolean) => Promise<void>;
  fetchLatestReport: (topicId: string) => Promise<void>;
  fetchReport: (topicId: string, reportId: string) => Promise<void>;
  deleteReport: (topicId: string, reportId: string) => Promise<void>;
  exportReport: (
    topicId: string,
    reportId: string,
    dto: ExportReportDto
  ) => Promise<string>;
  compareReports: (topicId: string, dto: CompareReportsDto) => Promise<void>;
  setCurrentReport: (report: TopicReport | null) => void;
  rollbackReport: (
    topicId: string,
    reportId: string,
    revisionNumber: number
  ) => Promise<void>;

  // Actions - Evidence
  fetchEvidence: (
    topicId: string,
    reportId: string,
    options?: ListEvidenceDto
  ) => Promise<void>;

  // Actions - Logs
  fetchLogs: (topicId: string, options?: ListLogsDto) => Promise<void>;
}

/**
 * Helper function to check if error is "Report not found" type
 */
function isReportNotFoundError(error: unknown): boolean {
  const errorMessage =
    error instanceof Error ? error.message : String(error || '');
  return (
    errorMessage.includes('No reports found') ||
    errorMessage.includes('Report not found') ||
    errorMessage.includes('404') ||
    errorMessage.includes('No active mission')
  );
}

export const createReportSlice: StateCreator<ReportSlice, [], [], ReportSlice> = (
  set,
  get
) => ({
  // Initial state
  reports: [],
  currentReport: null,
  isLoadingReports: false,
  hasMoreReports: false,
  reportsCursor: null,
  evidence: [],
  isLoadingEvidence: false,
  evidenceTotal: 0,
  logs: [],
  isLoadingLogs: false,
  comparisonResult: null,

  // ==================== Reports ====================

  fetchReports: async (topicId, loadMore = false) => {
    set({ isLoadingReports: true });
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
      set({ isLoadingReports: false });
      if (!isReportNotFoundError(error)) {
        throw error;
      }
    }
  },

  fetchLatestReport: async (topicId) => {
    try {
      const report = await api.getLatestReport(topicId);
      set({ currentReport: report });
    } catch (error) {
      set({ currentReport: null });
      // Don't throw here as missing report is not critical
    }
  },

  fetchReport: async (topicId, reportId) => {
    try {
      const report = await api.getReport(topicId, reportId);
      set({ currentReport: report });
    } catch (error) {
      if (!isReportNotFoundError(error)) {
        throw error;
      }
    }
  },

  deleteReport: async (topicId, reportId) => {
    try {
      await api.deleteReport(topicId, reportId);
      set((state) => ({
        reports: state.reports.filter((r) => r.id !== reportId),
        currentReport:
          state.currentReport?.id === reportId ? null : state.currentReport,
      }));
    } catch (error) {
      throw error;
    }
  },

  exportReport: async (topicId, reportId, dto) => {
    const downloadUrl = await api.waitForExportCompletion(
      topicId,
      reportId,
      dto
    );
    return downloadUrl;
  },

  compareReports: async (topicId, dto) => {
    try {
      const result = await api.compareReports(topicId, dto);
      set({ comparisonResult: result });
    } catch (error) {
      throw error;
    }
  },

  setCurrentReport: (report) => {
    set({ currentReport: report });
  },

  rollbackReport: async (topicId, reportId, revisionNumber) => {
    try {
      const result = await api.rollbackReport(
        topicId,
        reportId,
        revisionNumber
      );
      set({ currentReport: result.report });
    } catch (error) {
      throw error;
    }
  },

  // ==================== Evidence ====================

  fetchEvidence: async (topicId, reportId, options) => {
    set({ isLoadingEvidence: true });
    try {
      const response = await api.getEvidence(topicId, reportId, options);
      set({
        evidence: response.evidence,
        evidenceTotal: response.total,
        isLoadingEvidence: false,
      });
    } catch (error) {
      set({ isLoadingEvidence: false });
      if (!isReportNotFoundError(error)) {
        throw error;
      }
    }
  },

  // ==================== Logs ====================

  fetchLogs: async (topicId, options) => {
    set({ isLoadingLogs: true });
    try {
      const logs = await api.getLogs(topicId, options);
      set({ logs, isLoadingLogs: false });
    } catch (error) {
      set({ isLoadingLogs: false });
      throw error;
    }
  },
});
