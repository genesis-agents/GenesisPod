import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ServeStaticModule } from "@nestjs/serve-static";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
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
// Core modules
import { AuthModule } from "./modules/core/auth/auth.module";
import { AdminModule } from "./modules/core/admin/admin.module";
import { EmailModule } from "./modules/core/email/email.module";
import { FeedbackModule } from "./modules/core/feedback/feedback.module";
import { SettingsModule } from "./modules/core/settings/settings.module";
import { StorageModule } from "./modules/core/storage/storage.module";
import { CreditsModule } from "./modules/credits/credits.module";
// AI modules
import { AiCoreModule } from "./modules/ai/ai-core/ai-core.module";
import { AiAgentsModule } from "./modules/ai/ai-agents/ai-agents.module";
import { AiAskModule } from "./modules/ai/ai-ask/ai-ask.module";
import { AiImageModule } from "./modules/ai/ai-image/ai-image.module";
import { AiOfficeModule } from "./modules/ai/ai-office/ai-office.module";
import { AiSimulationModule } from "./modules/ai/ai-simulation/ai-simulation.module";
import { AiStudioModule } from "./modules/ai/ai-studio/ai-studio.module";
import { AiTeamsModule } from "./modules/ai/ai-teams/ai-teams.module";
import { AiCodingModule } from "./modules/ai/ai-coding/ai-coding.module";
import { RAGModule } from "./modules/ai/rag/rag.module";
// Content modules
import { CollectionsModule } from "./modules/content/collections/collections.module";
import { CommentsModule } from "./modules/content/comments/comments.module";
import { ExploreModule } from "./modules/content/explore/explore.module";
import { FeedModule } from "./modules/content/feed/feed.module";
import { NotesModule } from "./modules/content/notes/notes.module";
import { ReportsModule } from "./modules/content/reports/reports.module";
import { ResourcesModule } from "./modules/content/resources/resources.module";
import { WorkspaceModule } from "./modules/content/workspace/workspace.module";
// Data modules
import { BlogCollectionModule } from "./modules/data-services/blog-collection/blog-collection.module";
import { CrawlerModule } from "./modules/data-services/crawler/crawler.module";
import { DataCollectionModule } from "./modules/data-services/data-collection/data-collection.module";
import { DataManagementModule } from "./modules/data-services/data-management/data-management.module";
import { KnowledgeGraphModule } from "./modules/data-services/knowledge-graph/knowledge-graph.module";
import { RecommendationsModule } from "./modules/data-services/recommendations/recommendations.module";
// Integration modules
import { ProxyModule } from "./modules/integrations/proxy/proxy.module";
import { WechatWorkModule } from "./modules/integrations/wechat-work/wechat-work.module";
import { NotionModule } from "./modules/integrations/notion/notion.module";
import { GoogleDriveModule } from "./modules/integrations/google-drive/google-drive.module";
import { AiFileOrganizerModule } from "./modules/integrations/ai-file-organizer/ai-file-organizer.module";
// Export module
import { ExportModule } from "./modules/export";

@Module({
  imports: [
    // 配置模块
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
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

    // Core modules
    AuthModule,
    AdminModule,
    EmailModule,
    FeedbackModule,
    SettingsModule,
    StorageModule,
    CreditsModule,

    // AI modules (ai-* prefix)
    AiCoreModule,
    AiAgentsModule,
    AiAskModule,
    AiImageModule,
    AiOfficeModule,
    AiSimulationModule,
    AiStudioModule,
    AiTeamsModule,
    AiCodingModule,
    RAGModule,

    // Content modules
    CrawlerModule,
    ResourcesModule,
    FeedModule,
    CollectionsModule,
    NotesModule,
    CommentsModule,
    ReportsModule,
    ExploreModule,
    WorkspaceModule,

    // Data modules
    BlogCollectionModule,
    DataManagementModule,
    DataCollectionModule,
    KnowledgeGraphModule,
    RecommendationsModule,

    // Integration modules
    ProxyModule,
    WechatWorkModule,
    NotionModule,
    GoogleDriveModule,
    AiFileOrganizerModule,

    // Export module
    ExportModule,
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
