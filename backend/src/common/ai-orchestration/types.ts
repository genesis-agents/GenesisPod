/**
 * AI Orchestration Types
 *
 * 统一的类型定义，供所有 AI 相关模块使用
 */

import { AIModelType } from "@prisma/client";

/**
 * AI 任务类型
 */
export enum AiTaskType {
  // 文本任务
  CHAT = "chat", // 对话
  COMPLETION = "completion", // 文本补全
  SUMMARIZATION = "summarization", // 摘要
  TRANSLATION = "translation", // 翻译
  EXTRACTION = "extraction", // 信息提取

  // 图像任务
  IMAGE_GENERATION = "image_generation", // 图像生成
  IMAGE_EDITING = "image_editing", // 图像编辑

  // 复合任务
  MULTIMODAL = "multimodal", // 多模态（文本+图像）
}

/**
 * 聊天消息格式
 */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  name?: string; // 可选的发送者名称（用于多 AI 对话）
}

/**
 * AI 模型配置
 */
export interface AiModelConfig {
  id: string;
  name: string;
  displayName: string;
  provider: string;
  modelId: string;
  modelType: AIModelType;
  apiKey: string;
  /** ★ Secret Manager 密钥名称，优先于 apiKey */
  secretKey?: string;
  apiEndpoint?: string;
  capabilities?: string[];
}

/**
 * AI 调用元数据
 */
export interface AiCallMetadata {
  source?: string; // 调用来源模块
  userId?: string;
  requestId?: string;
  sessionId?: string;
  [key: string]: unknown;
}

/**
 * AI 调用输入参数
 */
export interface AiCallInput {
  // 任务类型
  taskType: AiTaskType;

  // 消息（用于对话类任务）
  messages?: ChatMessage[];

  // 提示词（用于生成类任务）
  prompt?: string;

  // 系统提示词
  systemPrompt?: string;

  // 模型选择（可选，不指定则自动选择）
  modelId?: string;

  // 模型选择策略
  strategy?: ModelSelectionStrategy;

  // 生成参数
  maxTokens?: number;
  temperature?: number;

  // 任务配置：语义化方式描述任务需求，AI Engine 自动映射参数
  taskProfile?: {
    creativity?: "deterministic" | "low" | "medium" | "high";
    outputLength?:
      | "minimal"
      | "short"
      | "medium"
      | "standard"
      | "long"
      | "extended";
  };

  // 图像生成参数
  imageOptions?: {
    aspectRatio?: "16:9" | "4:3" | "1:1" | "9:16";
    style?: string;
    negativePrompt?: string;
  };

  // 元数据（用于追踪和分析）
  metadata?: AiCallMetadata;
}

/**
 * AI 调用结果
 */
export interface AiCallResult {
  // 是否成功
  success: boolean;

  // 文本内容
  content?: string;

  // 图像数据（base64 或 URL）
  images?: Array<{
    url: string;
    width?: number;
    height?: number;
    mimeType?: string;
  }>;

  // 使用的模型
  model: string;
  provider: string;

  // Token 使用量
  tokensUsed: number;

  // 错误信息
  error?: string;
  errorType?: string; // AIErrorType

  // 降级信息
  fallbackUsed?: boolean;
  fallbackReason?: string;

  // 延迟（毫秒）
  latencyMs: number;

  // 追踪 ID
  traceId?: string;
}

/**
 * 模型选择策略
 */
export enum ModelSelectionStrategy {
  DEFAULT = "default", // 使用默认模型
  COST_OPTIMIZED = "cost_optimized", // 成本优化（优先使用便宜模型）
  QUALITY_FIRST = "quality_first", // 质量优先（优先使用高质量模型）
  SPEED_FIRST = "speed_first", // 速度优先（优先使用快速模型）
  ROUND_ROBIN = "round_robin", // 轮询（负载均衡）
}

/**
 * 降级配置
 */
export interface FallbackConfig {
  // 是否启用降级
  enabled: boolean;

  // 最大重试次数
  maxRetries: number;

  // 重试延迟（毫秒）
  retryDelayMs: number;

  // 降级模型链（按优先级排序）
  fallbackChain?: string[];
}

/**
 * 流式响应事件
 */
export interface StreamEvent {
  type: "start" | "chunk" | "complete" | "error";
  data?: string;
  error?: string;
  model?: string;
  tokensUsed?: number;
}
