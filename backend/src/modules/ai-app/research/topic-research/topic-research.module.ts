import { Module } from "@nestjs/common";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { PrismaModule } from "../../../../common/prisma/prisma.module";
import { AiEngineModule } from "../../../ai-engine";
import { CreditsModule } from "../../../credits/credits.module";
// TODO: 后续添加 CrawlersModule 以支持更多数据源
// import { CrawlersModule } from '../../ingestion/crawlers/crawlers.module';
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
} from "./services";

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
];

@Module({
  imports: [
    PrismaModule,
    AiEngineModule,
    CreditsModule,
    EventEmitterModule.forRoot(),
  ],
  controllers: [TopicResearchController],
  providers: [...services, TopicResearchGateway],
  exports: services,
})
export class TopicResearchModule {}
