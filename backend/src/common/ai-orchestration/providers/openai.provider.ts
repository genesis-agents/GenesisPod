/**
 * OpenAI Provider
 *
 * 支持 GPT 系列和 DALL-E 图像生成
 */

import { Injectable } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { BaseTextProvider, BaseImageProvider } from "./base-provider";
import {
  ChatMessage,
  TextGenerationOptions,
  TextGenerationResult,
  ImageGenerationOptions,
  ImageGenerationResult,
} from "./ai-provider.interface";
import { AiModelConfig } from "../types";
import { AIError, AIErrorType } from "../error-classifier";

/**
 * OpenAI 文本生成 Provider (GPT 系列)
 */
@Injectable()
export class OpenAITextProvider extends BaseTextProvider {
  readonly providerId = "openai";
  readonly displayName = "OpenAI GPT";

  private static readonly SUPPORTED_MODELS = [
    "gpt-5",
    "gpt-4",
    "gpt-4-turbo",
    "gpt-4o",
    "gpt-3.5-turbo",
    "o1",
    "o3",
    // Chinese providers (OpenAI-compatible API)
    "deepseek",
    "qwen",
    "doubao",
    "glm",
    "chatglm",
    "moonshot",
    "kimi",
  ];

  constructor(httpService: HttpService) {
    super(httpService);
  }

  supportsModel(modelId: string): boolean {
    return OpenAITextProvider.SUPPORTED_MODELS.some(
      (m) => modelId.toLowerCase().includes(m) || modelId.startsWith(m),
    );
  }

  async generateText(
    model: AiModelConfig,
    messages: ChatMessage[],
    options: TextGenerationOptions,
  ): Promise<TextGenerationResult> {
    const url =
      model.apiEndpoint || "https://api.openai.com/v1/chat/completions";
    const modelId = model.modelId || "";

    // 新模型使用 max_completion_tokens
    const isNewModel =
      modelId.includes("gpt-4o") ||
      modelId.includes("gpt-5") ||
      modelId.includes("o1") ||
      modelId.includes("o3");

    const tokenParam = isNewModel
      ? { max_completion_tokens: options.maxTokens || 2048 }
      : { max_tokens: options.maxTokens || 2048 };

    const response = await this.post<OpenAIChatResponse>(
      url,
      {
        model: modelId,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        ...tokenParam,
        temperature: options.temperature ?? 0.7,
      },
      {
        Authorization: `Bearer ${model.apiKey}`,
      },
      options.timeoutMs,
    );

    const content = response.choices?.[0]?.message?.content;
    if (!content) {
      throw new AIError(
        AIErrorType.INVALID_RESPONSE,
        "No content in OpenAI response",
      );
    }

    return {
      content,
      tokensUsed: response.usage?.total_tokens || 0,
      finishReason: this.mapFinishReason(response.choices?.[0]?.finish_reason),
      rawResponse: response,
    };
  }

  private mapFinishReason(
    reason?: string,
  ): TextGenerationResult["finishReason"] {
    switch (reason) {
      case "stop":
        return "stop";
      case "length":
        return "length";
      case "content_filter":
        return "content_filter";
      default:
        return undefined;
    }
  }
}

/**
 * DALL-E 图像生成 Provider
 */
@Injectable()
export class DallEProvider extends BaseImageProvider {
  readonly providerId = "openai-dalle";
  readonly displayName = "DALL-E";

  private static readonly SUPPORTED_MODELS = ["dall-e-2", "dall-e-3"];

  constructor(httpService: HttpService) {
    super(httpService);
  }

  supportsModel(modelId: string): boolean {
    return DallEProvider.SUPPORTED_MODELS.some((m) =>
      modelId.toLowerCase().includes(m),
    );
  }

  async generateImage(
    model: AiModelConfig,
    prompt: string,
    options: ImageGenerationOptions,
  ): Promise<ImageGenerationResult> {
    const url = "https://api.openai.com/v1/images/generations";
    const size = this.getSize(options.aspectRatio);

    const response = await this.post<DallEResponse>(
      url,
      {
        model: model.modelId || "dall-e-3",
        prompt,
        n: options.numberOfImages || 1,
        size,
        quality: options.quality || "hd",
        response_format: "b64_json",
      },
      {
        Authorization: `Bearer ${model.apiKey}`,
      },
      options.timeoutMs,
    );

    const imageData = response.data?.[0];
    if (!imageData?.b64_json) {
      throw new AIError(
        AIErrorType.INVALID_RESPONSE,
        "No image data in DALL-E response",
      );
    }

    const [width, height] = size.split("x").map(Number);

    return {
      images: response.data.map((img) => ({
        base64: img.b64_json,
        width,
        height,
        mimeType: "image/png",
        revisedPrompt: img.revised_prompt,
      })),
      rawResponse: response,
    };
  }

  private getSize(aspectRatio?: ImageGenerationOptions["aspectRatio"]): string {
    switch (aspectRatio) {
      case "16:9":
        return "1792x1024";
      case "9:16":
        return "1024x1792";
      default:
        return "1024x1024";
    }
  }
}

// ==================== 类型定义 ====================

interface OpenAIChatResponse {
  id: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface DallEResponse {
  created: number;
  data: Array<{
    b64_json?: string;
    url?: string;
    revised_prompt?: string;
  }>;
}
