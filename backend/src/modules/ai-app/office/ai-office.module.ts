import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { AiEngineModule } from "../../ai-engine";
import { AiImageModule } from "../image/ai-image.module";
import { StorageModule } from "../../core/storage/storage.module";
import { CreditsModule } from "../../credits/credits.module";
import { ExportModule } from "../../../common/export/export.module";

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

// Slides (幻灯片生成) - v5.0: 使用 AI Teams Leader 协调模式
import {
  // Rendering (导出服务)
  SlidesExportService,
  ParameterizedRendererService,
  // Checkpoint
  CheckpointService,
  // Controller
  SlidesController,
  // Engine Service (v4.0: 核心服务)
  SlidesEngineService,
  // Skills Module (v4.0: 技能注册模块)
  SlidesSkillsModule,
  // v5.0: Team-based Orchestrator
  SlidesLeader,
  SlidesTeamMember,
  SlidesTeamOrchestrator,
  // Deprecated: Kept for backward compatibility during skill migration
  MultiModelService,
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
    AiEngineModule,
    AiImageModule,
    StorageModule,
    CreditsModule,
    ExportModule,
    AIOfficeCommonModule,
    SlidesSkillsModule, // v4.0: 注册 Slides 技能到 AI Engine
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
    // Slides Services (v5.0: Team-based Orchestrator)
    SlidesExportService,
    ParameterizedRendererService,
    CheckpointService,
    SlidesEngineService, // v4.0: 核心引擎服务
    SlidesLeader, // v5.0: Leader 角色
    SlidesTeamMember, // v5.0: 成员基类
    SlidesTeamOrchestrator, // v5.0: 主编排器
    MultiModelService, // @deprecated: Kept for skill compatibility during migration
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
    // Slides Services (v5.0: Team-based Orchestrator)
    SlidesExportService,
    ParameterizedRendererService,
    CheckpointService,
    SlidesEngineService,
    SlidesLeader, // v5.0: Leader 角色
    SlidesTeamMember, // v5.0: 成员基类
    SlidesTeamOrchestrator, // v5.0: 主编排器
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
