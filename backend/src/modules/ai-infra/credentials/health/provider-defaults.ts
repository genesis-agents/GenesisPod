/**
 * Provider → 默认端点 / 测试模型 / API 格式（共享）
 *
 * ★ 2026-05-06: 之前 user-api-keys.service 内部 const 私有，admin SecretKeysService
 *   想调真上游探测拿不到 endpoint。提到共享层让两侧都用一份单源。
 *
 * UserModelConfigsService.providerDefaults 也有一份重复定义（comment：
 * "与 UserApiKeysService.PROVIDER_DEFAULTS 保持一致"）—— 后续可统一引用本文件。
 */
export interface ProviderDefaults {
  endpoint: string;
  testModel: string;
  /** "openai" | "anthropic" | "google" | "cohere" 等 */
  apiFormat: string;
}

export const PROVIDER_DEFAULTS: Readonly<Record<string, ProviderDefaults>> = {
  openai: {
    // Allow OPENAI_BASE_URL to override the public OpenAI endpoint — needed
    // for self-hosted setups (LiteLLM gateway, Azure OpenAI, vLLM) where the
    // BYOK row's api_endpoint isn't read by the test/probe/fetch-models path
    // (which falls back to PROVIDER_DEFAULTS instead).
    endpoint: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    testModel: "gpt-4o-mini",
    apiFormat: "openai",
  },
  anthropic: {
    endpoint: "https://api.anthropic.com/v1",
    testModel: "claude-3-haiku-20240307",
    apiFormat: "anthropic",
  },
  deepseek: {
    endpoint: "https://api.deepseek.com/v1",
    testModel: "deepseek-chat",
    apiFormat: "openai",
  },
  google: {
    endpoint: "https://generativelanguage.googleapis.com/v1beta",
    testModel: "gemini-2.0-flash-lite",
    apiFormat: "google",
  },
  xai: {
    endpoint: "https://api.x.ai/v1",
    testModel: "grok-3-mini-fast",
    apiFormat: "openai",
  },
  qwen: {
    endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    testModel: "qwen-turbo",
    apiFormat: "openai",
  },
  cohere: {
    endpoint: "https://api.cohere.com/v2",
    testModel: "command-r",
    apiFormat: "openai",
  },
  groq: {
    endpoint: "https://api.groq.com/openai/v1",
    testModel: "llama-3.3-70b-versatile",
    apiFormat: "openai",
  },
  openrouter: {
    endpoint: "https://openrouter.ai/api/v1",
    testModel: "openrouter/auto",
    apiFormat: "openai",
  },
  minimax: {
    endpoint: "https://api.minimax.chat/v1",
    testModel: "MiniMax-Text-01",
    apiFormat: "openai",
  },
  voyage: {
    endpoint: "https://api.voyageai.com/v1",
    testModel: "voyage-3-lite",
    apiFormat: "openai",
  },
};
