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
import { CrawlerModule } from "./modules/crawler/crawler.module";
import { ResourcesModule } from "./modules/resources/resources.module";
import { FeedModule } from "./modules/feed/feed.module";
import { KnowledgeGraphModule } from "./modules/knowledge-graph/knowledge-graph.module";
import { ProxyModule } from "./modules/proxy/proxy.module";
import { RecommendationsModule } from "./modules/recommendations/recommendations.module";
import { AuthModule } from "./modules/auth/auth.module";
import { CollectionsModule } from "./modules/collections/collections.module";
import { NotesModule } from "./modules/notes/notes.module";
import { CommentsModule } from "./modules/comments/comments.module";
import { ReportsModule } from "./modules/reports/reports.module";
import { YoutubeVideosModule } from "./modules/youtube-videos/youtube-videos.module";
import { YoutubeModule } from "./modules/youtube/youtube.module";
import { WorkspaceModule } from "./modules/workspace/workspace.module";
import { AiModule } from "./modules/ai/ai.module";
import { BlogCollectionModule } from "./modules/blog-collection/blog-collection.module";
import { DataManagementModule } from "./modules/data-management/data-management.module";
import { AiOfficeModule } from "./modules/ai-office/ai-office.module";
import { DataCollectionModule } from "./modules/data-collection/data-collection.module";
import { AdminModule } from "./modules/admin/admin.module";
import { AiGroupModule } from "./modules/ai-group/ai-group.module";
import { WechatWorkModule } from "./modules/wechat-work/wechat-work.module";
import { AiStudioModule } from "./modules/ai-studio/ai-studio.module";
import { AiImageModule } from "./modules/ai-image/ai-image.module";
import { StorageModule } from "./modules/storage/storage.module";
import { AskSessionModule } from "./modules/ask-session/ask-session.module";

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

    // 功能模块
    CrawlerModule,
    ResourcesModule,
    FeedModule,
    KnowledgeGraphModule,
    ProxyModule,
    RecommendationsModule,
    AuthModule,
    CollectionsModule,
    NotesModule,
    CommentsModule,
    ReportsModule,
    YoutubeModule,
    YoutubeVideosModule,
    WorkspaceModule,
    AiModule,
    BlogCollectionModule,
    DataManagementModule,
    AiOfficeModule,
    DataCollectionModule,
    AdminModule,
    AiGroupModule,
    WechatWorkModule,
    AiStudioModule,
    AiImageModule,
    StorageModule,
    AskSessionModule,
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
