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

/**
 * 思考步骤 - 用于展示 AI 思考过程
 */
export interface ThinkingStep {
  id: string;
  tool: string;
  description: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  startTime?: Date;
  endTime?: Date;
  input?: any;
  output?: any;
  duration?: number;
}

interface AgentStore {
  // 当前选中的 Agent
  currentAgent: AgentType | null;
  setCurrentAgent: (agent: AgentType | null) => void;

  // 当前任务
  currentTask: AgentTask | null;
  setCurrentTask: (task: AgentTask | null) => void;

  // 当前计划
  currentPlan: AgentPlan | null;
  setCurrentPlan: (plan: AgentPlan | null) => void;

  // 任务历史
  taskHistory: AgentTask[];
  addTaskToHistory: (task: AgentTask) => void;
  clearTaskHistory: () => void;

  // 进度状态
  progress: ProgressState;
  updateProgress: (update: Partial<ProgressState>) => void;
  resetProgress: () => void;

  // 思考步骤 - 用于展示 AI 思考过程
  thinkingSteps: ThinkingStep[];
  addThinkingStep: (step: ThinkingStep) => void;
  updateThinkingStep: (id: string, updates: Partial<ThinkingStep>) => void;
  clearThinkingSteps: () => void;

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
      currentPlan: null,
      taskHistory: [],
      progress: initialProgress,
      thinkingSteps: [],
      result: null,

      // Actions
      setCurrentAgent: (agent) => set({ currentAgent: agent }),

      setCurrentTask: (task) => set({ currentTask: task }),

      setCurrentPlan: (plan) => set({ currentPlan: plan }),

      addTaskToHistory: (task) =>
        set((state) => ({
          taskHistory: [task, ...state.taskHistory].slice(0, 50), // 保留最近 50 个
        })),

      clearTaskHistory: () => set({ taskHistory: [] }),

      updateProgress: (update) =>
        set((state) => ({
          progress: { ...state.progress, ...update },
        })),

      resetProgress: () =>
        set({ progress: initialProgress, thinkingSteps: [] }),

      // 思考步骤管理
      addThinkingStep: (step) =>
        set((state) => ({
          thinkingSteps: [...state.thinkingSteps, step],
        })),

      updateThinkingStep: (id, updates) =>
        set((state) => ({
          thinkingSteps: state.thinkingSteps.map((step) =>
            step.id === id ? { ...step, ...updates } : step
          ),
        })),

      clearThinkingSteps: () => set({ thinkingSteps: [] }),

      setResult: (result) => set({ result }),

      handleEvent: (event) => {
        const { progress, thinkingSteps, currentPlan } = get();

        switch (event.type) {
          case 'progress':
            // 处理进度更新事件
            const progressData = (event as any).data || {};
            const phase = progressData.phase || '';
            const percentage = progressData.percentage || 0;
            const message = progressData.message || '';

            // 根据阶段创建或更新思考步骤
            const phaseToolMap: Record<string, string> = {
              init: 'thinking',
              extract: 'web_search',
              fetch: 'web_search',
              outline: 'outline',
              planning: 'outline',
              generating: 'content',
              rendering: 'image',
            };

            const tool = phaseToolMap[phase] || 'thinking';
            const existingStep = thinkingSteps.find(
              (s) => s.tool === tool && s.status === 'processing'
            );

            if (!existingStep && message && phase !== 'init') {
              // 创建新的思考步骤
              const progressStepId = `progress_${Date.now()}`;
              set({
                progress: {
                  ...progress,
                  phase: percentage < 100 ? 'executing' : 'completed',
                  percentage,
                  message,
                },
                thinkingSteps: [
                  ...thinkingSteps,
                  {
                    id: progressStepId,
                    tool,
                    description: message,
                    status: percentage >= 100 ? 'completed' : 'processing',
                    startTime: new Date(),
                    endTime: percentage >= 100 ? new Date() : undefined,
                  },
                ],
              });
            } else {
              // 只更新进度
              set({
                progress: {
                  ...progress,
                  phase: percentage < 100 ? 'executing' : 'completed',
                  percentage,
                  message,
                },
              });
            }
            break;

          case 'plan_ready':
            // 保存计划，计算总步骤数用于进度计算
            const plan = (event as any).plan as AgentPlan;
            const eventData = (event as any).data || {};
            const outline = eventData.outline;
            const sections = outline?.sections || [];
            const totalSteps = sections.length || plan?.steps?.length || 1;

            // 创建思考步骤（包含子步骤）
            const planStepId = `plan_${Date.now()}`;
            const planThinkingStep: ThinkingStep = {
              id: planStepId,
              tool: 'outline',
              description: `已规划 ${totalSteps} 个章节`,
              status: 'completed',
              startTime: new Date(),
              endTime: new Date(),
            };

            set({
              currentPlan: plan,
              progress: {
                ...progress,
                phase: 'planning',
                percentage: 10,
                message: `计划已就绪，共 ${totalSteps} 个步骤`,
                totalSteps,
              },
              // 添加计划完成的思考步骤
              thinkingSteps: [planThinkingStep],
            });
            break;

          case 'step_start':
            // 记录当前步骤，更新进度
            const stepIndex = (event as any).stepIndex || 0;
            const total = (progress as any).totalSteps || 1;
            // 进度从 10% 到 90%，按步骤均分
            const stepProgress = 10 + (stepIndex / total) * 80;

            // 创建思考步骤
            const stepStartId = `step_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const stepData = (event as any).data || {};
            const stepTitle =
              stepData.title || event.message || `步骤 ${stepIndex + 1}`;

            set({
              progress: {
                ...progress,
                phase: 'executing',
                currentStep: (event as any).stepId || stepStartId,
                percentage: Math.min(stepProgress, 90),
                message: event.message || `执行步骤 ${stepIndex + 1}/${total}`,
              },
              thinkingSteps: [
                ...thinkingSteps,
                {
                  id: stepStartId,
                  tool: 'content',
                  description: stepTitle,
                  status: 'processing',
                  startTime: new Date(),
                },
              ],
            });
            break;

          case 'step_progress':
            // 步骤内进度更新 - event.progress 是 0-100
            const baseProgress = progress.percentage || 10;
            const stepTotal = (progress as any).totalSteps || 1;
            const increment =
              (80 / stepTotal) * ((event as any).progress / 100);
            set({
              progress: {
                ...progress,
                percentage: Math.min(baseProgress + increment, 90),
                message: event.message,
              },
            });
            break;

          case 'step_complete':
            // 完成最后一个处理中的思考步骤
            const completedThinkingSteps = thinkingSteps.map((step) => {
              if (step.status === 'processing') {
                return {
                  ...step,
                  status: 'completed' as const,
                  endTime: new Date(),
                  duration: step.startTime
                    ? Date.now() - step.startTime.getTime()
                    : undefined,
                };
              }
              return step;
            });

            set({
              progress: {
                ...progress,
                completedSteps: [
                  ...progress.completedSteps,
                  (event as any).stepId,
                ],
              },
              thinkingSteps: completedThinkingSteps,
            });
            break;

          case 'tool_call':
            // 创建新的思考步骤
            const toolCallId = `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const toolName = (event as any).tool || 'unknown';
            const toolInput = (event as any).input;

            // 生成友好的工具描述
            const toolDescription = getToolDescription(toolName, toolInput);

            set({
              progress: {
                ...progress,
                toolCalls: [
                  ...progress.toolCalls,
                  {
                    tool: toolName,
                    input: toolInput,
                    timestamp: new Date(),
                  },
                ],
              },
              thinkingSteps: [
                ...thinkingSteps,
                {
                  id: toolCallId,
                  tool: toolName,
                  description: toolDescription,
                  status: 'processing',
                  startTime: new Date(),
                  input: toolInput,
                },
              ],
            });
            break;

          case 'tool_result':
            const toolCalls = [...progress.toolCalls];
            const lastCall = toolCalls[toolCalls.length - 1];
            const resultTool = (event as any).tool;

            if (lastCall && lastCall.tool === resultTool) {
              lastCall.output = (event as any).output;
              lastCall.duration = (event as any).duration;
            }

            // 更新对应的思考步骤状态
            const updatedSteps = thinkingSteps.map((step) => {
              if (step.tool === resultTool && step.status === 'processing') {
                return {
                  ...step,
                  status: 'completed' as const,
                  endTime: new Date(),
                  output: (event as any).output,
                  duration: (event as any).duration,
                };
              }
              return step;
            });

            set({
              progress: {
                ...progress,
                toolCalls,
              },
              thinkingSteps: updatedSteps,
            });
            break;

          case 'thinking':
            // 处理 AI 思考事件（新增事件类型）
            const thinkingId = `thinking_${Date.now()}`;
            set({
              thinkingSteps: [
                ...thinkingSteps,
                {
                  id: thinkingId,
                  tool: 'thinking',
                  description: (event as any).content || '思考中...',
                  status: 'completed',
                  startTime: new Date(),
                  endTime: new Date(),
                },
              ],
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
              result: (event as any).result,
            });
            break;

          case 'error':
            // 将最后一个处理中的思考步骤标记为错误
            const errorSteps = thinkingSteps.map((step) => {
              if (step.status === 'processing') {
                return {
                  ...step,
                  status: 'error' as const,
                  endTime: new Date(),
                };
              }
              return step;
            });
            set({
              progress: {
                ...progress,
                phase: 'error',
                message: (event as any).error,
              },
              thinkingSteps: errorSteps,
            });
            break;
        }
      },

      reset: () =>
        set({
          currentTask: null,
          currentPlan: null,
          progress: initialProgress,
          thinkingSteps: [],
          result: null,
        }),
    }),
    { name: 'agent-store' }
  )
);

/**
 * 获取工具的友好描述
 */
function getToolDescription(tool: string, input: any): string {
  const toolDescriptions: Record<string, (input: any) => string> = {
    text_generation: (input) =>
      `生成文本: ${input?.prompt?.substring(0, 50) || '...'}`,
    code_generation: (input) => `生成代码: ${input?.language || 'code'}`,
    code_execution: (input) => `执行代码: ${input?.language || 'code'}`,
    web_search: (input) => `搜索: ${input?.query || '...'}`,
    image_generation: (input) =>
      `生成图片: ${input?.prompt?.substring(0, 30) || '...'}`,
    document_creation: () => '创建文档',
    slide_creation: () => '创建幻灯片',
    data_analysis: () => '数据分析',
    file_operation: (input) => `文件操作: ${input?.operation || '...'}`,
  };

  const descFn = toolDescriptions[tool];
  if (descFn) {
    try {
      return descFn(input);
    } catch {
      return `使用工具: ${tool}`;
    }
  }
  return `使用工具: ${tool}`;
}

// 选择器
export const useCurrentAgent = () =>
  useAgentStore((state) => state.currentAgent);

export const useCurrentAgentConfig = () =>
  useAgentStore((state) =>
    state.currentAgent ? AGENT_CONFIGS[state.currentAgent] : null
  );

export const useProgress = () => useAgentStore((state) => state.progress);

export const useCurrentPlan = () => useAgentStore((state) => state.currentPlan);

export const useThinkingSteps = () =>
  useAgentStore((state) => state.thinkingSteps);

export const useIsProcessing = () =>
  useAgentStore(
    (state) =>
      state.progress.phase === 'planning' ||
      state.progress.phase === 'executing'
  );

export default useAgentStore;
