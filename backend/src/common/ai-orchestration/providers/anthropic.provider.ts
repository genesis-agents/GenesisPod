/**
 * Anthropic Provider
 *
 * 支持 Claude 系列模型
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
export class AnthropicProvider extends BaseTextProvider {
  readonly providerId = "anthropic";
  readonly displayName = "Anthropic Claude";

  private static readonly SUPPORTED_MODELS = [
    "claude-3",
    "claude-3.5",
    "claude-2",
    "claude-instant",
  ];

  constructor(httpService: HttpService) {
    super(httpService);
  }

  supportsModel(modelId: string): boolean {
    return AnthropicProvider.SUPPORTED_MODELS.some((m) =>
      modelId.toLowerCase().includes(m),
    );
  }

  async generateText(
    model: AiModelConfig,
    messages: ChatMessage[],
    options: TextGenerationOptions,
  ): Promise<TextGenerationResult> {
    const url = model.apiEndpoint || "https://api.anthropic.com/v1/messages";

    // Claude 需要特殊处理 system message
    const systemMessage = messages.find((m) => m.role === "system");
    const otherMessages = messages.filter((m) => m.role !== "system");

    const response = await this.post<ClaudeResponse>(
      url,
      {
        model: model.modelId || "claude-3-sonnet-20240229",
        max_tokens: options.maxTokens || 2048,
        temperature: options.temperature ?? 0.7,
        system: systemMessage?.content,
        messages: otherMessages.map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
        })),
      },
      {
        "x-api-key": model.apiKey,
        "anthropic-version": "2023-06-01",
      },
      options.timeoutMs,
    );

    const content = response.content?.[0]?.text;
    if (!content) {
      throw new AIError(
        AIErrorType.INVALID_RESPONSE,
        "No content in Claude response",
      );
    }

    return {
      content,
      tokensUsed:
        (response.usage?.input_tokens || 0) +
        (response.usage?.output_tokens || 0),
      finishReason: this.mapStopReason(response.stop_reason),
      rawResponse: response,
    };
  }

  private mapStopReason(reason?: string): TextGenerationResult["finishReason"] {
    switch (reason) {
      case "end_turn":
      case "stop_sequence":
        return "stop";
      case "max_tokens":
        return "length";
      default:
        return undefined;
    }
  }
}

// ==================== 类型定义 ====================

interface ClaudeResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{
    type: string;
    text: string;
  }>;
  stop_reason?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}
