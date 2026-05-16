import { Logger, Module, OnModuleInit } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AiSocialController } from "./ai-social.controller";
import { AiSocialService } from "./ai-social.service";
import { SocialLeaderService } from "./services/social-leader.service";
import { ContentFetcherService } from "./services/content-fetcher.service";
import { ContentTransformerService as LegacyContentTransformerService } from "./services/content-transformer.service";
import { ContentCheckerService } from "./services/content-checker.service";
import { ContentVersionService } from "./services/content-version.service";
import { ReviewService } from "./services/review.service";
import { PublishExecutorService } from "./services/publish-executor.service";
import { SocialBrowserService } from "./services/social-browser.service";
import { SessionHealthCheckScheduler } from "./services/session-health-check.scheduler";
import { PublishSchedulerService } from "./services/publish-scheduler.service";
import { WechatAdapter } from "./adapters/wechat.adapter";
import { XhsMcpAdapter } from "./adapters/xiaohongshu.adapter";
import { MCPClientService } from "./core/mcp-client.service";
import { WechatArticleFormatterService } from "./services/wechat-article-formatter.service";
import { WechatImageUploaderService } from "./services/wechat-image-uploader.service";
import { SocialPublishAdapter } from "./engine-bridge/social-publish.adapter";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { CacheModule } from "../../../common/cache/cache.module";
import { BrowserModule } from "../../../common/browser/browser.module";
import { AiEngineModule } from "../../ai-engine/ai-engine.module";
import { ExploreModule } from "../explore/explore.module";
import { NotificationModule } from "../../ai-infra/notifications/notification.module";
import { CreditsModule } from "../../ai-infra/credits/credits.module";
import { initSessionCrypto } from "./utils/session-crypto";

// ★ W4 PR-3b/3c/4: SocialPublishMission Agent Team
import {
  SocialAgentInvoker,
  LeaderService as MissionLeaderService,
  StewardService,
  PlatformProbeService,
  ContentTransformerService as MissionContentTransformerService,
  CoverArtistService,
  ComposerService,
  PolishReviewerService,
  PublishExecutorAgentService,
  PublishVerifierService,
} from "./services/roles";
import { SocialPipelineDispatcher } from "./services/mission/workflow/social-pipeline-dispatcher.service";

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
    AiSocialService,
    SocialLeaderService,
    ContentFetcherService,
    LegacyContentTransformerService,
    ContentCheckerService,
    ContentVersionService,
    ReviewService,
    PublishExecutorService,
    SocialBrowserService,
    SessionHealthCheckScheduler,
    PublishSchedulerService,
    WechatAdapter,
    XhsMcpAdapter,
    // ★ MCP Client Service (refactored to use MCPManager)
    MCPClientService,
    WechatArticleFormatterService,
    WechatImageUploaderService,
    // ★ engine 反转端口实现
    SocialPublishAdapter,

    // ★ W4 SocialPublishMission Agent Team (PR-3b/3c/4) —— 新轨；
    //   PR-5 才会通过 ai-social.controller 暴露 /mission/run 端点切流量
    SocialAgentInvoker,
    MissionLeaderService,
    StewardService,
    PlatformProbeService,
    MissionContentTransformerService,
    CoverArtistService,
    ComposerService,
    PolishReviewerService,
    PublishExecutorAgentService,
    PublishVerifierService,
    SocialPipelineDispatcher,
  ],
  exports: [AiSocialService, SocialPublishAdapter, SocialPipelineDispatcher],
})
export class AiSocialModule implements OnModuleInit {
  private readonly logger = new Logger(AiSocialModule.name);

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const key = this.configService.get<string>("SESSION_ENCRYPTION_KEY");
    if (key) {
      initSessionCrypto(key);
      this.logger.log("Session encryption initialized");
    } else if (process.env.NODE_ENV === "production") {
      this.logger.error(
        "SESSION_ENCRYPTION_KEY not set. " +
          "WeChat login sessions cannot be encrypted. " +
          "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
      );
    } else {
      this.logger.warn(
        "SESSION_ENCRYPTION_KEY not set, using development fallback key",
      );
    }
  }
}
