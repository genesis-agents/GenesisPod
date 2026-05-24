/**
 * ModelCapabilityService spec —— v3.1 §A 5 级优先级 + 派生链验证
 *
 * 覆盖：
 *   - Level 4 catalog first-match-wins（含别名 + modelPattern 区分）
 *   - Level 3 AIModel 19 既有列派生（admin override / isReasoning / temperature / ...）
 *   - Level 5 SAFE_DEFAULTS 兜底（未知 provider）
 *   - deriveStructuredOutputChain 边界（nativeMode 'none' 跳过 + 去重 + 兜底 prompt）
 *   - v3.1 §1.4 案例研究矩阵：deepseek-reasoner / deepseek-v4-pro / deepseek-chat
 */

import { ModelCapabilityService } from "../model-capability.service";
import type { AIModelConfig } from "../../types/model-config.types";

const baseConfig = (overrides: Partial<AIModelConfig> = {}): AIModelConfig => ({
  id: "",
  name: "",
  displayName: "",
  provider: "",
  modelId: "",
  apiEndpoint: "",
  apiKey: null,
  maxTokens: 0,
  temperature: 0,
  isEnabled: true,
  isDefault: false,
  ...overrides,
});

describe("ModelCapabilityService — resolveCapabilities (v3.1 §A)", () => {
  let svc: ModelCapabilityService;
  beforeEach(() => {
    svc = new ModelCapabilityService();
  });

  // ─────────── Level 4 catalog 命中 ───────────

  describe("Level 4: catalog first-match-wins", () => {
    it("provider=openai → catalog json_schema_strict", () => {
      const caps = svc.resolveCapabilities(
        baseConfig({ provider: "openai", modelId: "gpt-4o" }),
      );
      expect(caps.structuredOutput.nativeMode).toBe("json_schema_strict");
      expect(caps.tokenParam).toBe("max_tokens");
      expect(caps.toolUse.mode).toBe("openai_functions");
      expect(caps.systemPrompt.placement).toBe("messages_array");
    });

    it("provider=anthropic → catalog tool_use + top_level_system_field", () => {
      const caps = svc.resolveCapabilities(
        baseConfig({ provider: "anthropic", modelId: "claude-3.5-sonnet" }),
      );
      expect(caps.structuredOutput.nativeMode).toBe("tool_use");
      expect(caps.systemPrompt.placement).toBe("top_level_system_field");
      expect(caps.promptCache.support).toBe("anthropic_cache_control");
      expect(caps.reasoning.kind).toBe("extended_thinking");
    });

    it("provider=claude alias → 同 anthropic 行为（别名条目命中）", () => {
      const caps = svc.resolveCapabilities(
        baseConfig({ provider: "claude", modelId: "claude-3.5-sonnet" }),
      );
      expect(caps.structuredOutput.nativeMode).toBe("tool_use");
      expect(caps.systemPrompt.placement).toBe("top_level_system_field");
    });

    it("provider=google → gemini_response_schema + maxOutputTokens", () => {
      const caps = svc.resolveCapabilities(
        baseConfig({ provider: "google", modelId: "gemini-2.5-pro" }),
      );
      expect(caps.structuredOutput.nativeMode).toBe("gemini_response_schema");
      expect(caps.tokenParam).toBe("maxOutputTokens");
      expect(caps.vision.support).toBe("native_multimodal");
    });

    it("Provider 大小写不敏感（Anthropic / OPENAI / Google）", () => {
      expect(
        svc.resolveCapabilities(baseConfig({ provider: "Anthropic" }))
          .structuredOutput.nativeMode,
      ).toBe("tool_use");
      expect(
        svc.resolveCapabilities(baseConfig({ provider: "OPENAI" }))
          .structuredOutput.nativeMode,
      ).toBe("json_schema_strict");
    });
  });

  // ─────────── modelPattern 区分（deepseek 三模型） ───────────

  describe("modelPattern 区分 (v3.1 §1.4 案例研究矩阵)", () => {
    it("deepseek-reasoner → nativeMode='none' (拒 response_format)", () => {
      const caps = svc.resolveCapabilities(
        baseConfig({ provider: "deepseek", modelId: "deepseek-reasoner" }),
      );
      expect(caps.structuredOutput.nativeMode).toBe("none");
      expect(caps.reasoning.kind).toBe("opaque");
      expect(caps.reasoning.exposeContent).toBe("reasoning_field");
    });

    it("deepseek-v4-pro → nativeMode='json_mode' (2026-05-24 事故修复)", () => {
      // 事故根因：原 isDeepseekReasoner = modelLower.includes("deepseek-reasoner")
      // → v4-pro 不含 'reasoner' → 误判 false → 发 json_schema → API 400
      const caps = svc.resolveCapabilities(
        baseConfig({ provider: "deepseek", modelId: "deepseek-v4-pro" }),
      );
      expect(caps.structuredOutput.nativeMode).toBe("json_mode");
      expect(caps.structuredOutput.fallbackChain).toEqual([]);
    });

    it("deepseek-chat → nativeMode='json_schema' (V4-Flash non-thinking)", () => {
      const caps = svc.resolveCapabilities(
        baseConfig({ provider: "deepseek", modelId: "deepseek-chat" }),
      );
      expect(caps.structuredOutput.nativeMode).toBe("json_schema");
      expect(caps.structuredOutput.fallbackChain).toEqual(["json_mode"]);
    });

    it("OpenRouter claude 二级匹配 → tool_use（modelPattern /claude|anthropic/）", () => {
      const caps = svc.resolveCapabilities(
        baseConfig({
          provider: "openrouter",
          modelId: "anthropic/claude-opus-4.1",
        }),
      );
      expect(caps.structuredOutput.nativeMode).toBe("tool_use");
      expect(caps.toolUse.mode).toBe("anthropic_tools");
    });

    it("OpenRouter gemini 二级匹配 → gemini_response_schema", () => {
      const caps = svc.resolveCapabilities(
        baseConfig({
          provider: "openrouter",
          modelId: "google/gemini-2.5-pro",
        }),
      );
      expect(caps.structuredOutput.nativeMode).toBe("gemini_response_schema");
      // OpenRouter 适配层把 maxOutputTokens 映射为 max_tokens
      expect(caps.tokenParam).toBe("max_tokens");
    });

    it("OpenRouter 通用兜底 → json_schema", () => {
      const caps = svc.resolveCapabilities(
        baseConfig({
          provider: "openrouter",
          modelId: "meta-llama/llama-3.1-405b",
        }),
      );
      expect(caps.structuredOutput.nativeMode).toBe("json_schema");
    });
  });

  // ─────────── Level 3 AIModel 19 既有列派生 ───────────

  describe("Level 3: derive from AIModelConfig", () => {
    it("admin 显式 structuredOutputStrategy override catalog nativeMode", () => {
      const caps = svc.resolveCapabilities(
        baseConfig({
          provider: "openai",
          modelId: "gpt-4o",
          structuredOutputStrategy: "json_mode",
          fallbackStrategies: [],
        }),
      );
      // admin override：catalog json_schema_strict → json_mode
      expect(caps.structuredOutput.nativeMode).toBe("json_mode");
      expect(caps.structuredOutput.fallbackChain).toEqual([]);
    });

    it("admin 仅配 fallback（无 strategy）→ 保留 catalog nativeMode，覆盖 fallback", () => {
      const caps = svc.resolveCapabilities(
        baseConfig({
          provider: "openai",
          modelId: "gpt-4o",
          structuredOutputStrategy: null,
          fallbackStrategies: ["json_schema"],
        }),
      );
      // catalog nativeMode 保留 json_schema_strict
      expect(caps.structuredOutput.nativeMode).toBe("json_schema_strict");
      expect(caps.structuredOutput.fallbackChain).toEqual(["json_schema"]);
    });

    it("admin 配置全 invalid → 完全用 catalog 默认（不污染）", () => {
      const caps = svc.resolveCapabilities(
        baseConfig({
          provider: "openai",
          modelId: "gpt-4o",
          structuredOutputStrategy: "garbage-strategy",
          fallbackStrategies: ["also_garbage"],
        }),
      );
      expect(caps.structuredOutput.nativeMode).toBe("json_schema_strict");
      // catalog OpenAI fallbackChain
      expect(caps.structuredOutput.fallbackChain).toEqual([
        "json_schema",
        "json_mode",
      ]);
    });

    it("isReasoning=true → reasoning.kind='opaque' (catalog 未指定 reasoning 时)", () => {
      const caps = svc.resolveCapabilities(
        baseConfig({
          provider: "deepseek",
          modelId: "deepseek-chat",
          isReasoning: true,
        }),
      );
      // catalog deepseek-chat reasoning.kind='none'，但 isReasoning=true 派生覆盖为 opaque
      expect(caps.reasoning.kind).toBe("opaque");
    });

    it("supportsTemperature=false → temperature.support='none'", () => {
      const caps = svc.resolveCapabilities(
        baseConfig({
          provider: "openai",
          modelId: "o1-mini",
          supportsTemperature: false,
        }),
      );
      expect(caps.temperature.support).toBe("none");
    });

    it("tokenParamName=max_completion_tokens → tokenParam override", () => {
      const caps = svc.resolveCapabilities(
        baseConfig({
          provider: "openai",
          modelId: "o1",
          tokenParamName: "max_completion_tokens",
        }),
      );
      expect(caps.tokenParam).toBe("max_completion_tokens");
    });

    it("tokenParamName invalid → 忽略，用 catalog 默认", () => {
      const caps = svc.resolveCapabilities(
        baseConfig({
          provider: "openai",
          modelId: "gpt-4o",
          tokenParamName: "invalid_param",
        }),
      );
      expect(caps.tokenParam).toBe("max_tokens"); // catalog OpenAI 默认
    });

    it("supportsVision=true → vision.support='image_url'", () => {
      const caps = svc.resolveCapabilities(
        baseConfig({
          provider: "qwen",
          modelId: "qwen-vl",
          supportsVision: true,
        }),
      );
      expect(caps.vision.support).toBe("image_url");
    });

    it("supportsStreaming=false → streaming.support=false", () => {
      const caps = svc.resolveCapabilities(
        baseConfig({
          provider: "openai",
          modelId: "gpt-4o",
          supportsStreaming: false,
        }),
      );
      expect(caps.streaming.support).toBe(false);
    });

    it("maxTokens 派生 context.maxOutputTokens", () => {
      const caps = svc.resolveCapabilities(
        baseConfig({
          provider: "openai",
          modelId: "gpt-4o",
          maxTokens: 8192,
        }),
      );
      expect(caps.context.maxOutputTokens).toBe(8192);
    });
  });

  // ─────────── Level 5 SAFE_DEFAULTS ───────────

  describe("Level 5: SAFE_DEFAULTS 兜底", () => {
    it("未知 provider → nativeMode='none' 安全兜底", () => {
      const caps = svc.resolveCapabilities(
        baseConfig({
          provider: "WeirdUnknownProvider",
          modelId: "x-model",
        }),
      );
      expect(caps.structuredOutput.nativeMode).toBe("none");
      expect(caps.toolUse.mode).toBe("none");
      expect(caps.vision.support).toBe("none");
      expect(caps.promptCache.support).toBe("none");
    });

    it("空 provider → SAFE_DEFAULTS（不命中 catalog）", () => {
      const caps = svc.resolveCapabilities(baseConfig({ provider: "" }));
      expect(caps.structuredOutput.nativeMode).toBe("none");
    });

    it("仅 provider 命中无 modelPattern 时使用 provider 默认条目", () => {
      // anthropic 条目无 modelPattern → 任意 modelId 都命中
      const caps = svc.resolveCapabilities(
        baseConfig({ provider: "anthropic", modelId: "any-future-model" }),
      );
      expect(caps.structuredOutput.nativeMode).toBe("tool_use");
    });
  });
});

describe("ModelCapabilityService — deriveStructuredOutputChain", () => {
  let svc: ModelCapabilityService;
  beforeEach(() => {
    svc = new ModelCapabilityService();
  });

  it("nativeMode='none' → 跳过，直接 ['prompt']", () => {
    const caps = svc.resolveCapabilities(
      baseConfig({ provider: "deepseek", modelId: "deepseek-reasoner" }),
    );
    expect(svc.deriveStructuredOutputChain(caps)).toEqual(["prompt"]);
  });

  it("nativeMode + fallback chain + 兜底 prompt", () => {
    const caps = svc.resolveCapabilities(
      baseConfig({ provider: "openai", modelId: "gpt-4o" }),
    );
    expect(svc.deriveStructuredOutputChain(caps)).toEqual([
      "json_schema_strict",
      "json_schema",
      "json_mode",
      "prompt",
    ]);
  });

  it("派生链去重（fallback 与 nativeMode 重复时不双入）", () => {
    const caps = svc.resolveCapabilities(
      baseConfig({
        provider: "openai",
        modelId: "gpt-4o",
        structuredOutputStrategy: "json_schema",
        fallbackStrategies: ["json_schema", "json_mode"],
      }),
    );
    expect(svc.deriveStructuredOutputChain(caps)).toEqual([
      "json_schema",
      "json_mode",
      "prompt",
    ]);
  });

  it("fallback 含 prompt 时不重复加兜底", () => {
    const caps = svc.resolveCapabilities(
      baseConfig({
        provider: "openai",
        modelId: "gpt-4o",
        structuredOutputStrategy: "json_mode",
        fallbackStrategies: ["prompt"],
      }),
    );
    expect(svc.deriveStructuredOutputChain(caps)).toEqual([
      "json_mode",
      "prompt",
    ]);
  });
});
