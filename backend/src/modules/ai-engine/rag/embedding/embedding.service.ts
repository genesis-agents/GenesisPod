/**
 * AI Engine - Embedding Service
 * 通用向量嵌入生成服务
 *
 * 提供:
 * - 多 Provider 支持 (OpenAI, Google, Cohere, xAI 等)
 * - 基于 apiFormat 的数据驱动路由
 * - 批量嵌入生成
 * - 动态模型配置
 */

import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  Optional,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "@/common/prisma/prisma.service";
import { SecretsService } from "@/modules/ai-infra/facade";
import { AiApiCallerService } from "@/modules/ai-engine/llm/services/ai-api-caller.service";

// Default fallback values
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_EMBEDDING_DIMENSIONS = 1536;
const MAX_BATCH_SIZE = 100;
// Cohere embed API limits: 96 texts per request
const COHERE_MAX_BATCH_SIZE = 96;

/**
 * Embedding 模型配置
 */
export interface EmbeddingModelConfig {
  modelId: string;
  dimensions: number;
  apiKey: string;
  apiEndpoint?: string;
  provider: string;
  apiFormat: string;
  maxInputTokens?: number;
}

/**
 * 单个嵌入结果
 */
export interface EmbeddingResult {
  text: string;
  embedding: number[];
  tokenCount: number;
}

/**
 * 批量嵌入结果
 */
export interface EmbeddingBatch {
  texts: string[];
  embeddings: number[][];
  totalTokens: number;
}

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private cachedConfig: EmbeddingModelConfig | null = null;
  private configCacheTime: number = 0;
  private readonly CONFIG_CACHE_TTL = 60000; // 1 minute cache

  // ★ 2026-05-04 加：429 退避 + 熔断器（防止 OpenAI embedding 429 风暴
  //   带垮 RAG 检索 + Figure relevance 筛选）
  //   - 连续 N 次 429 in 时间窗 → 打开熔断 X 秒，期间直接 throw "circuit-open"
  //     不再发请求（让上游 fallback 而不是 retry storm）
  //   - 单次请求遇 429 → 指数退避重试（最多 3 次）
  private rateLimitFailures: number[] = []; // timestamp 数组
  private circuitOpenUntil = 0;
  private static readonly CIRCUIT_THRESHOLD = 5; // 5 次 429 in window → 打开
  private static readonly CIRCUIT_WINDOW_MS = 60_000; // 1 分钟内
  private static readonly CIRCUIT_OPEN_DURATION_MS = 60_000; // 打开后冷却 60s
  private static readonly RETRY_MAX_ATTEMPTS = 3;
  private static readonly RETRY_BASE_DELAY_MS = 1000; // 1s, 2s, 4s 指数退避

  // ★ 2026-05-05 P0 修复：401-aware 熔断器（系统配置失效保护）
  //   线上观察：DB EMBEDDING 模型 secretKey → Secret Manager 失效 OpenAI key
  //   → 单 mission 524 次 401 ERROR 刷屏。401 不应重试（认证失败重试无意义），
  //   也不应每次都 ERROR 刷屏。逻辑：
  //   - 第一次 401 → ERROR + invalidate config cache（让 admin 改了 key 后能立刻生效）
  //   - cooldown 期内（5min）后续 401 → 静默（return cached error / 上游 fallback）
  //   - cooldown 到期 → 重置，给一次机会重试（admin 可能已改 key）
  private authFailedUntil = 0;
  private static readonly AUTH_FAILURE_COOLDOWN_MS = 5 * 60_000; // 5 分钟

  // ★ 全覆盖审计修 (2026-05-06): 高并发下多 provider/baseUrl 组合的 401 去重
  //   Map key = "${provider}::${baseUrl|''}", value = cooldown 到期时间戳
  //   第一次 401 → ERROR（可见）; cooldown 期内 → DEBUG（不刷屏）
  //   场景：系统同时配置了多个 embedding provider，各自独立 cooldown
  private static readonly AUTH_COOLDOWN_PER_ENDPOINT_MS = 60_000; // 60s
  private readonly authErrorEndpoints = new Map<string, number>(); // key → expiry ts

  constructor(
    private readonly prisma: PrismaService,
    private readonly secretsService: SecretsService,
    private readonly aiApiCallerService: AiApiCallerService,
    private readonly configService: ConfigService,
    /** v5.1 R0.5-E B-#6 (2026-05-05): EMBEDDING_REQUEST hook seam，可选注入。
     *  plugin 可拦截 / 替换 embedding（缓存 / fallback provider）。 */
    @Optional()
    private readonly hookBus?: import("@/plugins/core/hook-bus").HookBus,
  ) {}

  private isRateLimitError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return /429|rate.?limit|too many requests/i.test(msg);
  }

  /**
   * ★ 2026-05-05 P0 修复：检测 401（认证失败 = key 失效）
   */
  private isAuthError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return /\b401\b|unauthorized|invalid.*api.?key|authentication/i.test(msg);
  }

  private isAuthCircuitOpen(): boolean {
    return Date.now() < this.authFailedUntil;
  }

  // ★ 全覆盖审计修 (2026-05-06): 高并发 401 去重 helpers
  private endpointAuthKey(provider: string, baseUrl?: string): string {
    return `${provider}::${baseUrl ?? ""}`;
  }

  /**
   * 返回 true = 已在 cooldown 内（不应再打 ERROR）
   * 返回 false = 第一次或 cooldown 已过（应打 ERROR + 重设 cooldown）
   */
  private isEndpointAuthCoolingDown(
    provider: string,
    baseUrl?: string,
  ): boolean {
    const key = this.endpointAuthKey(provider, baseUrl);
    const expiry = this.authErrorEndpoints.get(key);
    if (!expiry) return false;
    if (Date.now() < expiry) return true;
    this.authErrorEndpoints.delete(key); // cooldown 到期，清除让下次首次 ERROR 可见
    return false;
  }

  private markEndpointAuthFailed(provider: string, baseUrl?: string): void {
    const key = this.endpointAuthKey(provider, baseUrl);
    this.authErrorEndpoints.set(
      key,
      Date.now() + EmbeddingService.AUTH_COOLDOWN_PER_ENDPOINT_MS,
    );
  }

  /**
   * 熔断器状态：返回 true = 当前打开（拒绝调用），false = 关闭
   */
  private isCircuitOpen(): boolean {
    const now = Date.now();
    if (this.circuitOpenUntil > now) return true;
    // 清理 window 外的失败时间戳
    this.rateLimitFailures = this.rateLimitFailures.filter(
      (ts) => now - ts < EmbeddingService.CIRCUIT_WINDOW_MS,
    );
    return false;
  }

  private recordRateLimitFailure(): void {
    const now = Date.now();
    this.rateLimitFailures.push(now);
    this.rateLimitFailures = this.rateLimitFailures.filter(
      (ts) => now - ts < EmbeddingService.CIRCUIT_WINDOW_MS,
    );
    if (this.rateLimitFailures.length >= EmbeddingService.CIRCUIT_THRESHOLD) {
      this.circuitOpenUntil = now + EmbeddingService.CIRCUIT_OPEN_DURATION_MS;
      this.logger.warn(
        `[embedding] circuit-open: ${this.rateLimitFailures.length} 429s in ${EmbeddingService.CIRCUIT_WINDOW_MS}ms; cooling for ${EmbeddingService.CIRCUIT_OPEN_DURATION_MS}ms`,
      );
      this.rateLimitFailures = []; // 打开后清空，避免反复触发
    }
  }

  /**
   * 根据 provider 推断 API 格式（与 AiModelConfigService.inferApiFormat 一致）
   */
  private resolveApiFormat(
    dbApiFormat: string | null | undefined,
    provider: string,
  ): string {
    const inferred = this.inferApiFormat(provider);
    if (!dbApiFormat) return inferred;
    if (dbApiFormat === inferred) return dbApiFormat;
    // 非 openai provider 存了 openai format 视为配置错误
    if (dbApiFormat === "openai" && inferred !== "openai") {
      this.logger.warn(
        `[resolveApiFormat] apiFormat="${dbApiFormat}" conflicts with provider="${provider}", using inferred "${inferred}"`,
      );
      return inferred;
    }
    return dbApiFormat;
  }

  private inferApiFormat(provider: string): string {
    const lower = provider.toLowerCase();
    if (lower === "google" || lower === "gemini") return "google";
    if (lower === "cohere") return "cohere";
    return "openai"; // OpenAI, xAI, DeepSeek 等都走 OpenAI 兼容格式
  }

  /**
   * 从数据库加载 Embedding 模型配置
   */
  async getEmbeddingConfig(): Promise<EmbeddingModelConfig> {
    // Check cache
    if (
      this.cachedConfig &&
      Date.now() - this.configCacheTime < this.CONFIG_CACHE_TTL
    ) {
      return this.cachedConfig;
    }

    // Try to get EMBEDDING type model from database
    const model = await this.prisma.aIModel.findFirst({
      where: {
        modelType: "EMBEDDING",
        isEnabled: true,
      },
      orderBy: { isDefault: "desc" },
    });

    if (model) {
      // ★ 优先使用 secretKey 从 Secret Manager 获取 API Key
      let apiKey: string | null = null;
      if (model.secretKey) {
        const secretValue = await this.secretsService.getValueInternal(
          model.secretKey,
        );
        if (secretValue) {
          apiKey = secretValue.trim();
          this.logger.debug(
            `Resolved API key from Secret Manager for embedding model: ${model.modelId}`,
          );
        } else {
          this.logger.error(
            `Secret '${model.secretKey}' not found for embedding model ${model.modelId}. Check Secret Manager configuration.`,
          );
        }
      }

      if (apiKey) {
        const modelAny = model as Record<string, unknown>;
        const apiFormat = this.resolveApiFormat(
          modelAny.apiFormat as string | null | undefined,
          model.provider,
        );
        this.cachedConfig = {
          modelId: model.modelId,
          dimensions: model.embeddingDimensions || DEFAULT_EMBEDDING_DIMENSIONS,
          apiKey,
          apiEndpoint: model.apiEndpoint || undefined,
          provider: model.provider,
          apiFormat,
          maxInputTokens: model.maxInputTokens || undefined,
        };
        this.configCacheTime = Date.now();
        this.logger.log(
          `Loaded embedding config from database: ${model.modelId} (${this.cachedConfig.dimensions}D, format=${apiFormat})`,
        );
        return this.cachedConfig;
      }
    }

    // Fallback to environment variable (不推荐，应该在 Admin 中配置)
    const apiKey = this.configService.get<string>("OPENAI_API_KEY")?.trim();
    if (!apiKey) {
      throw new ServiceUnavailableException(
        "No embedding model configured. Please add an EMBEDDING type model in Admin > AI Models, or set OPENAI_API_KEY.",
      );
    }

    this.cachedConfig = {
      modelId: DEFAULT_EMBEDDING_MODEL,
      dimensions: DEFAULT_EMBEDDING_DIMENSIONS,
      apiKey,
      provider: "openai",
      apiFormat: "openai",
    };
    this.configCacheTime = Date.now();
    this.logger.log(
      `Using default embedding config: ${DEFAULT_EMBEDDING_MODEL} (${DEFAULT_EMBEDDING_DIMENSIONS}D)`,
    );
    return this.cachedConfig;
  }

  /**
   * 清除配置缓存
   */
  clearConfigCache(): void {
    this.cachedConfig = null;
    this.configCacheTime = 0;
    this.logger.log("Embedding config cache cleared");
  }

  /**
   * 生成单个文本的嵌入
   */
  async generateEmbedding(text: string): Promise<EmbeddingResult> {
    const result = await this.generateEmbeddings([text]);
    return {
      text,
      embedding: result.embeddings[0],
      tokenCount: result.totalTokens,
    };
  }

  /**
   * 批量生成嵌入
   * ★ 通过 apiFormat 路由到 AiApiCallerService 对应方法
   */
  async generateEmbeddings(texts: string[]): Promise<EmbeddingBatch> {
    if (texts.length === 0) {
      return { texts: [], embeddings: [], totalTokens: 0 };
    }

    const config = await this.getEmbeddingConfig();

    // v5.1 R0.5-E B-#6 (2026-05-05): EMBEDDING_REQUEST hook seam
    //   plugin 可：(a) 缓存命中时 abort 注入 cached 结果；(b) 切换 fallback provider；
    //   (c) 注入测试 fixture（spec/dev）。无 plugin 注册时 zero-cost fast-path。
    if (this.hookBus) {
      const requestPayload = {
        inputs: texts,
        modelId: config.modelId,
        provider: config.provider,
        dimensions: config.dimensions,
      };
      try {
        return await this.hookBus.fire(
          "engine.embedding.request",
          requestPayload,
          () => this.generateEmbeddingsTerminal(texts, config),
        );
      } catch (err) {
        // HookAbortError 携带 cached payload 时，让 plugin 的 abortPayload 直接当结果
        const abortPayload = (err as { abortPayload?: EmbeddingBatch })
          ?.abortPayload;
        if (abortPayload && Array.isArray(abortPayload.embeddings)) {
          return abortPayload;
        }
        throw err;
      }
    }
    return this.generateEmbeddingsTerminal(texts, config);
  }

  /**
   * EMBEDDING_REQUEST hook 包装的实际 terminal —— 原 generateEmbeddings 主体。
   */
  private async generateEmbeddingsTerminal(
    texts: string[],
    config: EmbeddingModelConfig,
  ): Promise<EmbeddingBatch> {
    const allEmbeddings: number[][] = [];
    let totalTokens = 0;

    // Cohere has a lower batch limit (96) than OpenAI/Google (100)
    const batchSize =
      config.apiFormat === "cohere" ? COHERE_MAX_BATCH_SIZE : MAX_BATCH_SIZE;

    // ★ 2026-05-04 熔断器前置检查：circuit open 期间直接 throw，让上游 fallback
    if (this.isCircuitOpen()) {
      throw new Error(
        `Embedding circuit-open (${this.rateLimitFailures.length} recent 429s). Upstream rate-limit cooldown until ${new Date(this.circuitOpenUntil).toISOString()}`,
      );
    }

    // ★ 2026-05-05 P0 修复：401 cooldown 期间直接 throw，不发请求 + 不刷 ERROR
    if (this.isAuthCircuitOpen()) {
      throw new Error(
        `Embedding auth-circuit-open (key invalid). Cooldown until ${new Date(this.authFailedUntil).toISOString()}. Update key in Admin > AI Models.`,
      );
    }

    // Process in batches
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);

      // ★ 2026-05-04 加 retry + 指数退避
      let lastError: unknown;
      let succeeded = false;
      for (
        let attempt = 0;
        attempt < EmbeddingService.RETRY_MAX_ATTEMPTS;
        attempt++
      ) {
        try {
          const result = await this.callEmbeddingAPI(config, batch);
          allEmbeddings.push(...result.embeddings);
          totalTokens += result.totalTokens;
          this.logger.debug(
            `Generated embeddings for batch ${Math.floor(i / batchSize) + 1} using ${config.modelId} (${config.apiFormat} format)${attempt > 0 ? ` (attempt ${attempt + 1})` : ""}`,
          );
          succeeded = true;
          break;
        } catch (error) {
          lastError = error;
          if (this.isRateLimitError(error)) {
            this.recordRateLimitFailure();
            // 熔断打开后立即终止重试链
            if (this.isCircuitOpen()) break;
            if (attempt < EmbeddingService.RETRY_MAX_ATTEMPTS - 1) {
              const delayMs =
                EmbeddingService.RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
              this.logger.warn(
                `[embedding] 429 (attempt ${attempt + 1}/${EmbeddingService.RETRY_MAX_ATTEMPTS}), backing off ${delayMs}ms`,
              );
              await new Promise((r) => setTimeout(r, delayMs));
              continue;
            }
          }
          // ★ 2026-05-05 P0 修复：401 立即触发 auth circuit-break + invalidate
          //   cache。不刷 524 次 ERROR，让 admin 改 key 后下次能立刻生效。
          // ★ 全覆盖审计修 (2026-05-06): 高并发 per-endpoint 去重——
          //   第一次 401 → ERROR；cooldown 期内 → DEBUG 不刷屏；
          //   支持多 provider/baseUrl 各自独立 cooldown。
          if (this.isAuthError(error)) {
            this.authFailedUntil =
              Date.now() + EmbeddingService.AUTH_FAILURE_COOLDOWN_MS;
            this.clearConfigCache();
            if (
              !this.isEndpointAuthCoolingDown(
                config.provider,
                config.apiEndpoint,
              )
            ) {
              // 第一次 401：打 ERROR（运维可见）+ 开始 cooldown
              this.markEndpointAuthFailed(config.provider, config.apiEndpoint);
              this.logger.error(
                `[embedding] 401 auth failed for ${config.modelId} (${config.apiFormat}). ` +
                  `Key invalid or expired. Auth-circuit-open for ${EmbeddingService.AUTH_FAILURE_COOLDOWN_MS / 1000}s. ` +
                  `Update key in Admin > AI Models. Original error: ${error instanceof Error ? error.message : String(error)}`,
              );
            } else {
              // cooldown 期内：降为 DEBUG，不重复刷屏
              this.logger.debug(
                `[embedding] 401 suppressed (within cooldown) for ${config.provider} ${config.apiEndpoint ?? ""}`,
              );
            }
          }
          // 非 429 不重试，直接抛
          break;
        }
      }
      if (!succeeded) {
        // ★ 2026-05-05 P0 修复：401 已经在 catch 内打过 ERROR + 触发 circuit-break，
        //   这里只 debug，避免双重刷屏；其他错误正常 ERROR
        if (this.isAuthError(lastError)) {
          this.logger.debug(
            `[embedding] auth error finalized (already logged once + circuit-open)`,
          );
        } else {
          this.logger.error(
            `Failed to generate embeddings with ${config.modelId} (${config.apiFormat}) after retries: ${lastError}`,
          );
        }
        throw lastError;
      }
    }

    return {
      texts,
      embeddings: allEmbeddings,
      totalTokens,
    };
  }

  /**
   * 根据 apiFormat 路由到对应的 embedding API
   */
  private async callEmbeddingAPI(
    config: EmbeddingModelConfig,
    inputs: string[],
  ) {
    switch (config.apiFormat) {
      case "google":
        return this.aiApiCallerService.callGoogleEmbeddingAPI(
          config.apiEndpoint || "",
          config.apiKey,
          config.modelId,
          inputs,
        );
      case "cohere":
        return this.aiApiCallerService.callCohereEmbeddingAPI(
          config.apiEndpoint || "",
          config.apiKey,
          config.modelId,
          inputs,
        );
      default:
        // openai, xai, deepseek 等都走 OpenAI 兼容格式
        return this.aiApiCallerService.callOpenAICompatibleEmbeddingAPI(
          config.apiEndpoint || "",
          config.apiKey,
          config.modelId,
          inputs,
        );
    }
  }

  /**
   * 获取嵌入维度
   */
  async getDimensions(): Promise<number> {
    const config = await this.getEmbeddingConfig();
    return config.dimensions;
  }

  /**
   * 获取当前模型名称
   */
  async getModel(): Promise<string> {
    const config = await this.getEmbeddingConfig();
    return config.modelId;
  }

  /**
   * 获取配置信息（用于诊断）
   */
  async getConfigInfo(): Promise<{
    modelId: string;
    dimensions: number;
    provider: string;
    apiFormat: string;
    hasApiKey: boolean;
    maxInputTokens?: number;
  }> {
    const config = await this.getEmbeddingConfig();
    return {
      modelId: config.modelId,
      dimensions: config.dimensions,
      provider: config.provider,
      apiFormat: config.apiFormat,
      hasApiKey: !!config.apiKey,
      maxInputTokens: config.maxInputTokens,
    };
  }
}
