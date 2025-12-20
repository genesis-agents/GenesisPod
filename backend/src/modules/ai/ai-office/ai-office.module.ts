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

// Code Execution
import {
  CodeExecutionController,
  CodeExecutionService,
} from "./code-execution";

// Docs
import { DocsOrchestratorService } from "./docs";

// Designer
import { DesignerOrchestratorService } from "./designer";

// Agents
import { AgentsController } from "./agents";

@Module({
  imports: [
    HttpModule,
    ConfigModule,
    PrismaModule,
    AiCoreModule,
    AiImageModule,
    StorageModule,
  ],
  controllers: [
    AIModelController,
    DocumentsController,
    GenerationController,
    QuickGenerateController,
    ExportController,
    PPTGenerationController,
    CodeExecutionController,
    AgentsController,
  ],
  providers: [
    AIModelService,
    IntentParserService,
    DocumentsService,
    GenerationService,
    QuickGenerateService,
    ExportService,
    PPTOrchestratorService,
    SlidePlanningService,
    SlideContentService,
    SlideImageService,
    SlideRendererService,
    PPTExportService,
    NaturalEditService,
    PPTVersionService,
    DocsOrchestratorService,
    DesignerOrchestratorService,
    AiOfficeIntegrationService,
    CodeExecutionService,
  ],
  exports: [
    AIModelService,
    IntentParserService,
    DocumentsService,
    GenerationService,
    QuickGenerateService,
    ExportService,
    PPTOrchestratorService,
    SlidePlanningService,
    SlideContentService,
    SlideImageService,
    SlideRendererService,
    PPTExportService,
    NaturalEditService,
    PPTVersionService,
    DocsOrchestratorService,
    DesignerOrchestratorService,
    AiOfficeIntegrationService,
  ],
})
export class AiOfficeModule {}
