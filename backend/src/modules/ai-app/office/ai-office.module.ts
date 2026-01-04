import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { AiEngineModule } from "../../ai-engine";
import { AiImageModule } from "../image/ai-image.module";
import { StorageModule } from "../../core/storage/storage.module";
import { CreditsModule } from "../../credits/credits.module";
import { ExportModule } from "../../../common/export/export.module";

// Core (AIModelService 作为 Skills 后备，待迁移到 AI Engine)
import { AIModelController, AIModelService } from "./core";

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
  SlidesRepository,
  // Deprecated: Kept for backward compatibility during skill migration
  MultiModelService,
} from "./slides";

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
  controllers: [AIModelController, SlidesController, AgentsController],
  providers: [
    AIModelService,
    // Slides Services (v5.0: Team-based Orchestrator)
    SlidesExportService,
    ParameterizedRendererService,
    CheckpointService,
    SlidesEngineService, // v4.0: 核心引擎服务
    SlidesLeader, // v5.0: Leader 角色
    SlidesTeamMember, // v5.0: 成员基类
    SlidesTeamOrchestrator, // v5.0: 主编排器
    SlidesRepository, // v5.0: 持久化层
    MultiModelService, // @deprecated: Kept for skill compatibility during migration
  ],
  exports: [
    AIModelService,
    // Slides Services (v5.0: Team-based Orchestrator)
    SlidesExportService,
    ParameterizedRendererService,
    CheckpointService,
    SlidesEngineService,
    SlidesLeader,
    SlidesTeamMember,
    SlidesTeamOrchestrator,
    SlidesRepository,
    // Common - re-export the module to make its services available
    AIOfficeCommonModule,
  ],
})
export class AiOfficeModule {}
