import { Module, MiddlewareConsumer, NestModule } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ServeStaticModule } from "@nestjs/serve-static";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ResponseTransformInterceptor } from "./common/interceptors/response-transform.interceptor";
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
import { join } from "path";
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
// Core modules
import { AuthModule } from "./modules/core/auth/auth.module";
import { AdminModule } from "./modules/core/admin/admin.module";
import { MonitoringModule } from "./modules/core/monitoring";
import { EmailModule } from "./modules/core/email/email.module";
import { FeedbackModule } from "./modules/core/feedback/feedback.module";
import { NotificationModule } from "./modules/core/notifications/notification.module";
import { ReleaseModule } from "./modules/core/release/release.module";
import { SettingsModule } from "./modules/core/settings/settings.module";
import { StorageModule } from "./modules/core/storage/storage.module";
import { TableManagementModule } from "./modules/core/table-management/table-management.module";
import { CreditsModule } from "./modules/credits/credits.module";
import { UserApiKeysModule } from "./modules/core/user-api-keys/user-api-keys.module";
// AI modules
import { AiEngineModule } from "./modules/ai-engine/ai-engine.module";
import { AiAskModule } from "./modules/ai-app/ask/ai-ask.module";
import { AiImageModule } from "./modules/ai-app/image/ai-image.module";
import { AiOfficeModule } from "./modules/ai-app/office/ai-office.module";
import { AiSimulationModule } from "./modules/ai-app/simulation/ai-simulation.module";
import { AiTeamsModule } from "./modules/ai-app/teams/ai-teams.module";
import { AiPlanningModule } from "./modules/ai-app/planning/ai-planning.module";
import { RAGModule } from "./modules/ai-app/rag/rag.module";
import { AiWritingModule } from "./modules/ai-app/writing/ai-writing.module";
import { ResearchModule } from "./modules/ai-app/research";
import { TopicInsightsModule } from "./modules/ai-app/topic-insights";
import { AiSocialModule } from "./modules/ai-app/social/ai-social.module";
// Content modules
import { CollectionsModule } from "./modules/content/collections/collections.module";
import { CommentsModule } from "./modules/content/comments/comments.module";
import { ExploreModule } from "./modules/content/explore/explore.module";
import { FeedModule } from "./modules/content/feed/feed.module";
import { NotesModule } from "./modules/content/notes/notes.module";
import { ReportsModule } from "./modules/content/reports/reports.module";
import { ResourcesModule } from "./modules/content/resources/resources.module";
import { WorkspaceModule } from "./modules/content/workspace/workspace.module";
// Content modules (additional)
import { KnowledgeGraphModule } from "./modules/content/knowledge-graph/knowledge-graph.module";
import { RecommendationsModule } from "./modules/content/recommendations/recommendations.module";
// Ingestion modules
import { CrawlersModule } from "./modules/ingestion/crawlers/crawlers.module";
import { SourcesModule } from "./modules/ingestion/sources/sources.module";
import { IngestionConfigModule } from "./modules/ingestion/config/config.module";
import { SchedulerModule } from "./modules/ingestion/scheduler/scheduler.module";
// Integration modules
import { ProxyModule } from "./modules/integrations/proxy/proxy.module";
import { FeishuModule } from "./modules/integrations/feishu/feishu.module";
import { NotionModule } from "./modules/integrations/notion/notion.module";
import { GoogleDriveModule } from "./modules/integrations/google-drive/google-drive.module";
import { AiFileOrganizerModule } from "./modules/integrations/ai-file-organizer/ai-file-organizer.module";
// Export module
import { ExportModule } from "./common/export";
// Webhooks module
import { WebhooksModule } from "./modules/webhooks";
// MCP Server module
import { MCPServerModule } from "./modules/mcp-server";
// Public API module
import { PublicApiModule } from "./modules/public-api/public-api.module";
// A2A Server module
import { A2AModule } from "./modules/ai-engine/a2a";
// Request context middleware
import { RequestContextMiddleware } from "./common/context/request-context.middleware";

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

    // 静态文件服务
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, "..", "public"),
      serveRoot: "/",
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

    // Core modules
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
    UserApiKeysModule,

    // AI modules (ai-* prefix)
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
    AiSocialModule, // AI 社交媒体发布模块
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
  ],
  controllers: [AppController],
  providers: [
    AppService,
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
