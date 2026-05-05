/**
 * E R4 Phase 2 (PR-E2, 2026-05-05): 用户自定义 Agent module
 *
 * imports AiEngineModule —— 拿 SkillRegistry / ToolRegistry / ModelRecommendationsService
 * 给 options() 端点（5 步向导拉选项）。
 */
import { Module, forwardRef } from "@nestjs/common";
import { PrismaModule } from "@/common/prisma/prisma.module";
import { AiEngineModule } from "@/modules/ai-engine/ai-engine.module";
import { CustomAgentsController } from "./custom-agents.controller";
import { CustomAgentsService } from "./custom-agents.service";

@Module({
  imports: [PrismaModule, forwardRef(() => AiEngineModule)],
  controllers: [CustomAgentsController],
  providers: [CustomAgentsService],
  exports: [CustomAgentsService],
})
export class CustomAgentsModule {}
