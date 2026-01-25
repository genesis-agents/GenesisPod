import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { PrismaModule } from "../../../../common/prisma/prisma.module";
// Import directly from source to avoid circular dependency via barrel export
import { AiEngineModule } from "../../../ai-engine/ai-engine.module";
import { CreditsModule } from "../../../credits/credits.module";
import { ExportModule } from "../../../../common/export/export.module";
// TODO: 后续添加 CrawlersModule 以支持更多数据源
// import { CrawlersModule } from '../../ingestion/crawlers/crawlers.module';
// Note: EventEmitterModule is globally configured in AppModule
import { TopicResearchController } from "./topic-research.controller";
import { TopicResearchService } from "./topic-research.service";
import { TopicResearchGateway } from "./topic-research.gateway";
import {
  DataSourceRouterService,
  DimensionResearchService,
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
} from "./services";
import { TopicAccessGuard } from "./guards";

const services = [
  TopicResearchService,
  DataSourceRouterService,
  DimensionResearchService,
  ReportSynthesisService,
  ResearchReviewerService,
  TopicTeamOrchestratorService,
  TopicRefreshScheduler,
  EvidenceManagementService,
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
];

@Module({
  imports: [
    PrismaModule,
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
  controllers: [TopicResearchController],
  providers: [...services, TopicResearchGateway, TopicAccessGuard],
  exports: [...services, TopicAccessGuard],
})
export class TopicResearchModule {}
