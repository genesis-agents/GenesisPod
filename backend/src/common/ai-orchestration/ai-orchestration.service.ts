/**
 * AI Orchestration Service
 *
 * 统一的 AI 调用编排服务 - 作为所有 AI 调用的唯一入口点 (Facade Pattern)
 *
 * 设计原则：
 * 1. 不重复实现 Provider API 调用 - 委托给 AiChatService
 * 2. 提供统一的调用接口和错误处理
 * 3. 实现自动模型选择和降级
 * 4. 追踪所有 AI 调用
 */

import { Injectable, Logger } from "@nestjs/common";
import { ModelSelectorService } from "./model-selector.service";
import { FallbackManagerService } from "./fallback-manager.service";
import {
  AiTaskType,
  AiCallInput,
  AiCallResult,
  AiModelConfig,
  AiCallMetadata,
} from "./types";
import { AIErrorClassifier, AIError, AIErrorType } from "./error-classifier";

/**
 * AI 调用追踪记录
 */
interface AiCallTrace {
  traceId: string;
  taskType: AiTaskType;
  modelId: string;
  provider: string;
  startTime: Date;
  endTime?: Date;
  status: "pending" | "success" | "failed";
  tokensUsed?: number;
  latencyMs?: number;
  error?: string;
  metadata?: AiCallMetadata;
}

@Injectable()
export class AiOrchestrationService {
  private readonly logger = new Logger(AiOrchestrationService.name);
  private readonly errorClassifier = new AIErrorClassifier();

  // 内存中的调用追踪 (生产环境应使用数据库)
  private callTraces: Map<string, AiCallTrace> = new Map();

  constructor(
    private readonly modelSelector: ModelSelectorService,
    private readonly fallbackManager: FallbackManagerService,
  ) {}

  /**
   * 统一的 AI 调用入口
   *
   * 所有 AI 调用都应该通过此方法，包括：
   * - 文本生成 (chat, completion)
   * - 摘要 (summarization)
   * - 翻译 (translation)
   * - 内容提取 (extraction)
   * - 图像生成 (image_generation)
   *
   * @param input AI 调用输入
   * @returns AI 调用结果
   */
  async call(input: AiCallInput): Promise<AiCallResult> {
    const traceId = this.generateTraceId();
    const startTime = Date.now();

    this.logger.log(
      `[${traceId}] AI call started: task=${input.taskType}, source=${input.metadata?.source || "unknown"}`,
    );

    // 创建追踪记录
    const trace: AiCallTrace = {
      traceId,
      taskType: input.taskType,
      modelId: "",
      provider: "",
      startTime: new Date(),
      status: "pending",
      metadata: input.metadata,
    };
    this.callTraces.set(traceId, trace);

    try {
      // 1. 选择模型
      const model = await this.modelSelector.selectModel(input.taskType, {
        preferredModelId: input.modelId,
        strategy: input.strategy,
      });

      if (!model) {
        const error = `No available model for task type: ${input.taskType}`;
        this.completeTrace(traceId, "failed", { error });
        return this.createErrorResult(error, startTime);
      }

      trace.modelId = model.id;
      trace.provider = model.provider;

      // 2. 获取降级模型链
      const fallbackModels = await this.modelSelector.getFallbackChain(
        input.taskType,
        model.id,
      );

      // 3. 构建调用函数
      const primaryCall = () => this.executeCall(model, input, traceId);
      const fallbackCalls = fallbackModels.map((m) => ({
        model: m,
        call: () => this.executeCall(m, input, traceId),
      }));

      // 4. 执行带降级的调用
      const result = await this.fallbackManager.executeWithFallback(
        primaryCall,
        fallbackCalls,
      );

      // 5. 更新追踪和模型状态
      if (result.success) {
        this.modelSelector.reportModelSuccess(result.model);
        this.completeTrace(traceId, "success", {
          tokensUsed: result.tokensUsed,
          latencyMs: Date.now() - startTime,
        });
      } else {
        this.modelSelector.reportModelFailure(
          result.model,
          result.error || "Unknown error",
        );
        this.completeTrace(traceId, "failed", {
          error: result.error,
          latencyMs: Date.now() - startTime,
        });
      }

      result.latencyMs = Date.now() - startTime;
      result.traceId = traceId;

      this.logger.log(
        `[${traceId}] AI call completed: success=${result.success}, latency=${result.latencyMs}ms`,
      );

      return result;
    } catch (error) {
      const classified = this.errorClassifier.classify(error);
      const errorMessage = classified.message;

      this.logger.error(`[${traceId}] AI call failed: ${errorMessage}`);
      this.completeTrace(traceId, "failed", {
        error: errorMessage,
        latencyMs: Date.now() - startTime,
      });

      return {
        success: false,
        error: errorMessage,
        errorType: classified.type,
        model: "unknown",
        provider: "unknown",
        tokensUsed: 0,
        latencyMs: Date.now() - startTime,
        traceId,
      };
    }
  }

  /**
   * 执行单个 AI 调用
   *
   * 委托给数据库中配置的模型进行实际调用
   */
  private async executeCall(
    model: AiModelConfig,
    input: AiCallInput,
    traceId: string,
  ): Promise<AiCallResult> {
    const startTime = Date.now();

    this.logger.debug(
      `[${traceId}] Executing call with model: ${model.name} (${model.provider})`,
    );

    try {
      // 根据任务类型分发到不同的执行器
      let result: AiCallResult;

      switch (input.taskType) {
        case AiTaskType.CHAT:
        case AiTaskType.COMPLETION:
        case AiTaskType.SUMMARIZATION:
        case AiTaskType.TRANSLATION:
        case AiTaskType.EXTRACTION:
          result = await this.executeTextCall(model, input);
          break;

        case AiTaskType.IMAGE_GENERATION:
        case AiTaskType.IMAGE_EDITING:
          result = await this.executeImageCall(model, input);
          break;

        case AiTaskType.MULTIMODAL:
          result = await this.executeMultimodalCall(model, input);
          break;

        default:
          throw new AIError(
            AIErrorType.INVALID_REQUEST,
            `Unsupported task type: ${input.taskType}`,
          );
      }

      result.latencyMs = Date.now() - startTime;
      return result;
    } catch (error) {
      const classified = this.errorClassifier.classify(error);

      // 如果是可重试的错误，抛出以便 fallback 处理
      if (classified.isRetryable()) {
        throw classified;
      }

      return {
        success: false,
        error: classified.message,
        errorType: classified.type,
        model: model.name,
        provider: model.provider,
        tokensUsed: 0,
        latencyMs: Date.now() - startTime,
      };
    }
  }

  /**
   * 执行文本类 AI 调用
   *
   * 使用通用的 HTTP 调用，根据 provider 构建不同的请求格式
   */
  private async executeTextCall(
    model: AiModelConfig,
    input: AiCallInput,
  ): Promise<AiCallResult> {
    const { HttpService } = await import("@nestjs/axios");
    const { firstValueFrom } = await import("rxjs");

    // 动态获取 HttpService (避免循环依赖)
    const httpService = new HttpService();

    // 构建消息列表
    const messages = this.buildMessages(input);

    // 根据 provider 调用不同的 API
    switch (model.provider.toLowerCase()) {
      case "xai":
      case "grok":
        return this.callGrokApi(
          httpService,
          firstValueFrom,
          model,
          messages,
          input,
        );

      case "openai":
      case "gpt":
        return this.callOpenAiApi(
          httpService,
          firstValueFrom,
          model,
          messages,
          input,
        );

      case "anthropic":
      case "claude":
        return this.callClaudeApi(
          httpService,
          firstValueFrom,
          model,
          messages,
          input,
        );

      case "google":
      case "gemini":
        return this.callGeminiApi(
          httpService,
          firstValueFrom,
          model,
          messages,
          input,
        );

      default:
        throw new AIError(
          AIErrorType.INVALID_REQUEST,
          `Unsupported provider: ${model.provider}`,
        );
    }
  }

  /**
   * 执行图像生成调用
   */
  private async executeImageCall(
    model: AiModelConfig,
    input: AiCallInput,
  ): Promise<AiCallResult> {
    const { HttpService } = await import("@nestjs/axios");
    const { firstValueFrom } = await import("rxjs");
    const httpService = new HttpService();

    const prompt = input.prompt || input.messages?.slice(-1)[0]?.content || "";

    if (!prompt) {
      throw new AIError(
        AIErrorType.INVALID_REQUEST,
        "Image generation requires a prompt",
      );
    }

    switch (model.provider.toLowerCase()) {
      case "openai":
        return this.callDallE(
          httpService,
          firstValueFrom,
          model,
          prompt,
          input,
        );

      case "google":
        return this.callImagen(
          httpService,
          firstValueFrom,
          model,
          prompt,
          input,
        );

      default:
        throw new AIError(
          AIErrorType.INVALID_REQUEST,
          `Unsupported image generation provider: ${model.provider}`,
        );
    }
  }

  /**
   * 执行多模态调用
   */
  private async executeMultimodalCall(
    model: AiModelConfig,
    input: AiCallInput,
  ): Promise<AiCallResult> {
    // 多模态调用目前使用 Gemini
    const { HttpService } = await import("@nestjs/axios");
    const { firstValueFrom } = await import("rxjs");
    const httpService = new HttpService();

    const messages = this.buildMessages(input);
    return this.callGeminiApi(
      httpService,
      firstValueFrom,
      model,
      messages,
      input,
    );
  }

  // ==================== Provider API 调用 ====================

  private async callGrokApi(
    httpService: any,
    firstValueFrom: any,
    model: AiModelConfig,
    messages: Array<{ role: string; content: string }>,
    input: AiCallInput,
  ): Promise<AiCallResult> {
    const startTime = Date.now();
    const url = model.apiEndpoint || "https://api.x.ai/v1/chat/completions";

    const response = await firstValueFrom(
      httpService.post(
        url,
        {
          model: model.modelId || "grok-3-latest",
          messages,
          max_tokens: input.maxTokens || 2048,
          temperature: input.temperature || 0.7,
          search_parameters: { mode: "auto", return_citations: true },
        },
        {
          headers: {
            Authorization: `Bearer ${model.apiKey}`,
            "Content-Type": "application/json",
          },
          timeout: 120000,
        },
      ),
    );

    const content = response.data.choices?.[0]?.message?.content;
    if (!content) {
      throw new AIError(
        AIErrorType.INVALID_RESPONSE,
        "No content in Grok response",
      );
    }

    return {
      success: true,
      content,
      model: model.name,
      provider: model.provider,
      tokensUsed: response.data.usage?.total_tokens || 0,
      latencyMs: Date.now() - startTime,
    };
  }

  private async callOpenAiApi(
    httpService: any,
    firstValueFrom: any,
    model: AiModelConfig,
    messages: Array<{ role: string; content: string }>,
    input: AiCallInput,
  ): Promise<AiCallResult> {
    const startTime = Date.now();
    const url =
      model.apiEndpoint || "https://api.openai.com/v1/chat/completions";
    const modelId = model.modelId || "gpt-4-turbo-preview";

    const isNewModel =
      modelId.includes("gpt-4o") ||
      modelId.includes("gpt-5") ||
      modelId.startsWith("o1") ||
      modelId.startsWith("o3");

    const tokenParam = isNewModel
      ? { max_completion_tokens: input.maxTokens || 2048 }
      : { max_tokens: input.maxTokens || 2048 };

    const response = await firstValueFrom(
      httpService.post(
        url,
        {
          model: modelId,
          messages,
          ...tokenParam,
          temperature: input.temperature || 0.7,
        },
        {
          headers: {
            Authorization: `Bearer ${model.apiKey}`,
            "Content-Type": "application/json",
          },
          timeout: 120000,
        },
      ),
    );

    const content = response.data.choices?.[0]?.message?.content;
    if (!content) {
      throw new AIError(
        AIErrorType.INVALID_RESPONSE,
        "No content in OpenAI response",
      );
    }

    return {
      success: true,
      content,
      model: model.name,
      provider: model.provider,
      tokensUsed: response.data.usage?.total_tokens || 0,
      latencyMs: Date.now() - startTime,
    };
  }

  private async callClaudeApi(
    httpService: any,
    firstValueFrom: any,
    model: AiModelConfig,
    messages: Array<{ role: string; content: string }>,
    input: AiCallInput,
  ): Promise<AiCallResult> {
    const startTime = Date.now();
    const url = model.apiEndpoint || "https://api.anthropic.com/v1/messages";

    const systemMessage = messages.find((m) => m.role === "system");
    const otherMessages = messages.filter((m) => m.role !== "system");

    const response = await firstValueFrom(
      httpService.post(
        url,
        {
          model: model.modelId || "claude-3-sonnet-20240229",
          max_tokens: input.maxTokens || 2048,
          temperature: input.temperature || 0.7,
          system: systemMessage?.content,
          messages: otherMessages.map((m) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: m.content,
          })),
        },
        {
          headers: {
            "x-api-key": model.apiKey,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
          timeout: 120000,
        },
      ),
    );

    const content = response.data.content?.[0]?.text;
    if (!content) {
      throw new AIError(
        AIErrorType.INVALID_RESPONSE,
        "No content in Claude response",
      );
    }

    return {
      success: true,
      content,
      model: model.name,
      provider: model.provider,
      tokensUsed:
        (response.data.usage?.input_tokens || 0) +
        (response.data.usage?.output_tokens || 0),
      latencyMs: Date.now() - startTime,
    };
  }

  private async callGeminiApi(
    httpService: any,
    firstValueFrom: any,
    model: AiModelConfig,
    messages: Array<{ role: string; content: string }>,
    input: AiCallInput,
  ): Promise<AiCallResult> {
    const startTime = Date.now();
    const modelId = model.modelId || "gemini-2.0-flash-exp";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${model.apiKey}`;

    const systemMessage = messages.find((m) => m.role === "system");
    const otherMessages = messages.filter((m) => m.role !== "system");

    const contents = otherMessages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const requestBody: any = {
      contents,
      generationConfig: {
        maxOutputTokens: input.maxTokens || 2048,
        temperature: input.temperature || 0.7,
      },
    };

    if (systemMessage) {
      requestBody.systemInstruction = {
        parts: [{ text: systemMessage.content }],
      };
    }

    const response = await firstValueFrom(
      httpService.post(url, requestBody, {
        headers: { "Content-Type": "application/json" },
        timeout: 120000,
      }),
    );

    const content = response.data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) {
      const finishReason = response.data.candidates?.[0]?.finishReason;
      throw new AIError(
        AIErrorType.INVALID_RESPONSE,
        `No content in Gemini response (finishReason: ${finishReason})`,
      );
    }

    return {
      success: true,
      content,
      model: model.name,
      provider: model.provider,
      tokensUsed:
        (response.data.usageMetadata?.promptTokenCount || 0) +
        (response.data.usageMetadata?.candidatesTokenCount || 0),
      latencyMs: Date.now() - startTime,
    };
  }

  private async callDallE(
    httpService: any,
    firstValueFrom: any,
    model: AiModelConfig,
    prompt: string,
    input: AiCallInput,
  ): Promise<AiCallResult> {
    const startTime = Date.now();
    const url = "https://api.openai.com/v1/images/generations";

    const aspectRatio = input.imageOptions?.aspectRatio || "1:1";
    const size =
      aspectRatio === "16:9"
        ? "1792x1024"
        : aspectRatio === "9:16"
          ? "1024x1792"
          : "1024x1024";

    const response = await firstValueFrom(
      httpService.post(
        url,
        {
          model: model.modelId || "dall-e-3",
          prompt,
          n: 1,
          size,
          quality: "hd",
          response_format: "b64_json",
        },
        {
          headers: {
            Authorization: `Bearer ${model.apiKey}`,
            "Content-Type": "application/json",
          },
          timeout: 120000,
        },
      ),
    );

    const imageData = response.data.data?.[0];
    if (!imageData?.b64_json) {
      throw new AIError(
        AIErrorType.INVALID_RESPONSE,
        "No image data in DALL-E response",
      );
    }

    return {
      success: true,
      content: `![Generated Image](data:image/png;base64,${imageData.b64_json})`,
      images: [
        {
          url: `data:image/png;base64,${imageData.b64_json}`,
          width: parseInt(size.split("x")[0]),
          height: parseInt(size.split("x")[1]),
          mimeType: "image/png",
        },
      ],
      model: model.name,
      provider: model.provider,
      tokensUsed: 0,
      latencyMs: Date.now() - startTime,
    };
  }

  private async callImagen(
    httpService: any,
    firstValueFrom: any,
    model: AiModelConfig,
    prompt: string,
    input: AiCallInput,
  ): Promise<AiCallResult> {
    const startTime = Date.now();
    const modelId = model.modelId || "imagen-3.0-generate-001";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateImages?key=${model.apiKey}`;

    const aspectRatio = input.imageOptions?.aspectRatio || "16:9";

    const response = await firstValueFrom(
      httpService.post(
        url,
        {
          prompt,
          config: {
            numberOfImages: 1,
            aspectRatio,
            outputOptions: { mimeType: "image/png" },
          },
        },
        {
          headers: { "Content-Type": "application/json" },
          timeout: 120000,
        },
      ),
    );

    // 处理两种响应格式
    let imageBytes: string | undefined;
    if (response.data.generatedImages?.[0]?.image?.imageBytes) {
      imageBytes = response.data.generatedImages[0].image.imageBytes;
    } else if (response.data.predictions?.[0]?.bytesBase64Encoded) {
      imageBytes = response.data.predictions[0].bytesBase64Encoded;
    }

    if (!imageBytes) {
      throw new AIError(
        AIErrorType.INVALID_RESPONSE,
        "No image data in Imagen response",
      );
    }

    const cleanBase64 = imageBytes.replace(/\s/g, "");

    return {
      success: true,
      content: `![Generated Image](data:image/png;base64,${cleanBase64})`,
      images: [
        {
          url: `data:image/png;base64,${cleanBase64}`,
          mimeType: "image/png",
        },
      ],
      model: model.name,
      provider: model.provider,
      tokensUsed: 0,
      latencyMs: Date.now() - startTime,
    };
  }

  // ==================== 辅助方法 ====================

  /**
   * 构建消息列表
   */
  private buildMessages(
    input: AiCallInput,
  ): Array<{ role: string; content: string }> {
    const messages: Array<{ role: string; content: string }> = [];

    if (input.systemPrompt) {
      messages.push({ role: "system", content: input.systemPrompt });
    }

    if (input.messages) {
      messages.push(
        ...input.messages.map((m) => ({ role: m.role, content: m.content })),
      );
    }

    if (input.prompt && (!input.messages || input.messages.length === 0)) {
      messages.push({ role: "user", content: input.prompt });
    }

    return messages;
  }

  /**
   * 生成追踪 ID
   */
  private generateTraceId(): string {
    return `ai-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * 完成追踪记录
   */
  private completeTrace(
    traceId: string,
    status: "success" | "failed",
    data: {
      tokensUsed?: number;
      latencyMs?: number;
      error?: string;
    },
  ): void {
    const trace = this.callTraces.get(traceId);
    if (trace) {
      trace.endTime = new Date();
      trace.status = status;
      trace.tokensUsed = data.tokensUsed;
      trace.latencyMs = data.latencyMs;
      trace.error = data.error;

      // 清理旧的追踪记录 (保留最近 1000 条)
      if (this.callTraces.size > 1000) {
        const oldestKey = this.callTraces.keys().next().value;
        if (oldestKey) {
          this.callTraces.delete(oldestKey);
        }
      }
    }
  }

  /**
   * 创建错误结果
   */
  private createErrorResult(error: string, startTime: number): AiCallResult {
    return {
      success: false,
      error,
      model: "none",
      provider: "none",
      tokensUsed: 0,
      latencyMs: Date.now() - startTime,
    };
  }

  /**
   * 获取最近的调用追踪 (用于调试和监控)
   */
  getRecentTraces(limit = 100): AiCallTrace[] {
    return Array.from(this.callTraces.values()).slice(-limit).reverse();
  }
}
