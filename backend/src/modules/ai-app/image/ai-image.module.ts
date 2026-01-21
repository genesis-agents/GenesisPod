import { Module, forwardRef } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { MulterModule } from "@nestjs/platform-express";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { StorageModule } from "../../core/storage/storage.module";
import { AiOfficeModule } from "../office/ai-office.module";
// 直接从文件导入，避免 barrel export 循环依赖
import { AiEngineModule } from "../../ai-engine/ai-engine.module";

// Generation
import {
  GenerationController,
  GenerationService,
  ImageGenerationService,
  PromptEnhancementService,
  Imagen4PromptService,
} from "./generation";

// Storage
import { StorageService } from "./storage";

// Export
import { ExportController, ExportService } from "./export";

// Brand Kit
import { BrandKitController, BrandKitService } from "./brand-kit";

// Infographic
import { InfographicService } from "./infographic";

// Analytics
import { AnalyticsService, AgentExecutorService } from "./analytics";

@Module({
  imports: [
    PrismaModule,
    HttpModule,
    StorageModule,
    MulterModule.register({
      limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    }),
    // 使用 forwardRef 打破循环依赖: AiImageModule ↔ AiEngineModule
    forwardRef(() => AiEngineModule),
    forwardRef(() => AiOfficeModule),
  ],
  controllers: [GenerationController, BrandKitController, ExportController],
  providers: [
    // Generation
    GenerationService,
    ImageGenerationService,
    PromptEnhancementService,
    Imagen4PromptService,
    // Storage
    StorageService,
    // Export
    ExportService,
    // Brand Kit
    BrandKitService,
    // Infographic
    InfographicService,
    // Analytics
    AnalyticsService,
    AgentExecutorService,
  ],
  exports: [
    // Generation
    GenerationService,
    ImageGenerationService,
    PromptEnhancementService,
    // Storage
    StorageService,
    // Export
    ExportService,
    // Brand Kit
    BrandKitService,
    // Infographic
    InfographicService,
    // Analytics
    AnalyticsService,
    AgentExecutorService,
  ],
})
export class AiImageModule {}
