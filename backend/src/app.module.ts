import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ServeStaticModule } from "@nestjs/serve-static";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { APP_GUARD } from "@nestjs/core";
import { join } from "path";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
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
// Core modules
import { AuthModule } from "./modules/core/auth/auth.module";
import { AdminModule } from "./modules/core/admin/admin.module";
import { EmailModule } from "./modules/core/email/email.module";
import { FeedbackModule } from "./modules/core/feedback/feedback.module";
import { NotificationModule } from "./modules/core/notifications/notification.module";
import { SettingsModule } from "./modules/core/settings/settings.module";
import { StorageModule } from "./modules/core/storage/storage.module";
import { CreditsModule } from "./modules/credits/credits.module";
// AI modules
import { AiEngineModule } from "./modules/ai-engine/ai-engine.module";
import { AiAskModule } from "./modules/ai-app/ask/ai-ask.module";
import { AiImageModule } from "./modules/ai-app/image/ai-image.module";
import { AiOfficeModule } from "./modules/ai-app/office/ai-office.module";
import { AiSimulationModule } from "./modules/ai-app/simulation/ai-simulation.module";
import { AiTeamsModule } from "./modules/ai-app/teams/ai-teams.module";
import { AiCodingModule } from "./modules/ai-app/coding/ai-coding.module";
import { RAGModule } from "./modules/ai-app/rag/rag.module";
import { AiWritingModule } from "./modules/ai-app/writing/ai-writing.module";
import { ResearchModule } from "./modules/ai-app/research";
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
// Integration modules
import { ProxyModule } from "./modules/integrations/proxy/proxy.module";
import { WechatWorkModule } from "./modules/integrations/wechat-work/wechat-work.module";
import { NotionModule } from "./modules/integrations/notion/notion.module";
import { GoogleDriveModule } from "./modules/integrations/google-drive/google-drive.module";
import { AiFileOrganizerModule } from "./modules/integrations/ai-file-organizer/ai-file-organizer.module";
// Export module
import { ExportModule } from "./common/export";
// Webhooks module
import { WebhooksModule } from "./modules/webhooks";

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

    // 数据库模块
    PrismaModule,
    MongoDBModule,
    GraphModule,
    Neo4jModule,

    // 公共服务模块
    AiOrchestrationModule,
    StreamingModule,
    ContentProcessingModule,
    ObservabilityModule,
    AuditModule,
    EventsModule,

    // Core modules
    AuthModule,
    AdminModule,
    EmailModule,
    FeedbackModule,
    NotificationModule,
    SettingsModule,
    StorageModule,
    CreditsModule,

    // AI modules (ai-* prefix)
    AiEngineModule,
    AiAskModule,
    AiImageModule,
    AiOfficeModule,
    AiSimulationModule,
    AiTeamsModule,
    AiCodingModule,
    RAGModule,
    AiWritingModule,
    ResearchModule, // 统一研究模块 (包含 Topic, Deep, Notebook Research)
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

    // Integration modules
    ProxyModule,
    WechatWorkModule,
    NotionModule,
    GoogleDriveModule,
    AiFileOrganizerModule,

    // Export module
    ExportModule,

    // Webhooks module
    WebhooksModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // 全局启用限流守卫
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
