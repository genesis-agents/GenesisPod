/**
 * AI Engine - Embedding Service
 * 通用向量嵌入生成服务
 *
 * 提供:
 * - 多 Provider 支持 (OpenAI, etc.)
 * - 批量嵌入生成
 * - 动态模型配置
 */

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import OpenAI from "openai";

// Default fallback values
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_EMBEDDING_DIMENSIONS = 1536;
const MAX_BATCH_SIZE = 100;

/**
 * Embedding 模型配置
 */
export interface EmbeddingModelConfig {
  modelId: string;
  dimensions: number;
  apiKey: string;
  apiEndpoint?: string;
  provider: string;
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
  private openai: OpenAI | null = null;
  private cachedConfig: EmbeddingModelConfig | null = null;
  private configCacheTime: number = 0;
  private readonly CONFIG_CACHE_TTL = 60000; // 1 minute cache

  constructor(private readonly prisma: PrismaService) {}

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

    if (model && model.apiKey) {
      this.cachedConfig = {
        modelId: model.modelId,
        dimensions: model.embeddingDimensions || DEFAULT_EMBEDDING_DIMENSIONS,
        apiKey: model.apiKey,
        apiEndpoint: model.apiEndpoint || undefined,
        provider: model.provider,
        maxInputTokens: model.maxInputTokens || undefined,
      };
      this.configCacheTime = Date.now();
      this.logger.log(
        `Loaded embedding config from database: ${model.modelId} (${this.cachedConfig.dimensions}D)`,
      );
      return this.cachedConfig;
    }

    // Fallback to environment variable
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "No embedding model configured. Please add an EMBEDDING type model in Admin > AI Models, or set OPENAI_API_KEY.",
      );
    }

    this.cachedConfig = {
      modelId: DEFAULT_EMBEDDING_MODEL,
      dimensions: DEFAULT_EMBEDDING_DIMENSIONS,
      apiKey,
      provider: "openai",
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
    this.openai = null;
    this.logger.log("Embedding config cache cleared");
  }

  /**
   * 获取或初始化 OpenAI 客户端
   */
  private async getOpenAIClient(): Promise<OpenAI> {
    const config = await this.getEmbeddingConfig();

    // Reset client if config changed
    if (this.openai && this.cachedConfig?.apiKey !== config.apiKey) {
      this.openai = null;
    }

    if (this.openai) {
      return this.openai;
    }

    // Initialize OpenAI client with configuration
    const clientConfig: { apiKey: string; baseURL?: string } = {
      apiKey: config.apiKey,
    };

    if (config.apiEndpoint) {
      // Sanitize the base URL
      let baseURL = config.apiEndpoint;
      if (baseURL.endsWith("/embeddings")) {
        baseURL = baseURL.slice(0, -"/embeddings".length);
        this.logger.warn(
          `Sanitized embedding endpoint: removed trailing /embeddings from ${config.apiEndpoint}`,
        );
      }
      baseURL = baseURL.replace(/\/+$/, "");
      clientConfig.baseURL = baseURL;
    }

    this.openai = new OpenAI(clientConfig);
    return this.openai;
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
   */
  async generateEmbeddings(texts: string[]): Promise<EmbeddingBatch> {
    if (texts.length === 0) {
      return { texts: [], embeddings: [], totalTokens: 0 };
    }

    const config = await this.getEmbeddingConfig();
    const openai = await this.getOpenAIClient();
    const allEmbeddings: number[][] = [];
    let totalTokens = 0;

    // Process in batches
    for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
      const batch = texts.slice(i, i + MAX_BATCH_SIZE);

      try {
        const response = await openai.embeddings.create({
          model: config.modelId,
          input: batch,
        });

        for (const item of response.data) {
          allEmbeddings.push(item.embedding);
        }

        totalTokens += response.usage?.total_tokens || 0;

        this.logger.debug(
          `Generated embeddings for batch ${Math.floor(i / MAX_BATCH_SIZE) + 1} using ${config.modelId}`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to generate embeddings with ${config.modelId}: ${error}`,
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
    hasApiKey: boolean;
    maxInputTokens?: number;
  }> {
    const config = await this.getEmbeddingConfig();
    return {
      modelId: config.modelId,
      dimensions: config.dimensions,
      provider: config.provider,
      hasApiKey: !!config.apiKey,
      maxInputTokens: config.maxInputTokens,
    };
  }
}
