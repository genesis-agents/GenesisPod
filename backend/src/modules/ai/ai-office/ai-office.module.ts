import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { AiCoreModule } from "../ai-core/ai-core.module";
import { AiImageModule } from "../ai-image/ai-image.module";
import { StorageModule } from "../../core/storage/storage.module";
import { CreditsModule } from "../../credits/credits.module";
import { ExportModule } from "../../export/export.module";

// Core
import {
  AIModelController,
  AIModelService,
  IntentParserService,
  IntentParserController,
} from "./core";

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
  // 🆕 Phase 5 Services
  ContentAnalyzerService,
  TemplateSelectorService,
  LayoutAdjusterService,
} from "./slides";

// Slides v3.0 (新一代幻灯片引擎)
import {
  // Checkpoint
  CheckpointService,
  // Orchestrator
  MultiModelService,
  SlidesOrchestratorV3Service,
  SlidesV3Controller,
  // Skills
  TaskDecompositionSkill,
  OutlinePlanningSkill,
  PageTypeSelectionSkill,
  FourStepDesignSkill,
  ContentCompressionSkill,
  // Roles
  ArchitectService,
  WriterService,
  RendererService,
  ImageGeneratorService,
  ReviewerService,
} from "./slides/v3";

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

// Common (共享服务) - services are provided by AIOfficeCommonModule
import { AIOfficeCommonModule } from "./common";

@Module({
  imports: [
    HttpModule,
    ConfigModule,
    PrismaModule,
    AiCoreModule,
    AiImageModule,
    StorageModule,
    CreditsModule,
    ExportModule,
    AIOfficeCommonModule,
  ],
  controllers: [
    AIModelController,
    IntentParserController,
    DocumentsController,
    GenerationController,
    SlidesController,
    SlidesV3Controller, // 🆕 v3.0 Controller
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
    // 🆕 Phase 5 Services
    ContentAnalyzerService,
    TemplateSelectorService,
    LayoutAdjusterService,
    // 🆕 Slides v3.0 Services
    CheckpointService,
    MultiModelService,
    SlidesOrchestratorV3Service,
    TaskDecompositionSkill,
    OutlinePlanningSkill,
    PageTypeSelectionSkill,
    FourStepDesignSkill,
    ContentCompressionSkill,
    ArchitectService,
    WriterService,
    RendererService,
    ImageGeneratorService,
    ReviewerService,
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
    // 🆕 Phase 5 Services
    ContentAnalyzerService,
    TemplateSelectorService,
    LayoutAdjusterService,
    // 🆕 Slides v3.0 Services
    CheckpointService,
    MultiModelService,
    SlidesOrchestratorV3Service,
    ArchitectService,
    WriterService,
    RendererService,
    ImageGeneratorService,
    ReviewerService,
    // Docs
    DocsOrchestratorService,
    DocsGeneratorService,
    // Designer
    DesignerOrchestratorService,
    AiOfficeIntegrationService,
    // Common - re-export the module to make its services available
    AIOfficeCommonModule,
  ],
})
export class AiOfficeModule {}
