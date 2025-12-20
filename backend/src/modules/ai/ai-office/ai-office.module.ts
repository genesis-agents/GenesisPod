import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { AiCoreModule } from "../ai-core/ai-core.module";
import { AiImageModule } from "../ai-image/ai-image.module";
import { StorageModule } from "../../core/storage/storage.module";

// Core
import { AIModelController, AIModelService, IntentParserService } from "./core";

// Documents
import { DocumentsController, DocumentsService } from "./documents";

// Generation
import {
  GenerationController,
  GenerationService,
  QuickGenerateController,
  QuickGenerateService,
} from "./generation";

// Export
import { ExportController, ExportService } from "./export";

// PPT 3.0
import {
  PPTGenerationController,
  PPTOrchestratorService,
  SlidePlanningService,
  SlideContentService,
  SlideImageService,
  SlideRendererService,
  PPTExportService,
  NaturalEditService,
  PPTVersionService,
} from "./ppt";

// Integration
import { AiOfficeIntegrationService } from "./ai-office-integration.service";

@Module({
  imports: [
    HttpModule,
    ConfigModule,
    PrismaModule,
    AiCoreModule,
    AiImageModule, // 复用 AI-Image 模块的服务
    StorageModule, // R2 存储服务
  ],
  controllers: [
    // Core
    AIModelController,
    // Documents
    DocumentsController,
    // Generation
    GenerationController,
    QuickGenerateController,
    // Export
    ExportController,
    // PPT
    PPTGenerationController,
  ],
  providers: [
    // Core
    AIModelService,
    IntentParserService,
    // Documents
    DocumentsService,
    // Generation
    GenerationService,
    QuickGenerateService,
    // Export
    ExportService,
    // PPT
    PPTOrchestratorService,
    SlidePlanningService,
    SlideContentService,
    SlideImageService,
    SlideRendererService,
    PPTExportService,
    NaturalEditService,
    PPTVersionService,
    // Integration
    AiOfficeIntegrationService,
  ],
  exports: [
    // Core
    AIModelService,
    IntentParserService,
    // Documents
    DocumentsService,
    // Generation
    GenerationService,
    QuickGenerateService,
    // Export
    ExportService,
    // PPT
    PPTOrchestratorService,
    SlidePlanningService,
    SlideContentService,
    SlideImageService,
    SlideRendererService,
    PPTExportService,
    NaturalEditService,
    PPTVersionService,
    // Integration
    AiOfficeIntegrationService,
  ],
})
export class AiOfficeModule {}
