import { Module } from "@nestjs/common";
import { AiSocialController } from "./ai-social.controller";
import { AiSocialService } from "./ai-social.service";
import { SocialLeaderService } from "./services/social-leader.service";
import { ContentFetcherService } from "./services/content-fetcher.service";
import { ContentTransformerService } from "./services/content-transformer.service";
import { ContentCheckerService } from "./services/content-checker.service";
import { ReviewService } from "./services/review.service";
import { PublishExecutorService } from "./services/publish-executor.service";
import { PlaywrightService } from "./services/playwright.service";
import { WechatAdapter } from "./adapters/wechat.adapter";
import { XiaohongshuAdapter } from "./adapters/xiaohongshu.adapter";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { AiEngineModule } from "../../ai-engine/ai-engine.module";

@Module({
  imports: [PrismaModule, AiEngineModule],
  controllers: [AiSocialController],
  providers: [
    AiSocialService,
    SocialLeaderService,
    ContentFetcherService,
    ContentTransformerService,
    ContentCheckerService,
    ReviewService,
    PublishExecutorService,
    PlaywrightService,
    WechatAdapter,
    XiaohongshuAdapter,
  ],
  exports: [AiSocialService],
})
export class AiSocialModule {}
