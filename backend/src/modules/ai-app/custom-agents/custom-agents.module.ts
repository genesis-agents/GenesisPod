/**
 * E R4 Phase 2 (PR-E2 2026-05-05) + R-CA (2026-05-05): 用户自定义 Agent module
 *
 * imports:
 *   - AiEngineModule —— SkillRegistry / ToolRegistry / ModelRecommendationsService（options 端点用）
 *   - AgentPlaygroundModule (forwardRef) —— PlaygroundPipelineDispatcher / MissionStore（R-CA launch + missions endpoint 用）
 *
 * R-CA: launches 表追踪 "我用这个 agent 跑过哪些 mission"，让 /custom-agents/:id 主页
 *        能展示 mission 网格（与 Playground 主页同 UI 但 scope 限定到该 agent）。
 */
import { Module, forwardRef } from "@nestjs/common";
import { PrismaModule } from "@/common/prisma/prisma.module";
import { AiEngineModule } from "@/modules/ai-engine/ai-engine.module";
import { AgentPlaygroundModule } from "@/modules/ai-app/agent-playground/module/agent-playground.module";
import { CustomAgentsController } from "./custom-agents.controller";
import { CustomAgentsService } from "./custom-agents.service";
import { CustomAgentLaunchesService } from "./custom-agent-launches.service";

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => AiEngineModule),
    forwardRef(() => AgentPlaygroundModule),
  ],
  controllers: [CustomAgentsController],
  providers: [CustomAgentsService, CustomAgentLaunchesService],
  exports: [CustomAgentsService],
})
export class CustomAgentsModule {}
