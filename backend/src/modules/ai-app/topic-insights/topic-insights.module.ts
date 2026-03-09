import { Module, OnModuleInit, Logger, Optional } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { NotificationModule } from "../../ai-infra/notifications/notification.module";
// Import directly from source to avoid circular dependency via barrel export
import { AiEngineModule } from "../../ai-engine/ai-engine.module";
import {
  PromptSkillBridge,
  AgentRegistry,
  TeamRegistry,
} from "../../ai-engine/facade";
import { CreditsModule } from "../../ai-infra/credits/credits.module";
import { SecretsModule } from "../../ai-infra/secrets/secrets.module";
import { StorageModule } from "../../ai-infra/storage/storage.module";
import { ExportModule } from "../../../common/export/export.module";
import { TopicInsightsAgent } from "./agents";
import { TOPIC_INSIGHTS_TEAM_CONFIG } from "./teams";
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
} from "./controllers";
import { TopicInsightsService } from "./topic-insights.service";
import { TopicInsightsGateway } from "./topic-insights.gateway";
import {
  DataSourceRouterService,
  ReportSynthesisService,
  TopicTeamOrchestratorService,
  TopicRefreshScheduler,
  EvidenceManagementService,
  ResearchReviewerService,
  ResearchLeaderService,
  ResearchMissionService,
  TopicCollaboratorService,
  ResearchEventEmitterService,
  DimensionMissionService,
  SectionWriterService,
  ReportChangeService,
  ReportAnnotationService,
  ResearchStrategyService,
  AgentActivityService,
  CredibilityReportService,
  ReviewWorkflowService,
  ResearchTodoService,
  ResearchMissionHealthService,
  ResearchCheckpointService,
  DataEnrichmentService,
  LeaderToolService,
  ResearchReflectionService,
  DataSourcePlannerService,
  FigureExtractorService,
  ReportValidationService,
  ReportEditorService,
  // ★ Mission sub-services (God Service decomposition)
  MissionObservabilityService,
  MissionKernelBridgeService,
  MissionNotificationService,
  // ★ Leader sub-services
  LeaderPlanningService,
  LeaderReviewService,
  LeaderChatService,
  // ★ Facade sub-services
  TopicCrudService,
  TopicDimensionService,
  TopicExportService,
  TopicScheduleService,
  MissionQueryService,
  MissionLifecycleService,
  MissionExecutionService,
  // ★ Data sub-services
  DataSourceFetcherService,
  DataSourceStrategyService,
  // ★ Dimension sub-services
  DimensionSearchService,
  DimensionWritingService,
  // ★ Report sub-services
  ReportGeneratorService,
  ReportAssemblerService,
  ReportDataService,
  // ★ Engine Adapters (P2 能力下沉集成)
  ResearchRealtimeAdapter,
  EvidenceSyncCompensationService,
  ResearchMemoryService,
  // ★ P0: 新增核心能力
  InteractiveResearchService,
  DataSourceConnectorRegistry,
  SemanticScholarConnector,
  PubMedConnector,
  FinanceApiConnector,
  WeatherApiConnector,
  KnowledgeGraphService,
  MultiLanguageResearchService,
  // ★ P1: 新增增强能力
  CritiqueRefineService,
  ReportQualityGateService,
  ReportQualityTraceService,
  CitationFormatterService,
  ResearchExportService,
  ResearchTemplateService,
  RAGFusionService,
  // ★ Search Pipeline (modular search architecture)
  GlobalSourceThrottleService,
  QueryStrategyService,
  SearchExecutorService,
  ResultFusionService,
  QualityGateService,
  SearchOrchestratorService,
  WebSearchAdapter,
  AcademicSearchAdapter,
  GithubSearchAdapter,
  HackernewsSearchAdapter,
  SocialSearchAdapter,
  PolicySearchAdapter,
  FinanceSearchAdapter,
  WeatherSearchAdapter,
  LocalSearchAdapter,
} from "./services";
import { TopicAccessGuard } from "./guards";

const services = [
  TopicInsightsService,
  DataSourceRouterService,
  ReportSynthesisService,
  ResearchReviewerService,
  TopicTeamOrchestratorService,
  TopicRefreshScheduler,
  EvidenceManagementService,
  ResearchLeaderService,
  ResearchMissionService,
  MissionQueryService,
  MissionLifecycleService,
  MissionExecutionService,
  // ★ Mission sub-services (God Service decomposition)
  MissionObservabilityService,
  MissionKernelBridgeService,
  MissionNotificationService,
  TopicCollaboratorService,
  ResearchEventEmitterService,
  DimensionMissionService,
  SectionWriterService,
  ReportChangeService,
  ReportAnnotationService,
  ResearchStrategyService,
  AgentActivityService,
  CredibilityReportService,
  ReviewWorkflowService,
  ResearchTodoService,
  ResearchMissionHealthService,
  ResearchCheckpointService,
  DataEnrichmentService,
  LeaderToolService,
  ResearchReflectionService,
  DataSourcePlannerService,
  FigureExtractorService,
  ReportValidationService,
  ReportEditorService,
  // ★ Leader sub-services
  LeaderPlanningService,
  LeaderReviewService,
  LeaderChatService,
  // ★ Facade sub-services
  TopicCrudService,
  TopicDimensionService,
  TopicExportService,
  TopicScheduleService,
  // ★ Data sub-services
  DataSourceFetcherService,
  DataSourceStrategyService,
  RAGFusionService,
  // ★ Dimension sub-services
  DimensionSearchService,
  DimensionWritingService,
  // ★ Report sub-services
  ReportGeneratorService,
  ReportAssemblerService,
  ReportDataService,
  // ★ Engine Adapters (P2 能力下沉集成)
  ResearchRealtimeAdapter,
  EvidenceSyncCompensationService,
  // ★ Memory
  ResearchMemoryService,
  // ★ P0: 新增核心能力
  InteractiveResearchService,
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
  CitationFormatterService,
  ResearchExportService,
  ResearchTemplateService,
  // ★ Search Pipeline (modular search architecture)
  GlobalSourceThrottleService,
  QueryStrategyService,
  SearchExecutorService,
  ResultFusionService,
  QualityGateService,
  SearchOrchestratorService,
  WebSearchAdapter,
  AcademicSearchAdapter,
  GithubSearchAdapter,
  HackernewsSearchAdapter,
  SocialSearchAdapter,
  PolicySearchAdapter,
  FinanceSearchAdapter,
  WeatherSearchAdapter,
  LocalSearchAdapter,
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
  ],
  providers: [...services, TopicInsightsGateway, TopicAccessGuard],
  exports: [TopicInsightsService, TopicAccessGuard],
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
    @Optional() private readonly agentRegistry?: AgentRegistry,
    @Optional() private readonly teamRegistry?: TeamRegistry,
  ) {}

  async onModuleInit() {
    // Bridge prompt skills from SKILL.md → SkillRegistry
    const bridgeResult =
      await this.promptSkillBridge.registerDomain("research");
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

    // ★ Gap 1: Agent/Team 注册 → IntentRouter 可发现
    if (this.agentRegistry) {
      this.agentRegistry.register(this.topicInsightsAgent);
      this.logger.log("Registered TopicInsightsAgent");
    }
    if (this.teamRegistry) {
      this.teamRegistry.registerConfig(TOPIC_INSIGHTS_TEAM_CONFIG);
      this.logger.log("Registered TOPIC_INSIGHTS team config");
    }
  }
}
