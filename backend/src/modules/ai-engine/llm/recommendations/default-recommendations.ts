import { AIModelType } from "@prisma/client";

/**
 * 一键 AI 配置推荐矩阵的**硬编码默认值**。
 *
 * 这是系统首次启动的 seed 数据；seed 之后，管理员可以在
 * 「/admin/ai 推荐矩阵」里编辑，service 会优先读 DB。
 *
 * 每个 patterns 是**正则字符串数组**（不是 RegExp 实例，方便 JSON 序列化 / DB 存储）。
 * 匹配时：按顺序走，第一个 `new RegExp(p, "i")` 命中的 modelId 即胜出。
 */
export interface DefaultRecommendation {
  provider: string;
  modelType: AIModelType;
  patterns: string[];
  priority: number;
  note?: string;
}

export const DEFAULT_RECOMMENDATIONS: DefaultRecommendation[] = [
  // ============ OpenAI ============
  {
    provider: "openai",
    modelType: AIModelType.CHAT,
    patterns: ["^gpt-4o(?!-mini)", "^gpt-4-turbo", "^gpt-4(?!o)", "^gpt-5"],
    priority: 50,
  },
  {
    provider: "openai",
    modelType: AIModelType.CHAT_FAST,
    patterns: ["^gpt-4o-mini", "^gpt-3\\.5-turbo", "^gpt-5-mini"],
    priority: 50,
  },
  {
    provider: "openai",
    modelType: AIModelType.CODE,
    patterns: ["^gpt-4o(?!-mini)"],
    priority: 50,
  },
  {
    provider: "openai",
    modelType: AIModelType.MULTIMODAL,
    patterns: ["^gpt-4o(?!-mini)"],
    priority: 50,
  },
  {
    provider: "openai",
    modelType: AIModelType.EMBEDDING,
    patterns: [
      "^text-embedding-3-small",
      "^text-embedding-3-large",
      "^text-embedding-ada-002",
    ],
    priority: 50,
  },
  {
    provider: "openai",
    modelType: AIModelType.IMAGE_GENERATION,
    patterns: ["^dall-e-3", "^gpt-image-1"],
    priority: 50,
  },
  {
    provider: "openai",
    modelType: AIModelType.IMAGE_EDITING,
    patterns: ["^dall-e-2"],
    priority: 50,
  },

  // ============ Anthropic ============
  {
    provider: "anthropic",
    modelType: AIModelType.CHAT,
    patterns: [
      "claude-3-5-sonnet",
      "claude-sonnet-4",
      "claude-3-opus",
      "claude-opus-4",
    ],
    priority: 50,
  },
  {
    provider: "anthropic",
    modelType: AIModelType.CHAT_FAST,
    patterns: ["claude-3-5-haiku", "claude-3-haiku"],
    priority: 50,
  },
  {
    provider: "anthropic",
    modelType: AIModelType.CODE,
    patterns: ["claude-3-5-sonnet", "claude-sonnet-4"],
    priority: 50,
  },
  {
    provider: "anthropic",
    modelType: AIModelType.MULTIMODAL,
    patterns: ["claude-3-5-sonnet"],
    priority: 50,
  },

  // ============ Google ============
  {
    provider: "google",
    modelType: AIModelType.CHAT,
    patterns: [
      "^gemini-2\\.0-pro",
      "^gemini-1\\.5-pro",
      "^gemini-2\\.0-flash$",
    ],
    priority: 50,
  },
  {
    provider: "google",
    modelType: AIModelType.CHAT_FAST,
    patterns: ["^gemini-2\\.0-flash-lite", "^gemini-1\\.5-flash"],
    priority: 50,
  },
  {
    provider: "google",
    modelType: AIModelType.MULTIMODAL,
    patterns: ["^gemini-2\\.0-flash$", "^gemini-1\\.5-pro"],
    priority: 50,
  },
  {
    provider: "google",
    modelType: AIModelType.EMBEDDING,
    patterns: ["^text-embedding-004", "embedding"],
    priority: 50,
  },

  // ============ xAI ============
  {
    provider: "xai",
    modelType: AIModelType.CHAT,
    patterns: ["^grok-3(?!-mini)", "^grok-2(?!-mini)"],
    priority: 50,
  },
  {
    provider: "xai",
    modelType: AIModelType.CHAT_FAST,
    patterns: ["^grok-3-mini", "^grok-2-mini"],
    priority: 50,
  },

  // ============ DeepSeek ============
  {
    provider: "deepseek",
    modelType: AIModelType.CHAT,
    patterns: ["^deepseek-chat$", "^deepseek-v3"],
    priority: 50,
  },
  {
    provider: "deepseek",
    modelType: AIModelType.CHAT_FAST,
    patterns: ["^deepseek-chat$"],
    priority: 50,
  },

  // ============ Cohere ============
  {
    provider: "cohere",
    modelType: AIModelType.CHAT,
    patterns: ["^command-r-plus"],
    priority: 50,
  },
  {
    provider: "cohere",
    modelType: AIModelType.CHAT_FAST,
    patterns: ["^command-r(?!-plus)"],
    priority: 50,
  },
  {
    provider: "cohere",
    modelType: AIModelType.RERANK,
    patterns: ["^rerank-v3\\.5", "^rerank"],
    priority: 50,
  },

  // ============ Groq ============
  {
    provider: "groq",
    modelType: AIModelType.CHAT,
    patterns: ["^llama-3\\.3-70b", "^mixtral-8x7b"],
    priority: 50,
  },
  {
    provider: "groq",
    modelType: AIModelType.CHAT_FAST,
    patterns: ["^llama-3\\.3-70b", "^mixtral-8x7b", "^llama-3\\.1-8b"],
    priority: 50,
  },

  // ============ Qwen ============
  {
    provider: "qwen",
    modelType: AIModelType.CHAT,
    patterns: ["^qwen-max", "^qwen-plus"],
    priority: 50,
  },
  {
    provider: "qwen",
    modelType: AIModelType.CHAT_FAST,
    patterns: ["^qwen-turbo", "^qwen-plus"],
    priority: 50,
  },

  // ============ OpenRouter ============
  {
    provider: "openrouter",
    modelType: AIModelType.CHAT,
    patterns: ["auto$"],
    priority: 50,
  },

  // ============ MiniMax ============
  {
    provider: "minimax",
    modelType: AIModelType.CHAT,
    patterns: ["^MiniMax-Text-01"],
    priority: 50,
  },
];
