import { Module } from "@nestjs/common";
import { ContentProcessingModule } from "../../../../common/content-processing/content-processing.module";
import {
  ContentFetchService,
  YOUTUBE_SERVICE_TOKEN,
} from "./content-fetch.service";
import { ExploreModule } from "../../../ai-app/explore/explore.module";
import { YoutubeService } from "../../../ai-app/explore/youtube.service";

/**
 * ContentFetchModule
 *
 * YoutubeService 通过 YOUTUBE_SERVICE_TOKEN 注入。
 * ExploreModule 不依赖 AI Engine，因此可以安全导入（无循环依赖）。
 */
@Module({
  imports: [ContentProcessingModule, ExploreModule],
  providers: [
    ContentFetchService,
    { provide: YOUTUBE_SERVICE_TOKEN, useExisting: YoutubeService },
  ],
  exports: [ContentFetchService],
})
export class ContentFetchModule {}
