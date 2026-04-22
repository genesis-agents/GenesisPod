/**
 * Embedding Processor Service
 * Business-level service for generating and storing embeddings
 *
 * Uses AI Engine's EmbeddingService for generation and VectorService for storage
 */

import { Injectable, Logger, Optional } from "@nestjs/common";
import { PrismaService } from "../../../../../common/prisma/prisma.service";
import { RAGFacade } from "../../../../ai-engine/facade";
import { MissionExecutorService } from "../../../../ai-engine/facade";
import { LruMap } from "@/common/utils/lru-map";

const BATCH_SIZE = 50;

@Injectable()
export class EmbeddingProcessorService {
  private readonly logger = new Logger(EmbeddingProcessorService.name);
  private readonly kernelProcessIds = new LruMap<string, string>(500);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly ragFacade?: RAGFacade,
    @Optional() private readonly missionExecutor?: MissionExecutorService,
  ) {}

  /**
   * Generate embeddings for all child chunks in a knowledge base that don't have embeddings yet
   */
  async generateEmbeddingsForKnowledgeBase(
    knowledgeBaseId: string,
    userId?: string,
  ): Promise<number> {
    this.logger.log(
      `Generating embeddings for knowledge base: ${knowledgeBaseId}`,
    );

    // Spawn AI Kernel process for cost tracking
    if (this.missionExecutor && userId) {
      try {
        const kernelResult = await this.missionExecutor.execute({
          userId,
          agentId: "rag-processor",
          teamSessionId: knowledgeBaseId,
          input: { knowledgeBaseId },
        });
        this.kernelProcessIds.set(knowledgeBaseId, kernelResult.processId);
      } catch (err) {
        this.logger.warn(
          `[Kernel] Failed to spawn process: ${(err as Error).message}`,
        );
      }
    }

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
      this.completeKernelProcess(knowledgeBaseId, { generatedCount: 0 });
      return 0;
    }

    this.logger.log(
      `Found ${chunksWithoutEmbeddings.length} chunks needing embeddings`,
    );

    let generatedCount = 0;
    const model = await this.ragFacade!.embedding!.getModel();

    // Process in batches
    for (let i = 0; i < chunksWithoutEmbeddings.length; i += BATCH_SIZE) {
      const batch = chunksWithoutEmbeddings.slice(i, i + BATCH_SIZE);
      const texts = batch.map((chunk) => chunk.content);

      try {
        // Generate embeddings using AI Engine's EmbeddingService
        const embeddingResult =
          await this.ragFacade!.embedding!.generateEmbeddings(texts);

        // Store embeddings using AI Engine's VectorService
        for (let j = 0; j < batch.length; j++) {
          const chunk = batch[j];
          const embedding = embeddingResult.embeddings[j];

          if (embedding && embedding.length > 0) {
            await this.ragFacade!.vector!.storeEmbedding(
              chunk.id,
              embedding,
              model,
            );
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

    // Complete AI Kernel process
    this.completeKernelProcess(knowledgeBaseId, {
      generatedCount,
      totalChunks: chunksWithoutEmbeddings.length,
    });

    return generatedCount;
  }

  /**
   * Generate embeddings for a single document
   */
  async generateEmbeddingsForDocument(
    documentId: string,
    userId?: string,
  ): Promise<number> {
    this.logger.log(`Generating embeddings for document: ${documentId}`);

    // Spawn AI Kernel process for cost tracking
    if (this.missionExecutor && userId) {
      try {
        const kernelResult = await this.missionExecutor.execute({
          userId,
          agentId: "rag-processor",
          teamSessionId: documentId,
          input: { documentId },
        });
        this.kernelProcessIds.set(documentId, kernelResult.processId);
      } catch (err) {
        this.logger.warn(
          `[Kernel] Failed to spawn process: ${(err as Error).message}`,
        );
      }
    }

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
      this.completeKernelProcess(documentId, { generatedCount: 0 });
      return 0;
    }

    const texts = chunksWithoutEmbeddings.map((chunk) => chunk.content);
    const model = await this.ragFacade!.embedding!.getModel();

    try {
      const embeddingResult =
        await this.ragFacade!.embedding!.generateEmbeddings(texts);

      let generatedCount = 0;
      for (let i = 0; i < chunksWithoutEmbeddings.length; i++) {
        const chunk = chunksWithoutEmbeddings[i];
        const embedding = embeddingResult.embeddings[i];

        if (embedding && embedding.length > 0) {
          await this.ragFacade!.vector!.storeEmbedding(
            chunk.id,
            embedding,
            model,
          );
          generatedCount++;
        }
      }

      // Complete AI Kernel process
      this.completeKernelProcess(documentId, {
        generatedCount,
        totalChunks: chunksWithoutEmbeddings.length,
      });

      return generatedCount;
    } catch (error) {
      this.logger.error(
        `Failed to generate embeddings for document ${documentId}: ${error}`,
      );
      // Fail AI Kernel process
      this.failKernelProcess(
        documentId,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  private completeKernelProcess(
    entityId: string,
    output?: Record<string, unknown>,
  ): void {
    const processId = this.kernelProcessIds.get(entityId);
    if (!processId || !this.missionExecutor) return;
    void this.missionExecutor
      .complete(processId, output)
      .catch((err) =>
        this.logger.warn(
          `[Kernel] Failed to complete process: ${(err as Error).message}`,
        ),
      );
    this.kernelProcessIds.delete(entityId);
  }

  private failKernelProcess(entityId: string, error: string): void {
    const processId = this.kernelProcessIds.get(entityId);
    if (!processId || !this.missionExecutor) return;
    void this.missionExecutor
      .fail(processId, error)
      .catch((err) =>
        this.logger.warn(
          `[Kernel] Failed to fail process: ${(err as Error).message}`,
        ),
      );
    this.kernelProcessIds.delete(entityId);
  }
}
