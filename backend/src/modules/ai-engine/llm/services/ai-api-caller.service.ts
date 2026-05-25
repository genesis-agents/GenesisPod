import { Injectable, Logger, Optional } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import type { ChatMessage } from "../types/task-profile.types";
import type { FunctionDefinition } from "../../tools/abstractions/tool.interface";
import {
  reasoningDepthToEffort,
  safeReasoningEffort,
} from "../types/task-profile.types";
import {
  ensureChatCompletionsPath,
  ensureMessagesPath,
  ensureGeminiGenerateContentPath,
  ensureOpenAIEmbeddingsPath,
  ensureCohereEmbedPath,
  ensureGeminiBatchEmbedContentsPath,
} from "../types/endpoint.utils";
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
import { ModelCapabilityService } from "../capability/model-capability.service";
import { CapabilitySelfHealService } from "../capability/capability-self-heal.service";
import { extractErrorSignal } from "../capability/error-signal.types";
import { ApiCallerSelfHealTriggerService } from "./api-caller-self-heal-trigger.service";
import type { AIModelConfig } from "../types/model-config.types";

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
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }>;
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

  /**
   * v3.1 §A review (2026-05-24)：fail-open 观测信号去重 Set。
   * 同 (provider, modelId, reason) 仅 warn 一次，防日志风暴。
   * key 格式：`${reason}|${provider}|${modelId}`
   */
  private readonly _capabilityFailOpenWarned = new Set<string>();

  /**
   * v3.1 §D.1 (2026-05-24)：BC 适配字段——旧测试用第 3 构造位注入
   * `CapabilitySelfHealService` 时本字段被自动 wrap 为 selfHealTrigger。
   * 新代码请用第 4 构造位的 ApiCallerSelfHealTriggerService。
   */
  private selfHealTrigger?: ApiCallerSelfHealTriggerService;

  constructor(
    private readonly httpService: HttpService,
    // v3.1 §A: 替代原 isDeepseekReasoner 反模式；caps.structuredOutput.nativeMode
    // === 'none' 决定是否注入 response_format。Optional 保留 BC（旧单测可不注入）。
    @Optional()
    private readonly capabilityService?: ModelCapabilityService,
    // v3.1 §B.5 / D.1 (2026-05-24)：catch 触发 self-heal 已抽到
    // ApiCallerSelfHealTriggerService。第 3 位保留 @Optional CapabilitySelfHealService
    // 旧测试 BC——构造里包装为 selfHealTrigger；新代码请用第 4 位直接注入 trigger。
    @Optional()
    legacySelfHealService?: CapabilitySelfHealService,
    @Optional()
    selfHealTrigger?: ApiCallerSelfHealTriggerService,
  ) {
    this.selfHealTrigger =
      selfHealTrigger ??
      (legacySelfHealService
        ? new ApiCallerSelfHealTriggerService(legacySelfHealService)
        : undefined);
  }

  /**
   * v3.1 §A：判断指定 (provider, modelId) 的模型是否拒绝 response_format 字段。
   *
   * 实现：调用 ModelCapabilityService.resolveCapabilities() 后看
   *      caps.structuredOutput.nativeMode === 'none'。
   *
   * 替代删除的 `modelLower.includes("deepseek-reasoner")` 反模式。
   *
   * 安全设计：
   *   - provider 缺失（旧调用方未传） → 退回 false（**保留 response_format 字段**，
   *     与重构前行为一致；不会因 catalog SAFE_DEFAULTS 误判全平台关 response_format）
   *   - capability service 未注入（旧单测） → 同样退回 false
   *   - provider 已知 + catalog 明确 nativeMode='none' → 返回 true（跳 response_format）
   *
   * v3.1 §A review (2026-05-24) fail-open 观测：
   *   - 当 capability gate 被绕过（service 缺 / provider 空）时记一次 warn，
   *     让运维能在日志里追到"为什么这条没走 catalog"。
   *   - 同 (reason, provider, modelId) 只 warn 一次（_capabilityFailOpenWarned 去重），
   *     防止热路径日志风暴。
   */
  private rejectsResponseFormat(provider: string, modelId: string): boolean {
    if (!this.capabilityService || !provider?.trim()) {
      const reason = !this.capabilityService
        ? "missing-service"
        : "empty-provider";
      const dedupeKey = `${reason}|${provider}|${modelId}`;
      if (!this._capabilityFailOpenWarned.has(dedupeKey)) {
        this._capabilityFailOpenWarned.add(dedupeKey);
        this.logger.warn(
          `[capability-gate] bypassed, fail-open: reason=${reason}, ` +
            `provider="${provider}", modelId="${modelId}" ` +
            `(response_format 将按重构前行为保留；后续重复同源不再 warn)`,
        );
      }
      return false;
    }
    const projection: AIModelConfig = {
      id: "",
      name: "",
      displayName: "",
      provider,
      modelId,
      apiEndpoint: "",
      apiKey: null,
      maxTokens: 0,
      temperature: 0,
      isEnabled: true,
      isDefault: false,
    };
    const caps = this.capabilityService.resolveCapabilities(projection);
    return caps.structuredOutput.nativeMode === "none";
  }

  /**
   * FIX 1: Resolve the EFFECTIVE native structured-output mode for (provider, modelId)
   * from the capability catalog. Returns null when the catalog cannot be consulted
   * (service missing or provider empty) — in that case callers preserve existing
   * behavior (fail-open BC).
   *
   * nativeMode → wire response_format contract (enforced at the HTTP choke point):
   *   none              → NO response_format; inject JSON system-prompt constraint
   *   json_mode         → { type: "json_object" }  (downgrade json_schema requests)
   *   json_schema       → { type: "json_schema", json_schema: { ..., strict: false } }
   *   json_schema_strict→ { type: "json_schema", json_schema: { ..., strict: true } }
   *   tool_use /
   *   gemini_response_schema /
   *   gbnf_grammar      → handled by per-provider adapter path (not raw response_format)
   *   null (unknown)    → existing caller-driven behavior unchanged
   */
  private resolveEffectiveNativeMode(
    provider: string,
    modelId: string,
  ):
    | import("../capability/model-capability.types").NativeStructuredOutputMode
    | null {
    if (!this.capabilityService || !provider?.trim()) {
      return null; // fail-open: preserve caller-driven behavior
    }
    const projection: AIModelConfig = {
      id: "",
      name: "",
      displayName: "",
      provider,
      modelId,
      apiEndpoint: "",
      apiKey: null,
      maxTokens: 0,
      temperature: 0,
      isEnabled: true,
      isDefault: false,
    };
    const caps = this.capabilityService.resolveCapabilities(projection);
    return caps.structuredOutput.nativeMode;
  }

  /**
   * 2026-05-25 (R1 自适应降级): 计算 self-heal 应把 nativeMode 降到哪一档。
   *
   * 旧 self-heal 把 json_schema **一刀切降到 none**（直接 prompt），浪费了多数
   * provider 支持的 json_mode。本 helper 改成**沿派生链走下一档**：
   *   json_schema_strict → json_schema → json_mode → prompt(映射为 none)
   * `current` 传 effectiveNativeMode（当前真实上线值，可能已被上次 self-heal
   * override 改过）→ 多步降级天然成立：下次失败时 current 已是 json_mode，
   * 再降到 prompt→none。
   *
   * @returns { fromValue, toValue } 给 trigger；无法判定（未知模型 / 已到链尾）返 null
   */
  private computeSelfHealDegrade(
    provider: string,
    modelId: string,
    current:
      | import("../capability/model-capability.types").NativeStructuredOutputMode
      | null,
  ): { fromValue: string; toValue: string } | null {
    if (!this.capabilityService || !provider?.trim() || !current) return null;
    const projection: AIModelConfig = {
      id: "",
      name: "",
      displayName: "",
      provider,
      modelId,
      apiEndpoint: "",
      apiKey: null,
      maxTokens: 0,
      temperature: 0,
      isEnabled: true,
      isDefault: false,
    };
    const caps = this.capabilityService.resolveCapabilities(projection);
    const chain = this.capabilityService.deriveStructuredOutputChain(caps);
    const idx = chain.indexOf(current);
    if (idx < 0 || idx >= chain.length - 1) return null; // 未知 / 已到链尾
    const next = chain[idx + 1];
    // 链尾 prompt 不是合法 nativeMode → 映射为 none（同义：不发 response_format）
    return { fromValue: current, toValue: next === "prompt" ? "none" : next };
  }

  /**
   * F3 (2026-05-25): 判断错误是否为"结构化输出格式被拒"（4xx + 提到
   * response_format / json_schema / format）。用于 in-request 当次降级判定 ——
   * 只对真·格式错误重试，避免对 context-too-long / auth 等其它 4xx 浪费重试。
   */
  private isStructuredOutputRejection(err: unknown): boolean {
    const sig = extractErrorSignal(err);
    if (!sig || (sig.httpStatus !== 400 && sig.httpStatus !== 422)) return false;
    const hay = `${sig.errorCode} ${sig.bodySnippet}`.toLowerCase();
    return /response_format|json_schema|json schema|structured|format.*(unavailable|not.*support|unsupported)/.test(
      hay,
    );
  }

  /**
   * OpenAI-compatible providers only accept role:"tool" when paired with a
   * native tool_call_id. Prompt-driven ReAct observations do not have that id,
   * so they must be downgraded to plain user messages instead of emitting an
   * invalid tool protocol payload that strict providers reject.
   */
  private buildOpenAICompatibleMessages(messages: ChatMessage[]) {
    return messages.map((m) => {
      const isNativeToolResult = m.role === "tool" && !!m.toolCallId;
      const openAIContent = resolveOpenAIContent(m);
      const role = isNativeToolResult
        ? "tool"
        : m.role === "tool"
          ? "user"
          : m.role;
      const content =
        m.role === "tool" && !m.toolCallId
          ? `[tool_result${m.name ? `:${m.name}` : ""}]\n${
              typeof openAIContent === "string"
                ? openAIContent
                : JSON.stringify(openAIContent)
            }`
          : openAIContent;
      const base: Record<string, unknown> = { role, content };
      if (isNativeToolResult) {
        base.tool_call_id = m.toolCallId;
      }
      if (m.name && role !== "user") {
        base.name = m.name;
      }
      return base;
    });
  }

  private buildOpenAICompatibleTools(tools?: FunctionDefinition[]) {
    if (!tools || tools.length === 0) return undefined;
    return tools.map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        ...(tool.strict !== undefined ? { strict: tool.strict } : {}),
      },
    }));
  }

  private extractOpenAICompatibleToolCalls(
    messageObj: Record<string, unknown> | undefined,
  ): ChatCompletionResult["toolCalls"] {
    const raw = messageObj?.tool_calls;
    if (!Array.isArray(raw) || raw.length === 0) return undefined;
    return raw
      .map((call) => {
        if (!call || typeof call !== "object") return null;
        const c = call as {
          id?: unknown;
          function?: { name?: unknown; arguments?: unknown };
        };
        const id = typeof c.id === "string" ? c.id : undefined;
        const name =
          typeof c.function?.name === "string" ? c.function.name : undefined;
        const rawArgs = c.function?.arguments;
        let args: Record<string, unknown> = {};
        if (rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs)) {
          args = rawArgs as Record<string, unknown>;
        } else if (typeof rawArgs === "string" && rawArgs.trim().length > 0) {
          try {
            const parsed = JSON.parse(rawArgs);
            if (
              parsed &&
              typeof parsed === "object" &&
              !Array.isArray(parsed)
            ) {
              args = parsed as Record<string, unknown>;
            }
          } catch {
            return null;
          }
        }
        if (!id || !name) return null;
        return { id, name, arguments: args };
      })
      .filter(
        (
          call,
        ): call is {
          id: string;
          name: string;
          arguments: Record<string, unknown>;
        } => call !== null,
      );
  }

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
    tools?: FunctionDefinition[],
    /**
     * v3.1 §A：provider slug（与 AIModelConfig.provider 同语义）。
     * 用于通过 ModelCapabilityService.resolveCapabilities 判定模型是否拒绝
     * response_format（替代删除的 isDeepseekReasoner substring 反模式）。
     * 缺省 = "" → 保留 response_format（向后兼容旧调用方）。
     */
    provider: string = "",
    /** v3.1 §B+.3：BYOK userModelConfigId，catch 触发 self-heal；缺省 = 不触发。 */
    userModelConfigId?: string,
  ): Promise<ChatCompletionResult> {
    // 2026-05-10 §2/§4：单源归一化（base URL → /chat/completions），与
    // streamOpenAICompatible / connection-test 共用 ensureChatCompletionsPath。
    const effectiveEndpoint =
      ensureChatCompletionsPath(apiEndpoint) ||
      "https://api.openai.com/v1/chat/completions";

    // ★ 数据库驱动：使用配置的 tokenParamName，无需硬编码判断
    const tokenParam = { [tokenParamName]: maxTokens };

    // ★ 数据库驱动：是否传 reasoning_effort 由 AIModelConfig.isReasoning 决定
    // 不再用模型名 startsWith 字符串匹配（模型每月新增，硬编码必然过时）
    // 新接 BYOK 的推理模型（gpt-5/6/o5/...），管理员在 DB 把 isReasoning 设为 true 即可
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
    const resolvedMessages = this.buildOpenAICompatibleMessages(messages);

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
    const requestTools = this.buildOpenAICompatibleTools(tools);
    if (requestTools) {
      requestBody.tools = requestTools;
    }

    // ★ 只有当 temperature 有值时才包含，避免发送 null/undefined
    if (temperature !== undefined && temperature !== null) {
      requestBody.temperature = temperature;
    }

    // FIX 1: Resolve the effective nativeMode from capability catalog (provider + modelId).
    // When known, the ACTUAL response_format put on the wire is derived from nativeMode,
    // overriding whatever strategy/outputSchema the caller passed — so no caller can put
    // an unsupported response_format on the wire.
    //   null (unknown)    → existing caller-driven behavior (fail-open BC)
    //   none              → NO response_format; inject JSON system-prompt constraint
    //   json_mode         → { type: "json_object" }  (downgrade json_schema requests)
    //   json_schema       → { type: "json_schema", json_schema: { ..., strict: false } }
    //   json_schema_strict→ json_schema with strict: true
    //   tool_use / gemini_response_schema / gbnf_grammar
    //                     → per-provider adapter path (not raw OpenAI response_format)
    const effectiveNativeMode = this.resolveEffectiveNativeMode(
      provider,
      modelId,
    );
    // Derived convenience flags (backward-compat aliases for the original binary gate)
    const noResponseFormat =
      effectiveNativeMode === "none" ||
      (!effectiveNativeMode && this.rejectsResponseFormat(provider, modelId));

    // JSON system-prompt constraint injector — shared between nativeMode==='none' and
    // the legacy rejectsResponseFormat path.
    const injectJsonConstraint = () => {
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
        msgs.unshift({ role: "system", content: jsonConstraint.trim() });
      }
    };

    if (
      effectiveNativeMode !== null &&
      effectiveNativeMode !== "tool_use" &&
      effectiveNativeMode !== "gemini_response_schema" &&
      effectiveNativeMode !== "gbnf_grammar"
    ) {
      // Capability-driven branch: nativeMode is known → enforce on the wire.
      const wantsJson =
        outputSchema || responseFormat === "json" || outputJsonSchema;

      if (effectiveNativeMode === "none") {
        // nativeMode=none: never send response_format; inject prompt constraint instead.
        if (wantsJson) {
          injectJsonConstraint();
        }
      } else if (effectiveNativeMode === "json_mode") {
        // json_mode: downgrade any json_schema request to json_object.
        if (wantsJson) {
          requestBody["response_format"] = { type: "json_object" };
        }
      } else if (
        effectiveNativeMode === "json_schema" ||
        effectiveNativeMode === "json_schema_strict"
      ) {
        const isStrict = effectiveNativeMode === "json_schema_strict";
        if (structuredOutputStrategy && outputJsonSchema) {
          // New adapter path: use the adapter (may emit json_schema or json_schema_strict).
          const adapter = this.getStructuredOutputAdapter(
            structuredOutputStrategy,
          );
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
          // Legacy ad-hoc path: build response_format from nativeMode.
          requestBody["response_format"] = {
            type: "json_schema",
            json_schema: {
              name: "structured_output",
              schema: outputSchema.schema,
              strict: isStrict ? true : (schemaStrict ?? false),
            },
          };
        } else if (responseFormat === "json") {
          requestBody["response_format"] = { type: "json_object" };
        }
      } else if (effectiveNativeMode === "prompt") {
        // prompt-only: inject system constraint, never send response_format.
        if (wantsJson) {
          injectJsonConstraint();
        }
      }
      // other known modes (e.g. future extensions) → no response_format set
    } else {
      // effectiveNativeMode is null (unknown) OR is a per-provider adapter mode
      // (tool_use / gemini_response_schema / gbnf_grammar) → preserve existing behavior.
      // ★ 2026-05-06 native structured output path: prefer StructuredOutputRouter adapter
      // over the legacy ad-hoc outputSchema path. When structuredOutputStrategy +
      // outputJsonSchema are provided, apply the adapter's requestBodyPatch and
      // any systemPromptAddon — replacing the old manual response_format wiring.
      if (structuredOutputStrategy && outputJsonSchema && !noResponseFormat) {
        const adapter = this.getStructuredOutputAdapter(
          structuredOutputStrategy,
        );
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
      } else if (!noResponseFormat && outputSchema) {
        // ★ Legacy ad-hoc path (fallback when new fields not provided)
        requestBody["response_format"] = {
          type: "json_schema",
          json_schema: {
            name: "structured_output",
            schema: outputSchema.schema,
            strict: schemaStrict ?? false,
          },
        };
      } else if (!noResponseFormat && responseFormat === "json") {
        requestBody["response_format"] = { type: "json_object" };
      } else if (
        noResponseFormat &&
        (outputSchema || responseFormat === "json" || outputJsonSchema)
      ) {
        // 模型拒绝 response_format（DeepSeek-reasoner / Cohere / 任意 catalog
        // nativeMode==='none'）：在 system message 注入 JSON 约束作为替代约束。
        injectJsonConstraint();
      }
    }

    this.logger.debug(
      `[callOpenAICompatibleAPI] model=${modelId}, endpoint=${effectiveEndpoint.substring(0, 50)}..., ` +
        `tokens=${maxTokens}, temp=${temperature}, msgs=${messages.length}, ~${Math.ceil(estimatedChars / CHARS_TO_TOKENS_RATIO)} input tokens`,
    );

    let response;
    try {
      response = await firstValueFrom(
        this.httpService.post(effectiveEndpoint, requestBody, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          timeout,
        }),
      );
    } catch (err) {
      // v3.1 §B+.3 / D.1: fire-and-forget self-heal trigger
      // R1 (2026-05-25): chain-aware 降级目标（json_schema→json_mode→none），
      //   替代旧一刀切 json_schema→none。effectiveNativeMode 是当前真实上线值，
      //   故多步降级天然成立（override 回写后下次再降下一档）。
      const degrade = this.computeSelfHealDegrade(
        provider,
        modelId,
        effectiveNativeMode,
      );
      this.selfHealTrigger?.triggerSelfHealAsync(err, {
        modelId,
        userModelConfigId,
        ...(degrade
          ? { fromValue: degrade.fromValue, toValue: degrade.toValue }
          : {}),
      });

      // ★ F3 (2026-05-25): in-request 当次降级 —— 仅错误路径，成功路径完全不动。
      //   结构化输出被拒(4xx 格式错) + 有下一档 strategy + 调用方确实要 JSON →
      //   当次用降级后的 response_format 重试一次（json_schema→json_mode→none）。
      //   解决"catalog 漂移导致首个 mission 直接崩"（self-heal 只救下次）。
      const wantsJson =
        !!outputSchema || responseFormat === "json" || !!outputJsonSchema;
      if (degrade && wantsJson && this.isStructuredOutputRejection(err)) {
        const mode = degrade.toValue;
        delete requestBody["response_format"];
        if (mode === "json_mode") {
          requestBody["response_format"] = { type: "json_object" };
        } else if (
          (mode === "json_schema" || mode === "json_schema_strict") &&
          outputJsonSchema
        ) {
          requestBody["response_format"] = {
            type: "json_schema",
            json_schema: {
              name: schemaName ?? "output",
              schema: outputJsonSchema,
              strict: mode === "json_schema_strict",
            },
          };
        } else {
          // none / prompt：撤掉 response_format + 注入 JSON 约束到 system msg
          injectJsonConstraint();
        }
        try {
          response = await firstValueFrom(
            this.httpService.post(effectiveEndpoint, requestBody, {
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
              timeout,
            }),
          );
          this.logger.warn(
            `[in-request-degrade] ${modelId}: ${degrade.fromValue}→${mode} 重试成功（首次格式被拒）`,
          );
          // 成功 → 不抛，落到下方解析
        } catch {
          throw err; // 降级仍失败 → 抛原始错误
        }
      } else {
        throw err;
      }
    }

    const data = response.data;
    const messageObj = data.choices?.[0]?.message;
    const toolCalls = this.extractOpenAICompatibleToolCalls(messageObj);
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
    if (!content && (!toolCalls || toolCalls.length === 0)) {
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
      content: content || "",
      model: modelId,
      tokensUsed: openaiUsage.total_tokens || 0,
      inputTokens: openaiUsage.prompt_tokens || 0,
      outputTokens: openaiUsage.completion_tokens || 0,
      cacheReadTokens: promptTokensDetails.cached_tokens || 0,
      finishReason: data.choices?.[0]?.finish_reason || undefined,
      toolCalls,
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
    /** v3.1 §B+.3：BYOK userModelConfigId，catch 触发 self-heal；缺省 = 不触发。 */
    userModelConfigId?: string,
  ): Promise<ChatCompletionResult> {
    if (responseFormat === "json") {
      this.logger.warn(
        `[callAnthropicAPI] responseFormat="json" requested but Anthropic does not support json_object mode natively. ` +
          `Relying on system prompt constraint only.`,
      );
    }
    // 2026-05-10 §2/§4：单源归一化（base URL → /messages）。
    const effectiveEndpoint =
      ensureMessagesPath(apiEndpoint) ||
      "https://api.anthropic.com/v1/messages";

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

    let response;
    try {
      response = await firstValueFrom(
        this.httpService.post(effectiveEndpoint, requestBody, {
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
          timeout,
        }),
      );
    } catch (err) {
      // v3.1 §B+.3 / D.1: fire-and-forget self-heal trigger
      this.selfHealTrigger?.triggerSelfHealAsync(err, {
        modelId,
        userModelConfigId,
      });
      throw err;
    }

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
    /** v3.1 §B+.3：BYOK userModelConfigId，catch 触发 self-heal；缺省 = 不触发。 */
    userModelConfigId?: string,
  ): Promise<ChatCompletionResult> {
    // 直接使用数据库配置的模型 ID，不做额外验证
    const effectiveModelId = modelId;

    // 2026-05-10 §2/§4：单源归一化（容忍 base / 含 /models / 完整 URL 三种形态）
    const apiUrl = `${ensureGeminiGenerateContentPath(apiEndpoint, effectiveModelId)}?key=${apiKey}`;

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

    let response;
    try {
      response = await firstValueFrom(
        this.httpService.post(apiUrl, requestBody, {
          headers: {
            "Content-Type": "application/json",
          },
          timeout,
        }),
      );
    } catch (err) {
      // v3.1 §B+.3 / D.1: fire-and-forget self-heal trigger
      this.selfHealTrigger?.triggerSelfHealAsync(err, {
        modelId,
        userModelConfigId,
      });
      throw err;
    }

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
    tools?: FunctionDefinition[],
    /** v3.1 §B.5：BYOK 路径传 user_model_config.id；catch 触发 self-heal。缺省 → 不触发。 */
    userModelConfigId?: string,
  ): Promise<ChatCompletionResult> {
    // 2026-05-10 §2/§4：单源归一化。
    const effectiveEndpoint =
      ensureChatCompletionsPath(apiEndpoint) ||
      "https://api.x.ai/v1/chat/completions";

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
    const resolvedXaiMessages = this.buildOpenAICompatibleMessages(messages);

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
    const requestTools = this.buildOpenAICompatibleTools(tools);
    if (requestTools) {
      requestBody.tools = requestTools;
    }
    if (
      temperature !== undefined &&
      temperature !== null &&
      !isReasoningModel
    ) {
      requestBody.temperature = temperature;
    }

    // FIX 1 (xAI path): same capability-driven response_format reconciliation as
    // callOpenAICompatibleAPI.  xAI always has provider="xai" which maps to
    // json_schema_strict in the catalog, so the legacy path below is preserved as the
    // effective branch for all current xAI models.  If a future xAI model gets a
    // different nativeMode the catalog enforces it automatically.
    const xaiEffectiveNativeMode = this.resolveEffectiveNativeMode(
      "xai",
      modelId,
    );
    const injectXaiJsonConstraint = () => {
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
        msgs.unshift({ role: "system", content: jsonConstraint.trim() });
      }
    };

    if (
      xaiEffectiveNativeMode !== null &&
      xaiEffectiveNativeMode !== "tool_use" &&
      xaiEffectiveNativeMode !== "gemini_response_schema" &&
      xaiEffectiveNativeMode !== "gbnf_grammar"
    ) {
      const wantsJson =
        outputSchema || responseFormat === "json" || outputJsonSchema;
      if (
        xaiEffectiveNativeMode === "none" ||
        xaiEffectiveNativeMode === "prompt"
      ) {
        if (wantsJson) injectXaiJsonConstraint();
      } else if (xaiEffectiveNativeMode === "json_mode") {
        if (wantsJson) requestBody["response_format"] = { type: "json_object" };
      } else if (
        xaiEffectiveNativeMode === "json_schema" ||
        xaiEffectiveNativeMode === "json_schema_strict"
      ) {
        const isStrict = xaiEffectiveNativeMode === "json_schema_strict";
        if (structuredOutputStrategy && outputJsonSchema) {
          const adapter = this.getStructuredOutputAdapter(
            structuredOutputStrategy,
          );
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
          requestBody["response_format"] = {
            type: "json_schema",
            json_schema: {
              name: "structured_output",
              schema: outputSchema.schema,
              strict: isStrict ? true : (schemaStrict ?? false),
            },
          };
        } else if (responseFormat === "json") {
          requestBody["response_format"] = { type: "json_object" };
        }
      }
    } else {
      // ★ 2026-05-06 native structured output path for xAI (same OpenAI compat)
      if (structuredOutputStrategy && outputJsonSchema) {
        const adapter = this.getStructuredOutputAdapter(
          structuredOutputStrategy,
        );
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
    }

    this.logger.log(
      `[callXAIAPI] model=${modelId}, tokenParam=${effectiveTokenParam}=${maxTokens}, reasoning=${isReasoningModel}, temp=${temperature}, responseFormat=${responseFormat}, msgs=${messages.length}, ~${Math.ceil(xaiEstimatedChars / CHARS_TO_TOKENS_RATIO)} input tokens`,
    );

    let response;
    try {
      response = await firstValueFrom(
        this.httpService.post(effectiveEndpoint, requestBody, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          timeout,
        }),
      );
    } catch (err) {
      // 2026-05-13 (#31 diag): xAI 4xx 反复 INVALID_MODEL 但原 axios error message
      //   只剩 "Request failed with status code N"，body 内容被丢。展开 response.data
      //   + 关键 request shape 让 admin 看到真正触发因子（model / response_format /
      //   max_tokens / messages 大小 / endpoint）。
      const axiosErr = err as {
        response?: {
          status?: number;
          statusText?: string;
          data?: unknown;
        };
        message?: string;
      };
      const status = axiosErr.response?.status;
      if (status !== undefined && status >= 400) {
        const bodyPreview = (() => {
          try {
            return JSON.stringify(axiosErr.response?.data).slice(0, 800);
          } catch {
            return String(axiosErr.response?.data ?? "").slice(0, 800);
          }
        })();
        this.logger.warn(
          `[callXAIAPI] ${status} ${axiosErr.response?.statusText ?? ""} ` +
            `endpoint=${effectiveEndpoint} model=${modelId} ` +
            `hasResponseFormat=${"response_format" in requestBody} ` +
            `responseFormatType=${
              (requestBody.response_format as { type?: string } | undefined)
                ?.type ?? "(none)"
            } ` +
            `${effectiveTokenParam}=${maxTokens} reasoning=${isReasoningModel} ` +
            `msgs=${messages.length} body=${bodyPreview}`,
        );
      }
      // v3.1 §B.5 / D.1：异步触发 self-heal（fire-and-forget，不阻断 throw）
      // F4 (2026-05-25): xAI 也走 chain-aware 降级（json_schema_strict→json_schema
      //   →json_mode→none），替代旧一刀切。xaiEffectiveNativeMode 是当前真实上线值。
      const degrade = this.computeSelfHealDegrade(
        "xai",
        modelId,
        xaiEffectiveNativeMode,
      );
      this.selfHealTrigger?.triggerSelfHealAsync(err, {
        modelId,
        userModelConfigId,
        ...(degrade
          ? { fromValue: degrade.fromValue, toValue: degrade.toValue }
          : {}),
      });
      throw err;
    }

    const data = response.data;
    const messageObj = data.choices?.[0]?.message;
    const toolCalls = this.extractOpenAICompatibleToolCalls(messageObj);
    const content = messageObj?.content || "";
    if (!content && (!toolCalls || toolCalls.length === 0)) {
      throw new Error(
        `AI 返回空响应 (原因: ${data.choices?.[0]?.finish_reason || "unknown"})`,
      );
    }
    // ★ 2026-05-05 fix: 必须返回 inputTokens / outputTokens 才能让 ReactLoop
    //   thinking 事件携带正确 promptTokens / completionTokens，进而被
    //   extractTokenSpend 累计到 mission pool。否则 UI 显示 tokens 永远 0。
    return {
      content,
      model: modelId,
      tokensUsed: data.usage?.total_tokens || 0,
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
      finishReason: data.choices?.[0]?.finish_reason || undefined,
      toolCalls,
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
   *
   * ★ 2026-05-12: 加 options.dimensions —— OpenAI text-embedding-3-* 的
   *   Matryoshka 维度截断。其他兼容 provider 不支持的字段会被忽略。
   * ★ 2026-05-12: 429 时读 Retry-After header，包装到 error message 让外层
   *   节流用更精确的 cooldown（fallback 60s 是粗估）。
   */
  async callOpenAICompatibleEmbeddingAPI(
    apiEndpoint: string,
    apiKey: string,
    modelId: string,
    inputs: string[],
    timeout: number = 60000,
    options?: { dimensions?: number },
  ): Promise<EmbeddingApiResult> {
    // 2026-05-10 §2/§4：单源归一化。
    const embeddingsUrl =
      ensureOpenAIEmbeddingsPath(apiEndpoint) ||
      "https://api.openai.com/v1/embeddings";

    this.logger.debug(
      `[callOpenAICompatibleEmbeddingAPI] model=${modelId}, inputs=${inputs.length}, endpoint=${embeddingsUrl.substring(0, 60)}...`,
    );

    const body: Record<string, unknown> = { model: modelId, input: inputs };
    if (options?.dimensions && options.dimensions > 0) {
      body.dimensions = options.dimensions;
    }

    let response;
    try {
      response = await firstValueFrom(
        this.httpService.post(embeddingsUrl, body, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          timeout,
        }),
      );
    } catch (error) {
      throw wrapEmbeddingError(error);
    }

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
   *
   * ★ 2026-05-12: 加 options.taskType —— Gemini gemini-embedding-001 必须按
   *   task 区分编码，document 与 query 用不同向量空间。不传 → 默认
   *   RETRIEVAL_DOCUMENT（最常见：向量化 KB chunk）。
   *   不区分会让检索召回率掉 5-15%。
   * ★ 2026-05-12: 加 options.dimensions —— gemini-embedding-001 Matryoshka 支持
   *   768/1536/3072 输出。
   */
  async callGoogleEmbeddingAPI(
    apiEndpoint: string,
    apiKey: string,
    modelId: string,
    inputs: string[],
    timeout: number = 60000,
    options?: { taskType?: string; dimensions?: number },
  ): Promise<EmbeddingApiResult> {
    // 2026-05-10 §2/§4：单源归一化。
    const apiUrl = ensureGeminiBatchEmbedContentsPath(apiEndpoint, modelId);

    const taskType = googleTaskType(options?.taskType);
    const outputDimensionality =
      options?.dimensions && options.dimensions > 0
        ? options.dimensions
        : undefined;

    this.logger.debug(
      `[callGoogleEmbeddingAPI] model=${modelId}, inputs=${inputs.length}, task=${taskType} (google format)`,
    );

    const requests = inputs.map((text) => ({
      model: `models/${modelId}`,
      content: { parts: [{ text }] },
      taskType,
      ...(outputDimensionality ? { outputDimensionality } : {}),
    }));

    let response;
    try {
      response = await firstValueFrom(
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
    } catch (error) {
      throw wrapEmbeddingError(error);
    }

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
   *
   * ★ 2026-05-12: 默认 search_document，caller 应按场景传 search_query
   *   （查询侧），不区分会让检索召回率掉 5-15%。
   */
  async callCohereEmbeddingAPI(
    apiEndpoint: string,
    apiKey: string,
    modelId: string,
    inputs: string[],
    inputType: string = "search_document",
    timeout: number = 60000,
  ): Promise<EmbeddingApiResult> {
    // 2026-05-10 §2/§4：单源归一化。
    const embedUrl =
      ensureCohereEmbedPath(apiEndpoint) || "https://api.cohere.com/v1/embed";

    this.logger.debug(
      `[callCohereEmbeddingAPI] model=${modelId}, inputs=${inputs.length}, input_type=${inputType} (cohere format)`,
    );

    let response;
    try {
      response = await firstValueFrom(
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
    } catch (error) {
      throw wrapEmbeddingError(error);
    }

    const data = response.data;
    const embeddings: number[][] = data.embeddings || [];
    return {
      embeddings,
      totalTokens: data.meta?.billed_units?.input_tokens || 0,
      model: modelId,
    };
  }
}

/**
 * EmbeddingTaskType → Google task_type 映射
 * https://ai.google.dev/api/embeddings#TaskType
 */
function googleTaskType(taskType?: string): string {
  switch (taskType) {
    case "query":
      return "RETRIEVAL_QUERY";
    case "similarity":
      return "SEMANTIC_SIMILARITY";
    case "classification":
      return "CLASSIFICATION";
    case "clustering":
      return "CLUSTERING";
    case "document":
    default:
      return "RETRIEVAL_DOCUMENT";
  }
}

/**
 * Embedding 调用失败时包装错误：
 *   - 把 429 响应里的 Retry-After header 提到 message 里（[retry-after=Ns]）
 *     让外层节流读到精确秒数，否则只能粗估 60s。
 *   - 保留原始 message + status，便于上游分类。
 */
function wrapEmbeddingError(error: unknown): Error {
  if (!error || typeof error !== "object") {
    return error instanceof Error ? error : new Error(String(error));
  }
  const err = error as {
    response?: {
      status?: number;
      headers?: Record<string, string | string[] | undefined>;
      data?: unknown;
    };
    message?: string;
  };
  const status = err.response?.status;
  const headers = err.response?.headers ?? {};
  // 大小写都查，axios/got 不一致
  const retryAfterRaw =
    headers["retry-after"] ?? headers["Retry-After"] ?? undefined;
  const retryAfter = Array.isArray(retryAfterRaw)
    ? retryAfterRaw[0]
    : retryAfterRaw;

  let suffix = "";
  if (status === 429 && retryAfter) {
    // Retry-After 可以是秒数（"17"）或 HTTP date；秒数最常见
    const secs = Number.parseInt(String(retryAfter), 10);
    if (Number.isFinite(secs) && secs > 0 && secs < 3600) {
      suffix = ` [retry-after=${secs}s]`;
    }
  }

  // ★ 2026-05-13: 提取 OpenAI / Cohere / Google 400/422 错误 body 里的真实
  //   message（"model does not exist" / "Input must be non-empty" / 维度错），
  //   原版只透传 axios "Request failed with status code 400" 没有 actionable 信息
  //   → 运维看到一片 400 不知道改哪。
  let bodyMsg = "";
  const data = err.response?.data as Record<string, unknown> | undefined;
  if (data && typeof data === "object") {
    const errField = data.error;
    if (typeof errField === "string") {
      bodyMsg = errField;
    } else if (errField && typeof errField === "object") {
      const m = (errField as { message?: unknown }).message;
      if (typeof m === "string") bodyMsg = m;
    } else if (typeof data.message === "string") {
      bodyMsg = data.message;
    }
  }
  if (bodyMsg) {
    suffix += ` [body=${bodyMsg.slice(0, 200)}]`;
  }

  const baseMsg = err.message ?? String(err);
  const wrapped = new Error(`${baseMsg}${suffix}`);
  // 保留 axios shape 让上游 isRateLimitError 仍能识别 429
  (wrapped as unknown as { response: unknown }).response = err.response;
  return wrapped;
}
