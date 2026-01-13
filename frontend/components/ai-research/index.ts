/**
 * AI Research Components
 *
 * 统一的研究模块组件导出
 * - Topic Research: 专题研究
 * - Deep Research: 深度研究 (NotebookLM 风格)
 */

// ==================== Topic Research ====================

// Core Components
export { TopicCard } from './TopicCard';
export { CreateTopicDialog } from './CreateTopicDialog';
export { TopicDetail } from './TopicDetail';
export { TopicResearchTab } from './TopicResearchTab';

// Layout Components
export { TopicResearchLayout } from './TopicResearchLayout';
export { TopicTeamPanel } from './TopicTeamPanel';
export { TopicContentPanel } from './TopicContentPanel';
export { ResearchTeamPanel } from './ResearchTeamPanel';
export { ResearchProgressBar } from './ResearchProgressBar';
export { ResearchCommandInput } from './ResearchCommandInput';

// Report Components
export { ReportEditor } from './ReportEditor';
export { ReportOutlineNav } from './ReportOutlineNav';

// Team & Reference Components
export { AgentThinkingGraph } from './AgentThinkingGraph';
export { ReferencePanel } from './ReferencePanel';

// Advanced Components
export { ReportRevisionHistory } from './ReportRevisionHistory';
export { ReportAnnotations } from './ReportAnnotations';

// Sharing Components
export { TopicSharingModal } from './TopicSharingModal';

// ==================== Deep Research ====================

// Re-export all deep-research components
export * from './deep-research';
