import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { PrismaModule } from "../../../../common/prisma/prisma.module";
import { NotificationModule } from "../../../core/notifications/notification.module";
// Import directly from source to avoid circular dependency via barrel export
import { AiEngineModule } from "../../../ai-engine/ai-engine.module";
import { CreditsModule } from "../../../credits/credits.module";
import { ExportModule } from "../../../../common/export/export.module";
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
import { TopicResearchService } from "./topic-research.service";
import { TopicResearchGateway } from "./topic-research.gateway";
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
  ReportDataService,
  // ★ Engine Adapters (P2 能力下沉集成)
  ResearchRealtimeAdapter,
  EvidenceSyncCompensationService,
} from "./services";
import { TopicAccessGuard } from "./guards";

const services = [
  TopicResearchService,
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
  // ★ Dimension sub-services
  DimensionSearchService,
  DimensionWritingService,
  // ★ Report sub-services
  ReportGeneratorService,
  ReportDataService,
  // ★ Engine Adapters (P2 能力下沉集成)
  ResearchRealtimeAdapter,
  EvidenceSyncCompensationService,
];

@Module({
  imports: [
    PrismaModule,
    NotificationModule,
    AiEngineModule,
    CreditsModule,
    ExportModule,
    ConfigModule,
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
  providers: [...services, TopicResearchGateway, TopicAccessGuard],
  exports: [...services, TopicAccessGuard],
})
export class TopicResearchModule {}
