/**
 * AI Studio 组件导出
 */

// Command Palette
export { default as CommandPalette, useCommandPalette } from './CommandPalette';
export type { CommandItem } from './CommandPalette';

// Research Plan
export {
  default as ResearchPlan,
  createDefaultResearchPlan,
} from './ResearchPlan';
export type {
  ResearchPlanData,
  ResearchStep,
  StepStatus,
} from './ResearchPlan';

// Citation Preview
export {
  default as CitationList,
  CitationPreview,
  CitationMetricsBar,
  CitationBadge,
  InlineCitation,
} from './CitationPreview';
export type { Citation, CitationMetrics } from './CitationPreview';

// Trend Report
export { default as TrendReport } from './TrendReport';
export type { TechTrend, TrendReportData } from './TrendReport';

// Comparison Matrix
export { default as ComparisonMatrix } from './ComparisonMatrix';
export type { TechScore, TechComparisonData } from './ComparisonMatrix';

// Hype Cycle Chart
export { default as HypeCycleChart } from './HypeCycleChart';
export type { HypeCyclePosition } from './HypeCycleChart';

// Knowledge Graph
export { default as KnowledgeGraph } from './KnowledgeGraph';
export type { GraphNode, GraphEdge, GraphData } from './KnowledgeGraph';

// Output Viewer
export { OutputViewer } from './outputs/OutputViewer';

// File Uploader
export { FileUploader } from './FileUploader';
