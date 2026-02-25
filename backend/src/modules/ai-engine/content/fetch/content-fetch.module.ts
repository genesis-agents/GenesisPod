import { Module } from "@nestjs/common";
import { ContentProcessingModule } from "../../../../common/content-processing/content-processing.module";
import { ContentFetchService } from "./content-fetch.service";

/**
 * ContentFetchModule
 *
 * YoutubeService 通过 YOUTUBE_SERVICE_TOKEN 可选注入，
 * 由消费方模块（如 AiEngineModule）负责提供 provider 绑定，
 * 避免直接导入 ExploreModule 引起循环依赖。
 */
@Module({
  imports: [ContentProcessingModule],
  providers: [ContentFetchService],
  exports: [ContentFetchService],
})
export class ContentFetchModule {}
