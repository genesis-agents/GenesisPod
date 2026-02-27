import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/api/topic-insights', () => ({
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
  // Stub out all other functions used by other slices
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
  getReports: vi.fn(),
  getLatestReport: vi.fn(),
  getReport: vi.fn(),
  deleteReport: vi.fn(),
  waitForExportCompletion: vi.fn(),
  compareReports: vi.fn(),
  rollbackReport: vi.fn(),
  getEvidence: vi.fn(),
  getLogs: vi.fn(),
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

describe('topicSlice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTopicInsightsStore.getState().resetStore();
  });

  // ==================== Initial State ====================

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const state = useTopicInsightsStore.getState();
      expect(state.topics).toEqual([]);
      expect(state.currentTopic).toBeNull();
      expect(state.isLoadingTopics).toBe(false);
      expect(state.dimensions).toEqual([]);
      expect(state.isLoadingDimensions).toBe(false);
      expect(state.schedule).toBeNull();
      expect(state.stats).toBeNull();
      expect(state.templates).toEqual([]);
      expect(state.isLoadingTemplates).toBe(false);
    });
  });

  // ==================== Topics ====================

  describe('fetchTopics', () => {
    it('should set topics and clear loading on success', async () => {
      const mockTopics = [{ id: 't1', name: 'AI Trends' }];
      vi.mocked(api.getTopics).mockResolvedValueOnce(mockTopics as never);

      await useTopicInsightsStore.getState().fetchTopics();

      const state = useTopicInsightsStore.getState();
      expect(state.topics).toEqual(mockTopics);
      expect(state.isLoadingTopics).toBe(false);
    });

    it('should set isLoadingTopics true during fetch', async () => {
      let resolve: (v: unknown) => void;
      const promise = new Promise((r) => {
        resolve = r;
      });
      vi.mocked(api.getTopics).mockReturnValueOnce(promise as never);

      const fetchPromise = useTopicInsightsStore.getState().fetchTopics();
      expect(useTopicInsightsStore.getState().isLoadingTopics).toBe(true);

      resolve!([]);
      await fetchPromise;
      expect(useTopicInsightsStore.getState().isLoadingTopics).toBe(false);
    });

    it('should pass options to api.getTopics', async () => {
      vi.mocked(api.getTopics).mockResolvedValueOnce([] as never);

      await useTopicInsightsStore
        .getState()
        .fetchTopics({ type: 'COMPANY' as never });

      expect(vi.mocked(api.getTopics)).toHaveBeenCalledWith({
        type: 'COMPANY',
      });
    });

    it('should clear loading and rethrow on error', async () => {
      vi.mocked(api.getTopics).mockRejectedValueOnce(
        new Error('Network error')
      );

      await expect(
        useTopicInsightsStore.getState().fetchTopics()
      ).rejects.toThrow('Network error');

      expect(useTopicInsightsStore.getState().isLoadingTopics).toBe(false);
    });
  });

  describe('fetchTopic', () => {
    it('should set currentTopic and update topics list', async () => {
      const existing = { id: 't1', name: 'Old name' };
      const updated = { id: 't1', name: 'New name' };
      useTopicInsightsStore.setState({ topics: [existing as never] });
      vi.mocked(api.getTopic).mockResolvedValueOnce(updated as never);

      await useTopicInsightsStore.getState().fetchTopic('t1');

      const state = useTopicInsightsStore.getState();
      expect(state.currentTopic).toEqual(updated);
      expect(state.topics[0]).toEqual(updated);
    });

    it('should rethrow on error', async () => {
      vi.mocked(api.getTopic).mockRejectedValueOnce(new Error('Not found'));

      await expect(
        useTopicInsightsStore.getState().fetchTopic('t1')
      ).rejects.toThrow('Not found');
    });
  });

  describe('createTopic', () => {
    it('should prepend new topic and return it', async () => {
      const existing = { id: 't1', name: 'Old' };
      const newTopic = { id: 't2', name: 'New' };
      useTopicInsightsStore.setState({ topics: [existing as never] });
      vi.mocked(api.createTopic).mockResolvedValueOnce(newTopic as never);

      const result = await useTopicInsightsStore
        .getState()
        .createTopic({ name: 'New' } as never);

      expect(result).toEqual(newTopic);
      const topics = useTopicInsightsStore.getState().topics;
      expect(topics[0]).toEqual(newTopic);
      expect(topics).toHaveLength(2);
    });
  });

  describe('updateTopic', () => {
    it('should update topic in list and currentTopic', async () => {
      const existing = { id: 't1', name: 'Old name' };
      const updated = { id: 't1', name: 'New name' };
      useTopicInsightsStore.setState({
        topics: [existing as never],
        currentTopic: existing as never,
      });
      vi.mocked(api.updateTopic).mockResolvedValueOnce(updated as never);

      await useTopicInsightsStore
        .getState()
        .updateTopic('t1', { name: 'New name' } as never);

      const state = useTopicInsightsStore.getState();
      expect(state.topics[0]).toEqual(updated);
      expect(state.currentTopic).toEqual(updated);
    });

    it('should not change currentTopic if id does not match', async () => {
      const existingTopic = { id: 't1', name: 'Topic 1' };
      const otherTopic = { id: 't2', name: 'Topic 2 current' };
      const updatedTopic = { id: 't1', name: 'Topic 1 updated' };
      useTopicInsightsStore.setState({
        topics: [existingTopic as never],
        currentTopic: otherTopic as never,
      });
      vi.mocked(api.updateTopic).mockResolvedValueOnce(updatedTopic as never);

      await useTopicInsightsStore
        .getState()
        .updateTopic('t1', { name: 'Topic 1 updated' } as never);

      expect(useTopicInsightsStore.getState().currentTopic).toEqual(otherTopic);
    });
  });

  describe('deleteTopic', () => {
    it('should remove topic from list', async () => {
      const t1 = { id: 't1', name: 'Topic 1' };
      const t2 = { id: 't2', name: 'Topic 2' };
      useTopicInsightsStore.setState({ topics: [t1, t2] as never[] });
      vi.mocked(api.deleteTopic).mockResolvedValueOnce(undefined as never);

      await useTopicInsightsStore.getState().deleteTopic('t1');

      const topics = useTopicInsightsStore.getState().topics;
      expect(topics).toHaveLength(1);
      expect(topics[0].id).toBe('t2');
    });

    it('should clear currentTopic if it matches deleted id', async () => {
      const t1 = { id: 't1', name: 'Topic 1' };
      useTopicInsightsStore.setState({
        topics: [t1 as never],
        currentTopic: t1 as never,
      });
      vi.mocked(api.deleteTopic).mockResolvedValueOnce(undefined as never);

      await useTopicInsightsStore.getState().deleteTopic('t1');

      expect(useTopicInsightsStore.getState().currentTopic).toBeNull();
    });

    it('should not clear currentTopic if different id deleted', async () => {
      const t1 = { id: 't1', name: 'Topic 1' };
      const t2 = { id: 't2', name: 'Topic 2' };
      useTopicInsightsStore.setState({
        topics: [t1, t2] as never[],
        currentTopic: t2 as never,
      });
      vi.mocked(api.deleteTopic).mockResolvedValueOnce(undefined as never);

      await useTopicInsightsStore.getState().deleteTopic('t1');

      expect(useTopicInsightsStore.getState().currentTopic).toEqual(t2);
    });
  });

  describe('setCurrentTopic', () => {
    it('should set currentTopic', () => {
      const topic = { id: 't1', name: 'Topic 1' };
      useTopicInsightsStore.getState().setCurrentTopic(topic as never);
      expect(useTopicInsightsStore.getState().currentTopic).toEqual(topic);
    });

    it('should set currentTopic to null', () => {
      useTopicInsightsStore.setState({ currentTopic: { id: 't1' } as never });
      useTopicInsightsStore.getState().setCurrentTopic(null);
      expect(useTopicInsightsStore.getState().currentTopic).toBeNull();
    });
  });

  // ==================== Dimensions ====================

  describe('fetchDimensions', () => {
    it('should set dimensions and clear loading on success', async () => {
      const mockDims = [{ id: 'd1', name: 'Financial' }];
      vi.mocked(api.getDimensions).mockResolvedValueOnce(mockDims as never);

      await useTopicInsightsStore.getState().fetchDimensions('t1');

      const state = useTopicInsightsStore.getState();
      expect(state.dimensions).toEqual(mockDims);
      expect(state.isLoadingDimensions).toBe(false);
    });

    it('should clear loading and rethrow on error', async () => {
      vi.mocked(api.getDimensions).mockRejectedValueOnce(
        new Error('Dim error')
      );

      await expect(
        useTopicInsightsStore.getState().fetchDimensions('t1')
      ).rejects.toThrow('Dim error');

      expect(useTopicInsightsStore.getState().isLoadingDimensions).toBe(false);
    });
  });

  describe('addDimension', () => {
    it('should append dimension to state', async () => {
      const existing = { id: 'd1', name: 'Financial' };
      const newDim = { id: 'd2', name: 'Tech' };
      useTopicInsightsStore.setState({ dimensions: [existing as never] });
      vi.mocked(api.addDimension).mockResolvedValueOnce(newDim as never);

      await useTopicInsightsStore
        .getState()
        .addDimension('t1', { name: 'Tech' } as never);

      const dims = useTopicInsightsStore.getState().dimensions;
      expect(dims).toHaveLength(2);
      expect(dims[1]).toEqual(newDim);
    });
  });

  describe('updateDimension', () => {
    it('should update dimension in state', async () => {
      const existing = { id: 'd1', name: 'Old' };
      const updated = { id: 'd1', name: 'New' };
      useTopicInsightsStore.setState({ dimensions: [existing as never] });
      vi.mocked(api.updateDimension).mockResolvedValueOnce(updated as never);

      await useTopicInsightsStore
        .getState()
        .updateDimension('t1', 'd1', { name: 'New' } as never);

      expect(useTopicInsightsStore.getState().dimensions[0]).toEqual(updated);
    });
  });

  describe('deleteDimension', () => {
    it('should remove dimension from state', async () => {
      const d1 = { id: 'd1', name: 'Financial' };
      const d2 = { id: 'd2', name: 'Tech' };
      useTopicInsightsStore.setState({ dimensions: [d1, d2] as never[] });
      vi.mocked(api.deleteDimension).mockResolvedValueOnce(undefined as never);

      await useTopicInsightsStore.getState().deleteDimension('t1', 'd1');

      const dims = useTopicInsightsStore.getState().dimensions;
      expect(dims).toHaveLength(1);
      expect(dims[0].id).toBe('d2');
    });
  });

  describe('reorderDimensions', () => {
    it('should set dimensions from API response', async () => {
      const reordered = [
        { id: 'd2', name: 'Tech' },
        { id: 'd1', name: 'Financial' },
      ];
      vi.mocked(api.reorderDimensions).mockResolvedValueOnce(
        reordered as never
      );

      await useTopicInsightsStore
        .getState()
        .reorderDimensions('t1', { dimensionIds: ['d2', 'd1'] } as never);

      expect(useTopicInsightsStore.getState().dimensions).toEqual(reordered);
    });
  });

  // ==================== Schedule ====================

  describe('fetchSchedule', () => {
    it('should set schedule on success', async () => {
      const mockSchedule = { frequency: 'daily', enabled: true };
      vi.mocked(api.getSchedule).mockResolvedValueOnce(mockSchedule as never);

      await useTopicInsightsStore.getState().fetchSchedule('t1');

      expect(useTopicInsightsStore.getState().schedule).toEqual(mockSchedule);
    });

    it('should rethrow on error', async () => {
      vi.mocked(api.getSchedule).mockRejectedValueOnce(
        new Error('Sched error')
      );

      await expect(
        useTopicInsightsStore.getState().fetchSchedule('t1')
      ).rejects.toThrow('Sched error');
    });
  });

  describe('updateSchedule', () => {
    it('should set schedule from API response', async () => {
      const updatedSchedule = { frequency: 'weekly', enabled: true };
      vi.mocked(api.updateSchedule).mockResolvedValueOnce(
        updatedSchedule as never
      );

      await useTopicInsightsStore
        .getState()
        .updateSchedule('t1', { frequency: 'weekly' } as never);

      expect(useTopicInsightsStore.getState().schedule).toEqual(
        updatedSchedule
      );
    });
  });

  // ==================== Stats ====================

  describe('fetchStats', () => {
    it('should set stats on success', async () => {
      const mockStats = { reportCount: 5, evidenceCount: 20 };
      vi.mocked(api.getStats).mockResolvedValueOnce(mockStats as never);

      await useTopicInsightsStore.getState().fetchStats('t1');

      expect(useTopicInsightsStore.getState().stats).toEqual(mockStats);
    });

    it('should rethrow on error', async () => {
      vi.mocked(api.getStats).mockRejectedValueOnce(new Error('Stats error'));

      await expect(
        useTopicInsightsStore.getState().fetchStats('t1')
      ).rejects.toThrow('Stats error');
    });
  });

  // ==================== Templates ====================

  describe('fetchTemplates', () => {
    it('should set templates and clear loading on success', async () => {
      const mockTemplates = [{ id: 'tmpl1', name: 'Competitor Analysis' }];
      vi.mocked(api.getTemplates).mockResolvedValueOnce(mockTemplates as never);

      await useTopicInsightsStore.getState().fetchTemplates('COMPANY' as never);

      const state = useTopicInsightsStore.getState();
      expect(state.templates).toEqual(mockTemplates);
      expect(state.isLoadingTemplates).toBe(false);
    });

    it('should clear loading and rethrow on error', async () => {
      vi.mocked(api.getTemplates).mockRejectedValueOnce(
        new Error('Templates error')
      );

      await expect(
        useTopicInsightsStore.getState().fetchTemplates('COMPANY' as never)
      ).rejects.toThrow('Templates error');

      expect(useTopicInsightsStore.getState().isLoadingTemplates).toBe(false);
    });
  });

  describe('createFromTemplate', () => {
    it('should prepend new topic and return it', async () => {
      const newTopic = { id: 't-new', name: 'From Template' };
      vi.mocked(api.createFromTemplate).mockResolvedValueOnce(
        newTopic as never
      );

      const result = await useTopicInsightsStore
        .getState()
        .createFromTemplate('tmpl1');

      expect(result).toEqual(newTopic);
      expect(useTopicInsightsStore.getState().topics[0]).toEqual(newTopic);
    });

    it('should pass overrides to api.createFromTemplate', async () => {
      vi.mocked(api.createFromTemplate).mockResolvedValueOnce({
        id: 't-new',
      } as never);

      await useTopicInsightsStore
        .getState()
        .createFromTemplate('tmpl1', { name: 'Custom' } as never);

      expect(vi.mocked(api.createFromTemplate)).toHaveBeenCalledWith('tmpl1', {
        name: 'Custom',
      });
    });
  });
});
