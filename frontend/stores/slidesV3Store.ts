/**
 * Slides Engine v3.0 - Zustand Store
 *
 * 管理幻灯片生成的状态，包括：
 * - 会话管理
 * - 检查点管理
 * - 生成进度
 * - 页面状态
 */

import { create } from 'zustand';
import { persist, devtools } from 'zustand/middleware';
import type {
  SlidesSession,
  Checkpoint,
  CheckpointState,
  PageState,
  GenerationProgress,
  StreamEvent,
  TaskDecomposition,
  OutlinePlan,
  QualityReport,
  GlobalStyles,
  GENSPARK_DESIGN_SYSTEM,
} from '@/types/slides-v3';

// ============================================================================
// Store State
// ============================================================================

interface SlidesV3State {
  // 会话
  session: SlidesSession | null;
  sessionLoading: boolean;

  // 检查点
  checkpoints: Checkpoint[];
  currentCheckpointId: string | null;
  checkpointsLoading: boolean;

  // 生成状态
  generating: boolean;
  progress: GenerationProgress | null;
  streamEvents: StreamEvent[];

  // 页面状态
  pages: PageState[];
  selectedPageIndex: number;

  // 任务分解和大纲
  taskDecomposition: TaskDecomposition | null;
  outlinePlan: OutlinePlan | null;

  // 质量报告
  qualityReport: QualityReport | null;

  // 全局样式
  globalStyles: GlobalStyles;

  // 错误
  error: string | null;

  // UI 状态
  leftPanelCollapsed: boolean;
  rightPanelCollapsed: boolean;
  previewMode: 'single' | 'thumbnail';
}

// ============================================================================
// Store Actions
// ============================================================================

interface SlidesV3Actions {
  // 会话操作
  setSession: (session: SlidesSession | null) => void;
  setSessionLoading: (loading: boolean) => void;
  clearSession: () => void;

  // 检查点操作
  setCheckpoints: (checkpoints: Checkpoint[]) => void;
  addCheckpoint: (checkpoint: Checkpoint) => void;
  setCurrentCheckpointId: (id: string | null) => void;
  setCheckpointsLoading: (loading: boolean) => void;

  // 生成操作
  setGenerating: (generating: boolean) => void;
  setProgress: (progress: GenerationProgress | null) => void;
  addStreamEvent: (event: StreamEvent) => void;
  clearStreamEvents: () => void;

  // 页面操作
  setPages: (pages: PageState[]) => void;
  updatePage: (pageNumber: number, updates: Partial<PageState>) => void;
  setSelectedPageIndex: (index: number) => void;

  // 任务和大纲
  setTaskDecomposition: (task: TaskDecomposition | null) => void;
  setOutlinePlan: (plan: OutlinePlan | null) => void;

  // 质量报告
  setQualityReport: (report: QualityReport | null) => void;

  // 全局样式
  setGlobalStyles: (styles: Partial<GlobalStyles>) => void;

  // 错误处理
  setError: (error: string | null) => void;

  // UI 状态
  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;
  setPreviewMode: (mode: 'single' | 'thumbnail') => void;

  // 从检查点恢复状态
  restoreFromCheckpointState: (state: CheckpointState) => void;

  // 重置
  reset: () => void;
}

// ============================================================================
// Default State
// ============================================================================

const DEFAULT_GLOBAL_STYLES: GlobalStyles = {
  canvasWidth: 1280,
  canvasHeight: 720,
  backgroundColor: '#0F172A',
  cardBackground: '#1E293B',
  borderColor: '#334155',
  accentColor: '#D4AF37',
  accentColorSecondary: '#3B82F6',
  textPrimary: '#F8FAFC',
  textSecondary: '#CBD5E1',
  textMuted: '#94A3B8',
  fontFamily: "'Noto Sans SC', sans-serif",
  bottomSafeZone: 80,
};

const initialState: SlidesV3State = {
  session: null,
  sessionLoading: false,
  checkpoints: [],
  currentCheckpointId: null,
  checkpointsLoading: false,
  generating: false,
  progress: null,
  streamEvents: [],
  pages: [],
  selectedPageIndex: 0,
  taskDecomposition: null,
  outlinePlan: null,
  qualityReport: null,
  globalStyles: DEFAULT_GLOBAL_STYLES,
  error: null,
  leftPanelCollapsed: false,
  rightPanelCollapsed: false,
  previewMode: 'single',
};

// ============================================================================
// Store
// ============================================================================

export const useSlidesV3Store = create<SlidesV3State & SlidesV3Actions>()(
  devtools(
    persist(
      (set, get) => ({
        ...initialState,

        // 会话操作
        setSession: (session) => set({ session, error: null }),
        setSessionLoading: (sessionLoading) => set({ sessionLoading }),
        clearSession: () =>
          set({
            session: null,
            checkpoints: [],
            currentCheckpointId: null,
            pages: [],
            taskDecomposition: null,
            outlinePlan: null,
            qualityReport: null,
            streamEvents: [],
            progress: null,
            error: null,
          }),

        // 检查点操作
        setCheckpoints: (checkpoints) => set({ checkpoints }),
        addCheckpoint: (checkpoint) =>
          set((state) => ({
            checkpoints: [checkpoint, ...state.checkpoints],
          })),
        setCurrentCheckpointId: (currentCheckpointId) =>
          set({ currentCheckpointId }),
        setCheckpointsLoading: (checkpointsLoading) =>
          set({ checkpointsLoading }),

        // 生成操作
        setGenerating: (generating) => set({ generating }),
        setProgress: (progress) => set({ progress }),
        addStreamEvent: (event) =>
          set((state) => ({
            streamEvents: [...state.streamEvents, event],
          })),
        clearStreamEvents: () => set({ streamEvents: [] }),

        // 页面操作
        setPages: (pages) => set({ pages }),
        updatePage: (pageNumber, updates) =>
          set((state) => ({
            pages: state.pages.map((p) =>
              p.pageNumber === pageNumber ? { ...p, ...updates } : p
            ),
          })),
        setSelectedPageIndex: (selectedPageIndex) => set({ selectedPageIndex }),

        // 任务和大纲
        setTaskDecomposition: (taskDecomposition) => set({ taskDecomposition }),
        setOutlinePlan: (outlinePlan) => set({ outlinePlan }),

        // 质量报告
        setQualityReport: (qualityReport) => set({ qualityReport }),

        // 全局样式
        setGlobalStyles: (styles) =>
          set((state) => ({
            globalStyles: { ...state.globalStyles, ...styles },
          })),

        // 错误处理
        setError: (error) => set({ error }),

        // UI 状态
        toggleLeftPanel: () =>
          set((state) => ({
            leftPanelCollapsed: !state.leftPanelCollapsed,
          })),
        toggleRightPanel: () =>
          set((state) => ({
            rightPanelCollapsed: !state.rightPanelCollapsed,
          })),
        setPreviewMode: (previewMode) => set({ previewMode }),

        // 从检查点恢复状态
        restoreFromCheckpointState: (checkpointState) => {
          // 确保页面状态正确：如果有 HTML，则状态应该是 completed
          const restoredPages = (checkpointState.pages || []).map((page) => ({
            ...page,
            // 如果页面有 HTML，确保状态是 completed
            status: page.html
              ? ('completed' as const)
              : page.status || ('pending' as const),
          }));

          // 重建 streamEvents 用于显示生成过程
          const reconstructedEvents: StreamEvent[] = [];

          // 如果有任务分解信息，添加到 events
          if (checkpointState.taskDecomposition) {
            reconstructedEvents.push({
              type: 'phase_started',
              timestamp: new Date(),
              data: {
                phase: 'task_decomposition',
                message: `任务分解完成: ${checkpointState.taskDecomposition.totalPages} 页`,
              },
            });
            reconstructedEvents.push({
              type: 'phase_completed',
              timestamp: new Date(),
              data: {
                phase: 'task_decomposition',
              },
            });
          }

          // 如果有大纲信息，添加到 events
          if (checkpointState.outlinePlan) {
            reconstructedEvents.push({
              type: 'phase_started',
              timestamp: new Date(),
              data: {
                phase: 'outline_planning',
                message: `大纲规划完成: ${checkpointState.outlinePlan.title}`,
              },
            });
            reconstructedEvents.push({
              type: 'phase_completed',
              timestamp: new Date(),
              data: {
                phase: 'outline_planning',
              },
            });
          }

          // 为每个已完成的页面添加事件
          restoredPages.forEach((page) => {
            if (page.status === 'completed' && page.html) {
              reconstructedEvents.push({
                type: 'page_started',
                timestamp: new Date(),
                data: {
                  pageNumber: page.pageNumber,
                  outline: page.outline,
                },
              });
              reconstructedEvents.push({
                type: 'page_completed',
                timestamp: new Date(),
                data: {
                  pageNumber: page.pageNumber,
                  title: page.outline?.title || `第 ${page.pageNumber} 页`,
                },
              });
            }
          });

          set({
            taskDecomposition: checkpointState.taskDecomposition || null,
            outlinePlan: checkpointState.outlinePlan || null,
            pages: restoredPages,
            globalStyles: checkpointState.globalStyles || DEFAULT_GLOBAL_STYLES,
            error: null,
            // 重置生成状态
            generating: false,
            progress: null,
            // 恢复重建的事件（而不是清空）
            streamEvents: reconstructedEvents,
            selectedPageIndex: 0,
          });
        },

        // 重置
        reset: () => set(initialState),
      }),
      {
        name: 'slides-v3-storage',
        partialize: (state) => ({
          // 只持久化部分状态
          globalStyles: state.globalStyles,
          leftPanelCollapsed: state.leftPanelCollapsed,
          rightPanelCollapsed: state.rightPanelCollapsed,
          previewMode: state.previewMode,
        }),
      }
    ),
    { name: 'SlidesV3Store' }
  )
);

// ============================================================================
// Selectors
// ============================================================================

export const selectCurrentPage = (state: SlidesV3State): PageState | null => {
  const { pages, selectedPageIndex } = state;
  return pages[selectedPageIndex] || null;
};

export const selectCompletedPages = (state: SlidesV3State): PageState[] => {
  return state.pages.filter((p) => p.status === 'completed');
};

export const selectPendingPages = (state: SlidesV3State): PageState[] => {
  return state.pages.filter((p) => p.status === 'pending');
};

export const selectGeneratingPages = (state: SlidesV3State): PageState[] => {
  return state.pages.filter((p) => p.status === 'generating');
};

export const selectOverallProgress = (state: SlidesV3State): number => {
  const { pages } = state;
  if (pages.length === 0) return 0;
  const completed = pages.filter((p) => p.status === 'completed').length;
  return Math.round((completed / pages.length) * 100);
};

export const selectLatestCheckpoint = (
  state: SlidesV3State
): Checkpoint | null => {
  const { checkpoints } = state;
  return checkpoints.length > 0 ? checkpoints[0] : null;
};

// ============================================================================
// Utilities
// ============================================================================

/**
 * 根据阶段获取进度百分比权重
 */
export function getPhaseWeight(phase: GenerationProgress['phase']): {
  start: number;
  end: number;
} {
  switch (phase) {
    case 'task_decomposition':
      return { start: 0, end: 10 };
    case 'outline_planning':
      return { start: 10, end: 20 };
    case 'page_rendering':
      return { start: 20, end: 90 };
    case 'quality_review':
      return { start: 90, end: 100 };
    default:
      return { start: 0, end: 100 };
  }
}

/**
 * 计算总体进度
 */
export function calculateOverallProgress(
  phase: GenerationProgress['phase'],
  phaseProgress: number
): number {
  const { start, end } = getPhaseWeight(phase);
  return Math.round(start + (phaseProgress / 100) * (end - start));
}
