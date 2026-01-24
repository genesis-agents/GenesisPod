/**
 * AI Research Components
 *
 * 统一的研究模块组件导出
 * - Topic Research: 专题研究
 * - Deep Research: 深度研究 (NotebookLM 风格)
 */

// ==================== Topic Research ====================

// Topic Components
export {
  TopicCard,
  TopicCollaborationPanel,
  TopicContentPanel,
  TopicCredibilityPanel,
  TopicDetail,
  TopicHistoryPanel,
  TopicReferencesPanel,
  TopicReportView,
  TopicResearchLayout,
  TopicResearchTab,
  TopicTeamPanel,
} from './topics';

// Research Control Components
export {
  ResearchCommandInput,
  ResearchProgressBar,
  ResearchProgressSummary,
  ResearchSettingsModal,
  ResearchTeamPanel,
  ResearchTodoList,
  QuickCommandBar,
} from './research-control';

// Report Components
export {
  ReportEditor,
  ReportEditPanel,
  ReportOutlineNav,
  ReportRevisionHistory,
  ReportTemplateDialog,
  ReportWorkspace,
  ChapterizedReportView,
  ChangeReviewPanel,
  ChangeSummaryPanel,
} from './reports';

// Panel Components
export {
  CredibilityPanel,
  ReferencePanel,
  TextSelectionContextMenu,
  TodoDetailPanel,
} from './panels';

// Dialog Components
export {
  CreateTopicDialog,
  TopicSharingModal,
} from './dialogs';

// Collaboration Components
export { ResearchCollaborationPanel } from './collaboration/ResearchCollaborationPanel';
export { AgentThinkingGraph } from './collaboration/AgentThinkingGraph';

// Annotation Components
export { ReportAnnotations } from './annotations/ReportAnnotations';

// AI Edit Components
export * from './ai-edit';

// Topic Content Components
export * from './topic-content';

// ==================== Deep Research ====================

// Re-export all deep-research components
export * from './deep-research';
