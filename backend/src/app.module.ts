import { Module, MiddlewareConsumer, NestModule } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ScheduleModule } from "@nestjs/schedule";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ResponseTransformInterceptor } from "./common/interceptors/response-transform.interceptor";
import { RequestLoggerInterceptor } from "./common/interceptors/request-logger.interceptor";
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { CommonModule } from "./common/common.module";
import { PrismaModule } from "./common/prisma/prisma.module";
import { MongoDBModule } from "./common/mongodb/mongodb.module";
import { GraphModule } from "./common/graph/graph.module";
import { Neo4jModule } from "./common/neo4j/neo4j.module";
import { AiOrchestrationModule } from "./common/ai-orchestration";
import { StreamingModule } from "./common/streaming";
import { ContentProcessingModule } from "./common/content-processing";
import { ObservabilityModule } from "./common/observability";
import { AuditModule } from "./common/audit";
import { EventsModule } from "./common/events";
import { CacheModule } from "./common/cache";
// AI Infrastructure modules
import { AuthModule } from "./modules/ai-infra/auth/auth.module";
import { AdminModule } from "./modules/open-api/admin/admin.module";
import { MonitoringModule } from "./modules/ai-infra/monitoring";
import { EmailModule } from "./modules/ai-infra/email/email.module";
import { FeedbackModule } from "./modules/ai-app/feedback/feedback.module";
import { NotificationModule } from "./modules/ai-infra/notifications/notification.module";
import { ReleaseModule } from "./modules/ai-infra/release/release.module";
import { SettingsModule } from "./modules/ai-infra/settings/settings.module";
import { StorageModule } from "./modules/ai-infra/storage/storage.module";
import { TableManagementModule } from "./modules/ai-infra/table-management/table-management.module";
import { CreditsModule } from "./modules/ai-infra/credits/credits.module";
import { EncryptionModule } from "./modules/ai-infra/encryption/encryption.module";
import { UserApiKeysModule } from "./modules/ai-engine/credentials/user-api-keys/user-api-keys.module";
import { DistributableKeysModule } from "./modules/ai-engine/credentials/distributable-keys";
import { KeyAssignmentsModule } from "./modules/ai-engine/credentials/key-assignments";
import { KeyRequestsModule } from "./modules/ai-engine/credentials/key-requests";
import { KeyResolverModule } from "./modules/ai-engine/credentials/key-resolver";
import { UserModelConfigsModule } from "./modules/ai-engine/credentials/user-model-configs";
// AI modules
import { AiEngineModule } from "./modules/ai-engine/ai-engine.module";
// AI Harness — Agent kernel / execution / memory / process / protocol / governance / runtime
// 整体由 app.module.ts 装配（@Global，提供器全局可注入），ai-engine 不再反向依赖
import { HarnessModule } from "./modules/ai-harness/harness.module";
import { RuntimeModule } from "./modules/ai-harness/runtime/runtime-aggregate.module";
import { RealtimeModule } from "./modules/ai-harness/protocol/realtime/realtime.module";
import { AiAskModule } from "./modules/ai-app/ask/ai-ask.module";
import { AiImageModule } from "./modules/ai-app/image/ai-image.module";
import { AiOfficeModule } from "./modules/ai-app/office/ai-office.module";
import { AiSimulationModule } from "./modules/ai-app/simulation/ai-simulation.module";
import { AiTeamsModule } from "./modules/ai-app/teams/ai-teams.module";
import { AiPlanningModule } from "./modules/ai-app/planning/ai-planning.module";
import { RAGModule } from "./modules/ai-app/library/rag/rag.module";
import { AiWritingModule } from "./modules/ai-app/writing/ai-writing.module";
import { ResearchModule } from "./modules/ai-app/research";
import { TopicInsightsModule } from "./modules/ai-app/topic-insights";
import { AgentPlaygroundModule } from "./modules/ai-app/agent-playground/agent-playground.module";
import { AiSocialModule } from "./modules/ai-app/social/ai-social.module";
// Explore modules (content discovery)
import { ExploreModule } from "./modules/ai-app/explore/explore.module";
import { ResourcesModule } from "./modules/ai-app/explore/resources/resources.module";
import { FeedModule } from "./modules/ai-app/explore/feed/feed.module";
import { ReportsModule } from "./modules/ai-app/explore/reports/reports.module";
import { CommentsModule } from "./modules/ai-app/explore/comments/comments.module";
// Library modules (shared content)
import { CollectionsModule } from "./modules/ai-app/library/collections/collections.module";
import { NotesModule } from "./modules/ai-app/library/notes/notes.module";
import { KnowledgeGraphModule } from "./modules/ai-app/library/knowledge-graph/knowledge-graph.module";
import { RecommendationsModule } from "./modules/ai-app/library/recommendations/recommendations.module";
// Admin modules (backend management)
import { WorkspaceModule } from "./modules/ai-app/management/workspace/workspace.module";
import { CrawlersModule } from "./modules/ai-app/management/ingestion/crawlers/crawlers.module";
import { SourcesModule } from "./modules/ai-app/management/ingestion/sources/sources.module";
import { IngestionConfigModule } from "./modules/ai-app/management/ingestion/config/config.module";
import { SchedulerModule } from "./modules/ai-app/management/ingestion/scheduler/scheduler.module";
// Content modules (Phase 3: moved from ai-engine to ai-app)
import { LongContentModule } from "./modules/ai-app/writing/content-engine/long-content.module";
import { ContentAnalysisModule } from "./modules/ai-app/office/content-analysis/content-analysis.module";
import { SynthesisModule } from "./modules/ai-app/office/content-synthesis/synthesis.module";
// Integration modules
import { ProxyModule } from "./modules/ai-app/library/proxy/proxy.module";
import { FeishuModule } from "./modules/ai-app/library/integrations/feishu/feishu.module";
import { NotionModule } from "./modules/ai-app/library/integrations/notion/notion.module";
import { GoogleDriveModule } from "./modules/ai-app/library/integrations/google-drive/google-drive.module";
import { AiFileOrganizerModule } from "./modules/ai-app/library/ai-file-organizer/ai-file-organizer.module";
// Export module
import { ExportModule } from "./common/export";
// Open API modules (webhooks, public-api, mcp-server, ai-core, agents-api)
import { WebhooksModule } from "./modules/open-api/webhooks";
import { MCPServerModule } from "./modules/open-api/mcp-server";
import { PublicApiModule } from "./modules/open-api/public-api/public-api.module";
import { AiCoreModule } from "./modules/open-api/ai-core/ai-core.module";
import { AgentsApiModule } from "./modules/open-api/agents-api/agents-api.module";
import { McpAdminModule } from "./modules/open-api/mcp-admin/mcp-admin.module";
// A2A Server module
import { A2AModule } from "./modules/ai-harness/protocol/a2a";
// Request context middleware
import { RequestContextMiddleware } from "./common/context/request-context.middleware";
// L1→L2 DI tokens (audit I-1/I-2: decouple L1 services from L2 concrete classes)
import {
  AI_CHAT_TOKEN,
  AI_OBSERVABILITY_TOKEN,
} from "./modules/ai-infra/abstractions/ai-services.interfaces";
import { ChatFacade } from "./modules/ai-engine/facade";
import { AiObservabilityService } from "./modules/ai-harness/facade";

@Module({
  imports: [
    // 配置模块
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
    }),

    // 全局事件模块（必须在 AppModule 中只调用一次 forRoot，设置 global: true 确保全局可用）
    EventEmitterModule.forRoot({
      global: true,
    }),

    // 全局定时任务模块（@Cron 装饰器必需）
    ScheduleModule.forRoot(),

    // API限流保护 - 全局默认60请求/分钟
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get("THROTTLE_TTL", 60000), // 时间窗口：60秒
          limit: config.get("THROTTLE_LIMIT", 60), // 限制：60次请求
        },
      ],
    }),

    // 公共基础模块
    CommonModule,

    // 数据库模块
    PrismaModule,
    MongoDBModule,
    GraphModule,
    Neo4jModule,

    // 公共服务模块
    CacheModule, // Redis/内存缓存（全局）
    AiOrchestrationModule,
    StreamingModule,
    ContentProcessingModule,
    ObservabilityModule,
    AuditModule,
    EventsModule,

    // AI Infrastructure modules
    MonitoringModule, // Global module for AI metrics and error tracking
    AuthModule,
    AdminModule,
    EmailModule,
    FeedbackModule,
    NotificationModule,
    ReleaseModule,
    SettingsModule,
    StorageModule,
    TableManagementModule,
    CreditsModule,
    EncryptionModule, // 全局加密服务（必须先于依赖它的模块注册）
    UserApiKeysModule,
    // BYOK v2：可分发 Key 池 + 分配 + 申请 + 统一解析
    DistributableKeysModule,
    KeyAssignmentsModule,
    KeyRequestsModule,
    KeyResolverModule,
    UserModelConfigsModule,

    // AI modules (ai-* prefix)
    // ★ Harness 必须先于 AiEngineModule 装配 — engine 子模块（如 RuntimeResourceModule）
    // 依赖 harness 注册的 DI token（SPEC_AGENT_REGISTRY_PROBE / TOOL_CIRCUIT_BREAKER_PROBE）
    HarnessModule,
    RuntimeModule,
    RealtimeModule,
    AiEngineModule,
    AiAskModule,
    AiImageModule,
    AiOfficeModule,
    AiSimulationModule,
    AiTeamsModule,
    AiPlanningModule,
    RAGModule,
    AiWritingModule,
    ResearchModule, // Deep Research 模块 (Deep Research + Notebook Research)
    TopicInsightsModule, // Topic Insights 专题洞察模块 (从 Research 拆分)
    AgentPlaygroundModule, // ★ Harness 全栈能力 demo（research-team）
    AiSocialModule, // AI 社交媒体发布模块
    // Content engine modules (Phase 3: moved from ai-engine)
    LongContentModule,
    ContentAnalysisModule,
    SynthesisModule,
    // Content modules
    ResourcesModule,
    FeedModule,
    CollectionsModule,
    NotesModule,
    CommentsModule,
    ReportsModule,
    ExploreModule,
    WorkspaceModule,
    KnowledgeGraphModule,
    RecommendationsModule,

    // Ingestion modules
    CrawlersModule,
    SourcesModule,
    IngestionConfigModule,
    SchedulerModule,

    // Integration modules
    ProxyModule,
    FeishuModule,
    NotionModule,
    GoogleDriveModule,
    AiFileOrganizerModule,

    // Export module
    ExportModule,

    // Webhooks module
    WebhooksModule,

    // MCP Server module
    MCPServerModule,

    // Public API module
    PublicApiModule,

    // A2A Server module
    A2AModule,

    // AI Core API (PR-X6: moved from ai-engine/api)
    AiCoreModule,

    // Agents API (PR-X6: moved from ai-engine/agents/api)
    AgentsApiModule,

    // MCP Admin API (PR-X7: moved from ai-engine/mcp/admin)
    McpAdminModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // L1→L2 DI bindings: map abstract tokens to concrete L2 services (audit I-1/I-2)
    { provide: AI_CHAT_TOKEN, useExisting: ChatFacade },
    { provide: AI_OBSERVABILITY_TOKEN, useExisting: AiObservabilityService },
    // 全局 JWT 认证守卫（@Public() 装饰器跳过）
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // 全局启用限流守卫
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // 全局请求日志 & 性能追踪拦截器（Server-Timing header + 指标收集）
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestLoggerInterceptor,
    },
    // 全局响应格式转换拦截器
    // Ensures consistent API response format: { success, data, metadata }
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseTransformInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes("*");
  }
}
