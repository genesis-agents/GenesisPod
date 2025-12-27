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
  sourceTypes?: string[]; // 多数据源类型
  googleDriveConnectionId?: string;
  googleDriveFolderIds?: string[];
  type?: "PERSONAL" | "TEAM"; // 知识库类型
  teamId?: string; // 团队ID（团队知识库时必需）
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

    // Auto-detect Google Drive connection if GOOGLE_DRIVE is in sourceTypes
    let googleDriveConnectionId = input.googleDriveConnectionId;
    const hasGoogleDrive =
      input.sourceType === KnowledgeBaseSourceType.GOOGLE_DRIVE ||
      input.sourceTypes?.includes("GOOGLE_DRIVE");

    if (hasGoogleDrive && !googleDriveConnectionId) {
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

    // 如果没有提供 sourceTypes，则使用 sourceType 作为默认值
    const sourceTypes = input.sourceTypes?.length
      ? input.sourceTypes
      : [input.sourceType];

    const kb = await this.prisma.knowledgeBase.create({
      data: {
        name: input.name,
        description: input.description,
        sourceType: input.sourceType,
        sourceTypes, // 多数据源类型数组
        status: KnowledgeBaseStatus.PENDING,
        userId,
        type: input.type || "PERSONAL", // 默认为个人知识库
        teamId: input.teamId,
        googleDriveConnectionId,
        googleDriveFolderIds: input.googleDriveFolderIds || [],
      },
    });

    this.logger.log(
      `Knowledge base created: ${kb.id}, type: ${kb.type}, teamId: ${kb.teamId}`,
    );

    return kb;
  }

  /**
   * Get knowledge base by ID
   */
  async findById(id: string, userId?: string) {
    // Use raw SQL with UUID casting when userId is provided to fix type mismatch
    if (userId) {
      const result = await this.prisma.$queryRaw<
        Array<{
          id: string;
          name: string;
          description: string | null;
          source_type: string;
          source_types: string[];
          status: string;
          type: string;
          user_id: string;
          team_id: string | null;
          embedding_model: string | null;
          google_drive_connection_id: string | null;
          google_drive_folder_ids: string[];
          created_at: Date;
          updated_at: Date;
          last_synced_at: Date | null;
          last_error: string | null;
        }>
      >`
        SELECT * FROM knowledge_bases
        WHERE id = ${id}::uuid AND user_id = ${userId}::uuid
        LIMIT 1
      `;

      if (!result.length) {
        throw new NotFoundException("Knowledge base not found");
      }

      const kbRow = result[0];

      // Fetch related data separately
      const [documents, googleDriveConnection] = await Promise.all([
        this.prisma.knowledgeBaseDocument.findMany({
          where: { knowledgeBaseId: id },
          select: {
            id: true,
            title: true,
            sourceType: true,
            status: true,
            chunkCount: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        }),
        kbRow.google_drive_connection_id
          ? this.prisma.googleDriveConnection.findUnique({
              where: { id: kbRow.google_drive_connection_id },
              select: {
                id: true,
                email: true,
                displayName: true,
              },
            })
          : null,
      ]);

      return {
        id: kbRow.id,
        name: kbRow.name,
        description: kbRow.description,
        sourceType: kbRow.source_type,
        sourceTypes: kbRow.source_types,
        status: kbRow.status,
        type: kbRow.type,
        userId: kbRow.user_id,
        teamId: kbRow.team_id,
        embeddingModel: kbRow.embedding_model,
        googleDriveConnectionId: kbRow.google_drive_connection_id,
        googleDriveFolderIds: kbRow.google_drive_folder_ids,
        createdAt: kbRow.created_at,
        updatedAt: kbRow.updated_at,
        lastSyncedAt: kbRow.last_synced_at,
        lastError: kbRow.last_error,
        documents,
        googleDriveConnection,
      };
    }

    // When no userId, use standard Prisma query (no UUID comparison issue)
    const kb = await this.prisma.knowledgeBase.findFirst({
      where: { id },
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
   * List knowledge bases for user (includes both owned and member-of)
   */
  async findByUser(userId: string) {
    // Use raw SQL to handle UUID type mismatch between Prisma String and PostgreSQL UUID
    // This fixes the "operator does not exist: uuid = text" error
    const knowledgeBases = await this.prisma.$queryRaw<
      Array<{
        id: string;
        name: string;
        description: string | null;
        source_type: string;
        source_types: string[];
        status: string;
        type: string;
        user_id: string;
        team_id: string | null;
        embedding_model: string | null;
        google_drive_connection_id: string | null;
        google_drive_folder_ids: string[];
        created_at: Date;
        updated_at: Date;
        last_synced_at: Date | null;
        last_error: string | null;
        document_count: bigint;
        member_count: bigint;
      }>
    >`
      SELECT
        kb.*,
        COUNT(DISTINCT doc.id) as document_count,
        COUNT(DISTINCT mem.id) as member_count
      FROM knowledge_bases kb
      LEFT JOIN knowledge_base_documents doc ON doc.knowledge_base_id = kb.id
      LEFT JOIN knowledge_base_members mem ON mem.knowledge_base_id = kb.id
      WHERE kb.user_id = ${userId}::uuid
         OR (kb.type = 'TEAM' AND EXISTS (
           SELECT 1 FROM knowledge_base_members m
           WHERE m.knowledge_base_id = kb.id
           AND m.user_id = ${userId}::uuid
         ))
      GROUP BY kb.id
      ORDER BY kb.created_at DESC
    `;

    // Transform to match the expected format
    return knowledgeBases.map((kb) => ({
      id: kb.id,
      name: kb.name,
      description: kb.description,
      sourceType: kb.source_type,
      sourceTypes: kb.source_types,
      status: kb.status,
      type: kb.type,
      userId: kb.user_id,
      teamId: kb.team_id,
      embeddingModel: kb.embedding_model,
      googleDriveConnectionId: kb.google_drive_connection_id,
      googleDriveFolderIds: kb.google_drive_folder_ids,
      createdAt: kb.created_at,
      updatedAt: kb.updated_at,
      lastSyncedAt: kb.last_synced_at,
      lastError: kb.last_error,
      _count: {
        documents: Number(kb.document_count),
      },
      members: Array(Number(kb.member_count)).fill({ id: "" }),
    }));
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
      sourceTypes?: string[];
      googleDriveFolderIds?: string[];
    },
  ) {
    // Verify ownership (throws if not found)
    await this.findById(id, userId);

    // Build update data
    const updateData: {
      name?: string;
      description?: string;
      sourceTypes?: string[];
      googleDriveFolderIds?: string[];
    } = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined)
      updateData.description = data.description;
    if (data.sourceTypes !== undefined)
      updateData.sourceTypes = data.sourceTypes;
    if (data.googleDriveFolderIds !== undefined)
      updateData.googleDriveFolderIds = data.googleDriveFolderIds;

    return this.prisma.knowledgeBase.update({
      where: { id },
      data: updateData,
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
          embedding_count: bigint;
          total_tokens: bigint;
        }>
      >`
        SELECT
          COUNT(DISTINCT pc.id) as parent_count,
          COUNT(DISTINCT cc.id) as child_count,
          COUNT(DISTINCT ce.id) as embedding_count,
          COALESCE(SUM(pc.token_count), 0) as total_tokens
        FROM parent_chunks pc
        LEFT JOIN child_chunks cc ON cc.parent_chunk_id = pc.id
        LEFT JOIN child_embeddings ce ON ce.child_chunk_id = cc.id
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
      embedding_count: BigInt(0),
      total_tokens: BigInt(0),
    };

    return {
      documentCount: docCount,
      parentChunkCount: Number(counts.parent_count),
      childChunkCount: Number(counts.child_count),
      embeddingCount: Number(counts.embedding_count),
      totalTokens: Number(counts.total_tokens),
      lastSyncedAt: kb?.lastSyncedAt || undefined,
    };
  }

  /**
   * List documents in a knowledge base with vectorization status
   */
  async listDocuments(knowledgeBaseId: string) {
    const documents = await this.prisma.knowledgeBaseDocument.findMany({
      where: { knowledgeBaseId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        sourceType: true,
        sourceUrl: true,
        mimeType: true,
        status: true,
        processedAt: true,
        chunkCount: true,
        lastError: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Get embedding counts for each document
    const embeddingCounts = await this.prisma.$queryRaw<
      Array<{ document_id: string; embedding_count: bigint }>
    >`
      SELECT
        d.id as document_id,
        COUNT(DISTINCT ce.id) as embedding_count
      FROM knowledge_base_documents d
      LEFT JOIN parent_chunks pc ON pc.document_id = d.id
      LEFT JOIN child_chunks cc ON cc.parent_chunk_id = pc.id
      LEFT JOIN child_embeddings ce ON ce.child_chunk_id = cc.id
      WHERE d.knowledge_base_id = ${knowledgeBaseId}::uuid
      GROUP BY d.id
    `;

    const embeddingMap = new Map(
      embeddingCounts.map((e) => [e.document_id, Number(e.embedding_count)]),
    );

    return documents.map((doc) => ({
      ...doc,
      embeddingCount: embeddingMap.get(doc.id) || 0,
      isVectorized:
        doc.status === "READY" && (embeddingMap.get(doc.id) || 0) > 0,
    }));
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

  // ============ 成员管理 (团队知识库) ============

  /**
   * 获取知识库成员列表
   */
  async getMembers(knowledgeBaseId: string, requesterId: string) {
    // 验证请求者有权限查看
    const kb = await this.prisma.knowledgeBase.findFirst({
      where: { id: knowledgeBaseId },
      select: { userId: true, type: true },
    });

    if (!kb) {
      throw new NotFoundException("Knowledge base not found");
    }

    // 只有所有者或成员可以查看成员列表
    const isOwner = kb.userId === requesterId;
    const isMember = await this.prisma.knowledgeBaseMember.findFirst({
      where: { knowledgeBaseId, userId: requesterId },
    });

    if (!isOwner && !isMember) {
      throw new NotFoundException("Knowledge base not found");
    }

    return this.prisma.knowledgeBaseMember.findMany({
      where: { knowledgeBaseId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
    });
  }

  /**
   * 添加成员到知识库
   */
  async addMember(
    knowledgeBaseId: string,
    requesterId: string,
    memberEmail: string,
    role: "ADMIN" | "EDITOR" | "VIEWER" = "VIEWER",
  ) {
    // 验证请求者是所有者或管理员
    const kb = await this.prisma.knowledgeBase.findFirst({
      where: { id: knowledgeBaseId },
      select: { userId: true, type: true },
    });

    if (!kb) {
      throw new NotFoundException("Knowledge base not found");
    }

    const isOwner = kb.userId === requesterId;
    const requesterMembership = await this.prisma.knowledgeBaseMember.findFirst(
      {
        where: { knowledgeBaseId, userId: requesterId, role: "ADMIN" },
      },
    );

    if (!isOwner && !requesterMembership) {
      throw new Error("You do not have permission to add members");
    }

    // 查找用户
    const user = await this.prisma.user.findFirst({
      where: { email: memberEmail },
    });

    if (!user) {
      throw new NotFoundException(`User with email ${memberEmail} not found`);
    }

    // 检查是否已是成员
    const existingMember = await this.prisma.knowledgeBaseMember.findFirst({
      where: { knowledgeBaseId, userId: user.id },
    });

    if (existingMember) {
      throw new Error("User is already a member");
    }

    // 如果是所有者，不需要添加为成员
    if (kb.userId === user.id) {
      throw new Error("Owner cannot be added as a member");
    }

    const member = await this.prisma.knowledgeBaseMember.create({
      data: {
        knowledgeBaseId,
        userId: user.id,
        role,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            avatarUrl: true,
          },
        },
      },
    });

    this.logger.log(
      `Added member ${user.email} to KB ${knowledgeBaseId} with role ${role}`,
    );

    return member;
  }

  /**
   * 更新成员角色
   */
  async updateMemberRole(
    knowledgeBaseId: string,
    requesterId: string,
    memberId: string,
    role: "ADMIN" | "EDITOR" | "VIEWER",
  ) {
    // 验证请求者是所有者或管理员
    const kb = await this.prisma.knowledgeBase.findFirst({
      where: { id: knowledgeBaseId },
      select: { userId: true },
    });

    if (!kb) {
      throw new NotFoundException("Knowledge base not found");
    }

    const isOwner = kb.userId === requesterId;
    const requesterMembership = await this.prisma.knowledgeBaseMember.findFirst(
      {
        where: { knowledgeBaseId, userId: requesterId, role: "ADMIN" },
      },
    );

    if (!isOwner && !requesterMembership) {
      throw new Error("You do not have permission to update member roles");
    }

    // 查找成员
    const member = await this.prisma.knowledgeBaseMember.findFirst({
      where: { id: memberId, knowledgeBaseId },
    });

    if (!member) {
      throw new NotFoundException("Member not found");
    }

    const updated = await this.prisma.knowledgeBaseMember.update({
      where: { id: memberId },
      data: { role },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            avatarUrl: true,
          },
        },
      },
    });

    this.logger.log(
      `Updated member ${memberId} role to ${role} in KB ${knowledgeBaseId}`,
    );

    return updated;
  }

  /**
   * 移除成员
   */
  async removeMember(
    knowledgeBaseId: string,
    requesterId: string,
    memberId: string,
  ) {
    // 验证请求者是所有者或管理员
    const kb = await this.prisma.knowledgeBase.findFirst({
      where: { id: knowledgeBaseId },
      select: { userId: true },
    });

    if (!kb) {
      throw new NotFoundException("Knowledge base not found");
    }

    const isOwner = kb.userId === requesterId;
    const requesterMembership = await this.prisma.knowledgeBaseMember.findFirst(
      {
        where: { knowledgeBaseId, userId: requesterId, role: "ADMIN" },
      },
    );

    if (!isOwner && !requesterMembership) {
      throw new Error("You do not have permission to remove members");
    }

    // 查找成员
    const member = await this.prisma.knowledgeBaseMember.findFirst({
      where: { id: memberId, knowledgeBaseId },
    });

    if (!member) {
      throw new NotFoundException("Member not found");
    }

    await this.prisma.knowledgeBaseMember.delete({
      where: { id: memberId },
    });

    this.logger.log(`Removed member ${memberId} from KB ${knowledgeBaseId}`);
  }

  /**
   * 检查用户是否有知识库访问权限
   */
  async hasAccess(
    knowledgeBaseId: string,
    userId: string,
    minRole?: "OWNER" | "ADMIN" | "EDITOR" | "VIEWER",
  ): Promise<boolean> {
    const kb = await this.prisma.knowledgeBase.findFirst({
      where: { id: knowledgeBaseId },
      select: { userId: true, type: true },
    });

    if (!kb) return false;

    // 所有者总是有访问权限
    if (kb.userId === userId) return true;

    // 个人知识库只有所有者可以访问
    if (kb.type === "PERSONAL") return false;

    // 团队知识库检查成员资格
    const member = await this.prisma.knowledgeBaseMember.findFirst({
      where: { knowledgeBaseId, userId },
    });

    if (!member) return false;

    if (!minRole || minRole === "VIEWER") return true;

    const roleHierarchy = { OWNER: 0, ADMIN: 1, EDITOR: 2, VIEWER: 3 };
    return roleHierarchy[member.role] <= roleHierarchy[minRole];
  }
}
