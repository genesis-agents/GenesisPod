import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { AiCoreModule } from "../ai-core/ai-core.module";
import { AiImageModule } from "../ai-image/ai-image.module";
import { StorageModule } from "../../core/storage/storage.module";

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
import { IntentParserService } from "./intent-parser.service";

// PPT 3.0 新服务
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
    IntentParserService,
    // PPT 3.0 服务
    PPTOrchestratorService,
    SlidePlanningService,
    SlideContentService,
    SlideImageService,
    SlideRendererService,
    PPTExportService,
    NaturalEditService,
    PPTVersionService,
  ],
  exports: [
    QuickGenerateService,
    OfficeDocumentService,
    AIModelService,
    DocumentGenerationService,
    DocumentExportService,
    IntentParserService,
    // PPT 3.0 服务
    PPTOrchestratorService,
    SlidePlanningService,
    SlideContentService,
    SlideImageService,
    SlideRendererService,
    PPTExportService,
    NaturalEditService,
    PPTVersionService,
  ],
})
export class AiOfficeModule {}
