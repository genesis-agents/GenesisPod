import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { AiCoreModule } from "../ai-core/ai-core.module";
import { AiEngineModule } from "../ai-engine";
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
  // Rendering (导出服务)
  SlidesExportService,
  ParameterizedRendererService, // v4.0: 参数化渲染器
  // Checkpoint
  CheckpointService,
  // Orchestrator
  MultiModelService,
  SlidesOrchestratorService,
  SlidesController,
  // Team 协作
  SlidesTeamOrchestratorService,
  SlidesTeamAgent,
  // Skills
  TaskDecompositionSkill,
  OutlinePlanningSkill,
  PageTypeSelectionSkill,
  FourStepDesignSkill,
  ContentCompressionSkill,
  DataSupplementSkill,
  TemplateRenderingSkill,
  ChartRendererSkill,
  ImageFetcherSkill,
  QualityAuditSkill,
  ContentAnalyzerSkill, // v4.0: 内容分析技能
  LayoutOptimizerSkill, // v4.0: 布局优化技能
  // Roles
  ArchitectService,
  WriterService,
  RendererService,
  ImageGeneratorService,
  ReviewerService,
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

// Common (共享服务) - services are provided by AIOfficeCommonModule
import { AIOfficeCommonModule } from "./common";

@Module({
  imports: [
    HttpModule,
    ConfigModule,
    PrismaModule,
    AiCoreModule,
    AiEngineModule,
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
    CodeExecutionController,
    AgentsController,
  ],
  providers: [
    AIModelService,
    IntentParserService,
    DocumentsService,
    GenerationService,
    // Slides Services
    SlidesExportService,
    ParameterizedRendererService, // v4.0
    CheckpointService,
    MultiModelService,
    SlidesOrchestratorService,
    // Team 协作
    SlidesTeamOrchestratorService,
    SlidesTeamAgent,
    // Skills
    TaskDecompositionSkill,
    OutlinePlanningSkill,
    PageTypeSelectionSkill,
    FourStepDesignSkill,
    ContentCompressionSkill,
    DataSupplementSkill,
    TemplateRenderingSkill,
    ChartRendererSkill,
    ImageFetcherSkill,
    QualityAuditSkill,
    ContentAnalyzerSkill, // v4.0
    LayoutOptimizerSkill, // v4.0
    // Roles
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
    // Slides Services
    SlidesExportService,
    ParameterizedRendererService, // v4.0
    ContentAnalyzerSkill, // v4.0
    LayoutOptimizerSkill, // v4.0
    CheckpointService,
    MultiModelService,
    SlidesOrchestratorService,
    // Roles
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
