import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import type { ChatMessage } from "../types/task-profile.types";
import {
  reasoningDepthToEffort,
  safeReasoningEffort,
} from "../types/task-profile.types";
import {
  JsonSchemaStrictAdapter,
  JsonSchemaAdapter,
  JsonModeAdapter,
  AnthropicToolUseAdapter,
  GeminiResponseSchemaAdapter,
  GbnfGrammarAdapter,
  PromptOnlyAdapter,
} from "../structured-output/adapters";
import type { StructuredOutputStrategy } from "../structured-output/structured-output-strategy.types";

/**
 * 解析 ChatMessage 的有效内容：优先使用 contentParts（多模态），回退到 content（纯文本）
 * 返回 OpenAI/xAI 兼容格式
 */
function resolveOpenAIContent(msg: ChatMessage):
  | string
  | Array<{
      type: string;
      text?: string;
      image_url?: { url: string; detail?: string };
    }> {
  if (!msg.contentParts || msg.contentParts.length === 0) return msg.content;
  return msg.contentParts.map((part) => {
    if (part.type === "text") return { type: "text" as const, text: part.text };
    return {
      type: "image_url" as const,
      image_url: {
        url: part.image_url.url,
        detail: part.image_url.detail || "auto",
      },
    };
  });
}

/**
 * 解析 ChatMessage 的有效内容：Anthropic 格式
 */
function resolveAnthropicContent(msg: ChatMessage):
  | string
  | Array<{
      type: string;
      text?: string;
      source?: { type: string; url: string };
    }> {
  if (!msg.contentParts || msg.contentParts.length === 0) return msg.content;
  return msg.contentParts.map((part) => {
    if (part.type === "text") return { type: "text" as const, text: part.text };
    return {
      type: "image" as const,
      source: { type: "url", url: part.image_url.url },
    };
  });
}

/**
 * 解析 ChatMessage 的有效内容：Google Gemini 格式
 *
 * ★ 限制：Gemini 原生 API 不支持外部 HTTP URL 图片（fileData 仅接受 GCS URI，
 * inlineData 需要 base64）。当 contentParts 包含 image_url 时，图片部分会被
 * 跳过，只保留文本。如需 Gemini Vision，需在上层先将图片下载转为 base64。
 */
function resolveGeminiParts(msg: ChatMessage): Array<{ text?: string }> {
  if (!msg.contentParts || msg.contentParts.length === 0) {
    return [{ text: msg.content }];
  }

  const hasImages = msg.contentParts.some((p) => p.type === "image_url");
  if (hasImages) {
    // Gemini 原生 API 不支持外部 URL 图片，降级为纯文本
    // 将图片的 caption/alt 信息保留为文本描述
    const textParts = msg.contentParts
      .filter((p) => p.type === "text")
      .map((p) => ({ text: (p as { type: "text"; text: string }).text }));
    if (textParts.length === 0) {
      return [{ text: msg.content }];
    }
    return textParts;
  }

  return msg.contentParts
    .filter((p) => p.type === "text")
    .map((p) => ({ text: (p as { type: "text"; text: string }).text }));
}

export interface ChatCompletionResult {
  content: string;
  model: string;
  tokensUsed: number;
  /** 输入 token 数 */
  inputTokens?: number;
  /** 输出 token 数 */
  outputTokens?: number;
  /** Prompt Cache 写入 token 数（Anthropic） */
  cacheCreationTokens?: number;
  /** Prompt Cache 命中 token 数（Anthropic / OpenAI） */
  cacheReadTokens?: number;
  /** API 返回的完成原因（"stop"=正常完成, "length"=截断） */
  finishReason?: string;
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
/** 超过此 token 阈值的请求被视为异常（用于安全阀日志） */
const OVERSIZED_REQUEST_TOKEN_THRESHOLD = 100_000;
/** 粗略的字符-to-token 换算比（英文 ~4 chars/token，中文 ~2） */
const CHARS_TO_TOKENS_RATIO = 4;
/** 错误诊断日志中堆栈帧数量 */
const STACK_CONTEXT_LINES = 5;
// reasoningDepth → reasoning_effort 映射统一在 types/task-profile.types.ts，
// 所有 path（Path A / Path B / Stream）共享，不得在 callsite hardcode。

@Injectable()
export class AiApiCallerService {
  private readonly logger = new Logger(AiApiCallerService.name);

  constructor(private readonly httpService: HttpService) {}

  /**
   * 检测并记录异常大请求（>100K tokens），帮助快速定位 prompt 膨胀来源
   */
  private logOversizedRequest(
    provider: string,
    modelId: string,
    estimatedTokens: number,
    estimatedChars: number,
    messages: ReadonlyArray<Record<string, unknown>>,
  ): void {
    if (estimatedTokens <= OVERSIZED_REQUEST_TOKEN_THRESHOLD) return;
    const messageSizes = messages.map((m, i) => {
      const size =
        typeof m.content === "string"
          ? m.content.length
          : JSON.stringify(m.content).length;
      return `msg[${i}](${m.role}): ${size} chars`;
    });
    this.logger.error(
      `[${provider}] ⚠ OVERSIZED REQUEST detected: model=${modelId}, ` +
        `estimatedTokens=${estimatedTokens}, totalChars=${estimatedChars}, ` +
        `msgs=${messages.length}, breakdown=[${messageSizes.join(", ")}]. ` +
        `Stack: ${new Error().stack
          ?.split("\n")
          .slice(1, 1 + STACK_CONTEXT_LINES)
          .join(" → ")}`,
    );
  }

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
    responseFormat?: string,
    reasoningDepth?: string,
    outputSchema?: { type: string; schema: Record<string, unknown> },
    schemaStrict?: boolean,
    isReasoning: boolean = false,
    structuredOutputStrategy?: StructuredOutputStrategy,
    outputJsonSchema?: Record<string, unknown>,
    schemaName?: string,
  ): Promise<ChatCompletionResult> {
    // ★ 关键修复：确保 apiEndpoint 有效
    const effectiveEndpoint =
      apiEndpoint?.trim() || "https://api.openai.com/v1/chat/completions";

    // ★ 数据库驱动：使用配置的 tokenParamName，无需硬编码判断
    const tokenParam = { [tokenParamName]: maxTokens };

    // ★ 数据库驱动：是否传 reasoning_effort 由 AIModelConfig.isReasoning 决定
    // 不再用模型名 startsWith 字符串匹配（模型每月新增，硬编码必然过时）
    // 新接 BYOK 的推理模型（gpt-5/6/o5/...），管理员在 DB 把 isReasoning 设为 true 即可
    const modelLower = modelId.toLowerCase();
    let reasoningParam: { reasoning_effort?: string } = {};
    if (isReasoning) {
      const effort = safeReasoningEffort(reasoningDepth, modelId);
      const origEffort = reasoningDepthToEffort(reasoningDepth);
      if (origEffort !== effort) {
        this.logger.warn(
          `[callOpenAICompatibleAPI] minimal effort not supported by ${modelId}, downgrading to ${effort}`,
        );
      }
      reasoningParam = { reasoning_effort: effort };
      this.logger.debug(
        `[callOpenAICompatibleAPI] reasoning model (${modelId}), reasoning_effort=${effort}`,
      );
    }

    // ★ 构建请求体 - 只包含有效的参数（支持多模态 contentParts）
    // Layer 4/5 (2026-05-07): role:"tool" + toolCallId 透到 OpenAI native tool_call_id 字段，
    // 让 vLLM / OpenAI 支持 native tool_use_id 配对（多轮 FC 场景必需）。
    // role:"tool" 不带 toolCallId 时（回退路径）OpenAI 会拒绝 — 此场景实际不发生：
    // updateEnvelope 写 role:"tool" 时 callId 来自 LLM tool_calls[].id，必然存在。
    const resolvedMessages = messages.map((m) => {
      const base: Record<string, unknown> = {
        role: m.role,
        content: resolveOpenAIContent(m),
      };
      if (m.role === "tool" && m.toolCallId) {
        base.tool_call_id = m.toolCallId;
      }
      if (m.name) base.name = m.name;
      return base;
    });

    // ★ 安全阀：检测异常大请求并记录诊断信息
    const estimatedChars = resolvedMessages.reduce((sum, m) => {
      if (typeof m.content === "string") return sum + m.content.length;
      if (Array.isArray(m.content))
        return (
          sum +
          m.content.reduce(
            (s, p) => s + (p.text?.length || p.image_url?.url?.length || 0),
            0,
          )
        );
      return sum;
    }, 0);
    this.logOversizedRequest(
      "callOpenAICompatibleAPI",
      modelId,
      Math.ceil(estimatedChars / CHARS_TO_TOKENS_RATIO),
      estimatedChars,
      resolvedMessages,
    );

    const requestBody: Record<string, unknown> = {
      model: modelId,
      messages: resolvedMessages,
      ...tokenParam,
      ...reasoningParam,
    };

    // ★ 只有当 temperature 有值时才包含，避免发送 null/undefined
    if (temperature !== undefined && temperature !== null) {
      requestBody.temperature = temperature;
    }

    // ★ deepseek-reasoner does NOT support response_format (INVALID_REQUEST error)
    // Instead of response_format, inject a JSON constraint into the system prompt
    const isDeepseekReasoner = modelLower.includes("deepseek-reasoner");

    // ★ 2026-05-06 native structured output path: prefer StructuredOutputRouter adapter
    // over the legacy ad-hoc outputSchema path. When structuredOutputStrategy +
    // outputJsonSchema are provided, apply the adapter's requestBodyPatch and
    // any systemPromptAddon — replacing the old manual response_format wiring.
    if (structuredOutputStrategy && outputJsonSchema && !isDeepseekReasoner) {
      const adapter = this.getStructuredOutputAdapter(structuredOutputStrategy);
      const adaptOut = adapter.adapt({
        jsonSchema: outputJsonSchema,
        schemaName: schemaName ?? "structured_output",
        modelId,
      });
      Object.assign(requestBody, adaptOut.requestBodyPatch);
      if (adaptOut.systemPromptAddon) {
        const msgs = requestBody["messages"] as Array<{
          role: string;
          content: unknown;
        }>;
        const systemMsg = msgs.find((m) => m.role === "system");
        if (systemMsg && typeof systemMsg.content === "string") {
          systemMsg.content += adaptOut.systemPromptAddon;
        } else {
          msgs.unshift({
            role: "system",
            content: adaptOut.systemPromptAddon.trim(),
          });
        }
      }
    } else if (!isDeepseekReasoner && outputSchema) {
      // ★ Legacy ad-hoc path (fallback when new fields not provided)
      requestBody["response_format"] = {
        type: "json_schema",
        json_schema: {
          name: "structured_output",
          schema: outputSchema.schema,
          strict: schemaStrict ?? false,
        },
      };
    } else if (!isDeepseekReasoner && responseFormat === "json") {
      requestBody["response_format"] = { type: "json_object" };
    } else if (
      isDeepseekReasoner &&
      (outputSchema || responseFormat === "json" || outputJsonSchema)
    ) {
      // ★ deepseek-reasoner: 用 system prompt 替代 response_format 约束 JSON 输出
      // 在第一条 system message 末尾追加 JSON 约束指令
      const jsonConstraint =
        "\n\n[CRITICAL OUTPUT FORMAT] You MUST output ONLY a valid JSON object. " +
        "Do NOT wrap it in ```json code blocks. Do NOT add any text before or after the JSON. " +
        "The response must start with { and end with }. No markdown, no explanations.";
      const msgs = requestBody["messages"] as Array<{
        role: string;
        content: unknown;
      }>;
      const systemMsg = msgs.find((m) => m.role === "system");
      if (systemMsg && typeof systemMsg.content === "string") {
        systemMsg.content += jsonConstraint;
      } else {
        // No system message or multimodal contentParts — inject as new system message
        msgs.unshift({ role: "system", content: jsonConstraint.trim() });
      }
    }

    this.logger.debug(
      `[callOpenAICompatibleAPI] model=${modelId}, endpoint=${effectiveEndpoint.substring(0, 50)}..., ` +
        `tokens=${maxTokens}, temp=${temperature}, msgs=${messages.length}, ~${Math.ceil(estimatedChars / CHARS_TO_TOKENS_RATIO)} input tokens`,
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

    const openaiUsage = data.usage || {};
    const promptTokensDetails = openaiUsage.prompt_tokens_details || {};
    return {
      content,
      model: modelId,
      tokensUsed: openaiUsage.total_tokens || 0,
      inputTokens: openaiUsage.prompt_tokens || 0,
      outputTokens: openaiUsage.completion_tokens || 0,
      cacheReadTokens: promptTokensDetails.cached_tokens || 0,
      finishReason: data.choices?.[0]?.finish_reason || undefined,
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
    responseFormat?: string,
    _reasoningDepth?: string,
    cachePolicy?: string,
    structuredOutputStrategy?: StructuredOutputStrategy,
    outputJsonSchema?: Record<string, unknown>,
    schemaName?: string,
  ): Promise<ChatCompletionResult> {
    if (responseFormat === "json") {
      this.logger.warn(
        `[callAnthropicAPI] responseFormat="json" requested but Anthropic does not support json_object mode natively. ` +
          `Relying on system prompt constraint only.`,
      );
    }
    // ★ 确保 apiEndpoint 有效
    const effectiveEndpoint =
      apiEndpoint?.trim() || "https://api.anthropic.com/v1/messages";

    // Extract system message
    const systemMessage = messages.find((m) => m.role === "system");
    const otherMessages = messages.filter((m) => m.role !== "system");

    // ★ 构建请求体 - 只包含有效的参数（支持多模态 contentParts）
    // Layer 4/5 (2026-05-07): role:"tool" + toolCallId 转 Anthropic native tool_result block。
    // Anthropic wire 形态：role:"user" + content:[{type:"tool_result",tool_use_id,content}]
    // 不带 toolCallId 的 tool 消息（数据缺失/旧路径）退到 plain text user 兜底。
    const requestBody: Record<string, unknown> = {
      model: modelId,
      max_tokens: maxTokens,
      messages: otherMessages.map((m) => {
        if (m.role === "tool" && m.toolCallId) {
          return {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: m.toolCallId,
                content:
                  typeof m.content === "string"
                    ? m.content
                    : JSON.stringify(m.content),
              },
            ],
          };
        }
        return {
          role: m.role === "assistant" ? "assistant" : "user",
          content: resolveAnthropicContent(m),
        };
      }),
    };

    // 只有当 system 有内容时才包含（system 仅支持纯文本）
    if (systemMessage?.content) {
      if (cachePolicy === "auto") {
        requestBody.system = [
          {
            type: "text",
            text: systemMessage.content,
            cache_control: { type: "ephemeral" },
          },
        ];
      } else {
        requestBody.system = systemMessage.content;
      }
    }

    // 只有当 temperature 有值时才包含
    if (temperature !== undefined && temperature !== null) {
      requestBody.temperature = temperature;
    }

    // ★ 2026-05-06 native structured output path for Anthropic (tool_use strategy)
    // adapter.adapt() sets requestBody.tools + requestBody.tool_choice
    let anthropicStructuredStrategy: StructuredOutputStrategy | undefined;
    if (structuredOutputStrategy && outputJsonSchema) {
      const adapter = this.getStructuredOutputAdapter(structuredOutputStrategy);
      const adaptOut = adapter.adapt({
        jsonSchema: outputJsonSchema,
        schemaName: schemaName ?? "structured_output",
        modelId,
      });
      Object.assign(requestBody, adaptOut.requestBodyPatch);
      if (adaptOut.systemPromptAddon) {
        // Append to system if present, or add a new system field
        if (typeof requestBody.system === "string") {
          requestBody.system = requestBody.system + adaptOut.systemPromptAddon;
        } else if (
          Array.isArray(requestBody.system) &&
          requestBody.system.length > 0
        ) {
          // cache_control format — append to last text block
          const sys = requestBody.system as Array<{
            type: string;
            text: string;
            cache_control?: unknown;
          }>;
          sys[sys.length - 1].text += adaptOut.systemPromptAddon;
        } else {
          requestBody.system = adaptOut.systemPromptAddon.trim();
        }
      }
      anthropicStructuredStrategy = structuredOutputStrategy;
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
    const anthropicUsage = data.usage || {};

    // ★ postParse: for tool_use strategy, extract JSON from the tool_use content block
    let textContent = data.content?.[0]?.text || "";
    if (anthropicStructuredStrategy === "tool_use") {
      const toolUseBlock = data.content?.find(
        (b: { type: string }) => b.type === "tool_use",
      ) as { type: string; name?: string; input?: unknown } | undefined;
      if (toolUseBlock?.input != null) {
        textContent = JSON.stringify(toolUseBlock.input);
      } else if (!textContent) {
        // fallback: check if any text block present
        textContent =
          data.content?.find(
            (b: { type: string; text?: string }) => b.type === "text",
          )?.text || "";
      }
    }

    return {
      content: textContent,
      model: modelId,
      tokensUsed:
        (anthropicUsage.input_tokens || 0) +
        (anthropicUsage.output_tokens || 0),
      inputTokens: anthropicUsage.input_tokens || 0,
      outputTokens: anthropicUsage.output_tokens || 0,
      cacheCreationTokens: anthropicUsage.cache_creation_input_tokens || 0,
      cacheReadTokens: anthropicUsage.cache_read_input_tokens || 0,
      finishReason:
        data.stop_reason === "max_tokens"
          ? "length"
          : data.stop_reason || undefined,
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
    responseFormat?: string,
    _reasoningDepth?: string,
    structuredOutputStrategy?: StructuredOutputStrategy,
    outputJsonSchema?: Record<string, unknown>,
    schemaName?: string,
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

    // Convert to Gemini format（支持多模态 contentParts）
    // Layer 4/5 (2026-05-07): role:"tool" + toolCallId 转 Gemini native functionResponse part。
    // Gemini wire 形态：role:"function" + parts:[{functionResponse:{name,response:{content}}}]
    // （Gemini 没 tool_use_id 概念，靠 name 配对；toolCallId 暂保留进 functionResponse.id 字段）
    const contents = otherMessages.map((m) => {
      if (m.role === "tool" && m.toolCallId) {
        return {
          role: "function",
          parts: [
            {
              functionResponse: {
                name: m.name ?? "tool",
                response: {
                  id: m.toolCallId,
                  content:
                    typeof m.content === "string"
                      ? m.content
                      : JSON.stringify(m.content),
                },
              },
            },
          ],
        };
      }
      return {
        role: m.role === "assistant" ? "model" : "user",
        parts: resolveGeminiParts(m),
      };
    });

    // ★ 构建请求体 - 不硬编码 topP/topK。
    // 之前硬编码 topP=0.95/topK=40 会覆盖 Gemini 各模型的服务端默认值，
    // 导致 Gemini 2.5 Pro / thinking 系列（这类模型官方推荐 topP=1.0）
    // 采样分布被错误收紧。采样参数应由 TaskProfile / DB 配置驱动，
    // 调用方不传就让服务端用模型自己的默认值。
    const generationConfig: Record<string, unknown> = {
      maxOutputTokens: maxTokens,
    };

    // 只有当 temperature 有值时才包含
    if (temperature !== undefined && temperature !== null) {
      generationConfig.temperature = temperature;
    }

    // ★ 2026-05-06 native structured output path for Gemini (gemini_response_schema)
    // adapter merges responseMimeType + responseSchema into generationConfig
    if (structuredOutputStrategy && outputJsonSchema) {
      const adapter = this.getStructuredOutputAdapter(structuredOutputStrategy);
      const adaptOut = adapter.adapt({
        jsonSchema: outputJsonSchema,
        schemaName: schemaName ?? "structured_output",
        modelId,
      });
      // The Gemini adapter patches { generationConfig: { responseMimeType, responseSchema } }
      const gcPatch = adaptOut.requestBodyPatch.generationConfig as
        | Record<string, unknown>
        | undefined;
      if (gcPatch) {
        Object.assign(generationConfig, gcPatch);
      }
      // Other patches (e.g. non-generationConfig fields) applied to requestBody later
    } else if (responseFormat === "json") {
      generationConfig["responseMimeType"] = "application/json";
    }

    const requestBody: Record<string, unknown> = {
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
    responseFormat?: string,
    _reasoningDepth?: string,
    outputSchema?: { type: string; schema: Record<string, unknown> },
    schemaStrict?: boolean,
    isReasoning: boolean = false,
    structuredOutputStrategy?: StructuredOutputStrategy,
    outputJsonSchema?: Record<string, unknown>,
    schemaName?: string,
  ): Promise<ChatCompletionResult> {
    // ★ 确保 apiEndpoint 有效
    const effectiveEndpoint =
      apiEndpoint?.trim() || "https://api.x.ai/v1/chat/completions";

    // ★ 数据库驱动：是否走 reasoning 路径由 AIModelConfig.isReasoning 决定
    // 不再用模型名 includes("reasoning") 启发式判断
    // xAI reasoning models use max_tokens (not max_completion_tokens like OpenAI o-series)
    const isReasoningModel = isReasoning;
    const effectiveTokenParam = isReasoningModel
      ? "max_tokens"
      : tokenParamName;

    // ★ 数据库驱动：使用配置的 tokenParamName（支持多模态 contentParts）
    // Layer 4/5 (2026-05-07): xAI 走 OpenAI 兼容协议，role:"tool" + toolCallId
    // 直接透 tool_call_id 字段。
    const resolvedXaiMessages = messages.map((m) => {
      const base: Record<string, unknown> = {
        role: m.role,
        content: resolveOpenAIContent(m),
      };
      if (m.role === "tool" && m.toolCallId) {
        base.tool_call_id = m.toolCallId;
      }
      if (m.name) base.name = m.name;
      return base;
    });

    // ★ 安全阀：检测异常大请求并记录诊断信息
    const xaiEstimatedChars = resolvedXaiMessages.reduce((sum, m) => {
      if (typeof m.content === "string") return sum + m.content.length;
      if (Array.isArray(m.content))
        return (
          sum +
          m.content.reduce(
            (s, p) => s + (p.text?.length || p.image_url?.url?.length || 0),
            0,
          )
        );
      return sum;
    }, 0);
    this.logOversizedRequest(
      "callXAIAPI",
      modelId,
      Math.ceil(xaiEstimatedChars / CHARS_TO_TOKENS_RATIO),
      xaiEstimatedChars,
      resolvedXaiMessages,
    );

    const requestBody: Record<string, unknown> = {
      model: modelId,
      messages: resolvedXaiMessages,
      [effectiveTokenParam]: maxTokens,
    };
    if (
      temperature !== undefined &&
      temperature !== null &&
      !isReasoningModel
    ) {
      requestBody.temperature = temperature;
    }

    // ★ 2026-05-06 native structured output path for xAI (same OpenAI compat)
    if (structuredOutputStrategy && outputJsonSchema) {
      const adapter = this.getStructuredOutputAdapter(structuredOutputStrategy);
      const adaptOut = adapter.adapt({
        jsonSchema: outputJsonSchema,
        schemaName: schemaName ?? "structured_output",
        modelId,
      });
      Object.assign(requestBody, adaptOut.requestBodyPatch);
      if (adaptOut.systemPromptAddon) {
        const msgs = requestBody["messages"] as Array<{
          role: string;
          content: unknown;
        }>;
        const systemMsg = msgs.find((m) => m.role === "system");
        if (systemMsg && typeof systemMsg.content === "string") {
          systemMsg.content += adaptOut.systemPromptAddon;
        } else {
          msgs.unshift({
            role: "system",
            content: adaptOut.systemPromptAddon.trim(),
          });
        }
      }
    } else if (outputSchema) {
      // ★ Legacy ad-hoc path
      // xAI reasoning models DO support response_format (unlike temperature)
      // Without it, reasoning models produce interleaved/malformed JSON output
      requestBody["response_format"] = {
        type: "json_schema",
        json_schema: {
          name: "structured_output",
          schema: outputSchema.schema,
          strict: schemaStrict ?? false,
        },
      };
    } else if (responseFormat === "json") {
      requestBody["response_format"] = { type: "json_object" };
    }

    this.logger.log(
      `[callXAIAPI] model=${modelId}, tokenParam=${effectiveTokenParam}=${maxTokens}, reasoning=${isReasoningModel}, temp=${temperature}, responseFormat=${responseFormat}, msgs=${messages.length}, ~${Math.ceil(xaiEstimatedChars / CHARS_TO_TOKENS_RATIO)} input tokens`,
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
    // ★ 2026-05-05 fix: 必须返回 inputTokens / outputTokens 才能让 ReactLoop
    //   thinking 事件携带正确 promptTokens / completionTokens，进而被
    //   extractTokenSpend 累计到 mission pool。否则 UI 显示 tokens 永远 0。
    return {
      content: data.choices?.[0]?.message?.content || "",
      model: modelId,
      tokensUsed: data.usage?.total_tokens || 0,
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
    };
  }

  // ==================== Structured Output Adapter Helper ====================

  /**
   * Returns the IStructuredOutputAdapter instance for the given strategy.
   * Uses simple lazy-init singleton map — no DI needed (adapters are stateless).
   */
  private readonly _soAdapters = new Map<
    StructuredOutputStrategy,
    {
      adapt: (input: {
        jsonSchema: Record<string, unknown>;
        schemaName: string;
        modelId: string;
      }) => {
        requestBodyPatch: Record<string, unknown>;
        systemPromptAddon?: string;
      };
    }
  >([
    ["json_schema_strict", new JsonSchemaStrictAdapter()],
    ["json_schema", new JsonSchemaAdapter()],
    ["json_mode", new JsonModeAdapter()],
    ["tool_use", new AnthropicToolUseAdapter()],
    ["gemini_response_schema", new GeminiResponseSchemaAdapter()],
    ["gbnf_grammar", new GbnfGrammarAdapter()],
    ["prompt", new PromptOnlyAdapter()],
  ]);

  private getStructuredOutputAdapter(strategy: StructuredOutputStrategy): {
    adapt: (input: {
      jsonSchema: Record<string, unknown>;
      schemaName: string;
      modelId: string;
    }) => {
      requestBodyPatch: Record<string, unknown>;
      systemPromptAddon?: string;
    };
  } {
    return this._soAdapters.get(strategy) ?? new PromptOnlyAdapter();
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
      apiEndpoint?.trim() || "https://generativelanguage.googleapis.com/v1beta"
    )
      .replace(/\/models\/?$/, "")
      .replace(/\/+$/, "");

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
