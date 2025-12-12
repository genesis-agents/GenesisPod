/**
 * xAI Provider
 *
 * 支持 Grok 系列模型
 */

import { Injectable } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { BaseTextProvider } from "./base-provider";
import {
  ChatMessage,
  TextGenerationOptions,
  TextGenerationResult,
} from "./ai-provider.interface";
import { AiModelConfig } from "../types";
import { AIError, AIErrorType } from "../error-classifier";

@Injectable()
export class XAIProvider extends BaseTextProvider {
  readonly providerId = "xai";
  readonly displayName = "xAI Grok";

  private static readonly SUPPORTED_MODELS = ["grok-3", "grok-2", "grok"];

  constructor(httpService: HttpService) {
    super(httpService);
  }

  supportsModel(modelId: string): boolean {
    return XAIProvider.SUPPORTED_MODELS.some((m) =>
      modelId.toLowerCase().includes(m),
    );
  }

  async generateText(
    model: AiModelConfig,
    messages: ChatMessage[],
    options: TextGenerationOptions,
  ): Promise<TextGenerationResult> {
    const url = model.apiEndpoint || "https://api.x.ai/v1/chat/completions";

    const response = await this.post<GrokResponse>(
      url,
      {
        model: model.modelId || "grok-3-latest",
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        max_tokens: options.maxTokens || 2048,
        temperature: options.temperature ?? 0.7,
        search_parameters: { mode: "auto", return_citations: true },
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
        "No content in Grok response",
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
      default:
        return undefined;
    }
  }
}

// ==================== 类型定义 ====================

interface GrokResponse {
  id: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}
