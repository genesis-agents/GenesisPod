/**
 * AI Engine - Vector Service
 * 向量存储与相似度搜索服务
 *
 * 使用 JSONB 存储向量，应用层计算相似度
 * 兼容 Railway PostgreSQL（无需 pgvector 扩展）
 */

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";

/**
 * 相似度搜索选项
 */
export interface SimilaritySearchOptions {
  /** 最大返回数量 (默认: 10) */
  limit?: number;
  /** 最小相似度阈值 (默认: 0.3) */
  threshold?: number;
  /** 按知识库 ID 过滤 */
  knowledgeBaseIds?: string[];
  /** 批处理大小 (默认: 1000) */
  batchSize?: number;
}

/**
 * 相似度搜索结果
 */
export interface SimilarityResult {
  childChunkId: string;
  parentChunkId: string;
  documentId: string;
  content: string;
  parentContent: string;
  similarity: number;
}

/**
 * 向量搜索结果（简化版）
 */
export interface VectorSearchResult {
  chunkId: string;
  content: string;
  similarity: number;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class VectorService {
  private readonly logger = new Logger(VectorService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 计算两个向量的余弦相似度
   *
   * @param a 第一个向量
   * @param b 第二个向量
   * @returns 相似度分数 (0-1)
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (!a || !b || a.length !== b.length || a.length === 0) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }

  /**
   * 相似度搜索（使用 JSONB 嵌入）
   *
   * @param queryEmbedding 查询向量
   * @param options 搜索选项
   * @returns 按相似度降序排列的结果数组
   */
  async similaritySearch(
    queryEmbedding: number[],
    options: SimilaritySearchOptions = {},
  ): Promise<SimilarityResult[]> {
    const {
      limit = 10,
      threshold = 0.3,
      knowledgeBaseIds,
      batchSize = 1000,
    } = options;

    this.logger.debug(
      `Starting similarity search: limit=${limit}, threshold=${threshold}, kbIds=${knowledgeBaseIds?.length || "all"}`,
    );

    // Build where clause for knowledge base filtering
    const whereClause = knowledgeBaseIds?.length
      ? {
          childChunk: {
            parentChunk: {
              document: {
                knowledgeBaseId: { in: knowledgeBaseIds },
              },
            },
          },
        }
      : {};

    // Fetch and process embeddings in batches
    const results: SimilarityResult[] = [];
    let offset = 0;
    let totalProcessed = 0;

    while (true) {
      const embeddings = await this.prisma.childEmbedding.findMany({
        where: whereClause,
        skip: offset,
        take: batchSize,
        select: {
          childChunkId: true,
          embedding: true,
          childChunk: {
            select: {
              content: true,
              parentChunkId: true,
              parentChunk: {
                select: {
                  content: true,
                  documentId: true,
                },
              },
            },
          },
        },
      });

      if (embeddings.length === 0) break;

      for (const e of embeddings) {
        const storedVector = e.embedding as number[];
        if (
          !storedVector ||
          !Array.isArray(storedVector) ||
          storedVector.length === 0
        )
          continue;

        const similarity = this.cosineSimilarity(queryEmbedding, storedVector);

        if (similarity >= threshold) {
          results.push({
            childChunkId: e.childChunkId,
            parentChunkId: e.childChunk.parentChunkId,
            documentId: e.childChunk.parentChunk.documentId,
            content: e.childChunk.content,
            parentContent: e.childChunk.parentChunk.content,
            similarity,
          });
        }
      }

      totalProcessed += embeddings.length;
      offset += batchSize;

      // Early exit if we have enough high-quality results
      if (results.length >= limit * 3) break;
    }

    this.logger.debug(
      `Processed ${totalProcessed} embeddings, found ${results.length} matches above threshold`,
    );

    // Sort by similarity descending and limit
    return results.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
  }

  /**
   * 简单向量搜索（不展开父块）
   *
   * @param queryEmbedding 查询向量
   * @param options 搜索选项
   * @returns 向量搜索结果数组
   */
  async vectorSearch(
    queryEmbedding: number[],
    options: SimilaritySearchOptions = {},
  ): Promise<VectorSearchResult[]> {
    const {
      limit = 10,
      threshold = 0.3,
      knowledgeBaseIds,
      batchSize = 1000,
    } = options;

    const whereClause = knowledgeBaseIds?.length
      ? {
          childChunk: {
            parentChunk: {
              document: {
                knowledgeBaseId: { in: knowledgeBaseIds },
              },
            },
          },
        }
      : {};

    const results: VectorSearchResult[] = [];
    let offset = 0;

    while (true) {
      const embeddings = await this.prisma.childEmbedding.findMany({
        where: whereClause,
        skip: offset,
        take: batchSize,
        include: {
          childChunk: {
            select: {
              id: true,
              content: true,
            },
          },
        },
      });

      if (embeddings.length === 0) break;

      for (const e of embeddings) {
        const storedVector = e.embedding as number[];
        if (!storedVector || storedVector.length === 0) continue;

        const similarity = this.cosineSimilarity(queryEmbedding, storedVector);

        if (similarity >= threshold) {
          results.push({
            chunkId: e.childChunkId,
            content: e.childChunk.content,
            similarity,
          });
        }
      }

      offset += batchSize;
      if (results.length >= limit * 3) break;
    }

    return results.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
  }

  /**
   * 存储嵌入
   *
   * @param childChunkId 子块 ID
   * @param embedding 向量数据
   * @param model 使用的模型名称
   */
  async storeEmbedding(
    childChunkId: string,
    embedding: number[],
    model: string = "text-embedding-3-small",
  ): Promise<void> {
    await this.prisma.childEmbedding.upsert({
      where: { childChunkId },
      create: {
        childChunkId,
        embedding,
        model,
        dimensions: embedding.length,
      },
      update: {
        embedding,
        model,
        dimensions: embedding.length,
      },
    });

    this.logger.debug(
      `Stored embedding for chunk ${childChunkId}: ${embedding.length} dimensions`,
    );
  }

  /**
   * 批量存储嵌入
   *
   * @param items 块 ID 和嵌入数组
   * @param model 使用的模型名称
   * @returns 存储数量
   */
  async batchStoreEmbeddings(
    items: Array<{ childChunkId: string; embedding: number[] }>,
    model: string = "text-embedding-3-small",
  ): Promise<number> {
    let stored = 0;

    for (const item of items) {
      try {
        await this.storeEmbedding(item.childChunkId, item.embedding, model);
        stored++;
      } catch (error) {
        this.logger.error(
          `Failed to store embedding for chunk ${item.childChunkId}:`,
          error,
        );
      }
    }

    this.logger.log(`Batch stored ${stored}/${items.length} embeddings`);
    return stored;
  }

  /**
   * 删除嵌入
   *
   * @param childChunkId 子块 ID
   */
  async deleteEmbedding(childChunkId: string): Promise<void> {
    await this.prisma.childEmbedding.delete({
      where: { childChunkId },
    });
  }

  /**
   * 检查嵌入是否存在
   *
   * @param childChunkId 子块 ID
   * @returns 是否存在
   */
  async hasEmbedding(childChunkId: string): Promise<boolean> {
    const count = await this.prisma.childEmbedding.count({
      where: { childChunkId },
    });
    return count > 0;
  }

  /**
   * 获取知识库的嵌入数量
   *
   * @param knowledgeBaseId 知识库 ID
   * @returns 嵌入数量
   */
  async getEmbeddingCount(knowledgeBaseId: string): Promise<number> {
    return this.prisma.childEmbedding.count({
      where: {
        childChunk: {
          parentChunk: {
            document: {
              knowledgeBaseId,
            },
          },
        },
      },
    });
  }
}
