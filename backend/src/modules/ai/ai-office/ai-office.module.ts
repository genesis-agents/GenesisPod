import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { AiCoreModule } from "../ai-core/ai-core.module";
import { AiImageModule } from "../ai-image/ai-image.module";
import { StorageModule } from "../../core/storage/storage.module";
import { CreditsModule } from "../../credits/credits.module";

// Core
import { AIModelController, AIModelService, IntentParserService } from "./core";

// Document Management (CRUD)
import { DocumentsController, DocumentsService } from "./document-management";

// Generation
import { GenerationController, GenerationService } from "./generation";

// Slides (幻灯片生成)
import {
  SlidesController,
  SlidesOrchestratorService,
  SlidePlanningService,
  SlideContentService,
  SlideContentGeneratorService,
  SlideImageService,
  SlideRendererService,
  SlidesExportService,
  NaturalEditService,
  SlidesVersionService,
  TemplateMatcher,
  QualityCheckService,
  SourceAnalysisService,
  BatchOperationService,
} from "./slides";

// Integration
import { AiOfficeIntegrationService } from "./ai-office-integration.service";

// Code Execution
import {
  CodeExecutionController,
  CodeExecutionService,
} from "./code-execution";

// Docs (文档生成)
import { DocsOrchestratorService, DocsGeneratorService } from "./docs";

// Designer
import { DesignerOrchestratorService } from "./designer";

// Agents
import { AgentsController } from "./agents";

// Common (共享服务)
import {
  AIOfficeCommonModule,
  ContentAnalysisService,
  TemplateSelectionService,
  ImageMatchingService,
  ReadingExperienceService,
} from "./common";

@Module({
  imports: [
    HttpModule,
    ConfigModule,
    PrismaModule,
    AiCoreModule,
    AiImageModule,
    StorageModule,
    CreditsModule,
    AIOfficeCommonModule,
  ],
  controllers: [
    AIModelController,
    DocumentsController,
    GenerationController,
    SlidesController,
    CodeExecutionController,
    AgentsController,
  ],
  providers: [
    AIModelService,
    IntentParserService,
    DocumentsService,
    GenerationService,
    // Slides
    SlidesOrchestratorService,
    SlidePlanningService,
    SlideContentService,
    SlideContentGeneratorService,
    SlideImageService,
    SlideRendererService,
    SlidesExportService,
    NaturalEditService,
    SlidesVersionService,
    TemplateMatcher,
    QualityCheckService,
    SourceAnalysisService,
    BatchOperationService,
    // Docs
    DocsOrchestratorService,
    DocsGeneratorService,
    // Designer
    DesignerOrchestratorService,
    AiOfficeIntegrationService,
    CodeExecutionService,
  ],
  exports: [
    AIModelService,
    IntentParserService,
    DocumentsService,
    GenerationService,
    // Slides
    SlidesOrchestratorService,
    SlidePlanningService,
    SlideContentService,
    SlideContentGeneratorService,
    SlideImageService,
    SlideRendererService,
    SlidesExportService,
    NaturalEditService,
    SlidesVersionService,
    TemplateMatcher,
    QualityCheckService,
    SourceAnalysisService,
    BatchOperationService,
    // Docs
    DocsOrchestratorService,
    DocsGeneratorService,
    // Designer
    DesignerOrchestratorService,
    AiOfficeIntegrationService,
    // Common
    ContentAnalysisService,
    TemplateSelectionService,
    ImageMatchingService,
    ReadingExperienceService,
  ],
})
export class AiOfficeModule {}
