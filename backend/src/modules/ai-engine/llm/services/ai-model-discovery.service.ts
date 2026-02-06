import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";

export interface DiscoveredModel {
  id: string;
  name: string;
  description?: string;
}

export interface FetchModelsResult {
  success: boolean;
  models?: DiscoveredModel[];
  error?: string;
}

/**
 * AI Model Discovery Service
 * 职责：从各 Provider API 获取可用模型列表
 *
 * 从 AiChatService 提取，处理：
 * - 各 Provider 的模型列表 API 调用
 * - 模型过滤（按 modelType）
 * - 静态模型列表（无 API 的 provider）
 */
@Injectable()
export class AiModelDiscoveryService {
  private readonly logger = new Logger(AiModelDiscoveryService.name);

  constructor(private readonly httpService: HttpService) {}

  /**
   * Format a model ID into a user-friendly display name
   */
  formatModelDisplayName(model: string): string {
    const modelLower = model.toLowerCase();

    if (modelLower.includes("gemini")) {
      if (modelLower.includes("flash")) return "Gemini Flash";
      if (modelLower.includes("pro")) return "Gemini Pro";
      if (modelLower.includes("imagen")) return "Gemini Imagen";
      return "Gemini";
    }
    if (modelLower.includes("grok")) return "Grok";
    if (modelLower.includes("gpt-4")) return "GPT-4";
    if (modelLower.includes("gpt-5")) return "GPT-5";
    if (modelLower.startsWith("o1")) return "OpenAI o1";
    if (modelLower.startsWith("o3")) return "OpenAI o3";
    if (modelLower.includes("claude")) {
      if (modelLower.includes("opus")) return "Claude Opus";
      if (modelLower.includes("sonnet")) return "Claude Sonnet";
      if (modelLower.includes("haiku")) return "Claude Haiku";
      return "Claude";
    }
    if (modelLower.includes("dall-e")) return "DALL-E";

    return model;
  }

  /**
   * Get the environment variable name for a provider's API key
   */
  getEnvVarNameForProvider(provider: string): string {
    const providerLower = provider.toLowerCase();
    if (providerLower === "xai" || providerLower === "grok")
      return "XAI_API_KEY";
    if (providerLower === "openai" || providerLower === "gpt")
      return "OPENAI_API_KEY";
    if (providerLower === "anthropic" || providerLower === "claude")
      return "ANTHROPIC_API_KEY";
    if (providerLower === "google" || providerLower === "gemini")
      return "GOOGLE_AI_API_KEY";
    return `${provider.toUpperCase()}_API_KEY`;
  }

  /**
   * Fetch available models from a provider's API
   * Returns list of model IDs and their metadata
   * @param modelType - Filter by model type: CHAT, CHAT_FAST, EMBEDDING, IMAGE_GENERATION, RERANK, etc.
   */
  async fetchAvailableModels(
    provider: string,
    apiKey: string,
    _apiEndpoint?: string,
    modelType?: string,
  ): Promise<FetchModelsResult> {
    if (!apiKey) {
      return { success: false, error: "API key is required" };
    }

    try {
      switch (provider.toLowerCase()) {
        case "xai":
        case "grok":
          return await this.fetchXAIModels(apiKey, modelType);

        case "openai":
        case "gpt":
          return await this.fetchOpenAIModels(apiKey, modelType);

        case "anthropic":
        case "claude":
          return this.getAnthropicModels(modelType);

        case "google":
        case "gemini":
          return await this.fetchGeminiModels(apiKey, modelType);

        case "deepseek":
          return await this.fetchOpenAICompatibleModels(
            "https://api.deepseek.com/models",
            apiKey,
            "DeepSeek",
            modelType,
          );

        case "qwen":
        case "alibaba":
          return await this.fetchOpenAICompatibleModels(
            "https://dashscope.aliyuncs.com/compatible-mode/v1/models",
            apiKey,
            "Qwen",
            modelType,
          );

        case "doubao":
        case "bytedance":
          return await this.fetchOpenAICompatibleModels(
            "https://ark.cn-beijing.volces.com/api/v3/models",
            apiKey,
            "Doubao",
            modelType,
          );

        case "zhipu":
        case "glm":
          return this.getZhipuModels(modelType);

        case "kimi":
        case "moonshot":
          return await this.fetchOpenAICompatibleModels(
            "https://api.moonshot.cn/v1/models",
            apiKey,
            "Moonshot",
            modelType,
          );

        case "cohere":
          return this.getCohereModels(modelType);

        default:
          return { success: false, error: `Unknown provider: ${provider}` };
      }
    } catch (error: any) {
      const apiError =
        error.response?.data?.error?.message ||
        error.response?.data?.message ||
        error.response?.data?.error ||
        null;
      const statusCode = error.response?.status;

      this.logger.error(
        `Failed to fetch models for ${provider}: status=${statusCode}, apiError=${JSON.stringify(apiError)}, message=${error.message}`,
      );

      const errorMessage =
        (typeof apiError === "string" ? apiError : apiError?.message) ||
        error.message ||
        "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Fetch models from xAI API
   */
  private async fetchXAIModels(
    apiKey: string,
    modelType?: string,
  ): Promise<FetchModelsResult> {
    const response = await firstValueFrom(
      this.httpService.get("https://api.x.ai/v1/models", {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        timeout: 30000,
      }),
    );

    let models = response.data?.data || [];

    if (modelType === "EMBEDDING") {
      models = models.filter(
        (m: any) =>
          m.id.includes("embed") || m.id.includes("embedding") || m.id === "v1",
      );
    } else if (
      modelType === "CHAT" ||
      modelType === "CHAT_FAST" ||
      modelType === "MULTIMODAL"
    ) {
      models = models.filter(
        (m: any) =>
          m.id.includes("grok") &&
          !m.id.includes("embed") &&
          !m.id.includes("embedding"),
      );
    }

    return {
      success: true,
      models: models.map((m: any) => ({
        id: m.id,
        name: m.id,
        description: m.description || `xAI ${m.id}`,
      })),
    };
  }

  /**
   * Fetch models from OpenAI API
   */
  private async fetchOpenAIModels(
    apiKey: string,
    modelType?: string,
  ): Promise<FetchModelsResult> {
    const response = await firstValueFrom(
      this.httpService.get("https://api.openai.com/v1/models", {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        timeout: 30000,
      }),
    );

    const allModels = response.data?.data || [];
    let filteredModels: any[];

    if (modelType === "EMBEDDING") {
      filteredModels = allModels.filter(
        (m: any) =>
          m.id.includes("embedding") ||
          m.id.startsWith("text-embedding") ||
          (m.id.includes("ada") && m.id.includes("002")),
      );
    } else if (
      modelType === "IMAGE_GENERATION" ||
      modelType === "IMAGE_EDITING"
    ) {
      filteredModels = allModels.filter((m: any) => m.id.startsWith("dall-e"));
    } else if (modelType === "CHAT_FAST") {
      filteredModels = allModels.filter(
        (m: any) =>
          m.id.includes("mini") ||
          m.id.includes("3.5") ||
          m.id.includes("turbo"),
      );
    } else {
      filteredModels = allModels.filter(
        (m: any) =>
          m.id.startsWith("gpt-") ||
          m.id.startsWith("o1") ||
          m.id.startsWith("o3"),
      );
    }

    filteredModels.sort((a: any, b: any) => b.created - a.created);

    return {
      success: true,
      models: filteredModels.map((m: any) => ({
        id: m.id,
        name: m.id,
        description: `OpenAI ${m.id}`,
      })),
    };
  }

  /**
   * Get Anthropic models (no public list API, return known models)
   */
  private getAnthropicModels(modelType?: string): FetchModelsResult {
    if (
      modelType === "EMBEDDING" ||
      modelType === "IMAGE_GENERATION" ||
      modelType === "IMAGE_EDITING" ||
      modelType === "RERANK"
    ) {
      return {
        success: true,
        models: [],
        error: `Anthropic does not support ${modelType} models`,
      };
    }

    let models: DiscoveredModel[] = [
      {
        id: "claude-sonnet-4-20250514",
        name: "Claude Sonnet 4",
        description: "Most intelligent model, best for complex tasks",
      },
      {
        id: "claude-3-5-sonnet-20241022",
        name: "Claude 3.5 Sonnet",
        description: "Best balance of intelligence and speed",
      },
      {
        id: "claude-3-5-haiku-20241022",
        name: "Claude 3.5 Haiku",
        description: "Fastest model, good for simple tasks",
      },
      {
        id: "claude-3-opus-20240229",
        name: "Claude 3 Opus",
        description: "Previous flagship model",
      },
    ];

    if (modelType === "CHAT_FAST") {
      models = models.filter((m) => m.id.includes("haiku"));
    }

    return { success: true, models };
  }

  /**
   * Fetch models from Google Gemini API
   */
  private async fetchGeminiModels(
    apiKey: string,
    modelType?: string,
  ): Promise<FetchModelsResult> {
    const response = await firstValueFrom(
      this.httpService.get(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
        {
          timeout: 30000,
        },
      ),
    );

    const allModels = response.data?.models || [];
    let filteredModels: any[];

    if (modelType === "EMBEDDING") {
      filteredModels = allModels.filter((m: any) => {
        const name = m.name.toLowerCase();
        return (
          name.includes("embedding") ||
          name.includes("text-embedding") ||
          m.supportedGenerationMethods?.includes("embedContent")
        );
      });
    } else if (
      modelType === "IMAGE_GENERATION" ||
      modelType === "IMAGE_EDITING"
    ) {
      filteredModels = allModels.filter((m: any) => {
        const name = m.name.toLowerCase();
        return name.includes("imagen");
      });
    } else if (modelType === "MULTIMODAL") {
      filteredModels = allModels.filter((m: any) => {
        const name = m.name.toLowerCase();
        return (
          name.includes("gemini") &&
          m.supportedGenerationMethods?.includes("generateContent")
        );
      });
    } else {
      filteredModels = allModels.filter((m: any) => {
        const name = m.name.toLowerCase();
        return (
          name.includes("gemini") &&
          m.supportedGenerationMethods?.includes("generateContent") &&
          !name.includes("embedding")
        );
      });
    }

    filteredModels.sort((a: any, b: any) =>
      a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
    );

    return {
      success: true,
      models: filteredModels.map((m: any) => {
        const modelId = m.name.replace("models/", "");
        return {
          id: modelId,
          name: m.displayName || modelId,
          description: m.description || `Google ${m.displayName}`,
        };
      }),
    };
  }

  /**
   * Get Cohere models (return known models based on type)
   */
  private getCohereModels(modelType?: string): FetchModelsResult {
    if (modelType === "RERANK") {
      return {
        success: true,
        models: [
          {
            id: "rerank-v3.5",
            name: "Rerank v3.5",
            description: "Latest rerank model, best quality",
          },
          {
            id: "rerank-english-v3.0",
            name: "Rerank English v3.0",
            description: "English-optimized rerank model",
          },
          {
            id: "rerank-multilingual-v3.0",
            name: "Rerank Multilingual v3.0",
            description: "Multilingual rerank model",
          },
        ],
      };
    } else if (modelType === "EMBEDDING") {
      return {
        success: true,
        models: [
          {
            id: "embed-english-v3.0",
            name: "Embed English v3.0",
            description: "Latest English embedding model",
          },
          {
            id: "embed-multilingual-v3.0",
            name: "Embed Multilingual v3.0",
            description: "Multilingual embedding model",
          },
          {
            id: "embed-english-light-v3.0",
            name: "Embed English Light v3.0",
            description: "Lightweight English embedding model",
          },
        ],
      };
    } else {
      return {
        success: true,
        models: [
          {
            id: "command-r-plus",
            name: "Command R+",
            description: "Most capable chat model",
          },
          {
            id: "command-r",
            name: "Command R",
            description: "Balanced chat model",
          },
          {
            id: "command-light",
            name: "Command Light",
            description: "Fast, lightweight chat model",
          },
        ],
      };
    }
  }

  /**
   * Fetch models from OpenAI-compatible API (DeepSeek, Qwen, Moonshot, etc.)
   */
  private async fetchOpenAICompatibleModels(
    endpoint: string,
    apiKey: string,
    providerName: string,
    modelType?: string,
  ): Promise<FetchModelsResult> {
    if (
      modelType === "IMAGE_GENERATION" ||
      modelType === "IMAGE_EDITING" ||
      modelType === "RERANK"
    ) {
      return { success: true, models: [] };
    }

    const response = await firstValueFrom(
      this.httpService.get<{
        data?: Array<{ id: string; description?: string }>;
      }>(endpoint, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        timeout: 30000,
      }),
    );

    let models = response.data?.data || [];

    if (modelType === "EMBEDDING") {
      models = models.filter(
        (m) => m.id.includes("embed") || m.id.includes("embedding"),
      );
    }

    return {
      success: true,
      models: models.map((m) => ({
        id: m.id,
        name: m.id,
        description: m.description || `${providerName} ${m.id}`,
      })),
    };
  }

  /**
   * Get Zhipu GLM models (no public list API)
   */
  private getZhipuModels(modelType?: string): FetchModelsResult {
    if (
      modelType === "IMAGE_GENERATION" ||
      modelType === "IMAGE_EDITING" ||
      modelType === "RERANK"
    ) {
      return { success: true, models: [] };
    }

    if (modelType === "EMBEDDING") {
      return {
        success: true,
        models: [
          {
            id: "embedding-3",
            name: "Embedding 3",
            description: "Zhipu text embedding model (2048 dim)",
          },
          {
            id: "embedding-2",
            name: "Embedding 2",
            description: "Zhipu text embedding model (1024 dim)",
          },
        ],
      };
    }

    return {
      success: true,
      models: [
        {
          id: "glm-4-plus",
          name: "GLM-4 Plus",
          description: "Most capable GLM model",
        },
        {
          id: "glm-4-long",
          name: "GLM-4 Long",
          description: "Long context GLM model (1M tokens)",
        },
        {
          id: "glm-4-flash",
          name: "GLM-4 Flash",
          description: "Fast and free GLM model",
        },
        {
          id: "glm-4-flashx",
          name: "GLM-4 FlashX",
          description: "Ultra-fast GLM model with lowest latency",
        },
        {
          id: "glm-4",
          name: "GLM-4",
          description: "Standard GLM model",
        },
      ],
    };
  }
}
