/**
 * Compat barrel — re-exports services from their new agent-centric locations.
 *
 * The directory restructure moved services into:
 *   - mission/  (pipeline + control + observation)
 *   - agents/   (specs, capability, activity)
 *   - knowledge/ (sources, search, evidence, graph, multi-language, export)
 *   - memory/   (events, store, mission-health, refresh.scheduler)
 *   - artifacts/ (topic, report/{core,enhancement,editing,quality}, strategy, collaboration)
 *   - shared/   (types, utils, telemetry, baseline, compute-usage)
 *
 * Callers should migrate to direct imports over time. This barrel stays as
 * a compat layer during the transition.
 */

// ==================== Baseline ====================
export { BaselineRecorderService } from "./shared/baseline";

// ==================== Memory (events / store) ====================
export {
  ResearchEventEmitterService,
  RESEARCH_INTERNAL_EVENTS,
  type ResumeMissionExecutionPayload,
} from "./memory/events/event-emitter.service";
export { ResearchRealtimeAdapter } from "./memory/events/realtime.adapter";
export { ResearchMemoryService } from "./memory/store/memory.service";

// ==================== Strategy ====================
export { ResearchStrategyService } from "./artifacts/strategy/strategy.service";

// ==================== Mission ====================
export { MissionQueryService } from "./mission/observation/query.service";
export { MissionLifecycleService } from "./mission/control/lifecycle.service";
export { MissionExecutionService } from "./mission/control/execution.service";
export { MissionCancellationService } from "./mission/control/cancellation.service";
export { MissionObservabilityService } from "./mission/observation/observability.service";
export { MissionNotificationService } from "./mission/observation/notification.service";
export { ResearchCheckpointService } from "./mission/control/checkpoint.service";

// ==================== Topic artifacts ====================
export { TopicCrudService } from "./artifacts/topic/crud.service";
export { EventSourceParsingService } from "./artifacts/topic/event-source-parsing.service";
export { TopicDimensionService } from "./artifacts/topic/dimension.service";
export { TopicExportService } from "./artifacts/topic/export.service";
export { TopicScheduleService } from "./artifacts/topic/schedule.service";

// ==================== Report artifacts ====================
export { ReportSynthesisService } from "./artifacts/report/core/synthesis.service";
export { ReportEditorService } from "./artifacts/report/core/editor.service";
export { ReportValidationService } from "./artifacts/report/core/validation.service";
export { ReportGeneratorService } from "./artifacts/report/core/generator.service";
export { ReportAssemblerService } from "./artifacts/report/core/assembler.service";
export { ReportDataService } from "./artifacts/report/core/data.service";
export { LatexRepairService } from "./artifacts/report/enhancement/latex-repair.service";
export { CitationFormatterService } from "./artifacts/report/enhancement/citation-formatter.service";
export { FigureExtractorService } from "./artifacts/report/enhancement/figure-extractor.service";
export { FigureRelevanceService } from "./artifacts/report/enhancement/figure-relevance.service";
export { ResearchExportService } from "./artifacts/report/enhancement/research-export.service";
export { CredibilityReportService } from "./artifacts/report/enhancement/credibility-report.service";
export { ReportChangeService } from "./artifacts/report/editing/change.service";
export { ReportAnnotationService } from "./artifacts/report/editing/annotation.service";
export {
  ReportContentEditingService,
  type AiEditReportDto,
  type UpdateReportContentDto,
} from "./artifacts/report/editing/content-editing.service";

// ==================== Report quality ====================
export { CritiqueRefineService } from "./artifacts/report/quality/critique-refine.service";
export { ReportQualityGateService } from "./artifacts/report/quality/report-quality-gate.service";
export { ReportQualityTraceService } from "./artifacts/report/quality/report-quality-trace.service";
export { ReportEvaluationService } from "./artifacts/report/quality/report-evaluation.service";
export { SectionSelfEvalService } from "./artifacts/report/quality/section-self-eval.service";
export { SectionRemediationService } from "./artifacts/report/quality/section-remediation.service";

// ==================== Collaboration ====================
export { TopicCollaboratorService } from "./artifacts/collaboration/topic-collaborator.service";
export { ReviewWorkflowService } from "./artifacts/collaboration/review-workflow.service";
export { ResearchTodoService } from "./artifacts/collaboration/research-todo.service";

// ==================== Knowledge ====================
export { DataSourceRouterService } from "./knowledge/sources/router.service";
export { DataSourcePlannerService } from "./knowledge/sources/planner.service";
export { DataSourceFetcherService } from "./knowledge/sources/fetcher.service";
export { DataSourceStrategyService } from "./knowledge/sources/strategy.service";
export { DataSourceConnectorRegistry } from "./knowledge/sources/connectors/connector.registry";
export { SemanticScholarConnector } from "./knowledge/sources/connectors/semantic-scholar.connector";
export { PubMedConnector } from "./knowledge/sources/connectors/pubmed.connector";
export { FinanceApiConnector } from "./knowledge/sources/connectors/finance-api.connector";
export { WeatherApiConnector } from "./knowledge/sources/connectors/weather-api.connector";
export { EvidenceManagementService } from "./knowledge/evidence.service";
export { KnowledgeGraphService } from "./knowledge/graph.service";
export { MultiLanguageResearchService } from "./knowledge/multi-language.service";
export { TopicInsightsDataExportService } from "./knowledge/export.service";
export { RAGFusionService } from "./knowledge/search/rag-fusion.service";

// ==================== Search ====================
export {
  SearchOrchestratorService,
  GlobalSourceThrottleService,
  SearchExecutorService,
  QueryStrategyService,
  ResultFusionService,
  QualityGateService,
  LlmRerankerAdapter,
  WebSearchAdapter,
  AcademicSearchAdapter,
  GithubSearchAdapter,
  HackernewsSearchAdapter,
  SocialSearchAdapter,
  PolicySearchAdapter,
  FinanceSearchAdapter,
  WeatherSearchAdapter,
  LocalSearchAdapter,
  IndustryReportSearchAdapter,
} from "./knowledge/search";

// ==================== Agents ====================
export { AgentActivityService } from "./agents/activity.service";

// ==================== Memory (health + scheduler) ====================
export { ResearchMissionHealthService } from "./memory/mission-health.service";
export { TopicRefreshScheduler } from "./memory/refresh.scheduler";

// ==================== Compute Usage ====================
export {
  ComputeUsageService,
  type ComputeUsageResult,
} from "./shared/compute-usage/compute-usage.service";
