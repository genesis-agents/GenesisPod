/**
 * MCP (Model Context Protocol) 协议适配层
 * 将 DeepDive 工具系统适配到 MCP 标准
 *
 * MCP 协议规范: https://modelcontextprotocol.io/
 *
 * MCP 核心概念:
 * - Resources: 可访问的数据资源（文件、数据库、API 等）
 * - Prompts: 预定义的提示模板
 * - Tools: 可调用的功能工具（与 DeepDive 工具系统对应）
 * - Progress: 进度报告和取消机制
 */

import { Injectable, Logger } from "@nestjs/common";
import { ToolRegistry } from "../tool/tool.registry";
import { JSONSchema, ToolContext } from "../tool/tool.interface";
import { ToolType } from "../agent/agent.types";

// ==================== MCP 类型定义 ====================

/**
 * MCP 资源定义
 * 代表可访问的数据或内容
 *
 * @example
 * ```typescript
 * {
 *   uri: "file:///workspace/docs/report.pdf",
 *   name: "项目报告",
 *   description: "2024年Q4项目总结报告",
 *   mimeType: "application/pdf"
 * }
 * ```
 */
export interface MCPResource {
  /**
   * 资源唯一标识符（URI 格式）
   */
  uri: string;

  /**
   * 资源名称
   */
  name: string;

  /**
   * 资源描述（可选）
   */
  description?: string;

  /**
   * MIME 类型（可选）
   */
  mimeType?: string;

  /**
   * 资源大小（字节）
   */
  size?: number;

  /**
   * 元数据
   */
  metadata?: Record<string, unknown>;
}

/**
 * MCP 提示模板参数
 */
export interface MCPPromptArgument {
  /**
   * 参数名称
   */
  name: string;

  /**
   * 参数描述
   */
  description?: string;

  /**
   * 是否必需
   */
  required?: boolean;

  /**
   * 默认值
   */
  default?: unknown;
}

/**
 * MCP 提示模板定义
 * 预定义的可重用提示
 *
 * @example
 * ```typescript
 * {
 *   name: "analyze_data",
 *   description: "分析数据集并生成报告",
 *   arguments: [
 *     { name: "dataUrl", description: "数据集 URL", required: true }
 *   ]
 * }
 * ```
 */
export interface MCPPrompt {
  /**
   * 提示名称
   */
  name: string;

  /**
   * 提示描述
   */
  description?: string;

  /**
   * 参数列表
   */
  arguments?: MCPPromptArgument[];

  /**
   * 提示内容模板
   */
  template?: string;
}

/**
 * MCP 工具定义
 * 与 DeepDive FunctionDefinition 兼容
 */
export interface MCPTool {
  /**
   * 工具名称（对应 ToolType）
   */
  name: string;

  /**
   * 工具描述
   */
  description: string;

  /**
   * 输入参数 Schema
   */
  inputSchema: JSONSchema;

  /**
   * 输出结果 Schema（可选，MCP 扩展）
   */
  outputSchema?: JSONSchema;

  /**
   * 工具类别（可选，MCP 扩展）
   */
  category?: string;
}

/**
 * MCP 请求
 */
export interface MCPRequest {
  /**
   * 请求方法
   */
  method: string;

  /**
   * 请求参数
   */
  params?: unknown;

  /**
   * 请求 ID（用于匹配响应）
   */
  id?: string | number;
}

/**
 * MCP 错误代码
 */
export enum MCPErrorCode {
  PARSE_ERROR = -32700,
  INVALID_REQUEST = -32600,
  METHOD_NOT_FOUND = -32601,
  INVALID_PARAMS = -32602,
  INTERNAL_ERROR = -32603,
  TOOL_NOT_FOUND = -32001,
  TOOL_EXECUTION_ERROR = -32002,
  RESOURCE_NOT_FOUND = -32003,
  CANCELLED = -32004,
}

/**
 * MCP 错误
 */
export interface MCPError {
  /**
   * 错误代码
   */
  code: MCPErrorCode;

  /**
   * 错误消息
   */
  message: string;

  /**
   * 错误详情（可选）
   */
  data?: unknown;
}

/**
 * MCP 响应
 */
export interface MCPResponse<T = unknown> {
  /**
   * 响应 ID（匹配请求）
   */
  id?: string | number;

  /**
   * 响应结果（成功时）
   */
  result?: T;

  /**
   * 错误信息（失败时）
   */
  error?: MCPError;
}

/**
 * MCP 进度报告
 */
export interface MCPProgress {
  /**
   * 进度令牌
   */
  token: string;

  /**
   * 进度百分比 (0-100)
   */
  progress: number;

  /**
   * 总数（可选）
   */
  total?: number;

  /**
   * 进度消息
   */
  message?: string;
}

/**
 * MCP 取消请求
 */
export interface MCPCancellation {
  /**
   * 取消令牌
   */
  token: string;

  /**
   * 取消原因
   */
  reason?: string;
}

// ==================== MCP 适配器实现 ====================

/**
 * 进度回调函数
 */
export type ProgressCallback = (progress: MCPProgress) => void;

/**
 * MCP 适配器选项
 */
export interface MCPAdapterOptions {
  /**
   * 启用资源管理
   */
  enableResources?: boolean;

  /**
   * 启用提示模板
   */
  enablePrompts?: boolean;

  /**
   * 启用进度报告
   */
  enableProgress?: boolean;

  /**
   * 启用取消机制
   */
  enableCancellation?: boolean;
}

/**
 * MCP 协议适配器
 * 将 DeepDive 工具系统适配到 MCP 标准协议
 *
 * @example
 * ```typescript
 * const adapter = new MCPAdapter(toolRegistry);
 *
 * // 列出可用工具
 * const tools = adapter.listTools();
 *
 * // 执行工具
 * const response = await adapter.callTool('web_search', { query: 'AI news' });
 * ```
 */
@Injectable()
export class MCPAdapter {
  private readonly logger = new Logger(MCPAdapter.name);

  /**
   * 资源注册表
   */
  private readonly resources = new Map<string, MCPResource>();

  /**
   * 提示模板注册表
   */
  private readonly prompts = new Map<string, MCPPrompt>();

  /**
   * 进度回调注册表
   */
  private readonly progressCallbacks = new Map<string, ProgressCallback>();

  /**
   * 取消控制器注册表
   */
  private readonly abortControllers = new Map<string, AbortController>();

  /**
   * 适配器选项
   */
  private readonly options: Required<MCPAdapterOptions>;

  constructor(private readonly toolRegistry: ToolRegistry) {
    this.options = {
      enableResources: true,
      enablePrompts: true,
      enableProgress: true,
      enableCancellation: true,
    };

    this.logger.log("MCP Adapter initialized");
  }

  // ==================== 工具管理 ====================

  /**
   * 列出所有可用工具
   * 将 DeepDive 工具转换为 MCP 工具格式
   *
   * @returns MCP 工具列表
   */
  listTools(): MCPTool[] {
    const tools = this.toolRegistry.getAll();

    return tools.map((tool) => ({
      name: tool.type,
      description: tool.description,
      inputSchema: tool.inputSchema,
      outputSchema: tool.outputSchema,
      category: this.getToolCategory(tool.type),
    }));
  }

  /**
   * 获取单个工具信息
   *
   * @param name 工具名称
   * @returns MCP 工具定义
   */
  getTool(name: string): MCPTool | undefined {
    try {
      const tool = this.toolRegistry.get(name as ToolType);
      return {
        name: tool.type,
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
        category: this.getToolCategory(tool.type),
      };
    } catch (error) {
      this.logger.warn(`Tool ${name} not found`);
      return undefined;
    }
  }

  /**
   * 调用工具
   * 将 MCP 工具调用转换为 DeepDive 工具执行
   *
   * @param name 工具名称
   * @param args 工具参数
   * @param context 执行上下文（可选）
   * @returns MCP 响应
   */
  async callTool(
    name: string,
    args: unknown,
    context?: Partial<ToolContext>,
  ): Promise<MCPResponse<unknown>> {
    try {
      // 获取工具
      const tool = this.toolRegistry.getOptional(name as ToolType);
      if (!tool) {
        return {
          error: {
            code: MCPErrorCode.TOOL_NOT_FOUND,
            message: `Tool '${name}' not found`,
          },
        };
      }

      // 构建执行上下文
      const taskId = context?.taskId || this.generateTaskId();
      const abortController = new AbortController();

      // 注册取消控制器
      if (this.options.enableCancellation) {
        this.abortControllers.set(taskId, abortController);
      }

      const toolContext: ToolContext = {
        taskId,
        userId: context?.userId,
        workspaceId: context?.workspaceId,
        timeout: context?.timeout,
        abortSignal: abortController.signal,
      };

      // 执行工具
      this.logger.log(`Calling tool: ${name}`, { args });
      const result = await tool.execute(args, toolContext);

      // 清理取消控制器
      if (this.options.enableCancellation) {
        this.abortControllers.delete(taskId);
      }

      // 转换结果
      if (result.success) {
        return {
          result: {
            data: result.data,
            duration: result.duration,
            metadata: result.metadata,
          },
        };
      } else {
        return {
          error: {
            code: MCPErrorCode.TOOL_EXECUTION_ERROR,
            message: result.error || "Tool execution failed",
            data: { duration: result.duration },
          },
        };
      }
    } catch (error) {
      this.logger.error(`Tool execution error: ${name}`, error);
      return {
        error: {
          code: MCPErrorCode.INTERNAL_ERROR,
          message: error instanceof Error ? error.message : "Unknown error",
        },
      };
    }
  }

  // ==================== 资源管理 ====================

  /**
   * 注册资源
   *
   * @param resource 资源定义
   */
  registerResource(resource: MCPResource): void {
    if (!this.options.enableResources) {
      this.logger.warn("Resources are disabled");
      return;
    }

    this.resources.set(resource.uri, resource);
    this.logger.log(`Resource registered: ${resource.uri}`);
  }

  /**
   * 列出所有资源
   *
   * @returns 资源列表
   */
  listResources(): MCPResource[] {
    if (!this.options.enableResources) {
      return [];
    }

    return Array.from(this.resources.values());
  }

  /**
   * 读取资源
   *
   * @param uri 资源 URI
   * @returns MCP 响应
   */
  async readResource(uri: string): Promise<MCPResponse<MCPResource>> {
    if (!this.options.enableResources) {
      return {
        error: {
          code: MCPErrorCode.METHOD_NOT_FOUND,
          message: "Resources are disabled",
        },
      };
    }

    const resource = this.resources.get(uri);
    if (!resource) {
      return {
        error: {
          code: MCPErrorCode.RESOURCE_NOT_FOUND,
          message: `Resource not found: ${uri}`,
        },
      };
    }

    return {
      result: resource,
    };
  }

  /**
   * 注销资源
   *
   * @param uri 资源 URI
   * @returns 是否成功
   */
  unregisterResource(uri: string): boolean {
    const result = this.resources.delete(uri);
    if (result) {
      this.logger.log(`Resource unregistered: ${uri}`);
    }
    return result;
  }

  // ==================== 提示模板管理 ====================

  /**
   * 注册提示模板
   *
   * @param prompt 提示定义
   */
  registerPrompt(prompt: MCPPrompt): void {
    if (!this.options.enablePrompts) {
      this.logger.warn("Prompts are disabled");
      return;
    }

    this.prompts.set(prompt.name, prompt);
    this.logger.log(`Prompt registered: ${prompt.name}`);
  }

  /**
   * 列出所有提示模板
   *
   * @returns 提示列表
   */
  listPrompts(): MCPPrompt[] {
    if (!this.options.enablePrompts) {
      return [];
    }

    return Array.from(this.prompts.values());
  }

  /**
   * 获取提示模板
   *
   * @param name 提示名称
   * @returns 提示定义
   */
  getPrompt(name: string): MCPPrompt | undefined {
    if (!this.options.enablePrompts) {
      return undefined;
    }

    return this.prompts.get(name);
  }

  /**
   * 渲染提示模板
   *
   * @param name 提示名称
   * @param args 参数
   * @returns 渲染后的提示内容
   */
  renderPrompt(name: string, args: Record<string, unknown>): string | null {
    const prompt = this.getPrompt(name);
    if (!prompt?.template) {
      return null;
    }

    // 简单的模板替换
    let rendered = prompt.template;
    for (const [key, value] of Object.entries(args)) {
      rendered = rendered.replace(
        new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g"),
        String(value),
      );
    }

    return rendered;
  }

  // ==================== 进度报告 ====================

  /**
   * 注册进度回调
   *
   * @param token 进度令牌
   * @param callback 回调函数
   */
  onProgress(token: string, callback: ProgressCallback): void {
    if (!this.options.enableProgress) {
      this.logger.warn("Progress reporting is disabled");
      return;
    }

    this.progressCallbacks.set(token, callback);
  }

  /**
   * 报告进度
   *
   * @param token 进度令牌
   * @param progress 进度百分比 (0-100)
   * @param message 进度消息
   * @param total 总数（可选）
   */
  reportProgress(
    token: string,
    progress: number,
    message?: string,
    total?: number,
  ): void {
    if (!this.options.enableProgress) {
      return;
    }

    const callback = this.progressCallbacks.get(token);
    if (callback) {
      callback({
        token,
        progress: Math.min(100, Math.max(0, progress)),
        message,
        total,
      });
    }
  }

  /**
   * 移除进度回调
   *
   * @param token 进度令牌
   */
  removeProgressCallback(token: string): void {
    this.progressCallbacks.delete(token);
  }

  // ==================== 取消机制 ====================

  /**
   * 取消工具执行
   *
   * @param taskId 任务 ID
   * @param reason 取消原因
   * @returns 是否成功取消
   */
  cancelExecution(taskId: string, reason?: string): boolean {
    if (!this.options.enableCancellation) {
      this.logger.warn("Cancellation is disabled");
      return false;
    }

    const abortController = this.abortControllers.get(taskId);
    if (abortController) {
      abortController.abort(reason);
      this.abortControllers.delete(taskId);
      this.logger.log(`Execution cancelled: ${taskId}`, { reason });
      return true;
    }

    return false;
  }

  // ==================== 通用请求处理 ====================

  /**
   * 处理 MCP 请求
   * 通用的请求路由和处理
   *
   * @param request MCP 请求
   * @returns MCP 响应
   */
  async handleRequest(request: MCPRequest): Promise<MCPResponse> {
    try {
      const { method, params } = request;

      switch (method) {
        case "tools/list":
          return { id: request.id, result: this.listTools() };

        case "tools/call":
          if (!this.isValidToolCallParams(params)) {
            return {
              id: request.id,
              error: {
                code: MCPErrorCode.INVALID_PARAMS,
                message: "Invalid tool call parameters",
              },
            };
          }
          return {
            id: request.id,
            ...(await this.callTool(params.name, params.arguments)),
          };

        case "resources/list":
          return { id: request.id, result: this.listResources() };

        case "resources/read":
          if (!this.isValidResourceReadParams(params)) {
            return {
              id: request.id,
              error: {
                code: MCPErrorCode.INVALID_PARAMS,
                message: "Invalid resource read parameters",
              },
            };
          }
          return {
            id: request.id,
            ...(await this.readResource(params.uri)),
          };

        case "prompts/list":
          return { id: request.id, result: this.listPrompts() };

        case "prompts/get":
          if (!this.isValidPromptGetParams(params)) {
            return {
              id: request.id,
              error: {
                code: MCPErrorCode.INVALID_PARAMS,
                message: "Invalid prompt get parameters",
              },
            };
          }
          const prompt = this.getPrompt(params.name);
          if (!prompt) {
            return {
              id: request.id,
              error: {
                code: MCPErrorCode.METHOD_NOT_FOUND,
                message: `Prompt not found: ${params.name}`,
              },
            };
          }
          return { id: request.id, result: prompt };

        default:
          return {
            id: request.id,
            error: {
              code: MCPErrorCode.METHOD_NOT_FOUND,
              message: `Unknown method: ${method}`,
            },
          };
      }
    } catch (error) {
      this.logger.error("Request handling error", error);
      return {
        id: request.id,
        error: {
          code: MCPErrorCode.INTERNAL_ERROR,
          message: error instanceof Error ? error.message : "Unknown error",
        },
      };
    }
  }

  // ==================== 工具方法 ====================

  /**
   * 获取工具类别
   */
  private getToolCategory(toolType: ToolType): string {
    if (
      [
        ToolType.WEB_SEARCH,
        ToolType.WEB_SCRAPER,
        ToolType.DATA_FETCH,
        ToolType.RAG_SEARCH,
      ].includes(toolType)
    ) {
      return "information";
    }
    if (
      [
        ToolType.TEXT_GENERATION,
        ToolType.IMAGE_GENERATION,
        ToolType.CODE_GENERATION,
      ].includes(toolType)
    ) {
      return "generation";
    }
    if (
      [
        ToolType.DATA_ANALYSIS,
        ToolType.FILE_CONVERSION,
        ToolType.FILE_PARSER,
      ].includes(toolType)
    ) {
      return "processing";
    }
    if (toolType === ToolType.PYTHON_EXECUTOR) {
      return "execution";
    }
    if (
      [ToolType.SHORT_TERM_MEMORY, ToolType.LONG_TERM_MEMORY].includes(toolType)
    ) {
      return "memory";
    }
    if (
      [
        ToolType.EXPORT_PPTX,
        ToolType.EXPORT_DOCX,
        ToolType.EXPORT_PDF,
        ToolType.EXPORT_IMAGE,
      ].includes(toolType)
    ) {
      return "export";
    }
    if ([ToolType.AGENT_HANDOFF, ToolType.HUMAN_APPROVAL].includes(toolType)) {
      return "collaboration";
    }
    return "unknown";
  }

  /**
   * 生成任务 ID
   */
  private generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 验证工具调用参数
   */
  private isValidToolCallParams(
    params: unknown,
  ): params is { name: string; arguments: unknown } {
    return (
      typeof params === "object" &&
      params !== null &&
      "name" in params &&
      typeof params.name === "string" &&
      "arguments" in params
    );
  }

  /**
   * 验证资源读取参数
   */
  private isValidResourceReadParams(
    params: unknown,
  ): params is { uri: string } {
    return (
      typeof params === "object" &&
      params !== null &&
      "uri" in params &&
      typeof params.uri === "string"
    );
  }

  /**
   * 验证提示获取参数
   */
  private isValidPromptGetParams(params: unknown): params is { name: string } {
    return (
      typeof params === "object" &&
      params !== null &&
      "name" in params &&
      typeof params.name === "string"
    );
  }

  // ==================== 统计信息 ====================

  /**
   * 获取适配器统计信息
   */
  getStats(): {
    tools: number;
    resources: number;
    prompts: number;
    activeExecutions: number;
    activeProgressCallbacks: number;
  } {
    return {
      tools: this.toolRegistry.getAll().length,
      resources: this.resources.size,
      prompts: this.prompts.size,
      activeExecutions: this.abortControllers.size,
      activeProgressCallbacks: this.progressCallbacks.size,
    };
  }
}
