/**
 * Embedding Service
 * Generates and manages vector embeddings using configurable embedding models
 *
 * Features:
 * - Dynamic model configuration from database (Admin > AI Models > EMBEDDING type)
 * - Batch embedding generation for efficiency
 * - Automatic token counting
 * - Direct pgvector storage via raw SQL
 * - Support for multiple embedding providers (OpenAI, etc.)
 */

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { AdminService } from "../../../core/admin/admin.service";
import { EmbeddingResult, EmbeddingBatch } from "../interfaces/rag.interfaces";
import OpenAI from "openai";

// Default fallback values (used if no EMBEDDING model configured in database)
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_EMBEDDING_DIMENSIONS = 1536;
const MAX_BATCH_SIZE = 100; // OpenAI allows up to 2048 inputs per request

export interface EmbeddingModelConfig {
  modelId: string;
  dimensions: number;
  apiKey: string;
  apiEndpoint?: string;
  provider: string;
  maxInputTokens?: number;
}

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private openai: OpenAI | null = null;
  private cachedConfig: EmbeddingModelConfig | null = null;
  private configCacheTime: number = 0;
  private readonly CONFIG_CACHE_TTL = 60000; // 1 minute cache

  constructor(
    private readonly prisma: PrismaService,
    private readonly adminService: AdminService,
  ) {}

  /**
   * Load embedding model configuration from database
   * Uses AIModel with modelType = EMBEDDING
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
    const model = await this.adminService.getDefaultModelByTypeInternal(
      "EMBEDDING" as any,
    );

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

    // Fallback to OpenAI API key from settings
    const apiKey = await this.adminService.getOpenAIApiKey();
    if (!apiKey) {
      throw new Error(
        "No embedding model configured. Please add an EMBEDDING type model in Admin > AI Models, or configure OpenAI API key.",
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
   * Clear the cached configuration (call after model update)
   */
  clearConfigCache(): void {
    this.cachedConfig = null;
    this.configCacheTime = 0;
    this.openai = null;
    this.logger.log("Embedding config cache cleared");
  }

  /**
   * Get or initialize OpenAI client
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
    const clientConfig: any = { apiKey: config.apiKey };
    if (config.apiEndpoint) {
      clientConfig.baseURL = config.apiEndpoint;
    }

    this.openai = new OpenAI(clientConfig);
    return this.openai;
  }

  /**
   * Generate embedding for a single text
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
   * Generate embeddings for multiple texts in batches
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
   * Generate embeddings for child chunks and save to database
   */
  async generateAndSaveEmbeddings(
    documentId: string,
    _knowledgeBaseId: string,
  ): Promise<number> {
    // Get config first to get model and dimensions
    const config = await this.getEmbeddingConfig();

    // Get all child chunks for this document that don't have embeddings
    const childChunks = await this.prisma.childChunk.findMany({
      where: {
        parentChunk: {
          documentId,
        },
        embeddings: {
          none: {},
        },
      },
      include: {
        parentChunk: true,
      },
    });

    if (childChunks.length === 0) {
      this.logger.log(`No chunks to embed for document ${documentId}`);
      return 0;
    }

    this.logger.log(
      `Generating embeddings for ${childChunks.length} chunks in document ${documentId} using ${config.modelId}`,
    );

    // Generate embeddings in batches
    const texts = childChunks.map((chunk) => chunk.content);
    const batch = await this.generateEmbeddings(texts);

    // Save embeddings using raw SQL for pgvector
    for (let i = 0; i < childChunks.length; i++) {
      const chunk = childChunks[i];
      const embedding = batch.embeddings[i];

      // Use raw SQL to insert embedding with pgvector
      const embeddingStr = `[${embedding.join(",")}]`;

      await this.prisma.$executeRaw`
        INSERT INTO child_embeddings (id, child_chunk_id, embedding, model, dimensions, created_at, updated_at)
        VALUES (
          gen_random_uuid(),
          ${chunk.id}::uuid,
          ${embeddingStr}::vector,
          ${config.modelId},
          ${config.dimensions},
          NOW(),
          NOW()
        )
      `;
    }

    this.logger.log(
      `Saved ${childChunks.length} embeddings for document ${documentId} using ${config.modelId}`,
    );

    return childChunks.length;
  }

  /**
   * Generate embeddings for all documents in a knowledge base
   */
  async generateEmbeddingsForKnowledgeBase(
    knowledgeBaseId: string,
  ): Promise<number> {
    const documents = await this.prisma.knowledgeBaseDocument.findMany({
      where: {
        knowledgeBaseId,
        status: "READY",
      },
      select: {
        id: true,
      },
    });

    this.logger.log(
      `Generating embeddings for ${documents.length} documents in KB ${knowledgeBaseId}`,
    );

    let totalEmbeddings = 0;

    for (const doc of documents) {
      try {
        const count = await this.generateAndSaveEmbeddings(
          doc.id,
          knowledgeBaseId,
        );
        totalEmbeddings += count;
      } catch (error) {
        this.logger.error(
          `Failed to generate embeddings for document ${doc.id}: ${error}`,
        );
      }
    }

    return totalEmbeddings;
  }

  /**
   * Get embedding dimensions (async - loads from config)
   */
  async getDimensions(): Promise<number> {
    const config = await this.getEmbeddingConfig();
    return config.dimensions;
  }

  /**
   * Get embedding model name (async - loads from config)
   */
  async getModel(): Promise<string> {
    const config = await this.getEmbeddingConfig();
    return config.modelId;
  }

  /**
   * Get current embedding configuration info (for diagnostics/admin)
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
