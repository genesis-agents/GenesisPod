/**
 * MCP Resource Provider
 *
 * 将 Raven 的知识库和内部数据暴露为 MCP Resources，
 * 让外部 AI 工具（Claude Code、Cursor 等）可以读取 Raven 管理的内容。
 *
 * 资源 URI 规范:
 * - raven://capabilities         → 能力摘要
 * - raven://tools                → 工具列表
 * - raven://skills               → 技能列表
 * - raven://agents               → Agent 列表
 * - raven://teams                → Team 配置列表
 * - raven://models               → 可用模型列表
 */

import { Injectable, Logger, Optional } from "@nestjs/common";
import {
  IMCPResourceProvider,
  MCPResource,
  MCPResourceContent,
} from "../abstractions/mcp-server.interface";
import { ToolRegistry } from "../../ai-engine/tools/registry/tool-registry";
import { SkillRegistry } from "../../ai-engine/skills/registry/skill-registry";
import { AgentRegistry } from "../../ai-engine/agents/registry/agent-registry";
import { TeamRegistry } from "../../ai-engine/teams/registry/team-registry";
import { AIEngineFacade } from "../../ai-engine/facade/ai-engine.facade";
import { APP_CONFIG } from "../../../common/config/app.config";

@Injectable()
export class MCPResourceProvider implements IMCPResourceProvider {
  private readonly logger = new Logger(MCPResourceProvider.name);

  constructor(
    private readonly facade: AIEngineFacade,
    @Optional() private readonly toolRegistry?: ToolRegistry,
    @Optional() private readonly skillRegistry?: SkillRegistry,
    @Optional() private readonly agentRegistry?: AgentRegistry,
    @Optional() private readonly teamRegistry?: TeamRegistry,
  ) {}

  async listResources(): Promise<MCPResource[]> {
    const resources: MCPResource[] = [
      {
        uri: "raven://capabilities",
        name: `${APP_CONFIG.brand.fullName} Capabilities`,
        description:
          "Overview of all available AI capabilities, tools, skills, and agents",
        mimeType: "application/json",
      },
      {
        uri: "raven://tools",
        name: "Available Tools",
        description:
          "List of all registered tools with their schemas and categories",
        mimeType: "application/json",
      },
      {
        uri: "raven://skills",
        name: "Available Skills",
        description:
          "List of all registered skills organized by domain and layer",
        mimeType: "application/json",
      },
      {
        uri: "raven://agents",
        name: "Available Agents",
        description: "List of all registered agents with their capabilities",
        mimeType: "application/json",
      },
      {
        uri: "raven://teams",
        name: "Team Configurations",
        description:
          "Available team configurations for multi-agent collaboration",
        mimeType: "application/json",
      },
      {
        uri: "raven://models",
        name: "Available AI Models",
        description: "List of all configured and available AI models",
        mimeType: "application/json",
      },
    ];

    return resources;
  }

  async readResource(uri: string): Promise<MCPResourceContent> {
    this.logger.log(`Reading resource: ${uri}`);

    try {
      switch (uri) {
        case "raven://capabilities":
          return this.readCapabilities();
        case "raven://tools":
          return this.readTools();
        case "raven://skills":
          return this.readSkills();
        case "raven://agents":
          return this.readAgents();
        case "raven://teams":
          return this.readTeams();
        case "raven://models":
          return this.readModels();
        default:
          return {
            uri,
            mimeType: "application/json",
            text: JSON.stringify({ error: "Resource not found" }),
          };
      }
    } catch (error) {
      this.logger.error(
        `Failed to read resource ${uri}: ${(error as Error).message}`,
      );
      return {
        uri,
        mimeType: "application/json",
        text: JSON.stringify({ error: "Resource read failed" }),
      };
    }
  }

  private async readCapabilities(): Promise<MCPResourceContent> {
    const toolCount = this.toolRegistry?.size() || 0;
    const skillCount = this.skillRegistry?.size() || 0;
    const agentCount = this.agentRegistry?.size() || 0;
    const teamCount = this.teamRegistry?.size() || 0;

    const toolStats = this.toolRegistry?.getStats();
    const skillStats = this.skillRegistry?.getStats();

    const data = {
      engine: "raven-ai-engine",
      version: "1.0.0",
      summary: {
        totalTools: toolCount,
        totalSkills: skillCount,
        totalAgents: agentCount,
        totalTeams: teamCount,
      },
      toolCategories: toolStats?.byCategory || {},
      skillDomains: skillStats?.byDomain || {},
      skillLayers: skillStats?.byLayer || {},
      features: [
        "multi-model-chat",
        "web-search",
        "deep-research",
        "team-collaboration",
        "content-analysis",
        "writing-assistance",
        "memory-management",
        "tool-execution",
        "agent-orchestration",
        "streaming-support",
      ],
    };

    return {
      uri: "raven://capabilities",
      mimeType: "application/json",
      text: JSON.stringify(data, null, 2),
    };
  }

  private readTools(): MCPResourceContent {
    const tools = this.toolRegistry?.getAll() || [];
    const data = tools.map((tool) => ({
      id: tool.id,
      name: tool.name,
      description: tool.description,
      category: tool.category,
      tags: tool.tags || [],
      enabled: tool.enabled !== false,
      inputSchema: tool.inputSchema,
    }));

    return {
      uri: "raven://tools",
      mimeType: "application/json",
      text: JSON.stringify({ tools: data, count: data.length }, null, 2),
    };
  }

  private readSkills(): MCPResourceContent {
    const skills = this.skillRegistry?.getAll() || [];
    const data = skills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      domain: skill.domain,
      layer: skill.layer,
      tags: skill.tags || [],
      requiredTools: skill.requiredTools || [],
      version: skill.version,
    }));

    return {
      uri: "raven://skills",
      mimeType: "application/json",
      text: JSON.stringify({ skills: data, count: data.length }, null, 2),
    };
  }

  private readAgents(): MCPResourceContent {
    const agents = this.agentRegistry?.getAll() || [];
    const data = agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      description: agent.description,
      capabilities: agent.capabilities,
      requiredTools: agent.requiredTools,
    }));

    return {
      uri: "raven://agents",
      mimeType: "application/json",
      text: JSON.stringify({ agents: data, count: data.length }, null, 2),
    };
  }

  private readTeams(): MCPResourceContent {
    const configs = this.teamRegistry?.getAllConfigs() || [];
    const data = configs.map((config) => ({
      id: config.id,
      name: config.name,
      description: config.description,
      type: config.type,
      deliverableTypes: config.deliverableTypes,
      availableSkills: config.availableSkills,
      availableTools: config.availableTools,
    }));

    return {
      uri: "raven://teams",
      mimeType: "application/json",
      text: JSON.stringify({ teams: data, count: data.length }, null, 2),
    };
  }

  private async readModels(): Promise<MCPResourceContent> {
    try {
      const models = await this.facade.getAvailableModels();
      return {
        uri: "raven://models",
        mimeType: "application/json",
        text: JSON.stringify({ models, count: models.length }, null, 2),
      };
    } catch {
      return {
        uri: "raven://models",
        mimeType: "application/json",
        text: JSON.stringify({
          models: [],
          count: 0,
          error: "Unable to fetch models",
        }),
      };
    }
  }
}
