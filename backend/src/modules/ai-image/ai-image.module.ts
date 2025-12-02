import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { MulterModule } from "@nestjs/platform-express";
import { AiImageController } from "./ai-image.controller";
import { AiImageService } from "./ai-image.service";
import { ContentExtractorService } from "./content-extractor.service";
import { InfographicTemplateService } from "./infographic-template.service";
import { DataFetchingService } from "./data-fetching.service";
import { PrismaModule } from "../../common/prisma/prisma.module";
import { YoutubeModule } from "../youtube/youtube.module";
import { AdminModule } from "../admin/admin.module";
import { StorageModule } from "../storage/storage.module";
// DeepDive Engine v2.1 新增服务和控制器
import { AgentExecutorService } from "./agent-executor.service";
import { BrandKitService } from "./brand-kit.service";
import { BrandKitController } from "./brand-kit.controller";
import { ExportService } from "./export.service";
import { ExportController } from "./export.controller";

@Module({
  imports: [
    PrismaModule,
    HttpModule,
    YoutubeModule, // 复用 YoutubeService 提取字幕
    AdminModule, // 用于从数据库获取搜索 API 配置
    StorageModule, // R2 图片存储
    MulterModule.register({
      limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    }),
  ],
  controllers: [
    AiImageController,
    // DeepDive Engine v2.1 新增
    BrandKitController,
    ExportController,
  ],
  providers: [
    AiImageService,
    ContentExtractorService,
    InfographicTemplateService,
    DataFetchingService,
    // DeepDive Engine v2.1 新增
    AgentExecutorService,
    BrandKitService,
    ExportService,
  ],
  exports: [
    AiImageService,
    ContentExtractorService,
    InfographicTemplateService,
    DataFetchingService,
    // DeepDive Engine v2.1 新增
    AgentExecutorService,
    BrandKitService,
    ExportService,
  ],
})
export class AiImageModule {}
