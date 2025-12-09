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
import { DocsAgent } from "./implementations/docs/docs.agent";
import { DesignerAgent } from "./implementations/designer/designer.agent";

// 依赖模块 - 复用现有的 ai-office 和 ai-image 模块
import { AiOfficeModule } from "../ai-office/ai-office.module";
import { AiImageModule } from "../ai-image/ai-image.module";

@Module({
  imports: [AiOfficeModule, AiImageModule],
  controllers: [AgentsController],
  providers: [
    // 核心服务
    AgentsService,
    AgentRegistry,
    ToolRegistry,
    AgentOrchestrator,

    // Agents
    SlidesAgent,
    DocsAgent,
    DesignerAgent,
  ],
  exports: [AgentsService, AgentRegistry, ToolRegistry, AgentOrchestrator],
})
export class AgentsModule implements OnModuleInit {
  constructor(
    private readonly agentRegistry: AgentRegistry,
    private readonly slidesAgent: SlidesAgent,
    private readonly docsAgent: DocsAgent,
    private readonly designerAgent: DesignerAgent,
  ) {}

  onModuleInit() {
    // 注册 Agents
    this.agentRegistry.register(this.slidesAgent);
    this.agentRegistry.register(this.docsAgent);
    this.agentRegistry.register(this.designerAgent);
  }
}
