/**
 * Topic Research Services
 *
 * 导出所有研究相关的服务
 */

export { DataSourceRouterService } from "./data-source-router.service";
export { DimensionResearchService } from "./dimension-research.service";
export { ReportSynthesisService } from "./report-synthesis.service";
export { TopicTeamOrchestratorService } from "./topic-team-orchestrator.service";
export { TopicRefreshScheduler } from "./topic-refresh.scheduler";
export { EvidenceManagementService } from "./evidence-management.service";
export { ResearchReviewerService } from "./research-reviewer.service";

// Re-export types
export type {
  RefreshProgressEvent,
  RefreshOptions,
} from "./topic-team-orchestrator.service";
export type { EvidenceQueryOptions } from "./evidence-management.service";
export type { DimensionResearchResult } from "./dimension-research.service";
export {
  ReviewQualityLevel,
  type DimensionReviewResult,
  type OverallReviewResult,
  type ReviewIssue,
} from "./research-reviewer.service";
