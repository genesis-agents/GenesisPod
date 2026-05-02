/**
 * AI Engine - Vector Service
 * 向量存储与相似度搜索服务
 *
 * 双模式运行：
 * - pgvector 可用时：数据库级余弦距离（<=> 运算符 + HNSW 索引）
 * - pgvector 不可用时：JSONB 存储 + 应用层余弦相似度计算
 *
 * Railway PostgreSQL 不支持 pgvector 扩展，自动降级为 JSONB 模式
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
      // ★ 先 SELECT 预检：Postgres 是否安装了 pgvector 扩展。
      //   不预检直接 CREATE EXTENSION 会让 Postgres 留 ERROR 日志（即使
      //   应用层 catch 住）。预检走 information_schema 不会留错误日志。
      const available = await this.prisma.$queryRawUnsafe<
        Array<{ exists: boolean }>
      >(
        "SELECT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') AS exists",
      );
      const hasVector = available?.[0]?.exists === true;
      if (!hasVector) {
        this.pgvectorAvailable = false;
        this.logger.log(
          "[onModuleInit] pgvector not installed on this Postgres, using JSONB fallback with app-level cosine similarity",
        );
        return;
      }

      // 预检通过才尝试创建扩展（生产数据库通常需要 superuser 创建）
      await this.prisma.$executeRawUnsafe(
        "CREATE EXTENSION IF NOT EXISTS vector",
      );
      this.pgvectorAvailable = true;
      this.logger.log("[onModuleInit] pgvector extension is ready");
    } catch (err) {
      this.pgvectorAvailable = false;
      this.logger.log(
        `[onModuleInit] pgvector unavailable (${err instanceof Error ? err.message : String(err)}), falling back to JSONB + app-level cosine similarity`,
      );
    }
  }

  isPgvectorAvailable(): boolean {
    return this.pgvectorAvailable;
  }

  /**
   * 余弦相似度计算（应用层）
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }

  /**
   * 相似度搜索
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
      `Starting similarity search: limit=${limit}, threshold=${threshold}, kbIds=${knowledgeBaseIds?.length || "all"}, mode=${this.pgvectorAvailable ? "pgvector" : "jsonb"}`,
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

    if (this.pgvectorAvailable) {
      return this.similaritySearchPgvector(
        queryEmbedding,
        limit,
        threshold,
        documentIds,
      );
    }
    return this.similaritySearchJsonb(
      queryEmbedding,
      limit,
      threshold,
      documentIds,
    );
  }

  /**
   * pgvector 模式：数据库级余弦距离搜索
   */
  private async similaritySearchPgvector(
    queryEmbedding: number[],
    limit: number,
    threshold: number,
    documentIds?: string[],
  ): Promise<SimilarityResult[]> {
    const vectorStr = `[${queryEmbedding.join(",")}]`;

    interface RawResult {
      child_chunk_id: string;
      parent_chunk_id: string;
      document_id: string;
      content: string;
      parent_content: string;
      score: unknown;
    }

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
   * JSONB 降级模式：获取全部嵌入，应用层计算余弦相似度
   */
  private async similaritySearchJsonb(
    queryEmbedding: number[],
    limit: number,
    threshold: number,
    documentIds?: string[],
  ): Promise<SimilarityResult[]> {
    interface RawJsonbResult {
      child_chunk_id: string;
      parent_chunk_id: string;
      document_id: string;
      content: string;
      parent_content: string;
      embedding: number[];
    }

    const docFilter = documentIds?.length
      ? Prisma.sql`AND cc.document_id = ANY(ARRAY[${Prisma.join(documentIds)}]::text[])`
      : Prisma.sql``;

    const rows = await this.prisma.$queryRaw<RawJsonbResult[]>(Prisma.sql`
      SELECT
        ce.child_chunk_id,
        cc.parent_chunk_id,
        cc.document_id,
        cc.content,
        pc.content AS parent_content,
        ce.embedding
      FROM child_embeddings ce
      JOIN child_chunks cc ON ce.child_chunk_id = cc.id
      JOIN parent_chunks pc ON cc.parent_chunk_id = pc.id
      WHERE ce.embedding IS NOT NULL ${docFilter}
    `);

    this.logger.debug(
      `JSONB fallback: fetched ${rows.length} embeddings, computing cosine similarity`,
    );

    return rows
      .map((r) => ({
        childChunkId: r.child_chunk_id,
        parentChunkId: r.parent_chunk_id,
        documentId: r.document_id,
        content: r.content,
        parentContent: r.parent_content,
        similarity: this.cosineSimilarity(queryEmbedding, r.embedding),
      }))
      .filter((r) => r.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
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

    if (this.pgvectorAvailable) {
      return this.vectorSearchPgvector(
        queryEmbedding,
        limit,
        threshold,
        documentIds,
      );
    }
    return this.vectorSearchJsonb(
      queryEmbedding,
      limit,
      threshold,
      documentIds,
    );
  }

  /**
   * pgvector 模式简单搜索
   */
  private async vectorSearchPgvector(
    queryEmbedding: number[],
    limit: number,
    threshold: number,
    documentIds?: string[],
  ): Promise<VectorSearchResult[]> {
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
   * JSONB 降级模式简单搜索
   */
  private async vectorSearchJsonb(
    queryEmbedding: number[],
    limit: number,
    threshold: number,
    documentIds?: string[],
  ): Promise<VectorSearchResult[]> {
    interface RawJsonbSimple {
      child_chunk_id: string;
      content: string;
      embedding: number[];
    }

    const docFilter = documentIds?.length
      ? Prisma.sql`AND cc.document_id = ANY(ARRAY[${Prisma.join(documentIds)}]::text[])`
      : Prisma.sql``;

    const rows = await this.prisma.$queryRaw<RawJsonbSimple[]>(Prisma.sql`
      SELECT
        ce.child_chunk_id,
        cc.content,
        ce.embedding
      FROM child_embeddings ce
      JOIN child_chunks cc ON ce.child_chunk_id = cc.id
      WHERE ce.embedding IS NOT NULL ${docFilter}
    `);

    return rows
      .map((r) => ({
        chunkId: r.child_chunk_id,
        content: r.content,
        similarity: this.cosineSimilarity(queryEmbedding, r.embedding),
      }))
      .filter((r) => r.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  /**
   * 存储嵌入
   *
   * @param childChunkId 子块 ID
   * @param embedding 向量数据
   * @param model 使用的模型名称（必填 — 之前默认 "text-embedding-3-small"
   *   会在调用方漏传时把真实由 Gemini/Cohere 生成的向量错误标记为 OpenAI，
   *   破坏 embedding 表的数据完整性。调用方必须传入实际使用的模型名。）
   */
  async storeEmbedding(
    childChunkId: string,
    embedding: number[],
    model: string,
  ): Promise<void> {
    const dimensions = embedding.length;

    if (this.pgvectorAvailable) {
      const vectorStr = `[${embedding.join(",")}]`;
      await this.prisma.$executeRaw(Prisma.sql`
        INSERT INTO child_embeddings (id, child_chunk_id, embedding, model, dimensions, created_at, updated_at)
        VALUES (gen_random_uuid(), ${childChunkId}, ${vectorStr}::vector, ${model}, ${dimensions}, NOW(), NOW())
        ON CONFLICT (child_chunk_id) DO UPDATE SET
          embedding = EXCLUDED.embedding,
          model = EXCLUDED.model,
          dimensions = EXCLUDED.dimensions,
          updated_at = NOW()
      `);
    } else {
      const jsonStr = JSON.stringify(embedding);
      await this.prisma.$executeRaw(Prisma.sql`
        INSERT INTO child_embeddings (id, child_chunk_id, embedding, model, dimensions, created_at, updated_at)
        VALUES (gen_random_uuid(), ${childChunkId}, ${jsonStr}::jsonb, ${model}, ${dimensions}, NOW(), NOW())
        ON CONFLICT (child_chunk_id) DO UPDATE SET
          embedding = EXCLUDED.embedding,
          model = EXCLUDED.model,
          dimensions = EXCLUDED.dimensions,
          updated_at = NOW()
      `);
    }

    this.logger.debug(
      `Stored embedding for chunk ${childChunkId}: ${dimensions} dimensions (${this.pgvectorAvailable ? "pgvector" : "jsonb"})`,
    );
  }

  /**
   * 批量存储嵌入
   *
   * @param items 块 ID 和嵌入数组
   * @param model 使用的模型名称（必填 — 参见 storeEmbedding 注释）
   * @returns 存储数量
   */
  async batchStoreEmbeddings(
    items: Array<{ childChunkId: string; embedding: number[] }>,
    model: string,
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
