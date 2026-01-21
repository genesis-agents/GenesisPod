import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { ToolRegistry } from "../tools/registry/tool-registry";
import { SkillRegistry } from "../skills/registry/skill-registry";
import { MCPManager } from "../mcp/manager/mcp-manager";
import { SkillLoaderService } from "../skills/loader/skill-loader.service";
import { SkillPromptBuilder } from "../skills/builder/skill-prompt-builder.service";
import { CapabilityUsageLog, SkillPromptBundle } from "./types";

/**
 * AI 能力解析上下文
 */
export interface AICapabilityContext {
  agentId?: string;
  teamId?: string;
  userId?: string;
  roleId?: string;
  domain?: string;
  memberId?: string;
}

/**
 * MCP 工具信息
 */
export interface MCPToolInfo {
  serverId: string;
  toolName: string;
  description?: string;
}

/**
 * AI 能力解析服务
 * Agent 运行时使用此服务获取可用的 Tools、Skills 和 MCP Tools
 */
@Injectable()
export class AICapabilityResolver {
  private readonly logger = new Logger(AICapabilityResolver.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly toolRegistry: ToolRegistry,
    private readonly skillRegistry: SkillRegistry,
    private readonly mcpManager: MCPManager,
    private readonly skillLoader: SkillLoaderService,
    private readonly skillPromptBuilder: SkillPromptBuilder,
  ) {}

  /**
   * 解析 Agent 可用的 Tools
   * 优先级：全局配置 → 团队配置 → 角色配置
   */
  async resolveToolsForAgent(context: AICapabilityContext): Promise<string[]> {
    // 1. 获取全局启用的工具
    const enabledTools = await this.getGlobalEnabledTools();

    // 2. 如果有团队，获取团队配置的工具
    let teamTools: string[] = [];
    if (context.teamId) {
      teamTools = await this.getTeamConfiguredTools(context.teamId);
    }

    // 3. 如果有角色，获取角色允许的工具
    let roleAllowedTools: string[] | null = null;
    if (context.roleId) {
      roleAllowedTools = await this.getRoleAllowedTools(context.roleId);
    }

    // 4. 合并并过滤
    let allTools = new Set([...enabledTools, ...teamTools]);

    // 如果有角色限制，只保留角色允许的工具
    if (roleAllowedTools !== null && roleAllowedTools.length > 0) {
      allTools = new Set(
        Array.from(allTools).filter((t) => roleAllowedTools!.includes(t)),
      );
    }

    this.logger.debug(
      `Resolved ${allTools.size} tools for agent context: ${JSON.stringify(context)}`,
    );

    return Array.from(allTools);
  }

  /**
   * 解析 Agent 可用的 Skills
   * 可按领域过滤
   */
  async resolveSkillsForAgent(context: AICapabilityContext): Promise<string[]> {
    // 1. 获取全局启用的技能
    const enabledSkills = await this.getGlobalEnabledSkills();

    // 2. 如果有领域限制，过滤
    if (context.domain) {
      const filteredSkills = enabledSkills.filter((skillId) => {
        const skill = this.skillRegistry.tryGet(skillId);
        return skill?.domain === context.domain || skill?.domain === "common";
      });

      this.logger.debug(
        `Resolved ${filteredSkills.length} skills for domain ${context.domain}`,
      );

      return filteredSkills;
    }

    this.logger.debug(`Resolved ${enabledSkills.length} skills`);

    return enabledSkills;
  }

  /**
   * 解析 Agent 可用的 MCP Tools
   */
  async resolveMCPToolsForAgent(
    context: AICapabilityContext,
  ): Promise<MCPToolInfo[]> {
    // 1. 获取全局启用的 MCP 服务器
    const enabledServers = await this.prisma.mCPServerConfig.findMany({
      where: { enabled: true },
    });

    // 2. 获取已连接服务器的工具
    const mcpTools: MCPToolInfo[] = [];

    for (const server of enabledServers) {
      const client = this.mcpManager.getClient(server.serverId);
      if (client?.connected) {
        try {
          const tools = await client.listTools();
          for (const tool of tools) {
            mcpTools.push({
              serverId: server.serverId,
              toolName: tool.name,
              description: tool.description,
            });
          }
        } catch (error: any) {
          this.logger.warn(
            `Failed to list tools from MCP server ${server.serverId}: ${error.message}`,
          );
        }
      }
    }

    // 3. 如果有成员级别配置，合并
    if (context.memberId) {
      const memberMCPTools = await this.getMemberMCPTools(context.memberId);
      mcpTools.push(...memberMCPTools);
    }

    this.logger.debug(`Resolved ${mcpTools.length} MCP tools`);

    return mcpTools;
  }

  /**
   * 解析 Agent 可用的所有能力
   */
  async resolveAllCapabilities(context: AICapabilityContext): Promise<{
    tools: string[];
    skills: string[];
    mcpTools: MCPToolInfo[];
  }> {
    const [tools, skills, mcpTools] = await Promise.all([
      this.resolveToolsForAgent(context),
      this.resolveSkillsForAgent(context),
      this.resolveMCPToolsForAgent(context),
    ]);

    return { tools, skills, mcpTools };
  }

  /**
   * 检查工具是否可用
   */
  async isToolAvailable(
    toolId: string,
    context: AICapabilityContext,
  ): Promise<boolean> {
    const availableTools = await this.resolveToolsForAgent(context);
    return availableTools.includes(toolId);
  }

  /**
   * 检查技能是否可用
   */
  async isSkillAvailable(
    skillId: string,
    context: AICapabilityContext,
  ): Promise<boolean> {
    const availableSkills = await this.resolveSkillsForAgent(context);
    return availableSkills.includes(skillId);
  }

  /**
   * 获取工具配置
   */
  async getToolConfig(toolId: string): Promise<Record<string, unknown> | null> {
    const config = await this.prisma.toolConfig.findUnique({
      where: { toolId },
    });

    return config?.config as Record<string, unknown> | null;
  }

  /**
   * 获取技能配置
   */
  async getSkillConfig(
    skillId: string,
  ): Promise<Record<string, unknown> | null> {
    const config = await this.prisma.skillConfig.findUnique({
      where: { skillId },
    });

    return config?.config as Record<string, unknown> | null;
  }

  /**
   * ★ NEW: 获取工具的 Function Definitions
   * 用于 LLM Function Calling
   */
  async getToolFunctionDefinitions(
    context: AICapabilityContext,
  ): Promise<
    import("../tools/abstractions/tool.interface").FunctionDefinition[]
  > {
    const toolIds = await this.resolveToolsForAgent(context);
    return this.toolRegistry.getFunctionDefinitions(toolIds);
  }

  /**
   * ★ NEW: 获取 Skills 的 Prompt Bundle
   * 用于注入到 System Message
   */
  async getSkillPrompts(
    context: AICapabilityContext,
  ): Promise<SkillPromptBundle> {
    const skillIds = await this.resolveSkillsForAgent(context);

    if (skillIds.length === 0) {
      return {
        content: "",
        usedSkills: [],
        estimatedTokens: 0,
        wasTrimmed: false,
        skippedSkills: [],
      };
    }

    // 使用类型守护函数确保 domain 的类型安全
    const domain = this.validateSkillDomain(context.domain) || "general";

    // 使用 SkillLoaderService 加载 Skills（从文件系统）
    const skills = await this.skillLoader.getSkillsForTask({
      taskType: "*", // 默认匹配所有任务
      domain,
      additionalSkillIds: skillIds,
      maxTokenBudget: 4000,
    });

    if (skills.length === 0) {
      return {
        content: "",
        usedSkills: [],
        estimatedTokens: 0,
        wasTrimmed: false,
        skippedSkills: [],
      };
    }

    // 使用 SkillPromptBuilder 组装 Prompts
    const buildResult = this.skillPromptBuilder.buildSystemPrompt(skills, {
      maxTokens: 4000,
      includeMetadata: false,
    });

    this.logger.debug(
      `Built skill prompts for ${buildResult.usedSkills.length} skills: ${buildResult.usedSkills.join(", ")}`,
    );

    return {
      content: buildResult.prompt,
      usedSkills: buildResult.usedSkills,
      estimatedTokens: buildResult.estimatedTokens,
      wasTrimmed: buildResult.wasTrimmed,
      skippedSkills: buildResult.skippedSkills,
    };
  }

  /**
   * ★ NEW: 记录能力使用日志
   * 所有 Tool/Skill 调用都应该记录到 AIUsageLog
   */
  async logCapabilityUsage(log: CapabilityUsageLog): Promise<void> {
    try {
      await this.prisma.aIUsageLog.create({
        data: {
          capabilityType: log.capabilityType,
          capabilityId: log.capabilityId,
          userId: log.userId,
          teamId: log.teamId,
          agentId: log.agentId,
          success: log.success,
          duration: log.duration,
          tokensUsed: log.tokensUsed,
          errorCode: log.errorCode,
        },
      });

      this.logger.debug(
        `Logged ${log.capabilityType} usage: ${log.capabilityId} (success=${log.success})`,
      );
    } catch (error: any) {
      this.logger.warn(`Failed to log capability usage: ${error.message}`);
    }
  }

  // ==================== Private Methods ====================

  /**
   * 获取全局启用的工具
   */
  private async getGlobalEnabledTools(): Promise<string[]> {
    const configs = await this.prisma.toolConfig.findMany({
      where: { enabled: true },
      select: { toolId: true },
    });

    // 如果没有配置，返回所有注册的工具（默认全部启用）
    if (configs.length === 0) {
      return this.toolRegistry.getEnabled().map((t) => t.id);
    }

    return configs.map((c) => c.toolId);
  }

  /**
   * 获取全局启用的技能
   */
  private async getGlobalEnabledSkills(): Promise<string[]> {
    const configs = await this.prisma.skillConfig.findMany({
      where: { enabled: true },
      select: { skillId: true },
    });

    // 如果没有配置，返回所有注册的技能（默认全部启用）
    if (configs.length === 0) {
      return this.skillRegistry.getAll().map((s) => s.id);
    }

    return configs.map((c) => c.skillId);
  }

  /**
   * 获取团队配置的工具
   */
  private async getTeamConfiguredTools(teamId: string): Promise<string[]> {
    // 从团队模板获取配置的能力
    const team = await this.prisma.aITeamTemplate.findUnique({
      where: { id: teamId },
      include: {
        members: {
          select: {
            capabilities: true,
          },
        },
      },
    });

    if (!team) {
      return [];
    }

    // 收集所有成员的能力
    const tools = new Set<string>();
    for (const member of team.members) {
      for (const capability of member.capabilities) {
        // AICapability 枚举映射到工具 ID
        const toolId = this.capabilityToToolId(capability);
        if (toolId) {
          tools.add(toolId);
        }
      }
    }

    return Array.from(tools);
  }

  /**
   * 获取角色允许的工具
   */
  private async getRoleAllowedTools(roleId: string): Promise<string[]> {
    // 获取配置了角色限制的工具
    const configs = await this.prisma.toolConfig.findMany({
      where: {
        enabled: true,
        OR: [
          { allowedRoles: { isEmpty: true } }, // 空数组表示所有角色
          { allowedRoles: { has: roleId } },
        ],
      },
      select: { toolId: true },
    });

    return configs.map((c) => c.toolId);
  }

  /**
   * 获取成员配置的 MCP 工具
   */
  private async getMemberMCPTools(memberId: string): Promise<MCPToolInfo[]> {
    const member = await this.prisma.aITeamMemberTemplate.findUnique({
      where: { id: memberId },
      select: { mcpTools: true },
    });

    if (!member?.mcpTools) {
      return [];
    }

    // mcpTools 是 JSON 格式
    const mcpToolsConfig = member.mcpTools as Array<{
      serverId: string;
      toolName: string;
      description?: string;
    }>;

    return mcpToolsConfig.map((t) => ({
      serverId: t.serverId,
      toolName: t.toolName,
      description: t.description,
    }));
  }

  /**
   * 验证并返回有效的 SkillDomain
   * 如果 domain 不是字符串或为空，返回 null
   */
  private validateSkillDomain(
    domain: string | undefined,
  ): import("../skills/types/skill-md.types").SkillDomain | null {
    if (!domain || typeof domain !== "string") {
      return null;
    }
    return domain;
  }

  /**
   * 将 AICapability 枚举映射到工具 ID
   */
  private capabilityToToolId(capability: string): string | null {
    // AICapability 枚举到工具 ID 的映射
    const mapping: Record<string, string> = {
      WEB_SEARCH: "web-search",
      WEB_SCRAPER: "web-scraper",
      DATA_FETCH: "data-fetch",
      RAG_SEARCH: "rag-search",
      DATABASE_QUERY: "database-query",
      KNOWLEDGE_GRAPH: "knowledge-graph",
      DOCUMENT_RETRIEVAL: "document-retrieval",
      TEXT_GENERATION: "text-generation",
      IMAGE_GENERATION: "image-generation",
      CODE_GENERATION: "code-generation",
      DATA_ANALYSIS: "data-analysis",
      FILE_CONVERSION: "file-conversion",
      FILE_PARSER: "file-parser",
      PYTHON_EXECUTOR: "python-executor",
      JAVASCRIPT_EXECUTOR: "javascript-executor",
      EXPORT_PPTX: "export-pptx",
      EXPORT_DOCX: "export-docx",
      EXPORT_PDF: "export-pdf",
      AGENT_HANDOFF: "agent-handoff",
      HUMAN_APPROVAL: "human-approval",
      TASK_DELEGATION: "task-delegation",
    };

    return mapping[capability] || null;
  }
}

// 保持向后兼容的类型别名
export type CapabilityContext = AICapabilityContext;
