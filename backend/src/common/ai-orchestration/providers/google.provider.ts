/**
 * Google AI Provider
 *
 * 支持 Gemini 系列和 Imagen 图像生成
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
 * Google Gemini 文本生成 Provider
 */
@Injectable()
export class GeminiProvider extends BaseTextProvider {
  readonly providerId = "google-gemini";
  readonly displayName = "Google Gemini";

  private static readonly SUPPORTED_MODELS = [
    "gemini-2.0",
    "gemini-1.5",
    "gemini-pro",
    "gemini-flash",
  ];

  constructor(httpService: HttpService) {
    super(httpService);
  }

  supportsModel(modelId: string): boolean {
    return GeminiProvider.SUPPORTED_MODELS.some((m) =>
      modelId.toLowerCase().includes(m),
    );
  }

  async generateText(
    model: AiModelConfig,
    messages: ChatMessage[],
    options: TextGenerationOptions,
  ): Promise<TextGenerationResult> {
    const modelId = model.modelId || "gemini-2.0-flash-exp";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${model.apiKey}`;

    // Gemini 需要特殊处理 system message
    const systemMessage = messages.find((m) => m.role === "system");
    const otherMessages = messages.filter((m) => m.role !== "system");

    const contents = otherMessages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const requestBody: GeminiRequest = {
      contents,
      generationConfig: {
        maxOutputTokens: options.maxTokens || 2048,
        temperature: options.temperature ?? 0.7,
      },
    };

    if (systemMessage) {
      requestBody.systemInstruction = {
        parts: [{ text: systemMessage.content }],
      };
    }

    const response = await this.post<GeminiResponse>(
      url,
      requestBody,
      {}, // API key 已在 URL 中
      options.timeoutMs,
    );

    const content = response.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) {
      const finishReason = response.candidates?.[0]?.finishReason;
      throw new AIError(
        AIErrorType.INVALID_RESPONSE,
        `No content in Gemini response (finishReason: ${finishReason})`,
      );
    }

    return {
      content,
      tokensUsed:
        (response.usageMetadata?.promptTokenCount || 0) +
        (response.usageMetadata?.candidatesTokenCount || 0),
      finishReason: this.mapFinishReason(
        response.candidates?.[0]?.finishReason,
      ),
      rawResponse: response,
    };
  }

  private mapFinishReason(
    reason?: string,
  ): TextGenerationResult["finishReason"] {
    switch (reason) {
      case "STOP":
        return "stop";
      case "MAX_TOKENS":
        return "length";
      case "SAFETY":
        return "content_filter";
      default:
        return undefined;
    }
  }
}

/**
 * Google Imagen 图像生成 Provider
 */
@Injectable()
export class ImagenProvider extends BaseImageProvider {
  readonly providerId = "google-imagen";
  readonly displayName = "Google Imagen";

  private static readonly SUPPORTED_MODELS = [
    "imagen-4",
    "imagen-3",
    "imagen-2",
    "imagegeneration",
  ];

  constructor(httpService: HttpService) {
    super(httpService);
  }

  supportsModel(modelId: string): boolean {
    return ImagenProvider.SUPPORTED_MODELS.some((m) =>
      modelId.toLowerCase().includes(m),
    );
  }

  async generateImage(
    model: AiModelConfig,
    prompt: string,
    options: ImageGenerationOptions,
  ): Promise<ImageGenerationResult> {
    const modelId = model.modelId || "imagen-3.0-generate-001";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateImages?key=${model.apiKey}`;

    this.logger.log(`[ImagenProvider] Generating image with model: ${modelId}`);
    this.logger.debug(
      `[ImagenProvider] Prompt: ${prompt.substring(0, 100)}...`,
    );

    const requestBody = {
      prompt,
      config: {
        numberOfImages: options.numberOfImages || 1,
        aspectRatio: options.aspectRatio || "16:9",
        outputOptions: { mimeType: "image/png" },
      },
    };

    const response = await this.post<ImagenResponse>(
      url,
      requestBody,
      {}, // API key 已在 URL 中
      options.timeoutMs,
    );

    this.logger.log(
      `[ImagenProvider] Response received, keys: ${Object.keys(response || {}).join(", ")}`,
    );

    // 处理两种响应格式
    let imageBytes: string | undefined;
    if (response.generatedImages?.[0]?.image?.imageBytes) {
      imageBytes = response.generatedImages[0].image.imageBytes;
      this.logger.log("[ImagenProvider] Found imageBytes in generatedImages");
    } else if (response.predictions?.[0]?.bytesBase64Encoded) {
      imageBytes = response.predictions[0].bytesBase64Encoded;
      this.logger.log("[ImagenProvider] Found imageBytes in predictions");
    }

    if (!imageBytes) {
      this.logger.error(
        `[ImagenProvider] No image data in response: ${JSON.stringify(response).substring(0, 500)}`,
      );
      throw new AIError(
        AIErrorType.INVALID_RESPONSE,
        "No image data in Imagen response",
      );
    }

    const cleanBase64 = imageBytes.replace(/\s/g, "");
    this.logger.log(
      `[ImagenProvider] Image generated successfully, base64 length: ${cleanBase64.length}`,
    );

    return {
      images: [
        {
          base64: cleanBase64,
          mimeType: "image/png",
        },
      ],
      rawResponse: response,
    };
  }
}

// ==================== 类型定义 ====================

interface GeminiRequest {
  contents: Array<{
    role: string;
    parts: Array<{ text: string }>;
  }>;
  generationConfig: {
    maxOutputTokens: number;
    temperature: number;
  };
  systemInstruction?: {
    parts: Array<{ text: string }>;
  };
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text: string }>;
    };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
  };
}

interface ImagenResponse {
  generatedImages?: Array<{
    image?: {
      imageBytes: string;
    };
  }>;
  predictions?: Array<{
    bytesBase64Encoded: string;
  }>;
}
