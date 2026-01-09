/**
 * AI Writing Store
 *
 * Zustand store for AI Writing module
 * Following AI Teams store pattern
 */

import { create } from 'zustand';
import * as api from '@/lib/api/ai-writing';
import type {
  WritingProject,
  Volume,
  Chapter,
  StoryBible,
  Character,
  CreateProjectDto,
  UpdateProjectDto,
  StartMissionDto,
} from '@/lib/api/ai-writing';

interface AIWritingState {
  // Projects
  projects: WritingProject[];
  currentProject: WritingProject | null;
  isLoadingProjects: boolean;

  // Volumes & Chapters
  volumes: Volume[];
  currentChapter: Chapter | null;
  isLoadingVolumes: boolean;

  // Story Bible & Characters
  storyBible: StoryBible | null;
  characters: Character[];
  isLoadingBible: boolean;

  // AI Mission
  isMissionRunning: boolean;
  currentMissionId: string | null;
  missionProgress: number;
  missionMessage: string;
  missionCompleted: boolean;
  activeAgentIds: string[]; // IDs of currently active agents (supports parallel)

  // Error handling
  error: string | null;

  // Actions - Projects
  fetchProjects: () => Promise<void>;
  fetchProject: (id: string, silent?: boolean) => Promise<void>;
  createProject: (dto: CreateProjectDto) => Promise<WritingProject>;
  updateProject: (id: string, dto: UpdateProjectDto) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  setCurrentProject: (project: WritingProject | null) => void;

  // Actions - Volumes & Chapters
  fetchVolumes: (projectId: string, silent?: boolean) => Promise<void>;
  createVolume: (
    projectId: string,
    dto: { title: string; volumeNumber: number }
  ) => Promise<Volume>;
  fetchChapter: (id: string) => Promise<void>;
  updateChapter: (id: string, content: string) => Promise<void>;
  createChapter: (
    volumeId: string,
    dto: { title: string; chapterNumber: number }
  ) => Promise<Chapter>;
  setCurrentChapter: (chapter: Chapter | null) => void;

  // Actions - Story Bible
  fetchStoryBible: (projectId: string) => Promise<void>;
  updateStoryBible: (
    projectId: string,
    dto: Partial<StoryBible>
  ) => Promise<void>;

  // Actions - Characters
  fetchCharacters: (projectId: string) => Promise<void>;
  createCharacter: (
    projectId: string,
    dto: Omit<Character, 'id' | 'projectId'>
  ) => Promise<Character>;
  deleteCharacter: (projectId: string, characterId: string) => Promise<void>;

  // Actions - AI Mission
  startMission: (projectId: string, dto: StartMissionDto) => Promise<void>;
  cancelMission: (projectId: string) => Promise<void>;
  checkRunningMission: (projectId: string) => Promise<void>;

  // Actions - Utility
  clearError: () => void;
  reset: () => void;
  clearCurrentProjectData: () => void;
}

const initialState = {
  projects: [],
  currentProject: null,
  isLoadingProjects: false,
  volumes: [],
  currentChapter: null,
  isLoadingVolumes: false,
  storyBible: null,
  characters: [],
  isLoadingBible: false,
  isMissionRunning: false,
  currentMissionId: null as string | null,
  missionProgress: 0,
  missionMessage: '',
  missionCompleted: false,
  activeAgentIds: [],
  error: null,
};

export const useAIWritingStore = create<AIWritingState>((set, get) => ({
  ...initialState,

  // ==================== Projects ====================

  fetchProjects: async () => {
    set({ isLoadingProjects: true, error: null });
    try {
      const data = await api.getProjects();
      set({ projects: data.items || [], isLoadingProjects: false });
    } catch (err) {
      set({
        error: (err as Error).message,
        isLoadingProjects: false,
      });
    }
  },

  fetchProject: async (id: string, silent = false) => {
    // When silent=true (during polling), don't show loading state to avoid UI flicker
    if (!silent) {
      set({ isLoadingProjects: true, error: null });
    }
    try {
      const project = await api.getProject(id);
      set({ currentProject: project, isLoadingProjects: false });
    } catch (err) {
      if (!silent) {
        set({
          error: (err as Error).message,
          isLoadingProjects: false,
          currentProject: null,
        });
      }
    }
  },

  createProject: async (dto: CreateProjectDto) => {
    set({ error: null });
    try {
      const project = await api.createProject(dto);
      set((state) => ({
        projects: [project, ...state.projects],
      }));
      return project;
    } catch (err) {
      set({ error: (err as Error).message });
      throw err;
    }
  },

  updateProject: async (id: string, dto: UpdateProjectDto) => {
    set({ error: null });
    try {
      const updated = await api.updateProject(id, dto);
      set((state) => ({
        projects: state.projects.map((p) => (p.id === id ? updated : p)),
        currentProject:
          state.currentProject?.id === id ? updated : state.currentProject,
      }));
    } catch (err) {
      set({ error: (err as Error).message });
      throw err;
    }
  },

  deleteProject: async (id: string) => {
    set({ error: null });
    try {
      await api.deleteProject(id);
      set((state) => ({
        projects: state.projects.filter((p) => p.id !== id),
        currentProject:
          state.currentProject?.id === id ? null : state.currentProject,
      }));
    } catch (err) {
      set({ error: (err as Error).message });
      throw err;
    }
  },

  setCurrentProject: (project) => {
    set({ currentProject: project });
  },

  // ==================== Volumes & Chapters ====================

  fetchVolumes: async (projectId: string, silent = false) => {
    // When silent=true (during polling), don't show loading state to avoid UI flicker
    if (!silent) {
      set({ isLoadingVolumes: true, error: null });
    }
    try {
      const volumes = await api.getVolumes(projectId);
      set({ volumes, isLoadingVolumes: false });
    } catch (err) {
      if (!silent) {
        set({
          error: (err as Error).message,
          isLoadingVolumes: false,
        });
      }
    }
  },

  createVolume: async (projectId, dto) => {
    set({ error: null });
    try {
      const volume = await api.createVolume(projectId, dto);
      set((state) => ({
        volumes: [...state.volumes, volume],
      }));
      return volume;
    } catch (err) {
      set({ error: (err as Error).message });
      throw err;
    }
  },

  fetchChapter: async (id: string) => {
    set({ error: null });
    try {
      const chapter = await api.getChapter(id);
      set({ currentChapter: chapter });
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  updateChapter: async (id: string, content: string) => {
    set({ error: null });
    try {
      const updated = await api.updateChapter(id, { content });
      set((state) => {
        // Update chapter in volumes
        const newVolumes = state.volumes.map((v) => ({
          ...v,
          chapters: v.chapters?.map((c) => (c.id === id ? updated : c)),
        }));
        return {
          volumes: newVolumes,
          currentChapter:
            state.currentChapter?.id === id ? updated : state.currentChapter,
        };
      });
    } catch (err) {
      set({ error: (err as Error).message });
      throw err;
    }
  },

  createChapter: async (volumeId, dto) => {
    set({ error: null });
    try {
      const chapter = await api.createChapter(volumeId, dto);
      set((state) => ({
        volumes: state.volumes.map((v) =>
          v.id === volumeId
            ? { ...v, chapters: [...(v.chapters || []), chapter] }
            : v
        ),
      }));
      return chapter;
    } catch (err) {
      set({ error: (err as Error).message });
      throw err;
    }
  },

  setCurrentChapter: (chapter) => {
    set({ currentChapter: chapter });
  },

  // ==================== Story Bible ====================

  fetchStoryBible: async (projectId: string) => {
    set({ isLoadingBible: true, error: null });
    try {
      const bible = await api.getStoryBible(projectId);
      set({ storyBible: bible, isLoadingBible: false });
    } catch (err) {
      // Story Bible might not exist yet, that's OK
      set({ storyBible: null, isLoadingBible: false });
    }
  },

  updateStoryBible: async (projectId: string, dto: Partial<StoryBible>) => {
    set({ error: null });
    try {
      const updated = await api.updateStoryBible(projectId, dto);
      set({ storyBible: updated });
    } catch (err) {
      set({ error: (err as Error).message });
      throw err;
    }
  },

  // ==================== Characters ====================

  fetchCharacters: async (projectId: string) => {
    set({ error: null });
    try {
      const characters = await api.getCharacters(projectId);
      set({ characters });
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  createCharacter: async (projectId, dto) => {
    set({ error: null });
    try {
      const character = await api.createCharacter(projectId, dto);
      set((state) => ({
        characters: [...state.characters, character],
      }));
      return character;
    } catch (err) {
      set({ error: (err as Error).message });
      throw err;
    }
  },

  deleteCharacter: async (projectId: string, characterId: string) => {
    set({ error: null });
    try {
      await api.deleteCharacter(projectId, characterId);
      set((state) => ({
        characters: state.characters.filter((c) => c.id !== characterId),
      }));
    } catch (err) {
      set({ error: (err as Error).message });
      throw err;
    }
  },

  // ==================== AI Mission ====================

  startMission: async (projectId: string, dto: StartMissionDto) => {
    const { fetchVolumes, fetchProject } = get();

    set({
      isMissionRunning: true,
      missionProgress: 0,
      missionMessage: '启动写作任务...',
      missionCompleted: false,
      activeAgentIds: ['architect'],
      error: null,
    });

    try {
      // 调用 API 启动任务，获取 missionId
      const response = await api.startMission(projectId, dto);
      const missionId = response.missionId;

      if (!missionId) {
        throw new Error('未获取到任务ID');
      }

      // 阶段映射：根据后端步骤确定当前阶段
      const stepToPhase: Record<string, { agents: string[]; message: string }> =
        {
          plan: {
            agents: ['architect'],
            message: '故事架构师正在规划故事结构...',
          },
          'context-injection': {
            agents: ['keeper'],
            message: '设定守护者正在建立世界观...',
          },
          write: {
            agents: ['writer-1', 'writer-2', 'writer-3'],
            message: '作家团队正在并行创作内容...',
          },
          check: {
            agents: ['checker-1', 'checker-2'],
            message: '检查员团队正在校验一致性...',
          },
          edit: { agents: ['editor'], message: '润色编辑正在打磨文字...' },
          review: {
            agents: ['architect'],
            message: '故事架构师正在最终审核...',
          },
        };

      // 轮询后端获取真实状态
      const pollInterval = 2000; // 2秒轮询一次
      const maxPolls = 450; // 最多轮询15分钟（450次 × 2秒）
      let pollCount = 0;

      const pollForStatus = async () => {
        while (pollCount < maxPolls) {
          await new Promise((resolve) => setTimeout(resolve, pollInterval));
          pollCount++;

          try {
            const status = await api.getMissionStatus(missionId);

            // 根据 orchestratorState 更新 UI
            if (status.orchestratorState) {
              const { phase, completedSteps, currentSteps, progress } =
                status.orchestratorState;

              // 确定当前活跃的 agents
              let activeAgents: string[] = [];
              let message = '处理中...';

              if (currentSteps.length > 0) {
                const currentStep = currentSteps[0];
                const phaseInfo = stepToPhase[currentStep];
                if (phaseInfo) {
                  activeAgents = phaseInfo.agents;
                  message = phaseInfo.message;
                }
              } else if (completedSteps.length > 0) {
                // 所有步骤完成，显示最后一个
                const lastStep = completedSteps[completedSteps.length - 1];
                const phaseInfo = stepToPhase[lastStep];
                if (phaseInfo) {
                  message = `${phaseInfo.message.replace('正在', '已完成')}`;
                }
              }

              // 当 plan 步骤完成时，立即刷新章节列表（大纲已生成）
              if (completedSteps.includes('plan')) {
                try {
                  await fetchVolumes(projectId, true);
                } catch {
                  // Ignore errors
                }
              }

              // 当 context-injection 步骤完成时，刷新世界观（StoryBible）
              if (completedSteps.includes('context-injection')) {
                try {
                  await get().fetchStoryBible(projectId);
                } catch {
                  // Ignore errors
                }
              }

              set({
                activeAgentIds: activeAgents,
                missionProgress: Math.min(
                  95,
                  progress || (completedSteps.length / 6) * 100
                ),
                missionMessage: message,
              });
            } else if (status.result?.progress !== undefined) {
              // 从 result 中获取进度
              set({
                missionProgress: Math.min(95, status.result.progress),
                missionMessage: status.result.currentStep || '处理中...',
              });
            }

            // 检查是否完成
            if (status.status === 'COMPLETED') {
              set({
                isMissionRunning: false,
                missionProgress: 100,
                missionMessage: '创作完成！',
                missionCompleted: true,
                activeAgentIds: [],
              });

              // 刷新数据
              await fetchVolumes(projectId);
              await fetchProject(projectId);
              return;
            }

            // 检查是否失败
            if (status.status === 'FAILED') {
              // 确保 error 总是字符串
              const rawError = status.result?.error as
                | string
                | { message?: string }
                | undefined;
              const errorMsg =
                typeof rawError === 'string'
                  ? rawError
                  : typeof rawError === 'object' && rawError?.message
                    ? rawError.message
                    : '任务执行失败';
              set({
                isMissionRunning: false,
                missionProgress: 0,
                missionMessage: '',
                missionCompleted: false,
                activeAgentIds: [],
                error: errorMsg,
              });
              return;
            }

            // 每 4 秒刷新一次章节列表（检查是否有新章节/内容更新）
            // 使用 silent=true 避免 UI 闪烁
            if (pollCount % 2 === 0) {
              try {
                await fetchVolumes(projectId, true);
              } catch {
                // Ignore errors during polling
              }
            }
          } catch (err) {
            console.warn('轮询状态失败:', err);
            // 继续轮询，不中断
          }
        }

        // 超时处理 - 任务可能仍在后台运行
        set({
          isMissionRunning: false,
          missionProgress: 0,
          missionMessage: '',
          missionCompleted: false,
          activeAgentIds: [],
          error:
            '前端轮询超时（15分钟），任务可能仍在后台运行。请稍后刷新页面查看结果。',
        });
      };

      // 开始轮询
      void pollForStatus();
    } catch (err) {
      set({
        error: (err as Error).message,
        isMissionRunning: false,
        missionMessage: '',
        missionCompleted: false,
        activeAgentIds: [],
      });
      throw err;
    }
  },

  // 取消当前任务
  cancelMission: async (projectId: string) => {
    const { currentMissionId } = get();

    // 如果没有记录 missionId，尝试从 API 获取
    let missionId = currentMissionId;
    if (!missionId) {
      try {
        const { items } = await api.getProjectMissions(projectId);
        const runningMission = items.find(
          (m) => m.status === 'running' || m.status === 'pending'
        );
        if (runningMission) {
          missionId = runningMission.id;
        }
      } catch {
        // ignore
      }
    }

    if (missionId) {
      try {
        await api.cancelMission(missionId);
      } catch {
        // ignore cancel errors
      }
    }

    // 重置状态
    set({
      isMissionRunning: false,
      currentMissionId: null,
      missionProgress: 0,
      missionMessage: '',
      activeAgentIds: [],
    });
  },

  // 检查是否有正在运行的任务（页面加载时调用，同步多标签页状态）
  checkRunningMission: async (projectId: string) => {
    try {
      const { items } = await api.getProjectMissions(projectId);
      // 查找正在运行的任务（兼容不同状态格式）
      const runningMission = items.find(
        (m) =>
          m.status === 'running' ||
          m.status === 'pending' ||
          m.status === 'IN_PROGRESS'
      );

      if (runningMission) {
        // 有正在运行的任务，同步状态
        set({
          isMissionRunning: true,
          currentMissionId: runningMission.id,
          missionProgress: runningMission.progress || 0,
          missionMessage: '任务进行中...',
          missionCompleted: false,
        });

        // 开始轮询状态
        const { fetchVolumes, fetchProject } = get();
        const pollInterval = 2000;
        const maxPolls = 450; // 15分钟
        let pollCount = 0;

        const pollForStatus = async () => {
          while (pollCount < maxPolls) {
            await new Promise((resolve) => setTimeout(resolve, pollInterval));
            pollCount++;

            try {
              const status = await api.getMissionStatus(runningMission.id);

              if (status.status === 'COMPLETED') {
                set({
                  isMissionRunning: false,
                  missionProgress: 100,
                  missionMessage: '写作任务完成！',
                  missionCompleted: true,
                  activeAgentIds: [],
                });
                await fetchVolumes(projectId, true);
                await fetchProject(projectId);
                return;
              }

              if (status.status === 'FAILED') {
                // 确保 error 总是字符串
                const rawError = status.result?.error as
                  | string
                  | { message?: string }
                  | undefined;
                const errorMsg =
                  typeof rawError === 'string'
                    ? rawError
                    : typeof rawError === 'object' && rawError?.message
                      ? rawError.message
                      : '写作任务失败';
                set({
                  isMissionRunning: false,
                  missionMessage: errorMsg,
                  missionCompleted: false,
                  activeAgentIds: [],
                  error: errorMsg,
                });
                return;
              }

              // 更新进度
              if (status.orchestratorState) {
                const { progress, currentSteps } = status.orchestratorState;
                set({
                  missionProgress: progress || 0,
                  missionMessage:
                    status.result?.currentStep ||
                    currentSteps?.[0] ||
                    '处理中...',
                });
              }

              // 定期刷新章节和项目（更新字数）- 使用 silent 模式避免 UI 闪烁
              if (pollCount % 5 === 0) {
                await fetchVolumes(projectId, true);
                await fetchProject(projectId, true); // 更新字数显示
              }
            } catch {
              // 忽略轮询错误
            }
          }
        };

        void pollForStatus();
      } else {
        // 检查是否有已完成的任务（兼容不同状态格式）
        const completedMission = items.find(
          (m) => m.status === 'completed' || m.status === 'COMPLETED'
        );
        if (completedMission) {
          set({
            isMissionRunning: false,
            missionCompleted: true,
            missionProgress: 100,
            missionMessage: '写作任务已完成',
          });
        }
      }
    } catch (err) {
      // 忽略检查错误，不影响页面加载
      console.warn('Failed to check running mission:', err);
    }
  },

  // ==================== Utility ====================

  clearError: () => {
    set({ error: null });
  },

  reset: () => {
    set(initialState);
  },

  clearCurrentProjectData: () => {
    set({
      currentProject: null,
      volumes: [],
      currentChapter: null,
      storyBible: null,
      characters: [],
      isMissionRunning: false,
      currentMissionId: null,
      missionProgress: 0,
      missionMessage: '',
      missionCompleted: false,
      activeAgentIds: [],
    });
  },
}));
