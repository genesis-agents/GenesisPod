/**
 * Tool 接口定义
 * 工具系统 - Agent 可调用的各种工具
 */

import { ToolType } from "../agent/agent.types";
import { ToolError, ToolErrorCode, ToolErrorDetails } from "../errors";
import { SchemaValidator, ValidationResult } from "../validation";

/**
 * JSON Schema 类型（简化版）
 */
export interface JSONSchema {
  type?: "object" | "string" | "number" | "boolean" | "array";
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  description?: string;
  enum?: string[];
  default?: unknown;
  // Additional JSON Schema properties
  format?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  pattern?: string;
  additionalProperties?: JSONSchema | boolean;
  oneOf?: JSONSchema[];
  anyOf?: JSONSchema[];
  allOf?: JSONSchema[];
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
   * 错误信息（简单字符串，向后兼容）
   */
  error?: string;

  /**
   * 详细错误信息（新增）
   */
  errorDetails?: ToolErrorDetails;

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
   * Schema 验证器实例
   */
  private readonly schemaValidator = new SchemaValidator();

  /**
   * 是否启用严格 Schema 验证
   * 子类可覆盖为 false 以使用自定义验证
   */
  protected strictValidation = true;

  /**
   * 执行工具
   */
  async execute(
    input: TInput,
    context: ToolContext,
  ): Promise<ToolResult<TOutput>> {
    const startTime = Date.now();

    try {
      // 检查取消信号
      if (context.abortSignal?.aborted) {
        const error = ToolError.cancelled(
          "Execution cancelled before start",
          this.type,
        );
        return {
          success: false,
          error: error.message,
          errorDetails: error.toDetails(),
          duration: Date.now() - startTime,
        };
      }

      // 验证输入
      const validationResult = this.validateInputWithSchema(input);
      if (!validationResult.valid) {
        const error = new ToolError(
          ToolErrorCode.VALIDATION_ERROR,
          this.schemaValidator.getErrorMessages(validationResult).join("; "),
          {
            source: this.type,
            details: { errors: validationResult.errors, input },
          },
        );
        return {
          success: false,
          error: error.message,
          errorDetails: error.toDetails(),
          duration: Date.now() - startTime,
        };
      }

      // 设置超时
      const timeout = context.timeout || this.defaultTimeout;
      const timeoutPromise = new Promise<never>((_, reject) => {
        const timeoutId = setTimeout(() => {
          reject(ToolError.timeout(timeout, this.type));
        }, timeout);

        // 支持取消时清除超时
        context.abortSignal?.addEventListener("abort", () => {
          clearTimeout(timeoutId);
          reject(ToolError.cancelled(context.abortSignal?.reason, this.type));
        });
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
      // 转换为 ToolError
      const toolError = ToolError.fromError(
        error instanceof Error ? error : new Error(String(error)),
        this.classifyError(error),
        this.type,
      );

      return {
        success: false,
        error: toolError.message,
        errorDetails: toolError.toDetails(),
        duration: Date.now() - startTime,
        metadata: {
          retryable: toolError.retryable,
          retryAfter: toolError.retryAfter,
        },
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
   * 使用 Schema 验证输入
   * 结合 JSONSchema 验证和自定义验证
   */
  validateInputWithSchema(input: TInput): ValidationResult {
    // 首先进行 Schema 验证
    if (this.strictValidation) {
      const schemaResult = this.schemaValidator.validate(
        input,
        this.inputSchema,
      );
      if (!schemaResult.valid) {
        return schemaResult;
      }
    }

    // 然后进行自定义验证
    if (!this.validateInput(input)) {
      return {
        valid: false,
        errors: [
          {
            path: "",
            message: "Custom validation failed",
            code: "type_mismatch" as any,
          },
        ],
      };
    }

    return { valid: true, errors: [] };
  }

  /**
   * 验证输入 - 默认返回 true，子类可覆盖进行自定义验证
   */
  validateInput(_input: TInput): boolean {
    return true;
  }

  /**
   * 分类错误类型
   * 子类可覆盖以提供更精确的错误分类
   */
  protected classifyError(error: unknown): ToolErrorCode {
    if (error instanceof ToolError) {
      return error.code;
    }

    const message = error instanceof Error ? error.message.toLowerCase() : "";

    if (message.includes("timeout")) {
      return ToolErrorCode.EXECUTION_TIMEOUT;
    }
    if (message.includes("cancelled") || message.includes("aborted")) {
      return ToolErrorCode.EXECUTION_CANCELLED;
    }
    if (message.includes("permission") || message.includes("forbidden")) {
      return ToolErrorCode.PERMISSION_DENIED;
    }
    if (message.includes("not found")) {
      return ToolErrorCode.RESOURCE_NOT_FOUND;
    }
    if (message.includes("rate limit") || message.includes("too many")) {
      return ToolErrorCode.RATE_LIMIT_EXCEEDED;
    }

    return ToolErrorCode.EXECUTION_FAILED;
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
  [ToolType.VIDEO_GENERATION]: {
    type: ToolType.VIDEO_GENERATION,
    name: "视频生成",
    description: "使用 AI 生成视频内容",
    icon: "🎬",
    category: "generation",
  },
  [ToolType.SHELL_EXECUTOR]: {
    type: ToolType.SHELL_EXECUTOR,
    name: "Shell 命令执行",
    description: "在安全沙箱中执行 Shell 命令",
    icon: "🐚",
    category: "execution",
  },
  [ToolType.CONTAINER_EXECUTOR]: {
    type: ToolType.CONTAINER_EXECUTOR,
    name: "容器执行",
    description: "在 Docker 容器中执行代码",
    icon: "🐳",
    category: "execution",
  },
  [ToolType.MESSAGE_PUSH]: {
    type: ToolType.MESSAGE_PUSH,
    name: "消息推送",
    description: "发送消息到各种渠道",
    icon: "📨",
    category: "integration",
  },
  [ToolType.CLOUD_STORAGE]: {
    type: ToolType.CLOUD_STORAGE,
    name: "云存储",
    description: "上传和管理云存储文件",
    icon: "☁️",
    category: "integration",
  },
  [ToolType.GITHUB_INTEGRATION]: {
    type: ToolType.GITHUB_INTEGRATION,
    name: "GitHub 集成",
    description: "与 GitHub 仓库交互",
    icon: "🐙",
    category: "integration",
  },
  [ToolType.EMAIL_SENDER]: {
    type: ToolType.EMAIL_SENDER,
    name: "邮件发送",
    description: "发送电子邮件",
    icon: "📧",
    category: "integration",
  },
  [ToolType.CALENDAR_INTEGRATION]: {
    type: ToolType.CALENDAR_INTEGRATION,
    name: "日历集成",
    description: "管理日历事件和提醒",
    icon: "📅",
    category: "integration",
  },
  [ToolType.WEBHOOK_TRIGGER]: {
    type: ToolType.WEBHOOK_TRIGGER,
    name: "Webhook 触发",
    description: "触发外部 Webhook",
    icon: "🔗",
    category: "integration",
  },
  [ToolType.ENTITY_MEMORY]: {
    type: ToolType.ENTITY_MEMORY,
    name: "实体记忆",
    description: "记忆和检索实体信息",
    icon: "👤",
    category: "memory",
  },
  [ToolType.KNOWLEDGE_BASE]: {
    type: ToolType.KNOWLEDGE_BASE,
    name: "知识库",
    description: "管理和查询知识库内容",
    icon: "📚",
    category: "memory",
  },
  [ToolType.USER_PREFERENCES]: {
    type: ToolType.USER_PREFERENCES,
    name: "用户偏好",
    description: "存储和检索用户偏好设置",
    icon: "⚙️",
    category: "memory",
  },
  [ToolType.AGENT_COMMUNICATION]: {
    type: ToolType.AGENT_COMMUNICATION,
    name: "Agent 通信",
    description: "Agent 之间的消息通信",
    icon: "💬",
    category: "collaboration",
  },
  [ToolType.TASK_DELEGATION]: {
    type: ToolType.TASK_DELEGATION,
    name: "任务委派",
    description: "将子任务委派给其他 Agent",
    icon: "📋",
    category: "collaboration",
  },
  [ToolType.CONSENSUS_MECHANISM]: {
    type: ToolType.CONSENSUS_MECHANISM,
    name: "共识机制",
    description: "多 Agent 投票和共识决策",
    icon: "🗳️",
    category: "collaboration",
  },
  [ToolType.WORKFLOW_ORCHESTRATION]: {
    type: ToolType.WORKFLOW_ORCHESTRATION,
    name: "工作流编排",
    description: "编排和管理复杂工作流",
    icon: "🔀",
    category: "collaboration",
  },
};
