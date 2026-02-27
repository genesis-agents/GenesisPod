import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from '@testing-library/react';

// ============================================================================
// Mock dependencies
// ============================================================================

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

import { useTopicInsightsStore } from '../index';
import * as api from '@/lib/api/topic-insights';

const mockApi = vi.mocked(api);

// ============================================================================
// Test fixtures
// ============================================================================

const makeTopic = (id = 'topic-1') => ({
  id,
  name: 'Test Topic',
  description: 'A test topic',
  type: 'RESEARCH' as const,
  status: 'ACTIVE' as const,
  icon: null,
  color: null,
  refreshFrequency: 'manual' as const,
  lastRefreshAt: null,
  totalReports: 0,
  totalSources: 0,
  userId: 'user-1',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
});

const makeDimension = (id = 'dim-1') => ({
  id,
  topicId: 'topic-1',
  title: 'Test Dimension',
  description: '',
  status: 'COMPLETED' as const,
  order: 0,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
});

const makeReport = (id = 'report-1') => ({
  id,
  topicId: 'topic-1',
  title: 'Test Report',
  content: 'Report content',
  status: 'COMPLETED' as const,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
});

const makeTodo = (id = 'todo-1') => ({
  id,
  topicId: 'topic-1',
  missionId: 'mission-1',
  title: 'Test Todo',
  status: 'PENDING' as const,
  priority: 'normal' as const,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
});

// ============================================================================
// Helpers
// ============================================================================

function getStore() {
  return useTopicInsightsStore.getState();
}

// ============================================================================
// resetStore / resetTopicData
// ============================================================================

describe('resetStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset internal store state before each test
    mockApi.createRefreshProgressStream.mockReturnValue({ close: vi.fn() });
  });

  it('clears all state back to defaults', async () => {
    // Pre-populate some state
    await act(async () => {
      useTopicInsightsStore.setState({
        topics: [makeTopic() as never],
        currentTopic: makeTopic() as never,
        dimensions: [makeDimension() as never],
        error: 'some error',
      });
    });

    await act(async () => {
      getStore().resetStore();
    });

    const state = getStore();
    expect(state.topics).toEqual([]);
    expect(state.currentTopic).toBeNull();
    expect(state.dimensions).toEqual([]);
    expect(state.error).toBeNull();
    expect(state.reports).toEqual([]);
    expect(state.evidence).toEqual([]);
    expect(state.todos).toEqual([]);
  });
});

describe('resetTopicData', () => {
  it('clears topic-related data but keeps topics/currentTopic/templates', async () => {
    const topic = makeTopic();
    await act(async () => {
      useTopicInsightsStore.setState({
        topics: [topic as never],
        currentTopic: topic as never,
        dimensions: [makeDimension() as never],
        error: 'old error',
      });
    });

    await act(async () => {
      getStore().resetTopicData();
    });

    const state = getStore();
    // Topics/currentTopic should be preserved
    expect(state.topics).toEqual([topic]);
    expect(state.currentTopic).toEqual(topic);
    // Topic-specific data cleared
    expect(state.dimensions).toEqual([]);
    expect(state.reports).toEqual([]);
    expect(state.error).toBeNull();
    expect(state.todos).toEqual([]);
  });
});

// ============================================================================
// Topic actions
// ============================================================================

describe('fetchTopics', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sets topics on success', async () => {
    const topics = [makeTopic('t1'), makeTopic('t2')];
    mockApi.getTopics.mockResolvedValueOnce(topics as never);

    await act(async () => {
      await getStore().fetchTopics();
    });

    expect(getStore().topics).toEqual(topics);
  });

  it('sets isLoadingTopics to true then false', async () => {
    let wasLoading = false;
    mockApi.getTopics.mockImplementation(async () => {
      wasLoading = useTopicInsightsStore.getState().isLoadingTopics;
      return [];
    });

    await act(async () => {
      await getStore().fetchTopics();
    });

    expect(wasLoading).toBe(true);
    expect(getStore().isLoadingTopics).toBe(false);
  });

  it('resets isLoadingTopics on error and rethrows', async () => {
    mockApi.getTopics.mockRejectedValueOnce(new Error('fetch failed'));

    await act(async () => {
      await expect(getStore().fetchTopics()).rejects.toThrow('fetch failed');
    });

    expect(getStore().isLoadingTopics).toBe(false);
  });
});

describe('createTopic', () => {
  beforeEach(() => vi.clearAllMocks());

  it('prepends new topic to topics list', async () => {
    const existingTopic = makeTopic('existing');
    await act(async () => {
      useTopicInsightsStore.setState({ topics: [existingTopic as never] });
    });

    const newTopic = makeTopic('new');
    mockApi.createTopic.mockResolvedValueOnce(newTopic as never);

    await act(async () => {
      await getStore().createTopic({
        title: 'New Topic',
        type: 'RESEARCH',
      } as never);
    });

    const topics = getStore().topics;
    expect(topics[0].id).toBe('new');
    expect(topics[1].id).toBe('existing');
  });

  it('returns the created topic', async () => {
    const newTopic = makeTopic('created');
    mockApi.createTopic.mockResolvedValueOnce(newTopic as never);

    let result: ReturnType<typeof makeTopic> | undefined;
    await act(async () => {
      result = (await getStore().createTopic({
        title: 'Created',
        type: 'RESEARCH',
      } as never)) as never;
    });

    expect(result?.id).toBe('created');
  });
});

describe('updateTopic', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates topic in list and currentTopic', async () => {
    const original = makeTopic('t1');
    await act(async () => {
      useTopicInsightsStore.setState({
        topics: [original as never],
        currentTopic: original as never,
      });
    });

    const updated = { ...original, name: 'Updated Name' };
    mockApi.updateTopic.mockResolvedValueOnce(updated as never);

    await act(async () => {
      await getStore().updateTopic('t1', { name: 'Updated Name' } as never);
    });

    expect(getStore().topics[0].name).toBe('Updated Name');
    expect(getStore().currentTopic?.name).toBe('Updated Name');
  });
});

describe('deleteTopic', () => {
  beforeEach(() => vi.clearAllMocks());

  it('removes topic from list', async () => {
    await act(async () => {
      useTopicInsightsStore.setState({
        topics: [makeTopic('t1'), makeTopic('t2')] as never,
        currentTopic: makeTopic('t1') as never,
      });
    });

    mockApi.deleteTopic.mockResolvedValueOnce(undefined);

    await act(async () => {
      await getStore().deleteTopic('t1');
    });

    expect(getStore().topics).toHaveLength(1);
    expect(getStore().topics[0].id).toBe('t2');
    expect(getStore().currentTopic).toBeNull();
  });
});

describe('setCurrentTopic', () => {
  it('sets currentTopic', async () => {
    const topic = makeTopic();
    await act(async () => {
      getStore().setCurrentTopic(topic as never);
    });
    expect(getStore().currentTopic).toEqual(topic);
  });

  it('sets currentTopic to null', async () => {
    await act(async () => {
      getStore().setCurrentTopic(null);
    });
    expect(getStore().currentTopic).toBeNull();
  });
});

// ============================================================================
// Dimension actions
// ============================================================================

describe('fetchDimensions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sets dimensions on success', async () => {
    const dims = [makeDimension('d1'), makeDimension('d2')];
    mockApi.getDimensions.mockResolvedValueOnce(dims as never);

    await act(async () => {
      await getStore().fetchDimensions('topic-1');
    });

    expect(getStore().dimensions).toEqual(dims);
    expect(getStore().isLoadingDimensions).toBe(false);
  });

  it('resets loading on error', async () => {
    mockApi.getDimensions.mockRejectedValueOnce(new Error('fail'));

    await act(async () => {
      await expect(getStore().fetchDimensions('topic-1')).rejects.toThrow();
    });

    expect(getStore().isLoadingDimensions).toBe(false);
  });
});

describe('addDimension', () => {
  beforeEach(() => vi.clearAllMocks());

  it('appends new dimension to list', async () => {
    const existing = makeDimension('d1');
    await act(async () => {
      useTopicInsightsStore.setState({ dimensions: [existing as never] });
    });

    const newDim = makeDimension('d2');
    mockApi.addDimension.mockResolvedValueOnce(newDim as never);

    await act(async () => {
      await getStore().addDimension('topic-1', { title: 'D2' } as never);
    });

    expect(getStore().dimensions).toHaveLength(2);
    expect(getStore().dimensions[1].id).toBe('d2');
  });
});

describe('deleteDimension', () => {
  beforeEach(() => vi.clearAllMocks());

  it('removes dimension from list', async () => {
    await act(async () => {
      useTopicInsightsStore.setState({
        dimensions: [makeDimension('d1'), makeDimension('d2')] as never,
      });
    });

    mockApi.deleteDimension.mockResolvedValueOnce(undefined);

    await act(async () => {
      await getStore().deleteDimension('topic-1', 'd1');
    });

    expect(getStore().dimensions).toHaveLength(1);
    expect(getStore().dimensions[0].id).toBe('d2');
  });
});

// ============================================================================
// Report actions
// ============================================================================

describe('fetchReports', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sets reports on success', async () => {
    const reports = [makeReport('r1'), makeReport('r2')];
    mockApi.getReports.mockResolvedValueOnce({
      reports,
      hasMore: false,
      nextCursor: null,
    } as never);

    await act(async () => {
      await getStore().fetchReports('topic-1');
    });

    expect(getStore().reports).toEqual(reports);
    expect(getStore().hasMoreReports).toBe(false);
  });

  it('appends reports when loadMore=true', async () => {
    const existing = [makeReport('r1')];
    await act(async () => {
      useTopicInsightsStore.setState({ reports: existing as never });
    });

    const more = [makeReport('r2')];
    mockApi.getReports.mockResolvedValueOnce({
      reports: more,
      hasMore: false,
      nextCursor: null,
    } as never);

    await act(async () => {
      await getStore().fetchReports('topic-1', true);
    });

    expect(getStore().reports).toHaveLength(2);
  });

  it('silently swallows "No reports found" errors', async () => {
    mockApi.getReports.mockRejectedValueOnce(new Error('No reports found'));

    await act(async () => {
      await expect(getStore().fetchReports('topic-1')).resolves.toBeUndefined();
    });
  });
});

describe('setCurrentReport', () => {
  it('sets currentReport', async () => {
    const report = makeReport();
    await act(async () => {
      getStore().setCurrentReport(report as never);
    });
    expect(getStore().currentReport).toEqual(report);
  });
});

describe('deleteReport', () => {
  beforeEach(() => vi.clearAllMocks());

  it('removes report from list', async () => {
    await act(async () => {
      useTopicInsightsStore.setState({
        reports: [makeReport('r1'), makeReport('r2')] as never,
        currentReport: makeReport('r1') as never,
      });
    });

    mockApi.deleteReport.mockResolvedValueOnce({
      success: true,
      message: 'deleted',
    });

    await act(async () => {
      await getStore().deleteReport('topic-1', 'r1');
    });

    expect(getStore().reports).toHaveLength(1);
    expect(getStore().currentReport).toBeNull();
  });
});

// ============================================================================
// Todo actions
// ============================================================================

describe('fetchTodos', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sets todos and summary on success', async () => {
    const todos = [makeTodo('td1')];
    const summary = { total: 1, pending: 1, completed: 0, cancelled: 0 };
    mockApi.getTodos.mockResolvedValueOnce({ todos, summary } as never);

    await act(async () => {
      await getStore().fetchTodos('topic-1');
    });

    expect(getStore().todos).toEqual(todos);
    expect(getStore().todosSummary).toEqual(summary);
    expect(getStore().isLoadingTodos).toBe(false);
  });

  it('sets error on failure', async () => {
    mockApi.getTodos.mockRejectedValueOnce(new Error('fetch todos failed'));

    await act(async () => {
      await expect(getStore().fetchTodos('topic-1')).rejects.toThrow();
    });

    expect(getStore().error).toBe('fetch todos failed');
    expect(getStore().isLoadingTodos).toBe(false);
  });
});

describe('selectTodo', () => {
  it('sets selectedTodoId', async () => {
    await act(async () => {
      getStore().selectTodo('td-123');
    });
    expect(getStore().selectedTodoId).toBe('td-123');
  });

  it('clears selectedTodoId when null passed', async () => {
    await act(async () => {
      getStore().selectTodo(null);
    });
    expect(getStore().selectedTodoId).toBeNull();
  });
});

describe('updateTodoFromWs', () => {
  it('updates existing todo in list', async () => {
    const todo = makeTodo('td1');
    await act(async () => {
      useTopicInsightsStore.setState({ todos: [todo as never] });
    });

    const updated = { ...todo, status: 'COMPLETED' as const };
    await act(async () => {
      getStore().updateTodoFromWs(updated as never);
    });

    expect(getStore().todos[0].status).toBe('COMPLETED');
  });

  it('prepends new todo when id not found in list', async () => {
    await act(async () => {
      useTopicInsightsStore.setState({
        todos: [makeTodo('existing')] as never,
      });
    });

    const newTodo = makeTodo('brand-new');
    await act(async () => {
      getStore().updateTodoFromWs(newTodo as never);
    });

    expect(getStore().todos[0].id).toBe('brand-new');
    expect(getStore().todos).toHaveLength(2);
  });
});

// ============================================================================
// clearError
// ============================================================================

describe('clearError', () => {
  it('sets error to null', async () => {
    await act(async () => {
      useTopicInsightsStore.setState({ error: 'some error' });
    });

    await act(async () => {
      getStore().clearError();
    });

    expect(getStore().error).toBeNull();
  });
});

// ============================================================================
// stopRefreshProgressStream
// ============================================================================

describe('stopRefreshProgressStream', () => {
  it('calls close on the stream and sets refreshStream to null', async () => {
    const close = vi.fn();
    await act(async () => {
      useTopicInsightsStore.setState({ refreshStream: { close } });
    });

    await act(async () => {
      getStore().stopRefreshProgressStream();
    });

    expect(close).toHaveBeenCalled();
    expect(getStore().refreshStream).toBeNull();
  });

  it('does nothing when refreshStream is null', async () => {
    await act(async () => {
      useTopicInsightsStore.setState({ refreshStream: null });
    });

    // Should not throw
    await act(async () => {
      getStore().stopRefreshProgressStream();
    });

    expect(getStore().refreshStream).toBeNull();
  });
});
