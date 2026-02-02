/**
 * Topic Research Services
 *
 * 导出所有研究相关的服务（通过子目录 barrel re-export）
 */

// ==================== Core ====================
export { ResearchLeaderService } from "./core/research-leader.service";
export { ResearchMissionService } from "./core/research-mission.service";
export { MissionQueryService } from "./core/mission-query.service";
export { MissionLifecycleService } from "./core/mission-lifecycle.service";
export { MissionExecutionService } from "./core/mission-execution.service";
export { TopicTeamOrchestratorService } from "./core/topic-team-orchestrator.service";
export {
  ResearchEventEmitterService,
  RESEARCH_INTERNAL_EVENTS,
  type ResumeMissionExecutionPayload,
} from "./core/research-event-emitter.service";
export { ResearchStrategyService } from "./core/research-strategy.service";

// ★ Leader sub-services
export { LeaderPlanningService } from "./core/leader-planning.service";
export { LeaderReviewService } from "./core/leader-review.service";
export { LeaderChatService } from "./core/leader-chat.service";

// ★ Facade sub-services
export { TopicCrudService } from "./core/topic-crud.service";
export { TopicDimensionService } from "./core/topic-dimension.service";
export { TopicExportService } from "./core/topic-export.service";
export { TopicScheduleService } from "./core/topic-schedule.service";

// ==================== Dimension ====================
export { DimensionMissionService } from "./dimension/dimension-mission.service";
export { DimensionResearchService } from "./dimension/dimension-research.service";
export { SectionWriterService } from "./dimension/section-writer.service";
export { DimensionSearchService } from "./dimension/dimension-search.service";
export { DimensionWritingService } from "./dimension/dimension-writing.service";

// ==================== Report ====================
export { ReportSynthesisService } from "./report/report-synthesis.service";
export { ReportEditorService } from "./report/report-editor.service";
export { ReportValidationService } from "./report/report-validation.service";
export { ReportChangeService } from "./report/report-change.service";
export { ReportAnnotationService } from "./report/report-annotation.service";
export { CredibilityReportService } from "./report/credibility-report.service";
export { FigureExtractorService } from "./report/figure-extractor.service";
// ★ Report sub-services
export { ReportGeneratorService } from "./report/report-generator.service";
export { ReportDataService } from "./report/report-data.service";

// ==================== Data ====================
export { DataSourceRouterService } from "./data/data-source-router.service";
export { DataSourcePlannerService } from "./data/data-source-planner.service";
export { DataEnrichmentService } from "./data/data-enrichment.service";
export { EvidenceManagementService } from "./data/evidence-management.service";
export { LeaderToolService } from "./data/leader-tool.service";
export { DataSourceFetcherService } from "./data/data-source-fetcher.service";
export { DataSourceStrategyService } from "./data/data-source-strategy.service";

// ==================== Collaboration ====================
export { TopicCollaboratorService } from "./collaboration/topic-collaborator.service";
export { ReviewWorkflowService } from "./collaboration/review-workflow.service";
export { ResearchTodoService } from "./collaboration/research-todo.service";
export { ResearchReviewerService } from "./collaboration/research-reviewer.service";
export { ResearchReflectionService } from "./collaboration/research-reflection.service";

// ==================== Monitoring ====================
export { AgentActivityService } from "./monitoring/agent-activity.service";
export { ResearchMissionHealthService } from "./monitoring/research-mission-health.service";
export { ResearchCheckpointService } from "./monitoring/research-checkpoint.service";
export { TopicRefreshScheduler } from "./monitoring/topic-refresh.scheduler";
