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
  missionProgress: number;
  missionMessage: string;

  // Error handling
  error: string | null;

  // Actions - Projects
  fetchProjects: () => Promise<void>;
  fetchProject: (id: string) => Promise<void>;
  createProject: (dto: CreateProjectDto) => Promise<WritingProject>;
  updateProject: (id: string, dto: UpdateProjectDto) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  setCurrentProject: (project: WritingProject | null) => void;

  // Actions - Volumes & Chapters
  fetchVolumes: (projectId: string) => Promise<void>;
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

  // Actions - Utility
  clearError: () => void;
  reset: () => void;
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
  missionProgress: 0,
  missionMessage: '',
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

  fetchProject: async (id: string) => {
    set({ isLoadingProjects: true, error: null });
    try {
      const project = await api.getProject(id);
      set({ currentProject: project, isLoadingProjects: false });
    } catch (err) {
      set({
        error: (err as Error).message,
        isLoadingProjects: false,
        currentProject: null,
      });
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

  fetchVolumes: async (projectId: string) => {
    set({ isLoadingVolumes: true, error: null });
    try {
      const volumes = await api.getVolumes(projectId);
      set({ volumes, isLoadingVolumes: false });
    } catch (err) {
      set({
        error: (err as Error).message,
        isLoadingVolumes: false,
      });
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
    const { fetchVolumes } = get();

    set({
      isMissionRunning: true,
      missionProgress: 0,
      missionMessage: '启动写作任务...',
      error: null,
    });
    try {
      await api.startMission(projectId, dto);

      // Mission runs async on backend - keep UI showing progress
      // Simulate progress while waiting for backend to complete
      set({ missionMessage: 'AI 团队正在协作中...' });

      // Poll for completion by checking if volumes/chapters have been created
      // Do this for up to 60 seconds (check every 3 seconds)
      let attempts = 0;
      const maxAttempts = 20;
      const pollInterval = 3000;

      const pollForCompletion = async () => {
        while (attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, pollInterval));
          attempts++;

          // Update progress message based on attempts
          const progress = Math.min(95, (attempts / maxAttempts) * 100);
          const messages = [
            '分析故事结构...',
            '规划章节大纲...',
            '生成内容中...',
            '检查一致性...',
            '润色文字...',
          ];
          const messageIndex = Math.min(
            Math.floor(progress / 20),
            messages.length - 1
          );
          set({
            missionProgress: progress,
            missionMessage: messages[messageIndex],
          });

          // Refresh volumes to check if anything new was created
          try {
            await fetchVolumes(projectId);
          } catch {
            // Ignore errors during polling
          }
        }

        // After max attempts, mark as done
        set({
          isMissionRunning: false,
          missionProgress: 100,
          missionMessage: '任务完成',
        });

        // Final refresh
        await fetchVolumes(projectId);
      };

      // Start polling in background
      void pollForCompletion();
    } catch (err) {
      set({
        error: (err as Error).message,
        isMissionRunning: false,
        missionMessage: '',
      });
      throw err;
    }
  },

  // ==================== Utility ====================

  clearError: () => {
    set({ error: null });
  },

  reset: () => {
    set(initialState);
  },
}));
