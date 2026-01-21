import { Module } from "@nestjs/common";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import {
  AITeamsAdminController,
  AITeamsTemplatesController,
} from "./ai-teams-admin.controller";
import { AITeamsAdminService } from "./ai-teams-admin.service";
import { AIAdminController } from "./ai-admin.controller";
import { AIAdminService } from "./ai-admin.service";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { AiEngineModule } from "../../ai-engine/ai-engine.module";
import { SecretsModule } from "../secrets/secrets.module";

@Module({
  imports: [PrismaModule, AiEngineModule, SecretsModule],
  controllers: [
    AdminController,
    AITeamsAdminController,
    AITeamsTemplatesController,
    AIAdminController, // /admin/ai/* routes for tools, skills, mcp-servers
  ],
  providers: [AdminService, AITeamsAdminService, AIAdminService],
  exports: [AdminService, AITeamsAdminService, AIAdminService],
})
export class AdminModule {}
