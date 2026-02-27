import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the API module
vi.mock('@/lib/api/topic-insights', () => ({
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
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
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

function getInitialResearchState() {
  return {
    refreshStatus: null,
    isRefreshing: false,
    refreshProgress: null,
    refreshStream: null,
    currentMission: null,
    missionStatus: null,
    teamInfo: null,
    isLoadingMission: false,
    missionPollingInterval: null,
    teamMessages: [],
    agentActivities: [],
    isLoadingTeamData: false,
    todos: [],
    todosSummary: null,
    selectedTodoId: null,
    isLoadingTodos: false,
    error: null,
  };
}

describe('researchSlice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    useTopicInsightsStore.getState().resetStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ==================== Initial State ====================

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const state = useTopicInsightsStore.getState();
      expect(state.refreshStatus).toBeNull();
      expect(state.isRefreshing).toBe(false);
      expect(state.refreshProgress).toBeNull();
      expect(state.refreshStream).toBeNull();
      expect(state.currentMission).toBeNull();
      expect(state.missionStatus).toBeNull();
      expect(state.teamInfo).toBeNull();
      expect(state.isLoadingMission).toBe(false);
      expect(state.missionPollingInterval).toBeNull();
      expect(state.teamMessages).toEqual([]);
      expect(state.agentActivities).toEqual([]);
      expect(state.isLoadingTeamData).toBe(false);
      expect(state.todos).toEqual([]);
      expect(state.todosSummary).toBeNull();
      expect(state.selectedTodoId).toBeNull();
      expect(state.isLoadingTodos).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  // ==================== Refresh Actions ====================

  describe('triggerRefresh', () => {
    it('should set isRefreshing to true and call api.triggerRefresh', async () => {
      vi.mocked(api.triggerRefresh).mockResolvedValueOnce(undefined as never);
      vi.mocked(api.createRefreshProgressStream).mockReturnValueOnce({
        close: vi.fn(),
      } as never);

      await useTopicInsightsStore.getState().triggerRefresh('topic-1');

      expect(vi.mocked(api.triggerRefresh)).toHaveBeenCalledWith(
        'topic-1',
        undefined
      );
      expect(vi.mocked(api.createRefreshProgressStream)).toHaveBeenCalledWith(
        'topic-1',
        expect.objectContaining({
          onProgress: expect.any(Function),
          onComplete: expect.any(Function),
          onError: expect.any(Function),
        })
      );
    });

    it('should set error and throw if triggerRefresh fails', async () => {
      const err = new Error('Network error');
      vi.mocked(api.triggerRefresh).mockRejectedValueOnce(err);

      await expect(
        useTopicInsightsStore.getState().triggerRefresh('topic-1')
      ).rejects.toThrow('Network error');

      const state = useTopicInsightsStore.getState();
      expect(state.isRefreshing).toBe(false);
      expect(state.error).toBe('Network error');
    });

    it('should pass dto to api.triggerRefresh', async () => {
      vi.mocked(api.triggerRefresh).mockResolvedValueOnce(undefined as never);
      vi.mocked(api.createRefreshProgressStream).mockReturnValueOnce({
        close: vi.fn(),
      } as never);

      const dto = { force: true };
      await useTopicInsightsStore
        .getState()
        .triggerRefresh('topic-1', dto as never);

      expect(vi.mocked(api.triggerRefresh)).toHaveBeenCalledWith(
        'topic-1',
        dto
      );
    });
  });

  describe('cancelRefresh', () => {
    it('should call api.cancelRefresh and clear state', async () => {
      vi.mocked(api.cancelRefresh).mockResolvedValueOnce(undefined as never);

      // Set up a mock stream
      const mockClose = vi.fn();
      useTopicInsightsStore.setState({
        refreshStream: { close: mockClose },
        isRefreshing: true,
      });

      await useTopicInsightsStore.getState().cancelRefresh('topic-1', 'job-1');

      expect(vi.mocked(api.cancelRefresh)).toHaveBeenCalledWith(
        'topic-1',
        'job-1'
      );
      expect(mockClose).toHaveBeenCalled();

      const state = useTopicInsightsStore.getState();
      expect(state.isRefreshing).toBe(false);
      expect(state.refreshProgress).toBeNull();
    });

    it('should set error and rethrow if cancelRefresh fails', async () => {
      const err = new Error('Cancel failed');
      vi.mocked(api.cancelRefresh).mockRejectedValueOnce(err);

      await expect(
        useTopicInsightsStore.getState().cancelRefresh('topic-1', 'job-1')
      ).rejects.toThrow('Cancel failed');

      expect(useTopicInsightsStore.getState().error).toBe('Cancel failed');
    });
  });

  describe('fetchRefreshStatus', () => {
    it('should update refreshStatus and isRefreshing from API response', async () => {
      const mockStatus = { isRunning: true, jobId: 'job-1' };
      vi.mocked(api.getRefreshStatus).mockResolvedValueOnce(
        mockStatus as never
      );

      await useTopicInsightsStore.getState().fetchRefreshStatus('topic-1');

      const state = useTopicInsightsStore.getState();
      expect(state.refreshStatus).toEqual(mockStatus);
      expect(state.isRefreshing).toBe(true);
    });

    it('should set isRefreshing false when status is not running', async () => {
      const mockStatus = { isRunning: false };
      vi.mocked(api.getRefreshStatus).mockResolvedValueOnce(
        mockStatus as never
      );

      await useTopicInsightsStore.getState().fetchRefreshStatus('topic-1');

      expect(useTopicInsightsStore.getState().isRefreshing).toBe(false);
    });

    it('should set error and rethrow if fetch fails', async () => {
      const err = new Error('Fetch failed');
      vi.mocked(api.getRefreshStatus).mockRejectedValueOnce(err);

      await expect(
        useTopicInsightsStore.getState().fetchRefreshStatus('topic-1')
      ).rejects.toThrow('Fetch failed');

      expect(useTopicInsightsStore.getState().error).toBe('Fetch failed');
    });
  });

  describe('startRefreshProgressStream', () => {
    it('should create a stream and store it in state', () => {
      const mockClose = vi.fn();
      vi.mocked(api.createRefreshProgressStream).mockReturnValueOnce({
        close: mockClose,
      } as never);

      useTopicInsightsStore.getState().startRefreshProgressStream('topic-1');

      expect(vi.mocked(api.createRefreshProgressStream)).toHaveBeenCalledWith(
        'topic-1',
        expect.any(Object)
      );
      expect(useTopicInsightsStore.getState().refreshStream).toEqual({
        close: mockClose,
      });
    });

    it('should close existing stream before creating new one', () => {
      const mockClose1 = vi.fn();
      const mockClose2 = vi.fn();

      useTopicInsightsStore.setState({ refreshStream: { close: mockClose1 } });

      vi.mocked(api.createRefreshProgressStream).mockReturnValueOnce({
        close: mockClose2,
      } as never);
      useTopicInsightsStore.getState().startRefreshProgressStream('topic-1');

      expect(mockClose1).toHaveBeenCalled();
    });

    it('onProgress callback should update refreshProgress', () => {
      let capturedOnProgress: ((e: unknown) => void) | undefined;
      vi.mocked(api.createRefreshProgressStream).mockImplementationOnce(
        (_topicId, handlers) => {
          capturedOnProgress = (
            handlers as { onProgress: (e: unknown) => void }
          ).onProgress;
          return { close: vi.fn() };
        }
      );

      useTopicInsightsStore.getState().startRefreshProgressStream('topic-1');

      const progressEvent = {
        phase: 'analysis',
        progress: 50,
        message: 'Analyzing',
        completedDimensions: 2,
        totalDimensions: 4,
      };
      capturedOnProgress!(progressEvent);

      expect(useTopicInsightsStore.getState().refreshProgress).toEqual(
        progressEvent
      );
    });

    it('onComplete callback should clear isRefreshing and refreshProgress', async () => {
      let capturedOnComplete:
        | ((e: unknown) => void | Promise<void>)
        | undefined;
      vi.mocked(api.createRefreshProgressStream).mockImplementationOnce(
        (_topicId, handlers) => {
          capturedOnComplete = (
            handlers as { onComplete: (e: unknown) => void }
          ).onComplete;
          return { close: vi.fn() };
        }
      );

      useTopicInsightsStore.setState({
        isRefreshing: true,
        refreshProgress: {
          phase: 'x',
          progress: 50,
          message: 'msg',
          completedDimensions: 1,
          totalDimensions: 2,
        },
      });
      useTopicInsightsStore.getState().startRefreshProgressStream('topic-1');

      await capturedOnComplete!({});

      const state = useTopicInsightsStore.getState();
      expect(state.isRefreshing).toBe(false);
      expect(state.refreshProgress).toBeNull();
    });

    it('onError callback should set error and clear isRefreshing', () => {
      let capturedOnError: ((e: { error: string }) => void) | undefined;
      vi.mocked(api.createRefreshProgressStream).mockImplementationOnce(
        (_topicId, handlers) => {
          capturedOnError = (
            handlers as { onError: (e: { error: string }) => void }
          ).onError;
          return { close: vi.fn() };
        }
      );

      useTopicInsightsStore.setState({ isRefreshing: true });
      useTopicInsightsStore.getState().startRefreshProgressStream('topic-1');

      capturedOnError!({ error: 'Stream error' });

      const state = useTopicInsightsStore.getState();
      expect(state.isRefreshing).toBe(false);
      expect(state.error).toBe('Stream error');
    });
  });

  describe('stopRefreshProgressStream', () => {
    it('should close the stream and set refreshStream to null', () => {
      const mockClose = vi.fn();
      useTopicInsightsStore.setState({ refreshStream: { close: mockClose } });

      useTopicInsightsStore.getState().stopRefreshProgressStream();

      expect(mockClose).toHaveBeenCalled();
      expect(useTopicInsightsStore.getState().refreshStream).toBeNull();
    });

    it('should do nothing if refreshStream is null', () => {
      useTopicInsightsStore.setState({ refreshStream: null });
      expect(() =>
        useTopicInsightsStore.getState().stopRefreshProgressStream()
      ).not.toThrow();
    });
  });

  // ==================== Mission Polling ====================

  describe('startMissionPolling', () => {
    it('should set missionPollingInterval in state', () => {
      vi.mocked(api.getMission).mockResolvedValue(null as never);

      useTopicInsightsStore.getState().startMissionPolling('topic-1');

      expect(
        useTopicInsightsStore.getState().missionPollingInterval
      ).not.toBeNull();
    });

    it('should stop existing polling before starting new', () => {
      vi.mocked(api.getMission).mockResolvedValue(null as never);

      // Start polling twice
      useTopicInsightsStore.getState().startMissionPolling('topic-1');
      const firstInterval =
        useTopicInsightsStore.getState().missionPollingInterval;

      useTopicInsightsStore.getState().startMissionPolling('topic-1');
      const secondInterval =
        useTopicInsightsStore.getState().missionPollingInterval;

      expect(firstInterval).not.toBe(secondInterval);
    });

    it('should poll mission status and set missionStatus', async () => {
      const mockStatus = {
        status: 'PLANNING',
        currentPhase: 'plan',
        progress: 10,
        completedTasks: 0,
        totalTasks: 5,
      };
      vi.mocked(api.getMission).mockResolvedValue(mockStatus as never);
      vi.mocked(api.getMissionHealth).mockResolvedValue({
        health: { isHealthy: true, issues: [] },
      } as never);

      useTopicInsightsStore.getState().startMissionPolling('topic-1');

      // Advance timer to trigger first interval
      await vi.advanceTimersByTimeAsync(2000);

      expect(vi.mocked(api.getMission)).toHaveBeenCalledWith('topic-1');
      expect(useTopicInsightsStore.getState().missionStatus).toEqual(
        mockStatus
      );
    });

    it('should set isRefreshing true for active mission statuses', async () => {
      const mockStatus = {
        status: 'EXECUTING',
        currentPhase: 'exec',
        progress: 40,
        completedTasks: 2,
        totalTasks: 5,
      };
      vi.mocked(api.getMission).mockResolvedValue(mockStatus as never);
      vi.mocked(api.getMissionHealth).mockResolvedValue({
        health: { isHealthy: true, issues: [] },
      } as never);

      useTopicInsightsStore.getState().startMissionPolling('topic-1');
      await vi.advanceTimersByTimeAsync(2000);

      expect(useTopicInsightsStore.getState().isRefreshing).toBe(true);
    });

    it('should stop polling when mission is no longer active', async () => {
      const mockStatus = {
        status: 'COMPLETED',
        currentPhase: 'done',
        progress: 100,
        completedTasks: 5,
        totalTasks: 5,
      };
      vi.mocked(api.getMission).mockResolvedValue(mockStatus as never);

      useTopicInsightsStore.getState().startMissionPolling('topic-1');
      await vi.advanceTimersByTimeAsync(2000);

      expect(
        useTopicInsightsStore.getState().missionPollingInterval
      ).toBeNull();
    });

    it('should stop polling on 401 unauthorized error', async () => {
      const err = new Error('401 Unauthorized');
      err.name = 'UnauthorizedError';
      vi.mocked(api.getMission).mockRejectedValueOnce(err);

      useTopicInsightsStore.getState().startMissionPolling('topic-1');
      await vi.advanceTimersByTimeAsync(2000);

      expect(
        useTopicInsightsStore.getState().missionPollingInterval
      ).toBeNull();
    });
  });

  describe('stopMissionPolling', () => {
    it('should clear interval and set missionPollingInterval to null', () => {
      vi.mocked(api.getMission).mockResolvedValue(null as never);
      useTopicInsightsStore.getState().startMissionPolling('topic-1');

      expect(
        useTopicInsightsStore.getState().missionPollingInterval
      ).not.toBeNull();

      useTopicInsightsStore.getState().stopMissionPolling();

      expect(
        useTopicInsightsStore.getState().missionPollingInterval
      ).toBeNull();
    });

    it('should do nothing if no polling interval is set', () => {
      useTopicInsightsStore.setState({ missionPollingInterval: null });
      expect(() =>
        useTopicInsightsStore.getState().stopMissionPolling()
      ).not.toThrow();
    });
  });

  // ==================== Mission Actions ====================

  describe('startLeaderPlan', () => {
    it('should set isRefreshing and isLoadingMission true before API call', async () => {
      vi.mocked(api.leaderPlan).mockImplementationOnce(async () => {
        expect(useTopicInsightsStore.getState().isRefreshing).toBe(true);
        expect(useTopicInsightsStore.getState().isLoadingMission).toBe(true);
        return { id: 'm1' } as never;
      });
      vi.mocked(api.getMission).mockResolvedValue({
        status: 'PLANNING',
        currentPhase: 'plan',
        progress: 0,
        completedTasks: 0,
        totalTasks: 0,
      } as never);
      vi.mocked(api.getMissionHealth).mockResolvedValue({
        health: { isHealthy: true, issues: [] },
      } as never);

      await useTopicInsightsStore
        .getState()
        .startLeaderPlan('topic-1', 'analyze AI');
    });

    it('should set currentMission on success', async () => {
      const mockMission = { id: 'm1', status: 'PLANNING' };
      vi.mocked(api.leaderPlan).mockResolvedValueOnce(mockMission as never);
      vi.mocked(api.getMission).mockResolvedValue({
        status: 'PLANNING',
        currentPhase: 'plan',
        progress: 0,
        completedTasks: 0,
        totalTasks: 0,
      } as never);
      vi.mocked(api.getMissionHealth).mockResolvedValue({
        health: { isHealthy: true, issues: [] },
      } as never);

      await useTopicInsightsStore.getState().startLeaderPlan('topic-1');

      expect(useTopicInsightsStore.getState().currentMission).toEqual(
        mockMission
      );
      expect(useTopicInsightsStore.getState().isLoadingMission).toBe(false);
    });

    it('should use default mode=fresh if not provided', async () => {
      vi.mocked(api.leaderPlan).mockResolvedValueOnce({ id: 'm1' } as never);
      vi.mocked(api.getMission).mockResolvedValue({
        status: 'PLANNING',
        currentPhase: 'plan',
        progress: 0,
        completedTasks: 0,
        totalTasks: 0,
      } as never);
      vi.mocked(api.getMissionHealth).mockResolvedValue({
        health: { isHealthy: true, issues: [] },
      } as never);

      await useTopicInsightsStore.getState().startLeaderPlan('topic-1');

      expect(vi.mocked(api.leaderPlan)).toHaveBeenCalledWith(
        'topic-1',
        expect.objectContaining({ mode: 'fresh' })
      );
    });

    it('should set error and rethrow on failure', async () => {
      const err = new Error('Plan failed');
      vi.mocked(api.leaderPlan).mockRejectedValueOnce(err);

      await expect(
        useTopicInsightsStore.getState().startLeaderPlan('topic-1')
      ).rejects.toThrow('Plan failed');

      const state = useTopicInsightsStore.getState();
      expect(state.isRefreshing).toBe(false);
      expect(state.isLoadingMission).toBe(false);
      expect(state.error).toBe('Plan failed');
    });
  });

  describe('fetchMissionStatus', () => {
    it('should update missionStatus', async () => {
      const mockStatus = {
        status: 'COMPLETED',
        currentPhase: 'done',
        progress: 100,
        completedTasks: 5,
        totalTasks: 5,
      };
      vi.mocked(api.getMission).mockResolvedValueOnce(mockStatus as never);

      await useTopicInsightsStore.getState().fetchMissionStatus('topic-1');

      expect(useTopicInsightsStore.getState().missionStatus).toEqual(
        mockStatus
      );
    });

    it('should set isRefreshing true for PLANNING status', async () => {
      const mockStatus = {
        status: 'PLANNING',
        currentPhase: 'plan',
        progress: 0,
        completedTasks: 0,
        totalTasks: 3,
      };
      vi.mocked(api.getMission).mockResolvedValueOnce(mockStatus as never);

      await useTopicInsightsStore.getState().fetchMissionStatus('topic-1');

      expect(useTopicInsightsStore.getState().isRefreshing).toBe(true);
    });

    it('should auto-start polling if mission is active and no polling running', async () => {
      const mockStatus = {
        status: 'EXECUTING',
        currentPhase: 'exec',
        progress: 20,
        completedTasks: 1,
        totalTasks: 5,
      };
      vi.mocked(api.getMission).mockResolvedValue(mockStatus as never);
      vi.mocked(api.getMissionHealth).mockResolvedValue({
        health: { isHealthy: true, issues: [] },
      } as never);

      useTopicInsightsStore.setState({ missionPollingInterval: null });
      await useTopicInsightsStore.getState().fetchMissionStatus('topic-1');

      expect(
        useTopicInsightsStore.getState().missionPollingInterval
      ).not.toBeNull();
    });

    it('should not throw for report-not-found errors', async () => {
      const err = new Error('No reports found');
      vi.mocked(api.getMission).mockRejectedValueOnce(err);

      await expect(
        useTopicInsightsStore.getState().fetchMissionStatus('topic-1')
      ).resolves.not.toThrow();
    });
  });

  describe('cancelMission', () => {
    it('should call api.cancelMission and clear mission state', async () => {
      vi.mocked(api.cancelMission).mockResolvedValueOnce(undefined as never);
      vi.mocked(api.getMission).mockResolvedValueOnce(null as never);

      useTopicInsightsStore.setState({
        isRefreshing: true,
        refreshProgress: {
          phase: 'x',
          progress: 50,
          message: 'm',
          completedDimensions: 1,
          totalDimensions: 2,
        },
      });

      await useTopicInsightsStore.getState().cancelMission('topic-1');

      expect(vi.mocked(api.cancelMission)).toHaveBeenCalledWith('topic-1');
      const state = useTopicInsightsStore.getState();
      expect(state.isRefreshing).toBe(false);
      expect(state.refreshProgress).toBeNull();
      expect(state.currentMission).toBeNull();
    });

    it('should set error and rethrow on failure', async () => {
      const err = new Error('Cancel failed');
      vi.mocked(api.cancelMission).mockRejectedValueOnce(err);

      await expect(
        useTopicInsightsStore.getState().cancelMission('topic-1')
      ).rejects.toThrow('Cancel failed');

      expect(useTopicInsightsStore.getState().error).toBe('Cancel failed');
    });
  });

  describe('retryMission', () => {
    it('should call api.retryMission and start polling', async () => {
      vi.mocked(api.retryMission).mockResolvedValueOnce(undefined as never);
      vi.mocked(api.getMission).mockResolvedValue({
        status: 'EXECUTING',
        currentPhase: 'exec',
        progress: 0,
        completedTasks: 0,
        totalTasks: 3,
      } as never);
      vi.mocked(api.getMissionHealth).mockResolvedValue({
        health: { isHealthy: true, issues: [] },
      } as never);

      await useTopicInsightsStore.getState().retryMission('topic-1');

      expect(vi.mocked(api.retryMission)).toHaveBeenCalledWith(
        'topic-1',
        undefined
      );
    });

    it('should set error and rethrow on failure', async () => {
      const err = new Error('Retry failed');
      vi.mocked(api.retryMission).mockRejectedValueOnce(err);

      await expect(
        useTopicInsightsStore.getState().retryMission('topic-1')
      ).rejects.toThrow('Retry failed');

      expect(useTopicInsightsStore.getState().error).toBe('Retry failed');
    });
  });

  // ==================== Team Data ====================

  describe('fetchTeamData', () => {
    it('should fetch messages and activities concurrently', async () => {
      const mockMessages = [{ id: 'msg1', content: 'hello' }];
      const mockActivities = [{ id: 'act1', type: 'START' }];
      vi.mocked(api.getTeamMessages).mockResolvedValueOnce(
        mockMessages as never
      );
      vi.mocked(api.getAgentActivities).mockResolvedValueOnce(
        mockActivities as never
      );

      await useTopicInsightsStore.getState().fetchTeamData('topic-1');

      const state = useTopicInsightsStore.getState();
      expect(state.teamMessages).toEqual(mockMessages);
      expect(state.agentActivities).toEqual(mockActivities);
      expect(state.isLoadingTeamData).toBe(false);
    });

    it('should set isLoadingTeamData true during fetch', async () => {
      let resolveMessages: (v: unknown) => void;
      const messagesPromise = new Promise((r) => {
        resolveMessages = r;
      });
      vi.mocked(api.getTeamMessages).mockReturnValueOnce(
        messagesPromise as never
      );
      vi.mocked(api.getAgentActivities).mockResolvedValueOnce([] as never);

      const fetchPromise = useTopicInsightsStore
        .getState()
        .fetchTeamData('topic-1');
      expect(useTopicInsightsStore.getState().isLoadingTeamData).toBe(true);

      resolveMessages!([]);
      await fetchPromise;
      expect(useTopicInsightsStore.getState().isLoadingTeamData).toBe(false);
    });

    it('should set isLoadingTeamData false on error', async () => {
      vi.mocked(api.getTeamMessages).mockRejectedValueOnce(
        new Error('fetch fail')
      );
      vi.mocked(api.getAgentActivities).mockRejectedValueOnce(
        new Error('fetch fail')
      );

      await useTopicInsightsStore.getState().fetchTeamData('topic-1');

      expect(useTopicInsightsStore.getState().isLoadingTeamData).toBe(false);
    });
  });

  // ==================== TODOs ====================

  describe('fetchTodos', () => {
    it('should set todos and todosSummary on success', async () => {
      const mockTodos = [{ id: 't1', title: 'Research AI' }];
      const mockSummary = { total: 1, completed: 0 };
      vi.mocked(api.getTodos).mockResolvedValueOnce({
        todos: mockTodos,
        summary: mockSummary,
      } as never);

      await useTopicInsightsStore.getState().fetchTodos('topic-1');

      const state = useTopicInsightsStore.getState();
      expect(state.todos).toEqual(mockTodos);
      expect(state.todosSummary).toEqual(mockSummary);
      expect(state.isLoadingTodos).toBe(false);
    });

    it('should set isLoadingTodos true during fetch', async () => {
      let resolve: (v: unknown) => void;
      const promise = new Promise((r) => {
        resolve = r;
      });
      vi.mocked(api.getTodos).mockReturnValueOnce(promise as never);

      const fetchPromise = useTopicInsightsStore
        .getState()
        .fetchTodos('topic-1');
      expect(useTopicInsightsStore.getState().isLoadingTodos).toBe(true);

      resolve!({ todos: [], summary: null });
      await fetchPromise;
      expect(useTopicInsightsStore.getState().isLoadingTodos).toBe(false);
    });

    it('should pass missionId to api.getTodos when provided', async () => {
      vi.mocked(api.getTodos).mockResolvedValueOnce({
        todos: [],
        summary: null,
      } as never);

      await useTopicInsightsStore.getState().fetchTodos('topic-1', 'mission-1');

      expect(vi.mocked(api.getTodos)).toHaveBeenCalledWith('topic-1', {
        missionId: 'mission-1',
      });
    });

    it('should set error and rethrow on failure', async () => {
      const err = new Error('Fetch todos failed');
      vi.mocked(api.getTodos).mockRejectedValueOnce(err);

      await expect(
        useTopicInsightsStore.getState().fetchTodos('topic-1')
      ).rejects.toThrow('Fetch todos failed');

      expect(useTopicInsightsStore.getState().error).toBe('Fetch todos failed');
    });
  });

  describe('pauseTodo', () => {
    it('should update the todo in state on success', async () => {
      const original = { id: 't1', title: 'Research', status: 'RUNNING' };
      const updated = { id: 't1', title: 'Research', status: 'PAUSED' };
      useTopicInsightsStore.setState({ todos: [original as never] });
      vi.mocked(api.pauseTodo).mockResolvedValueOnce({
        todo: updated,
      } as never);

      await useTopicInsightsStore.getState().pauseTodo('topic-1', 't1');

      expect(useTopicInsightsStore.getState().todos[0]).toEqual(updated);
    });

    it('should set error and rethrow on failure', async () => {
      useTopicInsightsStore.setState({ todos: [{ id: 't1' } as never] });
      vi.mocked(api.pauseTodo).mockRejectedValueOnce(new Error('Pause failed'));

      await expect(
        useTopicInsightsStore.getState().pauseTodo('topic-1', 't1')
      ).rejects.toThrow('Pause failed');

      expect(useTopicInsightsStore.getState().error).toBe('Pause failed');
    });
  });

  describe('resumeTodo', () => {
    it('should update the todo in state on success', async () => {
      const original = { id: 't1', title: 'Research', status: 'PAUSED' };
      const updated = { id: 't1', title: 'Research', status: 'RUNNING' };
      useTopicInsightsStore.setState({ todos: [original as never] });
      vi.mocked(api.resumeTodo).mockResolvedValueOnce({
        todo: updated,
      } as never);

      await useTopicInsightsStore.getState().resumeTodo('topic-1', 't1');

      expect(useTopicInsightsStore.getState().todos[0]).toEqual(updated);
    });
  });

  describe('cancelTodo', () => {
    it('should update the todo in state on success', async () => {
      const original = { id: 't1', status: 'RUNNING' };
      const updated = { id: 't1', status: 'CANCELLED' };
      useTopicInsightsStore.setState({ todos: [original as never] });
      vi.mocked(api.cancelTodo).mockResolvedValueOnce({
        todo: updated,
      } as never);

      await useTopicInsightsStore
        .getState()
        .cancelTodo('topic-1', 't1', 'no longer needed');

      expect(vi.mocked(api.cancelTodo)).toHaveBeenCalledWith(
        'topic-1',
        't1',
        'no longer needed'
      );
      expect(useTopicInsightsStore.getState().todos[0]).toEqual(updated);
    });
  });

  describe('retryTodo', () => {
    it('should update the todo in state on success', async () => {
      const original = { id: 't1', status: 'FAILED' };
      const updated = { id: 't1', status: 'RUNNING' };
      useTopicInsightsStore.setState({ todos: [original as never] });
      vi.mocked(api.retryTodo).mockResolvedValueOnce({
        todo: updated,
      } as never);

      await useTopicInsightsStore.getState().retryTodo('topic-1', 't1');

      expect(useTopicInsightsStore.getState().todos[0]).toEqual(updated);
    });
  });

  describe('prioritizeTodo', () => {
    it('should update the todo priority in state', async () => {
      const original = { id: 't1', priority: 'normal' };
      const updated = { id: 't1', priority: 'high' };
      useTopicInsightsStore.setState({ todos: [original as never] });
      vi.mocked(api.prioritizeTodo).mockResolvedValueOnce({
        todo: updated,
      } as never);

      await useTopicInsightsStore
        .getState()
        .prioritizeTodo('topic-1', 't1', 'high');

      expect(vi.mocked(api.prioritizeTodo)).toHaveBeenCalledWith(
        'topic-1',
        't1',
        'high'
      );
      expect(useTopicInsightsStore.getState().todos[0]).toEqual(updated);
    });
  });

  describe('selectTodo', () => {
    it('should set selectedTodoId', () => {
      useTopicInsightsStore.getState().selectTodo('t1');
      expect(useTopicInsightsStore.getState().selectedTodoId).toBe('t1');
    });

    it('should set selectedTodoId to null', () => {
      useTopicInsightsStore.setState({ selectedTodoId: 't1' });
      useTopicInsightsStore.getState().selectTodo(null);
      expect(useTopicInsightsStore.getState().selectedTodoId).toBeNull();
    });
  });

  describe('updateTodoFromWs', () => {
    it('should update existing todo in state', () => {
      const existing = { id: 't1', status: 'RUNNING', title: 'Old' };
      const updated = { id: 't1', status: 'COMPLETED', title: 'Old' };
      useTopicInsightsStore.setState({ todos: [existing as never] });

      useTopicInsightsStore.getState().updateTodoFromWs(updated as never);

      expect(useTopicInsightsStore.getState().todos[0]).toEqual(updated);
      expect(useTopicInsightsStore.getState().todos).toHaveLength(1);
    });

    it('should prepend new todo if not found in state', () => {
      const existing = { id: 't1', status: 'RUNNING', title: 'Old' };
      const newTodo = { id: 't2', status: 'PENDING', title: 'New' };
      useTopicInsightsStore.setState({ todos: [existing as never] });

      useTopicInsightsStore.getState().updateTodoFromWs(newTodo as never);

      const todos = useTopicInsightsStore.getState().todos;
      expect(todos).toHaveLength(2);
      expect(todos[0]).toEqual(newTodo);
    });
  });

  describe('createUserRequestTodo', () => {
    it('should prepend the new todo to state', async () => {
      const existing = { id: 't1', title: 'Old' };
      const newTodo = { id: 't2', title: 'New request' };
      useTopicInsightsStore.setState({ todos: [existing as never] });
      vi.mocked(api.createUserRequestTodo).mockResolvedValueOnce({
        todo: newTodo,
      } as never);

      await useTopicInsightsStore
        .getState()
        .createUserRequestTodo('topic-1', 'mission-1', 'New request');

      const todos = useTopicInsightsStore.getState().todos;
      expect(todos[0]).toEqual(newTodo);
      expect(todos).toHaveLength(2);
    });

    it('should set error and rethrow on failure', async () => {
      vi.mocked(api.createUserRequestTodo).mockRejectedValueOnce(
        new Error('Create failed')
      );

      await expect(
        useTopicInsightsStore
          .getState()
          .createUserRequestTodo('topic-1', 'mission-1', 'title')
      ).rejects.toThrow('Create failed');

      // When error is an Error instance, error.message is used directly
      expect(useTopicInsightsStore.getState().error).toBe('Create failed');
    });
  });

  // ==================== UI ====================

  describe('clearError', () => {
    it('should set error to null', () => {
      useTopicInsightsStore.setState({ error: 'some error' });
      useTopicInsightsStore.getState().clearError();
      expect(useTopicInsightsStore.getState().error).toBeNull();
    });
  });
});
