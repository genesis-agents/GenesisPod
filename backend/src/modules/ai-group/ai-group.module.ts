import { Module } from "@nestjs/common";
import {
  AiGroupController,
  UsersController,
  BookmarksController,
} from "./ai-group.controller";
import { AiGroupService } from "./ai-group.service";
import { AiGroupGateway } from "./ai-group.gateway";
import { DebateService } from "./debate.service";
import { ContextRouterService } from "./context-router.service";
import { TeamMissionService } from "./team-mission.service";
import { PrismaModule } from "../../common/prisma/prisma.module";
import { AiModule } from "../ai/ai.module";

@Module({
  imports: [PrismaModule, AiModule],
  controllers: [AiGroupController, UsersController, BookmarksController],
  providers: [
    AiGroupService,
    AiGroupGateway,
    DebateService,
    ContextRouterService,
    TeamMissionService,
  ],
  exports: [
    AiGroupService,
    DebateService,
    ContextRouterService,
    TeamMissionService,
  ],
})
export class AiGroupModule {}
