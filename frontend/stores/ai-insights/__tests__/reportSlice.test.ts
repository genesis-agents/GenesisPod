import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/api/topic-insights', () => ({
  getReports: vi.fn(),
  getLatestReport: vi.fn(),
  getReport: vi.fn(),
  deleteReport: vi.fn(),
  waitForExportCompletion: vi.fn(),
  compareReports: vi.fn(),
  rollbackReport: vi.fn(),
  getEvidence: vi.fn(),
  getLogs: vi.fn(),
  // Stub other slices
  getTopics: vi.fn(),
  getTopic: vi.fn(),
  createTopic: vi.fn(),
  updateTopic: vi.fn(),
  deleteTopic: vi.fn(),
  getDimensions: vi.fn(),
  addDimension: vi.fn(),
  updateDimension: vi.fn(),
  deleteDimension: vi.fn(),
  refreshDimension: vi.fn(),
  reorderDimensions: vi.fn(),
  getSchedule: vi.fn(),
  updateSchedule: vi.fn(),
  getStats: vi.fn(),
  getTemplates: vi.fn(),
  createFromTemplate: vi.fn(),
  triggerRefresh: vi.fn(),
  cancelRefresh: vi.fn(),
  getRefreshStatus: vi.fn(),
  createRefreshProgressStream: vi.fn(),
  leaderPlan: vi.fn(),
  getMission: vi.fn(),
  getMissionHealth: vi.fn(),
  getTeam: vi.fn(),
  sendLeaderMessage: vi.fn(),
  retryMission: vi.fn(),
  cancelMission: vi.fn(),
  getTeamMessages: vi.fn(),
  getAgentActivities: vi.fn(),
  getTodos: vi.fn(),
  pauseTodo: vi.fn(),
  resumeTodo: vi.fn(),
  cancelTodo: vi.fn(),
  retryTodo: vi.fn(),
  prioritizeTodo: vi.fn(),
  createUserRequestTodo: vi.fn(),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/utils/config', () => ({
  config: {
    apiUrl: 'http://test-api',
    apiBaseUrl: 'http://test-api',
    streamApiUrl: 'http://test-stream',
  },
}));

vi.mock('@/lib/utils/auth', () => ({
  getAuthTokens: vi.fn().mockReturnValue({ accessToken: 'test-token' }),
  refreshAccessToken: vi.fn(),
  logout: vi.fn(),
}));

import * as apiModule from '@/lib/api/topic-insights';
import { useTopicInsightsStore } from '../index';

const api = apiModule as ReturnType<typeof vi.mocked<typeof apiModule>>;

describe('reportSlice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTopicInsightsStore.getState().resetStore();
  });

  // ==================== Initial State ====================

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const state = useTopicInsightsStore.getState();
      expect(state.reports).toEqual([]);
      expect(state.currentReport).toBeNull();
      expect(state.isLoadingReports).toBe(false);
      expect(state.hasMoreReports).toBe(false);
      expect(state.reportsCursor).toBeNull();
      expect(state.evidence).toEqual([]);
      expect(state.isLoadingEvidence).toBe(false);
      expect(state.evidenceTotal).toBe(0);
      expect(state.logs).toEqual([]);
      expect(state.isLoadingLogs).toBe(false);
      expect(state.comparisonResult).toBeNull();
    });
  });

  // ==================== Reports ====================

  describe('fetchReports', () => {
    it('should set reports and pagination state on initial load', async () => {
      const mockResponse = {
        reports: [{ id: 'r1', title: 'Report 1' }],
        hasMore: true,
        nextCursor: 'cursor-abc',
      };
      vi.mocked(api.getReports).mockResolvedValueOnce(mockResponse as never);

      await useTopicInsightsStore.getState().fetchReports('t1');

      const state = useTopicInsightsStore.getState();
      expect(state.reports).toEqual(mockResponse.reports);
      expect(state.hasMoreReports).toBe(true);
      expect(state.reportsCursor).toBe('cursor-abc');
      expect(state.isLoadingReports).toBe(false);
    });

    it('should append reports on loadMore=true', async () => {
      const existing = [{ id: 'r1', title: 'Report 1' }];
      useTopicInsightsStore.setState({
        reports: existing as never[],
        reportsCursor: 'cursor-1',
      });

      const moreReports = [{ id: 'r2', title: 'Report 2' }];
      vi.mocked(api.getReports).mockResolvedValueOnce({
        reports: moreReports,
        hasMore: false,
        nextCursor: null,
      } as never);

      await useTopicInsightsStore.getState().fetchReports('t1', true);

      const state = useTopicInsightsStore.getState();
      expect(state.reports).toHaveLength(2);
      expect(state.reports[0].id).toBe('r1');
      expect(state.reports[1].id).toBe('r2');
      expect(state.hasMoreReports).toBe(false);
    });

    it('should replace reports on loadMore=false', async () => {
      useTopicInsightsStore.setState({
        reports: [{ id: 'r-old' } as never],
        reportsCursor: 'old-cursor',
      });

      vi.mocked(api.getReports).mockResolvedValueOnce({
        reports: [{ id: 'r-new' }],
        hasMore: false,
        nextCursor: null,
      } as never);

      await useTopicInsightsStore.getState().fetchReports('t1', false);

      const reports = useTopicInsightsStore.getState().reports;
      expect(reports).toHaveLength(1);
      expect(reports[0].id).toBe('r-new');
    });

    it('should clear loading on error without throwing for "No reports found"', async () => {
      vi.mocked(api.getReports).mockRejectedValueOnce(
        new Error('No reports found')
      );

      await expect(
        useTopicInsightsStore.getState().fetchReports('t1')
      ).resolves.not.toThrow();

      expect(useTopicInsightsStore.getState().isLoadingReports).toBe(false);
    });

    it('should rethrow non-"not found" errors', async () => {
      vi.mocked(api.getReports).mockRejectedValueOnce(
        new Error('Server error')
      );

      await expect(
        useTopicInsightsStore.getState().fetchReports('t1')
      ).rejects.toThrow('Server error');
    });
  });

  describe('fetchLatestReport', () => {
    it('should set currentReport on success', async () => {
      const mockReport = { id: 'r1', title: 'Latest Report' };
      vi.mocked(api.getLatestReport).mockResolvedValueOnce(mockReport as never);

      await useTopicInsightsStore.getState().fetchLatestReport('t1');

      expect(useTopicInsightsStore.getState().currentReport).toEqual(
        mockReport
      );
    });

    it('should set currentReport to null on error without throwing', async () => {
      vi.mocked(api.getLatestReport).mockRejectedValueOnce(
        new Error('Not found')
      );

      await expect(
        useTopicInsightsStore.getState().fetchLatestReport('t1')
      ).resolves.not.toThrow();

      expect(useTopicInsightsStore.getState().currentReport).toBeNull();
    });
  });

  describe('fetchReport', () => {
    it('should set currentReport on success', async () => {
      const mockReport = { id: 'r1', title: 'Report' };
      vi.mocked(api.getReport).mockResolvedValueOnce(mockReport as never);

      await useTopicInsightsStore.getState().fetchReport('t1', 'r1');

      expect(useTopicInsightsStore.getState().currentReport).toEqual(
        mockReport
      );
    });

    it('should not throw for report-not-found errors', async () => {
      vi.mocked(api.getReport).mockRejectedValueOnce(
        new Error('Report not found')
      );

      await expect(
        useTopicInsightsStore.getState().fetchReport('t1', 'r1')
      ).resolves.not.toThrow();
    });

    it('should rethrow non-404 errors', async () => {
      vi.mocked(api.getReport).mockRejectedValueOnce(new Error('Server error'));

      await expect(
        useTopicInsightsStore.getState().fetchReport('t1', 'r1')
      ).rejects.toThrow('Server error');
    });
  });

  describe('deleteReport', () => {
    it('should remove report from list and clear currentReport if matches', async () => {
      const r1 = { id: 'r1', title: 'Report 1' };
      const r2 = { id: 'r2', title: 'Report 2' };
      useTopicInsightsStore.setState({
        reports: [r1, r2] as never[],
        currentReport: r1 as never,
      });
      vi.mocked(api.deleteReport).mockResolvedValueOnce(undefined as never);

      await useTopicInsightsStore.getState().deleteReport('t1', 'r1');

      const state = useTopicInsightsStore.getState();
      expect(state.reports).toHaveLength(1);
      expect(state.reports[0].id).toBe('r2');
      expect(state.currentReport).toBeNull();
    });

    it('should not clear currentReport if different id deleted', async () => {
      const r1 = { id: 'r1' };
      const r2 = { id: 'r2' };
      useTopicInsightsStore.setState({
        reports: [r1, r2] as never[],
        currentReport: r2 as never,
      });
      vi.mocked(api.deleteReport).mockResolvedValueOnce(undefined as never);

      await useTopicInsightsStore.getState().deleteReport('t1', 'r1');

      expect(useTopicInsightsStore.getState().currentReport).toEqual(r2);
    });

    it('should rethrow on error', async () => {
      vi.mocked(api.deleteReport).mockRejectedValueOnce(
        new Error('Delete failed')
      );

      await expect(
        useTopicInsightsStore.getState().deleteReport('t1', 'r1')
      ).rejects.toThrow('Delete failed');
    });
  });

  describe('exportReport', () => {
    it('should return the download URL', async () => {
      vi.mocked(api.waitForExportCompletion).mockResolvedValueOnce(
        'https://download.url/r1.pdf' as never
      );

      const url = await useTopicInsightsStore
        .getState()
        .exportReport('t1', 'r1', { format: 'PDF' } as never);

      expect(url).toBe('https://download.url/r1.pdf');
      expect(vi.mocked(api.waitForExportCompletion)).toHaveBeenCalledWith(
        't1',
        'r1',
        { format: 'PDF' }
      );
    });
  });

  describe('compareReports', () => {
    it('should set comparisonResult on success', async () => {
      const mockResult = { score: 85, differences: ['New AI section added'] };
      vi.mocked(api.compareReports).mockResolvedValueOnce(mockResult as never);

      await useTopicInsightsStore
        .getState()
        .compareReports('t1', { reportIds: ['r1', 'r2'] } as never);

      expect(useTopicInsightsStore.getState().comparisonResult).toEqual(
        mockResult
      );
    });

    it('should rethrow on error', async () => {
      vi.mocked(api.compareReports).mockRejectedValueOnce(
        new Error('Compare error')
      );

      await expect(
        useTopicInsightsStore
          .getState()
          .compareReports('t1', { reportIds: [] } as never)
      ).rejects.toThrow('Compare error');
    });
  });

  describe('setCurrentReport', () => {
    it('should set currentReport', () => {
      const report = { id: 'r1', title: 'Report' };
      useTopicInsightsStore.getState().setCurrentReport(report as never);
      expect(useTopicInsightsStore.getState().currentReport).toEqual(report);
    });

    it('should set currentReport to null', () => {
      useTopicInsightsStore.setState({ currentReport: { id: 'r1' } as never });
      useTopicInsightsStore.getState().setCurrentReport(null);
      expect(useTopicInsightsStore.getState().currentReport).toBeNull();
    });
  });

  describe('rollbackReport', () => {
    it('should update currentReport with rolled-back report', async () => {
      const rolledBack = { id: 'r1', title: 'Old version', revision: 1 };
      vi.mocked(api.rollbackReport).mockResolvedValueOnce({
        report: rolledBack,
      } as never);

      await useTopicInsightsStore.getState().rollbackReport('t1', 'r1', 1);

      expect(useTopicInsightsStore.getState().currentReport).toEqual(
        rolledBack
      );
      expect(vi.mocked(api.rollbackReport)).toHaveBeenCalledWith('t1', 'r1', 1);
    });

    it('should rethrow on error', async () => {
      vi.mocked(api.rollbackReport).mockRejectedValueOnce(
        new Error('Rollback failed')
      );

      await expect(
        useTopicInsightsStore.getState().rollbackReport('t1', 'r1', 1)
      ).rejects.toThrow('Rollback failed');
    });
  });

  // ==================== Evidence ====================

  describe('fetchEvidence', () => {
    it('should set evidence and evidenceTotal on success', async () => {
      const mockEvidence = [{ id: 'e1', title: 'Source 1' }];
      vi.mocked(api.getEvidence).mockResolvedValueOnce({
        evidence: mockEvidence,
        total: 1,
      } as never);

      await useTopicInsightsStore.getState().fetchEvidence('t1', 'r1');

      const state = useTopicInsightsStore.getState();
      expect(state.evidence).toEqual(mockEvidence);
      expect(state.evidenceTotal).toBe(1);
      expect(state.isLoadingEvidence).toBe(false);
    });

    it('should not throw for "No reports found" errors', async () => {
      vi.mocked(api.getEvidence).mockRejectedValueOnce(
        new Error('No reports found')
      );

      await expect(
        useTopicInsightsStore.getState().fetchEvidence('t1', 'r1')
      ).resolves.not.toThrow();

      expect(useTopicInsightsStore.getState().isLoadingEvidence).toBe(false);
    });

    it('should rethrow non-report-not-found errors', async () => {
      vi.mocked(api.getEvidence).mockRejectedValueOnce(
        new Error('Server error')
      );

      await expect(
        useTopicInsightsStore.getState().fetchEvidence('t1', 'r1')
      ).rejects.toThrow('Server error');
    });
  });

  // ==================== Logs ====================

  describe('fetchLogs', () => {
    it('should set logs and clear loading on success', async () => {
      const mockLogs = [{ id: 'l1', message: 'Started refresh' }];
      vi.mocked(api.getLogs).mockResolvedValueOnce(mockLogs as never);

      await useTopicInsightsStore.getState().fetchLogs('t1');

      const state = useTopicInsightsStore.getState();
      expect(state.logs).toEqual(mockLogs);
      expect(state.isLoadingLogs).toBe(false);
    });

    it('should clear loading and rethrow on error', async () => {
      vi.mocked(api.getLogs).mockRejectedValueOnce(new Error('Logs error'));

      await expect(
        useTopicInsightsStore.getState().fetchLogs('t1')
      ).rejects.toThrow('Logs error');

      expect(useTopicInsightsStore.getState().isLoadingLogs).toBe(false);
    });

    it('should pass options to api.getLogs', async () => {
      vi.mocked(api.getLogs).mockResolvedValueOnce([] as never);

      await useTopicInsightsStore
        .getState()
        .fetchLogs('t1', { limit: 20 } as never);

      expect(vi.mocked(api.getLogs)).toHaveBeenCalledWith('t1', { limit: 20 });
    });
  });
});
