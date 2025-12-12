/**
 * AI Orchestration Service
 *
 * 统一的 AI 调用编排服务，是所有 AI 调用的入口点
 *
 * 功能：
 * 1. 统一的 AI 调用接口（文本、图像、多模态）
 * 2. 自动模型选择
 * 3. 降级和重试机制
 * 4. 成本追踪
 * 5. 性能监控
 */

import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { ModelSelectorService } from "./model-selector.service";
import { FallbackManagerService } from "./fallback-manager.service";
import {
  AiTaskType,
  AiCallInput,
  AiCallResult,
  ChatMessage,
  AiModelConfig,
} from "./types";

@Injectable()
export class AiOrchestrationService {
  private readonly logger = new Logger(AiOrchestrationService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly modelSelector: ModelSelectorService,
    private readonly fallbackManager: FallbackManagerService,
  ) {}

  /**
   * 统一的 AI 调用入口
   */
  async call(input: AiCallInput): Promise<AiCallResult> {
    const startTime = Date.now();

    this.logger.log(
      `[call] Task: ${input.taskType}, source: ${input.metadata?.source || "unknown"}`,
    );

    try {
      // 1. 选择模型
      const model = await this.modelSelector.selectModel(input.taskType, {
        preferredModelId: input.modelId,
      });

      if (!model) {
        return {
          success: false,
          error: `No available model for task type: ${input.taskType}`,
          model: "none",
          provider: "none",
          tokensUsed: 0,
          latencyMs: Date.now() - startTime,
        };
      }

      // 2. 获取降级模型链
      const fallbackModels = await this.modelSelector.getFallbackChain(
        input.taskType,
        model.id,
      );

      // 3. 构建主调用和降级调用
      const primaryCall = () => this.executeCall(model, input);
      const fallbackCalls = fallbackModels.map((m) => ({
        model: m,
        call: () => this.executeCall(m, input),
      }));

      // 4. 执行带降级的调用
      const result = await this.fallbackManager.executeWithFallback(
        primaryCall,
        fallbackCalls,
      );

      // 5. 报告模型状态
      if (result.success) {
        this.modelSelector.reportModelSuccess(result.model);
      } else {
        this.modelSelector.reportModelFailure(
          result.model,
          result.error || "Unknown error",
        );
      }

      result.latencyMs = Date.now() - startTime;
      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.error(`[call] Error: ${errorMessage}`);

      return {
        success: false,
        error: errorMessage,
        model: "unknown",
        provider: "unknown",
        tokensUsed: 0,
        latencyMs: Date.now() - startTime,
      };
    }
  }

  /**
   * 执行单个 AI 调用
   */
  private async executeCall(
    model: AiModelConfig,
    input: AiCallInput,
  ): Promise<AiCallResult> {
    const startTime = Date.now();

    this.logger.debug(
      `[executeCall] Model: ${model.name}, provider: ${model.provider}`,
    );

    try {
      // 根据任务类型分发
      switch (input.taskType) {
        case AiTaskType.CHAT:
        case AiTaskType.COMPLETION:
        case AiTaskType.SUMMARIZATION:
        case AiTaskType.TRANSLATION:
        case AiTaskType.EXTRACTION:
          return await this.executeTextCall(model, input);

        case AiTaskType.IMAGE_GENERATION:
          return await this.executeImageCall(model, input);

        case AiTaskType.MULTIMODAL:
          return await this.executeMultimodalCall(model, input);

        default:
          throw new Error(`Unsupported task type: ${input.taskType}`);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        error: errorMessage,
        model: model.name,
        provider: model.provider,
        tokensUsed: 0,
        latencyMs: Date.now() - startTime,
      };
    }
  }

  /**
   * 执行文本类调用
   */
  private async executeTextCall(
    model: AiModelConfig,
    input: AiCallInput,
  ): Promise<AiCallResult> {
    const messages = input.messages || [];

    // 添加系统提示
    const fullMessages: ChatMessage[] = [];
    if (input.systemPrompt) {
      fullMessages.push({ role: "system", content: input.systemPrompt });
    }
    fullMessages.push(...messages);

    // 如果只有 prompt，转换为消息格式
    if (input.prompt && messages.length === 0) {
      fullMessages.push({ role: "user", content: input.prompt });
    }

    // 根据 provider 分发
    switch (model.provider.toLowerCase()) {
      case "xai":
      case "grok":
        return await this.callGrokApi(model, fullMessages, input);

      case "openai":
      case "gpt":
        return await this.callOpenAiApi(model, fullMessages, input);

      case "anthropic":
      case "claude":
        return await this.callClaudeApi(model, fullMessages, input);

      case "google":
      case "gemini":
        return await this.callGeminiApi(model, fullMessages, input);

      default:
        throw new Error(`Unsupported provider: ${model.provider}`);
    }
  }

  /**
   * 执行图像生成调用
   */
  private async executeImageCall(
    model: AiModelConfig,
    input: AiCallInput,
  ): Promise<AiCallResult> {
    const prompt = input.prompt || input.messages?.slice(-1)[0]?.content || "";

    if (!prompt) {
      return {
        success: false,
        error: "Image generation requires a prompt",
        model: model.name,
        provider: model.provider,
        tokensUsed: 0,
        latencyMs: 0,
      };
    }

    // 根据 provider 分发
    switch (model.provider.toLowerCase()) {
      case "openai":
        return await this.callDallE(model, prompt, input);

      case "google":
        return await this.callImagen(model, prompt, input);

      default:
        throw new Error(
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
    // 目前多模态调用使用 Gemini
    return await this.callGeminiApi(model, input.messages || [], input);
  }

  // ==================== Provider 特定实现 ====================

  /**
   * 调用 Grok API
   */
  private async callGrokApi(
    model: AiModelConfig,
    messages: ChatMessage[],
    input: AiCallInput,
  ): Promise<AiCallResult> {
    const startTime = Date.now();
    const url = model.apiEndpoint || "https://api.x.ai/v1/chat/completions";

    const response = await firstValueFrom(
      this.httpService.post(
        url,
        {
          model: model.modelId || "grok-3-latest",
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
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

    const data = response.data;
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No content in Grok response");
    }

    return {
      success: true,
      content,
      model: model.name,
      provider: model.provider,
      tokensUsed: data.usage?.total_tokens || 0,
      latencyMs: Date.now() - startTime,
    };
  }

  /**
   * 调用 OpenAI API
   */
  private async callOpenAiApi(
    model: AiModelConfig,
    messages: ChatMessage[],
    input: AiCallInput,
  ): Promise<AiCallResult> {
    const startTime = Date.now();
    const url =
      model.apiEndpoint || "https://api.openai.com/v1/chat/completions";
    const modelId = model.modelId || "gpt-4-turbo-preview";

    // 新模型使用 max_completion_tokens
    const isNewModel =
      modelId.includes("gpt-4o") ||
      modelId.includes("gpt-5") ||
      modelId.startsWith("o1") ||
      modelId.startsWith("o3");

    const tokenParam = isNewModel
      ? { max_completion_tokens: input.maxTokens || 2048 }
      : { max_tokens: input.maxTokens || 2048 };

    const response = await firstValueFrom(
      this.httpService.post(
        url,
        {
          model: modelId,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
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

    const data = response.data;
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No content in OpenAI response");
    }

    return {
      success: true,
      content,
      model: model.name,
      provider: model.provider,
      tokensUsed: data.usage?.total_tokens || 0,
      latencyMs: Date.now() - startTime,
    };
  }

  /**
   * 调用 Claude API
   */
  private async callClaudeApi(
    model: AiModelConfig,
    messages: ChatMessage[],
    input: AiCallInput,
  ): Promise<AiCallResult> {
    const startTime = Date.now();
    const url = model.apiEndpoint || "https://api.anthropic.com/v1/messages";

    // 分离系统消息
    const systemMessage = messages.find((m) => m.role === "system");
    const otherMessages = messages.filter((m) => m.role !== "system");

    const response = await firstValueFrom(
      this.httpService.post(
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

    const data = response.data;
    const content = data.content?.[0]?.text;

    if (!content) {
      throw new Error("No content in Claude response");
    }

    return {
      success: true,
      content,
      model: model.name,
      provider: model.provider,
      tokensUsed:
        (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      latencyMs: Date.now() - startTime,
    };
  }

  /**
   * 调用 Gemini API
   */
  private async callGeminiApi(
    model: AiModelConfig,
    messages: ChatMessage[],
    input: AiCallInput,
  ): Promise<AiCallResult> {
    const startTime = Date.now();
    const modelId = model.modelId || "gemini-2.0-flash-exp";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${model.apiKey}`;

    // 分离系统消息
    const systemMessage = messages.find((m) => m.role === "system");
    const otherMessages = messages.filter((m) => m.role !== "system");

    // 转换消息格式
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

    // 添加系统指令
    if (systemMessage) {
      requestBody.systemInstruction = {
        parts: [{ text: systemMessage.content }],
      };
    }

    const response = await firstValueFrom(
      this.httpService.post(url, requestBody, {
        headers: { "Content-Type": "application/json" },
        timeout: 120000,
      }),
    );

    const data = response.data;
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      const finishReason = data.candidates?.[0]?.finishReason;
      throw new Error(
        `No content in Gemini response (finishReason: ${finishReason})`,
      );
    }

    return {
      success: true,
      content,
      model: model.name,
      provider: model.provider,
      tokensUsed:
        (data.usageMetadata?.promptTokenCount || 0) +
        (data.usageMetadata?.candidatesTokenCount || 0),
      latencyMs: Date.now() - startTime,
    };
  }

  /**
   * 调用 DALL-E API
   */
  private async callDallE(
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
      this.httpService.post(
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

    const data = response.data;
    const imageData = data.data?.[0];

    if (!imageData?.b64_json) {
      throw new Error("No image data in DALL-E response");
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

  /**
   * 调用 Imagen API
   */
  private async callImagen(
    model: AiModelConfig,
    prompt: string,
    input: AiCallInput,
  ): Promise<AiCallResult> {
    const startTime = Date.now();
    const modelId = model.modelId || "imagen-4.0-generate-001";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:predict`;

    const response = await firstValueFrom(
      this.httpService.post(
        url,
        {
          instances: [{ prompt }],
          parameters: {
            sampleCount: 1,
            aspectRatio: input.imageOptions?.aspectRatio || "16:9",
            outputOptions: { mimeType: "image/png" },
          },
        },
        {
          headers: {
            "x-goog-api-key": model.apiKey,
            "Content-Type": "application/json",
          },
          timeout: 120000,
        },
      ),
    );

    const data = response.data;

    // 处理两种可能的响应格式
    let imageBytes: string | undefined;
    if (data.predictions?.[0]?.bytesBase64Encoded) {
      imageBytes = data.predictions[0].bytesBase64Encoded;
    } else if (data.generatedImages?.[0]?.image?.imageBytes) {
      imageBytes = data.generatedImages[0].image.imageBytes;
    }

    if (!imageBytes) {
      throw new Error("No image data in Imagen response");
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
}
