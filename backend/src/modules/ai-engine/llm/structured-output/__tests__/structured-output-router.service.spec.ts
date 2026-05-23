import { StructuredOutputRouter } from "../structured-output-router.service";

describe("StructuredOutputRouter — 未配置默认推断", () => {
  let router: StructuredOutputRouter;
  beforeEach(() => {
    router = new StructuredOutputRouter();
  });

  it("admin 配置 strategy 时优先使用", () => {
    const chain = router.resolveChain({
      provider: "Anthropic",
      modelId: "claude-3.5-sonnet",
      structuredOutputStrategy: "json_schema_strict",
      fallbackStrategies: ["json_mode"],
    });
    // admin 配置 → 'json_schema_strict','json_mode'，最后兜底 'prompt'
    expect(chain).toEqual(["json_schema_strict", "json_mode", "prompt"]);
  });

  it("OpenAI 未配置 → 推断 strict json_schema → fallback chain", () => {
    const chain = router.resolveChain({
      provider: "OpenAI",
      modelId: "gpt-4o",
      structuredOutputStrategy: null,
      fallbackStrategies: [],
    });
    expect(chain).toEqual([
      "json_schema_strict",
      "json_schema",
      "json_mode",
      "prompt",
    ]);
  });

  it("Anthropic 未配置 → tool_use → prompt", () => {
    const chain = router.resolveChain({
      provider: "Anthropic",
      modelId: "claude-3.5-sonnet",
      structuredOutputStrategy: null,
      fallbackStrategies: null,
    });
    expect(chain).toEqual(["tool_use", "prompt"]);
  });

  it("Google Gemini 未配置 → responseSchema → json_mode → prompt", () => {
    const chain = router.resolveChain({
      provider: "Google",
      modelId: "gemini-2.5-pro",
      structuredOutputStrategy: null,
    });
    expect(chain).toEqual(["gemini_response_schema", "json_mode", "prompt"]);
  });

  it("DeepSeek-reasoner 未配置 → 仅 prompt（reasoner 不支持 response_format）", () => {
    const chain = router.resolveChain({
      provider: "DeepSeek",
      modelId: "deepseek-reasoner",
      structuredOutputStrategy: null,
    });
    expect(chain).toEqual(["prompt"]);
  });

  it("DeepSeek-chat 未配置 → json_schema → json_mode → prompt", () => {
    const chain = router.resolveChain({
      provider: "DeepSeek",
      modelId: "deepseek-chat",
      structuredOutputStrategy: null,
    });
    expect(chain).toEqual(["json_schema", "json_mode", "prompt"]);
  });

  it("xAI Grok 未配置 → strict → fallback chain", () => {
    const chain = router.resolveChain({
      provider: "xAI",
      modelId: "grok-3",
      structuredOutputStrategy: null,
    });
    expect(chain).toEqual([
      "json_schema_strict",
      "json_schema",
      "json_mode",
      "prompt",
    ]);
  });

  it("Ollama 本地模型未配置 → GBNF → prompt", () => {
    const chain = router.resolveChain({
      provider: "Ollama",
      modelId: "qwen2.5",
      structuredOutputStrategy: null,
    });
    expect(chain).toEqual(["gbnf_grammar", "prompt"]);
  });

  it("vLLM 本地模型未配置 → GBNF → prompt", () => {
    const chain = router.resolveChain({
      provider: "vllm",
      modelId: "deepseek-r1-distill-32b",
      structuredOutputStrategy: null,
    });
    expect(chain).toEqual(["gbnf_grammar", "prompt"]);
  });

  it("Llama.cpp 本地模型未配置 → GBNF → prompt", () => {
    const chain = router.resolveChain({
      provider: "llamacpp",
      modelId: "qwen2.5-7b-q5",
      structuredOutputStrategy: null,
    });
    expect(chain).toEqual(["gbnf_grammar", "prompt"]);
  });

  it("ByteDance Doubao 未配置 → json_mode → prompt", () => {
    const chain = router.resolveChain({
      provider: "ByteDance",
      modelId: "doubao-pro-32k",
      structuredOutputStrategy: null,
    });
    expect(chain).toEqual(["json_mode", "prompt"]);
  });

  it("Zhipu GLM 未配置 → json_mode → prompt", () => {
    const chain = router.resolveChain({
      provider: "Zhipu",
      modelId: "glm-4-9b",
      structuredOutputStrategy: null,
    });
    expect(chain).toEqual(["json_mode", "prompt"]);
  });

  it("Groq 未配置 → json_mode → prompt", () => {
    const chain = router.resolveChain({
      provider: "Groq",
      modelId: "llama-3.3-70b-versatile",
      structuredOutputStrategy: null,
    });
    expect(chain).toEqual(["json_mode", "prompt"]);
  });

  it("OpenRouter Claude 二级匹配 → tool_use → prompt", () => {
    const chain = router.resolveChain({
      provider: "OpenRouter",
      modelId: "anthropic/claude-opus-4.1",
      structuredOutputStrategy: null,
    });
    expect(chain).toEqual(["tool_use", "prompt"]);
  });

  it("OpenRouter Gemini 二级匹配 → responseSchema → json_mode → prompt", () => {
    const chain = router.resolveChain({
      provider: "OpenRouter",
      modelId: "google/gemini-2.5-pro",
      structuredOutputStrategy: null,
    });
    expect(chain).toEqual(["gemini_response_schema", "json_mode", "prompt"]);
  });

  it("OpenRouter 其他 → json_schema → json_mode → prompt", () => {
    const chain = router.resolveChain({
      provider: "OpenRouter",
      modelId: "meta-llama/llama-3.1-405b",
      structuredOutputStrategy: null,
    });
    expect(chain).toEqual(["json_schema", "json_mode", "prompt"]);
  });

  it("Cohere 未配置 → 仅 prompt", () => {
    const chain = router.resolveChain({
      provider: "Cohere",
      modelId: "rerank-v3.5",
      structuredOutputStrategy: null,
    });
    expect(chain).toEqual(["prompt"]);
  });

  it("Mistral 未配置 → json_mode → prompt", () => {
    const chain = router.resolveChain({
      provider: "Mistral",
      modelId: "mistral-large",
      structuredOutputStrategy: null,
    });
    expect(chain).toEqual(["json_mode", "prompt"]);
  });

  it("Qwen 未配置 → json_mode → prompt", () => {
    const chain = router.resolveChain({
      provider: "qwen",
      modelId: "qwen-max",
      structuredOutputStrategy: null,
    });
    expect(chain).toEqual(["json_mode", "prompt"]);
  });

  it("Moonshot 未配置 → json_mode → prompt", () => {
    const chain = router.resolveChain({
      provider: "moonshot",
      modelId: "moonshot-v1-8k",
      structuredOutputStrategy: null,
    });
    expect(chain).toEqual(["json_mode", "prompt"]);
  });

  it("完全未知 provider → 仅 prompt 兜底（带 warn）", () => {
    const chain = router.resolveChain({
      provider: "WeirdProvider",
      modelId: "weird-model-1",
      structuredOutputStrategy: null,
    });
    expect(chain).toEqual(["prompt"]);
  });

  it("admin 部分配置（仅 strategy 无 fallback）→ 自动接 provider 默认链", () => {
    // admin 显式选 json_mode，但没填 fallback
    // → out.length>0 → 不再用 PROVIDER_DEFAULT_CHAINS（用户意图是显式只用这个）
    // → 兜底加 prompt
    const chain = router.resolveChain({
      provider: "OpenAI",
      modelId: "gpt-4o",
      structuredOutputStrategy: "json_mode",
      fallbackStrategies: [],
    });
    expect(chain).toEqual(["json_mode", "prompt"]);
  });

  it("admin 配置无效 strategy 字符串 → 忽略（不崩）", () => {
    const chain = router.resolveChain({
      provider: "OpenAI",
      modelId: "gpt-4o",
      structuredOutputStrategy: "garbage-strategy",
      fallbackStrategies: ["also_invalid"],
    });
    // 全部 invalid → 等同未配置 → 走 OpenAI 默认链
    expect(chain).toEqual([
      "json_schema_strict",
      "json_schema",
      "json_mode",
      "prompt",
    ]);
  });

  it("getAdapter 拿到对应 strategy 实例", () => {
    expect(router.getAdapter("json_schema_strict").strategy).toBe(
      "json_schema_strict",
    );
    expect(router.getAdapter("tool_use").strategy).toBe("tool_use");
    expect(router.getAdapter("gemini_response_schema").strategy).toBe(
      "gemini_response_schema",
    );
    expect(router.getAdapter("gbnf_grammar").strategy).toBe("gbnf_grammar");
    expect(router.getAdapter("prompt").strategy).toBe("prompt");
    expect(router.getAdapter("none").strategy).toBe("none");
  });
});
