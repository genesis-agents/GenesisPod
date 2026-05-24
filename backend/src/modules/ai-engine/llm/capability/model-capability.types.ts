/**
 * ModelCapabilities —— v3.1 阶段 A 数据模型
 *
 * 唯一数据载体：描述某 (provider, modelId) 在 LLM 调用层的全部能力维度。
 * v3 §3.2 字段表（enum 主导，bool 仅用于真二态）。
 *
 * 设计原则：
 *   - enum 优先（如 nativeMode 7 枚举值），永远不让运行时靠模型名 substring 判
 *   - 零业务逻辑：纯数据 + zod schema，业务派生在 ModelCapabilityService 内
 *   - 嵌套结构按维度聚合：structuredOutput / toolUse / reasoning / ...
 *
 * v3.1 阶段 A 范围：本类型不出 ai-engine/llm/capability + ai-engine/llm/services
 *   facade（防 ai-app 直接读 caps 再生散点 if 判断）—— 详见 v3 §3.6。
 *
 * v3.1 阶段 B 演进：本文件会被 capability_overrides JSONB 写入侧用于强校验
 *   （zod parse；拼错 TS 不编译）。
 */

import { z } from "zod";

import {
  STRUCTURED_OUTPUT_STRATEGIES,
  type StructuredOutputStrategy,
} from "../structured-output/structured-output-strategy.types";

// ─────────────── structuredOutput 维度（v3 §3.2 #1, #2） ───────────────

/**
 * Native structured-output 模式 —— 决定 request body 里写哪种 response_format。
 *
 * 注意：这是 StructuredOutputStrategy 的子集（去掉 'none' 不算，加入"按
 * provider 自定义"位）；v3.1 阶段 A 直接复用 StructuredOutputStrategy 枚举值。
 */
export const NATIVE_STRUCTURED_OUTPUT_MODES = STRUCTURED_OUTPUT_STRATEGIES;
export type NativeStructuredOutputMode = StructuredOutputStrategy;

// ─────────────── toolUse 维度（v3 §3.2 #3, #4） ───────────────

export const TOOL_USE_MODES = [
  "openai_functions", // OpenAI/兼容 tools[] + tool_choice
  "anthropic_tools", // Anthropic Tools API（input_schema）
  "gemini_function_calling", // Gemini functionDeclarations
  "none", // 不支持
] as const;
export type ToolUseMode = (typeof TOOL_USE_MODES)[number];

// ─────────────── reasoning 维度（v3 §3.2 #5, #11） ───────────────

export const REASONING_KINDS = [
  "none",
  "reasoning_effort", // OpenAI o1/o3/o4: reasoning_effort=low|medium|high|minimal
  "thinking_budget", // Anthropic Claude extended-thinking: thinking.budget_tokens
  "extended_thinking", // Anthropic Sonnet 3.7+ thinking block
  "opaque", // DeepSeek-reasoner / Gemini-2.5: 模型自决，无显式 param
] as const;
export type ReasoningKind = (typeof REASONING_KINDS)[number];

export const REASONING_EXPOSE_CONTENTS = [
  "none", // 不暴露推理过程
  "thinking_block", // Anthropic content[].type === 'thinking'
  "reasoning_field", // DeepSeek reasoning_content / OpenAI reasoning summary
] as const;
export type ReasoningExposeContent = (typeof REASONING_EXPOSE_CONTENTS)[number];

// ─────────────── temperature 维度（v3 §3.2 #6） ───────────────

export const TEMPERATURE_SUPPORTS = [
  "full", // 0.0 ~ 2.0 自由
  "fixed_1_0", // o1 系列：API 强制 1.0，传别的值 400
  "none", // 不接受 temperature 字段
] as const;
export type TemperatureSupport = (typeof TEMPERATURE_SUPPORTS)[number];

// ─────────────── tokenParam 维度（v3 §3.2 #7） ───────────────

export const TOKEN_PARAM_NAMES = [
  "max_tokens", // OpenAI 旧 / Anthropic / 大多数 OpenAI 兼容
  "max_completion_tokens", // OpenAI 推理模型 (o1/o3/o4/gpt-5)
  "max_output_tokens", // Vertex AI（snake_case 版本）
  "maxOutputTokens", // Gemini native API（camelCase）
] as const;
export type TokenParamName = (typeof TOKEN_PARAM_NAMES)[number];

// ─────────────── vision 维度（v3 §3.2 #8） ───────────────

export const VISION_SUPPORTS = [
  "none",
  "image_url", // OpenAI-style image_url block
  "base64_only", // 仅接受 base64 data URI
  "native_multimodal", // Gemini fileData / 多模态原生
] as const;
export type VisionSupport = (typeof VISION_SUPPORTS)[number];

// ─────────────── systemPrompt 维度（v3 §3.2 #12） ───────────────

export const SYSTEM_PROMPT_PLACEMENTS = [
  "messages_array", // role:"system" 放在 messages[0]
  "top_level_system_field", // Anthropic / Gemini systemInstruction 顶层字段
  "first_user_concat", // 不支持 system，拼到首条 user 内
] as const;
export type SystemPromptPlacement = (typeof SYSTEM_PROMPT_PLACEMENTS)[number];

// ─────────────── promptCache 维度（v3 §3.2 #13, nice-to-have） ───────────────

export const PROMPT_CACHE_SUPPORTS = [
  "none",
  "anthropic_cache_control", // Anthropic cache_control: { type: "ephemeral" }
  "openai_prompt_cache", // OpenAI cached_tokens（自动）
  "gemini_cached_content", // Gemini cachedContent
] as const;
export type PromptCacheSupport = (typeof PROMPT_CACHE_SUPPORTS)[number];

// ─────────────── 复合：ModelCapabilities ───────────────

export interface ModelCapabilities {
  structuredOutput: {
    /** request body 里写哪种 response_format（'none' = 完全不支持，走 prompt） */
    nativeMode: NativeStructuredOutputMode;
    /** 首选失败按序降级；不含 nativeMode；最终兜底 'prompt' 由派生层补 */
    fallbackChain: readonly NativeStructuredOutputMode[];
  };
  toolUse: {
    mode: ToolUseMode;
    /** 单回合多 tool_call 并发 */
    parallelCalls: boolean;
  };
  reasoning: {
    kind: ReasoningKind;
    exposeContent: ReasoningExposeContent;
  };
  temperature: {
    support: TemperatureSupport;
  };
  /** request body token 上限 key 名 */
  tokenParam: TokenParamName;
  vision: {
    support: VisionSupport;
  };
  streaming: {
    support: boolean;
  };
  context: {
    /** prompt 上限 */
    maxInputTokens: number;
    /** completion 上限 */
    maxOutputTokens: number;
  };
  systemPrompt: {
    placement: SystemPromptPlacement;
  };
  promptCache: {
    support: PromptCacheSupport;
  };
}

// ─────────────── zod schema（B 阶段 capability_overrides 写入侧用） ───────────────

const nativeModeSchema = z.enum(
  NATIVE_STRUCTURED_OUTPUT_MODES as readonly [string, ...string[]],
);
const toolUseModeSchema = z.enum(
  TOOL_USE_MODES as readonly [string, ...string[]],
);
const reasoningKindSchema = z.enum(
  REASONING_KINDS as readonly [string, ...string[]],
);
const reasoningExposeSchema = z.enum(
  REASONING_EXPOSE_CONTENTS as readonly [string, ...string[]],
);
const temperatureSupportSchema = z.enum(
  TEMPERATURE_SUPPORTS as readonly [string, ...string[]],
);
const tokenParamSchema = z.enum(
  TOKEN_PARAM_NAMES as readonly [string, ...string[]],
);
const visionSupportSchema = z.enum(
  VISION_SUPPORTS as readonly [string, ...string[]],
);
const systemPromptPlacementSchema = z.enum(
  SYSTEM_PROMPT_PLACEMENTS as readonly [string, ...string[]],
);
const promptCacheSupportSchema = z.enum(
  PROMPT_CACHE_SUPPORTS as readonly [string, ...string[]],
);

/**
 * 完整 ModelCapabilities zod schema —— catalog 静态数据 + B 阶段 override 强校验。
 */
export const ModelCapabilitiesSchema: z.ZodType<ModelCapabilities> = z.object({
  structuredOutput: z.object({
    nativeMode: nativeModeSchema,
    fallbackChain: z.array(nativeModeSchema).readonly(),
  }),
  toolUse: z.object({
    mode: toolUseModeSchema,
    parallelCalls: z.boolean(),
  }),
  reasoning: z.object({
    kind: reasoningKindSchema,
    exposeContent: reasoningExposeSchema,
  }),
  temperature: z.object({
    support: temperatureSupportSchema,
  }),
  tokenParam: tokenParamSchema,
  vision: z.object({
    support: visionSupportSchema,
  }),
  streaming: z.object({
    support: z.boolean(),
  }),
  context: z.object({
    maxInputTokens: z.number().int().nonnegative(),
    maxOutputTokens: z.number().int().nonnegative(),
  }),
  systemPrompt: z.object({
    placement: systemPromptPlacementSchema,
  }),
  promptCache: z.object({
    support: promptCacheSupportSchema,
  }),
}) as z.ZodType<ModelCapabilities>;

/**
 * v3.1 阶段 B 用：`capability_overrides JSONB` 列 zod schema（partial / deep）。
 *
 * 任何字段都可被 override；未填字段走优先级链下一级回退。
 * 阶段 A 不消费此 schema（无 override 写入路径），仅暴露 export 给 B 阶段。
 */
export const ModelCapabilitiesOverridesSchema = z
  .object({
    structuredOutput: z
      .object({
        nativeMode: nativeModeSchema.optional(),
        fallbackChain: z.array(nativeModeSchema).readonly().optional(),
      })
      .partial()
      .optional(),
    toolUse: z
      .object({
        mode: toolUseModeSchema.optional(),
        parallelCalls: z.boolean().optional(),
      })
      .partial()
      .optional(),
    reasoning: z
      .object({
        kind: reasoningKindSchema.optional(),
        exposeContent: reasoningExposeSchema.optional(),
      })
      .partial()
      .optional(),
    temperature: z
      .object({
        support: temperatureSupportSchema.optional(),
      })
      .partial()
      .optional(),
    tokenParam: tokenParamSchema.optional(),
    vision: z
      .object({
        support: visionSupportSchema.optional(),
      })
      .partial()
      .optional(),
    streaming: z
      .object({
        support: z.boolean().optional(),
      })
      .partial()
      .optional(),
    context: z
      .object({
        maxInputTokens: z.number().int().nonnegative().optional(),
        maxOutputTokens: z.number().int().nonnegative().optional(),
      })
      .partial()
      .optional(),
    systemPrompt: z
      .object({
        placement: systemPromptPlacementSchema.optional(),
      })
      .partial()
      .optional(),
    promptCache: z
      .object({
        support: promptCacheSupportSchema.optional(),
      })
      .partial()
      .optional(),
  })
  .strict();

export type ModelCapabilitiesOverrides = z.infer<
  typeof ModelCapabilitiesOverridesSchema
>;
