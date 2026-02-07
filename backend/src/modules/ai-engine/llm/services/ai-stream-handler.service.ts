import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { ChatMessage } from "../types";

export interface StreamChunk {
  content: string;
  done: boolean;
  error?: string;
}

/**
 * AI 流式处理服务
 * 负责：SSE 流式响应处理（OpenAI、Anthropic）
 */
@Injectable()
export class AiStreamHandlerService {
  private readonly logger = new Logger(AiStreamHandlerService.name);

  constructor(private readonly httpService: HttpService) {}

  /**
   * OpenAI 兼容格式的流式调用
   */
  async *streamOpenAICompatible(
    apiEndpoint: string,
    apiKey: string,
    modelId: string,
    messages: ChatMessage[],
    maxTokens: number,
    temperature?: number,
    tokenParamName: string = "max_tokens",
  ): AsyncGenerator<StreamChunk, void> {
    // ★ 数据库驱动：使用配置的 tokenParamName，无需硬编码判断
    const tokenParam = { [tokenParamName]: maxTokens };

    const modelLower = modelId.toLowerCase();
    const isO1O3Model =
      modelLower.startsWith("o1") || modelLower.startsWith("o3");
    const reasoningParam = isO1O3Model ? { reasoning_effort: "low" } : {};

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          apiEndpoint,
          {
            model: modelId,
            messages: messages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            ...tokenParam,
            ...reasoningParam,
            temperature,
            stream: true,
          },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              Accept: "text/event-stream",
            },
            responseType: "stream",
            timeout: 300000, // 5 分钟超时
          },
        ),
      );

      const stream = response.data;
      let buffer = "";

      for await (const chunk of stream) {
        buffer += chunk.toString();

        // 解析 SSE 事件
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (data === "[DONE]") {
              yield { content: "", done: true };
              return;
            }

            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                yield { content: delta, done: false };
              }
            } catch {
              // 忽略解析错误
            }
          }
        }
      }

      yield { content: "", done: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`[streamOpenAICompatible] Error: ${errorMsg}`);
      yield { content: "", done: true, error: errorMsg };
    }
  }

  /**
   * Anthropic Claude 的 SSE 流式调用
   */
  async *streamAnthropic(
    apiEndpoint: string,
    apiKey: string,
    modelId: string,
    messages: ChatMessage[],
    maxTokens: number,
    temperature?: number,
  ): AsyncGenerator<StreamChunk, void> {
    const systemMessage = messages.find((m) => m.role === "system");
    const otherMessages = messages.filter((m) => m.role !== "system");

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          apiEndpoint,
          {
            model: modelId,
            max_tokens: maxTokens,
            temperature,
            system: systemMessage?.content,
            messages: otherMessages.map((m) => ({
              role: m.role === "assistant" ? "assistant" : "user",
              content: m.content,
            })),
            stream: true,
          },
          {
            headers: {
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
              "Content-Type": "application/json",
              Accept: "text/event-stream",
            },
            responseType: "stream",
            timeout: 300000,
          },
        ),
      );

      const stream = response.data;
      let buffer = "";

      for await (const chunk of stream) {
        buffer += chunk.toString();

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (!data) continue;

            try {
              const parsed = JSON.parse(data);
              // Anthropic 的流式格式
              if (parsed.type === "content_block_delta") {
                const text = parsed.delta?.text;
                if (text) {
                  yield { content: text, done: false };
                }
              } else if (parsed.type === "message_stop") {
                yield { content: "", done: true };
                return;
              }
            } catch {
              // 忽略解析错误
            }
          }
        }
      }

      yield { content: "", done: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`[streamAnthropic] Error: ${errorMsg}`);
      yield { content: "", done: true, error: errorMsg };
    }
  }
}
