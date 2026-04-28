import { Module } from "@nestjs/common";
import { ContentProcessingModule } from "../../../../common/content-processing/content-processing.module";
import {
  ContentFetchService,
  YOUTUBE_SERVICE_TOKEN,
} from "./content-fetch.service";
import { YoutubeService } from "./youtube.service";

/**
 * ContentFetchModule
 *
 * PR-X11: YoutubeService 已搬到 engine/content/fetch（与本模块同位置），
 * 不再 import ai-app/explore（消除 engine → app 反向依赖）。
 */
@Module({
  imports: [ContentProcessingModule],
  providers: [
    ContentFetchService,
    YoutubeService,
    { provide: YOUTUBE_SERVICE_TOKEN, useExisting: YoutubeService },
  ],
  exports: [ContentFetchService, YoutubeService],
})
export class ContentFetchModule {}
