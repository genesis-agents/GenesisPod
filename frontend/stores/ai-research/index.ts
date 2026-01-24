/**
 * Topic Research Store - Modular Architecture
 *
 * 使用 Zustand slice 模式拆分大型 store：
 * - topicSlice: Topics, Dimensions, Schedule, Stats, Templates
 * - reportSlice: Reports, Evidence, Logs, Comparison
 * - researchSlice: Refresh, Mission, Team Data, TODOs
 */

import { create } from 'zustand';
import { createTopicSlice, TopicSlice } from './topicSlice';
import { createReportSlice, ReportSlice } from './reportSlice';
import { createResearchSlice, ResearchSlice } from './researchSlice';

// Combined store interface
interface TopicResearchState extends TopicSlice, ReportSlice, ResearchSlice {
  // UI Actions
  resetStore: () => void;
  resetTopicData: () => void;
}

export const useTopicResearchStore = create<TopicResearchState>()(
  (set, get) => {
    const topicSlice = createTopicSlice(
      set,
      get,
      { setState: set, getState: get } as any
    );
    const reportSlice = createReportSlice(
      set,
      get,
      { setState: set, getState: get } as any
    );
    const researchSlice = createResearchSlice(
      set,
      get,
      { setState: set, getState: get } as any
    );

    return {
      ...topicSlice,
      ...reportSlice,
      ...researchSlice,

      resetStore: () => {
        get().stopRefreshProgressStream();
        get().stopMissionPolling();
        set({
          // Topics
          topics: [],
          currentTopic: null,
          isLoadingTopics: false,
          dimensions: [],
          isLoadingDimensions: false,
          schedule: null,
          stats: null,
          templates: [],
          isLoadingTemplates: false,
          // Reports
          reports: [],
          currentReport: null,
          isLoadingReports: false,
          hasMoreReports: false,
          reportsCursor: null,
          evidence: [],
          isLoadingEvidence: false,
          evidenceTotal: 0,
          logs: [],
          isLoadingLogs: false,
          comparisonResult: null,
          // Research
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
        });
      },

      resetTopicData: () => {
        get().stopRefreshProgressStream();
        get().stopMissionPolling();
        set({
          // Keep topics, currentTopic, isLoadingTopics (managed externally)
          // Keep templates, isLoadingTemplates (global shared)
          // Clear current topic-related data
          dimensions: [],
          isLoadingDimensions: false,
          reports: [],
          currentReport: null,
          isLoadingReports: false,
          hasMoreReports: false,
          reportsCursor: null,
          evidence: [],
          isLoadingEvidence: false,
          evidenceTotal: 0,
          logs: [],
          isLoadingLogs: false,
          schedule: null,
          stats: null,
          comparisonResult: null,
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
        });
      },
    };
  }
);

// Re-export types for convenience
export type { TopicSlice, ReportSlice, ResearchSlice };
