/**
 * Knowledge Base Service
 * Manages knowledge bases and their documents
 */

import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { KnowledgeBaseStatus, KnowledgeBaseSourceType } from "@prisma/client";
import { DocumentProcessorService } from "./document-processor.service";
import { EmbeddingService } from "./embedding.service";
import { KnowledgeBaseStats } from "../interfaces/rag.interfaces";

export interface CreateKnowledgeBaseInput {
  name: string;
  description?: string;
  sourceType: KnowledgeBaseSourceType;
  googleDriveConnectionId?: string;
  googleDriveFolderIds?: string[];
}

export interface AddDocumentInput {
  title: string;
  sourceType: string;
  sourceId?: string;
  sourceUrl?: string;
  mimeType?: string;
  content: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class KnowledgeBaseService {
  private readonly logger = new Logger(KnowledgeBaseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly documentProcessor: DocumentProcessorService,
    private readonly embeddingService: EmbeddingService,
  ) {}

  /**
   * Create a new knowledge base
   */
  async create(userId: string, input: CreateKnowledgeBaseInput) {
    this.logger.log(
      `Creating knowledge base: ${input.name} for user ${userId}`,
    );

    // Auto-detect Google Drive connection if sourceType is GOOGLE_DRIVE and no connectionId provided
    let googleDriveConnectionId = input.googleDriveConnectionId;
    if (
      input.sourceType === KnowledgeBaseSourceType.GOOGLE_DRIVE &&
      !googleDriveConnectionId
    ) {
      const connection = await this.prisma.googleDriveConnection.findUnique({
        where: { userId },
      });
      if (connection) {
        googleDriveConnectionId = connection.id;
        this.logger.log(
          `Auto-detected Google Drive connection: ${connection.id} for user ${userId}`,
        );
      } else {
        throw new Error(
          "No Google Drive connection found. Please connect Google Drive first.",
        );
      }
    }

    const kb = await this.prisma.knowledgeBase.create({
      data: {
        name: input.name,
        description: input.description,
        sourceType: input.sourceType,
        status: KnowledgeBaseStatus.PENDING,
        userId,
        googleDriveConnectionId,
        googleDriveFolderIds: input.googleDriveFolderIds || [],
      },
    });

    return kb;
  }

  /**
   * Get knowledge base by ID
   */
  async findById(id: string, userId?: string) {
    const kb = await this.prisma.knowledgeBase.findFirst({
      where: {
        id,
        ...(userId && { userId }),
      },
      include: {
        documents: {
          select: {
            id: true,
            title: true,
            sourceType: true,
            status: true,
            chunkCount: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        },
        googleDriveConnection: {
          select: {
            id: true,
            email: true,
            displayName: true,
          },
        },
      },
    });

    if (!kb) {
      throw new NotFoundException("Knowledge base not found");
    }

    return kb;
  }

  /**
   * List knowledge bases for user
   */
  async findByUser(userId: string) {
    return this.prisma.knowledgeBase.findMany({
      where: { userId },
      include: {
        _count: {
          select: { documents: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Update knowledge base
   */
  async update(
    id: string,
    userId: string,
    data: {
      name?: string;
      description?: string;
      googleDriveFolderIds?: string[];
    },
  ) {
    // Verify ownership (throws if not found)
    await this.findById(id, userId);

    return this.prisma.knowledgeBase.update({
      where: { id },
      data,
    });
  }

  /**
   * Delete knowledge base and all associated data
   */
  async delete(id: string, userId: string) {
    // Verify ownership (throws if not found)
    await this.findById(id, userId);

    // Delete in correct order due to foreign keys
    // Child embeddings -> Child chunks -> Parent chunks -> Documents -> KB
    await this.prisma.$transaction([
      this.prisma.$executeRaw`
        DELETE FROM child_embeddings
        WHERE child_chunk_id IN (
          SELECT cc.id FROM child_chunks cc
          JOIN parent_chunks pc ON cc.parent_chunk_id = pc.id
          JOIN knowledge_base_documents d ON pc.document_id = d.id
          WHERE d.knowledge_base_id = ${id}::uuid
        )
      `,
      this.prisma.childChunk.deleteMany({
        where: {
          parentChunk: {
            document: {
              knowledgeBaseId: id,
            },
          },
        },
      }),
      this.prisma.parentChunk.deleteMany({
        where: {
          document: {
            knowledgeBaseId: id,
          },
        },
      }),
      this.prisma.knowledgeBaseDocument.deleteMany({
        where: { knowledgeBaseId: id },
      }),
      this.prisma.knowledgeBase.delete({
        where: { id },
      }),
    ]);

    this.logger.log(`Deleted knowledge base ${id}`);
  }

  /**
   * Add document to knowledge base
   */
  async addDocument(knowledgeBaseId: string, input: AddDocumentInput) {
    this.logger.log(`Adding document to KB ${knowledgeBaseId}: ${input.title}`);

    const doc = await this.prisma.knowledgeBaseDocument.create({
      data: {
        knowledgeBaseId,
        title: input.title,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        sourceUrl: input.sourceUrl,
        mimeType: input.mimeType,
        rawContent: input.content,
        status: KnowledgeBaseStatus.PENDING,
        metadata: input.metadata || {},
      },
    });

    return doc;
  }

  /**
   * Process all pending documents and generate embeddings
   */
  async processAllDocuments(knowledgeBaseId: string) {
    this.logger.log(`Processing all documents for KB ${knowledgeBaseId}`);

    // Update KB status
    await this.prisma.knowledgeBase.update({
      where: { id: knowledgeBaseId },
      data: { status: KnowledgeBaseStatus.PROCESSING },
    });

    try {
      // Process documents (chunking)
      const processedCount =
        await this.documentProcessor.processAllPendingDocuments(
          knowledgeBaseId,
        );

      // Generate embeddings
      const embeddingCount =
        await this.embeddingService.generateEmbeddingsForKnowledgeBase(
          knowledgeBaseId,
        );

      // Update KB status
      await this.prisma.knowledgeBase.update({
        where: { id: knowledgeBaseId },
        data: {
          status: KnowledgeBaseStatus.READY,
          lastSyncedAt: new Date(),
        },
      });

      this.logger.log(
        `KB ${knowledgeBaseId}: processed ${processedCount} docs, ${embeddingCount} embeddings`,
      );

      return { processedCount, embeddingCount };
    } catch (error) {
      await this.prisma.knowledgeBase.update({
        where: { id: knowledgeBaseId },
        data: {
          status: KnowledgeBaseStatus.ERROR,
          lastError: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }

  /**
   * Get knowledge base statistics
   */
  async getStats(id: string): Promise<KnowledgeBaseStats> {
    const [docCount, chunkCounts, kb] = await Promise.all([
      this.prisma.knowledgeBaseDocument.count({
        where: { knowledgeBaseId: id },
      }),
      this.prisma.$queryRaw<
        Array<{
          parent_count: bigint;
          child_count: bigint;
          total_tokens: bigint;
        }>
      >`
        SELECT
          COUNT(DISTINCT pc.id) as parent_count,
          COUNT(DISTINCT cc.id) as child_count,
          COALESCE(SUM(pc.token_count), 0) as total_tokens
        FROM parent_chunks pc
        LEFT JOIN child_chunks cc ON cc.parent_chunk_id = pc.id
        JOIN knowledge_base_documents d ON pc.document_id = d.id
        WHERE d.knowledge_base_id = ${id}::uuid
      `,
      this.prisma.knowledgeBase.findUnique({
        where: { id },
        select: { lastSyncedAt: true },
      }),
    ]);

    const counts = chunkCounts[0] || {
      parent_count: BigInt(0),
      child_count: BigInt(0),
      total_tokens: BigInt(0),
    };

    return {
      documentCount: docCount,
      parentChunkCount: Number(counts.parent_count),
      childChunkCount: Number(counts.child_count),
      totalTokens: Number(counts.total_tokens),
      lastSyncedAt: kb?.lastSyncedAt || undefined,
    };
  }

  /**
   * Delete a document from knowledge base
   */
  async deleteDocument(documentId: string, userId: string) {
    const doc = await this.prisma.knowledgeBaseDocument.findFirst({
      where: { id: documentId },
      include: {
        knowledgeBase: {
          select: { userId: true },
        },
      },
    });

    if (!doc || doc.knowledgeBase.userId !== userId) {
      throw new NotFoundException("Document not found");
    }

    // Delete embeddings, child chunks, parent chunks, then document
    await this.prisma.$transaction([
      this.prisma.$executeRaw`
        DELETE FROM child_embeddings
        WHERE child_chunk_id IN (
          SELECT cc.id FROM child_chunks cc
          JOIN parent_chunks pc ON cc.parent_chunk_id = pc.id
          WHERE pc.document_id = ${documentId}::uuid
        )
      `,
      this.prisma.childChunk.deleteMany({
        where: {
          parentChunk: { documentId },
        },
      }),
      this.prisma.parentChunk.deleteMany({
        where: { documentId },
      }),
      this.prisma.knowledgeBaseDocument.delete({
        where: { id: documentId },
      }),
    ]);

    this.logger.log(`Deleted document ${documentId}`);
  }
}
