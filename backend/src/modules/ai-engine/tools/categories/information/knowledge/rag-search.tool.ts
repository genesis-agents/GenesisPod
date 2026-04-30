/**
 * RAG Search Tool
 * 向量检索工具 - 基于语义相似度搜索知识库内容
 */

import { Injectable, Logger } from "@nestjs/common";
import { BaseTool } from "../../../base/base-tool";
import {
  ToolContext,
  JSONSchema,
  ToolCategory,
} from "../../../abstractions/tool.interface";

import { PrismaService } from "@/common/prisma/prisma.service";
import { EmbeddingService } from "@/modules/ai-engine/knowledge/rag/embedding/embedding.service";

// ============================================================================
// Types
// ============================================================================

/**
 * RAG 搜索输入参数
 */
export interface RAGSearchInput {
  /**
   * 搜索查询文本
   */
  query: string;

  /**
   * 集合ID（可选）- 限定搜索范围
   */
  collectionId?: string;

  /**
   * 资源ID列表（可选）- 限定在特定资源内搜索
   */
  resourceIds?: string[];

  /**
   * 返回结果数量，默认 5，最大 20
   */
  topK?: number;

  /**
   * 相似度阈值（0-1），低于此值的结果将被过滤
   */
  threshold?: number;

  /**
   * 额外的过滤条件
   */
  filters?: {
    /**
     * 资源类型过滤
     */
    resourceTypes?: string[];

    /**
     * 日期范围过滤
     */
    dateRange?: {
      start?: string;
      end?: string;
    };

    /**
     * 标签过滤
     */
    tags?: string[];
  };
}

/**
 * RAG 搜索结果项
 */
export interface RAGSearchResultItem {
  /**
   * 资源ID
   */
  resourceId: string;

  /**
   * 文本块ID
   */
  chunkId: string;

  /**
   * 文本内容
   */
  content: string;

  /**
   * 相似度分数（0-1）
   */
  score: number;

  /**
   * 元数据
   */
  metadata: {
    /**
     * 资源标题
     */
    title?: string;

    /**
     * 资源类型
     */
    type?: string;

    /**
     * 来源URL
     */
    sourceUrl?: string;

    /**
     * 发布时间
     */
    publishedAt?: string;

    /**
     * 作者
     */
    authors?: string[];

    /**
     * 在文档中的位置
     */
    position?: number;

    /**
     * 其他自定义字段
     */
    [key: string]: unknown;
  };
}

/**
 * RAG 搜索输出结果
 */
export interface RAGSearchOutput {
  /**
   * 搜索结果列表
   */
  results: RAGSearchResultItem[];

  /**
   * 搜索是否成功
   */
  success: boolean;

  /**
   * 结果总数
   */
  totalResults: number;

  /**
   * 查询向量的维度信息（用于调试）
   */
  embeddingDimension?: number;

  /**
   * 失败时的明细原因（success=false 时）
   * ★ 例如 "RAG unavailable: chunks/embeddings tables not found (pgvector not configured)"
   */
  error?: string;
}

// ============================================================================
// Tool Implementation
// ============================================================================

/**
 * RAG 向量检索工具
 *
 * 状态：NOT_READY — 依赖 pgvector 扩展及 chunks/embeddings 表，
 * 当前 Railway PostgreSQL 不支持 pgvector，相关表未创建。
 * 工具已注册（writing/research 按 toolId 引用），但执行时会返回空结果。
 *
 * 功能（pgvector 就绪后可用）：
 * - 使用 OpenAI text-embedding-3-small 生成查询向量
 * - 基于 pgvector 进行向量相似度搜索
 * - 支持多种过滤条件
 * - 返回语义相关的文本块
 */
@Injectable()
export class RAGSearchTool extends BaseTool<RAGSearchInput, RAGSearchOutput> {
  private readonly logger = new Logger(RAGSearchTool.name);
  readonly id = "rag-search";
  readonly category: ToolCategory = "information";
  readonly tags = ["knowledge", "rag", "vector", "internal", "embedding"];
  readonly name = "向量检索";
  readonly description =
    "在知识库中进行语义搜索，返回与查询最相关的文档片段。适用于需要从已保存的资源中查找信息的场景。支持按集合、资源、类型等条件过滤。";

  readonly inputSchema: JSONSchema = {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "搜索查询文本，描述你想要查找的信息",
      },
      collectionId: {
        type: "string",
        description: "可选：集合ID，限定在特定集合内搜索",
      },
      resourceIds: {
        type: "array",
        description: "可选：资源ID列表，限定在特定资源内搜索",
        items: { type: "string" },
      },
      topK: {
        type: "number",
        description: "返回结果数量，默认 5，最大 20",
        default: 5,
      },
      threshold: {
        type: "number",
        description: "相似度阈值（0-1），低于此值的结果将被过滤，默认 0.7",
        default: 0.7,
      },
      filters: {
        type: "object",
        description: "额外的过滤条件",
        properties: {
          resourceTypes: {
            type: "array",
            description: "资源类型过滤，如 ['PAPER', 'BLOG']",
            items: { type: "string" },
          },
          dateRange: {
            type: "object",
            description: "日期范围过滤",
            properties: {
              start: { type: "string", description: "开始日期 (ISO 8601)" },
              end: { type: "string", description: "结束日期 (ISO 8601)" },
            },
          },
          tags: {
            type: "array",
            description: "标签过滤",
            items: { type: "string" },
          },
        },
      },
    },
    required: ["query"],
  };

  readonly outputSchema: JSONSchema = {
    type: "object",
    properties: {
      results: {
        type: "array",
        description: "搜索结果列表",
        items: {
          type: "object",
          properties: {
            resourceId: { type: "string", description: "资源ID" },
            chunkId: { type: "string", description: "文本块ID" },
            content: { type: "string", description: "文本内容" },
            score: { type: "number", description: "相似度分数（0-1）" },
            metadata: {
              type: "object",
              description: "元数据信息",
              properties: {
                title: { type: "string", description: "资源标题" },
                type: { type: "string", description: "资源类型" },
                sourceUrl: { type: "string", description: "来源URL" },
                publishedAt: { type: "string", description: "发布时间" },
                authors: {
                  type: "array",
                  description: "作者列表",
                  items: { type: "string" },
                },
                position: { type: "number", description: "在文档中的位置" },
              },
            },
          },
        },
      },
      success: { type: "boolean", description: "搜索是否成功" },
      totalResults: { type: "number", description: "返回的结果数量" },
      embeddingDimension: {
        type: "number",
        description: "查询向量的维度（调试用）",
      },
    },
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingService: EmbeddingService,
  ) {
    super();
    // defaultTimeout set in class property // 30 秒超时
  }

  /**
   * 验证输入参数
   */
  validateInput(input: RAGSearchInput) {
    // 验证查询文本
    if (!input.query || typeof input.query !== "string") {
      this.logger.error("Invalid query: must be a non-empty string");
      return false;
    }

    if (input.query.trim().length === 0) {
      this.logger.error("Invalid query: query is empty");
      return false;
    }

    if (input.query.length > 2000) {
      this.logger.error("Invalid query: query too long (max 2000 characters)");
      return false;
    }

    // 验证 topK
    if (input.topK !== undefined) {
      if (typeof input.topK !== "number" || input.topK < 1 || input.topK > 20) {
        this.logger.error("Invalid topK: must be between 1 and 20");
        return false;
      }
    }

    // 验证 threshold
    if (input.threshold !== undefined) {
      if (
        typeof input.threshold !== "number" ||
        input.threshold < 0 ||
        input.threshold > 1
      ) {
        this.logger.error("Invalid threshold: must be between 0 and 1");
        return false;
      }
    }

    // 验证 resourceIds
    if (input.resourceIds !== undefined) {
      if (!Array.isArray(input.resourceIds)) {
        this.logger.error("Invalid resourceIds: must be an array");
        return false;
      }

      if (input.resourceIds.length > 50) {
        this.logger.error("Invalid resourceIds: too many resources (max 50)");
        return false;
      }
    }

    return true;
  }

  /**
   * 执行 RAG 搜索
   */
  protected async doExecute(
    input: RAGSearchInput,
    context: ToolContext,
  ): Promise<RAGSearchOutput> {
    const {
      query,
      topK = 5,
      threshold = 0.7,
      collectionId,
      resourceIds,
      filters,
    } = input;

    // Guard: pgvector + chunks/embeddings tables not available yet
    const tablesExist = await this.checkTablesExist();
    if (!tablesExist) {
      this.logger.warn(
        "RAG search skipped: chunks/embeddings tables do not exist (pgvector not available)",
      );
      return {
        results: [],
        success: false,
        totalResults: 0,
        error:
          "RAG unavailable: chunks/embeddings tables not found (pgvector not configured on this database)",
      };
    }

    this.logger.log(`RAG search query: "${query.substring(0, 100)}..."`);

    try {
      // 步骤 1: 生成查询向量
      const queryEmbedding = await this.generateEmbedding(query);
      const embeddingDimension = queryEmbedding.length;

      this.logger.debug(
        `Generated embedding with dimension: ${embeddingDimension}`,
      );

      // 步骤 2: 执行向量相似度搜索
      const results = await this.searchSimilarChunks({
        queryEmbedding,
        topK,
        threshold,
        collectionId,
        resourceIds,
        filters,
        userId: context.userId,
        workspaceId: context.sessionId,
      });

      this.logger.log(
        `Found ${results.length} results above threshold ${threshold}`,
      );

      return {
        results,
        success: true,
        totalResults: results.length,
        embeddingDimension,
      };
    } catch (error) {
      this.logger.error(
        `RAG search failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  private tablesExistCache: boolean | null = null;

  private async checkTablesExist(): Promise<boolean> {
    if (this.tablesExistCache !== null) return this.tablesExistCache;
    try {
      const rows = await this.prisma.$queryRawUnsafe<{ cnt: bigint }[]>(
        `SELECT COUNT(*)::bigint AS cnt FROM information_schema.tables WHERE table_name IN ('chunks', 'embeddings')`,
      );
      this.tablesExistCache = rows.length > 0 && Number(rows[0].cnt) === 2;
    } catch {
      this.tablesExistCache = false;
    }
    return this.tablesExistCache;
  }

  /**
   * 生成文本的向量表示
   *
   * 使用 OpenAI text-embedding-3-small 模型
   * - 维度: 1536
   * - 成本低
   * - 速度快
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      // 使用 EmbeddingService，支持数据库配置和 Secret Manager
      const result = await this.embeddingService.generateEmbedding(text);
      return result.embedding;
    } catch (error) {
      this.logger.error(
        `Failed to generate embedding: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new Error(
        `Embedding generation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * 执行向量相似度搜索
   *
   * 注意：此方法需要数据库支持以下内容：
   * 1. pgvector 扩展
   * 2. Chunk 表 - 存储文本块
   * 3. Embedding 表 - 存储向量
   * 4. 向量索引 - 加速搜索
   *
   * 数据库迁移参考：
   * ```sql
   * -- 启用 pgvector 扩展
   * CREATE EXTENSION IF NOT EXISTS vector;
   *
   * -- 创建文本块表
   * CREATE TABLE chunks (
   *   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
   *   resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
   *   content TEXT NOT NULL,
   *   position INT NOT NULL,
   *   metadata JSONB DEFAULT '{}',
   *   created_at TIMESTAMP DEFAULT NOW()
   * );
   *
   * -- 创建向量表
   * CREATE TABLE embeddings (
   *   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
   *   chunk_id UUID NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
   *   vector vector(1536) NOT NULL,
   *   model VARCHAR(50) DEFAULT 'text-embedding-3-small',
   *   created_at TIMESTAMP DEFAULT NOW()
   * );
   *
   * -- 创建向量索引（加速搜索）
   * CREATE INDEX embeddings_vector_idx ON embeddings
   * USING ivfflat (vector vector_cosine_ops)
   * WITH (lists = 100);
   * ```
   */
  private async searchSimilarChunks(params: {
    queryEmbedding: number[];
    topK: number;
    threshold: number;
    collectionId?: string;
    resourceIds?: string[];
    filters?: RAGSearchInput["filters"];
    userId?: string;
    workspaceId?: string;
  }): Promise<RAGSearchResultItem[]> {
    const {
      queryEmbedding,
      topK,
      threshold,
      collectionId,
      resourceIds,
      filters,
      userId,
    } = params;

    // 将向量转换为 PostgreSQL 数组格式
    const vectorString = `[${queryEmbedding.join(",")}]`;

    // 构建 WHERE 条件
    const whereConditions: string[] = [];
    const queryParams: unknown[] = [];

    let paramIndex = 1;

    // 添加用户权限过滤（仅搜索用户有权访问的资源）
    if (userId) {
      whereConditions.push(`(
        r.id IN (
          SELECT ci.resource_id FROM collection_items ci
          JOIN collections c ON c.id = ci.collection_id
          WHERE c.user_id = $${paramIndex}
        )
      )`);
      queryParams.push(userId);
      paramIndex++;
    }

    // 按集合ID过滤
    if (collectionId) {
      whereConditions.push(`r.id IN (
        SELECT resource_id FROM collection_items WHERE collection_id = $${paramIndex}
      )`);
      queryParams.push(collectionId);
      paramIndex++;
    }

    // 按资源ID过滤
    if (resourceIds && resourceIds.length > 0) {
      whereConditions.push(`r.id = ANY($${paramIndex}::uuid[])`);
      queryParams.push(resourceIds);
      paramIndex++;
    }

    // 按资源类型过滤
    if (filters?.resourceTypes && filters.resourceTypes.length > 0) {
      whereConditions.push(`r.type = ANY($${paramIndex}::text[])`);
      queryParams.push(filters.resourceTypes);
      paramIndex++;
    }

    // 按日期范围过滤
    if (filters?.dateRange?.start) {
      whereConditions.push(`r.published_at >= $${paramIndex}::timestamp`);
      queryParams.push(new Date(filters.dateRange.start));
      paramIndex++;
    }

    if (filters?.dateRange?.end) {
      whereConditions.push(`r.published_at <= $${paramIndex}::timestamp`);
      queryParams.push(new Date(filters.dateRange.end));
      paramIndex++;
    }

    // 按标签过滤（假设 tags 存储为 JSONB 数组）
    if (filters?.tags && filters.tags.length > 0) {
      whereConditions.push(`r.tags ?| $${paramIndex}::text[]`);
      queryParams.push(filters.tags);
      paramIndex++;
    }

    const whereClause =
      whereConditions.length > 0
        ? `WHERE ${whereConditions.join(" AND ")}`
        : "";

    // 构建查询
    // 使用余弦相似度: 1 - (vector <=> query) as similarity
    // 注意：<=> 是余弦距离运算符，范围 [0, 2]，越小越相似
    const query = `
      SELECT
        c.id as chunk_id,
        c.resource_id,
        c.content,
        c.position,
        c.metadata as chunk_metadata,
        r.title,
        r.type,
        r.source_url,
        r.published_at,
        r.authors,
        1 - (e.vector <=> $${paramIndex}::vector) as similarity
      FROM embeddings e
      JOIN chunks c ON c.id = e.chunk_id
      JOIN resources r ON r.id = c.resource_id
      ${whereClause}
      ORDER BY e.vector <=> $${paramIndex}::vector ASC
      LIMIT $${paramIndex + 1}
    `;

    queryParams.push(vectorString);
    queryParams.push(topK);

    try {
      // 执行原生 SQL 查询
      // 注意：这里使用了 pgvector 扩展的向量运算符
      const rawResults = await this.prisma.$queryRawUnsafe<
        Array<{
          chunk_id: string;
          resource_id: string;
          content: string;
          position: number;
          chunk_metadata: Record<string, unknown>;
          title: string;
          type: string;
          source_url: string;
          published_at: Date | null;
          authors: unknown;
          similarity: number;
        }>
      >(query, ...queryParams);

      // 过滤低于阈值的结果
      const filteredResults = rawResults.filter(
        (result) => result.similarity >= threshold,
      );

      // 转换为输出格式
      return filteredResults.map((result) => ({
        resourceId: result.resource_id,
        chunkId: result.chunk_id,
        content: result.content,
        score: result.similarity,
        metadata: {
          title: result.title,
          type: result.type,
          sourceUrl: result.source_url,
          publishedAt: result.published_at?.toISOString(),
          authors: Array.isArray(result.authors)
            ? (result.authors as string[])
            : undefined,
          position: result.position,
          ...result.chunk_metadata,
        },
      }));
    } catch (error) {
      // 如果表不存在，提供友好的错误信息
      if (
        error instanceof Error &&
        (error.message.includes("relation") ||
          error.message.includes("does not exist"))
      ) {
        throw new Error(
          "RAG 数据库表尚未创建。请运行必要的数据库迁移以创建 chunks 和 embeddings 表。",
        );
      }

      throw error;
    }
  }
}
