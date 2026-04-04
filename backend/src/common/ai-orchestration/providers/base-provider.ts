/**
 * AI Provider 基类
 *
 * 实现 Template Method 模式：
 * - 定义通用的请求流程（准备、执行、解析、错误处理）
 * - 子类只需实现特定的请求格式和响应解析
 */

import { Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom, timeout, catchError } from "rxjs";
import { AxiosError } from "axios";
import {
  IAIProvider,
  ITextProvider,
  IImageProvider,
  ChatMessage,
  TextGenerationOptions,
  TextGenerationResult,
  ImageGenerationOptions,
  ImageGenerationResult,
} from "./ai-provider.interface";
import { AiCallInput, AiCallResult, AiModelConfig } from "../types";
import { AIError, AIErrorType, AIErrorClassifier } from "../error-classifier";

/**
 * Provider 基类 - 提供通用功能
 */
export abstract class BaseProvider implements IAIProvider {
  protected readonly logger: Logger;
  protected readonly errorClassifier = new AIErrorClassifier();

  abstract readonly providerId: string;
  abstract readonly displayName: string;

  constructor(protected readonly httpService: HttpService) {
    this.logger = new Logger(this.constructor.name);
  }

  abstract supportsModel(modelId: string): boolean;

  abstract execute(
    model: AiModelConfig,
    input: AiCallInput,
  ): Promise<AiCallResult>;

  /**
   * 通用 HTTP POST 请求
   */
  protected async post<T>(
    url: string,
    body: unknown,
    headers: Record<string, string>,
    timeoutMs = 120000,
  ): Promise<T> {
    try {
      const response = await firstValueFrom(
        this.httpService
          .post<T>(url, body, {
            headers: {
              "Content-Type": "application/json",
              ...headers,
            },
          })
          .pipe(
            timeout(timeoutMs),
            catchError((error) => {
              throw this.handleHttpError(error);
            }),
          ),
      );
      return response.data;
    } catch (error) {
      if (error instanceof AIError) {
        throw error;
      }
      throw this.errorClassifier.classify(error);
    }
  }

  /**
   * HTTP 错误处理
   */
  protected handleHttpError(error: AxiosError): AIError {
    const status = error.response?.status;
    const data = error.response?.data as Record<
      string,
      Record<string, unknown>
    >;

    // 根据状态码分类错误
    if (status === 429) {
      return new AIError(
        AIErrorType.RATE_LIMIT,
        `Rate limit exceeded: ${data?.error?.message || "Too many requests"}`,
      );
    }

    if (status === 401 || status === 403) {
      return new AIError(
        AIErrorType.INVALID_API_KEY,
        `Authentication failed: ${data?.error?.message || "Invalid API key"}`,
      );
    }

    if (status === 400) {
      return new AIError(
        AIErrorType.INVALID_REQUEST,
        `Invalid request: ${data?.error?.message || "Bad request"}`,
      );
    }

    if (status && status >= 500) {
      return new AIError(
        AIErrorType.TEMPORARY_UNAVAILABLE,
        `Service error: ${data?.error?.message || "Server error"}`,
      );
    }

    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
      return new AIError(AIErrorType.TIMEOUT, "Request timed out");
    }

    if (error.code === "ENOTFOUND" || error.code === "ECONNREFUSED") {
      return new AIError(
        AIErrorType.NETWORK_ERROR,
        `Network error: ${error.message}`,
      );
    }

    return new AIError(
      AIErrorType.UNKNOWN,
      `Unknown error: ${error.message || "Request failed"}`,
    );
  }

  /**
   * 构建成功的 AiCallResult
   */
  protected buildSuccessResult(
    model: AiModelConfig,
    content: string,
    tokensUsed: number,
    startTime: number,
    images?: AiCallResult["images"],
  ): AiCallResult {
    return {
      success: true,
      content,
      images,
      model: model.name,
      provider: model.provider,
      tokensUsed,
      latencyMs: Date.now() - startTime,
    };
  }

  /**
   * 构建失败的 AiCallResult
   */
  protected buildErrorResult(
    model: AiModelConfig,
    error: AIError,
    startTime: number,
  ): AiCallResult {
    return {
      success: false,
      error: error.message,
      errorType: error.type,
      model: model.name,
      provider: model.provider,
      tokensUsed: 0,
      latencyMs: Date.now() - startTime,
    };
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}

/**
 * 文本 Provider 基类
 */
export abstract class BaseTextProvider
  extends BaseProvider
  implements ITextProvider
{
  abstract generateText(
    model: AiModelConfig,
    messages: ChatMessage[],
    options: TextGenerationOptions,
  ): Promise<TextGenerationResult>;

  async execute(
    model: AiModelConfig,
    input: AiCallInput,
  ): Promise<AiCallResult> {
    const startTime = Date.now();

    try {
      const messages = this.buildMessages(input);
      const options: TextGenerationOptions = {
        maxTokens: input.maxTokens,
        temperature: input.temperature,
        timeoutMs: 120000,
      };

      const result = await this.generateText(model, messages, options);

      return this.buildSuccessResult(
        model,
        result.content,
        result.tokensUsed,
        startTime,
      );
    } catch (error) {
      const classified =
        error instanceof AIError ? error : this.errorClassifier.classify(error);

      if (classified.isRetryable()) {
        throw classified;
      }

      return this.buildErrorResult(model, classified, startTime);
    }
  }

  /**
   * 从 AiCallInput 构建消息列表
   */
  protected buildMessages(input: AiCallInput): ChatMessage[] {
    const messages: ChatMessage[] = [];

    if (input.systemPrompt) {
      messages.push({ role: "system", content: input.systemPrompt });
    }

    if (input.messages) {
      messages.push(
        ...input.messages.map((m) => ({
          role: m.role as ChatMessage["role"],
          content: m.content,
        })),
      );
    }

    if (input.prompt && (!input.messages || input.messages.length === 0)) {
      messages.push({ role: "user", content: input.prompt });
    }

    return messages;
  }
}

/**
 * 图像 Provider 基类
 */
export abstract class BaseImageProvider
  extends BaseProvider
  implements IImageProvider
{
  abstract generateImage(
    model: AiModelConfig,
    prompt: string,
    options: ImageGenerationOptions,
  ): Promise<ImageGenerationResult>;

  async execute(
    model: AiModelConfig,
    input: AiCallInput,
  ): Promise<AiCallResult> {
    const startTime = Date.now();

    try {
      const prompt =
        input.prompt || input.messages?.slice(-1)[0]?.content || "";

      if (!prompt) {
        throw new AIError(
          AIErrorType.INVALID_REQUEST,
          "Image generation requires a prompt",
        );
      }

      const options: ImageGenerationOptions = {
        aspectRatio: input.imageOptions
          ?.aspectRatio as ImageGenerationOptions["aspectRatio"],
        style: input.imageOptions?.style as ImageGenerationOptions["style"],
        numberOfImages: 1,
        timeoutMs: 120000,
      };

      const result = await this.generateImage(model, prompt, options);

      // 转换为 AiCallResult 格式
      const images: AiCallResult["images"] = result.images.map((img) => ({
        url: img.url || `data:${img.mimeType};base64,${img.base64}`,
        width: img.width,
        height: img.height,
        mimeType: img.mimeType,
      }));

      const firstImage = result.images[0];
      const content = `![Generated Image](${firstImage.url || `data:${firstImage.mimeType};base64,${firstImage.base64}`})`;

      return this.buildSuccessResult(model, content, 0, startTime, images);
    } catch (error) {
      const classified =
        error instanceof AIError ? error : this.errorClassifier.classify(error);

      if (classified.isRetryable()) {
        throw classified;
      }

      return this.buildErrorResult(model, classified, startTime);
    }
  }
}
