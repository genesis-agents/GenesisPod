/**
 * Content Processing Module
 *
 * 公共内容处理模块，提供：
 * 1. 内容提取 (URL、文件、视频字幕)
 * 2. 数据获取 (批量 URL 处理)
 * 3. Web 内容提取 (Jina AI, Firecrawl, Tavily)
 * 4. URL 解析 (类型识别、元数据提取、SSRF 防护)
 *
 * 被以下模块使用：
 * - ai-office (PPT 生成、文档生成)
 * - ai-image (信息图生成)
 * - ai-teams (AI 团队研究)
 * - ai-studio (深度研究)
 */

import { Module, Global, forwardRef } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { ConfigModule } from "@nestjs/config";
import { ContentExtractorService } from "./content-extractor.service";
import { DataFetchingService } from "./data-fetching.service";
import { MinerUService } from "./mineru.service";
import { WebContentExtractionService } from "./web-content-extraction.service";
import { UrlParserService } from "./url-parser.service";
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
    forwardRef(() => ExploreModule),
    forwardRef(() => AdminModule),
  ],
  providers: [
    ContentExtractorService,
    DataFetchingService,
    MinerUService,
    WebContentExtractionService,
    UrlParserService,
  ],
  exports: [
    ContentExtractorService,
    DataFetchingService,
    MinerUService,
    WebContentExtractionService,
    UrlParserService,
  ],
})
export class ContentProcessingModule {}
