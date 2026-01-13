/**
 * AI Studio Zustand Store
 * 管理 AI Studio 深度洞察功能的全局状态
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  ResearchPlanData,
  ResearchStep,
  StepStatus,
} from '@/components/ai-research/deep-research/ResearchPlan';

// ============================================================================
// Types
// ============================================================================

export interface TechTrend {
  name: string;
  direction: 'rising' | 'stable' | 'declining';
  maturityStage: string;
  momentumScore: number;
  adoptionRate: number;
  relatedTechs: string[];
  summary: string;
}

export interface HypeCyclePosition {
  techName: string;
  xPosition: number;
  yPosition: number;
  stage: string;
  yearsToMainstream: string;
}

export interface TrendReport {
  title: string;
  generatedAt: string;
  timeRange: string;
  executiveSummary: string;
  topTrends: TechTrend[];
  hypeCycle: HypeCyclePosition[];
  emergingTechs: string[];
  decliningTechs: string[];
  dataSourcesCount: number;
  confidenceScore: number;
}

export interface TechComparison {
  techA: {
    name: string;
    mentionCount: number;
    scores: Record<string, number>;
    strengths: string[];
    weaknesses: string[];
  };
  techB: {
    name: string;
    mentionCount: number;
    scores: Record<string, number>;
    strengths: string[];
    weaknesses: string[];
  };
  recommendation: string;
  useCases: {
    preferA: string[];
    preferB: string[];
    either: string[];
  };
}

export interface Citation {
  id: string;
  sourceId: string;
  sourceTitle: string;
  paragraphIndex: number;
  exactQuote: string;
  confidence: 'high' | 'medium' | 'low';
  verifiable: boolean;
  hoverPreview: string;
  sourceUrl?: string;
}

export interface CitationMetrics {
  groundedRatio: number;
  sourceCount: number;
  verifiedCount: number;
  overallConfidence: 'high' | 'medium' | 'low';
}

export type FocusMode = 'research' | 'analysis' | 'graph' | 'report' | 'zen';

// ============================================================================
// Research Plan Store
// ============================================================================

interface ResearchPlanState {
  currentPlan: ResearchPlanData | null;
  planHistory: ResearchPlanData[];
  isExecuting: boolean;

  // Actions
  createPlan: (query: string) => void;
  updateStep: (stepId: string, updates: Partial<ResearchStep>) => void;
  updateStepStatus: (stepId: string, status: StepStatus) => void;
  setProgress: (stepId: string, progress: number) => void;
  completePlan: () => void;
  cancelPlan: () => void;
  clearHistory: () => void;
}

export const useResearchPlanStore = create<ResearchPlanState>()(
  persist(
    (set, get) => ({
      currentPlan: null,
      planHistory: [],
      isExecuting: false,

      createPlan: (query) =>
        set({
          currentPlan: {
            id: `plan-${Date.now()}`,
            query,
            status: 'idle',
            createdAt: new Date(),
            estimatedTime: 120,
            steps: [
              {
                id: 'search',
                title: '资料搜集',
                description: '从多个数据源搜索相关资料',
                status: 'pending',
              },
              {
                id: 'collect',
                title: '内容提取',
                description: '提取和解析文档内容',
                status: 'pending',
              },
              {
                id: 'analyze',
                title: '深度分析',
                description: 'AI 分析内容，提取关键信息',
                status: 'pending',
              },
              {
                id: 'trend',
                title: '趋势分析',
                description: '识别技术趋势和发展方向',
                status: 'pending',
              },
              {
                id: 'synthesize',
                title: '洞察生成',
                description: '综合分析生成深度洞察',
                status: 'pending',
              },
            ],
          },
          isExecuting: false,
        }),

      updateStep: (stepId, updates) =>
        set((state) => {
          if (!state.currentPlan) return state;
          return {
            currentPlan: {
              ...state.currentPlan,
              steps: state.currentPlan.steps.map((step) =>
                step.id === stepId ? { ...step, ...updates } : step
              ),
            },
          };
        }),

      updateStepStatus: (stepId, status) =>
        set((state) => {
          if (!state.currentPlan) return state;
          const plan = state.currentPlan;
          const updatedSteps = plan.steps.map((step) =>
            step.id === stepId
              ? {
                  ...step,
                  status,
                  ...(status === 'in_progress'
                    ? { startedAt: new Date() }
                    : {}),
                  ...(status === 'completed'
                    ? { completedAt: new Date() }
                    : {}),
                }
              : step
          );

          const allCompleted = updatedSteps.every(
            (s) => s.status === 'completed'
          );
          const hasError = updatedSteps.some((s) => s.status === 'error');

          return {
            currentPlan: {
              ...plan,
              steps: updatedSteps,
              status: hasError
                ? 'error'
                : allCompleted
                  ? 'completed'
                  : 'running',
            },
            isExecuting: !allCompleted && !hasError,
          };
        }),

      setProgress: (stepId, progress) =>
        set((state) => {
          if (!state.currentPlan) return state;
          return {
            currentPlan: {
              ...state.currentPlan,
              steps: state.currentPlan.steps.map((step) =>
                step.id === stepId ? { ...step, progress } : step
              ),
            },
          };
        }),

      completePlan: () =>
        set((state) => {
          if (!state.currentPlan) return state;
          const completedPlan = {
            ...state.currentPlan,
            status: 'completed' as const,
          };
          return {
            currentPlan: null,
            planHistory: [completedPlan, ...state.planHistory].slice(0, 20),
            isExecuting: false,
          };
        }),

      cancelPlan: () =>
        set({
          currentPlan: null,
          isExecuting: false,
        }),

      clearHistory: () =>
        set({
          planHistory: [],
        }),
    }),
    {
      name: 'ai-studio-research-plan',
      partialize: (state) => ({
        planHistory: state.planHistory.slice(0, 10),
      }),
    }
  )
);

// ============================================================================
// Trend Analysis Store
// ============================================================================

interface TrendAnalysisState {
  currentReport: TrendReport | null;
  reportHistory: TrendReport[];
  isLoading: boolean;
  error: string | null;

  // Actions
  setReport: (report: TrendReport) => void;
  clearReport: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useTrendAnalysisStore = create<TrendAnalysisState>((set) => ({
  currentReport: null,
  reportHistory: [],
  isLoading: false,
  error: null,

  setReport: (report) =>
    set((state) => ({
      currentReport: report,
      reportHistory: [report, ...state.reportHistory].slice(0, 10),
      isLoading: false,
      error: null,
    })),

  clearReport: () =>
    set({
      currentReport: null,
    }),

  setLoading: (loading) =>
    set({
      isLoading: loading,
    }),

  setError: (error) =>
    set({
      error,
      isLoading: false,
    }),
}));

// ============================================================================
// Tech Comparison Store
// ============================================================================

interface TechComparisonState {
  currentComparison: TechComparison | null;
  comparisonHistory: {
    techA: string;
    techB: string;
    comparison: TechComparison;
  }[];
  isLoading: boolean;

  // Actions
  setComparison: (
    techA: string,
    techB: string,
    comparison: TechComparison
  ) => void;
  clearComparison: () => void;
  setLoading: (loading: boolean) => void;
}

export const useTechComparisonStore = create<TechComparisonState>((set) => ({
  currentComparison: null,
  comparisonHistory: [],
  isLoading: false,

  setComparison: (techA, techB, comparison) =>
    set((state) => ({
      currentComparison: comparison,
      comparisonHistory: [
        { techA, techB, comparison },
        ...state.comparisonHistory,
      ].slice(0, 10),
      isLoading: false,
    })),

  clearComparison: () =>
    set({
      currentComparison: null,
    }),

  setLoading: (loading) =>
    set({
      isLoading: loading,
    }),
}));

// ============================================================================
// Citation Store
// ============================================================================

interface CitationState {
  citations: Citation[];
  metrics: CitationMetrics | null;
  activeCitationId: string | null;

  // Actions
  setCitations: (citations: Citation[], metrics: CitationMetrics) => void;
  setActiveCitation: (id: string | null) => void;
  clearCitations: () => void;
}

export const useCitationStore = create<CitationState>((set) => ({
  citations: [],
  metrics: null,
  activeCitationId: null,

  setCitations: (citations, metrics) =>
    set({
      citations,
      metrics,
    }),

  setActiveCitation: (id) =>
    set({
      activeCitationId: id,
    }),

  clearCitations: () =>
    set({
      citations: [],
      metrics: null,
      activeCitationId: null,
    }),
}));

// ============================================================================
// Focus Mode Store
// ============================================================================

interface FocusModeState {
  currentMode: FocusMode;
  previousMode: FocusMode | null;

  // Layout percentages
  layoutConfig: {
    research: { top: number; bottom: number; right: number };
    analysis: { top: number; bottom: number; right: number };
    graph: { top: number; bottom: number; right: number };
    report: { top: number; bottom: number; right: number };
    zen: { top: number; bottom: number; right: number };
  };

  // Actions
  setMode: (mode: FocusMode) => void;
  toggleMode: (mode: FocusMode) => void;
  resetToDefault: () => void;
}

const DEFAULT_LAYOUT_CONFIG = {
  research: { top: 60, bottom: 40, right: 30 },
  analysis: { top: 30, bottom: 70, right: 30 },
  graph: { top: 0, bottom: 0, right: 100 },
  report: { top: 20, bottom: 20, right: 60 },
  zen: { top: 0, bottom: 100, right: 0 },
};

export const useFocusModeStore = create<FocusModeState>()(
  persist(
    (set, get) => ({
      currentMode: 'research',
      previousMode: null,
      layoutConfig: DEFAULT_LAYOUT_CONFIG,

      setMode: (mode) =>
        set((state) => ({
          previousMode: state.currentMode,
          currentMode: mode,
        })),

      toggleMode: (mode) =>
        set((state) => {
          if (state.currentMode === mode && state.previousMode) {
            return {
              currentMode: state.previousMode,
              previousMode: mode,
            };
          }
          return {
            previousMode: state.currentMode,
            currentMode: mode,
          };
        }),

      resetToDefault: () =>
        set({
          currentMode: 'research',
          previousMode: null,
          layoutConfig: DEFAULT_LAYOUT_CONFIG,
        }),
    }),
    {
      name: 'ai-studio-focus-mode',
    }
  )
);

// ============================================================================
// Command Palette Store
// ============================================================================

interface CommandPaletteState {
  isOpen: boolean;
  recentCommands: string[];

  // Actions
  open: () => void;
  close: () => void;
  toggle: () => void;
  addRecentCommand: (commandId: string) => void;
}

export const useCommandPaletteStore = create<CommandPaletteState>()(
  persist(
    (set) => ({
      isOpen: false,
      recentCommands: [],

      open: () => set({ isOpen: true }),
      close: () => set({ isOpen: false }),
      toggle: () => set((state) => ({ isOpen: !state.isOpen })),

      addRecentCommand: (commandId) =>
        set((state) => ({
          recentCommands: [
            commandId,
            ...state.recentCommands.filter((id) => id !== commandId),
          ].slice(0, 10),
        })),
    }),
    {
      name: 'ai-studio-command-palette',
      partialize: (state) => ({
        recentCommands: state.recentCommands,
      }),
    }
  )
);

// ============================================================================
// Keyboard Shortcuts Hook
// ============================================================================

export function useStudioKeyboardShortcuts() {
  const { toggle: toggleCommandPalette } = useCommandPaletteStore();
  const { setMode } = useFocusModeStore();

  if (typeof window !== 'undefined') {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K: Toggle command palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggleCommandPalette();
        return;
      }

      // Cmd/Ctrl + 1-5: Switch focus modes
      if (
        (e.metaKey || e.ctrlKey) &&
        ['1', '2', '3', '4', '5'].includes(e.key)
      ) {
        e.preventDefault();
        const modes: FocusMode[] = [
          'research',
          'analysis',
          'graph',
          'report',
          'zen',
        ];
        const modeIndex = parseInt(e.key) - 1;
        setMode(modes[modeIndex]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }
}
