/**
 * AI Provider 抽象接口
 *
 * 遵循 SOLID 原则中的：
 * - 依赖倒置原则 (DIP): 依赖抽象而非具体实现
 * - 开闭原则 (OCP): 新增 Provider 只需实现接口，无需修改现有代码
 * - 里氏替换原则 (LSP): 所有 Provider 可互相替换
 * - 接口隔离原则 (ISP): 分离文本和图像生成接口
 */

import { AiCallInput, AiCallResult, AiModelConfig } from "../types";

/**
 * AI Provider 基础接口
 */
export interface IAIProvider {
  /** Provider 唯一标识 */
  readonly providerId: string;

  /** Provider 显示名称 */
  readonly displayName: string;

  /** 是否支持指定的模型 */
  supportsModel(modelId: string): boolean;

  /** 执行 AI 调用 */
  execute(model: AiModelConfig, input: AiCallInput): Promise<AiCallResult>;

  /** 健康检查 */
  healthCheck?(): Promise<boolean>;
}

/**
 * 文本生成 Provider 接口
 */
export interface ITextProvider extends IAIProvider {
  /** 执行文本生成 */
  generateText(
    model: AiModelConfig,
    messages: ChatMessage[],
    options: TextGenerationOptions,
  ): Promise<TextGenerationResult>;
}

/**
 * 图像生成 Provider 接口
 */
export interface IImageProvider extends IAIProvider {
  /** 执行图像生成 */
  generateImage(
    model: AiModelConfig,
    prompt: string,
    options: ImageGenerationOptions,
  ): Promise<ImageGenerationResult>;
}

/**
 * 聊天消息格式
 */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * 文本生成选项
 */
export interface TextGenerationOptions {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stopSequences?: string[];
  timeoutMs?: number;
}

/**
 * 文本生成结果
 */
export interface TextGenerationResult {
  content: string;
  tokensUsed: number;
  finishReason?: "stop" | "length" | "content_filter" | "error";
  rawResponse?: unknown;
}

/**
 * 图像生成选项
 */
export interface ImageGenerationOptions {
  aspectRatio?: "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
  quality?: "standard" | "hd";
  style?: "natural" | "vivid";
  numberOfImages?: number;
  timeoutMs?: number;
}

/**
 * 图像生成结果
 */
export interface ImageGenerationResult {
  images: GeneratedImage[];
  rawResponse?: unknown;
}

/**
 * 生成的图像
 */
export interface GeneratedImage {
  /** Base64 编码的图像数据 */
  base64?: string;
  /** 图像 URL */
  url?: string;
  /** 图像宽度 */
  width?: number;
  /** 图像高度 */
  height?: number;
  /** MIME 类型 */
  mimeType: string;
  /** 修订后的提示词 */
  revisedPrompt?: string;
}

/**
 * Provider 注册 Token (用于 NestJS DI)
 */
export const AI_PROVIDER_TOKEN = Symbol("AI_PROVIDER_TOKEN");
export const TEXT_PROVIDER_TOKEN = Symbol("TEXT_PROVIDER_TOKEN");
export const IMAGE_PROVIDER_TOKEN = Symbol("IMAGE_PROVIDER_TOKEN");
