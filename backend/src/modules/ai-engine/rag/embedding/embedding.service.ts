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

  constructor(
    private readonly prisma: PrismaService,
    private readonly secretsService: SecretsService,
    private readonly aiApiCallerService: AiApiCallerService,
    private readonly configService: ConfigService,
  ) {}

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
    const allEmbeddings: number[][] = [];
    let totalTokens = 0;

    // Cohere has a lower batch limit (96) than OpenAI/Google (100)
    const batchSize =
      config.apiFormat === "cohere" ? COHERE_MAX_BATCH_SIZE : MAX_BATCH_SIZE;

    // Process in batches
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);

      try {
        const result = await this.callEmbeddingAPI(config, batch);
        allEmbeddings.push(...result.embeddings);
        totalTokens += result.totalTokens;

        this.logger.debug(
          `Generated embeddings for batch ${Math.floor(i / batchSize) + 1} using ${config.modelId} (${config.apiFormat} format)`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to generate embeddings with ${config.modelId} (${config.apiFormat}): ${error}`,
        );
        throw error;
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
