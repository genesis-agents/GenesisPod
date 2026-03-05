/**
 * AI Engine - Vector Service
 * 向量存储与相似度搜索服务
 *
 * 使用 pgvector 存储向量，数据库级余弦相似度搜索
 * 支持 HNSW 索引，百万级向量毫秒响应
 */

import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Prisma } from "@prisma/client";
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
export class VectorService implements OnModuleInit {
  private readonly logger = new Logger(VectorService.name);
  private pgvectorAvailable = false;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      await this.prisma.$executeRawUnsafe(
        "CREATE EXTENSION IF NOT EXISTS vector",
      );
      this.pgvectorAvailable = true;
      this.logger.log("[onModuleInit] pgvector extension is ready");
    } catch (error) {
      this.pgvectorAvailable = false;
      this.logger.warn(
        `[onModuleInit] pgvector not available, vector search disabled: ${error}`,
      );
    }
  }

  isPgvectorAvailable(): boolean {
    return this.pgvectorAvailable;
  }

  /**
   * 相似度搜索（使用 pgvector <=> 余弦距离运算符）
   *
   * @param queryEmbedding 查询向量
   * @param options 搜索选项
   * @returns 按相似度降序排列的结果数组
   */
  async similaritySearch(
    queryEmbedding: number[],
    options: SimilaritySearchOptions = {},
  ): Promise<SimilarityResult[]> {
    const { limit = 10, threshold = 0.3, knowledgeBaseIds } = options;

    this.logger.debug(
      `Starting pgvector similarity search: limit=${limit}, threshold=${threshold}, kbIds=${knowledgeBaseIds?.length || "all"}`,
    );

    // Pre-filter: resolve knowledgeBaseIds → documentIds via ORM (indexed column)
    let documentIds: string[] | undefined;
    if (knowledgeBaseIds?.length) {
      const docs = await this.prisma.knowledgeBaseDocument.findMany({
        where: { knowledgeBaseId: { in: knowledgeBaseIds } },
        select: { id: true },
      });
      documentIds = docs.map((d) => d.id);

      if (documentIds.length === 0) {
        this.logger.debug(
          `No documents found for knowledgeBaseIds=${knowledgeBaseIds.join(",")}, returning empty results`,
        );
        return [];
      }
    }

    const vectorStr = `[${queryEmbedding.join(",")}]`;

    interface RawResult {
      child_chunk_id: string;
      parent_chunk_id: string;
      document_id: string;
      content: string;
      parent_content: string;
      score: unknown;
    }

    // 子查询模式：让 HNSW 索引通过 ORDER BY ... LIMIT 找到最近邻，
    // 再在外层过滤阈值，避免 WHERE 子句中重复计算距离影响索引选择
    const docFilter = documentIds?.length
      ? Prisma.sql`AND cc.document_id = ANY(ARRAY[${Prisma.join(documentIds)}]::text[])`
      : Prisma.sql``;

    const results = await this.prisma.$queryRaw<RawResult[]>(Prisma.sql`
      SELECT child_chunk_id, parent_chunk_id, document_id, content, parent_content, score
      FROM (
        SELECT
          ce.child_chunk_id,
          cc.parent_chunk_id,
          cc.document_id,
          cc.content,
          pc.content AS parent_content,
          1 - (ce.embedding <=> ${vectorStr}::vector) AS score
        FROM child_embeddings ce
        JOIN child_chunks cc ON ce.child_chunk_id = cc.id
        JOIN parent_chunks pc ON cc.parent_chunk_id = pc.id
        WHERE true ${docFilter}
        ORDER BY ce.embedding <=> ${vectorStr}::vector
        LIMIT ${limit}
      ) sub
      WHERE score >= ${threshold}
    `);

    this.logger.debug(`pgvector search returned ${results.length} results`);

    return results.map((r) => ({
      childChunkId: r.child_chunk_id,
      parentChunkId: r.parent_chunk_id,
      documentId: r.document_id,
      content: r.content,
      parentContent: r.parent_content,
      similarity: Number(r.score),
    }));
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
    const { limit = 10, threshold = 0.3, knowledgeBaseIds } = options;

    let documentIds: string[] | undefined;
    if (knowledgeBaseIds?.length) {
      const docs = await this.prisma.knowledgeBaseDocument.findMany({
        where: { knowledgeBaseId: { in: knowledgeBaseIds } },
        select: { id: true },
      });
      documentIds = docs.map((d) => d.id);

      if (documentIds.length === 0) {
        this.logger.debug(
          `No documents found for knowledgeBaseIds=${knowledgeBaseIds.join(",")}, returning empty results`,
        );
        return [];
      }
    }

    const vectorStr = `[${queryEmbedding.join(",")}]`;

    interface RawSimpleResult {
      child_chunk_id: string;
      content: string;
      score: unknown;
    }

    const docFilter = documentIds?.length
      ? Prisma.sql`AND cc.document_id = ANY(ARRAY[${Prisma.join(documentIds)}]::text[])`
      : Prisma.sql``;

    const results = await this.prisma.$queryRaw<RawSimpleResult[]>(Prisma.sql`
      SELECT child_chunk_id, content, score
      FROM (
        SELECT
          ce.child_chunk_id,
          cc.content,
          1 - (ce.embedding <=> ${vectorStr}::vector) AS score
        FROM child_embeddings ce
        JOIN child_chunks cc ON ce.child_chunk_id = cc.id
        WHERE true ${docFilter}
        ORDER BY ce.embedding <=> ${vectorStr}::vector
        LIMIT ${limit}
      ) sub
      WHERE score >= ${threshold}
    `);

    return results.map((r) => ({
      chunkId: r.child_chunk_id,
      content: r.content,
      similarity: Number(r.score),
    }));
  }

  /**
   * 存储嵌入（使用 pgvector 格式）
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
    const vectorStr = `[${embedding.join(",")}]`;
    const dimensions = embedding.length;

    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO child_embeddings (id, child_chunk_id, embedding, model, dimensions, created_at, updated_at)
      VALUES (gen_random_uuid(), ${childChunkId}, ${vectorStr}::vector, ${model}, ${dimensions}, NOW(), NOW())
      ON CONFLICT (child_chunk_id) DO UPDATE SET
        embedding = EXCLUDED.embedding,
        model = EXCLUDED.model,
        dimensions = EXCLUDED.dimensions,
        updated_at = NOW()
    `);

    this.logger.debug(
      `Stored pgvector embedding for chunk ${childChunkId}: ${dimensions} dimensions`,
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
