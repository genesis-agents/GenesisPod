import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";

/**
 * MCP Tool 类型定义
 */
interface MCPToolInfo {
  name: string;
  description?: string;
}

/**
 * 可执行工具接口
 */
interface ExecutableTool {
  execute(input: Record<string, unknown>): Promise<unknown>;
}

/**
 * 类型守卫：检查工具是否可执行
 */
function isExecutableTool(tool: unknown): tool is ExecutableTool {
  return (
    typeof tool === "object" &&
    tool !== null &&
    "execute" in tool &&
    typeof (tool as ExecutableTool).execute === "function"
  );
}

/**
 * 错误类型辅助函数
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
import { ToolRegistry } from "../../ai-engine/tools/registry/tool-registry";
import { SkillRegistry } from "../../ai-engine/skills/registry/skill-registry";
import { SkillLoaderService } from "../../ai-engine/skills/loader/skill-loader.service";
import { MCPManager } from "../../ai-engine/mcp/manager/mcp-manager";
import { SecretsService } from "../secrets/secrets.service";

/**
 * AI 能力管理服务
 * 管理 Tools、Skills 和 MCP 服务器配置
 * 使用数据库持久化配置
 */
/**
 * 技能定义类型
 */
interface SkillDefinition {
  id: string;
  name: string;
  displayName: string;
  description: string;
  layer: string;
  domain: string;
  tags: string[];
  requiredTools: string[];
  requiredSkills: string[];
}

@Injectable()
export class AIAdminService implements OnModuleInit {
  private readonly logger = new Logger(AIAdminService.name);

  // 缓存技能定义，避免重复计算
  private skillDefinitionsCache: SkillDefinition[] | null = null;
  private skillDefinitionsCacheTime: number = 0;
  private readonly CACHE_TTL_MS = 60000; // 1 分钟缓存

  constructor(
    private readonly prisma: PrismaService,
    private readonly toolRegistry: ToolRegistry,
    private readonly skillRegistry: SkillRegistry,
    private readonly skillLoaderService: SkillLoaderService,
    private readonly mcpManager: MCPManager,
    private readonly secretsService: SecretsService,
  ) {}

  /**
   * 模块初始化时加载配置
   */
  async onModuleInit() {
    await this.initializeConfigs();
  }

  /**
   * 初始化配置 - 从数据库加载并连接 MCP 服务器
   */
  private async initializeConfigs() {
    try {
      // 加载 MCP 服务器配置并自动连接
      const mcpServers = await this.prisma.mCPServerConfig.findMany({
        where: { enabled: true, autoConnect: true },
      });

      for (const server of mcpServers) {
        try {
          // 注册到 MCPManager
          if (server.transport === "stdio" && server.command) {
            this.mcpManager.registerServer({
              id: server.serverId,
              name: server.name,
              transport: "stdio",
              command: server.command,
              args: server.args || [],
            });
          } else if (server.transport === "sse" && server.url) {
            this.mcpManager.registerServer({
              id: server.serverId,
              name: server.name,
              transport: "http",
              url: server.url,
            });
          }

          // 自动连接
          await this.mcpManager.connect(server.serverId);
          this.logger.log(`Auto-connected MCP server: ${server.serverId}`);
        } catch (error: unknown) {
          this.logger.warn(
            `Failed to auto-connect MCP server ${server.serverId}: ${getErrorMessage(error)}`,
          );
        }
      }

      this.logger.log(
        `Initialized AI capabilities: ${mcpServers.length} MCP servers loaded`,
      );
    } catch (error: unknown) {
      this.logger.error(
        `Failed to initialize configs: ${getErrorMessage(error)}`,
      );
    }
  }

  // ==================== Tools ====================

  /**
   * 获取所有工具配置
   */
  async getToolConfigs() {
    const toolDefinitions = this.getToolDefinitions();

    // 获取数据库中的配置
    const dbConfigs = await this.prisma.toolConfig.findMany();
    const configMap = new Map(dbConfigs.map((c) => [c.toolId, c]));

    const tools = toolDefinitions.map((tool) => {
      const dbConfig = configMap.get(tool.id);
      const registeredTool = this.toolRegistry.tryGet(tool.id);

      return {
        id: dbConfig?.id || tool.id,
        toolId: tool.id,
        name: tool.name,
        displayName: dbConfig?.displayName || tool.displayName,
        description: dbConfig?.description || tool.description,
        category: dbConfig?.category || tool.category,
        enabled: dbConfig?.enabled ?? true,
        implemented: !!registeredTool,
        tags: dbConfig?.tags || tool.tags || [],
        config: dbConfig?.config || null,
        secretKey: dbConfig?.secretKey || null, // Secret Manager 密钥引用
        requiresAuth: dbConfig?.requiresAuth || false,
        allowedRoles: dbConfig?.allowedRoles || [],
      };
    });

    // 统计信息
    const stats = {
      total: tools.length,
      enabled: tools.filter((t) => t.enabled).length,
      implemented: tools.filter((t) => t.implemented).length,
      byCategory: tools.reduce(
        (acc, tool) => {
          acc[tool.category] = (acc[tool.category] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      ),
    };

    return { tools, stats };
  }

  /**
   * 更新工具配置
   */
  async updateToolConfig(
    toolId: string,
    update: {
      enabled?: boolean;
      displayName?: string;
      description?: string;
      config?: Record<string, unknown>;
      secretKey?: string | null;
      requiresAuth?: boolean;
      allowedRoles?: string[];
    },
  ) {
    // 验证 secretKey 是否存在
    if (update.secretKey !== undefined && update.secretKey !== null) {
      const secretExists = await this.secretsService.exists(update.secretKey);
      if (!secretExists) {
        this.logger.warn(
          `Invalid secretKey reference: ${update.secretKey} for tool ${toolId}`,
        );
        throw new Error(`Secret key '${update.secretKey}' does not exist`);
      }
    }

    const result = await this.prisma.toolConfig.upsert({
      where: { toolId },
      create: {
        toolId,
        enabled: update.enabled ?? true,
        displayName: update.displayName,
        description: update.description,
        config: update.config as Prisma.InputJsonValue | undefined,
        secretKey: update.secretKey,
        requiresAuth: update.requiresAuth,
        allowedRoles: update.allowedRoles,
      },
      update: {
        enabled: update.enabled,
        displayName: update.displayName,
        description: update.description,
        config: update.config as Prisma.InputJsonValue | undefined,
        secretKey: update.secretKey,
        requiresAuth: update.requiresAuth,
        allowedRoles: update.allowedRoles,
      },
    });

    this.logger.log(
      `Updated tool config: ${toolId}, enabled=${result.enabled}, secretKey=${result.secretKey ? "set" : "none"}`,
    );

    return { success: true, ...result };
  }

  /**
   * 测试工具
   */
  async testTool(toolId: string, input?: Record<string, unknown>) {
    const tool = this.toolRegistry.tryGet(toolId);

    if (!tool) {
      return {
        success: false,
        error: `Tool ${toolId} is not implemented or registered`,
        duration: 0,
      };
    }

    // 获取工具配置，解析 API Key
    const toolConfig = await this.prisma.toolConfig.findUnique({
      where: { toolId },
    });

    let apiKey: string | undefined;
    if (toolConfig?.secretKey) {
      // 从 Secret Manager 获取 API Key
      const secretValue = await this.secretsService.getValue(
        toolConfig.secretKey,
      );
      if (secretValue) {
        apiKey = secretValue;
      }
    }

    const startTime = Date.now();
    try {
      // 尝试执行工具（如果有 execute 方法）
      if (isExecutableTool(tool)) {
        // 将 API Key 传递给工具
        const executeInput = { ...input, apiKey };
        const result = await tool.execute(executeInput);
        const duration = Date.now() - startTime;

        // 记录使用统计
        await this.recordUsage("tool", toolId, true, duration);

        return {
          success: true,
          result,
          duration,
        };
      }

      return {
        success: true,
        message:
          "Tool is registered but execute method not available for testing",
        duration: Date.now() - startTime,
      };
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      const errorCode =
        error instanceof Error
          ? (error as Error & { code?: string }).code
          : undefined;

      // 记录失败统计
      await this.recordUsage("tool", toolId, false, duration, errorCode);

      return {
        success: false,
        error: getErrorMessage(error),
        duration,
      };
    }
  }

  // ==================== Skills ====================

  /**
   * 获取所有技能配置
   */
  async getSkillConfigs() {
    const skillDefinitions = this.getSkillDefinitions();

    // 获取数据库中的配置
    const dbConfigs = await this.prisma.skillConfig.findMany();
    const configMap = new Map(dbConfigs.map((c) => [c.skillId, c]));

    const skills = skillDefinitions.map((skill) => {
      const dbConfig = configMap.get(skill.id);
      const registeredSkill = this.skillRegistry.tryGet(skill.id);

      return {
        id: dbConfig?.id || skill.id,
        skillId: skill.id,
        name: skill.name,
        displayName: dbConfig?.displayName || skill.name,
        description: dbConfig?.description || skill.description,
        layer: dbConfig?.layer || skill.layer,
        domain: dbConfig?.domain || skill.domain,
        enabled: dbConfig?.enabled ?? true,
        tags: dbConfig?.tags || skill.tags || [],
        requiredTools: skill.requiredTools || [],
        requiredSkills: skill.requiredSkills || [],
        implemented: !!registeredSkill,
        config: dbConfig?.config || null,
      };
    });

    // 统计信息
    const stats = {
      total: skills.length,
      enabled: skills.filter((s) => s.enabled).length,
      byLayer: skills.reduce(
        (acc, skill) => {
          acc[skill.layer] = (acc[skill.layer] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      ),
      byDomain: skills.reduce(
        (acc, skill) => {
          acc[skill.domain] = (acc[skill.domain] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      ),
    };

    return { skills, stats };
  }

  /**
   * 更新技能配置
   */
  async updateSkillConfig(
    skillId: string,
    update: {
      enabled?: boolean;
      displayName?: string;
      description?: string;
      config?: Record<string, unknown>;
      allowedDomains?: string[];
    },
  ) {
    const result = await this.prisma.skillConfig.upsert({
      where: { skillId },
      create: {
        skillId,
        enabled: update.enabled ?? true,
        displayName: update.displayName,
        description: update.description,
        config: update.config as Prisma.InputJsonValue | undefined,
        allowedDomains: update.allowedDomains,
      },
      update: {
        enabled: update.enabled,
        displayName: update.displayName,
        description: update.description,
        config: update.config as Prisma.InputJsonValue | undefined,
        allowedDomains: update.allowedDomains,
      },
    });

    // 清除技能定义缓存，确保下次获取时重新计算
    this.invalidateSkillDefinitionsCache();

    this.logger.log(
      `Updated skill config: ${skillId}, enabled=${result.enabled}`,
    );

    return { success: true, ...result };
  }

  /**
   * 清除技能定义缓存
   */
  private invalidateSkillDefinitionsCache(): void {
    this.skillDefinitionsCache = null;
    this.skillDefinitionsCacheTime = 0;
  }

  // ==================== MCP Servers ====================

  /**
   * 获取所有 MCP 服务器配置
   */
  async getMCPServerConfigs() {
    const dbConfigs = await this.prisma.mCPServerConfig.findMany();

    const servers = await Promise.all(
      dbConfigs.map(async (config) => {
        const client = this.mcpManager.getClient(config.serverId);
        const isConnected = client?.connected ?? false;

        let tools: Array<{ name: string; description: string }> = [];
        if (isConnected && client) {
          try {
            const mcpTools = await client.listTools();
            tools = mcpTools.map((t: MCPToolInfo) => ({
              name: t.name,
              description: t.description || "",
            }));
          } catch (e) {
            // 忽略获取工具列表失败
          }
        }

        // Extract env from metadata
        const metadata = (config.metadata as Record<string, unknown>) || {};
        const env = (metadata.env as Record<string, string>) || {};

        return {
          id: config.id,
          serverId: config.serverId,
          name: config.name,
          description: config.description || "",
          transport: config.transport,
          command: config.command,
          args: config.args,
          url: config.url,
          enabled: config.enabled,
          autoConnect: config.autoConnect,
          connected: isConnected,
          tools,
          env,
        };
      }),
    );

    return { servers };
  }

  /**
   * 添加 MCP 服务器
   */
  async addMCPServer(config: {
    serverId: string;
    name: string;
    description?: string;
    transport: "stdio" | "sse";
    command?: string;
    args?: string[];
    url?: string;
    enabled?: boolean;
    autoConnect?: boolean;
    apiKey?: string;
  }) {
    // 保存到数据库
    const dbConfig = await this.prisma.mCPServerConfig.create({
      data: {
        serverId: config.serverId,
        name: config.name,
        description: config.description,
        transport: config.transport,
        command: config.command,
        args: config.args || [],
        url: config.url,
        enabled: config.enabled ?? true,
        autoConnect: config.autoConnect ?? true,
        apiKey: config.apiKey,
      },
    });

    // 注册到 MCPManager
    if (config.transport === "stdio" && config.command) {
      this.mcpManager.registerServer({
        id: config.serverId,
        name: config.name,
        transport: "stdio",
        command: config.command,
        args: config.args || [],
      });
    } else if (config.transport === "sse" && config.url) {
      this.mcpManager.registerServer({
        id: config.serverId,
        name: config.name,
        transport: "http",
        url: config.url,
      });
    }

    // 如果启用自动连接
    if (config.autoConnect && config.enabled !== false) {
      try {
        await this.mcpManager.connect(config.serverId);
        this.logger.log(`Auto-connected MCP server: ${config.serverId}`);
      } catch (error: unknown) {
        this.logger.warn(
          `Failed to auto-connect MCP server ${config.serverId}: ${getErrorMessage(error)}`,
        );
      }
    }

    this.logger.log(`Added MCP server: ${config.serverId}`);

    return { success: true, serverId: config.serverId, id: dbConfig.id };
  }

  /**
   * 更新 MCP 服务器配置
   */
  async updateMCPServer(
    serverId: string,
    update: {
      name?: string;
      description?: string;
      enabled?: boolean;
      autoConnect?: boolean;
      command?: string;
      args?: string[];
      url?: string;
      apiKey?: string;
    },
  ) {
    const existing = await this.prisma.mCPServerConfig.findUnique({
      where: { serverId },
    });

    if (!existing) {
      return { success: false, error: "Server not found" };
    }

    const result = await this.prisma.mCPServerConfig.update({
      where: { serverId },
      data: {
        name: update.name,
        description: update.description,
        enabled: update.enabled,
        autoConnect: update.autoConnect,
        command: update.command,
        args: update.args,
        url: update.url,
        apiKey: update.apiKey,
      },
    });

    this.logger.log(`Updated MCP server: ${serverId}`);

    return { success: true, ...result };
  }

  /**
   * 连接 MCP 服务器
   */
  async connectMCPServer(serverId: string) {
    try {
      await this.mcpManager.connect(serverId);
      this.logger.log(`Connected MCP server: ${serverId}`);

      // 记录成功状态到 metadata
      await this.updateMCPServerConnectionStatus(serverId, {
        connected: true,
        lastConnectedAt: new Date().toISOString(),
        lastError: null,
      });

      return { success: true, serverId };
    } catch (error: unknown) {
      const errorMsg = getErrorMessage(error);
      this.logger.error(
        `Failed to connect MCP server ${serverId}: ${errorMsg}`,
      );

      // 记录失败状态到 metadata
      await this.updateMCPServerConnectionStatus(serverId, {
        connected: false,
        lastError: errorMsg,
        lastErrorAt: new Date().toISOString(),
      });

      return { success: false, error: errorMsg };
    }
  }

  /**
   * 断开 MCP 服务器
   */
  async disconnectMCPServer(serverId: string) {
    try {
      await this.mcpManager.disconnect(serverId);
      this.logger.log(`Disconnected MCP server: ${serverId}`);

      // 记录断开状态到 metadata
      await this.updateMCPServerConnectionStatus(serverId, {
        connected: false,
        lastDisconnectedAt: new Date().toISOString(),
      });

      return { success: true, serverId };
    } catch (error: unknown) {
      const errorMsg = getErrorMessage(error);
      this.logger.error(
        `Failed to disconnect MCP server ${serverId}: ${errorMsg}`,
      );

      // 记录失败状态到 metadata
      await this.updateMCPServerConnectionStatus(serverId, {
        lastError: errorMsg,
        lastErrorAt: new Date().toISOString(),
      });

      return { success: false, error: errorMsg };
    }
  }

  /**
   * 删除 MCP 服务器
   */
  async deleteMCPServer(serverId: string) {
    // 先断开连接
    try {
      await this.mcpManager.disconnect(serverId);
    } catch (e) {
      // 忽略断开连接失败
    }

    // 从数据库删除
    await this.prisma.mCPServerConfig.delete({
      where: { serverId },
    });

    this.logger.log(`Deleted MCP server: ${serverId}`);

    return { success: true, serverId };
  }

  /**
   * 更新 MCP 服务器环境变量配置
   */
  async updateMCPServerEnv(serverId: string, env: Record<string, string>) {
    const existing = await this.prisma.mCPServerConfig.findUnique({
      where: { serverId },
      select: { metadata: true },
    });

    if (!existing) {
      return { success: false, error: "Server not found" };
    }

    const currentMetadata =
      (existing.metadata as Record<string, unknown>) || {};
    const updatedMetadata = { ...currentMetadata, env };

    await this.prisma.mCPServerConfig.update({
      where: { serverId },
      data: { metadata: updatedMetadata },
    });

    this.logger.log(`Updated env for MCP server: ${serverId}`);

    return { success: true, serverId };
  }

  /**
   * 更新 MCP 服务器连接状态到 metadata
   * 用于持久化连接成功/失败的记录
   */
  private async updateMCPServerConnectionStatus(
    serverId: string,
    status: {
      connected?: boolean;
      lastConnectedAt?: string;
      lastDisconnectedAt?: string;
      lastError?: string | null;
      lastErrorAt?: string;
    },
  ): Promise<void> {
    try {
      const existing = await this.prisma.mCPServerConfig.findUnique({
        where: { serverId },
        select: { metadata: true },
      });

      const currentMetadata =
        (existing?.metadata as Record<string, unknown>) || {};
      const updatedMetadata = { ...currentMetadata, ...status };

      await this.prisma.mCPServerConfig.update({
        where: { serverId },
        data: { metadata: updatedMetadata },
      });
    } catch (error) {
      // 仅记录日志，不影响主流程
      this.logger.warn(
        `Failed to update MCP server connection status for ${serverId}: ${getErrorMessage(error)}`,
      );
    }
  }

  // ==================== Usage Statistics ====================

  /**
   * 记录能力使用统计
   */
  private async recordUsage(
    capabilityType: string,
    capabilityId: string,
    success: boolean,
    duration?: number,
    errorCode?: string,
    context?: { userId?: string; teamId?: string; agentId?: string },
  ) {
    try {
      await this.prisma.aIUsageLog.create({
        data: {
          capabilityType,
          capabilityId,
          success,
          duration,
          errorCode,
          userId: context?.userId,
          teamId: context?.teamId,
          agentId: context?.agentId,
        },
      });
    } catch (error: unknown) {
      this.logger.warn(`Failed to record usage: ${getErrorMessage(error)}`);
    }
  }

  /**
   * 获取能力使用统计
   */
  async getUsageStats(options?: {
    capabilityType?: string;
    capabilityId?: string;
    startDate?: Date;
    endDate?: Date;
  }) {
    const where: Prisma.AIUsageLogWhereInput = {};

    if (options?.capabilityType) {
      where.capabilityType = options.capabilityType;
    }
    if (options?.capabilityId) {
      where.capabilityId = options.capabilityId;
    }
    if (options?.startDate || options?.endDate) {
      where.createdAt = {};
      if (options?.startDate) {
        where.createdAt.gte = options.startDate;
      }
      if (options?.endDate) {
        where.createdAt.lte = options.endDate;
      }
    }

    const [total, successful, usages] = await Promise.all([
      this.prisma.aIUsageLog.count({ where }),
      this.prisma.aIUsageLog.count({ where: { ...where, success: true } }),
      this.prisma.aIUsageLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    ]);

    return {
      total,
      successful,
      failureRate: total > 0 ? ((total - successful) / total) * 100 : 0,
      recentUsages: usages,
    };
  }

  // ==================== Batch Operations ====================

  /**
   * 批量更新工具状态
   * 使用事务确保原子性
   */
  async batchUpdateTools(
    updates: Array<{ toolId: string; enabled: boolean }>,
  ): Promise<{ success: boolean; updated: number; errors: string[] }> {
    try {
      // 使用事务批量更新，确保原子性
      const results = await this.prisma.$transaction(
        updates.map((update) =>
          this.prisma.toolConfig.upsert({
            where: { toolId: update.toolId },
            create: { toolId: update.toolId, enabled: update.enabled },
            update: { enabled: update.enabled },
          }),
        ),
      );

      this.logger.log(`Batch updated ${results.length} tools successfully`);
      return { success: true, updated: results.length, errors: [] };
    } catch (error: unknown) {
      const errorMsg = getErrorMessage(error);
      this.logger.error(`Batch update tools failed: ${errorMsg}`);
      return {
        success: false,
        updated: 0,
        errors: [`Transaction failed: ${errorMsg}`],
      };
    }
  }

  /**
   * 批量更新技能状态
   * 使用事务确保原子性
   */
  async batchUpdateSkills(
    updates: Array<{ skillId: string; enabled: boolean }>,
  ): Promise<{ success: boolean; updated: number; errors: string[] }> {
    try {
      // 使用事务批量更新，确保原子性
      const results = await this.prisma.$transaction(
        updates.map((update) =>
          this.prisma.skillConfig.upsert({
            where: { skillId: update.skillId },
            create: { skillId: update.skillId, enabled: update.enabled },
            update: { enabled: update.enabled },
          }),
        ),
      );

      // 清除技能定义缓存
      this.invalidateSkillDefinitionsCache();

      this.logger.log(`Batch updated ${results.length} skills successfully`);

      return { success: true, updated: results.length, errors: [] };
    } catch (error: unknown) {
      const errorMsg = getErrorMessage(error);
      this.logger.error(`Batch update skills failed: ${errorMsg}`);

      return {
        success: false,
        updated: 0,
        errors: [`Transaction failed: ${errorMsg}`],
      };
    }
  }

  // ==================== Aggregated API ====================

  /**
   * 获取所有配置（聚合 API）
   * 一次请求返回 tools、skills 和 MCP servers 配置
   * 减少前端 API 调用次数，提升加载性能
   */
  async getAllConfigs() {
    const [toolsResult, skillsResult, mcpResult] = await Promise.all([
      this.getToolConfigs(),
      this.getSkillConfigs(),
      this.getMCPServerConfigs(),
    ]);

    return {
      tools: toolsResult,
      skills: skillsResult,
      mcpServers: mcpResult,
      timestamp: new Date().toISOString(),
    };
  }

  // ==================== Helper Methods ====================

  /**
   * 获取工具定义列表
   */
  private getToolDefinitions() {
    // 工具定义 - 基于 BUILTIN_TOOLS
    const toolDefinitions: Array<{
      id: string;
      name: string;
      displayName: string;
      description: string;
      category: string;
      tags: string[];
    }> = [
      // 信息获取类
      {
        id: "web-search",
        name: "web-search",
        displayName: "Web 搜索",
        description: "搜索互联网获取最新信息",
        category: "information",
        tags: ["search", "web"],
      },
      {
        id: "web-scraper",
        name: "web-scraper",
        displayName: "网页抓取",
        description: "抓取网页内容并提取信息",
        category: "information",
        tags: ["scraper", "web"],
      },
      {
        id: "data-fetch",
        name: "data-fetch",
        displayName: "数据获取",
        description: "从 API 或数据源获取数据",
        category: "information",
        tags: ["api", "data"],
      },
      {
        id: "rag-search",
        name: "rag-search",
        displayName: "RAG 搜索",
        description: "在知识库中进行语义搜索",
        category: "information",
        tags: ["rag", "search"],
      },
      {
        id: "database-query",
        name: "database-query",
        displayName: "数据库查询",
        description: "执行数据库查询操作",
        category: "information",
        tags: ["database", "sql"],
      },
      {
        id: "knowledge-graph",
        name: "knowledge-graph",
        displayName: "知识图谱",
        description: "查询和遍历知识图谱",
        category: "information",
        tags: ["graph", "knowledge"],
      },
      {
        id: "document-retrieval",
        name: "document-retrieval",
        displayName: "文档检索",
        description: "检索和获取文档内容",
        category: "information",
        tags: ["document", "retrieval"],
      },
      {
        id: "youtube-transcript",
        name: "youtube-transcript",
        displayName: "YouTube 字幕",
        description: "获取 YouTube 视频字幕",
        category: "information",
        tags: ["youtube", "video"],
      },

      // 内容生成类
      {
        id: "text-generation",
        name: "text-generation",
        displayName: "文本生成",
        description: "生成各类文本内容",
        category: "content",
        tags: ["text", "generation"],
      },
      {
        id: "image-generation",
        name: "image-generation",
        displayName: "图片生成",
        description: "使用 AI 生成图片",
        category: "content",
        tags: ["image", "ai"],
      },
      {
        id: "code-generation",
        name: "code-generation",
        displayName: "代码生成",
        description: "生成编程代码",
        category: "content",
        tags: ["code", "programming"],
      },
      {
        id: "audio-generation",
        name: "audio-generation",
        displayName: "音频生成",
        description: "生成语音或音频内容",
        category: "content",
        tags: ["audio", "tts"],
      },
      {
        id: "video-generation",
        name: "video-generation",
        displayName: "视频生成",
        description: "生成视频内容",
        category: "content",
        tags: ["video", "ai"],
      },
      {
        id: "chart-generation",
        name: "chart-generation",
        displayName: "图表生成",
        description: "生成数据可视化图表",
        category: "content",
        tags: ["chart", "visualization"],
      },

      // 数据处理类
      {
        id: "data-analysis",
        name: "data-analysis",
        displayName: "数据分析",
        description: "分析和处理数据",
        category: "data",
        tags: ["analysis", "data"],
      },
      {
        id: "file-conversion",
        name: "file-conversion",
        displayName: "文件转换",
        description: "转换文件格式",
        category: "data",
        tags: ["file", "conversion"],
      },
      {
        id: "file-parser",
        name: "file-parser",
        displayName: "文件解析",
        description: "解析各种文件格式",
        category: "data",
        tags: ["file", "parser"],
      },
      {
        id: "data-validation",
        name: "data-validation",
        displayName: "数据验证",
        description: "验证数据格式和内容",
        category: "data",
        tags: ["validation", "data"],
      },
      {
        id: "data-transformation",
        name: "data-transformation",
        displayName: "数据转换",
        description: "转换数据结构和格式",
        category: "data",
        tags: ["transformation", "data"],
      },
      {
        id: "json-processor",
        name: "json-processor",
        displayName: "JSON 处理",
        description: "处理和转换 JSON 数据",
        category: "data",
        tags: ["json", "processor"],
      },
      {
        id: "csv-processor",
        name: "csv-processor",
        displayName: "CSV 处理",
        description: "处理 CSV 文件",
        category: "data",
        tags: ["csv", "processor"],
      },

      // 代码执行类
      {
        id: "python-executor",
        name: "python-executor",
        displayName: "Python 执行器",
        description: "执行 Python 代码",
        category: "code",
        tags: ["python", "executor"],
      },
      {
        id: "javascript-executor",
        name: "javascript-executor",
        displayName: "JavaScript 执行器",
        description: "执行 JavaScript 代码",
        category: "code",
        tags: ["javascript", "executor"],
      },
      {
        id: "sql-executor",
        name: "sql-executor",
        displayName: "SQL 执行器",
        description: "执行 SQL 查询",
        category: "code",
        tags: ["sql", "executor"],
      },
      {
        id: "shell-executor",
        name: "shell-executor",
        displayName: "Shell 执行器",
        description: "执行 Shell 命令",
        category: "code",
        tags: ["shell", "executor"],
      },
      {
        id: "code-interpreter",
        name: "code-interpreter",
        displayName: "代码解释器",
        description: "解释和执行代码",
        category: "code",
        tags: ["interpreter", "code"],
      },
      {
        id: "sandbox-executor",
        name: "sandbox-executor",
        displayName: "沙箱执行器",
        description: "在沙箱中安全执行代码",
        category: "code",
        tags: ["sandbox", "security"],
      },

      // 外部集成类
      {
        id: "message-push",
        name: "message-push",
        displayName: "消息推送",
        description: "推送通知消息",
        category: "integration",
        tags: ["message", "notification"],
      },
      {
        id: "cloud-storage",
        name: "cloud-storage",
        displayName: "云存储",
        description: "操作云存储服务",
        category: "integration",
        tags: ["cloud", "storage"],
      },
      {
        id: "github-integration",
        name: "github-integration",
        displayName: "GitHub 集成",
        description: "与 GitHub 交互",
        category: "integration",
        tags: ["github", "git"],
      },
      {
        id: "email-sender",
        name: "email-sender",
        displayName: "邮件发送",
        description: "发送电子邮件",
        category: "integration",
        tags: ["email", "sender"],
      },
      {
        id: "slack-integration",
        name: "slack-integration",
        displayName: "Slack 集成",
        description: "与 Slack 交互",
        category: "integration",
        tags: ["slack", "messaging"],
      },
      {
        id: "calendar-integration",
        name: "calendar-integration",
        displayName: "日历集成",
        description: "管理日历和事件",
        category: "integration",
        tags: ["calendar", "events"],
      },

      // 记忆管理类
      {
        id: "short-term-memory",
        name: "short-term-memory",
        displayName: "短期记忆",
        description: "管理短期对话记忆",
        category: "memory",
        tags: ["memory", "short-term"],
      },
      {
        id: "long-term-memory",
        name: "long-term-memory",
        displayName: "长期记忆",
        description: "管理长期知识记忆",
        category: "memory",
        tags: ["memory", "long-term"],
      },
      {
        id: "entity-memory",
        name: "entity-memory",
        displayName: "实体记忆",
        description: "记忆实体和关系",
        category: "memory",
        tags: ["entity", "memory"],
      },
      {
        id: "session-memory",
        name: "session-memory",
        displayName: "会话记忆",
        description: "管理会话上下文",
        category: "memory",
        tags: ["session", "context"],
      },
      {
        id: "vector-memory",
        name: "vector-memory",
        displayName: "向量记忆",
        description: "基于向量的语义记忆",
        category: "memory",
        tags: ["vector", "semantic"],
      },

      // 导出类
      {
        id: "export-pptx",
        name: "export-pptx",
        displayName: "导出 PPT",
        description: "导出 PowerPoint 文件",
        category: "export",
        tags: ["export", "pptx"],
      },
      {
        id: "export-docx",
        name: "export-docx",
        displayName: "导出 Word",
        description: "导出 Word 文档",
        category: "export",
        tags: ["export", "docx"],
      },
      {
        id: "export-pdf",
        name: "export-pdf",
        displayName: "导出 PDF",
        description: "导出 PDF 文件",
        category: "export",
        tags: ["export", "pdf"],
      },
      {
        id: "export-image",
        name: "export-image",
        displayName: "导出图片",
        description: "导出图片文件",
        category: "export",
        tags: ["export", "image"],
      },

      // 协作类
      {
        id: "agent-handoff",
        name: "agent-handoff",
        displayName: "Agent 交接",
        description: "在 Agent 之间传递任务",
        category: "collaboration",
        tags: ["agent", "handoff"],
      },
      {
        id: "human-approval",
        name: "human-approval",
        displayName: "人工审批",
        description: "请求人工审批",
        category: "collaboration",
        tags: ["human", "approval"],
      },
      {
        id: "task-delegation",
        name: "task-delegation",
        displayName: "任务委派",
        description: "将任务委派给其他 Agent",
        category: "collaboration",
        tags: ["task", "delegation"],
      },
      {
        id: "consensus-voting",
        name: "consensus-voting",
        displayName: "共识投票",
        description: "多 Agent 共识投票",
        category: "collaboration",
        tags: ["consensus", "voting"],
      },
      {
        id: "workflow-trigger",
        name: "workflow-trigger",
        displayName: "工作流触发",
        description: "触发工作流程",
        category: "collaboration",
        tags: ["workflow", "trigger"],
      },
      {
        id: "notification",
        name: "notification",
        displayName: "通知",
        description: "发送系统通知",
        category: "collaboration",
        tags: ["notification", "alert"],
      },

      // 外部服务 - 搜索类
      {
        id: "perplexity",
        name: "perplexity",
        displayName: "Perplexity",
        description: "Perplexity AI 搜索服务",
        category: "external-search",
        tags: ["search", "ai", "perplexity"],
      },
      {
        id: "tavily",
        name: "tavily",
        displayName: "Tavily",
        description: "Tavily AI 搜索服务",
        category: "external-search",
        tags: ["search", "ai", "tavily"],
      },
      {
        id: "serper",
        name: "serper",
        displayName: "Serper",
        description: "Serper Google 搜索 API",
        category: "external-search",
        tags: ["search", "google", "serper"],
      },
      {
        id: "duckduckgo",
        name: "duckduckgo",
        displayName: "DuckDuckGo",
        description: "DuckDuckGo 搜索（免费）",
        category: "external-search",
        tags: ["search", "free", "duckduckgo"],
      },

      // 外部服务 - 内容提取类
      {
        id: "jina",
        name: "jina",
        displayName: "Jina AI Reader",
        description: "Jina AI 网页内容提取",
        category: "external-extraction",
        tags: ["extraction", "reader", "jina"],
      },
      {
        id: "firecrawl",
        name: "firecrawl",
        displayName: "Firecrawl",
        description: "Firecrawl 网页抓取服务",
        category: "external-extraction",
        tags: ["extraction", "crawler", "firecrawl"],
      },
      {
        id: "tavilyExtract",
        name: "tavilyExtract",
        displayName: "Tavily Extract",
        description: "Tavily 内容提取服务",
        category: "external-extraction",
        tags: ["extraction", "tavily"],
      },

      // 外部服务 - YouTube 类
      {
        id: "supadata",
        name: "supadata",
        displayName: "Supadata",
        description: "Supadata YouTube 字幕服务",
        category: "external-youtube",
        tags: ["youtube", "transcript", "supadata"],
      },

      // 外部服务 - TTS 类
      {
        id: "elevenlabs",
        name: "elevenlabs",
        displayName: "ElevenLabs",
        description: "ElevenLabs 语音合成",
        category: "external-tts",
        tags: ["tts", "voice", "elevenlabs"],
      },
      {
        id: "googleTts",
        name: "googleTts",
        displayName: "Google Cloud TTS",
        description: "Google Cloud 语音合成",
        category: "external-tts",
        tags: ["tts", "google", "cloud"],
      },

      // 外部服务 - SkillsMP
      {
        id: "skillsmp",
        name: "skillsmp",
        displayName: "SkillsMP",
        description: "SkillsMP 技能搜索服务",
        category: "external-skills",
        tags: ["skills", "search", "skillsmp"],
      },

      // 政策研究工具
      {
        id: "federal-register",
        name: "federal-register",
        displayName: "Federal Register",
        description: "联邦公报 - 搜索行政命令、联邦法规、机构通知",
        category: "policy-research",
        tags: ["policy", "regulation", "executive-order", "federal"],
      },
      {
        id: "congress-gov",
        name: "congress-gov",
        displayName: "Congress.gov",
        description: "国会立法 - 搜索法案、决议、投票记录",
        category: "policy-research",
        tags: ["policy", "legislation", "congress", "bills"],
      },
      {
        id: "whitehouse-news",
        name: "whitehouse-news",
        displayName: "White House News",
        description: "白宫新闻 - 官方声明、新闻发布、行政命令",
        category: "policy-research",
        tags: ["policy", "executive", "whitehouse", "president"],
      },
    ];

    return toolDefinitions;
  }

  /**
   * 获取技能定义列表
   * 合并来源：SkillRegistry（代码实现）+ SkillLoaderService（SKILL.md 文件）
   * 使用缓存提升性能
   */
  private getSkillDefinitions(): SkillDefinition[] {
    // 检查缓存是否有效
    const now = Date.now();
    if (
      this.skillDefinitionsCache &&
      now - this.skillDefinitionsCacheTime < this.CACHE_TTL_MS
    ) {
      return this.skillDefinitionsCache;
    }

    // 重新计算技能定义
    const skillDefinitions: SkillDefinition[] = [];
    const addedIds = new Set<string>();

    // 1. 从 SkillRegistry 获取已注册的代码技能
    const registeredSkills = this.skillRegistry.getAll();
    for (const skill of registeredSkills) {
      if (!addedIds.has(skill.id)) {
        const skillWithDisplayName = skill as { displayName?: string };
        skillDefinitions.push({
          id: skill.id,
          name: skill.name,
          displayName: skillWithDisplayName.displayName || skill.name,
          description: skill.description,
          layer: skill.layer || "content",
          domain: skill.domain || "common",
          tags: skill.tags || [],
          requiredTools: skill.requiredTools || [],
          requiredSkills: skill.requiredSkills || [],
        });
        addedIds.add(skill.id);
      }
    }

    // 2. 从 SkillLoaderService 获取 SKILL.md 文件技能
    const loadedSkills = this.skillLoaderService.getAllLoadedSkills();
    for (const skill of loadedSkills) {
      if (!addedIds.has(skill.metadata.id)) {
        skillDefinitions.push({
          id: skill.metadata.id,
          name: skill.metadata.name,
          displayName: skill.metadata.name,
          description: skill.metadata.description || "",
          layer: "content", // SKILL.md 使用 domain 而非 layer
          domain: skill.metadata.domain || "common",
          tags: skill.metadata.tags || [],
          requiredTools: skill.metadata.allowedTools || [], // 使用 allowedTools
          requiredSkills: skill.metadata.dependencies || [], // 使用 dependencies
        });
        addedIds.add(skill.metadata.id);
      }
    }

    // 如果没有任何技能，添加默认示例
    if (skillDefinitions.length === 0) {
      skillDefinitions.push(
        // Understanding Layer
        {
          id: "intent-analysis",
          name: "intent-analysis",
          displayName: "意图分析",
          description: "分析用户意图和需求",
          layer: "understanding",
          domain: "common",
          tags: ["intent", "analysis"],
          requiredTools: [],
          requiredSkills: [],
        },
        {
          id: "content-understanding",
          name: "content-understanding",
          displayName: "内容理解",
          description: "理解和分析内容结构",
          layer: "understanding",
          domain: "common",
          tags: ["content", "analysis"],
          requiredTools: [],
          requiredSkills: [],
        },
        // Planning Layer
        {
          id: "outline-planning",
          name: "outline-planning",
          displayName: "大纲规划",
          description: "规划内容大纲结构",
          layer: "planning",
          domain: "common",
          tags: ["outline", "planning"],
          requiredTools: [],
          requiredSkills: ["intent-analysis"],
        },
        {
          id: "narrative-planning",
          name: "narrative-planning",
          displayName: "叙事规划",
          description: "规划内容叙事流程",
          layer: "planning",
          domain: "common",
          tags: ["narrative", "planning"],
          requiredTools: [],
          requiredSkills: ["intent-analysis"],
        },
        // Content Layer
        {
          id: "content-generation",
          name: "content-generation",
          displayName: "内容生成",
          description: "生成高质量内容",
          layer: "content",
          domain: "common",
          tags: ["content", "generation"],
          requiredTools: ["text-generation"],
          requiredSkills: ["outline-planning"],
        },
        {
          id: "content-compression",
          name: "content-compression",
          displayName: "内容压缩",
          description: "压缩和精简内容",
          layer: "content",
          domain: "common",
          tags: ["content", "compression"],
          requiredTools: [],
          requiredSkills: [],
        },
        // Quality Layer
        {
          id: "quality-review",
          name: "quality-review",
          displayName: "质量审核",
          description: "审核内容质量",
          layer: "quality",
          domain: "common",
          tags: ["quality", "review"],
          requiredTools: [],
          requiredSkills: [],
        },
        {
          id: "fact-checking",
          name: "fact-checking",
          displayName: "事实核查",
          description: "验证内容的事实准确性",
          layer: "quality",
          domain: "common",
          tags: ["fact", "verification"],
          requiredTools: ["web-search"],
          requiredSkills: [],
        },
      );
    }

    // 更新缓存
    this.skillDefinitionsCache = skillDefinitions;
    this.skillDefinitionsCacheTime = now;

    return skillDefinitions;
  }
}
