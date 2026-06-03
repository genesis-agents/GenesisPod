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
import { OpsDashboardController } from "./dashboard/ops-dashboard.controller";
import { OpsDashboardService } from "./dashboard/ops-dashboard.service";
import { MCPExternalAdminController } from "./mcp/external-servers.controller";
import { MCPServerAdminController } from "./mcp/server.controller";
import { AdminCreditsController } from "./credits/admin-credits.controller";
import { CreditsModule } from "../../platform/credits/credits.module";
// ★ 2026-06-03 standards/16: System HTTP 上提——platform 的 admin/* controller
//   迁入 open-api/admin（System API 网关），对应 service 留 L1 platform。
import { SecretsController } from "./secrets/secrets.controller";
import { SecretKeysController } from "./secrets/secret-keys.controller";
import { DbOpsController } from "./db-ops/db-ops.controller";
import { SettingsController } from "./settings/settings.controller";
import { StorageGovernanceController } from "./storage/storage-governance.controller";
import { AgentConfigService } from "../../ai-harness/facade";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { AiEngineModule } from "../../ai-engine/ai-engine.module";
import { SecretsModule } from "../../platform/credentials/secrets/secrets.module";
import { KeyAssignmentsModule } from "../../platform/credentials/key-assignments/key-assignments.module";
import { QuotaModule } from "./quota/quota.module";
import { MCPServerModule } from "../../open-api/mcp/mcp-server.module";
import { StorageModule } from "../../platform/storage/storage.module";
import { DbOpsModule } from "../../platform/db-ops/db-ops.module";

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
    CreditsModule, // AdminCreditsController 注入 CreditsService/CreditRulesService
    StorageModule,
    DbOpsModule, // DbOpsService（admin/tables controller 上提后注入）；SettingsService/EmailService/SecretsService 已 @Global 或经 SecretsModule 提供
  ],
  controllers: [
    AdminController,
    // ★ 2026-06-03 standards/16 System HTTP 上提（route/guard 原样保留）
    SecretsController, // admin/secrets/*
    SecretKeysController, // admin/secrets/:secretId/keys/*
    DbOpsController, // admin/tables/*
    SettingsController, // admin/settings/*
    StorageGovernanceController, // storage/* (STORAGE_ADMIN_KEY header 鉴权的运维清理端点)
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
    MCPServerAdminController, // /admin/mcp/server（原 mcp-server-admin，admin/mcp-server 路由）
    AdminCreditsController, // /admin/credits（从 system/credits 拆出）
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
    OpsDashboardController, // /admin/dashboard/* 运营看板（运营看板 W5）
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
    OpsDashboardService, // 运营看板聚合（运营看板 W5）
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
