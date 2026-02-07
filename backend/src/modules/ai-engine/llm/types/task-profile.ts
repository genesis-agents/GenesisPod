/**
 * TaskProfile - AI App 使用语义化任务描述，AI Engine 处理参数映射
 *
 * 设计原则：
 * - AI App 层描述任务需求（WHAT）
 * - AI Engine 层处理模型细节（HOW）
 *
 * 使用示例：
 * ```typescript
 * // 推荐方式：使用 TaskProfile
 * await aiChatService.chat({
 *   messages,
 *   modelType: AIModelType.CHAT,
 *   taskProfile: {
 *     creativity: "low",        // 分析任务需要低创意
 *     outputLength: "medium",   // 中等长度输出
 *   },
 * });
 *
 * // 兼容方式：直接参数（优先级最高）
 * await aiChatService.chat({
 *   messages,
 *   temperature: 0.3,
 *   maxTokens: 4000,
 * });
 * ```
 */

/**
 * 创意度等级 - AI Engine 映射到 temperature 等参数
 *
 * | 等级 | temperature | 适用场景 |
 * |------|-------------|----------|
 * | deterministic | 0.1 | 分类、提取、JSON 解析 |
 * | low | 0.3 | 分析、总结、评估 |
 * | medium | 0.7 | 对话、研究、规划 |
 * | high | 0.9 | 创意写作、头脑风暴 |
 */
export type CreativityLevel = "deterministic" | "low" | "medium" | "high";

/**
 * 输出长度等级 - AI Engine 映射到 maxTokens
 *
 * | 等级 | maxTokens | 适用场景 |
 * |------|-----------|----------|
 * | minimal | 500 | 是/否判断、分类标签 |
 * | short | 1500 | 摘要、简短回复 |
 * | medium | 4000 | 详细分析、标准对话 |
 * | standard | 6000 | 中长内容、编辑任务 |
 * | long | 8000 | 报告、章节、全面分析 |
 * | extended | 16000 | 超长内容、推理模型 |
 */
export type OutputLengthLevel =
  | "minimal"
  | "short"
  | "medium"
  | "standard"
  | "long"
  | "extended";

/**
 * 任务类型 - 辅助参数优化（Phase 2 实现）
 */
export type TaskType =
  | "extraction" // 实体提取、解析
  | "analysis" // 深度分析、评估
  | "conversation" // 对话、问答
  | "writing" // 内容创作
  | "reflection"; // 自我评估、元认知

/**
 * 输出格式 - 影响 temperature 调整（Phase 2 实现）
 */
export type OutputFormat =
  | "json" // 结构化 JSON（需要更低 temperature）
  | "markdown" // 格式化 Markdown
  | "plaintext" // 纯文本
  | "text"; // 纯文本（别名，兼容 facade.types.ts）

/**
 * 聊天消息
 * 统一类型定义，所有模块应从此处导入
 */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  name?: string;
}

/**
 * 任务配置 - AI App 用语义化方式描述任务需求
 *
 * AI Engine 根据 TaskProfile 和选定模型的特性，
 * 自动映射为具体的模型参数（temperature, maxTokens 等）
 */
export interface TaskProfile {
  /**
   * 创意度等级
   * AI Engine 映射到 temperature 等参数
   * 不同模型的映射可能不同（某些模型不支持 temperature）
   */
  creativity?: CreativityLevel;

  /**
   * 输出长度等级
   * AI Engine 映射到 maxTokens
   * 推理模型会自动调整为更高值（至少 8000）
   */
  outputLength?: OutputLengthLevel;

  /**
   * 任务类型（Phase 2 实现）
   * 辅助 AI Engine 优化参数选择
   */
  taskType?: TaskType;

  /**
   * 输出格式（Phase 2 实现）
   * JSON 格式会自动降低 temperature 以确保结构稳定
   */
  outputFormat?: OutputFormat;

  /**
   * 响应格式（别名，兼容旧代码）
   * @deprecated 使用 outputFormat 替代
   */
  responseFormat?: OutputFormat;
}

/**
 * 创意度到 temperature 的映射常量
 * AI Engine 内部使用，AI App 不应直接使用
 */
export const CREATIVITY_TO_TEMPERATURE: Record<CreativityLevel, number> = {
  deterministic: 0.1,
  low: 0.3,
  medium: 0.7,
  high: 0.9,
};

/**
 * 输出长度到 maxTokens 的映射常量
 * AI Engine 内部使用，AI App 不应直接使用
 */
export const OUTPUT_LENGTH_TO_TOKENS: Record<OutputLengthLevel, number> = {
  minimal: 500,
  short: 1500,
  medium: 4000,
  standard: 6000,
  long: 8000,
  extended: 16000,
};

/**
 * 推理模型的最小 token 数
 *
 * ★ 重要：推理模型（如 o1, o3, GPT-5.x）会将大部分 completion tokens
 * 用于内部推理（Chain of Thought），实际输出内容可能只占 10-20%。
 *
 * 例如：如果 max_completion_tokens=12000，模型可能用 12000 全部用于推理，
 * 导致 content="" 空输出。
 *
 * 建议：推理模型至少需要 25000+ tokens 才能有足够空间输出内容。
 */
export const REASONING_MODEL_MIN_TOKENS = 25000;

/**
 * JSON 输出格式的最大 temperature
 * 确保输出结构稳定
 */
export const JSON_OUTPUT_MAX_TEMPERATURE = 0.3;

/**
 * 已知模型的实际最大 output tokens 限制
 *
 * ★ 用于兜底校验：即使数据库 maxTokens 配置错误，也不会超过 API 实际限制
 * 使用 Array 而非 Record，因为需要有序前缀匹配（如 gpt-4o-mini 必须在 gpt-4o 之前）
 *
 * 格式：[模型名称前缀(小写), 最大 output tokens]
 */
export const MODEL_KNOWN_LIMITS: Array<[string, number]> = [
  // OpenAI
  ["gpt-4o-mini", 16384],
  ["gpt-4o", 16384],
  ["gpt-4-turbo", 4096],
  ["gpt-4", 8192],
  ["o1-mini", 65536],
  ["o1-pro", 100000],
  ["o1", 100000],
  ["o3-mini", 65536],
  ["o3", 100000],
  ["o4-mini", 100000],
  // Anthropic
  ["claude-sonnet-4", 16384],
  ["claude-opus-4", 16384],
  ["claude-3.5-sonnet", 8192],
  ["claude-3.5-haiku", 8192],
  ["claude-3-opus", 4096],
  ["claude-3-sonnet", 8192],
  ["claude-3-haiku", 4096],
  // Google Gemini
  ["gemini-2.5", 65536],
  ["gemini-2.0", 8192],
  ["gemini-3", 65536],
  // xAI
  ["grok-3", 131072],
  ["grok-4", 16384],
  // DeepSeek
  ["deepseek-reasoner", 65536],
  ["deepseek-chat", 8192],
];
