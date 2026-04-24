import { Module, OnModuleInit, Logger } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { PrismaModule } from "@/common/prisma/prisma.module";
import { NotificationModule } from "@/modules/ai-infra/notifications/notification.module";
// Import directly from source to avoid circular dependency via barrel export
import { AiEngineModule } from "@/modules/ai-engine/ai-engine.module";
import {
  PromptSkillBridge,
  AgentRegistry,
  TeamRegistry,
} from "@/modules/ai-engine/facade";
import {
  AgentFactory as HarnessAgentFactory,
  SpecAgentRegistry,
} from "@/modules/ai-engine/harness";
import { TOPIC_INSIGHTS_AGENT_SPECS } from "./agents/specs";
import { DimensionTemplatesRepository } from "./artifacts/topic/templates";
import { FrameworkSkillPolicyRepository } from "./skills/frameworks";
import { LeaderChatService } from "./artifacts/collaboration/leader-chat.service";
import { MissionAmendmentService } from "./mission/control/amendment.service";
import {
  UrlValidationService,
  ContentEnrichmentService,
  EvidenceEvaluationService,
  ResultFilterService,
} from "./knowledge/search/fusion";
import { EvidenceSyncCompensationService } from "./knowledge/evidence-sync/compensation.service";
import { CreditsModule } from "@/modules/ai-infra/credits/credits.module";
import { SecretsModule } from "@/modules/ai-infra/secrets/secrets.module";
import { StorageModule } from "@/modules/ai-infra/storage/storage.module";
import { ExportModule } from "@/common/export/export.module";
import { TOPIC_INSIGHTS_DATA_EXPORT } from "../shared/interfaces/data-export.interface";
import { TopicInsightsAgent } from "./intent";
import { TOPIC_INSIGHTS_TEAM_CONFIG } from "./intent";
// ★ Tier Core: Harness pipeline module (flag-gated via TOPIC_INSIGHTS_USE_HARNESS)
import { PipelineModule } from "./mission/pipeline/pipeline.module";
// TODO: 后续添加 CrawlersModule 以支持更多数据源
// import { CrawlersModule } from '../../ingestion/crawlers/crawlers.module';
// Note: EventEmitterModule is globally configured in AppModule
import {
  TopicController,
  MissionController,
  ReportController,
  CollaborationController,
  TodoController,
  ReportReviewController,
  LatencyController,
} from "./api/controllers";
import { TopicInsightsService } from "./topic-insights.service";
import { TopicInsightsGateway } from "./api/gateways/realtime.gateway";
// ★ Direct imports per agent-centric domain (services.ts barrel 已删除)
import { BaselineRecorderService } from "./shared/baseline";
import { ResearchEventEmitterService } from "./mission/realtime/event-emitter.service";
import { ResearchRealtimeAdapter } from "./mission/realtime/realtime.adapter";
import { ResearchMemoryService } from "./mission/state/memory.service";
import { ResearchStrategyService } from "./artifacts/strategy/strategy.service";
import { MissionQueryService } from "./mission/observation/query.service";
import { MissionLifecycleService } from "./mission/control/lifecycle.service";
import { MissionExecutionService } from "./mission/control/execution.service";
import { MissionCancellationService } from "./mission/control/cancellation.service";
import { MissionObservabilityService } from "./mission/observation/observability.service";
import { MissionNotificationService } from "./mission/observation/notification.service";
import { ResearchCheckpointService } from "./mission/control/checkpoint.service";
import { ResearchMissionHealthService } from "./mission/observation/mission-health.service";
import { TopicRefreshScheduler } from "./mission/control/refresh.scheduler";
import { TopicCrudService } from "./artifacts/topic/crud.service";
import { EventSourceParsingService } from "./artifacts/topic/event-source-parsing.service";
import { TopicDimensionService } from "./artifacts/topic/dimension.service";
import { TopicExportService } from "./artifacts/topic/export.service";
import { TopicScheduleService } from "./artifacts/topic/schedule.service";
import { ReportSynthesisService } from "./artifacts/report/core/synthesis.service";
import { ReportEditorService } from "./artifacts/report/core/editor.service";
import { ReportValidationService } from "./artifacts/report/core/validation.service";
import { ReportGeneratorService } from "./artifacts/report/core/generator.service";
import { ReportAssemblerService } from "./artifacts/report/core/assembler.service";
import { ReportDataService } from "./artifacts/report/core/data.service";
import { LatexRepairService } from "./artifacts/report/enhancement/latex-repair.service";
import { CitationFormatterService } from "./artifacts/report/enhancement/citation-formatter.service";
import { FigureExtractorService } from "./artifacts/report/enhancement/figure-extractor.service";
import { FigureRelevanceService } from "./artifacts/report/enhancement/figure-relevance.service";
import { ResearchExportService } from "./artifacts/report/enhancement/research-export.service";
import { CredibilityReportService } from "./artifacts/report/enhancement/credibility-report.service";
import { ReportChangeService } from "./artifacts/report/editing/change.service";
import { ReportAnnotationService } from "./artifacts/report/editing/annotation.service";
import { ReportContentEditingService } from "./artifacts/report/editing/content-editing.service";
import { CritiqueRefineService } from "./artifacts/report/quality/critique-refine.service";
import { ReportQualityGateService } from "./artifacts/report/quality/report-quality-gate.service";
import { ReportQualityTraceService } from "./artifacts/report/quality/report-quality-trace.service";
import { ReportEvaluationService } from "./artifacts/report/quality/report-evaluation.service";
import { SectionSelfEvalService } from "./artifacts/report/quality/section-self-eval.service";
import { SectionRemediationService } from "./artifacts/report/quality/section-remediation.service";
import { TopicCollaboratorService } from "./artifacts/collaboration/topic-collaborator.service";
import { ReviewWorkflowService } from "./artifacts/collaboration/review-workflow.service";
import { ResearchTodoService } from "./artifacts/collaboration/research-todo.service";
import { DataSourceRouterService } from "./knowledge/sources/router.service";
import { DataSourcePlannerService } from "./knowledge/sources/planner.service";
import { DataSourceFetcherService } from "./knowledge/sources/fetcher.service";
import { DataSourceStrategyService } from "./knowledge/sources/strategy.service";
import { DataSourceConnectorRegistry } from "./knowledge/sources/connectors/connector.registry";
import { SemanticScholarConnector } from "./knowledge/sources/connectors/semantic-scholar.connector";
import { PubMedConnector } from "./knowledge/sources/connectors/pubmed.connector";
import { FinanceApiConnector } from "./knowledge/sources/connectors/finance-api.connector";
import { WeatherApiConnector } from "./knowledge/sources/connectors/weather-api.connector";
import { EvidenceManagementService } from "./knowledge/evidence.service";
import { KnowledgeGraphService } from "./knowledge/graph.service";
import { MultiLanguageResearchService } from "./knowledge/multi-language.service";
import { TopicInsightsDataExportService } from "./knowledge/export.service";
import { RAGFusionService } from "./knowledge/search/rag-fusion.service";
import {
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
import { AgentActivityService } from "./agents/activity.service";
import { ComputeUsageService } from "./shared/compute-usage/compute-usage.service";
// ★ F1 · Foundation: dimension template data layer for /topics/templates
// and /topics/from-template endpoints. Lives under artifacts/topic/templates/.
import { TopicAccessGuard } from "./api/guards";

const services = [
  TopicInsightsService,
  DataSourceRouterService,
  ReportSynthesisService,
  TopicRefreshScheduler,
  EvidenceManagementService,
  MissionQueryService,
  MissionLifecycleService,
  MissionExecutionService,
  MissionCancellationService,
  // ★ Mission sub-services (God Service decomposition)
  MissionObservabilityService,
  MissionNotificationService,
  TopicCollaboratorService,
  ResearchEventEmitterService,
  ReportChangeService,
  ReportAnnotationService,
  ResearchStrategyService,
  AgentActivityService,
  CredibilityReportService,
  ReviewWorkflowService,
  ResearchTodoService,
  ResearchMissionHealthService,
  ResearchCheckpointService,
  DataSourcePlannerService,
  FigureExtractorService,
  FigureRelevanceService,
  ReportValidationService,
  ReportEditorService,
  // ★ Facade sub-services
  TopicCrudService,
  EventSourceParsingService,
  TopicDimensionService,
  TopicExportService,
  TopicScheduleService,
  // ★ Data sub-services
  DataSourceFetcherService,
  DataSourceStrategyService,
  RAGFusionService,
  // ★ Dimension sub-services
  // ★ Report sub-services
  ReportGeneratorService,
  ReportAssemblerService,
  ReportDataService,
  LatexRepairService,
  // ★ Cross-module data export (Slides/Office consumer)
  TopicInsightsDataExportService,
  // ★ God service decomposition: compute usage
  ComputeUsageService,
  // ★ God service decomposition: report editing
  ReportContentEditingService,
  // ★ Engine Adapters (P2 能力下沉集成)
  ResearchRealtimeAdapter,
  // ★ Memory
  ResearchMemoryService,
  // ★ P0: 新增核心能力
  DataSourceConnectorRegistry,
  SemanticScholarConnector,
  PubMedConnector,
  FinanceApiConnector,
  WeatherApiConnector,
  KnowledgeGraphService,
  MultiLanguageResearchService,
  // ★ P1: 新增增强能力
  CritiqueRefineService,
  // ★ v4: 代码强制质量门控
  ReportQualityGateService,
  // ★ v5: 全链路质量追踪
  ReportQualityTraceService,
  // ★ 10 维报告质量评审
  ReportEvaluationService,
  // ★ 写中自评 + 补救
  SectionSelfEvalService,
  SectionRemediationService,
  CitationFormatterService,
  ResearchExportService,
  // ★ Search Pipeline (modular search architecture)
  GlobalSourceThrottleService,
  QueryStrategyService,
  SearchExecutorService,
  ResultFusionService,
  QualityGateService,
  SearchOrchestratorService,
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
  // ★ Phase 0: BaselineRecorder (flag-gated via TOPIC_INSIGHTS_RECORD_BASELINE)
  BaselineRecorderService,
  // ★ F1 · dimension template data layer
  DimensionTemplatesRepository,
  // ★ F1 · framework-skill policy (topicType + eventSubtype → skill ids)
  FrameworkSkillPolicyRepository,
  // ★ F2 · Leader chat orchestration (AG-18-LI intent decoder)
  LeaderChatService,
  // ★ F3 · Pause-Amend-Resume primitive for /mission/adjust
  MissionAmendmentService,
  // ★ F5 · Search quality + evidence sync
  UrlValidationService,
  ContentEnrichmentService,
  EvidenceEvaluationService,
  ResultFilterService,
  EvidenceSyncCompensationService,
  // ★ Gap 1: Agent 注册
  TopicInsightsAgent,
];

@Module({
  imports: [
    PrismaModule,
    NotificationModule,
    AiEngineModule,
    CreditsModule,
    ExportModule,
    ConfigModule,
    SecretsModule,
    StorageModule, // ★ Phase 6: R2 报告云存储
    PipelineModule, // ★ target architecture v2: 15 stages + rollout + dispatcher
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>("JWT_SECRET"),
        signOptions: { expiresIn: "7d" },
      }),
      inject: [ConfigService],
    }),
    // EventEmitterModule is globally configured in AppModule
  ],
  controllers: [
    TopicController,
    MissionController,
    ReportController,
    CollaborationController,
    TodoController,
    ReportReviewController,
    LatencyController,
  ],
  providers: [
    ...services,
    TopicInsightsGateway,
    TopicAccessGuard,
    // Cross-module contract: Office/Slides consume this token.
    {
      provide: TOPIC_INSIGHTS_DATA_EXPORT,
      useExisting: TopicInsightsDataExportService,
    },
  ],
  exports: [
    TopicInsightsService,
    TopicAccessGuard,
    TopicInsightsDataExportService,
    TOPIC_INSIGHTS_DATA_EXPORT,
  ],
})
export class TopicInsightsModule implements OnModuleInit {
  private readonly logger = new Logger(TopicInsightsModule.name);

  constructor(
    private readonly promptSkillBridge: PromptSkillBridge,
    private readonly connectorRegistry: DataSourceConnectorRegistry,
    private readonly semanticScholarConnector: SemanticScholarConnector,
    private readonly pubMedConnector: PubMedConnector,
    private readonly financeApiConnector: FinanceApiConnector,
    private readonly weatherApiConnector: WeatherApiConnector,
    private readonly topicInsightsAgent: TopicInsightsAgent,
    // ★ Registry 由 AiEngineModule 通过 AiEngineOrchestrationModule / TeamsModule
    // 导出，必须作为硬依赖注入；注册失败会导致 IntentRouter 不可发现本模块，
    // 是隐蔽的生产事故源。因此不使用 @Optional — 缺失即启动失败。
    private readonly agentRegistry: AgentRegistry,
    private readonly teamRegistry: TeamRegistry,
    // ★ P2-2 目标架构：17 agent spec → L2 AgentFactory → SpecAgentRegistry
    private readonly harnessAgentFactory: HarnessAgentFactory,
    private readonly specAgentRegistry: SpecAgentRegistry,
  ) {}

  async onModuleInit() {
    // Bridge prompt skills from SKILL.md → SkillRegistry
    const bridgeResult =
      await this.promptSkillBridge.registerDomain("insights");
    this.logger.log(
      `Prompt skills bridged: registered=${bridgeResult.registered.length}, ` +
        `skipped=${bridgeResult.skipped.length}, errors=${bridgeResult.errors.length}`,
    );

    // ★ P0: 注册数据源连接器
    this.connectorRegistry.register(this.semanticScholarConnector);
    this.connectorRegistry.register(this.pubMedConnector);
    this.connectorRegistry.register(this.financeApiConnector);
    this.connectorRegistry.register(this.weatherApiConnector);
    this.logger.log(
      `Data source connectors registered: ${this.connectorRegistry.getCount()}`,
    );

    // ★ Agent/Team 注册 → IntentRouter 可发现（硬依赖，失败即抛）
    this.agentRegistry.register(this.topicInsightsAgent);
    this.logger.log("Registered TopicInsightsAgent");
    this.teamRegistry.registerConfig(TOPIC_INSIGHTS_TEAM_CONFIG);
    this.logger.log("Registered TOPIC_INSIGHTS team config");

    // ★ P2-2 目标架构：17 个 topic-insights agent 从 spec 构造，注册到 L2 SpecAgentRegistry
    // 后续 pipeline stage（P3-1 后）从这里 .get(id).executeSpec(input) 调用。
    let registered = 0;
    for (const spec of TOPIC_INSIGHTS_AGENT_SPECS) {
      try {
        const agent = this.harnessAgentFactory.createSpecAgent(spec);
        this.specAgentRegistry.register(agent);
        registered += 1;
      } catch (err) {
        this.logger.error(
          `Failed to register spec agent ${spec.identity.role.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    this.logger.log(
      `Registered ${registered}/${TOPIC_INSIGHTS_AGENT_SPECS.length} topic-insights spec agents to L2 SpecAgentRegistry`,
    );
  }
}
