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
export { ResearchLeaderService } from "./research-leader.service";
export { ResearchMissionService } from "./research-mission.service";
export { TopicCollaboratorService } from "./topic-collaborator.service";
export { ResearchEventEmitterService } from "./research-event-emitter.service";
export { DimensionMissionService } from "./dimension-mission.service";
export { SectionWriterService } from "./section-writer.service";
export { ReportChangeService } from "./report-change.service";
export { ReportAnnotationService } from "./report-annotation.service";
export { AgentActivityService } from "./agent-activity.service";
export { ResearchStrategyService } from "./research-strategy.service";
export { CredibilityReportService } from "./credibility-report.service";
export { ReviewWorkflowService } from "./review-workflow.service";
export { ResearchTodoService } from "./research-todo.service";
export { ResearchMissionHealthService } from "./research-mission-health.service";
export { ResearchCheckpointService } from "./research-checkpoint.service";
export { DataEnrichmentService } from "./data-enrichment.service";
export { LeaderToolService } from "./leader-tool.service";
export { ResearchReflectionService } from "./research-reflection.service";

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
export {
  ResearchStrategyType,
  DimensionFreshnessLevel,
  type DimensionFreshnessInfo,
  type ResearchStrategyRecommendation,
} from "./research-strategy.service";
export type {
  SearchResultsRecord,
  WritingProgressRecord,
  DimensionActivities,
  AgentActivityWithTiming,
} from "./agent-activity.service";
export type {
  SourceBreakdown,
  TimeBreakdown,
  DimensionCoverageDetail,
  AIQualityMetrics,
  CredibilityReportData,
} from "./credibility-report.service";
export type {
  CreateReviewTaskInput,
  AssignTaskInput,
  CompleteTaskInput,
  ReviewTaskStats,
} from "./review-workflow.service";
export {
  TodoEventType,
  type CreateTodoInput,
  type UpdateTodoProgressInput,
  type TodoFilter,
  type TodoSummary,
  type TodoResult,
} from "./research-todo.service";
export type {
  HealthCheckResult,
  MissionHealthDetail,
  MissionHealthStatus,
} from "./research-mission-health.service";
export type {
  ResearchCheckpoint,
  ResumableMissionInfo,
} from "./research-checkpoint.service";
export type {
  DataEnrichmentOptions,
  UrlValidationResult,
} from "./data-enrichment.service";
export type {
  LeaderSearchContext,
  LeaderSearchResult,
  EnhancedPlanningContext,
} from "./leader-tool.service";
export type { TemporalContext } from "./section-writer.service";
export type {
  ReflectionResult,
  ReflectionContext,
} from "./research-reflection.service";
