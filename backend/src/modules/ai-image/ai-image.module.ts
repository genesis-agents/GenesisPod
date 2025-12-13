import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { MulterModule } from "@nestjs/platform-express";
import { AiImageController } from "./ai-image.controller";
import { AiImageService } from "./ai-image.service";
import { InfographicTemplateService } from "./infographic-template.service";
import { PrismaModule } from "../../common/prisma/prisma.module";
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
    // ContentProcessingModule 是 @Global()，YoutubeModule 和 AdminModule 已通过它提供
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
    InfographicTemplateService,
    // DeepDive Engine v2.1 新增
    AgentExecutorService,
    BrandKitService,
    ExportService,
  ],
  exports: [
    AiImageService,
    InfographicTemplateService,
    // DeepDive Engine v2.1 新增
    AgentExecutorService,
    BrandKitService,
    ExportService,
  ],
})
export class AiImageModule {}
