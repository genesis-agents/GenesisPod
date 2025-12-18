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
 * OpenAI Function Calling 格式定义
 * 用于 LLM 自主选择工具
 */
export interface FunctionDefinition {
  /**
   * 函数名称（对应工具类型）
   */
  name: string;

  /**
   * 函数描述（帮助 LLM 理解何时使用此工具）
   */
  description: string;

  /**
   * 参数 Schema
   */
  parameters: JSONSchema;
}

/**
 * 工具调用请求（LLM 返回的工具调用）
 */
export interface ToolCallRequest {
  /**
   * 调用 ID（用于匹配结果）
   */
  id: string;

  /**
   * 工具名称
   */
  name: string;

  /**
   * 工具参数（JSON 字符串）
   */
  arguments: string;
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

  /**
   * 转换为 Function Calling 格式
   * 用于 LLM 自主选择工具
   *
   * @returns Function 定义
   */
  toFunctionDefinition(): FunctionDefinition;
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

  /**
   * 转换为 OpenAI Function Calling 格式
   * 使 LLM 能够自主选择和调用此工具
   */
  toFunctionDefinition(): FunctionDefinition {
    return {
      name: this.type,
      description: this.description,
      parameters: this.inputSchema,
    };
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
  [ToolType.RAG_SEARCH]: {
    type: ToolType.RAG_SEARCH,
    name: "RAG 搜索",
    description: "基于向量数据库的语义搜索",
    icon: "🔎",
    category: "information",
  },
  [ToolType.DATABASE_QUERY]: {
    type: ToolType.DATABASE_QUERY,
    name: "数据库查询",
    description: "执行只读 SQL 查询，获取结构化数据",
    icon: "🗄️",
    category: "information",
  },
  [ToolType.KNOWLEDGE_GRAPH]: {
    type: ToolType.KNOWLEDGE_GRAPH,
    name: "知识图谱查询",
    description: "查询实体关系和知识图谱",
    icon: "🕸️",
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
  [ToolType.AUDIO_GENERATION]: {
    type: ToolType.AUDIO_GENERATION,
    name: "音频生成",
    description: "将文本转换为语音音频（TTS）",
    icon: "🔊",
    category: "generation",
  },
  [ToolType.STRUCTURED_OUTPUT]: {
    type: ToolType.STRUCTURED_OUTPUT,
    name: "结构化输出",
    description: "生成 JSON、YAML、XML 等结构化数据",
    icon: "📋",
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
  [ToolType.FILE_PARSER]: {
    type: ToolType.FILE_PARSER,
    name: "文件解析",
    description: "解析 PDF、Word、Excel、PPT 等文件内容",
    icon: "📝",
    category: "processing",
  },
  [ToolType.DATA_VALIDATION]: {
    type: ToolType.DATA_VALIDATION,
    name: "数据验证",
    description: "验证数据的合法性和完整性",
    icon: "✅",
    category: "processing",
  },
  [ToolType.DATA_CLEANING]: {
    type: ToolType.DATA_CLEANING,
    name: "数据清洗",
    description: "清洗和预处理数据",
    icon: "🧹",
    category: "processing",
  },
  [ToolType.DOCUMENT_DIFF]: {
    type: ToolType.DOCUMENT_DIFF,
    name: "文档对比",
    description: "对比两个文档或文本的差异",
    icon: "🔍",
    category: "processing",
  },
  [ToolType.TEMPLATE_RENDER]: {
    type: ToolType.TEMPLATE_RENDER,
    name: "模板渲染",
    description: "使用变量渲染模板内容",
    icon: "📋",
    category: "processing",
  },

  // 代码执行
  [ToolType.PYTHON_EXECUTOR]: {
    type: ToolType.PYTHON_EXECUTOR,
    name: "Python 代码执行",
    description: "在安全沙箱中执行 Python 代码",
    icon: "🐍",
    category: "execution",
  },
  [ToolType.JAVASCRIPT_EXECUTOR]: {
    type: ToolType.JAVASCRIPT_EXECUTOR,
    name: "JavaScript 代码执行",
    description: "在安全沙箱中执行 JavaScript 代码",
    icon: "📜",
    category: "execution",
  },
  [ToolType.SQL_EXECUTOR]: {
    type: ToolType.SQL_EXECUTOR,
    name: "SQL 查询执行",
    description: "执行 SQL 查询并返回结构化结果",
    icon: "🗄️",
    category: "execution",
  },
  [ToolType.OCR_RECOGNITION]: {
    type: ToolType.OCR_RECOGNITION,
    name: "OCR 文字识别",
    description: "从图片中提取文字内容",
    icon: "🔍",
    category: "execution",
  },

  // 记忆管理
  [ToolType.SHORT_TERM_MEMORY]: {
    type: ToolType.SHORT_TERM_MEMORY,
    name: "短期记忆",
    description: "会话级别的临时记忆存储",
    icon: "🧠",
    category: "memory",
  },
  [ToolType.LONG_TERM_MEMORY]: {
    type: ToolType.LONG_TERM_MEMORY,
    name: "长期记忆",
    description: "持久化记忆存储和检索",
    icon: "💾",
    category: "memory",
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

  // 协作
  [ToolType.AGENT_HANDOFF]: {
    type: ToolType.AGENT_HANDOFF,
    name: "Agent 委派",
    description: "将任务委派给其他专业 Agent",
    icon: "🤝",
    category: "collaboration",
  },
  [ToolType.HUMAN_APPROVAL]: {
    type: ToolType.HUMAN_APPROVAL,
    name: "人类审批",
    description: "请求人类审批或反馈",
    icon: "✋",
    category: "collaboration",
  },
};
