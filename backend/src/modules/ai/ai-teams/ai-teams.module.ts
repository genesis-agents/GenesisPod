import { Module } from "@nestjs/common";
import {
  AiTeamsController,
  UsersController,
  BookmarksController,
} from "./ai-teams.controller";
import { AiTeamsService } from "./ai-teams.service";
import { AiTeamsGateway } from "./ai-teams.gateway";
import { DebateService } from "./debate.service";
import { ContextRouterService } from "./context-router.service";
import { TeamMissionService } from "./team-mission.service";
import { UrlParserService } from "./url-parser.service";
import { ContentExtractionService } from "./content-extraction.service";
import { AiResponseService } from "./ai-response.service";
import { TopicMembershipService } from "./topic-membership.service";
import { TopicPublicService } from "./topic-public.service";
import { TopicForwardBookmarkService } from "./topic-forward-bookmark.service";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { AiCoreModule } from "../ai-core/ai-core.module";

@Module({
  imports: [PrismaModule, AiCoreModule],
  controllers: [AiTeamsController, UsersController, BookmarksController],
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
  ],
})
export class AiTeamsModule {}
