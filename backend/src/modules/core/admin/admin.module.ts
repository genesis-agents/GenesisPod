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
import { LogsAdminController } from "./logs-admin.controller";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { AiEngineModule } from "../../ai-engine/ai-engine.module";
import { SecretsModule } from "../secrets/secrets.module";
import { QuotaModule } from "./quota/quota.module";

// Admin sub-services
import {
  UserManagementService,
  ResourceManagementService,
  StatisticsService,
  LogsService,
} from "./services";

@Module({
  imports: [PrismaModule, AiEngineModule, SecretsModule, QuotaModule],
  controllers: [
    AdminController,
    AITeamsAdminController,
    AITeamsTemplatesController,
    AIAdminController, // /admin/ai/* routes for tools, skills, mcp-servers
    LogsAdminController, // /admin/logs/* routes
  ],
  providers: [
    AdminService,
    AITeamsAdminService,
    AIAdminService,
    // Admin sub-services (dependencies of AdminService)
    UserManagementService,
    ResourceManagementService,
    StatisticsService,
    LogsService,
  ],
  exports: [
    AdminService,
    AITeamsAdminService,
    AIAdminService,
    UserManagementService,
    ResourceManagementService,
    StatisticsService,
    LogsService,
  ],
})
export class AdminModule {}
