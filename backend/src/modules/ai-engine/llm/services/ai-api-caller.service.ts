import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  name?: string;
}

export interface ChatCompletionResult {
  content: string;
  model: string;
  tokensUsed: number;
  /** 标识此响应是否为错误消息（仅在非严格模式下有值） */
  isError?: boolean;
}

export interface EmbeddingApiResult {
  embeddings: number[][];
  totalTokens: number;
  model: string;
}

/**
 * AI API 调用服务
 * 负责：调用各个 provider 的 API（OpenAI、Anthropic、Google、XAI）
 */
@Injectable()
export class AiApiCallerService {
  private readonly logger = new Logger(AiApiCallerService.name);

  constructor(private readonly httpService: HttpService) {}

  /**
   * 调用 OpenAI 兼容格式的 API（OpenAI, Azure, 各种代理服务）
   * ★ 数据库驱动：使用 tokenParamName 配置决定 token 参数名
   */
  async callOpenAICompatibleAPI(
    apiEndpoint: string,
    apiKey: string,
    modelId: string,
    messages: ChatMessage[],
    maxTokens: number,
    temperature?: number,
    timeout: number = 120000,
    tokenParamName: string = "max_tokens",
  ): Promise<ChatCompletionResult> {
    // ★ 关键修复：确保 apiEndpoint 有效
    const effectiveEndpoint =
      apiEndpoint?.trim() || "https://api.openai.com/v1/chat/completions";

    // ★ 数据库驱动：使用配置的 tokenParamName，无需硬编码判断
    const tokenParam = { [tokenParamName]: maxTokens };

    // ★ 自适应：只有 o1/o3 系列需要 reasoning_effort 参数
    // GPT-5 系列虽然是推理模型，但不需要此参数（默认 none）
    const modelLower = modelId.toLowerCase();
    const isO1O3Model =
      modelLower.startsWith("o1") || modelLower.startsWith("o3");
    const reasoningParam = isO1O3Model ? { reasoning_effort: "low" } : {};

    if (isO1O3Model) {
      this.logger.debug(
        `[callOpenAICompatibleAPI] o1/o3 model detected, adding reasoning_effort=low`,
      );
    }

    // ★ 构建请求体 - 只包含有效的参数
    const requestBody: Record<string, any> = {
      model: modelId,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      ...tokenParam,
      ...reasoningParam,
    };

    // ★ 只有当 temperature 有值时才包含，避免发送 null/undefined
    if (temperature !== undefined && temperature !== null) {
      requestBody.temperature = temperature;
    }

    this.logger.debug(
      `[callOpenAICompatibleAPI] model=${modelId}, endpoint=${effectiveEndpoint.substring(0, 50)}..., ` +
        `tokens=${maxTokens}, temp=${temperature}, msgs=${messages.length}`,
    );

    const response = await firstValueFrom(
      this.httpService.post(effectiveEndpoint, requestBody, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout,
      }),
    );

    const data = response.data;
    const messageObj = data.choices?.[0]?.message;
    const content =
      messageObj?.content ||
      messageObj?.text ||
      messageObj?.output ||
      (typeof messageObj === "string" ? messageObj : null);

    // ★ 检查 OpenAI 拒绝响应
    if (messageObj?.refusal) {
      this.logger.error(
        `[${modelId}] API refused to respond: ${messageObj.refusal}`,
      );
      throw new Error(`AI 拒绝响应: ${messageObj.refusal}`);
    }

    // ★ 空内容检查
    if (!content) {
      const usage = data.usage || {};
      const completionDetails = usage.completion_tokens_details || {};
      const reasoningTokens = completionDetails.reasoning_tokens || 0;
      const completionTokens = usage.completion_tokens || 0;
      const finishReason = data.choices?.[0]?.finish_reason;

      this.logger.warn(
        `[${modelId}] API returned empty content! ` +
          `finish_reason=${finishReason}, ` +
          `prompt_tokens=${usage.prompt_tokens || "?"}, ` +
          `completion_tokens=${completionTokens || "?"}, ` +
          `reasoning_tokens=${reasoningTokens || "?"}, ` +
          `message structure: ${JSON.stringify(messageObj || {}).substring(0, 500)}`,
      );

      // 检测 reasoning 模型用完了推理 token
      const isReasoningModelExhausted =
        reasoningTokens > 0 && reasoningTokens >= completionTokens * 0.9;

      if (finishReason === "length") {
        if (isReasoningModelExhausted) {
          // ★ 推理模型需要更多 tokens - 内部推理通常占 80-90%
          throw new Error(
            `AI 推理模型的 token 全部用于内部思考，没有空间输出结果。` +
              `当前 max_tokens=${maxTokens}，建议增加到 25000+ 以确保有足够空间输出内容。` +
              `（推理模型会使用大部分 tokens 进行 Chain of Thought）`,
          );
        } else {
          throw new Error(
            `AI 响应被完全截断（上下文可能过大）。prompt_tokens=${usage.prompt_tokens || "?"}`,
          );
        }
      }

      throw new Error(`AI 返回空响应 (原因: ${finishReason || "unknown"})`);
    }

    return {
      content,
      model: modelId,
      tokensUsed: data.usage?.total_tokens || 0,
    };
  }

  /**
   * 调用 Anthropic Claude API
   */
  async callAnthropicAPI(
    apiEndpoint: string,
    apiKey: string,
    modelId: string,
    messages: ChatMessage[],
    maxTokens: number,
    temperature?: number,
    timeout: number = 120000,
  ): Promise<ChatCompletionResult> {
    // ★ 确保 apiEndpoint 有效
    const effectiveEndpoint =
      apiEndpoint?.trim() || "https://api.anthropic.com/v1/messages";

    // Extract system message
    const systemMessage = messages.find((m) => m.role === "system");
    const otherMessages = messages.filter((m) => m.role !== "system");

    // ★ 构建请求体 - 只包含有效的参数
    const requestBody: Record<string, any> = {
      model: modelId,
      max_tokens: maxTokens,
      messages: otherMessages.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      })),
    };

    // 只有当 system 有内容时才包含
    if (systemMessage?.content) {
      requestBody.system = systemMessage.content;
    }

    // 只有当 temperature 有值时才包含
    if (temperature !== undefined && temperature !== null) {
      requestBody.temperature = temperature;
    }

    this.logger.debug(
      `[callAnthropicAPI] model=${modelId}, maxTokens=${maxTokens}`,
    );

    const response = await firstValueFrom(
      this.httpService.post(effectiveEndpoint, requestBody, {
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        timeout,
      }),
    );

    const data = response.data;
    return {
      content: data.content?.[0]?.text || "",
      model: modelId,
      tokensUsed:
        (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
    };
  }

  /**
   * 调用 Google Gemini API
   */
  async callGoogleAPI(
    apiEndpoint: string,
    apiKey: string,
    modelId: string,
    messages: ChatMessage[],
    maxTokens: number,
    temperature?: number,
    timeout: number = 120000,
  ): Promise<ChatCompletionResult> {
    // ★ 确保 apiEndpoint 有效
    const effectiveEndpoint =
      apiEndpoint?.trim() || "https://generativelanguage.googleapis.com/v1beta";

    // 直接使用数据库配置的模型 ID，不做额外验证
    const effectiveModelId = modelId;

    // 构建正确的 Gemini API URL
    let apiUrl: string;
    if (effectiveEndpoint.includes(":generateContent")) {
      // 完整 URL，直接使用
      apiUrl = `${effectiveEndpoint}?key=${apiKey}`;
    } else if (effectiveEndpoint.includes("/models")) {
      // 已包含 /models，只需添加模型 ID
      const baseUrl = effectiveEndpoint.endsWith("/")
        ? effectiveEndpoint.slice(0, -1)
        : effectiveEndpoint;
      apiUrl = `${baseUrl}/${effectiveModelId}:generateContent?key=${apiKey}`;
    } else {
      // 基础 URL，需要添加 /models/
      const baseUrl = effectiveEndpoint.endsWith("/")
        ? effectiveEndpoint.slice(0, -1)
        : effectiveEndpoint;
      apiUrl = `${baseUrl}/models/${effectiveModelId}:generateContent?key=${apiKey}`;
    }

    // Extract system message
    const systemMessage = messages.find((m) => m.role === "system");
    const otherMessages = messages.filter((m) => m.role !== "system");

    // Convert to Gemini format
    const contents = otherMessages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    // ★ 构建请求体 - 只包含有效的 temperature
    const generationConfig: Record<string, any> = {
      maxOutputTokens: maxTokens,
      topP: 0.95,
      topK: 40,
    };

    // 只有当 temperature 有值时才包含
    if (temperature !== undefined && temperature !== null) {
      generationConfig.temperature = temperature;
    }

    const requestBody: any = {
      contents,
      generationConfig,
    };

    if (systemMessage) {
      requestBody.systemInstruction = {
        parts: [{ text: systemMessage.content }],
      };
    }

    this.logger.debug(
      `[callGoogleAPI] model=${modelId}, maxTokens=${maxTokens}`,
    );

    const response = await firstValueFrom(
      this.httpService.post(apiUrl, requestBody, {
        headers: {
          "Content-Type": "application/json",
        },
        timeout,
      }),
    );

    const data = response.data;

    // Check for blocked content
    if (data.candidates?.[0]?.finishReason === "SAFETY") {
      return {
        content:
          "I apologize, but I cannot provide a response to that request due to content safety guidelines.",
        model: effectiveModelId,
        tokensUsed: 0,
      };
    }

    return {
      content: data.candidates?.[0]?.content?.parts?.[0]?.text || "",
      model: effectiveModelId,
      tokensUsed:
        (data.usageMetadata?.promptTokenCount || 0) +
        (data.usageMetadata?.candidatesTokenCount || 0),
    };
  }

  /**
   * 调用 xAI (Grok) API
   */
  async callXAIAPI(
    apiEndpoint: string,
    apiKey: string,
    modelId: string,
    messages: ChatMessage[],
    maxTokens: number,
    temperature?: number,
    timeout: number = 120000,
    tokenParamName: string = "max_tokens",
  ): Promise<ChatCompletionResult> {
    // ★ 确保 apiEndpoint 有效
    const effectiveEndpoint =
      apiEndpoint?.trim() || "https://api.x.ai/v1/chat/completions";

    // ★ 数据库驱动：使用配置的 tokenParamName
    const requestBody: Record<string, any> = {
      model: modelId,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      [tokenParamName]: maxTokens,
    };

    // 只有当 temperature 有值时才包含
    if (temperature !== undefined && temperature !== null) {
      requestBody.temperature = temperature;
    }

    this.logger.debug(`[callXAIAPI] model=${modelId}, maxTokens=${maxTokens}`);

    const response = await firstValueFrom(
      this.httpService.post(effectiveEndpoint, requestBody, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout,
      }),
    );

    const data = response.data;
    return {
      content: data.choices?.[0]?.message?.content || "",
      model: modelId,
      tokensUsed: data.usage?.total_tokens || 0,
    };
  }

  // ==================== Embedding API Methods ====================

  /**
   * 调用 OpenAI 兼容格式的 Embedding API（OpenAI, xAI, DeepSeek 等）
   * POST {endpoint}/embeddings, Bearer auth
   */
  async callOpenAICompatibleEmbeddingAPI(
    apiEndpoint: string,
    apiKey: string,
    modelId: string,
    inputs: string[],
    timeout: number = 60000,
  ): Promise<EmbeddingApiResult> {
    let embeddingsUrl = apiEndpoint?.trim() || "https://api.openai.com/v1";
    // Ensure URL ends with /embeddings
    embeddingsUrl = embeddingsUrl.replace(/\/+$/, "");
    if (!embeddingsUrl.endsWith("/embeddings")) {
      embeddingsUrl = `${embeddingsUrl}/embeddings`;
    }

    this.logger.debug(
      `[callOpenAICompatibleEmbeddingAPI] model=${modelId}, inputs=${inputs.length}, endpoint=${embeddingsUrl.substring(0, 60)}...`,
    );

    const response = await firstValueFrom(
      this.httpService.post(
        embeddingsUrl,
        { model: modelId, input: inputs },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          timeout,
        },
      ),
    );

    const data = response.data;
    const embeddings = (data.data || []).map(
      (item: { embedding: number[] }) => item.embedding,
    );
    return {
      embeddings,
      totalTokens: data.usage?.total_tokens || 0,
      model: modelId,
    };
  }

  /**
   * 调用 Google 原生 Embedding API
   * POST {baseUrl}/models/{model}:batchEmbedContents, x-goog-api-key header
   */
  async callGoogleEmbeddingAPI(
    apiEndpoint: string,
    apiKey: string,
    modelId: string,
    inputs: string[],
    timeout: number = 60000,
  ): Promise<EmbeddingApiResult> {
    // Normalize base URL: strip trailing /models, /models/, or trailing slashes
    const baseUrl = (
      apiEndpoint?.trim() ||
      "https://generativelanguage.googleapis.com/v1beta"
    ).replace(/\/models\/?$/, "").replace(/\/+$/, "");

    const apiUrl = `${baseUrl}/models/${modelId}:batchEmbedContents`;

    this.logger.debug(
      `[callGoogleEmbeddingAPI] model=${modelId}, inputs=${inputs.length} (google format)`,
    );

    const requests = inputs.map((text) => ({
      model: `models/${modelId}`,
      content: { parts: [{ text }] },
    }));

    const response = await firstValueFrom(
      this.httpService.post(
        apiUrl,
        { requests },
        {
          headers: {
            "x-goog-api-key": apiKey,
            "Content-Type": "application/json",
          },
          timeout,
        },
      ),
    );

    const data = response.data;
    const embeddings = (data.embeddings || []).map(
      (item: { values: number[] }) => item.values,
    );
    return {
      embeddings,
      totalTokens: 0, // Google does not return token counts for embeddings
      model: modelId,
    };
  }

  /**
   * 调用 Cohere Embedding API
   * POST {endpoint}/embed, Bearer auth, input_type: "search_document"
   */
  async callCohereEmbeddingAPI(
    apiEndpoint: string,
    apiKey: string,
    modelId: string,
    inputs: string[],
    inputType: string = "search_document",
    timeout: number = 60000,
  ): Promise<EmbeddingApiResult> {
    let embedUrl = apiEndpoint?.trim() || "https://api.cohere.com/v1";
    embedUrl = embedUrl.replace(/\/+$/, "");
    if (!embedUrl.endsWith("/embed")) {
      embedUrl = `${embedUrl}/embed`;
    }

    this.logger.debug(
      `[callCohereEmbeddingAPI] model=${modelId}, inputs=${inputs.length} (cohere format)`,
    );

    const response = await firstValueFrom(
      this.httpService.post(
        embedUrl,
        {
          model: modelId,
          texts: inputs,
          input_type: inputType,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          timeout,
        },
      ),
    );

    const data = response.data;
    const embeddings: number[][] = data.embeddings || [];
    return {
      embeddings,
      totalTokens: data.meta?.billed_units?.input_tokens || 0,
      model: modelId,
    };
  }
}
