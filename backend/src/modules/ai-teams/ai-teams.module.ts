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
import { PrismaModule } from "../../common/prisma/prisma.module";
import { AiModule } from "../ai/ai.module";

@Module({
  imports: [PrismaModule, AiModule],
  controllers: [AiTeamsController, UsersController, BookmarksController],
  providers: [
    AiTeamsService,
    AiTeamsGateway,
    DebateService,
    ContextRouterService,
    TeamMissionService,
    UrlParserService,
    ContentExtractionService,
  ],
  exports: [
    AiTeamsService,
    DebateService,
    ContextRouterService,
    TeamMissionService,
    UrlParserService,
    ContentExtractionService,
  ],
})
export class AiTeamsModule {}
