/**
 * Topic Context Retrieval Service
 * 长文上下文智能检索服务
 *
 * 功能:
 * - 为重要消息生成向量嵌入
 * - 基于语义相似度检索相关历史上下文
 * - 支持长文创作场景的上下文管理
 */

import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "@/common/prisma/prisma.service";
import { AIEngineFacade } from "@/modules/ai-engine/facade";
import type { EmbeddingResult } from "@/modules/ai-engine/facade";

/**
 * 检索结果
 */
export interface RetrievedContext {
  messageId: string;
  content: string;
  contentSummary: string | null;
  similarity: number;
  senderName: string;
  createdAt: Date;
}

/**
 * 检索选项
 */
export interface RetrievalOptions {
  /** 最大返回数量 (默认: 5) */
  limit?: number;
  /** 最小相似度阈值 (默认: 0.5) */
  threshold?: number;
  /** 排除的消息ID列表 */
  excludeMessageIds?: string[];
  /** 仅检索长内容 (字符数 > 此值) */
  minContentLength?: number;
}

@Injectable()
export class TopicContextRetrievalService {
  private readonly logger = new Logger(TopicContextRetrievalService.name);

  // 长内容阈值：超过此长度的消息才会被嵌入
  private readonly LONG_CONTENT_THRESHOLD = 500;
  // 摘要最大长度
  private readonly SUMMARY_MAX_LENGTH = 200;

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiFacade: AIEngineFacade,
  ) {}

  /**
   * 生成内容摘要
   */
  private generateSummary(content: string): string {
    // 提取第一段有意义的内容
    const lines = content.split(/[\n\r]+/).filter((line) => line.trim());
    let summary = "";

    for (const line of lines) {
      const trimmed = line.trim();
      // 跳过标题行
      if (trimmed.startsWith("#") || trimmed.startsWith("**")) {
        continue;
      }
      // 跳过任务标记
      if (
        trimmed.startsWith("[任务") ||
        trimmed.startsWith("[工作") ||
        trimmed.startsWith("[结果")
      ) {
        continue;
      }
      if (trimmed.length > 20) {
        summary = trimmed;
        break;
      }
    }

    if (!summary) {
      summary = content.replace(/[\n\r]+/g, " ").trim();
    }

    return summary.length > this.SUMMARY_MAX_LENGTH
      ? summary.substring(0, this.SUMMARY_MAX_LENGTH) + "..."
      : summary;
  }

  /**
   * 为消息生成并存储嵌入
   * 仅对长内容消息生成嵌入
   */
  async embedMessage(messageId: string): Promise<boolean> {
    try {
      const message = await this.prisma.topicMessage.findUnique({
        where: { id: messageId },
        include: {
          embedding: true,
        },
      });

      if (!message) {
        this.logger.warn(`Message not found: ${messageId}`);
        return false;
      }

      // 跳过短内容
      if (message.content.length < this.LONG_CONTENT_THRESHOLD) {
        return false;
      }

      // 已有嵌入则跳过
      if (message.embedding) {
        return true;
      }

      // 生成嵌入
      const embeddingResult: EmbeddingResult | null =
        await this.aiFacade.embeddingGenerate(
          message.content.substring(0, 8000), // 限制长度
        );

      if (!embeddingResult) {
        this.logger.warn(
          `Embedding service unavailable, skipping message ${messageId}`,
        );
        return false;
      }

      // 存储嵌入（embedding 字段为 pgvector Unsupported 类型，必须使用 $executeRaw）
      const vectorStr = `[${embeddingResult.embedding.join(",")}]`;
      const embeddingModel = await this.aiFacade.embeddingGetModel();
      const contentSummary = this.generateSummary(message.content);
      await this.prisma.$executeRaw(Prisma.sql`
        INSERT INTO topic_message_embeddings (id, message_id, embedding, model, dimensions, content_summary, token_count, created_at, updated_at)
        VALUES (gen_random_uuid(), ${message.id}, ${vectorStr}::vector, ${embeddingModel}, ${embeddingResult.embedding.length}, ${contentSummary}, ${embeddingResult.tokenCount ?? null}, now(), now())
        ON CONFLICT (message_id) DO NOTHING
      `);

      this.logger.log(
        `Embedded message ${messageId}: ${embeddingResult.embedding.length} dimensions`,
      );
      return true;
    } catch (error) {
      this.logger.error(`Failed to embed message ${messageId}:`, error);
      return false;
    }
  }

  /**
   * 批量为 Topic 的长内容消息生成嵌入
   */
  async embedTopicMessages(
    topicId: string,
    limit: number = 50,
  ): Promise<number> {
    // 获取还没有嵌入的消息
    const messages = await this.prisma.topicMessage.findMany({
      where: {
        topicId,
        deletedAt: null,
      },
      include: {
        embedding: true,
      },
      orderBy: { createdAt: "desc" },
      take: limit * 2, // 取更多以便过滤
    });

    // 过滤：没有嵌入的长内容消息
    const messagesToEmbed = messages.filter(
      (m) => m.content.length >= this.LONG_CONTENT_THRESHOLD && !m.embedding,
    );

    if (messagesToEmbed.length === 0) {
      return 0;
    }

    const toProcess = messagesToEmbed.slice(0, limit);
    this.logger.log(
      `Embedding ${toProcess.length} long messages for topic ${topicId}`,
    );

    let embedded = 0;
    for (const msg of toProcess) {
      const success = await this.embedMessage(msg.id);
      if (success) embedded++;
    }

    return embedded;
  }

  /**
   * 基于查询检索相关上下文
   */
  async retrieveContext(
    topicId: string,
    query: string,
    options: RetrievalOptions = {},
  ): Promise<RetrievedContext[]> {
    const {
      limit = 5,
      threshold = 0.5,
      excludeMessageIds = [],
      minContentLength = 0,
    } = options;

    try {
      // 生成查询向量
      const queryEmbedding = await this.aiFacade.embeddingGenerate(query);
      if (!queryEmbedding) {
        this.logger.warn(
          `Embedding service unavailable, cannot retrieve context for topic ${topicId}`,
        );
        return [];
      }
      const vectorStr = `[${queryEmbedding.embedding.join(",")}]`;

      // 可选的排除消息 ID 过滤片段
      const excludeFilter =
        excludeMessageIds.length > 0
          ? Prisma.sql`AND tm.id != ALL(ARRAY[${Prisma.join(excludeMessageIds)}]::text[])`
          : Prisma.sql``;

      // 可选的最小内容长度过滤片段
      const lengthFilter =
        minContentLength > 0
          ? Prisma.sql`AND LENGTH(tm.content) >= ${minContentLength}`
          : Prisma.sql``;

      // 使用 pgvector <=> 余弦距离运算符，DB 层完成相似度计算
      interface RawRow {
        message_id: string;
        content_summary: string | null;
        msg_content: string;
        msg_created_at: Date;
        sender_full_name: string | null;
        sender_username: string | null;
        ai_member_display_name: string | null;
        similarity: number;
      }

      // 子查询模式：ORDER BY ... LIMIT 供 HNSW 索引使用，外层过滤阈值
      const rows = await this.prisma.$queryRaw<RawRow[]>(Prisma.sql`
        SELECT message_id, content_summary, msg_content, msg_created_at,
               sender_full_name, sender_username, ai_member_display_name, similarity
        FROM (
          SELECT
            tme.message_id,
            tme.content_summary,
            tm.content AS msg_content,
            tm.created_at AS msg_created_at,
            u.full_name AS sender_full_name,
            u.username AS sender_username,
            am.display_name AS ai_member_display_name,
            1 - (tme.embedding <=> ${vectorStr}::vector) AS similarity
          FROM topic_message_embeddings tme
          JOIN topic_messages tm ON tme.message_id = tm.id
          LEFT JOIN users u ON tm.sender_id = u.id
          LEFT JOIN topic_ai_members am ON tm.ai_member_id = am.id
          WHERE tm.topic_id = ${topicId}
            AND tm.deleted_at IS NULL
            ${excludeFilter}
            ${lengthFilter}
          ORDER BY tme.embedding <=> ${vectorStr}::vector
          LIMIT ${limit}
        ) sub
        WHERE similarity >= ${threshold}
      `);

      if (rows.length === 0) {
        this.logger.debug(`No embeddings found for topic ${topicId}`);
        return [];
      }

      const results: RetrievedContext[] = rows.map((row) => ({
        messageId: row.message_id,
        content: row.msg_content,
        contentSummary: row.content_summary,
        similarity: Number(row.similarity),
        senderName:
          row.sender_full_name ||
          row.sender_username ||
          row.ai_member_display_name ||
          "Unknown",
        createdAt: row.msg_created_at,
      }));

      this.logger.log(
        `Retrieved ${results.length} contexts for topic ${topicId} (pgvector <=> query)`,
      );

      return results;
    } catch (error) {
      this.logger.error(
        `Failed to retrieve context for topic ${topicId}:`,
        error,
      );
      return [];
    }
  }

  /**
   * 为 AI 响应构建增强上下文
   * 返回格式化的历史上下文字符串
   */
  async buildEnhancedContext(
    topicId: string,
    currentQuery: string,
    recentMessageIds: string[],
  ): Promise<string> {
    // 先确保有嵌入
    await this.embedTopicMessages(topicId, 30);

    // 检索相关上下文
    const retrieved = await this.retrieveContext(topicId, currentQuery, {
      limit: 5,
      threshold: 0.55,
      excludeMessageIds: recentMessageIds,
      minContentLength: 300,
    });

    if (retrieved.length === 0) {
      return "";
    }

    // 格式化为上下文字符串
    const contextParts = retrieved.map((r, i) => {
      const summary = r.contentSummary || r.content.substring(0, 200) + "...";
      return `${i + 1}. [${r.senderName}] ${summary} (相似度: ${(r.similarity * 100).toFixed(1)}%)`;
    });

    return `\n\n## 相关历史上下文（通过语义检索）\n${contextParts.join("\n")}`;
  }

  /**
   * 获取 Topic 的嵌入统计
   */
  async getEmbeddingStats(topicId: string): Promise<{
    totalMessages: number;
    embeddedMessages: number;
    longMessagesEstimate: number;
  }> {
    const [totalMessages, embeddedMessages] = await Promise.all([
      this.prisma.topicMessage.count({
        where: { topicId, deletedAt: null },
      }),
      this.prisma.topicMessageEmbedding.count({
        where: { message: { topicId } },
      }),
    ]);

    return {
      totalMessages,
      embeddedMessages,
      longMessagesEstimate: Math.floor(totalMessages * 0.3), // 估算值（Prisma 不支持按内容长度查询）
    };
  }
}
