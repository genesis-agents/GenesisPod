/**
 * Topic Research Services
 *
 * 导出所有研究相关的服务（通过子目录 barrel re-export）
 */

// ==================== Core ====================
export { ResearchLeaderService } from "./core/research-leader.service";
export { MissionQueryService } from "./core/mission-query.service";
export { MissionLifecycleService } from "./core/mission-lifecycle.service";
export { MissionExecutionService } from "./core/mission-execution.service";
export { TopicTeamOrchestratorService } from "./core/topic-team-orchestrator.service";
export {
  ResearchEventEmitterService,
  RESEARCH_INTERNAL_EVENTS,
  type ResumeMissionExecutionPayload,
} from "./core/research-event-emitter.service";
export { ResearchRealtimeAdapter } from "./core/research-realtime.adapter";
export { ResearchStrategyService } from "./core/research-strategy.service";
export { ResearchMemoryService } from "./core/research-memory.service";
// ★ P1: 研究模板
export { ResearchTemplateService } from "./core/research-template.service";

// ★ Mission sub-services (God Service decomposition)
export { MissionObservabilityService } from "./core/mission-observability.service";
export { MissionKernelBridgeService } from "./core/mission-kernel-bridge.service";
export { MissionNotificationService } from "./core/mission-notification.service";

// ★ Facade sub-services
export { TopicCrudService } from "./core/topic-crud.service";
export { TopicDimensionService } from "./core/topic-dimension.service";
export { TopicExportService } from "./core/topic-export.service";
export { TopicScheduleService } from "./core/topic-schedule.service";

// ==================== Dimension ====================
export { DimensionMissionService } from "./dimension/dimension-mission.service";
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
export { FigureRelevanceService } from "./report/figure-relevance.service";
// ★ Report sub-services
export { ReportGeneratorService } from "./report/report-generator.service";
export { ReportAssemblerService } from "./report/report-assembler.service";
export { ReportDataService } from "./report/report-data.service";
// ★ P1: 引用格式化 + 多格式导出
export { CitationFormatterService } from "./report/citation-formatter.service";
export { ResearchExportService } from "./report/research-export.service";

// ==================== Data ====================
export { DataSourceRouterService } from "./data/data-source-router.service";
export { DataSourcePlannerService } from "./data/data-source-planner.service";
export { DataEnrichmentService } from "./data/data-enrichment.service";
export { EvidenceManagementService } from "./data/evidence-management.service";
export { LeaderToolService } from "./data/leader-tool.service";
export { DataSourceFetcherService } from "./data/data-source-fetcher.service";
export { DataSourceStrategyService } from "./data/data-source-strategy.service";
export { EvidenceSyncCompensationService } from "./data/evidence-sync-compensation.service";
// ★ P0: 新增数据服务
export { DataSourceConnectorRegistry } from "./data/connectors/data-source-connector.registry";
export { SemanticScholarConnector } from "./data/connectors/semantic-scholar.connector";
export { PubMedConnector } from "./data/connectors/pubmed.connector";
export { FinanceApiConnector } from "./data/connectors/finance-api.connector";
export { WeatherApiConnector } from "./data/connectors/weather-api.connector";
export { RAGFusionService } from "./data/rag-fusion.service";
export { KnowledgeGraphService } from "./data/knowledge-graph.service";
export { MultiLanguageResearchService } from "./data/multi-language-research.service";

// ==================== Collaboration ====================
export { TopicCollaboratorService } from "./collaboration/topic-collaborator.service";
export { ReviewWorkflowService } from "./collaboration/review-workflow.service";
export { ResearchTodoService } from "./collaboration/research-todo.service";
export { ResearchReviewerService } from "./collaboration/research-reviewer.service";
export { ResearchReflectionService } from "./collaboration/research-reflection.service";

// ==================== Quality ====================
export { CritiqueRefineService } from "./quality/critique-refine.service";
export { ReportQualityGateService } from "./quality/report-quality-gate.service";
export { ReportQualityTraceService } from "./quality/report-quality-trace.service";

// ==================== Monitoring ====================
export { AgentActivityService } from "./monitoring/agent-activity.service";
export { ResearchMissionHealthService } from "./monitoring/research-mission-health.service";
export { ResearchCheckpointService } from "./monitoring/research-checkpoint.service";
export { TopicRefreshScheduler } from "./monitoring/topic-refresh.scheduler";

// ==================== Search Pipeline ====================
export {
  SearchOrchestratorService,
  GlobalSourceThrottleService,
  SearchExecutorService,
  QueryStrategyService,
  ResultFusionService,
  QualityGateService,
  WebSearchAdapter,
  AcademicSearchAdapter,
  GithubSearchAdapter,
  HackernewsSearchAdapter,
  SocialSearchAdapter,
  PolicySearchAdapter,
  FinanceSearchAdapter,
  WeatherSearchAdapter,
  LocalSearchAdapter,
} from "./search";
