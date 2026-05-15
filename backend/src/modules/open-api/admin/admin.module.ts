import { Module } from "@nestjs/common";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import {
  AITeamsAdminController,
  AITeamsTemplatesController,
} from "./teams/ai-teams-admin.controller";
import { AITeamsAdminService } from "./teams/ai-teams-admin.service";
import { AIAdminController } from "./ai/ai-admin.controller";
import { AiProvidersAdminController } from "./providers/ai-providers-admin.controller";
import { ApiFormatsAdminController } from "./providers/api-formats-admin.controller";
import { ModelTypesAdminController } from "./providers/model-types-admin.controller";
import { ProviderDiscoveryController } from "./providers/provider-discovery.controller";
import { KnowledgeAdminController } from "./knowledge/knowledge-admin.controller";
import { AIAdminService } from "./ai/ai-admin.service";
import { LogsAdminController } from "./logs/logs-admin.controller";
import { PermissionsAdminController } from "./permissions/permissions-admin.controller";
import { BillingAdminController } from "./billing/billing-admin.controller";
import { NotificationsAdminController } from "./notifications/notifications-admin.controller";
import { MonitoringAdminController } from "./monitoring/monitoring-admin.controller";
import { CacheAdminController } from "./cache/cache-admin.controller";
import { AgentAdminController } from "./agent/agent-admin.controller";
import { ResearchAdminController } from "./research/research-admin.controller";
import { ApprovalsAdminController } from "./approvals/approvals-admin.controller";
import { KernelAdminController } from "./kernel/kernel-admin.controller";
import { AdminModelRecommendationsController } from "./recommendations/model-recommendations-admin.controller";
import { ObservabilityAdminController } from "./observability/observability-admin.controller";
import { HarnessInspectorController } from "./harness/harness-inspector.controller";
import { EvalAdminController } from "./eval/eval-admin.controller";
import { DreamingAdminController } from "./dreaming/dreaming-admin.controller";
import { MCPExternalAdminController } from "../mcp-admin/mcp-external-admin.controller";
import { AgentConfigService } from "../../ai-harness/facade";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { AiEngineModule } from "../../ai-engine/ai-engine.module";
import { SecretsModule } from "../../ai-infra/secrets/secrets.module";
import { KeyAssignmentsModule } from "../../ai-infra/credentials/key-assignments/key-assignments.module";
import { QuotaModule } from "./quota/quota.module";
import { MCPServerModule } from "../../open-api/mcp-server/mcp-server.module";
import { StorageModule } from "../../ai-infra/storage/storage.module";

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
    AiEngineModule,
    SecretsModule,
    KeyAssignmentsModule, // PR-6: 让 AdminService 能在 updateAIModel 时反向恢复 STALE
    QuotaModule,
    MCPServerModule,
    StorageModule,
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
    ApprovalsAdminController, // /admin/approvals/* routes for human-in-the-loop approvals
    KernelAdminController, // /admin/kernel/* routes for AI Kernel process management
    AdminModelRecommendationsController, // /admin/ai-models/auto-configure + /admin/model-recommendations
    ObservabilityAdminController, // /admin/traces/* routes (PR-X17: migrated from ai-harness/tracing)
    EvalAdminController, // /admin/evals/* routes for eval runs and experiments
    DreamingAdminController, // /admin/dreaming/* 2026-05-15 PR-I Dreaming（主动反思）骨架
    AiProvidersAdminController, // /admin/ai-providers/* PR-1 数据驱动 provider catalog
    ApiFormatsAdminController, // /admin/api-formats/* 2026-05-11 P3 ApiFormat CRUD
    ModelTypesAdminController, // /admin/model-types/* 2026-05-11 P3 ModelType CRUD
    ProviderDiscoveryController, // /admin/ai-models/discover 2026-05-11 P5 一键探测
    KnowledgeAdminController, // /admin/knowledge/* 2026-05-11 W2 admin 视角知识管理
    ...(process.env.NODE_ENV === "production"
      ? []
      : [HarnessInspectorController]), // /harness/inspector/* routes (PR-X17: migrated from ai-harness/agents/dev-tools)
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
