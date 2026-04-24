/**
 * Topic Research Services
 *
 * 导出所有研究相关的服务（通过子目录 barrel re-export）
 */

// ==================== Baseline (Phase 0 recorder) ====================
export { BaselineRecorderService } from "./baseline";

// ==================== Core ====================
// Research
export {
  ResearchEventEmitterService,
  RESEARCH_INTERNAL_EVENTS,
  type ResumeMissionExecutionPayload,
} from "./research/event-emitter.service";
export { ResearchRealtimeAdapter } from "./research/realtime.adapter";
export { ResearchStrategyService } from "./research/strategy.service";
export { ResearchMemoryService } from "./research/memory.service";

// Leader

// Mission
export { MissionQueryService } from "./mission/query.service";
export { MissionLifecycleService } from "./mission/lifecycle.service";
export { MissionExecutionService } from "./mission/execution.service";
export { MissionCancellationService } from "./mission/cancellation.service";
export { MissionObservabilityService } from "./mission/observability.service";
export { MissionNotificationService } from "./mission/notification.service";

// Topic
export { TopicCrudService } from "./topic/topic-crud.service";
export { EventSourceParsingService } from "./topic/event-source-parsing.service";
export { TopicDimensionService } from "./topic/topic-dimension.service";
export { TopicExportService } from "./topic/topic-export.service";
export { TopicScheduleService } from "./topic/topic-schedule.service";

// ==================== Dimension ====================

// ==================== Report ====================
export { ReportSynthesisService } from "./report/synthesis.service";
export { ReportEditorService } from "./report/editor.service";
export { ReportValidationService } from "./report/validation.service";
export { ReportChangeService } from "./report/change.service";
export { ReportAnnotationService } from "./report/annotation.service";
export { CredibilityReportService } from "./report/credibility-report.service";
export { FigureExtractorService } from "./report/figure-extractor.service";
export { FigureRelevanceService } from "./report/figure-relevance.service";
export { ReportGeneratorService } from "./report/generator.service";
export { ReportAssemblerService } from "./report/assembler.service";
export { ReportDataService } from "./report/data.service";
export { LatexRepairService } from "./report/latex-repair.service";
export { CitationFormatterService } from "./report/citation-formatter.service";
export { ResearchExportService } from "./report/research-export.service";

// ==================== Cross-module Data Export ====================
export { TopicInsightsDataExportService } from "./topic-insights-data-export.service";

// ==================== Compute Usage ====================
export {
  ComputeUsageService,
  type ComputeUsageResult,
} from "./compute-usage/compute-usage.service";

// ==================== Report Content Editing (god service split) ====================
export {
  ReportContentEditingService,
  type AiEditReportDto,
  type UpdateReportContentDto,
} from "./report/content-editing.service";

// ==================== Data ====================
export { DataSourceRouterService } from "./data/data-source-router.service";
export { DataSourcePlannerService } from "./data/data-source-planner.service";
export { EvidenceManagementService } from "./data/evidence-management.service";
export { DataSourceFetcherService } from "./data/data-source-fetcher.service";
export { DataSourceStrategyService } from "./data/data-source-strategy.service";
export { DataSourceConnectorRegistry } from "./data/connectors/data-source-connector.registry";
export { SemanticScholarConnector } from "./data/connectors/semantic-scholar.connector";
export { PubMedConnector } from "./data/connectors/pubmed.connector";
export { FinanceApiConnector } from "./data/connectors/finance-api.connector";
export { WeatherApiConnector } from "./data/connectors/weather-api.connector";
export { RAGFusionService } from "./search/rag-fusion.service";
export { KnowledgeGraphService } from "./data/knowledge-graph.service";
export { MultiLanguageResearchService } from "./data/multi-language-research.service";

// ==================== Collaboration ====================
export { TopicCollaboratorService } from "./collaboration/topic-collaborator.service";
export { ReviewWorkflowService } from "./collaboration/review-workflow.service";
export { ResearchTodoService } from "./collaboration/research-todo.service";

// ==================== Quality ====================
export { CritiqueRefineService } from "./quality/critique-refine.service";
export { ReportQualityGateService } from "./quality/report-quality-gate.service";
export { ReportQualityTraceService } from "./quality/report-quality-trace.service";
export { ReportEvaluationService } from "./quality/report-evaluation.service";
export { SectionSelfEvalService } from "./quality/section-self-eval.service";
export { SectionRemediationService } from "./quality/section-remediation.service";

// ==================== Monitoring ====================
export { AgentActivityService } from "./health/agent-activity.service";
export { ResearchMissionHealthService } from "./health/mission.service";
export { ResearchCheckpointService } from "./health/research-checkpoint.service";
export { TopicRefreshScheduler } from "./health/topic-refresh.scheduler";

// ==================== Search Pipeline ====================
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
} from "./search";
