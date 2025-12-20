/**
 * Content Processing Module
 *
 * 公共内容处理模块，提供：
 * 1. 内容提取 (URL、文件、视频字幕)
 * 2. 数据获取 (批量 URL 处理)
 *
 * 被以下模块使用：
 * - ai-office (PPT 生成、文档生成)
 * - ai-image (信息图生成)
 * - ai-teams (AI 团队研究)
 */

import { Module, Global } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { ConfigModule } from "@nestjs/config";
import { ContentExtractorService } from "./content-extractor.service";
import { DataFetchingService } from "./data-fetching.service";
import { MinerUService } from "./mineru.service";
import { ExploreModule } from "../../modules/content/explore/explore.module";
import { AdminModule } from "../../modules/core/admin/admin.module";

@Global()
@Module({
  imports: [
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),
    ConfigModule,
    ExploreModule,
    AdminModule,
  ],
  providers: [ContentExtractorService, DataFetchingService, MinerUService],
  exports: [ContentExtractorService, DataFetchingService, MinerUService],
})
export class ContentProcessingModule {}
