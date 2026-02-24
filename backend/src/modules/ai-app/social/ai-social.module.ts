import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AiSocialController } from "./ai-social.controller";
import { AiSocialService } from "./ai-social.service";
import { SocialLeaderService } from "./services/social-leader.service";
import { ContentFetcherService } from "./services/content-fetcher.service";
import { ContentTransformerService } from "./services/content-transformer.service";
import { ContentCheckerService } from "./services/content-checker.service";
import { ContentVersionService } from "./services/content-version.service";
import { ReviewService } from "./services/review.service";
import { PublishExecutorService } from "./services/publish-executor.service";
import { PlaywrightService } from "./services/playwright.service";
import { SessionHealthCheckScheduler } from "./services/session-health-check.scheduler";
import { WechatAdapter } from "./adapters/wechat.adapter";
import { XhsMcpAdapter } from "./adapters/xiaohongshu.adapter";
import { MCPClientService } from "./core/mcp-client.service";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { CacheModule } from "../../../common/cache/cache.module";
import { BrowserModule } from "../../../common/browser/browser.module";
import { AiEngineModule } from "../../ai-engine/ai-engine.module";
import { ExploreModule } from "../../content/explore/explore.module";
import { NotificationModule } from "../../core/notifications/notification.module";
import { CreditsModule } from "../../credits/credits.module";
import { YoutubeService } from "../../content/explore/youtube.service";
import { YOUTUBE_SERVICE_TOKEN } from "../../ai-engine/content-fetch";

@Module({
  imports: [
    PrismaModule,
    CacheModule,
    BrowserModule,
    AiEngineModule,
    ExploreModule,
    ConfigModule,
    NotificationModule,
    CreditsModule,
  ],
  controllers: [AiSocialController],
  providers: [
    // Bind YoutubeService to YOUTUBE_SERVICE_TOKEN for ContentFetchService (Engine)
    { provide: YOUTUBE_SERVICE_TOKEN, useExisting: YoutubeService },
    AiSocialService,
    SocialLeaderService,
    ContentFetcherService,
    ContentTransformerService,
    ContentCheckerService,
    ContentVersionService,
    ReviewService,
    PublishExecutorService,
    PlaywrightService,
    SessionHealthCheckScheduler,
    WechatAdapter,
    XhsMcpAdapter,
    // ★ MCP Client Service (refactored to use MCPManager)
    MCPClientService,
  ],
  exports: [AiSocialService],
})
export class AiSocialModule {}
