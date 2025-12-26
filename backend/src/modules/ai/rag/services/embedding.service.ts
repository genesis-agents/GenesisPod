/**
 * Embedding Service
 * Generates and manages vector embeddings using OpenAI text-embedding-3-small
 *
 * Features:
 * - Batch embedding generation for efficiency
 * - Automatic token counting
 * - Direct pgvector storage via raw SQL
 */

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { AdminService } from "../../../core/admin/admin.service";
import { EmbeddingResult, EmbeddingBatch } from "../interfaces/rag.interfaces";
import OpenAI from "openai";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;
const MAX_BATCH_SIZE = 100; // OpenAI allows up to 2048 inputs per request

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private openai: OpenAI | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly adminService: AdminService,
  ) {}

  /**
   * Get or initialize OpenAI client
   */
  private async getOpenAIClient(): Promise<OpenAI> {
    if (this.openai) {
      return this.openai;
    }

    const apiKey = await this.adminService.getOpenAIApiKey();
    if (!apiKey) {
      throw new Error("OpenAI API key not configured");
    }

    this.openai = new OpenAI({ apiKey });
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

    const openai = await this.getOpenAIClient();
    const allEmbeddings: number[][] = [];
    let totalTokens = 0;

    // Process in batches
    for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
      const batch = texts.slice(i, i + MAX_BATCH_SIZE);

      try {
        const response = await openai.embeddings.create({
          model: EMBEDDING_MODEL,
          input: batch,
        });

        for (const item of response.data) {
          allEmbeddings.push(item.embedding);
        }

        totalTokens += response.usage?.total_tokens || 0;

        this.logger.debug(
          `Generated embeddings for batch ${Math.floor(i / MAX_BATCH_SIZE) + 1}`,
        );
      } catch (error) {
        this.logger.error(`Failed to generate embeddings: ${error}`);
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
      `Generating embeddings for ${childChunks.length} chunks in document ${documentId}`,
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
          ${EMBEDDING_MODEL},
          ${EMBEDDING_DIMENSIONS},
          NOW(),
          NOW()
        )
      `;
    }

    this.logger.log(
      `Saved ${childChunks.length} embeddings for document ${documentId}`,
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
   * Get embedding dimensions
   */
  getDimensions(): number {
    return EMBEDDING_DIMENSIONS;
  }

  /**
   * Get embedding model name
   */
  getModel(): string {
    return EMBEDDING_MODEL;
  }
}
