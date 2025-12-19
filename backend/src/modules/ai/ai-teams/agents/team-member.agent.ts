/**
 * TeamMemberAgent - AI Teams 成员 Agent
 *
 * 将 TopicAIMember 转换为具备工具调用能力的 Agent
 * 根据成员的角色、能力和专业领域自动配置可用工具
 */

import { Injectable, Logger } from "@nestjs/common";
import { AICapability, AgentWorkStyle } from "@prisma/client";
import { ToolType } from "../../ai-agents/core/agent/agent.types";
import { ToolRegistry } from "../../ai-agents/core";
import { ITool, ToolContext } from "../../ai-agents/core/tool/tool.interface";

/**
 * 团队成员角色类型
 */
export type TeamMemberRole =
  | "researcher" // 研究员：信息搜集与分析
  | "analyst" // 分析师：数据分析与洞察
  | "writer" // 作家：内容创作与文档
  | "developer" // 开发者：代码生成与技术
  | "designer" // 设计师：视觉设计与创意
  | "moderator" // 主持人：协调与组织
  | "leader" // Leader：任务分配与决策
  | "general"; // 通用：基础能力

/**
 * 成员 Agent 配置
 */
export interface TeamMemberAgentConfig {
  memberId: string;
  displayName: string;
  role: TeamMemberRole;
  capabilities: AICapability[];
  expertiseAreas: string[];
  workStyle: AgentWorkStyle | null;
  isLeader: boolean;
  customTools?: ToolType[];
}

/**
 * 工具执行上下文
 */
export interface ToolExecutionContext {
  topicId: string;
  memberId: string;
  messageId?: string;
  prompt: string;
  resources?: string[];
}

/**
 * 工具执行结果
 */
export interface ToolExecutionResult {
  success: boolean;
  toolType: ToolType;
  output: unknown;
  duration: number;
  error?: string;
}

@Injectable()
export class TeamMemberAgent {
  private readonly logger = new Logger(TeamMemberAgent.name);

  /**
   * 角色到工具类型的映射
   * 每个角色有一组默认可用的工具
   */
  private static readonly ROLE_TOOL_MAPPING: Record<
    TeamMemberRole,
    ToolType[]
  > = {
    researcher: [
      ToolType.WEB_SEARCH,
      ToolType.WEB_SCRAPER,
      ToolType.RAG_SEARCH,
      ToolType.KNOWLEDGE_GRAPH,
      ToolType.DATA_FETCH,
      ToolType.SHORT_TERM_MEMORY,
    ],
    analyst: [
      ToolType.DATA_ANALYSIS,
      ToolType.PYTHON_EXECUTOR,
      ToolType.DATA_FETCH,
      ToolType.DATABASE_QUERY,
      ToolType.DATA_VALIDATION,
      ToolType.DATA_CLEANING,
      ToolType.STRUCTURED_OUTPUT,
    ],
    writer: [
      ToolType.TEXT_GENERATION,
      ToolType.EXPORT_DOCX,
      ToolType.EXPORT_PDF,
      ToolType.TEMPLATE_RENDER,
      ToolType.WEB_SEARCH,
      ToolType.RAG_SEARCH,
    ],
    developer: [
      ToolType.CODE_GENERATION,
      ToolType.PYTHON_EXECUTOR,
      ToolType.JAVASCRIPT_EXECUTOR,
      ToolType.SQL_EXECUTOR,
      ToolType.GITHUB_INTEGRATION,
      ToolType.SHELL_EXECUTOR,
    ],
    designer: [
      ToolType.IMAGE_GENERATION,
      ToolType.EXPORT_IMAGE,
      ToolType.EXPORT_PPTX,
      ToolType.TEMPLATE_RENDER,
    ],
    moderator: [
      ToolType.TEXT_GENERATION,
      ToolType.AGENT_HANDOFF,
      ToolType.CONSENSUS_MECHANISM,
      ToolType.AGENT_COMMUNICATION,
      ToolType.SHORT_TERM_MEMORY,
    ],
    leader: [
      ToolType.TEXT_GENERATION,
      ToolType.TASK_DELEGATION,
      ToolType.AGENT_HANDOFF,
      ToolType.CONSENSUS_MECHANISM,
      ToolType.WORKFLOW_ORCHESTRATION,
      ToolType.HUMAN_APPROVAL,
      ToolType.SHORT_TERM_MEMORY,
      ToolType.LONG_TERM_MEMORY,
    ],
    general: [
      ToolType.TEXT_GENERATION,
      ToolType.WEB_SEARCH,
      ToolType.SHORT_TERM_MEMORY,
    ],
  };

  /**
   * AICapability 到 ToolType 的映射
   * 将 Prisma 枚举映射到工具类型
   */
  private static readonly CAPABILITY_TOOL_MAPPING: Record<
    AICapability,
    ToolType[]
  > = {
    TEXT_GENERATION: [ToolType.TEXT_GENERATION, ToolType.TEMPLATE_RENDER],
    CODE_GENERATION: [
      ToolType.CODE_GENERATION,
      ToolType.PYTHON_EXECUTOR,
      ToolType.JAVASCRIPT_EXECUTOR,
    ],
    CODE_REVIEW: [ToolType.CODE_GENERATION, ToolType.DATA_VALIDATION],
    IMAGE_GENERATION: [ToolType.IMAGE_GENERATION, ToolType.EXPORT_IMAGE],
    IMAGE_ANALYSIS: [ToolType.OCR_RECOGNITION, ToolType.DATA_ANALYSIS],
    WEB_SEARCH: [ToolType.WEB_SEARCH, ToolType.WEB_SCRAPER],
    URL_FETCH: [ToolType.WEB_SCRAPER, ToolType.DATA_FETCH],
    DOCUMENT_ANALYSIS: [
      ToolType.FILE_PARSER,
      ToolType.RAG_SEARCH,
      ToolType.DATA_ANALYSIS,
    ],
    REASONING: [ToolType.TEXT_GENERATION, ToolType.STRUCTURED_OUTPUT],
    MATH: [ToolType.PYTHON_EXECUTOR, ToolType.DATA_ANALYSIS],
    TRANSLATION: [ToolType.TEXT_GENERATION],
    SUMMARIZATION: [ToolType.TEXT_GENERATION, ToolType.STRUCTURED_OUTPUT],
  };

  /**
   * 专业领域关键词到工具的映射
   */
  private static readonly EXPERTISE_TOOL_MAPPING: Record<string, ToolType[]> = {
    // 技术领域
    编程: [ToolType.CODE_GENERATION, ToolType.PYTHON_EXECUTOR],
    开发: [ToolType.CODE_GENERATION, ToolType.GITHUB_INTEGRATION],
    数据库: [ToolType.DATABASE_QUERY, ToolType.SQL_EXECUTOR],
    前端: [ToolType.CODE_GENERATION, ToolType.JAVASCRIPT_EXECUTOR],
    后端: [
      ToolType.CODE_GENERATION,
      ToolType.PYTHON_EXECUTOR,
      ToolType.SQL_EXECUTOR,
    ],
    // 数据领域
    数据分析: [ToolType.DATA_ANALYSIS, ToolType.PYTHON_EXECUTOR],
    机器学习: [ToolType.PYTHON_EXECUTOR, ToolType.DATA_ANALYSIS],
    统计: [ToolType.DATA_ANALYSIS, ToolType.PYTHON_EXECUTOR],
    // 创意领域
    设计: [ToolType.IMAGE_GENERATION, ToolType.EXPORT_IMAGE],
    写作: [ToolType.TEXT_GENERATION, ToolType.EXPORT_DOCX],
    文案: [ToolType.TEXT_GENERATION],
    // 研究领域
    研究: [ToolType.WEB_SEARCH, ToolType.RAG_SEARCH, ToolType.KNOWLEDGE_GRAPH],
    调研: [ToolType.WEB_SEARCH, ToolType.DATA_FETCH],
  };

  constructor(private readonly toolRegistry: ToolRegistry) {}

  /**
   * 根据成员配置解析可用工具列表
   */
  resolveTools(config: TeamMemberAgentConfig): ToolType[] {
    const tools = new Set<ToolType>();

    // 1. 基于角色添加工具
    const roleTools = TeamMemberAgent.ROLE_TOOL_MAPPING[config.role] || [];
    roleTools.forEach((tool) => tools.add(tool));

    // 2. 基于 AICapability 添加工具
    config.capabilities.forEach((cap) => {
      const capTools = TeamMemberAgent.CAPABILITY_TOOL_MAPPING[cap] || [];
      capTools.forEach((tool) => tools.add(tool));
    });

    // 3. 基于专业领域添加工具
    config.expertiseAreas.forEach((area) => {
      // 模糊匹配专业领域
      Object.entries(TeamMemberAgent.EXPERTISE_TOOL_MAPPING).forEach(
        ([keyword, expertiseTools]) => {
          if (area.includes(keyword) || keyword.includes(area)) {
            expertiseTools.forEach((tool) => tools.add(tool));
          }
        },
      );
    });

    // 4. Leader 额外添加协作工具
    if (config.isLeader) {
      [
        ToolType.TASK_DELEGATION,
        ToolType.WORKFLOW_ORCHESTRATION,
        ToolType.CONSENSUS_MECHANISM,
        ToolType.HUMAN_APPROVAL,
      ].forEach((tool) => tools.add(tool));
    }

    // 5. 添加自定义工具
    if (config.customTools) {
      config.customTools.forEach((tool) => tools.add(tool));
    }

    // 6. 所有成员都有基础记忆工具
    tools.add(ToolType.SHORT_TERM_MEMORY);

    this.logger.debug(
      `[resolveTools] Member ${config.displayName} (${config.role}): ${tools.size} tools resolved`,
    );

    return Array.from(tools);
  }

  /**
   * 根据角色描述推断成员角色
   */
  inferRoleFromDescription(
    roleDescription: string | null | undefined,
  ): TeamMemberRole {
    if (!roleDescription) return "general";

    const description = roleDescription.toLowerCase();

    // Leader 检测
    if (
      description.includes("leader") ||
      description.includes("领导") ||
      description.includes("负责人") ||
      description.includes("项目经理")
    ) {
      return "leader";
    }

    // 研究员检测
    if (
      description.includes("研究") ||
      description.includes("调研") ||
      description.includes("researcher")
    ) {
      return "researcher";
    }

    // 分析师检测
    if (
      description.includes("分析") ||
      description.includes("数据") ||
      description.includes("analyst")
    ) {
      return "analyst";
    }

    // 开发者检测
    if (
      description.includes("开发") ||
      description.includes("程序") ||
      description.includes("工程师") ||
      description.includes("developer") ||
      description.includes("engineer")
    ) {
      return "developer";
    }

    // 设计师检测
    if (
      description.includes("设计") ||
      description.includes("美术") ||
      description.includes("ui") ||
      description.includes("designer")
    ) {
      return "designer";
    }

    // 作家检测
    if (
      description.includes("写作") ||
      description.includes("文案") ||
      description.includes("编辑") ||
      description.includes("writer")
    ) {
      return "writer";
    }

    // 主持人检测
    if (
      description.includes("主持") ||
      description.includes("协调") ||
      description.includes("moderator")
    ) {
      return "moderator";
    }

    return "general";
  }

  /**
   * 获取工具实例列表
   */
  getToolInstances(toolTypes: ToolType[]): ITool[] {
    const tools: ITool[] = [];

    for (const type of toolTypes) {
      if (this.toolRegistry.has(type)) {
        const tool = this.toolRegistry.get(type);
        tools.push(tool);
      } else {
        this.logger.warn(`[getToolInstances] Tool not found: ${type}`);
      }
    }

    return tools;
  }

  /**
   * 执行单个工具
   */
  async executeTool(
    toolType: ToolType,
    input: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      if (!this.toolRegistry.has(toolType)) {
        return {
          success: false,
          toolType,
          output: null,
          duration: Date.now() - startTime,
          error: `Tool not found: ${toolType}`,
        };
      }

      const tool = this.toolRegistry.get(toolType);

      // 构建工具上下文
      const toolContext: ToolContext = {
        taskId: context.messageId || `task_${Date.now()}`,
        userId: context.memberId,
        workspaceId: context.topicId,
      };

      // 执行工具
      const result = await tool.execute(input, toolContext);

      return {
        success: result.success,
        toolType,
        output: result.data,
        duration: Date.now() - startTime,
        error: result.error,
      };
    } catch (error) {
      this.logger.error(`[executeTool] Failed to execute ${toolType}:`, error);

      return {
        success: false,
        toolType,
        output: null,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 批量执行多个工具（并行）
   */
  async executeToolsParallel(
    executions: Array<{
      toolType: ToolType;
      input: Record<string, unknown>;
    }>,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult[]> {
    const promises = executions.map(({ toolType, input }) =>
      this.executeTool(toolType, input, context),
    );

    return Promise.all(promises);
  }

  /**
   * 批量执行多个工具（顺序）
   */
  async executeToolsSequential(
    executions: Array<{
      toolType: ToolType;
      input: Record<string, unknown>;
    }>,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult[]> {
    const results: ToolExecutionResult[] = [];

    for (const { toolType, input } of executions) {
      const result = await this.executeTool(toolType, input, context);
      results.push(result);

      // 如果工具执行失败，可以选择中断或继续
      if (!result.success) {
        this.logger.warn(
          `[executeToolsSequential] Tool ${toolType} failed, continuing...`,
        );
      }
    }

    return results;
  }

  /**
   * 生成工具调用的 Function Calling Schema
   * 用于传递给 LLM 进行工具选择
   */
  generateFunctionCallingSchema(toolTypes: ToolType[]): Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }> {
    const schemas: Array<{
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    }> = [];

    for (const type of toolTypes) {
      if (this.toolRegistry.has(type)) {
        const tool = this.toolRegistry.get(type);
        schemas.push({
          name: type,
          description: tool.description,
          parameters: tool.inputSchema as Record<string, unknown>,
        });
      }
    }

    return schemas;
  }

  /**
   * 构建成员的系统提示词增强部分
   * 描述该成员可用的工具能力
   */
  buildToolsSystemPrompt(toolTypes: ToolType[]): string {
    if (toolTypes.length === 0) {
      return "";
    }

    const toolDescriptions = toolTypes
      .map((type) => {
        if (!this.toolRegistry.has(type)) return null;
        const tool = this.toolRegistry.get(type);
        return `- ${type}: ${tool.description}`;
      })
      .filter(Boolean)
      .join("\n");

    return `
## 可用工具

你可以使用以下工具来完成任务：

${toolDescriptions}

当需要使用工具时，请明确说明你要使用的工具名称和参数。
`;
  }

  /**
   * 根据工作风格调整工具执行策略
   */
  getExecutionStrategy(workStyle: AgentWorkStyle | null): {
    parallel: boolean;
    maxConcurrent: number;
    retryOnFailure: boolean;
    timeoutMs: number;
  } {
    switch (workStyle) {
      case "AUTONOMOUS":
        return {
          parallel: true,
          maxConcurrent: 5,
          retryOnFailure: true,
          timeoutMs: 60000,
        };
      case "COLLABORATIVE":
        return {
          parallel: true,
          maxConcurrent: 3,
          retryOnFailure: true,
          timeoutMs: 45000,
        };
      case "ANALYTICAL":
        return {
          parallel: false,
          maxConcurrent: 1,
          retryOnFailure: true,
          timeoutMs: 90000,
        };
      case "CREATIVE":
        return {
          parallel: true,
          maxConcurrent: 4,
          retryOnFailure: false,
          timeoutMs: 60000,
        };
      case "SUPPORTIVE":
        return {
          parallel: false,
          maxConcurrent: 2,
          retryOnFailure: true,
          timeoutMs: 30000,
        };
      default:
        return {
          parallel: true,
          maxConcurrent: 3,
          retryOnFailure: true,
          timeoutMs: 45000,
        };
    }
  }
}
