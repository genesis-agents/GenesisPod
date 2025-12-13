/**
 * Agent Store
 * Agent 矩阵系统状态管理
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import {
  AgentType,
  AgentTask,
  AgentPlan,
  AgentResult,
  AgentEvent,
  ProgressState,
  ToolType,
  AGENT_CONFIGS,
} from '@/lib/ai-office/agents/types';

interface AgentStore {
  // 当前选中的 Agent
  currentAgent: AgentType | null;
  setCurrentAgent: (agent: AgentType | null) => void;

  // 当前任务
  currentTask: AgentTask | null;
  setCurrentTask: (task: AgentTask | null) => void;

  // 任务历史
  taskHistory: AgentTask[];
  addTaskToHistory: (task: AgentTask) => void;
  clearTaskHistory: () => void;

  // 进度状态
  progress: ProgressState;
  updateProgress: (update: Partial<ProgressState>) => void;
  resetProgress: () => void;

  // 结果
  result: AgentResult | null;
  setResult: (result: AgentResult | null) => void;

  // 事件处理
  handleEvent: (event: AgentEvent) => void;

  // 重置
  reset: () => void;
}

const initialProgress: ProgressState = {
  phase: 'idle',
  percentage: 0,
  message: '',
  currentStep: undefined,
  completedSteps: [],
  toolCalls: [],
};

export const useAgentStore = create<AgentStore>()(
  devtools(
    (set, get) => ({
      // 初始状态
      currentAgent: null,
      currentTask: null,
      taskHistory: [],
      progress: initialProgress,
      result: null,

      // Actions
      setCurrentAgent: (agent) => set({ currentAgent: agent }),

      setCurrentTask: (task) => set({ currentTask: task }),

      addTaskToHistory: (task) =>
        set((state) => ({
          taskHistory: [task, ...state.taskHistory].slice(0, 50), // 保留最近 50 个
        })),

      clearTaskHistory: () => set({ taskHistory: [] }),

      updateProgress: (update) =>
        set((state) => ({
          progress: { ...state.progress, ...update },
        })),

      resetProgress: () => set({ progress: initialProgress }),

      setResult: (result) => set({ result }),

      handleEvent: (event) => {
        const { progress } = get();

        switch (event.type) {
          case 'plan_ready':
            set({
              progress: {
                ...progress,
                phase: 'planning',
                percentage: 10,
                message: '计划已就绪，准备执行...',
              },
            });
            break;

          case 'step_start':
            set({
              progress: {
                ...progress,
                phase: 'executing',
                message: event.message,
              },
            });
            break;

          case 'step_progress':
            set({
              progress: {
                ...progress,
                percentage: Math.min(10 + event.progress * 0.8, 90),
                message: event.message,
              },
            });
            break;

          case 'step_complete':
            set({
              progress: {
                ...progress,
                completedSteps: [...progress.completedSteps, event.stepId],
              },
            });
            break;

          case 'tool_call':
            set({
              progress: {
                ...progress,
                toolCalls: [
                  ...progress.toolCalls,
                  {
                    tool: event.tool,
                    input: event.input,
                    timestamp: new Date(),
                  },
                ],
              },
            });
            break;

          case 'tool_result':
            const toolCalls = [...progress.toolCalls];
            const lastCall = toolCalls[toolCalls.length - 1];
            if (lastCall && lastCall.tool === event.tool) {
              lastCall.output = event.output;
              lastCall.duration = event.duration;
            }
            set({
              progress: {
                ...progress,
                toolCalls,
              },
            });
            break;

          case 'artifact':
            // 处理产出物
            break;

          case 'complete':
            set({
              progress: {
                ...progress,
                phase: 'completed',
                percentage: 100,
                message: '任务完成',
              },
              result: event.result,
            });
            break;

          case 'error':
            set({
              progress: {
                ...progress,
                phase: 'error',
                message: event.error,
              },
            });
            break;
        }
      },

      reset: () =>
        set({
          currentTask: null,
          progress: initialProgress,
          result: null,
        }),
    }),
    { name: 'agent-store' }
  )
);

// 选择器
export const useCurrentAgent = () =>
  useAgentStore((state) => state.currentAgent);

export const useCurrentAgentConfig = () =>
  useAgentStore((state) =>
    state.currentAgent ? AGENT_CONFIGS[state.currentAgent] : null
  );

export const useProgress = () => useAgentStore((state) => state.progress);

export const useIsProcessing = () =>
  useAgentStore(
    (state) =>
      state.progress.phase === 'planning' ||
      state.progress.phase === 'executing'
  );

export default useAgentStore;
