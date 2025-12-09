/**
 * Tool 接口定义
 * 工具系统 - Agent 可调用的各种工具
 */

import { ToolType } from "./agent.types";

/**
 * JSON Schema 类型（简化版）
 */
export interface JSONSchema {
  type: "object" | "string" | "number" | "boolean" | "array";
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  description?: string;
  enum?: string[];
  default?: unknown;
}

/**
 * 工具执行上下文
 */
export interface ToolContext {
  /**
   * 任务 ID
   */
  taskId: string;

  /**
   * 用户 ID
   */
  userId?: string;

  /**
   * 工作空间 ID
   */
  workspaceId?: string;

  /**
   * 超时时间（毫秒）
   */
  timeout?: number;

  /**
   * 中止信号
   */
  abortSignal?: AbortSignal;
}

/**
 * 工具执行结果
 */
export interface ToolResult<T = unknown> {
  /**
   * 是否成功
   */
  success: boolean;

  /**
   * 结果数据
   */
  data?: T;

  /**
   * 错误信息
   */
  error?: string;

  /**
   * 执行时间（毫秒）
   */
  duration: number;

  /**
   * 元数据
   */
  metadata?: Record<string, unknown>;
}

/**
 * 工具接口
 * 所有工具都必须实现此接口
 *
 * @example
 * ```typescript
 * class WebSearchTool implements ITool {
 *   readonly type = ToolType.WEB_SEARCH;
 *   readonly name = 'Web Search';
 *
 *   async execute(input: SearchInput, context: ToolContext): Promise<ToolResult<SearchResult[]>> {
 *     // 执行网络搜索
 *   }
 * }
 * ```
 */
export interface ITool<TInput = unknown, TOutput = unknown> {
  /**
   * 工具类型
   */
  readonly type: ToolType;

  /**
   * 工具名称
   */
  readonly name: string;

  /**
   * 工具描述
   */
  readonly description: string;

  /**
   * 输入参数 Schema
   */
  readonly inputSchema: JSONSchema;

  /**
   * 输出结果 Schema
   */
  readonly outputSchema: JSONSchema;

  /**
   * 执行工具
   *
   * @param input 输入参数
   * @param context 执行上下文
   * @returns 执行结果
   */
  execute(input: TInput, context: ToolContext): Promise<ToolResult<TOutput>>;

  /**
   * 验证输入
   *
   * @param input 输入参数
   * @returns 是否有效
   */
  validateInput?(input: TInput): boolean;
}

/**
 * 工具基类
 * 提供通用实现
 */
export abstract class BaseTool<TInput = unknown, TOutput = unknown>
  implements ITool<TInput, TOutput>
{
  abstract readonly type: ToolType;
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly inputSchema: JSONSchema;
  abstract readonly outputSchema: JSONSchema;

  /**
   * 默认超时时间（30秒）
   */
  protected defaultTimeout = 30000;

  /**
   * 执行工具
   */
  async execute(
    input: TInput,
    context: ToolContext,
  ): Promise<ToolResult<TOutput>> {
    const startTime = Date.now();

    try {
      // 验证输入
      if (!this.validateInput(input)) {
        return {
          success: false,
          error: "Invalid input",
          duration: Date.now() - startTime,
        };
      }

      // 设置超时
      const timeout = context.timeout || this.defaultTimeout;
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Tool execution timeout")), timeout);
      });

      // 执行任务
      const result = await Promise.race([
        this.doExecute(input, context),
        timeoutPromise,
      ]);

      return {
        success: true,
        data: result,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 实际执行逻辑 - 子类必须实现
   */
  protected abstract doExecute(
    input: TInput,
    context: ToolContext,
  ): Promise<TOutput>;

  /**
   * 验证输入 - 默认返回 true，子类可覆盖
   */
  validateInput(_input: TInput): boolean {
    return true;
  }
}

/**
 * 工具配置
 */
export interface ToolConfig {
  type: ToolType;
  name: string;
  description: string;
  icon?: string;
  category?: string;
}

/**
 * 预定义的工具配置
 */
export const TOOL_CONFIGS: Record<ToolType, ToolConfig> = {
  // 信息获取
  [ToolType.WEB_SEARCH]: {
    type: ToolType.WEB_SEARCH,
    name: "网络搜索",
    description: "搜索互联网获取最新信息",
    icon: "🔍",
    category: "information",
  },
  [ToolType.WEB_SCRAPER]: {
    type: ToolType.WEB_SCRAPER,
    name: "网页抓取",
    description: "抓取并解析网页内容",
    icon: "🌐",
    category: "information",
  },
  [ToolType.DATA_FETCH]: {
    type: ToolType.DATA_FETCH,
    name: "数据获取",
    description: "从数据源获取数据",
    icon: "📥",
    category: "information",
  },

  // 内容生成
  [ToolType.TEXT_GENERATION]: {
    type: ToolType.TEXT_GENERATION,
    name: "文本生成",
    description: "使用 AI 生成文本内容",
    icon: "✍️",
    category: "generation",
  },
  [ToolType.IMAGE_GENERATION]: {
    type: ToolType.IMAGE_GENERATION,
    name: "图像生成",
    description: "使用 AI 生成图像",
    icon: "🖼️",
    category: "generation",
  },
  [ToolType.CODE_GENERATION]: {
    type: ToolType.CODE_GENERATION,
    name: "代码生成",
    description: "使用 AI 生成代码",
    icon: "💻",
    category: "generation",
  },

  // 数据处理
  [ToolType.DATA_ANALYSIS]: {
    type: ToolType.DATA_ANALYSIS,
    name: "数据分析",
    description: "分析和处理数据",
    icon: "📊",
    category: "processing",
  },
  [ToolType.FILE_CONVERSION]: {
    type: ToolType.FILE_CONVERSION,
    name: "文件转换",
    description: "转换文件格式",
    icon: "🔄",
    category: "processing",
  },

  // 导出
  [ToolType.EXPORT_PPTX]: {
    type: ToolType.EXPORT_PPTX,
    name: "导出 PPTX",
    description: "导出为 PowerPoint 文件",
    icon: "📊",
    category: "export",
  },
  [ToolType.EXPORT_DOCX]: {
    type: ToolType.EXPORT_DOCX,
    name: "导出 DOCX",
    description: "导出为 Word 文件",
    icon: "📄",
    category: "export",
  },
  [ToolType.EXPORT_PDF]: {
    type: ToolType.EXPORT_PDF,
    name: "导出 PDF",
    description: "导出为 PDF 文件",
    icon: "📕",
    category: "export",
  },
  [ToolType.EXPORT_IMAGE]: {
    type: ToolType.EXPORT_IMAGE,
    name: "导出图片",
    description: "导出为图片文件",
    icon: "🖼️",
    category: "export",
  },
};
