import { StateCreator } from 'zustand';
import type {
  ResearchTopic,
  TopicDimension,
  TopicSchedule,
  TopicStats,
  ResearchTemplate,
  CreateTopicDto,
  UpdateTopicDto,
  ListTopicsDto,
  AddDimensionDto,
  UpdateDimensionDto,
  ReorderDimensionsDto,
  UpdateScheduleDto,
  ResearchTopicType,
} from '@/types/topic-insights';
import * as api from '@/lib/api/topic-insights';

export interface TopicSlice {
  // State - Topics
  topics: ResearchTopic[];
  currentTopic: ResearchTopic | null;
  isLoadingTopics: boolean;

  // State - Dimensions
  dimensions: TopicDimension[];
  isLoadingDimensions: boolean;

  // State - Schedule
  schedule: TopicSchedule | null;

  // State - Stats
  stats: TopicStats | null;

  // State - Templates
  templates: ResearchTemplate[];
  isLoadingTemplates: boolean;

  // Actions - Topics
  fetchTopics: (options?: ListTopicsDto) => Promise<void>;
  fetchTopic: (topicId: string) => Promise<void>;
  createTopic: (dto: CreateTopicDto) => Promise<ResearchTopic>;
  updateTopic: (topicId: string, dto: UpdateTopicDto) => Promise<void>;
  deleteTopic: (topicId: string) => Promise<void>;
  setCurrentTopic: (topic: ResearchTopic | null) => void;

  // Actions - Dimensions
  fetchDimensions: (topicId: string) => Promise<void>;
  addDimension: (topicId: string, dto: AddDimensionDto) => Promise<void>;
  updateDimension: (
    topicId: string,
    dimensionId: string,
    dto: UpdateDimensionDto
  ) => Promise<void>;
  deleteDimension: (topicId: string, dimensionId: string) => Promise<void>;
  refreshDimension: (topicId: string, dimensionId: string) => Promise<void>;
  reorderDimensions: (
    topicId: string,
    dto: ReorderDimensionsDto
  ) => Promise<void>;

  // Actions - Schedule
  fetchSchedule: (topicId: string) => Promise<void>;
  updateSchedule: (topicId: string, dto: UpdateScheduleDto) => Promise<void>;

  // Actions - Stats
  fetchStats: (topicId: string) => Promise<void>;

  // Actions - Templates
  fetchTemplates: (type: ResearchTopicType) => Promise<void>;
  createFromTemplate: (
    templateId: string,
    overrides?: Partial<CreateTopicDto>
  ) => Promise<ResearchTopic>;
}

export const createTopicSlice: StateCreator<TopicSlice, [], [], TopicSlice> = (
  set,
  get
) => ({
  // Initial state
  topics: [],
  currentTopic: null,
  isLoadingTopics: false,
  dimensions: [],
  isLoadingDimensions: false,
  schedule: null,
  stats: null,
  templates: [],
  isLoadingTemplates: false,

  // ==================== Topics ====================

  fetchTopics: async (options) => {
    set({ isLoadingTopics: true });
    try {
      const topics = await api.getTopics(options);
      set({ topics, isLoadingTopics: false });
    } catch (error) {
      set({ isLoadingTopics: false });
      throw error;
    }
  },

  fetchTopic: async (topicId) => {
    try {
      const topic = await api.getTopic(topicId);
      set({ currentTopic: topic });
      // Update topics list
      set((state) => ({
        topics: state.topics.map((t) => (t.id === topicId ? topic : t)),
      }));
    } catch (error) {
      throw error;
    }
  },

  createTopic: async (dto) => {
    const topic = await api.createTopic(dto);
    set((state) => ({ topics: [topic, ...state.topics] }));
    return topic;
  },

  updateTopic: async (topicId, dto) => {
    const topic = await api.updateTopic(topicId, dto);
    set((state) => ({
      topics: state.topics.map((t) => (t.id === topicId ? topic : t)),
      currentTopic:
        state.currentTopic?.id === topicId ? topic : state.currentTopic,
    }));
  },

  deleteTopic: async (topicId) => {
    await api.deleteTopic(topicId);
    set((state) => ({
      topics: state.topics.filter((t) => t.id !== topicId),
      currentTopic:
        state.currentTopic?.id === topicId ? null : state.currentTopic,
    }));
  },

  setCurrentTopic: (topic) => {
    set({ currentTopic: topic });
  },

  // ==================== Dimensions ====================

  fetchDimensions: async (topicId) => {
    set({ isLoadingDimensions: true });
    try {
      const dimensions = await api.getDimensions(topicId);
      set({ dimensions, isLoadingDimensions: false });
    } catch (error) {
      set({ isLoadingDimensions: false });
      throw error;
    }
  },

  addDimension: async (topicId, dto) => {
    const dimension = await api.addDimension(topicId, dto);
    set((state) => ({ dimensions: [...state.dimensions, dimension] }));
  },

  updateDimension: async (topicId, dimensionId, dto) => {
    const dimension = await api.updateDimension(topicId, dimensionId, dto);
    set((state) => ({
      dimensions: state.dimensions.map((d) =>
        d.id === dimensionId ? dimension : d
      ),
    }));
  },

  deleteDimension: async (topicId, dimensionId) => {
    await api.deleteDimension(topicId, dimensionId);
    set((state) => ({
      dimensions: state.dimensions.filter((d) => d.id !== dimensionId),
    }));
  },

  refreshDimension: async (topicId, dimensionId) => {
    await api.refreshDimension(topicId, dimensionId);
    // Refresh dimensions to get updated status
    await get().fetchDimensions(topicId);
  },

  reorderDimensions: async (topicId, dto) => {
    const dimensions = await api.reorderDimensions(topicId, dto);
    set({ dimensions });
  },

  // ==================== Schedule ====================

  fetchSchedule: async (topicId) => {
    try {
      const schedule = await api.getSchedule(topicId);
      set({ schedule });
    } catch (error) {
      throw error;
    }
  },

  updateSchedule: async (topicId, dto) => {
    const schedule = await api.updateSchedule(topicId, dto);
    set({ schedule });
  },

  // ==================== Stats ====================

  fetchStats: async (topicId) => {
    try {
      const stats = await api.getStats(topicId);
      set({ stats });
    } catch (error) {
      throw error;
    }
  },

  // ==================== Templates ====================

  fetchTemplates: async (type) => {
    set({ isLoadingTemplates: true });
    try {
      const templates = await api.getTemplates(type);
      set({ templates, isLoadingTemplates: false });
    } catch (error) {
      set({ isLoadingTemplates: false });
      throw error;
    }
  },

  createFromTemplate: async (templateId, overrides) => {
    const topic = await api.createFromTemplate(templateId, overrides);
    set((state) => ({ topics: [topic, ...state.topics] }));
    return topic;
  },
});
