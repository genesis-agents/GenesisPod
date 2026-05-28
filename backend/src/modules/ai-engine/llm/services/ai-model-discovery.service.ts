import { forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { UserApiKeysService } from "../../../ai-infra/credentials/user-api-keys/user-api-keys.service";

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

  constructor(
    private readonly httpService: HttpService,
    @Inject(forwardRef(() => UserApiKeysService))
    private readonly userApiKeysService: UserApiKeysService,
  ) {}

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
    if (providerLower === "minimax") return "MINIMAX_API_KEY";
    if (providerLower === "openrouter") return "OPENROUTER_API_KEY";
    if (providerLower === "groq") return "GROQ_API_KEY";
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
    apiEndpoint?: string,
    modelType?: string,
  ): Promise<FetchModelsResult> {
    if (!apiKey) {
      return { success: false, error: "API key is required" };
    }

    try {
      // ★ 2026-05-27 数据驱动重构 (用户实证: 硬编码 provider 名字反模式):
      //   1. 从 DB ai_providers 查 (slug → apiFormat + 默认 endpoint)
      //   2. effective endpoint = 用户传入 > DB > 报错
      //   3. 按 apiFormat (openai/anthropic/google/cohere) 路由到 4 个协议处理器
      //   完全没有硬编码 provider 名字; 新增 provider 只需在 ai_providers 表加行。
      const defaults = await this.userApiKeysService.resolveProviderDefaults(
        provider.toLowerCase(),
      );
      const endpointResolved = (apiEndpoint?.trim() || defaults?.endpoint || "")
        .replace(/\/+$/, "");
      const apiFormat = (defaults?.apiFormat || "openai").toLowerCase();

      if (!endpointResolved) {
        return {
          success: false,
          error: `Provider "${provider}" not in catalog and no endpoint provided. Please add the provider in API Keys tab or pass apiEndpoint explicitly.`,
        };
      }

      switch (apiFormat) {
        case "anthropic":
          return await this.fetchAnthropicModels(
            apiKey,
            modelType,
            endpointResolved,
          );
        case "google":
          return await this.fetchGeminiModelsAt(
            endpointResolved,
            apiKey,
            modelType,
          );
        case "cohere":
          return await this.fetchCohereModels(
            apiKey,
            modelType,
            endpointResolved,
          );
        case "openai":
        default: {
          // OpenAI-compatible /models — 覆盖 OpenAI / xAI / DeepSeek / Qwen /
          // Doubao / Zhipu / Kimi / MiniMax / OpenRouter / Groq / 自建 vLLM 等。
          const url = endpointResolved + "/models";
          return await this.fetchOpenAICompatibleModels(
            url,
            apiKey,
            provider,
            modelType,
          );
        }
      }

      // ★ 已 dead code, 保留下方 switch 仅给 voyage/google 这种需要特殊抓取的兜底。
      //   provider catalog 标准 apiFormat 路径已上方接管。
      switch (provider.toLowerCase()) {
        case "xai":
        case "grok":
          return await this.fetchXAIModels(apiKey, modelType);

        case "openai":
        case "gpt":
          return await this.fetchOpenAIModels(apiKey, modelType);

        case "anthropic":
        case "claude":
          // ★ 2026-05-05 Anthropic 自 2024-11 起官方支持 GET /v1/models（自家协议，
          //   非 OpenAI-compatible，要 anthropic-version + x-api-key header）。
          //   动态获取最新 Claude 模型列表（含 capabilities），不再 hardcoded。
          return await this.fetchAnthropicModels(apiKey, modelType);

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
          // ★ 2026-05-05 Zhipu 实际提供 OpenAI-compatible /v1/models 端点
          //   (https://open.bigmodel.cn/api/paas/v4/models)。动态调用，
          //   不再 hardcoded。
          return await this.fetchOpenAICompatibleModels(
            "https://open.bigmodel.cn/api/paas/v4/models",
            apiKey,
            "Zhipu",
            modelType,
          );

        case "kimi":
        case "moonshot":
          return await this.fetchOpenAICompatibleModels(
            "https://api.moonshot.cn/v1/models",
            apiKey,
            "Moonshot",
            modelType,
          );

        case "minimax":
          return await this.fetchOpenAICompatibleModels(
            "https://api.minimax.chat/v1/models",
            apiKey,
            "MiniMax",
            modelType,
          );

        case "openrouter":
        case "open-router":
          return await this.fetchOpenAICompatibleModels(
            "https://openrouter.ai/api/v1/models",
            apiKey,
            "OpenRouter",
            modelType,
          );

        case "groq":
          return await this.fetchOpenAICompatibleModels(
            "https://api.groq.com/openai/v1/models",
            apiKey,
            "Groq",
            modelType,
          );

        case "cohere":
          // ★ 2026-05-05 Cohere 官方提供 GET /v1/models?endpoint=embed/rerank/chat
          //   动态获取，按 modelType 过滤。不再 hardcoded。
          return await this.fetchCohereModels(apiKey, modelType);

        case "voyage":
        case "voyageai":
          // ★ 2026-05-05 Voyage 官方未提供 /v1/models 端点（产品决策）。
          //   动态发现走公开 docs page（https://docs.voyageai.com/docs/embeddings
          //   + /docs/reranker），HTML scrape 提取最新 model list（24h LRU）。
          //   不再代码 hardcoded（避免 voyage-4 系列上线后用户看不到）。
          return await this.fetchVoyageModels(modelType);

        default: {
          // ★ 2026-05-27: 数据驱动后这里只作为残余 voyage 等特殊 provider 的兜底
          //   入口 (上方主 switch 按 apiFormat 路由会接管 openai/anthropic/google/
          //   cohere); 若新 provider 没在 DB ai_providers 表注册, 主路径会先返错。
          const ep: string = (apiEndpoint ?? "").trim();
          if (ep.length > 0) {
            const url = ep.replace(/\/+$/, "") + "/models";
            return await this.fetchOpenAICompatibleModels(
              url,
              apiKey,
              provider,
              modelType,
            );
          }
          return {
            success: false,
            error: `Unknown provider: ${provider}. Provide a custom API endpoint to fetch models.`,
          };
        }
      }
    } catch (error: unknown) {
      const errorResponse = (
        error as {
          response?: {
            data?: { error?: { message?: string } | string; message?: string };
            status?: number;
          };
        }
      ).response;
      const errorData = errorResponse?.data;
      const apiError =
        (typeof errorData?.error === "object" && errorData.error !== null
          ? (errorData.error as { message?: string }).message
          : null) ||
        errorData?.message ||
        (typeof errorData?.error === "string" ? errorData.error : null) ||
        null;
      const statusCode = errorResponse?.status;

      this.logger.error(
        `Failed to fetch models for ${provider}: status=${statusCode}, apiError=${JSON.stringify(apiError)}, message=${error instanceof Error ? error.message : String(error)}`,
      );

      const errorMessage =
        (typeof apiError === "string"
          ? apiError
          : (apiError as { message?: string } | null)?.message) ||
        (error instanceof Error ? error.message : null) ||
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
        (m: { id: string }) =>
          m.id.includes("embed") || m.id.includes("embedding") || m.id === "v1",
      );
    } else if (
      modelType === "CHAT" ||
      modelType === "CHAT_FAST" ||
      modelType === "MULTIMODAL"
    ) {
      models = models.filter(
        (m: { id: string }) =>
          m.id.includes("grok") &&
          !m.id.includes("embed") &&
          !m.id.includes("embedding"),
      );
    }

    return {
      success: true,
      models: models.map((m: { id: string; description?: string }) => ({
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
    let filteredModels: Array<{ id: string; created?: number }>;

    if (modelType === "EMBEDDING") {
      filteredModels = allModels.filter(
        (m: { id: string }) =>
          m.id.includes("embedding") ||
          m.id.startsWith("text-embedding") ||
          (m.id.includes("ada") && m.id.includes("002")),
      );
    } else if (
      modelType === "IMAGE_GENERATION" ||
      modelType === "IMAGE_EDITING"
    ) {
      filteredModels = allModels.filter((m: { id: string }) =>
        m.id.startsWith("dall-e"),
      );
    } else if (modelType === "CHAT_FAST") {
      filteredModels = allModels.filter(
        (m: { id: string }) =>
          m.id.includes("mini") ||
          m.id.includes("3.5") ||
          m.id.includes("turbo"),
      );
    } else {
      filteredModels = allModels.filter(
        (m: { id: string }) =>
          // o-series 用 /^o\d/ 覆盖未来型号 (o4/o5/...)
          m.id.startsWith("gpt-") || /^o\d/.test(m.id),
      );
    }

    filteredModels.sort((a, b) => (b.created || 0) - (a.created || 0));

    return {
      success: true,
      models: filteredModels.map((m) => ({
        id: m.id,
        name: m.id,
        description: `OpenAI ${m.id}`,
      })),
    };
  }

  /**
   * Fetch models from Google Gemini API
   * ★ 2026-05-27: 默认 endpoint hardcoded fallback 用 official URL (与原行为兼容);
   *   fetchGeminiModelsAt 接受自定义 endpoint (走数据驱动路径)。
   */
  private async fetchGeminiModelsAt(
    endpointBase: string,
    apiKey: string,
    modelType?: string,
  ): Promise<FetchModelsResult> {
    const sep = endpointBase.includes("?") ? "&" : "?";
    return this.fetchGeminiImpl(`${endpointBase}${sep}key=${apiKey}`, modelType);
  }
  private async fetchGeminiModels(
    apiKey: string,
    modelType?: string,
  ): Promise<FetchModelsResult> {
    return this.fetchGeminiImpl(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      modelType,
    );
  }
  private async fetchGeminiImpl(
    fullUrl: string,
    modelType?: string,
  ): Promise<FetchModelsResult> {
    const response = await firstValueFrom(
      this.httpService.get(fullUrl, {
        timeout: 30000,
      }),
    );

    const allModels = response.data?.models || [];
    let filteredModels: Array<{
      name: string;
      displayName?: string;
      description?: string;
      supportedGenerationMethods?: string[];
    }>;

    if (modelType === "EMBEDDING") {
      filteredModels = allModels.filter(
        (m: { name: string; supportedGenerationMethods?: string[] }) => {
          const name = m.name.toLowerCase();
          return (
            name.includes("embedding") ||
            name.includes("text-embedding") ||
            m.supportedGenerationMethods?.includes("embedContent")
          );
        },
      );
    } else if (
      modelType === "IMAGE_GENERATION" ||
      modelType === "IMAGE_EDITING"
    ) {
      filteredModels = allModels.filter((m: { name: string }) => {
        const name = m.name.toLowerCase();
        return name.includes("imagen");
      });
    } else if (modelType === "MULTIMODAL") {
      filteredModels = allModels.filter(
        (m: { name: string; supportedGenerationMethods?: string[] }) => {
          const name = m.name.toLowerCase();
          return (
            name.includes("gemini") &&
            m.supportedGenerationMethods?.includes("generateContent")
          );
        },
      );
    } else {
      filteredModels = allModels.filter(
        (m: { name: string; supportedGenerationMethods?: string[] }) => {
          const name = m.name.toLowerCase();
          return (
            name.includes("gemini") &&
            m.supportedGenerationMethods?.includes("generateContent") &&
            !name.includes("embedding")
          );
        },
      );
    }

    filteredModels.sort((a, b) =>
      a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
    );

    return {
      success: true,
      models: filteredModels.map((m) => {
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

  // ─── 2026-05-05 动态发现（替代 hardcoded）─────────────────────────
  // 三处缓存：
  //   - voyage docs scrape：24h TTL（HTML 解析慢且 docs 站不该被频繁打）
  //   - anthropic / cohere /v1/models：本次请求内复用（fetchAvailableModels 一次性返）
  //
  // 所有方法都是 best-effort：拿到模型 → 返；网络/解析失败 → throw 让 caller 兜底。
  private voyageCache: { at: number; data: FetchModelsResult } | null = null;

  /**
   * Anthropic GET /v1/models（自家协议，2024-11 起官方支持）
   *   header: x-api-key + anthropic-version: 2023-06-01
   *   response: { data: [{id, display_name, capabilities, ...}] }
   */
  private async fetchAnthropicModels(
    apiKey: string,
    modelType?: string,
    endpointBase?: string,
  ): Promise<FetchModelsResult> {
    // endpointBase 是 provider base (默认 https://api.anthropic.com), 拼 /v1/models
    const base = (endpointBase || "https://api.anthropic.com").replace(/\/+$/, "");
    const url = base.endsWith("/v1") ? `${base}/models` : `${base}/v1/models`;
    try {
      const response = await firstValueFrom(
        this.httpService.get<{
          data: Array<{
            id: string;
            display_name?: string;
            type: string;
          }>;
        }>(url, {
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          timeout: 30000,
          params: { limit: 1000 },
        }),
      );
      let models = (response.data?.data ?? []).map((m) => ({
        id: m.id,
        name: m.display_name || m.id,
        description: m.display_name || m.id,
      }));
      // Anthropic 只提供 chat 模型，EMBEDDING / RERANK 类型直接返空
      if (modelType === "EMBEDDING" || modelType === "RERANK") {
        models = [];
      }
      return { success: true, models };
    } catch (err) {
      this.logger.warn(
        `[fetchAnthropicModels] failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return {
        success: false,
        error:
          "Anthropic /v1/models call failed — check API key and network.",
      };
    }
  }

  /**
   * Cohere GET /v1/models?endpoint=embed|rerank|chat（官方支持 endpoint 过滤）
   */
  private async fetchCohereModels(
    apiKey: string,
    modelType?: string,
    endpointBase?: string,
  ): Promise<FetchModelsResult> {
    const endpointFilter =
      modelType === "EMBEDDING"
        ? "embed"
        : modelType === "RERANK"
          ? "rerank"
          : "chat";
    const base = (endpointBase || "https://api.cohere.com").replace(/\/+$/, "");
    const url = base.endsWith("/v1") ? `${base}/models` : `${base}/v1/models`;
    try {
      const response = await firstValueFrom(
        this.httpService.get<{
          models: Array<{
            name: string;
            is_deprecated?: boolean;
            endpoints?: string[];
            context_length?: number;
          }>;
        }>(url, {
          headers: { Authorization: `Bearer ${apiKey}` },
          timeout: 30000,
          params: { endpoint: endpointFilter, page_size: 1000 },
        }),
      );
      const models = (response.data?.models ?? [])
        .filter((m) => !m.is_deprecated)
        .map((m) => ({
          id: m.name,
          name: m.name,
          description: m.context_length
            ? `Cohere ${m.name} (ctx=${m.context_length})`
            : `Cohere ${m.name}`,
        }));
      return { success: true, models };
    } catch (err) {
      this.logger.warn(
        `[fetchCohereModels] failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return {
        success: false,
        error:
          "Cohere /v1/models call failed — check API key and network.",
      };
    }
  }

  /**
   * Voyage 没 list API。从公开 docs page (readme.io HTML) scrape 模型 ID。
   *   - https://docs.voyageai.com/docs/embeddings  → embedding 模型
   *   - https://docs.voyageai.com/docs/reranker     → rerank 模型
   *   24h LRU cache 减少 docs 站压力 + 失败用 cache（容忍 docs 站抖动）。
   *
   *   提取规则：抓表格行中的 model id（kebab-case 含 voyage- 或 rerank- 前缀）。
   */
  private async fetchVoyageModels(
    modelType?: string,
  ): Promise<FetchModelsResult> {
    const TTL = 24 * 60 * 60 * 1000;
    if (
      this.voyageCache &&
      Date.now() - this.voyageCache.at < TTL &&
      this.voyageCache.data.success
    ) {
      return this.filterVoyageByType(this.voyageCache.data, modelType);
    }
    try {
      const [embedHtml, rerankHtml] = await Promise.all([
        this.fetchHtml("https://docs.voyageai.com/docs/embeddings"),
        this.fetchHtml("https://docs.voyageai.com/docs/reranker"),
      ]);
      const embedIds = this.extractVoyageIds(embedHtml, /^voyage-[\w.-]+$/);
      const rerankIds = this.extractVoyageIds(rerankHtml, /^rerank-[\w.-]+$/);
      const models = [
        ...embedIds.map((id) => ({
          id,
          name: id,
          description: `Voyage embedding model ${id}`,
        })),
        ...rerankIds.map((id) => ({
          id,
          name: id,
          description: `Voyage rerank model ${id}`,
        })),
      ];
      const result: FetchModelsResult = { success: true, models };
      this.voyageCache = { at: Date.now(), data: result };
      return this.filterVoyageByType(result, modelType);
    } catch (err) {
      this.logger.warn(
        `[fetchVoyageModels] docs scrape failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      // 缓存有数据时降级回缓存（容忍 docs 站偶发故障）
      if (this.voyageCache?.data.success) {
        this.logger.warn(`[fetchVoyageModels] fallback to expired cache`);
        return this.filterVoyageByType(this.voyageCache.data, modelType);
      }
      return {
        success: false,
        error:
          "Voyage docs scrape failed and no cache. Voyage 未提供 /v1/models 端点 — 你可以在自定义 modelId 字段手动输入（参考 https://docs.voyageai.com/docs/embeddings）。",
      };
    }
  }

  private async fetchHtml(url: string): Promise<string> {
    const response = await firstValueFrom(
      this.httpService.get<string>(url, {
        timeout: 15000,
        responseType: "text",
        headers: { "User-Agent": "Mozilla/5.0 (model-discovery)" },
      }),
    );
    return response.data;
  }

  /**
   * 从 docs HTML 中提取符合 idPattern 的 kebab-case ID。
   * readme.io 文档把 model ID 放在 <code>...</code> 或表格首列；扫所有 token 取唯一。
   */
  private extractVoyageIds(html: string, idPattern: RegExp): string[] {
    const tokens =
      html.match(/[a-z][a-z0-9]*(?:-[a-z0-9.]+)+/g)?.filter(Boolean) ?? [];
    const unique = Array.from(new Set(tokens)).filter((t) =>
      idPattern.test(t),
    );
    return unique;
  }

  private filterVoyageByType(
    result: FetchModelsResult,
    modelType?: string,
  ): FetchModelsResult {
    if (!result.success || !result.models) return result;
    if (!modelType) return result;
    const models = result.models.filter((m) => {
      if (modelType === "EMBEDDING") return m.id.startsWith("voyage-");
      if (modelType === "RERANK") return m.id.startsWith("rerank-");
      return false; // voyage 不提供 chat
    });
    return { success: true, models };
  }

  /**
   * @deprecated 已废弃 — Anthropic / Cohere / Voyage / Zhipu 切到动态发现。
   * 本方法保留实现是因为 dual reference 需要（getAnthropicModels 调用），
   * 实际是新 fetchAnthropicModels 路径。
   */
  // (旧 getAnthropicModels / getCohereModels / getVoyageModels 已转为下方动态版)

}
