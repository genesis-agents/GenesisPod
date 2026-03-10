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
import type {
  MissionStatus,
  MissionHealthStatus,
  TeamMessage,
  AgentActivity,
} from '@/lib/api/topic-insights';

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

const makeMissionStatus = (status: string = 'EXECUTING'): MissionStatus =>
  ({
    id: 'mission-1',
    topicId: 'topic-1',
    status,
    currentPhase: 'Researching',
    progress: 50,
    completedTasks: 2,
    totalTasks: 4,
    tasks: [],
    createdAt: '2024-01-01T00:00:00Z',
  }) as unknown as MissionStatus;

const makeMissionHealthStatus = (
  overrides: Partial<MissionHealthStatus> = {}
): MissionHealthStatus => ({
  missionId: 'mission-1',
  isHealthy: true,
  status: 'EXECUTING',
  progress: 50,
  startedAt: '2024-01-01T00:00:00Z',
  lastActivityAt: '2024-01-01T00:00:00Z',
  stuckDurationMs: 0,
  estimatedRecoveryPossible: true,
  issues: [],
  ...overrides,
});

const makeTeamMessage = (
  overrides: Partial<TeamMessage> = {}
): TeamMessage => ({
  id: 'msg-1',
  topicId: 'topic-1',
  messageType: 'SYSTEM_MESSAGE',
  senderRole: 'system',
  senderName: 'System',
  content: 'test message',
  createdAt: '2024-01-01T00:00:00Z',
  ...overrides,
});

const makeAgentActivity = (
  overrides: Partial<AgentActivity> = {}
): AgentActivity => ({
  id: 'act-1',
  topicId: 'topic-1',
  agentName: 'Researcher',
  agentRole: 'researcher',
  activityType: 'RESEARCHING',
  content: 'Researching...',
  createdAt: '2024-01-01T00:00:00Z',
  ...overrides,
});

describe('useTopicInsightsStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
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
      mockApi.getTopics.mockResolvedValue({
        topics,
        total: topics.length,
        skip: 0,
        take: 20,
      });

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
        result = await useTopicInsightsStore.getState().createTopic({
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
        useTopicInsightsStore.getState().patchTopic('t1', {
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
      const pollingSpy = vi
        .spyOn(useTopicInsightsStore.getState(), 'startMissionPolling')
        .mockImplementation(() => {});

      await act(async () => {
        await useTopicInsightsStore.getState().fetchMissionStatus('t1');
      });

      const state = useTopicInsightsStore.getState();
      expect(state.missionStatus).toEqual(mission);
      expect(state.isRefreshing).toBe(true);
      expect(state.refreshProgress).not.toBeNull();

      // Restore spy so it doesn't contaminate subsequent tests
      pollingSpy.mockRestore();
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

  // ============================================================
  // patchTopic - non-matching currentTopic
  // ============================================================
  describe('patchTopic - edge cases', () => {
    it('does not change currentTopic when it has a different id', () => {
      act(() => {
        useTopicInsightsStore.setState({
          topics: [makeTopic('t1'), makeTopic('t2')],
          currentTopic: makeTopic('t2'),
        });
      });

      act(() => {
        useTopicInsightsStore.getState().patchTopic('t1', {
          title: 'Patched',
        } as unknown as Partial<ResearchTopic>);
      });

      const state = useTopicInsightsStore.getState();
      expect(
        (state.currentTopic as unknown as { title: string } | null)?.title
      ).toBe('Test Topic');
    });

    it('does not change currentTopic when currentTopic is null', () => {
      act(() => {
        useTopicInsightsStore.setState({
          topics: [makeTopic('t1')],
          currentTopic: null,
        });
      });

      act(() => {
        useTopicInsightsStore.getState().patchTopic('t1', {
          title: 'Patched',
        } as unknown as Partial<ResearchTopic>);
      });

      expect(useTopicInsightsStore.getState().currentTopic).toBeNull();
    });
  });

  // ============================================================
  // deleteTopic - currentTopic not deleted
  // ============================================================
  describe('deleteTopic - non-matching currentTopic', () => {
    it('preserves currentTopic when deleting a different topic', async () => {
      mockApi.deleteTopic.mockResolvedValue(undefined);

      act(() => {
        useTopicInsightsStore.setState({
          topics: [makeTopic('t1'), makeTopic('t2')],
          currentTopic: makeTopic('t2'),
        });
      });

      await act(async () => {
        await useTopicInsightsStore.getState().deleteTopic('t1');
      });

      const state = useTopicInsightsStore.getState();
      expect(state.currentTopic?.id).toBe('t2');
      expect(state.topics).toHaveLength(1);
    });
  });

  // ============================================================
  // updateDimension
  // ============================================================
  describe('updateDimension', () => {
    it('updates the dimension in the list', async () => {
      const updated = { ...makeDimension('d1'), name: 'Updated' };
      mockApi.updateDimension.mockResolvedValue(updated);

      act(() => {
        useTopicInsightsStore.setState({
          dimensions: [makeDimension('d1'), makeDimension('d2')],
        });
      });

      await act(async () => {
        await useTopicInsightsStore
          .getState()
          .updateDimension('t1', 'd1', { name: 'Updated' });
      });

      const state = useTopicInsightsStore.getState();
      expect((state.dimensions[0] as unknown as { name: string }).name).toBe(
        'Updated'
      );
      expect(state.dimensions[1].id).toBe('d2');
    });
  });

  // ============================================================
  // refreshDimension
  // ============================================================
  describe('refreshDimension', () => {
    it('calls API and re-fetches dimensions', async () => {
      mockApi.refreshDimension.mockResolvedValue({
        success: true,
        message: 'ok',
      });
      const dims = [makeDimension('d1')];
      mockApi.getDimensions.mockResolvedValue(dims);

      await act(async () => {
        await useTopicInsightsStore.getState().refreshDimension('t1', 'd1');
      });

      expect(mockApi.refreshDimension).toHaveBeenCalledWith('t1', 'd1');
      expect(useTopicInsightsStore.getState().dimensions).toEqual(dims);
    });
  });

  // ============================================================
  // reorderDimensions
  // ============================================================
  describe('reorderDimensions', () => {
    it('updates dimensions to the reordered result', async () => {
      const reordered = [makeDimension('d2'), makeDimension('d1')];
      mockApi.reorderDimensions.mockResolvedValue(reordered);

      await act(async () => {
        await useTopicInsightsStore
          .getState()
          .reorderDimensions('t1', { dimensionIds: ['d2', 'd1'] });
      });

      expect(useTopicInsightsStore.getState().dimensions[0].id).toBe('d2');
    });
  });

  // ============================================================
  // triggerRefresh
  // ============================================================
  describe('triggerRefresh', () => {
    it('sets isRefreshing and calls startRefreshProgressStream on success', async () => {
      mockApi.triggerRefresh.mockResolvedValue({
        jobId: 'j1',
        message: 'started',
      });
      const mockStream = { close: vi.fn() };
      mockApi.createRefreshProgressStream.mockReturnValue(mockStream);

      await act(async () => {
        await useTopicInsightsStore.getState().triggerRefresh('t1');
      });

      expect(useTopicInsightsStore.getState().refreshStream).toBe(mockStream);
    });

    it('sets error and throws on failure', async () => {
      mockApi.triggerRefresh.mockRejectedValue(new Error('Refresh failed'));

      await expect(
        act(async () => {
          await useTopicInsightsStore.getState().triggerRefresh('t1');
        })
      ).rejects.toThrow('Refresh failed');

      const state = useTopicInsightsStore.getState();
      expect(state.isRefreshing).toBe(false);
      expect(state.error).toBe('Refresh failed');
    });
  });

  // ============================================================
  // cancelRefresh
  // ============================================================
  describe('cancelRefresh', () => {
    it('stops stream and resets refresh state on success', async () => {
      mockApi.cancelRefresh.mockResolvedValue({
        success: true,
        message: 'cancelled',
      });
      const mockStream = { close: vi.fn() };

      act(() => {
        useTopicInsightsStore.setState({
          isRefreshing: true,
          refreshStream: mockStream,
          refreshProgress: {
            phase: 'x',
            progress: 50,
            message: 'msg',
            completedDimensions: 1,
            totalDimensions: 2,
          },
        });
      });

      await act(async () => {
        await useTopicInsightsStore.getState().cancelRefresh('t1', 'job-1');
      });

      const state = useTopicInsightsStore.getState();
      expect(state.isRefreshing).toBe(false);
      expect(state.refreshProgress).toBeNull();
      expect(mockStream.close).toHaveBeenCalled();
    });

    it('sets error and throws on cancel failure', async () => {
      mockApi.cancelRefresh.mockRejectedValue(new Error('Cancel failed'));

      await expect(
        act(async () => {
          await useTopicInsightsStore.getState().cancelRefresh('t1', 'job-1');
        })
      ).rejects.toThrow('Cancel failed');

      expect(useTopicInsightsStore.getState().error).toBe('Cancel failed');
    });
  });

  // ============================================================
  // fetchRefreshStatus
  // ============================================================
  describe('fetchRefreshStatus', () => {
    it('sets refreshStatus and isRefreshing from response', async () => {
      const status = { isRunning: true, jobId: 'job-1' } as never;
      mockApi.getRefreshStatus.mockResolvedValue(status);

      await act(async () => {
        await useTopicInsightsStore.getState().fetchRefreshStatus('t1');
      });

      const state = useTopicInsightsStore.getState();
      expect(state.refreshStatus).toEqual(status);
      expect(state.isRefreshing).toBe(true);
    });

    it('sets error and throws on failure', async () => {
      mockApi.getRefreshStatus.mockRejectedValue(new Error('Status error'));

      await expect(
        act(async () => {
          await useTopicInsightsStore.getState().fetchRefreshStatus('t1');
        })
      ).rejects.toThrow('Status error');

      expect(useTopicInsightsStore.getState().error).toBe('Status error');
    });
  });

  // ============================================================
  // startRefreshProgressStream / stopRefreshProgressStream
  // ============================================================
  describe('startRefreshProgressStream', () => {
    it('creates a stream and stores it', () => {
      const mockStream = { close: vi.fn() };
      mockApi.createRefreshProgressStream.mockReturnValue(mockStream);

      act(() => {
        useTopicInsightsStore.getState().startRefreshProgressStream('t1');
      });

      expect(useTopicInsightsStore.getState().refreshStream).toBe(mockStream);
    });

    it('closes existing stream before creating new one', () => {
      const oldStream = { close: vi.fn() };
      const newStream = { close: vi.fn() };

      act(() => {
        useTopicInsightsStore.setState({ refreshStream: oldStream });
      });

      mockApi.createRefreshProgressStream.mockReturnValue(newStream);

      act(() => {
        useTopicInsightsStore.getState().startRefreshProgressStream('t1');
      });

      expect(oldStream.close).toHaveBeenCalled();
      expect(useTopicInsightsStore.getState().refreshStream).toBe(newStream);
    });

    it('calls onProgress callback and sets refreshProgress', () => {
      const progressEvent = {
        phase: 'research',
        progress: 40,
        message: 'researching',
        completedDimensions: 2,
        totalDimensions: 5,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let capturedCallbacks: Record<string, (event: any) => void> = {};
      mockApi.createRefreshProgressStream.mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((
          _topicId: string,
          callbacks: Record<string, (event: any) => void>
        ) => {
          capturedCallbacks = callbacks;
          return { close: vi.fn() };
        }) as never
      );

      act(() => {
        useTopicInsightsStore.getState().startRefreshProgressStream('t1');
      });

      act(() => {
        capturedCallbacks.onProgress(progressEvent);
      });

      expect(useTopicInsightsStore.getState().refreshProgress).toEqual(
        progressEvent
      );
    });

    it('calls onError callback and sets error state', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let capturedCallbacks: Record<string, (event: any) => void> = {};
      mockApi.createRefreshProgressStream.mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((
          _topicId: string,
          callbacks: Record<string, (event: any) => void>
        ) => {
          capturedCallbacks = callbacks;
          return { close: vi.fn() };
        }) as never
      );

      act(() => {
        useTopicInsightsStore.getState().startRefreshProgressStream('t1');
      });

      act(() => {
        capturedCallbacks.onError({ error: 'stream error' });
      });

      const state = useTopicInsightsStore.getState();
      expect(state.error).toBe('stream error');
      expect(state.isRefreshing).toBe(false);
      expect(state.refreshProgress).toBeNull();
    });
  });

  describe('stopRefreshProgressStream', () => {
    it('closes and clears the refresh stream', () => {
      const mockStream = { close: vi.fn() };

      act(() => {
        useTopicInsightsStore.setState({ refreshStream: mockStream });
      });

      act(() => {
        useTopicInsightsStore.getState().stopRefreshProgressStream();
      });

      expect(mockStream.close).toHaveBeenCalled();
      expect(useTopicInsightsStore.getState().refreshStream).toBeNull();
    });

    it('does nothing when no stream is active', () => {
      act(() => {
        useTopicInsightsStore.setState({ refreshStream: null });
      });

      // Should not throw
      expect(() => {
        act(() => {
          useTopicInsightsStore.getState().stopRefreshProgressStream();
        });
      }).not.toThrow();
    });
  });

  // ============================================================
  // startLeaderPlan
  // ============================================================
  describe('startLeaderPlan', () => {
    it('sets mission and starts polling on success', async () => {
      const mission = { id: 'mission-1', status: 'PLANNING' } as never;
      mockApi.leaderPlan.mockResolvedValue(mission);
      // Prevent auto-polling from getMission side effects
      mockApi.getMission.mockResolvedValue(makeMissionStatus('PLANNING'));

      await act(async () => {
        await useTopicInsightsStore
          .getState()
          .startLeaderPlan('t1', 'research this topic', 'fresh');
      });

      const state = useTopicInsightsStore.getState();
      expect(state.currentMission).toEqual(mission);
      expect(state.isLoadingMission).toBe(false);
      expect(mockApi.leaderPlan).toHaveBeenCalledWith('t1', {
        userPrompt: 'research this topic',
        mode: 'fresh',
        researchDepth: undefined,
      });

      // Stop polling to clean up
      act(() => {
        useTopicInsightsStore.getState().stopMissionPolling();
      });
    });

    it('sets error and throws on failure', async () => {
      mockApi.leaderPlan.mockRejectedValue(new Error('Leader plan failed'));

      await expect(
        act(async () => {
          await useTopicInsightsStore.getState().startLeaderPlan('t1');
        })
      ).rejects.toThrow('Leader plan failed');

      const state = useTopicInsightsStore.getState();
      expect(state.isRefreshing).toBe(false);
      expect(state.isLoadingMission).toBe(false);
      expect(state.error).toBe('Leader plan failed');
    });
  });

  // ============================================================
  // fetchMissionStatus - completed mission
  // ============================================================
  describe('fetchMissionStatus - completed mission', () => {
    it('fetches latest report when status is COMPLETED (fire-and-forget)', async () => {
      const completedMission = makeMissionStatus('COMPLETED');
      mockApi.getMission.mockResolvedValue(completedMission);
      // getLatestReport is called via fire-and-forget (void), so just set up mock
      mockApi.getLatestReport.mockResolvedValue(makeReport('r-latest'));

      await act(async () => {
        await useTopicInsightsStore.getState().fetchMissionStatus('t1');
      });

      // Give the fire-and-forget promise a tick to resolve
      await act(async () => {
        await Promise.resolve();
      });

      // fetchLatestReport calls api.getLatestReport
      expect(mockApi.getLatestReport).toHaveBeenCalled();
    });

    it('sets error for non-report-not-found errors', async () => {
      // Reset store to clear any spy interference
      act(() => {
        useTopicInsightsStore.getState().resetStore();
      });
      mockApi.getMission.mockRejectedValue(new Error('Server error'));

      await act(async () => {
        await useTopicInsightsStore.getState().fetchMissionStatus('t1');
      });

      expect(useTopicInsightsStore.getState().error).toBe('Server error');
    });

    it('does not set error for 404 mission errors', async () => {
      mockApi.getMission.mockRejectedValue(new Error('404 not found'));

      await act(async () => {
        await useTopicInsightsStore.getState().fetchMissionStatus('t1');
      });

      expect(useTopicInsightsStore.getState().error).toBeNull();
    });

    it('sets missionStatus correctly for COMPLETED status', async () => {
      const completedMission = makeMissionStatus('COMPLETED');
      mockApi.getMission.mockResolvedValue(completedMission);
      mockApi.getLatestReport.mockResolvedValue(makeReport('r1'));

      await act(async () => {
        await useTopicInsightsStore.getState().fetchMissionStatus('t1');
      });

      // COMPLETED mission should be set in missionStatus
      const state = useTopicInsightsStore.getState();
      expect(state.missionStatus).toEqual(completedMission);
    });
  });

  // ============================================================
  // fetchTeamInfo
  // ============================================================
  describe('fetchTeamInfo', () => {
    it('sets teamInfo on success', async () => {
      const teamInfo = { id: 'team-1', members: [] } as never;
      mockApi.getTeam.mockResolvedValue(teamInfo);

      await act(async () => {
        await useTopicInsightsStore.getState().fetchTeamInfo('t1');
      });

      expect(useTopicInsightsStore.getState().teamInfo).toEqual(teamInfo);
    });

    it('does not set error for report-not-found type errors', async () => {
      mockApi.getTeam.mockRejectedValue(new Error('No active mission'));

      await act(async () => {
        await useTopicInsightsStore.getState().fetchTeamInfo('t1');
      });

      expect(useTopicInsightsStore.getState().error).toBeNull();
    });

    it('sets error for non-report-not-found errors', async () => {
      mockApi.getTeam.mockRejectedValue(new Error('Server failure'));

      await act(async () => {
        await useTopicInsightsStore.getState().fetchTeamInfo('t1');
      });

      expect(useTopicInsightsStore.getState().error).toBe('Server failure');
    });
  });

  // ============================================================
  // sendLeaderInstruction
  // ============================================================
  describe('sendLeaderInstruction', () => {
    it('calls API and refreshes mission status on success', async () => {
      mockApi.sendLeaderMessage.mockResolvedValue({ response: 'ack' });
      mockApi.getMission.mockResolvedValue(makeMissionStatus('EXECUTING'));

      await act(async () => {
        await useTopicInsightsStore
          .getState()
          .sendLeaderInstruction('t1', 'proceed');
      });

      expect(mockApi.sendLeaderMessage).toHaveBeenCalledWith('t1', 'proceed');
      // fetchMissionStatus is called which internally calls getMission
      expect(mockApi.getMission).toHaveBeenCalled();
    });

    it('sets error and throws on failure', async () => {
      mockApi.sendLeaderMessage.mockRejectedValue(new Error('Send failed'));

      await expect(
        act(async () => {
          await useTopicInsightsStore
            .getState()
            .sendLeaderInstruction('t1', 'test');
        })
      ).rejects.toThrow('Send failed');

      expect(useTopicInsightsStore.getState().error).toBe('Send failed');
    });
  });

  // ============================================================
  // approveMissionPlan
  // ============================================================
  describe('approveMissionPlan', () => {
    it('calls API and refreshes mission status', async () => {
      mockApi.approveMissionPlan.mockResolvedValue({
        success: true,
        message: 'approved',
      });
      mockApi.getMission.mockResolvedValue(makeMissionStatus('EXECUTING'));

      await act(async () => {
        await useTopicInsightsStore.getState().approveMissionPlan('t1');
      });

      expect(mockApi.approveMissionPlan).toHaveBeenCalledWith('t1');
    });

    it('sets error and throws on failure', async () => {
      mockApi.approveMissionPlan.mockRejectedValue(new Error('Approve failed'));

      await expect(
        act(async () => {
          await useTopicInsightsStore.getState().approveMissionPlan('t1');
        })
      ).rejects.toThrow('Approve failed');

      expect(useTopicInsightsStore.getState().error).toBe('Approve failed');
    });
  });

  // ============================================================
  // retryMission
  // ============================================================
  describe('retryMission', () => {
    it('sets isRefreshing and starts polling after retry', async () => {
      mockApi.retryMission.mockResolvedValue({ retriedTasks: 1 });
      mockApi.getMission.mockResolvedValue(makeMissionStatus('EXECUTING'));

      await act(async () => {
        await useTopicInsightsStore.getState().retryMission('t1', ['task-1']);
      });

      expect(mockApi.retryMission).toHaveBeenCalledWith('t1', ['task-1']);
      // After retry, startMissionPolling is called, which calls getMission
      // Just verify the API was called correctly
      expect(mockApi.getMission).toHaveBeenCalled();

      // Stop polling to clean up
      act(() => {
        useTopicInsightsStore.getState().stopMissionPolling();
      });
    });

    it('sets error and throws on failure', async () => {
      mockApi.retryMission.mockRejectedValue(new Error('Retry failed'));

      await expect(
        act(async () => {
          await useTopicInsightsStore.getState().retryMission('t1');
        })
      ).rejects.toThrow('Retry failed');

      const state = useTopicInsightsStore.getState();
      expect(state.isRefreshing).toBe(false);
      expect(state.error).toBe('Retry failed');
    });
  });

  // ============================================================
  // cancelMission - error case
  // ============================================================
  describe('cancelMission - error handling', () => {
    it('sets error and throws on cancel failure', async () => {
      mockApi.cancelMission.mockRejectedValue(new Error('Cancel failed'));

      await expect(
        act(async () => {
          await useTopicInsightsStore.getState().cancelMission('t1');
        })
      ).rejects.toThrow('Cancel failed');

      expect(useTopicInsightsStore.getState().error).toBe('Cancel failed');
    });
  });

  // ============================================================
  // fetchTeamMessages / fetchAgentActivities / fetchTeamData
  // ============================================================
  describe('fetchTeamMessages', () => {
    it('sets teamMessages on success', async () => {
      const messages = [{ id: 'msg-1', content: 'Hello' }] as never[];
      mockApi.getTeamMessages.mockResolvedValue(messages);

      await act(async () => {
        await useTopicInsightsStore.getState().fetchTeamMessages('t1');
      });

      expect(useTopicInsightsStore.getState().teamMessages).toEqual(messages);
    });

    it('handles errors gracefully without setting error state', async () => {
      mockApi.getTeamMessages.mockRejectedValue(new Error('Messages error'));

      await act(async () => {
        await useTopicInsightsStore.getState().fetchTeamMessages('t1');
      });

      // Should not throw or set error (just logs)
      expect(useTopicInsightsStore.getState().error).toBeNull();
    });
  });

  describe('fetchAgentActivities', () => {
    it('sets agentActivities on success', async () => {
      const activities = [{ id: 'act-1', agentId: 'agent-1' }] as never[];
      mockApi.getAgentActivities.mockResolvedValue(activities);

      await act(async () => {
        await useTopicInsightsStore.getState().fetchAgentActivities('t1');
      });

      expect(useTopicInsightsStore.getState().agentActivities).toEqual(
        activities
      );
    });

    it('handles errors gracefully', async () => {
      mockApi.getAgentActivities.mockRejectedValue(
        new Error('Activities error')
      );

      await act(async () => {
        await useTopicInsightsStore.getState().fetchAgentActivities('t1');
      });

      expect(useTopicInsightsStore.getState().error).toBeNull();
    });
  });

  describe('fetchTeamData', () => {
    it('sets both teamMessages and agentActivities on success', async () => {
      const messages = [{ id: 'msg-1' }] as never[];
      const activities = [{ id: 'act-1' }] as never[];
      mockApi.getTeamMessages.mockResolvedValue(messages);
      mockApi.getAgentActivities.mockResolvedValue(activities);

      await act(async () => {
        await useTopicInsightsStore.getState().fetchTeamData('t1');
      });

      const state = useTopicInsightsStore.getState();
      expect(state.teamMessages).toEqual(messages);
      expect(state.agentActivities).toEqual(activities);
      expect(state.isLoadingTeamData).toBe(false);
    });

    it('handles errors gracefully', async () => {
      mockApi.getTeamMessages.mockRejectedValue(new Error('Team data error'));
      mockApi.getAgentActivities.mockRejectedValue(
        new Error('Activities error')
      );

      await act(async () => {
        await useTopicInsightsStore.getState().fetchTeamData('t1');
      });

      expect(useTopicInsightsStore.getState().isLoadingTeamData).toBe(false);
    });
  });

  // ============================================================
  // fetchReports - loadMore
  // ============================================================
  describe('fetchReports - loadMore', () => {
    it('appends reports when loadMore=true', async () => {
      const existing = [makeReport('r0')];
      const newReports = [makeReport('r1'), makeReport('r2')];
      mockApi.getReports.mockResolvedValue({
        reports: newReports,
        hasMore: true,
        nextCursor: 'cursor-2',
      });

      act(() => {
        useTopicInsightsStore.setState({
          reports: existing,
          reportsCursor: 'cursor-1',
        });
      });

      await act(async () => {
        await useTopicInsightsStore.getState().fetchReports('t1', true);
      });

      const state = useTopicInsightsStore.getState();
      expect(state.reports).toHaveLength(3);
      expect(state.hasMoreReports).toBe(true);
      expect(state.reportsCursor).toBe('cursor-2');
    });

    it('sets error for non-report-not-found errors', async () => {
      mockApi.getReports.mockRejectedValue(new Error('Server error'));

      await expect(
        act(async () => {
          await useTopicInsightsStore.getState().fetchReports('t1');
        })
      ).rejects.toThrow('Server error');

      expect(useTopicInsightsStore.getState().error).toBe('Server error');
    });
  });

  // ============================================================
  // fetchReport
  // ============================================================
  describe('fetchReport', () => {
    it('sets currentReport on success', async () => {
      const report = makeReport('r1');
      mockApi.getReport.mockResolvedValue(report);

      await act(async () => {
        await useTopicInsightsStore.getState().fetchReport('t1', 'r1');
      });

      expect(useTopicInsightsStore.getState().currentReport).toEqual(report);
    });

    it('silently ignores report-not-found errors', async () => {
      mockApi.getReport.mockRejectedValue(new Error('Report not found'));

      await act(async () => {
        await useTopicInsightsStore.getState().fetchReport('t1', 'r1');
      });

      expect(useTopicInsightsStore.getState().error).toBeNull();
    });

    it('sets error and throws for non-report-not-found errors', async () => {
      mockApi.getReport.mockRejectedValue(new Error('Server error'));

      await expect(
        act(async () => {
          await useTopicInsightsStore.getState().fetchReport('t1', 'r1');
        })
      ).rejects.toThrow('Server error');

      expect(useTopicInsightsStore.getState().error).toBe('Server error');
    });
  });

  // ============================================================
  // deleteReport - no matching currentReport
  // ============================================================
  describe('deleteReport - edge cases', () => {
    it('preserves currentReport when deleting different report', async () => {
      mockApi.deleteReport.mockResolvedValue(
        undefined as unknown as { success: boolean; message: string }
      );

      act(() => {
        useTopicInsightsStore.setState({
          reports: [makeReport('r1'), makeReport('r2')],
          currentReport: makeReport('r2'),
        });
      });

      await act(async () => {
        await useTopicInsightsStore.getState().deleteReport('t1', 'r1');
      });

      expect(useTopicInsightsStore.getState().currentReport?.id).toBe('r2');
    });

    it('sets error and throws on failure', async () => {
      mockApi.deleteReport.mockRejectedValue(new Error('Delete failed'));

      await expect(
        act(async () => {
          await useTopicInsightsStore.getState().deleteReport('t1', 'r1');
        })
      ).rejects.toThrow('Delete failed');

      expect(useTopicInsightsStore.getState().error).toBe('Delete failed');
    });
  });

  // ============================================================
  // exportReport
  // ============================================================
  describe('exportReport', () => {
    it('returns download URL from waitForExportCompletion', async () => {
      mockApi.waitForExportCompletion.mockResolvedValue(
        'https://example.com/export.pdf'
      );

      let url: string | undefined;
      await act(async () => {
        url = await useTopicInsightsStore
          .getState()
          .exportReport('t1', 'r1', { format: 'pdf' } as never);
      });

      expect(url).toBe('https://example.com/export.pdf');
    });
  });

  // ============================================================
  // compareReports
  // ============================================================
  describe('compareReports', () => {
    it('sets comparisonResult on success', async () => {
      const result = { diffSummary: 'changed' } as never;
      mockApi.compareReports.mockResolvedValue(result);

      await act(async () => {
        await useTopicInsightsStore
          .getState()
          .compareReports('t1', { reportId1: 'r1', reportId2: 'r2' } as never);
      });

      expect(useTopicInsightsStore.getState().comparisonResult).toEqual(result);
    });

    it('sets error and throws on failure', async () => {
      mockApi.compareReports.mockRejectedValue(new Error('Comparison failed'));

      await expect(
        act(async () => {
          await useTopicInsightsStore.getState().compareReports('t1', {
            reportId1: 'r1',
            reportId2: 'r2',
          } as never);
        })
      ).rejects.toThrow('Comparison failed');

      expect(useTopicInsightsStore.getState().error).toBe('Comparison failed');
    });
  });

  // ============================================================
  // rollbackReport
  // ============================================================
  describe('rollbackReport', () => {
    it('updates currentReport with rolled-back content', async () => {
      const rolledBack = makeReport('r1');
      mockApi.rollbackReport.mockResolvedValue({
        report: rolledBack,
        rolledBackFrom: 3,
        rolledBackTo: 2,
      });

      await act(async () => {
        await useTopicInsightsStore.getState().rollbackReport('t1', 'r1', 2);
      });

      expect(useTopicInsightsStore.getState().currentReport).toEqual(
        rolledBack
      );
    });

    it('sets error and throws on failure', async () => {
      mockApi.rollbackReport.mockRejectedValue(new Error('Rollback failed'));

      await expect(
        act(async () => {
          await useTopicInsightsStore.getState().rollbackReport('t1', 'r1', 1);
        })
      ).rejects.toThrow('Rollback failed');

      expect(useTopicInsightsStore.getState().error).toBe('Rollback failed');
    });
  });

  // ============================================================
  // fetchEvidence
  // ============================================================
  describe('fetchEvidence', () => {
    it('sets evidence and evidenceTotal on success', async () => {
      const evidence = [{ id: 'ev-1' }] as never[];
      mockApi.getEvidence.mockResolvedValue({
        evidence,
        total: 1,
        hasMore: false,
      });

      await act(async () => {
        await useTopicInsightsStore.getState().fetchEvidence('t1', 'r1');
      });

      const state = useTopicInsightsStore.getState();
      expect(state.evidence).toEqual(evidence);
      expect(state.evidenceTotal).toBe(1);
      expect(state.isLoadingEvidence).toBe(false);
    });

    it('silently ignores report-not-found errors', async () => {
      mockApi.getEvidence.mockRejectedValue(new Error('No reports found'));

      await act(async () => {
        await useTopicInsightsStore.getState().fetchEvidence('t1', 'r1');
      });

      expect(useTopicInsightsStore.getState().error).toBeNull();
    });

    it('sets error and throws for non-report-not-found errors', async () => {
      mockApi.getEvidence.mockRejectedValue(new Error('Server error'));

      await expect(
        act(async () => {
          await useTopicInsightsStore.getState().fetchEvidence('t1', 'r1');
        })
      ).rejects.toThrow('Server error');

      expect(useTopicInsightsStore.getState().error).toBe('Server error');
    });
  });

  // ============================================================
  // fetchSchedule
  // ============================================================
  describe('fetchSchedule', () => {
    it('sets schedule on success', async () => {
      const schedule = { id: 'sched-1', frequency: 'daily' } as never;
      mockApi.getSchedule.mockResolvedValue(schedule);

      await act(async () => {
        await useTopicInsightsStore.getState().fetchSchedule('t1');
      });

      expect(useTopicInsightsStore.getState().schedule).toEqual(schedule);
    });

    it('sets error and throws on failure', async () => {
      mockApi.getSchedule.mockRejectedValue(new Error('Schedule error'));

      await expect(
        act(async () => {
          await useTopicInsightsStore.getState().fetchSchedule('t1');
        })
      ).rejects.toThrow('Schedule error');

      expect(useTopicInsightsStore.getState().error).toBe('Schedule error');
    });
  });

  // ============================================================
  // updateSchedule
  // ============================================================
  describe('updateSchedule', () => {
    it('updates schedule in state', async () => {
      const updated = { id: 'sched-1', frequency: 'weekly' } as never;
      mockApi.updateSchedule.mockResolvedValue(updated);

      await act(async () => {
        await useTopicInsightsStore
          .getState()
          .updateSchedule('t1', { frequency: 'weekly' } as never);
      });

      expect(useTopicInsightsStore.getState().schedule).toEqual(updated);
    });
  });

  // ============================================================
  // fetchLogs - error case
  // ============================================================
  describe('fetchLogs - error handling', () => {
    it('sets error and throws on failure', async () => {
      mockApi.getLogs.mockRejectedValue(new Error('Logs error'));

      await expect(
        act(async () => {
          await useTopicInsightsStore.getState().fetchLogs('t1');
        })
      ).rejects.toThrow('Logs error');

      expect(useTopicInsightsStore.getState().error).toBe('Logs error');
    });
  });

  // ============================================================
  // fetchStats - error case
  // ============================================================
  describe('fetchStats - error handling', () => {
    it('sets error and throws on failure', async () => {
      mockApi.getStats.mockRejectedValue(new Error('Stats error'));

      await expect(
        act(async () => {
          await useTopicInsightsStore.getState().fetchStats('t1');
        })
      ).rejects.toThrow('Stats error');

      expect(useTopicInsightsStore.getState().error).toBe('Stats error');
    });
  });

  // ============================================================
  // fetchTemplates - error case
  // ============================================================
  describe('fetchTemplates - error handling', () => {
    it('sets error and throws on failure', async () => {
      mockApi.getTemplates.mockRejectedValue(new Error('Templates error'));

      await expect(
        act(async () => {
          await useTopicInsightsStore
            .getState()
            .fetchTemplates('RESEARCH' as never);
        })
      ).rejects.toThrow('Templates error');

      const state = useTopicInsightsStore.getState();
      expect(state.isLoadingTemplates).toBe(false);
      expect(state.error).toBe('Templates error');
    });
  });

  // ============================================================
  // createFromTemplate
  // ============================================================
  describe('createFromTemplate', () => {
    it('prepends new topic to list and returns it', async () => {
      const topic = makeTopic('from-tmpl');
      mockApi.createFromTemplate.mockResolvedValue(topic);

      act(() => {
        useTopicInsightsStore.setState({ topics: [makeTopic('existing')] });
      });

      let result: ReturnType<typeof makeTopic> | undefined;
      await act(async () => {
        result = await useTopicInsightsStore
          .getState()
          .createFromTemplate('tmpl-1');
      });

      expect(result).toEqual(topic);
      expect(useTopicInsightsStore.getState().topics[0]).toEqual(topic);
      expect(useTopicInsightsStore.getState().topics).toHaveLength(2);
    });
  });

  // ============================================================
  // pauseTodo / resumeTodo / cancelTodo / retryTodo / prioritizeTodo
  // ============================================================
  describe('pauseTodo', () => {
    it('updates todo in list on success', async () => {
      const existing = {
        id: 'todo-1',
        title: 'Task',
        status: 'RUNNING',
      } as unknown as ResearchTodo;
      const updated = {
        id: 'todo-1',
        title: 'Task',
        status: 'PAUSED',
      } as unknown as ResearchTodo;
      mockApi.pauseTodo.mockResolvedValue({ success: true, todo: updated });

      act(() => {
        useTopicInsightsStore.setState({ todos: [existing] });
      });

      await act(async () => {
        await useTopicInsightsStore.getState().pauseTodo('t1', 'todo-1');
      });

      expect(
        (
          useTopicInsightsStore.getState().todos[0] as unknown as {
            status: string;
          }
        ).status
      ).toBe('PAUSED');
    });

    it('sets error and throws on failure', async () => {
      mockApi.pauseTodo.mockRejectedValue(new Error('Pause failed'));

      await expect(
        act(async () => {
          await useTopicInsightsStore.getState().pauseTodo('t1', 'todo-1');
        })
      ).rejects.toThrow('Pause failed');

      expect(useTopicInsightsStore.getState().error).toBe('Pause failed');
    });
  });

  describe('resumeTodo', () => {
    it('updates todo in list on success', async () => {
      const existing = {
        id: 'todo-1',
        status: 'PAUSED',
      } as unknown as ResearchTodo;
      const updated = {
        id: 'todo-1',
        status: 'RUNNING',
      } as unknown as ResearchTodo;
      mockApi.resumeTodo.mockResolvedValue({ success: true, todo: updated });

      act(() => {
        useTopicInsightsStore.setState({ todos: [existing] });
      });

      await act(async () => {
        await useTopicInsightsStore.getState().resumeTodo('t1', 'todo-1');
      });

      expect(
        (
          useTopicInsightsStore.getState().todos[0] as unknown as {
            status: string;
          }
        ).status
      ).toBe('RUNNING');
    });

    it('sets error and throws on failure', async () => {
      mockApi.resumeTodo.mockRejectedValue(new Error('Resume failed'));

      await expect(
        act(async () => {
          await useTopicInsightsStore.getState().resumeTodo('t1', 'todo-1');
        })
      ).rejects.toThrow('Resume failed');
    });
  });

  describe('cancelTodo', () => {
    it('updates todo status to CANCELLED on success', async () => {
      const existing = {
        id: 'todo-1',
        status: 'RUNNING',
      } as unknown as ResearchTodo;
      const updated = {
        id: 'todo-1',
        status: 'CANCELLED',
      } as unknown as ResearchTodo;
      mockApi.cancelTodo.mockResolvedValue({ success: true, todo: updated });

      act(() => {
        useTopicInsightsStore.setState({ todos: [existing] });
      });

      await act(async () => {
        await useTopicInsightsStore
          .getState()
          .cancelTodo('t1', 'todo-1', 'no longer needed');
      });

      expect(
        (
          useTopicInsightsStore.getState().todos[0] as unknown as {
            status: string;
          }
        ).status
      ).toBe('CANCELLED');
    });

    it('sets error and throws on failure', async () => {
      mockApi.cancelTodo.mockRejectedValue(new Error('Cancel failed'));

      await expect(
        act(async () => {
          await useTopicInsightsStore.getState().cancelTodo('t1', 'todo-1');
        })
      ).rejects.toThrow('Cancel failed');
    });
  });

  describe('retryTodo', () => {
    it('updates todo in list on success', async () => {
      const existing = {
        id: 'todo-1',
        status: 'FAILED',
      } as unknown as ResearchTodo;
      const updated = {
        id: 'todo-1',
        status: 'PENDING',
      } as unknown as ResearchTodo;
      mockApi.retryTodo.mockResolvedValue({ success: true, todo: updated });

      act(() => {
        useTopicInsightsStore.setState({ todos: [existing] });
      });

      await act(async () => {
        await useTopicInsightsStore.getState().retryTodo('t1', 'todo-1');
      });

      expect(
        (
          useTopicInsightsStore.getState().todos[0] as unknown as {
            status: string;
          }
        ).status
      ).toBe('PENDING');
    });

    it('sets error and throws on failure', async () => {
      mockApi.retryTodo.mockRejectedValue(new Error('Retry failed'));

      await expect(
        act(async () => {
          await useTopicInsightsStore.getState().retryTodo('t1', 'todo-1');
        })
      ).rejects.toThrow('Retry failed');
    });
  });

  describe('prioritizeTodo', () => {
    it('updates todo in list on success', async () => {
      const existing = {
        id: 'todo-1',
        priority: 'normal',
      } as unknown as ResearchTodo;
      const updated = {
        id: 'todo-1',
        priority: 'high',
      } as unknown as ResearchTodo;
      mockApi.prioritizeTodo.mockResolvedValue({
        success: true,
        todo: updated,
      });

      act(() => {
        useTopicInsightsStore.setState({ todos: [existing] });
      });

      await act(async () => {
        await useTopicInsightsStore
          .getState()
          .prioritizeTodo('t1', 'todo-1', 'high');
      });

      expect(
        (
          useTopicInsightsStore.getState().todos[0] as unknown as {
            priority: string;
          }
        ).priority
      ).toBe('high');
    });

    it('sets error and throws on failure', async () => {
      mockApi.prioritizeTodo.mockRejectedValue(new Error('Prioritize failed'));

      await expect(
        act(async () => {
          await useTopicInsightsStore
            .getState()
            .prioritizeTodo('t1', 'todo-1', 'high');
        })
      ).rejects.toThrow('Prioritize failed');
    });
  });

  // ============================================================
  // createUserRequestTodo
  // ============================================================
  describe('createUserRequestTodo', () => {
    it('prepends new todo to list on success', async () => {
      const existing = { id: 'todo-existing' } as unknown as ResearchTodo;
      const newTodo = {
        id: 'todo-new',
        title: 'User request',
      } as unknown as ResearchTodo;
      mockApi.createUserRequestTodo.mockResolvedValue({
        success: true,
        todo: newTodo,
      });

      act(() => {
        useTopicInsightsStore.setState({ todos: [existing] });
      });

      await act(async () => {
        await useTopicInsightsStore
          .getState()
          .createUserRequestTodo('t1', 'm1', 'Research X', 'Details');
      });

      const todos = useTopicInsightsStore.getState().todos;
      expect(todos[0].id).toBe('todo-new');
      expect(todos).toHaveLength(2);
    });

    it('sets error and throws on failure', async () => {
      mockApi.createUserRequestTodo.mockRejectedValue(
        new Error('Create todo failed')
      );

      await expect(
        act(async () => {
          await useTopicInsightsStore
            .getState()
            .createUserRequestTodo('t1', 'm1', 'Test');
        })
      ).rejects.toThrow('Create todo failed');

      expect(useTopicInsightsStore.getState().error).toBe('Create todo failed');
    });
  });

  // ============================================================
  // stopMissionPolling
  // ============================================================
  describe('stopMissionPolling', () => {
    it('clears the polling interval', () => {
      vi.useFakeTimers();
      const interval = setInterval(() => {}, 2000);

      act(() => {
        useTopicInsightsStore.setState({ missionPollingInterval: interval });
      });

      act(() => {
        useTopicInsightsStore.getState().stopMissionPolling();
      });

      expect(
        useTopicInsightsStore.getState().missionPollingInterval
      ).toBeNull();
      vi.useRealTimers();
    });

    it('does nothing when no interval is set', () => {
      act(() => {
        useTopicInsightsStore.setState({ missionPollingInterval: null });
      });

      expect(() => {
        act(() => {
          useTopicInsightsStore.getState().stopMissionPolling();
        });
      }).not.toThrow();
    });
  });

  // ============================================================
  // startRefreshProgressStream - onComplete callback
  // ============================================================
  describe('startRefreshProgressStream - onComplete callback', () => {
    it('onComplete sets isRefreshing=false, refreshProgress=null and fetches topic+report', async () => {
      const topic = makeTopic('t1');
      const report = makeReport();

      mockApi.getTopic.mockResolvedValue(topic);
      mockApi.getLatestReport.mockResolvedValue(report);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let capturedCallbacks: Record<string, (event: any) => void> = {};
      mockApi.createRefreshProgressStream.mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((
          _topicId: string,
          callbacks: Record<string, (event: any) => void>
        ) => {
          capturedCallbacks = callbacks;
          return { close: vi.fn() };
        }) as never
      );

      act(() => {
        useTopicInsightsStore.setState({
          isRefreshing: true,
          refreshProgress: {
            phase: 'x',
            progress: 50,
            message: 'y',
            completedDimensions: 1,
            totalDimensions: 2,
          },
        });
        useTopicInsightsStore.getState().startRefreshProgressStream('t1');
      });

      // Fire the onComplete callback
      await act(async () => {
        await capturedCallbacks.onComplete({});
      });

      const state = useTopicInsightsStore.getState();
      expect(state.isRefreshing).toBe(false);
      expect(state.refreshProgress).toBeNull();
      expect(mockApi.getTopic).toHaveBeenCalledWith('t1');
      expect(mockApi.getLatestReport).toHaveBeenCalledWith('t1');
    });

    it('onComplete closes the stream', async () => {
      mockApi.getTopic.mockResolvedValue(makeTopic());
      mockApi.getLatestReport.mockResolvedValue(makeReport());

      const mockClose = vi.fn();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let capturedCallbacks: Record<string, (event: any) => void> = {};
      mockApi.createRefreshProgressStream.mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((
          _topicId: string,
          callbacks: Record<string, (event: any) => void>
        ) => {
          capturedCallbacks = callbacks;
          return { close: mockClose };
        }) as never
      );

      act(() => {
        useTopicInsightsStore.getState().startRefreshProgressStream('t1');
      });

      await act(async () => {
        await capturedCallbacks.onComplete({});
      });

      expect(mockClose).toHaveBeenCalled();
    });
  });

  // ============================================================
  // startMissionPolling - setInterval body
  // ============================================================
  describe('startMissionPolling', () => {
    // Save original setInterval so we can directly replace it
    const _origSetInterval = globalThis.setInterval;
    const _origClearInterval = globalThis.clearInterval;

    // Helper: directly replace setInterval to capture the callback
    function captureIntervalFn(): {
      triggerPoll: () => Promise<void>;
      restore: () => void;
    } {
      let capturedFn: (() => Promise<void>) | null = null;

      // Directly assign (not spy) - bypasses vi.clearAllMocks
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).setInterval = (fn: () => void, _delay?: number) => {
        capturedFn = fn as () => Promise<void>;
        // Return a handle using the ORIGINAL setInterval (very long delay so it never fires)
        return _origSetInterval(() => {}, 99999999);
      };

      return {
        triggerPoll: async () => {
          if (capturedFn) {
            await capturedFn();
          }
        },
        restore: () => {
          // Restore original setInterval
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (globalThis as any).setInterval = _origSetInterval;
        },
      };
    }

    afterEach(() => {
      // Ensure setInterval is restored and polling is stopped
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).setInterval = _origSetInterval;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).clearInterval = _origClearInterval;
      useTopicInsightsStore.getState().stopMissionPolling();
    });

    it('polls mission status and sets missionStatus', async () => {
      const missionStatus = makeMissionStatus('COMPLETED');
      mockApi.getMission.mockResolvedValue(missionStatus);
      mockApi.getTeamMessages.mockResolvedValue([]);
      mockApi.getAgentActivities.mockResolvedValue([]);
      mockApi.getLatestReport.mockResolvedValue(makeReport());

      const { triggerPoll, restore } = captureIntervalFn();
      useTopicInsightsStore.getState().startMissionPolling('t1');
      await triggerPoll();
      restore();

      expect(mockApi.getMission).toHaveBeenCalledWith('t1');
      expect(useTopicInsightsStore.getState().missionStatus).toEqual(
        missionStatus
      );
    });

    it('sets isRefreshing=true and refreshProgress for active status', async () => {
      const missionStatus = makeMissionStatus('EXECUTING');
      mockApi.getMission.mockResolvedValue(missionStatus);
      mockApi.getTeamMessages.mockResolvedValue([]);
      mockApi.getAgentActivities.mockResolvedValue([]);
      mockApi.getMissionHealth.mockResolvedValue({
        health: makeMissionHealthStatus(),
      });

      const { triggerPoll, restore } = captureIntervalFn();
      useTopicInsightsStore.getState().startMissionPolling('t1');
      await triggerPoll();
      restore();

      const state = useTopicInsightsStore.getState();
      expect(state.isRefreshing).toBe(true);
      expect(state.refreshProgress).not.toBeNull();
      expect(state.refreshProgress?.phase).toBe('Researching');
    });

    it('polls team data on every 3rd poll (pollCount % 3 === 0)', async () => {
      const missionStatus = makeMissionStatus('EXECUTING');
      mockApi.getMission.mockResolvedValue(missionStatus);
      mockApi.getTeamMessages.mockResolvedValue([
        makeTeamMessage({ id: 'msg1' }),
      ]);
      mockApi.getAgentActivities.mockResolvedValue([
        makeAgentActivity({ id: 'act1' }),
      ]);
      mockApi.getMissionHealth.mockResolvedValue({
        health: makeMissionHealthStatus(),
      });

      const { triggerPoll, restore } = captureIntervalFn();
      useTopicInsightsStore.getState().startMissionPolling('t1');
      await triggerPoll(); // poll 1
      await triggerPoll(); // poll 2
      await triggerPoll(); // poll 3 - triggers team data
      restore();

      expect(mockApi.getTeamMessages).toHaveBeenCalledWith('t1', {
        limit: 100,
        missionId: 'mission-1',
      });
      expect(mockApi.getAgentActivities).toHaveBeenCalledWith('t1', {
        limit: 200,
        missionId: 'mission-1',
      });
    });

    it('runs health check during active mission', async () => {
      const missionStatus = makeMissionStatus('PLANNING');
      mockApi.getMission.mockResolvedValue(missionStatus);
      mockApi.getMissionHealth.mockResolvedValue({
        health: makeMissionHealthStatus(),
      });
      mockApi.getTeamMessages.mockResolvedValue([]);
      mockApi.getAgentActivities.mockResolvedValue([]);

      const { triggerPoll, restore } = captureIntervalFn();
      useTopicInsightsStore.getState().startMissionPolling('t1');
      await triggerPoll();
      restore();

      expect(mockApi.getMissionHealth).toHaveBeenCalledWith('t1');
    });

    it('logs warning when mission health is not healthy', async () => {
      const missionStatus = makeMissionStatus('EXECUTING');
      mockApi.getMission.mockResolvedValue(missionStatus);
      mockApi.getMissionHealth.mockResolvedValue({
        health: makeMissionHealthStatus({
          isHealthy: false,
          issues: ['Stuck agent detected'],
        }),
      });
      mockApi.getTeamMessages.mockResolvedValue([]);
      mockApi.getAgentActivities.mockResolvedValue([]);

      const { logger: mockLogger } = await import('@/lib/utils/logger');
      const warnSpy = vi.spyOn(mockLogger, 'warn');

      const { triggerPoll, restore } = captureIntervalFn();
      useTopicInsightsStore.getState().startMissionPolling('t1');
      await triggerPoll();
      restore();

      expect(warnSpy).toHaveBeenCalledWith('Mission health issues detected:', [
        'Stuck agent detected',
      ]);
    });

    it('stops polling and fetches final team data when mission is not active', async () => {
      const missionStatus = makeMissionStatus('FAILED');
      mockApi.getMission.mockResolvedValue(missionStatus);
      mockApi.getTeamMessages.mockResolvedValue([
        makeTeamMessage({ id: 'final-msg' }),
      ]);
      mockApi.getAgentActivities.mockResolvedValue([]);

      const { triggerPoll, restore } = captureIntervalFn();
      useTopicInsightsStore.getState().startMissionPolling('t1');
      await triggerPoll();
      restore();

      // Final team data fetch uses no missionId
      expect(mockApi.getTeamMessages).toHaveBeenCalledWith('t1', {
        limit: 100,
      });
      expect(mockApi.getAgentActivities).toHaveBeenCalledWith('t1', {
        limit: 200,
      });
    });

    it('fetches latest report on COMPLETED mission', async () => {
      const missionStatus = makeMissionStatus('COMPLETED');
      mockApi.getMission.mockResolvedValue(missionStatus);
      mockApi.getTeamMessages.mockResolvedValue([]);
      mockApi.getAgentActivities.mockResolvedValue([]);
      mockApi.getLatestReport.mockResolvedValue(makeReport());

      const { triggerPoll, restore } = captureIntervalFn();
      useTopicInsightsStore.getState().startMissionPolling('t1');
      await triggerPoll();
      restore();

      expect(mockApi.getLatestReport).toHaveBeenCalledWith('t1');
    });

    it('stops polling on 401/UnauthorizedError', async () => {
      const authError = new Error('401 Unauthorized');
      authError.name = 'UnauthorizedError';
      mockApi.getMission.mockRejectedValue(authError);

      const { triggerPoll, restore } = captureIntervalFn();
      useTopicInsightsStore.getState().startMissionPolling('t1');
      await triggerPoll();
      restore();

      // After 401, polling should have been stopped (interval cleared)
      expect(
        useTopicInsightsStore.getState().missionPollingInterval
      ).toBeNull();
    });

    it('stops polling on session expired error', async () => {
      const sessionError = new Error('Session expired');
      mockApi.getMission.mockRejectedValue(sessionError);

      const { triggerPoll, restore } = captureIntervalFn();
      useTopicInsightsStore.getState().startMissionPolling('t1');
      await triggerPoll();
      restore();

      expect(
        useTopicInsightsStore.getState().missionPollingInterval
      ).toBeNull();
    });

    it('handles team data polling error gracefully', async () => {
      const missionStatus = makeMissionStatus('EXECUTING');
      mockApi.getMission.mockResolvedValue(missionStatus);
      mockApi.getMissionHealth.mockResolvedValue({
        health: makeMissionHealthStatus(),
      });
      mockApi.getTeamMessages.mockRejectedValue(new Error('team error'));
      mockApi.getAgentActivities.mockResolvedValue([]);

      const { triggerPoll, restore } = captureIntervalFn();
      useTopicInsightsStore.getState().startMissionPolling('t1');

      await expect(async () => {
        await triggerPoll(); // 1
        await triggerPoll(); // 2
        await triggerPoll(); // 3 - triggers team poll
      }).not.toThrow();
      restore();
    });

    it('handles health check failure gracefully', async () => {
      const missionStatus = makeMissionStatus('PLAN_READY');
      mockApi.getMission.mockResolvedValue(missionStatus);
      mockApi.getMissionHealth.mockRejectedValue(
        new Error('health check failed')
      );
      mockApi.getTeamMessages.mockResolvedValue([]);
      mockApi.getAgentActivities.mockResolvedValue([]);

      const { triggerPoll, restore } = captureIntervalFn();
      useTopicInsightsStore.getState().startMissionPolling('t1');

      await expect(triggerPoll()).resolves.not.toThrow();
      restore();
    });

    it('handles final team data fetch failure gracefully (non-active mission)', async () => {
      const missionStatus = makeMissionStatus('FAILED');
      mockApi.getMission.mockResolvedValue(missionStatus);
      mockApi.getTeamMessages.mockRejectedValue(new Error('final fetch error'));
      mockApi.getAgentActivities.mockResolvedValue([]);

      const { triggerPoll, restore } = captureIntervalFn();
      useTopicInsightsStore.getState().startMissionPolling('t1');

      await expect(triggerPoll()).resolves.not.toThrow();
      restore();
    });

    it('handles null missionStatus from API gracefully', async () => {
      mockApi.getMission.mockResolvedValue(null);

      const { triggerPoll, restore } = captureIntervalFn();
      useTopicInsightsStore.getState().startMissionPolling('t1');

      await expect(triggerPoll()).resolves.not.toThrow();
      restore();
      expect(useTopicInsightsStore.getState().missionStatus).toBeNull();
    });

    it('handles generic polling error without stopping polling', async () => {
      const genericError = new Error('network error');
      mockApi.getMission.mockRejectedValue(genericError);

      const { triggerPoll, restore } = captureIntervalFn();
      useTopicInsightsStore.getState().startMissionPolling('t1');
      await triggerPoll();
      restore();

      // Polling interval should still exist (not a 401 error)
      expect(
        useTopicInsightsStore.getState().missionPollingInterval
      ).not.toBeNull();
    });

    it('stops any existing polling before starting new poll', () => {
      vi.useFakeTimers();
      const existingInterval = setInterval(() => {}, 9999);
      useTopicInsightsStore.setState({
        missionPollingInterval: existingInterval,
      });

      const { restore } = captureIntervalFn();
      useTopicInsightsStore.getState().startMissionPolling('t1');
      restore();
      vi.useRealTimers();

      // A new interval is set
      expect(
        useTopicInsightsStore.getState().missionPollingInterval
      ).not.toBeNull();
    });

    it('stops polling on 401 message in error', async () => {
      const err401 = new Error('Request failed 401');
      mockApi.getMission.mockRejectedValue(err401);

      const { triggerPoll, restore } = captureIntervalFn();
      useTopicInsightsStore.getState().startMissionPolling('t1');
      await triggerPoll();
      restore();

      expect(
        useTopicInsightsStore.getState().missionPollingInterval
      ).toBeNull();
    });

    it('sets isRefreshing=false and refreshProgress=null for non-active status', async () => {
      // Use CANCELLED which is not active
      const cancelledStatus = makeMissionStatus('CANCELLED');
      mockApi.getMission.mockResolvedValue(cancelledStatus);
      mockApi.getTeamMessages.mockResolvedValue([]);
      mockApi.getAgentActivities.mockResolvedValue([]);

      useTopicInsightsStore.setState({ isRefreshing: true });
      const { triggerPoll, restore } = captureIntervalFn();
      useTopicInsightsStore.getState().startMissionPolling('t1');
      await triggerPoll();
      restore();

      const state = useTopicInsightsStore.getState();
      expect(state.isRefreshing).toBe(false);
      expect(state.refreshProgress).toBeNull();
    });

    it('does not fetch latest report for non-COMPLETED terminal status', async () => {
      const failedStatus = { ...makeMissionStatus('FAILED') };
      mockApi.getMission.mockResolvedValue(failedStatus);
      mockApi.getTeamMessages.mockResolvedValue([]);
      mockApi.getAgentActivities.mockResolvedValue([]);

      const { triggerPoll, restore } = captureIntervalFn();
      useTopicInsightsStore.getState().startMissionPolling('t1');
      await triggerPoll();
      restore();

      expect(mockApi.getLatestReport).not.toHaveBeenCalled();
    });
  });
});
