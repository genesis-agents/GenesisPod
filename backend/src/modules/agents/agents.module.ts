/**
 * Agents Module
 * Agent 矩阵系统的核心模块
 */

import { Module } from "@nestjs/common";
import { AgentsController } from "./agents.controller";
import { AgentsService } from "./agents.service";
import { AgentRegistry } from "./core/agent.registry";
import { ToolRegistry } from "./core/tool.registry";
import { AgentOrchestrator } from "./core/agent.orchestrator";

// 工具导入
// import { WebSearchTool } from './tools/web-search.tool';
// import { ImageGeneratorTool } from './tools/image-generator.tool';

// Agent 导入
// import { SlidesAgent } from './implementations/slides/slides.agent';
// import { DocsAgent } from './implementations/docs/docs.agent';
// import { DesignerAgent } from './implementations/designer/designer.agent';
// import { DeveloperAgent } from './implementations/developer/developer.agent';

@Module({
  controllers: [AgentsController],
  providers: [
    // 核心服务
    AgentsService,
    AgentRegistry,
    ToolRegistry,
    AgentOrchestrator,

    // 工具 (后续添加)
    // WebSearchTool,
    // ImageGeneratorTool,

    // Agents (后续添加)
    // SlidesAgent,
    // DocsAgent,
    // DesignerAgent,
    // DeveloperAgent,
  ],
  exports: [AgentsService, AgentRegistry, ToolRegistry, AgentOrchestrator],
})
export class AgentsModule {}
