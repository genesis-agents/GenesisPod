/**
 * MCP Server Module
 * 将 Raven AI Engine 暴露为 MCP Server
 * 让外部 AI 工具（Claude Code、Cursor 等）调用 Raven 能力
 */

import { Module, OnModuleInit } from "@nestjs/common";
import { MCPServerController } from "./mcp-server.controller";
import { MCPServerService } from "./mcp-server.service";
import { MCPApiKeyGuard } from "./guards/mcp-api-key.guard";
import { ResearchToolHandler } from "./tools/research-tool-handler";
import { AskToolHandler } from "./tools/ask-tool-handler";
import { TeamsDebateToolHandler } from "./tools/teams-tool-handler";
import { SecretsModule } from "../core/secrets/secrets.module";
import { AiEngineConstraintModule } from "../ai-engine/ai-engine-constraint.module";

@Module({
  imports: [SecretsModule, AiEngineConstraintModule],
  controllers: [MCPServerController],
  providers: [
    MCPServerService,
    MCPApiKeyGuard,
    ResearchToolHandler,
    AskToolHandler,
    TeamsDebateToolHandler,
  ],
  exports: [MCPServerService],
})
export class MCPServerModule implements OnModuleInit {
  constructor(
    private readonly mcpServerService: MCPServerService,
    private readonly researchToolHandler: ResearchToolHandler,
    private readonly askToolHandler: AskToolHandler,
    private readonly teamsDebateToolHandler: TeamsDebateToolHandler,
  ) {}

  onModuleInit() {
    // Register all tool handlers
    this.mcpServerService.registerToolHandler(this.researchToolHandler);
    this.mcpServerService.registerToolHandler(this.askToolHandler);
    this.mcpServerService.registerToolHandler(this.teamsDebateToolHandler);
  }
}
