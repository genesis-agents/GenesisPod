import { Module, forwardRef } from "@nestjs/common";
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
import { PermissionsAdminController } from "./permissions-admin.controller";
import { BillingAdminController } from "./billing-admin.controller";
import { NotificationsAdminController } from "./notifications-admin.controller";
import { MonitoringAdminController } from "./monitoring-admin.controller";
import { CacheAdminController } from "./cache-admin.controller";
import { AgentAdminController } from "./agent-admin.controller";
import { ResearchAdminController } from "./research-admin.controller";
import { MCPExternalAdminController } from "../../ai-engine/mcp/admin/mcp-external-admin.controller";
import { AgentConfigService } from "../../ai-engine/agents/config/agent-config.service";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { AiEngineModule } from "../../ai-engine/ai-engine.module";
import { SecretsModule } from "../secrets/secrets.module";
import { QuotaModule } from "./quota/quota.module";
import { MCPServerModule } from "../../mcp-server/mcp-server.module";

// Admin sub-services
import {
  UserManagementService,
  ResourceManagementService,
  StatisticsService,
  LogsService,
  PermissionsService,
  BillingService,
  NotificationsAdminService,
} from "./services";

// Monitoring services (from shared MonitoringModule, globally available)
// ErrorTrackingService and AIMetricsService are provided by MonitoringModule

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => AiEngineModule),
    SecretsModule,
    QuotaModule,
    MCPServerModule,
  ],
  controllers: [
    AdminController,
    AITeamsAdminController,
    AITeamsTemplatesController,
    AIAdminController, // /admin/ai/* routes for tools, skills, mcp-servers
    LogsAdminController, // /admin/logs/* routes
    PermissionsAdminController, // /admin/permissions/* routes
    BillingAdminController, // /admin/billing/* routes
    NotificationsAdminController, // /admin/notifications/* routes
    MonitoringAdminController, // /admin/monitoring/* routes for error tracking & AI metrics
    CacheAdminController, // /admin/cache/* routes for cache management
    MCPExternalAdminController, // /admin/mcp/external-servers/* routes
    AgentAdminController, // /admin/agents/* routes for agent configuration
    ResearchAdminController, // /admin/research/templates/* routes for research templates
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
    PermissionsService,
    BillingService,
    NotificationsAdminService,
    AgentConfigService,
    // Note: ErrorTrackingService and AIMetricsService are provided globally by MonitoringModule
  ],
  exports: [
    AdminService,
    AITeamsAdminService,
    AIAdminService,
    UserManagementService,
    ResourceManagementService,
    StatisticsService,
    LogsService,
    PermissionsService,
    BillingService,
    NotificationsAdminService,
    // Note: ErrorTrackingService and AIMetricsService are exported globally by MonitoringModule
  ],
})
export class AdminModule {}
