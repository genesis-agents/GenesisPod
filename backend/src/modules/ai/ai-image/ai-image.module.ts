import { Module, forwardRef } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { MulterModule } from "@nestjs/platform-express";
import { AiImageController } from "./ai-image.controller";
import { AiImageService } from "./ai-image.service";
import { AiImageAnalyticsService } from "./ai-image-analytics.service";
import { InfographicTemplateService } from "./infographic-template.service";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { StorageModule } from "../../core/storage/storage.module";
// DeepDive Engine v2.1 新增服务和控制器
import { AgentExecutorService } from "./agent-executor.service";
import { BrandKitService } from "./brand-kit.service";
import { BrandKitController } from "./brand-kit.controller";
import { ExportService } from "./export.service";
import { ExportController } from "./export.controller";
import { AiCoreModule } from "../ai-core/ai-core.module";
import { AiOfficeModule } from "../ai-office/ai-office.module";

@Module({
  imports: [
    PrismaModule,
    HttpModule,
    // ContentProcessingModule 是 @Global()，YoutubeModule 和 AdminModule 已通过它提供
    StorageModule, // R2 图片存储
    MulterModule.register({
      limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    }),
    AiCoreModule,
    forwardRef(() => AiOfficeModule),
  ],
  controllers: [
    AiImageController,
    // DeepDive Engine v2.1 新增
    BrandKitController,
    ExportController,
  ],
  providers: [
    AiImageService,
    AiImageAnalyticsService,
    InfographicTemplateService,
    // DeepDive Engine v2.1 新增
    AgentExecutorService,
    BrandKitService,
    ExportService,
  ],
  exports: [
    AiImageService,
    AiImageAnalyticsService,
    InfographicTemplateService,
    // DeepDive Engine v2.1 新增
    AgentExecutorService,
    BrandKitService,
    ExportService,
  ],
})
export class AiImageModule {}
