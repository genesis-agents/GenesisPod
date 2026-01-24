import { StateCreator } from 'zustand';
import type {
  RefreshStatusResponse,
  TriggerRefreshDto,
  ResearchTodo,
  TodoSummary,
} from '@/types/topic-research';
import type {
  MissionStatus,
  TeamInfo,
  ResearchMission,
  TeamMessage,
  AgentActivity,
} from '@/lib/api/topic-research';
import * as api from '@/lib/api/topic-research';

import { logger } from '@/lib/utils/logger';
export interface ResearchSlice {
  // State - Refresh
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

  // State - Leader/Mission
  currentMission: ResearchMission | null;
  missionStatus: MissionStatus | null;
  teamInfo: TeamInfo | null;
  isLoadingMission: boolean;
  missionPollingInterval: NodeJS.Timeout | null;

  // State - Team Messages & Agent Activities
  teamMessages: TeamMessage[];
  agentActivities: AgentActivity[];
  isLoadingTeamData: boolean;

  // State - TODOs
  todos: ResearchTodo[];
  todosSummary: TodoSummary | null;
  selectedTodoId: string | null;
  isLoadingTodos: boolean;

  // State - Error
  error: string | null;

  // Actions - Refresh
  triggerRefresh: (topicId: string, dto?: TriggerRefreshDto) => Promise<void>;
  cancelRefresh: (topicId: string, jobId: string) => Promise<void>;
  fetchRefreshStatus: (topicId: string) => Promise<void>;
  startRefreshProgressStream: (topicId: string) => void;
  stopRefreshProgressStream: () => void;

  // Actions - Leader/Mission
  startLeaderPlan: (
    topicId: string,
    userPrompt?: string,
    mode?: 'fresh' | 'incremental'
  ) => Promise<void>;
  fetchMissionStatus: (topicId: string) => Promise<void>;
  fetchTeamInfo: (topicId: string) => Promise<void>;
  sendLeaderInstruction: (
    topicId: string,
    instruction: string
  ) => Promise<void>;
  retryMission: (topicId: string, taskIds?: string[]) => Promise<void>;
  cancelMission: (topicId: string) => Promise<void>;
  stopMissionPolling: () => void;
  startMissionPolling: (topicId: string) => void;

  // Actions - Team Messages & Agent Activities
  fetchTeamMessages: (topicId: string) => Promise<void>;
  fetchAgentActivities: (topicId: string) => Promise<void>;
  fetchTeamData: (topicId: string) => Promise<void>;

  // Actions - TODOs
  fetchTodos: (topicId: string, missionId?: string) => Promise<void>;
  pauseTodo: (topicId: string, todoId: string) => Promise<void>;
  resumeTodo: (topicId: string, todoId: string) => Promise<void>;
  cancelTodo: (
    topicId: string,
    todoId: string,
    reason?: string
  ) => Promise<void>;
  retryTodo: (topicId: string, todoId: string) => Promise<void>;
  prioritizeTodo: (
    topicId: string,
    todoId: string,
    priority: 'high' | 'normal' | 'low'
  ) => Promise<void>;
  selectTodo: (todoId: string | null) => void;
  updateTodoFromWs: (todo: ResearchTodo) => void;
  createUserRequestTodo: (
    topicId: string,
    missionId: string,
    title: string,
    description?: string
  ) => Promise<void>;

  // Actions - UI
  clearError: () => void;
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

export const createResearchSlice: StateCreator<
  ResearchSlice,
  [],
  [],
  ResearchSlice
> = (set, get) => ({
  // Initial state
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

  stopMissionPolling: () => {
    const { missionPollingInterval } = get();
    if (missionPollingInterval) {
      clearInterval(missionPollingInterval);
      set({ missionPollingInterval: null });
    }
  },

  startMissionPolling: (topicId: string) => {
    // Stop any existing polling first
    get().stopMissionPolling();

    // Start polling every 2 seconds
    const interval = setInterval(async () => {
      try {
        const status = await api.getMission(topicId);
        set({ missionStatus: status });

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

          // Health check: detect stuck missions
          if (isActive) {
            try {
              const healthResult = await api.getMissionHealth(topicId);
              if (healthResult.health && !healthResult.health.isHealthy) {
                logger.warn(
                  'Mission health issues detected:',
                  healthResult.health.issues
                );
              }
            } catch (healthError) {
              logger.debug('Health check failed:', healthError);
            }
          }

          // Stop polling if mission is done
          if (!isActive) {
            get().stopMissionPolling();
          }
        }
      } catch (error) {
        logger.error('Mission polling error:', error);
      }
    }, 2000);

    set({ missionPollingInterval: interval });
  },

  startLeaderPlan: async (topicId, userPrompt, mode = 'fresh') => {
    set({ isRefreshing: true, isLoadingMission: true, error: null });
    try {
      const mission = await api.leaderPlan(topicId, { userPrompt, mode });
      set({ currentMission: mission, isLoadingMission: false });
      get().fetchMissionStatus(topicId);
      get().startMissionPolling(topicId);
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
      }
    } catch (error) {
      if (!isReportNotFoundError(error)) {
        set({
          error:
            error instanceof Error
              ? error.message
              : 'Failed to fetch mission status',
        });
      }
    }
  },

  fetchTeamInfo: async (topicId) => {
    try {
      const teamInfo = await api.getTeam(topicId);
      set({ teamInfo });
    } catch (error) {
      if (!isReportNotFoundError(error)) {
        set({
          error:
            error instanceof Error
              ? error.message
              : 'Failed to fetch team info',
        });
      }
    }
  },

  sendLeaderInstruction: async (topicId, instruction) => {
    try {
      await api.sendLeaderMessage(topicId, instruction);
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

  cancelMission: async (topicId) => {
    try {
      await api.cancelMission(topicId);
      get().stopMissionPolling();
      set({
        isRefreshing: false,
        refreshProgress: null,
        currentMission: null,
      });
      await get().fetchMissionStatus(topicId);
    } catch (error) {
      set({
        error:
          error instanceof Error ? error.message : 'Failed to cancel mission',
      });
      throw error;
    }
  },

  // ==================== Team Messages & Agent Activities ====================

  fetchTeamMessages: async (topicId) => {
    try {
      const messages = await api.getTeamMessages(topicId, { limit: 100 });
      set({ teamMessages: messages });
    } catch (error) {
      logger.error('Failed to fetch team messages:', error);
    }
  },

  fetchAgentActivities: async (topicId) => {
    try {
      const activities = await api.getAgentActivities(topicId, { limit: 100 });
      set({ agentActivities: activities });
    } catch (error) {
      logger.error('Failed to fetch agent activities:', error);
    }
  },

  fetchTeamData: async (topicId) => {
    set({ isLoadingTeamData: true });
    try {
      const [messages, activities] = await Promise.all([
        api.getTeamMessages(topicId, { limit: 100 }),
        api.getAgentActivities(topicId, { limit: 100 }),
      ]);
      set({
        teamMessages: messages,
        agentActivities: activities,
        isLoadingTeamData: false,
      });
    } catch (error) {
      logger.error('Failed to fetch team data:', error);
      set({ isLoadingTeamData: false });
    }
  },

  // ==================== TODOs ====================

  fetchTodos: async (topicId, missionId) => {
    set({ isLoadingTodos: true, error: null });
    try {
      const response = await api.getTodos(topicId, { missionId });
      set({
        todos: response.todos,
        todosSummary: response.summary,
        isLoadingTodos: false,
      });
    } catch (error) {
      set({
        isLoadingTodos: false,
        error: error instanceof Error ? error.message : 'Failed to fetch todos',
      });
      throw error;
    }
  },

  pauseTodo: async (topicId, todoId) => {
    try {
      const response = await api.pauseTodo(topicId, todoId);
      set((state) => ({
        todos: state.todos.map((t) => (t.id === todoId ? response.todo : t)),
      }));
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to pause todo',
      });
      throw error;
    }
  },

  resumeTodo: async (topicId, todoId) => {
    try {
      const response = await api.resumeTodo(topicId, todoId);
      set((state) => ({
        todos: state.todos.map((t) => (t.id === todoId ? response.todo : t)),
      }));
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to resume todo',
      });
      throw error;
    }
  },

  cancelTodo: async (topicId, todoId, reason) => {
    try {
      const response = await api.cancelTodo(topicId, todoId, reason);
      set((state) => ({
        todos: state.todos.map((t) => (t.id === todoId ? response.todo : t)),
      }));
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to cancel todo',
      });
      throw error;
    }
  },

  retryTodo: async (topicId, todoId) => {
    try {
      const response = await api.retryTodo(topicId, todoId);
      set((state) => ({
        todos: state.todos.map((t) => (t.id === todoId ? response.todo : t)),
      }));
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to retry todo',
      });
      throw error;
    }
  },

  prioritizeTodo: async (topicId, todoId, priority) => {
    try {
      const response = await api.prioritizeTodo(topicId, todoId, priority);
      set((state) => ({
        todos: state.todos.map((t) => (t.id === todoId ? response.todo : t)),
      }));
    } catch (error) {
      set({
        error:
          error instanceof Error ? error.message : 'Failed to prioritize todo',
      });
      throw error;
    }
  },

  selectTodo: (todoId) => {
    set({ selectedTodoId: todoId });
  },

  updateTodoFromWs: (todo) => {
    set((state) => {
      const existingIndex = state.todos.findIndex((t) => t.id === todo.id);
      if (existingIndex >= 0) {
        const newTodos = [...state.todos];
        newTodos[existingIndex] = todo;
        return { todos: newTodos };
      } else {
        return { todos: [todo, ...state.todos] };
      }
    });
  },

  createUserRequestTodo: async (topicId, missionId, title, description) => {
    try {
      const response = await api.createUserRequestTodo(
        topicId,
        missionId,
        title,
        description
      );
      set((state) => ({
        todos: [response.todo, ...state.todos],
      }));
    } catch (error) {
      set({
        error:
          error instanceof Error
            ? error.message
            : 'Failed to create user request todo',
      });
      throw error;
    }
  },

  // ==================== UI ====================

  clearError: () => {
    set({ error: null });
  },
});
