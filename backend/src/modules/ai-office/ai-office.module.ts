import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "../../common/prisma/prisma.module";
import { AiModule } from "../ai/ai.module";
import { AiImageModule } from "../ai-image/ai-image.module";
import { StorageModule } from "../storage/storage.module";

// 原有服务
import { QuickGenerateController } from "./quick-generate.controller";
import { QuickGenerateService } from "./quick-generate.service";
import { OfficeDocumentController } from "./office-document.controller";
import { OfficeDocumentService } from "./office-document.service";
import { AIModelController } from "./ai-model.controller";
import { AIModelService } from "./ai-model.service";
import { DocumentGenerationController } from "./document-generation.controller";
import { DocumentGenerationService } from "./document-generation.service";
import { DocumentExportController } from "./document-export.controller";
import { DocumentExportService } from "./document-export.service";

// PPT 3.0 新服务
import {
  PPTGenerationController,
  PPTOrchestratorService,
  SlidePlanningService,
  SlideContentService,
  SlideImageService,
  SlideRendererService,
} from "./ppt";

@Module({
  imports: [
    HttpModule,
    ConfigModule,
    PrismaModule,
    AiModule,
    AiImageModule, // 复用 AI-Image 模块的服务
    StorageModule, // R2 存储服务
  ],
  controllers: [
    QuickGenerateController,
    OfficeDocumentController,
    AIModelController,
    DocumentGenerationController,
    DocumentExportController,
    // PPT 3.0
    PPTGenerationController,
  ],
  providers: [
    QuickGenerateService,
    OfficeDocumentService,
    AIModelService,
    DocumentGenerationService,
    DocumentExportService,
    // PPT 3.0 服务
    PPTOrchestratorService,
    SlidePlanningService,
    SlideContentService,
    SlideImageService,
    SlideRendererService,
  ],
  exports: [
    QuickGenerateService,
    OfficeDocumentService,
    AIModelService,
    DocumentGenerationService,
    DocumentExportService,
    // PPT 3.0 服务
    PPTOrchestratorService,
    SlidePlanningService,
    SlideContentService,
    SlideImageService,
    SlideRendererService,
  ],
})
export class AiOfficeModule {}
