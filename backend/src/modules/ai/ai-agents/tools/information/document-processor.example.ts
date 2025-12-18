/**
 * Document Processor Example
 * 文档处理器示例 - 展示如何对文档进行分块和向量化
 *
 * 这是一个示例文件，展示了如何在实际项目中使用 RAG 系统
 * 可以根据实际需求进行调整
 */

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";

// ============================================================================
// Types
// ============================================================================

interface ChunkMetadata {
  length: number;
  words: number;
  sentences?: number;
  language?: string;
  [key: string]: unknown;
}

interface ProcessDocumentOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  batchSize?: number;
  skipIfExists?: boolean;
}

interface ProcessingResult {
  resourceId: string;
  chunksCreated: number;
  embeddingsCreated: number;
  duration: number;
  errors?: string[];
}

// ============================================================================
// Service
// ============================================================================

/**
 * 文档处理服务
 *
 * 功能：
 * - 将长文档分割成适合向量化的块
 * - 为每个块生成 embedding
 * - 存储到数据库
 */
@Injectable()
export class DocumentProcessorService {
  private readonly logger = new Logger(DocumentProcessorService.name);
  private openai: OpenAI;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    const apiKey = this.configService.get<string>("OPENAI_API_KEY");
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is required for document processing");
    }
    this.openai = new OpenAI({ apiKey });
  }

  /**
   * 处理单个文档
   *
   * @param resourceId 资源ID
   * @param content 文档内容
   * @param options 处理选项
   */
  async processDocument(
    resourceId: string,
    content: string,
    options: ProcessDocumentOptions = {},
  ): Promise<ProcessingResult> {
    const startTime = Date.now();
    const {
      chunkSize = 500,
      chunkOverlap = 50,
      batchSize = 20,
      skipIfExists = true,
    } = options;

    this.logger.log(`Processing document ${resourceId}`);

    try {
      // 检查是否已处理
      if (skipIfExists) {
        const existingChunks = await this.prisma.$queryRaw<
          Array<{ count: number }>
        >`
          SELECT COUNT(*) as count
          FROM chunks
          WHERE resource_id = ${resourceId}::uuid
        `;

        if (existingChunks[0]?.count > 0) {
          this.logger.log(`Document ${resourceId} already processed, skipping`);
          return {
            resourceId,
            chunksCreated: 0,
            embeddingsCreated: 0,
            duration: Date.now() - startTime,
          };
        }
      }

      // 1. 分块
      const chunks = this.chunkText(content, chunkSize, chunkOverlap);
      this.logger.log(
        `Created ${chunks.length} chunks for document ${resourceId}`,
      );

      // 2. 批量处理
      const errors: string[] = [];
      let chunksCreated = 0;
      let embeddingsCreated = 0;

      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);

        try {
          const result = await this.processBatch(resourceId, batch, i);
          chunksCreated += result.chunksCreated;
          embeddingsCreated += result.embeddingsCreated;
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          this.logger.error(
            `Batch ${i}-${i + batchSize} failed: ${errorMessage}`,
          );
          errors.push(`Batch ${i}: ${errorMessage}`);
        }
      }

      const duration = Date.now() - startTime;
      this.logger.log(
        `Document ${resourceId} processed in ${duration}ms: ${chunksCreated} chunks, ${embeddingsCreated} embeddings`,
      );

      return {
        resourceId,
        chunksCreated,
        embeddingsCreated,
        duration,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      this.logger.error(
        `Failed to process document ${resourceId}: ${String(error)}`,
      );
      throw error;
    }
  }

  /**
   * 处理批量文档
   */
  async processMultipleDocuments(
    documents: Array<{ resourceId: string; content: string }>,
    options: ProcessDocumentOptions = {},
  ): Promise<ProcessingResult[]> {
    const results: ProcessingResult[] = [];

    for (const doc of documents) {
      try {
        const result = await this.processDocument(
          doc.resourceId,
          doc.content,
          options,
        );
        results.push(result);
      } catch (error) {
        this.logger.error(
          `Failed to process document ${doc.resourceId}: ${String(error)}`,
        );
        results.push({
          resourceId: doc.resourceId,
          chunksCreated: 0,
          embeddingsCreated: 0,
          duration: 0,
          errors: [error instanceof Error ? error.message : String(error)],
        });
      }
    }

    return results;
  }

  /**
   * 处理一批文本块
   */
  private async processBatch(
    resourceId: string,
    chunks: string[],
    startPosition: number,
  ): Promise<{ chunksCreated: number; embeddingsCreated: number }> {
    // 1. 批量生成 embeddings
    const embeddings = await this.batchGenerateEmbeddings(chunks);

    if (embeddings.length !== chunks.length) {
      throw new Error("Embeddings count mismatch");
    }

    // 2. 批量插入数据库
    let chunksCreated = 0;
    let embeddingsCreated = 0;

    for (let i = 0; i < chunks.length; i++) {
      const chunkText = chunks[i];
      const embedding = embeddings[i];
      const position = startPosition + i;

      try {
        // 创建 chunk
        const chunkId = await this.createChunk(resourceId, chunkText, position);
        chunksCreated++;

        // 创建 embedding
        await this.createEmbedding(chunkId, embedding);
        embeddingsCreated++;
      } catch (error) {
        this.logger.error(
          `Failed to create chunk ${position}: ${String(error)}`,
        );
      }
    }

    return { chunksCreated, embeddingsCreated };
  }

  /**
   * 分割文本为块
   *
   * 策略：
   * - 按句子分割
   * - 保持每个块在 chunkSize 字符左右
   * - 保留 overlap 字符的重叠以保持上下文连贯性
   */
  private chunkText(
    text: string,
    chunkSize: number,
    overlap: number,
  ): string[] {
    const chunks: string[] = [];

    // 清理文本
    const cleanedText = text
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    // 按段落和句子分割
    const sentences = this.splitIntoSentences(cleanedText);

    let currentChunk = "";
    let chunkSentences: string[] = [];

    for (const sentence of sentences) {
      const potentialChunk =
        currentChunk + (currentChunk ? " " : "") + sentence;

      if (potentialChunk.length > chunkSize && currentChunk) {
        // 当前块已满，保存
        chunks.push(currentChunk.trim());

        // 开始新块，保留最后几个句子作为重叠
        const overlapSentences = this.getOverlapSentences(
          chunkSentences,
          overlap,
        );
        currentChunk = overlapSentences.join(" ") + " " + sentence;
        chunkSentences = [...overlapSentences.map(() => ""), sentence];
      } else {
        currentChunk = potentialChunk;
        chunkSentences.push(sentence);
      }
    }

    // 保存最后一个块
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    // 过滤太短的块
    return chunks.filter((chunk) => chunk.length >= 50);
  }

  /**
   * 将文本分割成句子
   */
  private splitIntoSentences(text: string): string[] {
    // 中英文句子分隔符
    const sentenceDelimiters = /([。！？.!?]+[\s]*)/g;

    const parts = text.split(sentenceDelimiters);
    const sentences: string[] = [];

    for (let i = 0; i < parts.length; i += 2) {
      const sentence = parts[i]?.trim();
      const delimiter = parts[i + 1] || "";

      if (sentence) {
        sentences.push(sentence + delimiter);
      }
    }

    return sentences.filter((s) => s.length > 0);
  }

  /**
   * 获取重叠的句子
   */
  private getOverlapSentences(
    sentences: string[],
    targetLength: number,
  ): string[] {
    const overlap: string[] = [];
    let currentLength = 0;

    for (let i = sentences.length - 1; i >= 0; i--) {
      const sentence = sentences[i];
      if (currentLength + sentence.length <= targetLength) {
        overlap.unshift(sentence);
        currentLength += sentence.length;
      } else {
        break;
      }
    }

    return overlap;
  }

  /**
   * 批量生成 embeddings
   */
  private async batchGenerateEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      const response = await this.openai.embeddings.create({
        model: "text-embedding-3-small",
        input: texts,
        encoding_format: "float",
      });

      return response.data.map(
        (item: { embedding: number[] }) => item.embedding,
      );
    } catch (error) {
      this.logger.error(
        `Failed to generate embeddings: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * 创建文本块
   */
  private async createChunk(
    resourceId: string,
    content: string,
    position: number,
  ): Promise<string> {
    const metadata: ChunkMetadata = {
      length: content.length,
      words: content.split(/\s+/).length,
      sentences: this.splitIntoSentences(content).length,
    };

    const result = await this.prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO chunks (resource_id, content, position, metadata)
      VALUES (${resourceId}::uuid, ${content}, ${position}, ${JSON.stringify(metadata)}::jsonb)
      RETURNING id
    `;

    return result[0].id;
  }

  /**
   * 创建 embedding
   */
  private async createEmbedding(
    chunkId: string,
    vector: number[],
  ): Promise<void> {
    const vectorString = `[${vector.join(",")}]`;

    await this.prisma.$executeRaw`
      INSERT INTO embeddings (chunk_id, vector, model)
      VALUES (${chunkId}::uuid, ${vectorString}::vector, 'text-embedding-3-small')
      ON CONFLICT (chunk_id, model) DO NOTHING
    `;
  }

  /**
   * 删除文档的所有块和 embeddings
   */
  async deleteDocumentChunks(resourceId: string): Promise<number> {
    const result = await this.prisma.$executeRaw`
      DELETE FROM chunks WHERE resource_id = ${resourceId}::uuid
    `;

    this.logger.log(`Deleted ${result} chunks for document ${resourceId}`);
    return result;
  }

  /**
   * 重新处理文档
   */
  async reprocessDocument(
    resourceId: string,
    content: string,
    options: ProcessDocumentOptions = {},
  ): Promise<ProcessingResult> {
    // 删除旧数据
    await this.deleteDocumentChunks(resourceId);

    // 重新处理
    return this.processDocument(resourceId, content, {
      ...options,
      skipIfExists: false,
    });
  }
}

// ============================================================================
// Usage Example
// ============================================================================

/**
 * 使用示例
 */
export async function exampleUsage() {
  // 注意：这只是示例代码，实际使用时需要在 NestJS 模块中正确注入依赖
  /*
  // 1. 处理单个文档
  const result = await documentProcessor.processDocument(
    'resource-123',
    '这是一篇关于机器学习的长文档...',
    {
      chunkSize: 500,
      chunkOverlap: 50,
      batchSize: 20,
    }
  );

  console.log(`Created ${result.chunksCreated} chunks`);

  // 2. 批量处理多个文档
  const documents = [
    { resourceId: 'res-1', content: '文档1内容...' },
    { resourceId: 'res-2', content: '文档2内容...' },
  ];

  const results = await documentProcessor.processMultipleDocuments(documents);

  // 3. 重新处理文档
  await documentProcessor.reprocessDocument('resource-123', '更新后的内容...');

  // 4. 删除文档的向量数据
  await documentProcessor.deleteDocumentChunks('resource-123');
  */
}
