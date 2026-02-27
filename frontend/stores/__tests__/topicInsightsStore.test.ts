import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from '@testing-library/react';

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

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
  triggerRefresh: vi.fn(),
  cancelRefresh: vi.fn(),
  getRefreshStatus: vi.fn(),
  createRefreshProgressStream: vi.fn(),
  getMission: vi.fn(),
  getMissionHealth: vi.fn(),
  getTeam: vi.fn(),
  leaderPlan: vi.fn(),
  sendLeaderMessage: vi.fn(),
  approveMissionPlan: vi.fn(),
  retryMission: vi.fn(),
  cancelMission: vi.fn(),
  getTeamMessages: vi.fn(),
  getAgentActivities: vi.fn(),
  getReports: vi.fn(),
  getLatestReport: vi.fn(),
  getReport: vi.fn(),
  deleteReport: vi.fn(),
  waitForExportCompletion: vi.fn(),
  compareReports: vi.fn(),
  rollbackReport: vi.fn(),
  getEvidence: vi.fn(),
  getSchedule: vi.fn(),
  updateSchedule: vi.fn(),
  getLogs: vi.fn(),
  getStats: vi.fn(),
  getTemplates: vi.fn(),
  createFromTemplate: vi.fn(),
  getTodos: vi.fn(),
  pauseTodo: vi.fn(),
  resumeTodo: vi.fn(),
  cancelTodo: vi.fn(),
  retryTodo: vi.fn(),
  prioritizeTodo: vi.fn(),
  createUserRequestTodo: vi.fn(),
}));

import { useTopicInsightsStore } from '../topicInsightsStore';
import * as api from '@/lib/api/topic-insights';
import type {
  ResearchTopic,
  TopicDimension,
  TopicReport,
  ResearchTodo,
  TodoSummary,
  TopicStats,
  ResearchTemplate,
  TopicRefreshLog,
  CreateTopicDto,
  UpdateTopicDto,
} from '@/types/topic-insights';
import type { MissionStatus } from '@/lib/api/topic-insights';

const mockApi = vi.mocked(api);

const makeTopic = (id = 'topic-1'): ResearchTopic =>
  ({
    id,
    title: 'Test Topic',
    description: 'A test topic',
    type: 'RESEARCH' as unknown as ResearchTopic['type'],
    status: 'active',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  }) as unknown as ResearchTopic;

const makeDimension = (id = 'dim-1'): TopicDimension =>
  ({
    id,
    topicId: 'topic-1',
    name: 'Test Dimension',
    description: 'A test dimension',
    order: 0,
    createdAt: '2024-01-01T00:00:00Z',
  }) as unknown as TopicDimension;

const makeReport = (id = 'report-1'): TopicReport =>
  ({
    id,
    topicId: 'topic-1',
    content: 'Report content',
    createdAt: '2024-01-01T00:00:00Z',
  }) as unknown as TopicReport;

const makeMissionStatus = (status = 'EXECUTING'): MissionStatus =>
  ({
    id: 'mission-1',
    topicId: 'topic-1',
    status,
    currentPhase: 'Researching',
    progress: 50,
    completedTasks: 2,
    totalTasks: 4,
    createdAt: '2024-01-01T00:00:00Z',
  }) as unknown as MissionStatus;

describe('useTopicInsightsStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    act(() => {
      useTopicInsightsStore.getState().resetStore();
    });
  });

  // ============================================================
  // Initial State
  // ============================================================
  describe('initial state', () => {
    it('has empty topics array', () => {
      expect(useTopicInsightsStore.getState().topics).toEqual([]);
    });

    it('has null currentTopic', () => {
      expect(useTopicInsightsStore.getState().currentTopic).toBeNull();
    });

    it('has isLoadingTopics false', () => {
      expect(useTopicInsightsStore.getState().isLoadingTopics).toBe(false);
    });

    it('has null error', () => {
      expect(useTopicInsightsStore.getState().error).toBeNull();
    });

    it('has empty todos and null todosSummary', () => {
      const state = useTopicInsightsStore.getState();
      expect(state.todos).toEqual([]);
      expect(state.todosSummary).toBeNull();
    });
  });

  // ============================================================
  // Topics
  // ============================================================
  describe('fetchTopics', () => {
    it('loads topics and clears loading state', async () => {
      const topics = [makeTopic('t1'), makeTopic('t2')];
      mockApi.getTopics.mockResolvedValue(topics);

      await act(async () => {
        await useTopicInsightsStore.getState().fetchTopics();
      });

      const state = useTopicInsightsStore.getState();
      expect(state.topics).toEqual(topics);
      expect(state.isLoadingTopics).toBe(false);
      expect(state.error).toBeNull();
    });

    it('sets error and throws on failure', async () => {
      mockApi.getTopics.mockRejectedValue(new Error('Network error'));

      await expect(
        act(async () => {
          await useTopicInsightsStore.getState().fetchTopics();
        })
      ).rejects.toThrow('Network error');

      const state = useTopicInsightsStore.getState();
      expect(state.error).toBe('Network error');
      expect(state.isLoadingTopics).toBe(false);
    });
  });

  describe('fetchTopic', () => {
    it('sets currentTopic and updates topics list', async () => {
      const topic = makeTopic('t1');
      mockApi.getTopic.mockResolvedValue(topic);

      // Pre-populate topics list
      act(() => {
        useTopicInsightsStore.setState({ topics: [makeTopic('t1')] });
      });

      await act(async () => {
        await useTopicInsightsStore.getState().fetchTopic('t1');
      });

      const state = useTopicInsightsStore.getState();
      expect(state.currentTopic).toEqual(topic);
      expect(state.topics[0]).toEqual(topic);
    });

    it('sets error and throws on failure', async () => {
      mockApi.getTopic.mockRejectedValue(new Error('Not found'));

      await expect(
        act(async () => {
          await useTopicInsightsStore.getState().fetchTopic('bad-id');
        })
      ).rejects.toThrow('Not found');

      expect(useTopicInsightsStore.getState().error).toBe('Not found');
    });
  });

  describe('createTopic', () => {
    it('prepends the new topic to list and returns it', async () => {
      const topic = makeTopic('new-1');
      mockApi.createTopic.mockResolvedValue(topic);

      act(() => {
        useTopicInsightsStore.setState({ topics: [makeTopic('old-1')] });
      });

      let result: ReturnType<typeof makeTopic> | undefined;
      await act(async () => {
        result = await useTopicInsightsStore
          .getState()
          .createTopic({
            title: 'New',
            type: 'RESEARCH',
          } as unknown as CreateTopicDto);
      });

      expect(result).toEqual(topic);
      expect(useTopicInsightsStore.getState().topics[0]).toEqual(topic);
      expect(useTopicInsightsStore.getState().topics).toHaveLength(2);
    });
  });

  describe('updateTopic', () => {
    it('updates topic in list and currentTopic', async () => {
      const updated = { ...makeTopic('t1'), title: 'Updated' };
      mockApi.updateTopic.mockResolvedValue(updated);

      act(() => {
        useTopicInsightsStore.setState({
          topics: [makeTopic('t1')],
          currentTopic: makeTopic('t1'),
        });
      });

      await act(async () => {
        await useTopicInsightsStore
          .getState()
          .updateTopic('t1', { title: 'Updated' } as unknown as UpdateTopicDto);
      });

      const state = useTopicInsightsStore.getState();
      expect((state.topics[0] as unknown as { title: string }).title).toBe(
        'Updated'
      );
      expect(
        (state.currentTopic as unknown as { title: string } | null)?.title
      ).toBe('Updated');
    });
  });

  describe('patchTopic', () => {
    it('applies local patch to topics list without API call', () => {
      act(() => {
        useTopicInsightsStore.setState({
          topics: [makeTopic('t1')],
          currentTopic: makeTopic('t1'),
        });
      });

      act(() => {
        useTopicInsightsStore
          .getState()
          .patchTopic('t1', {
            title: 'Patched',
          } as unknown as Partial<ResearchTopic>);
      });

      const state = useTopicInsightsStore.getState();
      expect((state.topics[0] as unknown as { title: string }).title).toBe(
        'Patched'
      );
      expect(
        (state.currentTopic as unknown as { title: string } | null)?.title
      ).toBe('Patched');
      expect(mockApi.updateTopic).not.toHaveBeenCalled();
    });
  });

  describe('deleteTopic', () => {
    it('removes topic from list and clears currentTopic if matching', async () => {
      mockApi.deleteTopic.mockResolvedValue(undefined);

      act(() => {
        useTopicInsightsStore.setState({
          topics: [makeTopic('t1'), makeTopic('t2')],
          currentTopic: makeTopic('t1'),
        });
      });

      await act(async () => {
        await useTopicInsightsStore.getState().deleteTopic('t1');
      });

      const state = useTopicInsightsStore.getState();
      expect(state.topics).toHaveLength(1);
      expect(state.topics[0].id).toBe('t2');
      expect(state.currentTopic).toBeNull();
    });
  });

  describe('setCurrentTopic', () => {
    it('sets and clears currentTopic', () => {
      act(() => {
        useTopicInsightsStore.getState().setCurrentTopic(makeTopic('t1'));
      });
      expect(useTopicInsightsStore.getState().currentTopic?.id).toBe('t1');

      act(() => {
        useTopicInsightsStore.getState().setCurrentTopic(null);
      });
      expect(useTopicInsightsStore.getState().currentTopic).toBeNull();
    });
  });

  // ============================================================
  // Dimensions
  // ============================================================
  describe('fetchDimensions', () => {
    it('loads dimensions successfully', async () => {
      const dims = [makeDimension('d1'), makeDimension('d2')];
      mockApi.getDimensions.mockResolvedValue(dims);

      await act(async () => {
        await useTopicInsightsStore.getState().fetchDimensions('t1');
      });

      const state = useTopicInsightsStore.getState();
      expect(state.dimensions).toEqual(dims);
      expect(state.isLoadingDimensions).toBe(false);
    });

    it('sets error on failure', async () => {
      mockApi.getDimensions.mockRejectedValue(new Error('API error'));

      await expect(
        act(async () => {
          await useTopicInsightsStore.getState().fetchDimensions('t1');
        })
      ).rejects.toThrow('API error');

      expect(useTopicInsightsStore.getState().error).toBe('API error');
    });
  });

  describe('addDimension', () => {
    it('appends new dimension to list', async () => {
      const dim = makeDimension('new-d');
      mockApi.addDimension.mockResolvedValue(dim);

      act(() => {
        useTopicInsightsStore.setState({ dimensions: [makeDimension('d1')] });
      });

      await act(async () => {
        await useTopicInsightsStore
          .getState()
          .addDimension('t1', { name: 'New Dim' });
      });

      expect(useTopicInsightsStore.getState().dimensions).toHaveLength(2);
    });
  });

  describe('deleteDimension', () => {
    it('removes dimension from list', async () => {
      mockApi.deleteDimension.mockResolvedValue(undefined);

      act(() => {
        useTopicInsightsStore.setState({
          dimensions: [makeDimension('d1'), makeDimension('d2')],
        });
      });

      await act(async () => {
        await useTopicInsightsStore.getState().deleteDimension('t1', 'd1');
      });

      const state = useTopicInsightsStore.getState();
      expect(state.dimensions).toHaveLength(1);
      expect(state.dimensions[0].id).toBe('d2');
    });
  });

  // ============================================================
  // Reports
  // ============================================================
  describe('fetchReports', () => {
    it('loads reports for initial fetch', async () => {
      const reports = [makeReport('r1'), makeReport('r2')];
      mockApi.getReports.mockResolvedValue({
        reports,
        hasMore: false,
        nextCursor: null as unknown as string | undefined,
      });

      await act(async () => {
        await useTopicInsightsStore.getState().fetchReports('t1');
      });

      const state = useTopicInsightsStore.getState();
      expect(state.reports).toEqual(reports);
      expect(state.hasMoreReports).toBe(false);
      expect(state.isLoadingReports).toBe(false);
    });

    it('silently ignores Report not found errors', async () => {
      mockApi.getReports.mockRejectedValue(new Error('No reports found'));

      await act(async () => {
        await useTopicInsightsStore.getState().fetchReports('t1');
      });

      // Should NOT throw and should NOT set error
      expect(useTopicInsightsStore.getState().error).toBeNull();
    });
  });

  describe('fetchLatestReport', () => {
    it('sets currentReport on success', async () => {
      const report = makeReport('r1');
      mockApi.getLatestReport.mockResolvedValue(report);

      await act(async () => {
        await useTopicInsightsStore.getState().fetchLatestReport('t1');
      });

      expect(useTopicInsightsStore.getState().currentReport).toEqual(report);
    });

    it('clears currentReport and ignores 404 errors silently', async () => {
      mockApi.getLatestReport.mockRejectedValue(new Error('Report not found'));

      await act(async () => {
        await useTopicInsightsStore.getState().fetchLatestReport('t1');
      });

      const state = useTopicInsightsStore.getState();
      expect(state.currentReport).toBeNull();
      expect(state.error).toBeNull();
    });
  });

  describe('setCurrentReport', () => {
    it('sets and clears currentReport', () => {
      act(() => {
        useTopicInsightsStore.getState().setCurrentReport(makeReport('r1'));
      });
      expect(useTopicInsightsStore.getState().currentReport?.id).toBe('r1');

      act(() => {
        useTopicInsightsStore.getState().setCurrentReport(null);
      });
      expect(useTopicInsightsStore.getState().currentReport).toBeNull();
    });
  });

  describe('deleteReport', () => {
    it('removes report from list and clears currentReport if matching', async () => {
      mockApi.deleteReport.mockResolvedValue(
        undefined as unknown as { success: boolean; message: string }
      );

      act(() => {
        useTopicInsightsStore.setState({
          reports: [makeReport('r1'), makeReport('r2')],
          currentReport: makeReport('r1'),
        });
      });

      await act(async () => {
        await useTopicInsightsStore.getState().deleteReport('t1', 'r1');
      });

      const state = useTopicInsightsStore.getState();
      expect(state.reports).toHaveLength(1);
      expect(state.currentReport).toBeNull();
    });
  });

  // ============================================================
  // Mission
  // ============================================================
  describe('fetchMissionStatus', () => {
    it('sets missionStatus and refreshProgress for active mission', async () => {
      const mission = makeMissionStatus('EXECUTING');
      mockApi.getMission.mockResolvedValue(mission);
      // Prevent auto-polling
      vi.spyOn(
        useTopicInsightsStore.getState(),
        'startMissionPolling'
      ).mockImplementation(() => {});

      await act(async () => {
        await useTopicInsightsStore.getState().fetchMissionStatus('t1');
      });

      const state = useTopicInsightsStore.getState();
      expect(state.missionStatus).toEqual(mission);
      expect(state.isRefreshing).toBe(true);
      expect(state.refreshProgress).not.toBeNull();
    });

    it('does not set error for No active mission', async () => {
      mockApi.getMission.mockRejectedValue(new Error('No active mission'));

      await act(async () => {
        await useTopicInsightsStore.getState().fetchMissionStatus('t1');
      });

      expect(useTopicInsightsStore.getState().error).toBeNull();
    });
  });

  describe('cancelMission', () => {
    it('resets refresh state after cancellation', async () => {
      mockApi.cancelMission.mockResolvedValue(
        undefined as unknown as { success: boolean }
      );
      mockApi.getMission.mockResolvedValue(makeMissionStatus('CANCELLED'));

      act(() => {
        useTopicInsightsStore.setState({ isRefreshing: true });
      });

      await act(async () => {
        await useTopicInsightsStore.getState().cancelMission('t1');
      });

      const state = useTopicInsightsStore.getState();
      expect(state.isRefreshing).toBe(false);
      expect(state.refreshProgress).toBeNull();
      expect(state.currentMission).toBeNull();
    });
  });

  // ============================================================
  // Todos
  // ============================================================
  describe('fetchTodos', () => {
    it('loads todos and summary', async () => {
      const todos = [
        { id: 'todo-1', title: 'Do something', status: 'PENDING' },
      ] as unknown as ResearchTodo[];
      const summary = {
        total: 1,
        pending: 1,
        completed: 0,
        failed: 0,
      } as unknown as TodoSummary;
      mockApi.getTodos.mockResolvedValue({ todos, summary });

      await act(async () => {
        await useTopicInsightsStore.getState().fetchTodos('t1');
      });

      const state = useTopicInsightsStore.getState();
      expect(state.todos).toEqual(todos);
      expect(state.todosSummary).toEqual(summary);
      expect(state.isLoadingTodos).toBe(false);
    });

    it('sets error and throws on failure', async () => {
      mockApi.getTodos.mockRejectedValue(new Error('Failed to load todos'));

      await expect(
        act(async () => {
          await useTopicInsightsStore.getState().fetchTodos('t1');
        })
      ).rejects.toThrow('Failed to load todos');

      expect(useTopicInsightsStore.getState().error).toBe(
        'Failed to load todos'
      );
    });
  });

  describe('selectTodo', () => {
    it('sets selectedTodoId', () => {
      act(() => {
        useTopicInsightsStore.getState().selectTodo('todo-123');
      });
      expect(useTopicInsightsStore.getState().selectedTodoId).toBe('todo-123');

      act(() => {
        useTopicInsightsStore.getState().selectTodo(null);
      });
      expect(useTopicInsightsStore.getState().selectedTodoId).toBeNull();
    });
  });

  describe('updateTodoFromWs', () => {
    it('updates existing todo in list', () => {
      const existing = {
        id: 'todo-1',
        title: 'Old',
        status: 'PENDING',
      } as unknown as ResearchTodo;
      const updated = {
        id: 'todo-1',
        title: 'Updated',
        status: 'RUNNING',
      } as unknown as ResearchTodo;

      act(() => {
        useTopicInsightsStore.setState({ todos: [existing] });
      });

      act(() => {
        useTopicInsightsStore.getState().updateTodoFromWs(updated);
      });

      expect(
        (
          useTopicInsightsStore.getState().todos[0] as unknown as {
            title: string;
          }
        ).title
      ).toBe('Updated');
    });

    it('prepends new todo if not in list', () => {
      const existing = {
        id: 'todo-1',
        title: 'Old',
        status: 'PENDING',
      } as unknown as ResearchTodo;
      const newTodo = {
        id: 'todo-2',
        title: 'New',
        status: 'PENDING',
      } as unknown as ResearchTodo;

      act(() => {
        useTopicInsightsStore.setState({ todos: [existing] });
      });

      act(() => {
        useTopicInsightsStore.getState().updateTodoFromWs(newTodo);
      });

      const todos = useTopicInsightsStore.getState().todos;
      expect(todos).toHaveLength(2);
      expect(todos[0].id).toBe('todo-2');
    });
  });

  // ============================================================
  // Stats, Templates, Logs
  // ============================================================
  describe('fetchStats', () => {
    it('sets stats on success', async () => {
      const stats = { total: 10, active: 5 } as unknown as TopicStats;
      mockApi.getStats.mockResolvedValue(stats);

      await act(async () => {
        await useTopicInsightsStore.getState().fetchStats('t1');
      });

      expect(useTopicInsightsStore.getState().stats).toEqual(stats);
    });
  });

  describe('fetchTemplates', () => {
    it('loads templates', async () => {
      const templates = [
        { id: 'tmpl-1', name: 'Template 1' },
      ] as unknown as ResearchTemplate[];
      mockApi.getTemplates.mockResolvedValue(templates);

      await act(async () => {
        await useTopicInsightsStore
          .getState()
          .fetchTemplates('RESEARCH' as never);
      });

      const state = useTopicInsightsStore.getState();
      expect(state.templates).toEqual(templates);
      expect(state.isLoadingTemplates).toBe(false);
    });
  });

  describe('fetchLogs', () => {
    it('loads logs', async () => {
      const logs = [
        { id: 'log-1', message: 'Started' },
      ] as unknown as TopicRefreshLog[];
      mockApi.getLogs.mockResolvedValue(logs);

      await act(async () => {
        await useTopicInsightsStore.getState().fetchLogs('t1');
      });

      const state = useTopicInsightsStore.getState();
      expect(state.logs).toEqual(logs);
      expect(state.isLoadingLogs).toBe(false);
    });
  });

  // ============================================================
  // UI Actions
  // ============================================================
  describe('clearError', () => {
    it('resets error to null', () => {
      act(() => {
        useTopicInsightsStore.setState({ error: 'Some error' });
      });

      act(() => {
        useTopicInsightsStore.getState().clearError();
      });

      expect(useTopicInsightsStore.getState().error).toBeNull();
    });
  });

  describe('resetTopicData', () => {
    it('clears topic-specific data but preserves topics list', () => {
      act(() => {
        useTopicInsightsStore.setState({
          topics: [makeTopic('t1')],
          reports: [makeReport('r1')],
          dimensions: [makeDimension('d1')],
          isRefreshing: true,
          error: 'err',
        });
      });

      act(() => {
        useTopicInsightsStore.getState().resetTopicData();
      });

      const state = useTopicInsightsStore.getState();
      // Preserved
      expect(state.topics).toHaveLength(1);
      // Cleared
      expect(state.reports).toEqual([]);
      expect(state.dimensions).toEqual([]);
      expect(state.isRefreshing).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  describe('resetStore', () => {
    it('resets all state to initial values', () => {
      act(() => {
        useTopicInsightsStore.setState({
          topics: [makeTopic()],
          currentTopic: makeTopic(),
          error: 'Some error',
          isRefreshing: true,
        });
      });

      act(() => {
        useTopicInsightsStore.getState().resetStore();
      });

      const state = useTopicInsightsStore.getState();
      expect(state.topics).toEqual([]);
      expect(state.currentTopic).toBeNull();
      expect(state.error).toBeNull();
      expect(state.isRefreshing).toBe(false);
    });
  });
});
