/**
 * Embedding Processor Service
 * Business-level service for generating and storing embeddings
 *
 * Uses AI Engine's EmbeddingService for generation and VectorService for storage
 */

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { EmbeddingService, VectorService } from "../../ai-engine/rag";

const BATCH_SIZE = 50;

@Injectable()
export class EmbeddingProcessorService {
  private readonly logger = new Logger(EmbeddingProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingService: EmbeddingService,
    private readonly vectorService: VectorService,
  ) {}

  /**
   * Generate embeddings for all child chunks in a knowledge base that don't have embeddings yet
   */
  async generateEmbeddingsForKnowledgeBase(
    knowledgeBaseId: string,
  ): Promise<number> {
    this.logger.log(
      `Generating embeddings for knowledge base: ${knowledgeBaseId}`,
    );

    // Find all child chunks without embeddings for this KB
    const chunksWithoutEmbeddings = await this.prisma.childChunk.findMany({
      where: {
        parentChunk: {
          document: {
            knowledgeBaseId,
          },
        },
        embeddings: { none: {} },
      },
      select: {
        id: true,
        content: true,
      },
    });

    if (chunksWithoutEmbeddings.length === 0) {
      this.logger.log(`No chunks need embeddings for KB ${knowledgeBaseId}`);
      return 0;
    }

    this.logger.log(
      `Found ${chunksWithoutEmbeddings.length} chunks needing embeddings`,
    );

    let generatedCount = 0;
    const model = await this.embeddingService.getModel();

    // Process in batches
    for (let i = 0; i < chunksWithoutEmbeddings.length; i += BATCH_SIZE) {
      const batch = chunksWithoutEmbeddings.slice(i, i + BATCH_SIZE);
      const texts = batch.map((chunk) => chunk.content);

      try {
        // Generate embeddings using AI Engine's EmbeddingService
        const embeddingResult =
          await this.embeddingService.generateEmbeddings(texts);

        // Store embeddings using AI Engine's VectorService
        for (let j = 0; j < batch.length; j++) {
          const chunk = batch[j];
          const embedding = embeddingResult.embeddings[j];

          if (embedding && embedding.length > 0) {
            await this.vectorService.storeEmbedding(chunk.id, embedding, model);
            generatedCount++;
          }
        }

        this.logger.debug(
          `Processed batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} embeddings`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to generate embeddings for batch: ${error instanceof Error ? error.message : error}`,
        );
        // Continue with next batch instead of failing entirely
      }
    }

    this.logger.log(
      `Generated ${generatedCount} embeddings for KB ${knowledgeBaseId}`,
    );
    return generatedCount;
  }

  /**
   * Generate embeddings for a single document
   */
  async generateEmbeddingsForDocument(documentId: string): Promise<number> {
    this.logger.log(`Generating embeddings for document: ${documentId}`);

    const chunksWithoutEmbeddings = await this.prisma.childChunk.findMany({
      where: {
        parentChunk: {
          documentId,
        },
        embeddings: { none: {} },
      },
      select: {
        id: true,
        content: true,
      },
    });

    if (chunksWithoutEmbeddings.length === 0) {
      this.logger.log(`No chunks need embeddings for document ${documentId}`);
      return 0;
    }

    const texts = chunksWithoutEmbeddings.map((chunk) => chunk.content);
    const model = await this.embeddingService.getModel();

    try {
      const embeddingResult =
        await this.embeddingService.generateEmbeddings(texts);

      let generatedCount = 0;
      for (let i = 0; i < chunksWithoutEmbeddings.length; i++) {
        const chunk = chunksWithoutEmbeddings[i];
        const embedding = embeddingResult.embeddings[i];

        if (embedding && embedding.length > 0) {
          await this.vectorService.storeEmbedding(chunk.id, embedding, model);
          generatedCount++;
        }
      }

      return generatedCount;
    } catch (error) {
      this.logger.error(
        `Failed to generate embeddings for document ${documentId}: ${error}`,
      );
      throw error;
    }
  }
}
