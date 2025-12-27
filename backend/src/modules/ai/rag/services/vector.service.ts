/**
 * VectorService
 *
 * Core vector operations using JSONB storage with application-layer similarity computation.
 * This replaces pgvector dependency for Railway PostgreSQL compatibility.
 */

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";

export interface SimilaritySearchOptions {
  /** Maximum number of results to return (default: 10) */
  limit?: number;
  /** Minimum similarity threshold (default: 0.3) */
  threshold?: number;
  /** Filter by knowledge base IDs */
  knowledgeBaseIds?: string[];
  /** Batch size for processing (default: 1000) */
  batchSize?: number;
}

export interface SimilarityResult {
  childChunkId: string;
  parentChunkId: string;
  documentId: string;
  content: string;
  parentContent: string;
  similarity: number;
}

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
   * Calculate cosine similarity between two vectors
   *
   * @param a First vector (float array)
   * @param b Second vector (float array)
   * @returns Similarity score between 0 and 1
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
   * Perform similarity search using JSONB embeddings
   *
   * @param queryEmbedding Query vector
   * @param options Search options
   * @returns Array of similar results sorted by similarity descending
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
   * Simple vector search without parent chunk expansion
   *
   * @param queryEmbedding Query vector
   * @param options Search options
   * @returns Array of vector search results
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
   * Store embedding for a child chunk using JSONB
   *
   * @param childChunkId ID of the child chunk
   * @param embedding Vector data as float array
   * @param model Model used for embedding generation
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
   * Batch store embeddings for multiple chunks
   *
   * @param items Array of chunk IDs and embeddings
   * @param model Model used for embedding generation
   * @returns Number of embeddings stored
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
   * Delete embedding for a child chunk
   *
   * @param childChunkId ID of the child chunk
   */
  async deleteEmbedding(childChunkId: string): Promise<void> {
    await this.prisma.childEmbedding.delete({
      where: { childChunkId },
    });
  }

  /**
   * Check if embedding exists for a child chunk
   *
   * @param childChunkId ID of the child chunk
   * @returns True if embedding exists
   */
  async hasEmbedding(childChunkId: string): Promise<boolean> {
    const count = await this.prisma.childEmbedding.count({
      where: { childChunkId },
    });
    return count > 0;
  }

  /**
   * Get embedding count for a knowledge base
   *
   * @param knowledgeBaseId Knowledge base ID
   * @returns Number of embeddings
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
