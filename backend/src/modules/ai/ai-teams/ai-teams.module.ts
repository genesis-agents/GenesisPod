import { Module } from "@nestjs/common";
import {
  AiTeamsController,
  UsersController,
  BookmarksController,
} from "./ai-teams.controller";
import { CustomTeamsController } from "./controllers/custom-teams.controller";
import { AiTeamsService } from "./ai-teams.service";
import { AiTeamsGateway } from "./ai-teams.gateway";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { AiCoreModule } from "../ai-core/ai-core.module";
import { AiEngineModule } from "../ai-engine";
import { CreditsModule } from "../../credits/credits.module";
import { TeamMemberAgent, TeamsLLMAdapter } from "./agents";
import { AiTeamsIntegrationService } from "./ai-teams-integration.service";
import {
  DebateService,
  TeamMissionService,
  TeamCollaborationService,
  ContextRouterService,
  AiResponseService,
  UrlParserService,
  ContentExtractionService,
  TopicMembershipService,
  TopicPublicService,
  TopicForwardBookmarkService,
  TopicEventEmitterService,
} from "./services";

@Module({
  imports: [PrismaModule, AiCoreModule, AiEngineModule, CreditsModule],
  controllers: [
    AiTeamsController,
    UsersController,
    BookmarksController,
    CustomTeamsController,
  ],
  providers: [
    AiTeamsService,
    AiTeamsGateway,
    DebateService,
    ContextRouterService,
    TeamMissionService,
    UrlParserService,
    ContentExtractionService,
    AiResponseService,
    TopicMembershipService,
    TopicPublicService,
    TopicForwardBookmarkService,
    TeamMemberAgent,
    TeamsLLMAdapter,
    TeamCollaborationService,
    TopicEventEmitterService,
    // ai-engine 整合服务
    AiTeamsIntegrationService,
  ],
  exports: [
    AiTeamsService,
    DebateService,
    ContextRouterService,
    TeamMissionService,
    UrlParserService,
    ContentExtractionService,
    AiResponseService,
    TopicMembershipService,
    TopicPublicService,
    TopicForwardBookmarkService,
    TeamMemberAgent,
    TeamsLLMAdapter,
    TeamCollaborationService,
    // ai-engine 整合服务
    AiTeamsIntegrationService,
  ],
})
export class AiTeamsModule {}
