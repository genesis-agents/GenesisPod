/**
 * Agents Module
 * Agent 矩阵系统的核心模块
 */

import { Module, OnModuleInit } from "@nestjs/common";
import { AgentsController } from "./agents.controller";
import { AgentsService } from "./agents.service";
import { AgentRegistry } from "./core/agent.registry";
import { ToolRegistry } from "./core/tool.registry";
import { AgentOrchestrator } from "./core/agent.orchestrator";

// Agent 导入
import { SlidesAgent } from "./implementations/slides/slides.agent";

// 依赖模块 - 复用现有的 ai-office 模块
import { AiOfficeModule } from "../ai-office/ai-office.module";

@Module({
  imports: [AiOfficeModule],
  controllers: [AgentsController],
  providers: [
    // 核心服务
    AgentsService,
    AgentRegistry,
    ToolRegistry,
    AgentOrchestrator,

    // Agents
    SlidesAgent,
  ],
  exports: [AgentsService, AgentRegistry, ToolRegistry, AgentOrchestrator],
})
export class AgentsModule implements OnModuleInit {
  constructor(
    private readonly agentRegistry: AgentRegistry,
    private readonly slidesAgent: SlidesAgent,
  ) {}

  onModuleInit() {
    // 注册 Agents
    this.agentRegistry.register(this.slidesAgent);
  }
}
