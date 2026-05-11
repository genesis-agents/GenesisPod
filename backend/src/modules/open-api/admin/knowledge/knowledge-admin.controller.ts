/**
 * Knowledge admin controller —— 2026-05-11 W2
 *
 * Admin 视角的"知识管理"页面后端接口。3 个 tab 的列表 + 详情：
 *   - GET /admin/knowledge/kbs              → 跨用户 KB 列表
 *   - GET /admin/knowledge/kbs/:id          → KB 详情（含 owner / 文档数 / 嵌入状态）
 *   - GET /admin/knowledge/documents        → 跨 KB 的文档列表（admin 全局视角）
 *   - GET /admin/knowledge/documents/:id    → 文档详情（含 chunks / embed 状态）
 *   - GET /admin/knowledge/wiki-pages       → 跨 KB 的 Wiki 页面列表
 *   - GET /admin/knowledge/wiki-pages/:id   → Wiki 页详情（markdown body + sources）
 *
 * 与 ai-app/library/rag 的 user-facing controller 解耦：
 *   - rag.controller 永远按 req.user.id 过滤（PERSONAL/TEAM scope）
 *   - 本 controller 不按 user 过滤，admin 看全量
 */
import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../../../common/guards/jwt-auth.guard";
import { AdminGuard } from "../../../../common/guards/admin.guard";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { Prisma } from "@prisma/client";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller("admin/knowledge")
export class KnowledgeAdminController {
  constructor(private readonly prisma: PrismaService) {}

  // ──────────────── Tab 1: 知识库 ────────────────

  @Get("kbs")
  async listKnowledgeBases(
    @Query("search") search?: string,
    @Query("status") status?: string,
    @Query("type") type?: string,
    @Query("ownerId") ownerId?: string,
    @Query("page") pageStr?: string,
    @Query("pageSize") pageSizeStr?: string,
  ) {
    const page = Math.max(1, parseInt(pageStr ?? "1", 10) || 1);
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(
        1,
        parseInt(pageSizeStr ?? `${DEFAULT_PAGE_SIZE}`, 10) ||
          DEFAULT_PAGE_SIZE,
      ),
    );

    const where: Prisma.KnowledgeBaseWhereInput = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }
    if (status) {
      where.status = status as Prisma.KnowledgeBaseWhereInput["status"];
    }
    if (type) {
      where.type = type as Prisma.KnowledgeBaseWhereInput["type"];
    }
    if (ownerId) {
      where.userId = ownerId;
    }

    const [rows, total] = await Promise.all([
      this.prisma.knowledgeBase.findMany({
        where,
        select: {
          id: true,
          name: true,
          description: true,
          type: true,
          status: true,
          sourceType: true,
          userId: true,
          user: { select: { email: true, fullName: true } },
          createdAt: true,
          updatedAt: true,
          lastSyncedAt: true,
          wikiEnabled: true,
          _count: { select: { documents: true, members: true } },
        },
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.knowledgeBase.count({ where }),
    ]);

    return {
      items: rows.map((kb) => ({
        id: kb.id,
        name: kb.name,
        description: kb.description,
        type: kb.type,
        status: kb.status,
        sourceType: kb.sourceType,
        ownerUserId: kb.userId,
        ownerEmail: kb.user?.email ?? null,
        ownerName: kb.user?.fullName ?? null,
        wikiEnabled: kb.wikiEnabled,
        documentCount: kb._count.documents,
        memberCount: kb._count.members,
        createdAt: kb.createdAt,
        updatedAt: kb.updatedAt,
        lastSyncedAt: kb.lastSyncedAt,
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  @Get("kbs/:id")
  async getKnowledgeBase(@Param("id") id: string) {
    const kb = await this.prisma.knowledgeBase.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, fullName: true } },
        _count: { select: { documents: true, members: true, wikiPages: true } },
        wikiConfig: true,
        members: {
          take: 20,
          include: {
            user: { select: { id: true, email: true, fullName: true } },
          },
        },
      },
    });
    if (!kb) return null;

    // 文档状态聚合（用于侧栏显示）
    const docStatusBuckets = await this.prisma.knowledgeBaseDocument.groupBy({
      by: ["status"],
      where: { knowledgeBaseId: id },
      _count: true,
    });

    return {
      id: kb.id,
      name: kb.name,
      description: kb.description,
      type: kb.type,
      status: kb.status,
      sourceType: kb.sourceType,
      sourceTypes: kb.sourceTypes,
      owner: kb.user,
      wikiEnabled: kb.wikiEnabled,
      wikiConfig: kb.wikiConfig,
      counts: {
        documents: kb._count.documents,
        members: kb._count.members,
        wikiPages: kb._count.wikiPages,
      },
      docStatusBuckets: docStatusBuckets.map((b) => ({
        status: b.status,
        count: b._count,
      })),
      members: kb.members.map((m) => ({
        userId: m.userId,
        role: m.role,
        joinedAt: m.joinedAt,
        email: m.user?.email ?? null,
        fullName: m.user?.fullName ?? null,
      })),
      createdAt: kb.createdAt,
      updatedAt: kb.updatedAt,
      lastSyncedAt: kb.lastSyncedAt,
      lastError: kb.lastError,
    };
  }

  // ──────────────── Tab 2: 文档 ────────────────

  @Get("documents")
  async listDocuments(
    @Query("search") search?: string,
    @Query("status") status?: string,
    @Query("knowledgeBaseId") knowledgeBaseId?: string,
    @Query("sourceType") sourceType?: string,
    @Query("page") pageStr?: string,
    @Query("pageSize") pageSizeStr?: string,
  ) {
    const page = Math.max(1, parseInt(pageStr ?? "1", 10) || 1);
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(
        1,
        parseInt(pageSizeStr ?? `${DEFAULT_PAGE_SIZE}`, 10) ||
          DEFAULT_PAGE_SIZE,
      ),
    );

    const where: Prisma.KnowledgeBaseDocumentWhereInput = {};
    if (search) {
      where.title = { contains: search, mode: "insensitive" };
    }
    if (status) {
      where.status = status as Prisma.KnowledgeBaseDocumentWhereInput["status"];
    }
    if (knowledgeBaseId) {
      where.knowledgeBaseId = knowledgeBaseId;
    }
    if (sourceType) {
      where.sourceType = sourceType;
    }

    const [rows, total] = await Promise.all([
      this.prisma.knowledgeBaseDocument.findMany({
        where,
        select: {
          id: true,
          title: true,
          sourceType: true,
          sourceUrl: true,
          status: true,
          chunkCount: true,
          rawContentSize: true,
          rawContentUri: true,
          knowledgeBaseId: true,
          knowledgeBase: {
            select: {
              id: true,
              name: true,
              user: { select: { email: true } },
            },
          },
          createdAt: true,
          updatedAt: true,
          processedAt: true,
          lastError: true,
        },
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.knowledgeBaseDocument.count({ where }),
    ]);

    return {
      items: rows.map((d) => ({
        id: d.id,
        title: d.title,
        sourceType: d.sourceType,
        sourceUrl: d.sourceUrl,
        status: d.status,
        chunkCount: d.chunkCount,
        rawContentSize: d.rawContentSize,
        offloaded: !!d.rawContentUri,
        knowledgeBaseId: d.knowledgeBaseId,
        knowledgeBaseName: d.knowledgeBase?.name ?? null,
        ownerEmail: d.knowledgeBase?.user?.email ?? null,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
        processedAt: d.processedAt,
        hasError: !!d.lastError,
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  @Get("documents/:id")
  async getDocument(@Param("id") id: string) {
    const doc = await this.prisma.knowledgeBaseDocument.findUnique({
      where: { id },
      include: {
        knowledgeBase: {
          select: {
            id: true,
            name: true,
            user: { select: { id: true, email: true, fullName: true } },
          },
        },
      },
    });
    if (!doc) return null;

    // Chunk + embedding 概览（parent-child 二层 chunk + child embedding）
    const [parentChunks, embeddedChildChunks, totalChildChunks] =
      await Promise.all([
        this.prisma.parentChunk.count({ where: { documentId: id } }),
        this.prisma.childChunk.count({
          where: { documentId: id, embeddings: { some: {} } },
        }),
        this.prisma.childChunk.count({ where: { documentId: id } }),
      ]);

    return {
      id: doc.id,
      title: doc.title,
      sourceType: doc.sourceType,
      sourceUrl: doc.sourceUrl,
      mimeType: doc.mimeType,
      status: doc.status,
      knowledgeBase: doc.knowledgeBase,
      rawContent: doc.rawContent,
      rawContentSize: doc.rawContentSize,
      offloaded: !!doc.rawContentUri,
      rawContentUri: doc.rawContentUri,
      metadata: doc.metadata,
      chunkStats: {
        parentChunks,
        childChunks: totalChildChunks,
        embeddedChildChunks,
        notEmbeddedChildChunks: totalChildChunks - embeddedChildChunks,
      },
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      processedAt: doc.processedAt,
      lastError: doc.lastError,
    };
  }

  // ──────────────── Tab 3: Wiki ────────────────

  @Get("wiki-pages")
  async listWikiPages(
    @Query("search") search?: string,
    @Query("category") category?: string,
    @Query("knowledgeBaseId") knowledgeBaseId?: string,
    @Query("page") pageStr?: string,
    @Query("pageSize") pageSizeStr?: string,
  ) {
    const page = Math.max(1, parseInt(pageStr ?? "1", 10) || 1);
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(
        1,
        parseInt(pageSizeStr ?? `${DEFAULT_PAGE_SIZE}`, 10) ||
          DEFAULT_PAGE_SIZE,
      ),
    );

    const where: Prisma.WikiPageWhereInput = {};
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { slug: { contains: search, mode: "insensitive" } },
      ];
    }
    if (category) {
      where.category = category as Prisma.WikiPageWhereInput["category"];
    }
    if (knowledgeBaseId) {
      where.knowledgeBaseId = knowledgeBaseId;
    }

    const [rows, total] = await Promise.all([
      this.prisma.wikiPage.findMany({
        where,
        select: {
          id: true,
          slug: true,
          title: true,
          category: true,
          oneLiner: true,
          lastEditedBy: true,
          knowledgeBaseId: true,
          knowledgeBase: {
            select: {
              id: true,
              name: true,
              user: { select: { email: true } },
            },
          },
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.wikiPage.count({ where }),
    ]);

    return {
      items: rows.map((p) => ({
        id: p.id,
        slug: p.slug,
        title: p.title,
        category: p.category,
        oneLiner: p.oneLiner,
        lastEditedBy: p.lastEditedBy,
        knowledgeBaseId: p.knowledgeBaseId,
        knowledgeBaseName: p.knowledgeBase?.name ?? null,
        ownerEmail: p.knowledgeBase?.user?.email ?? null,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  @Get("wiki-pages/:id")
  async getWikiPage(@Param("id") id: string) {
    const wiki = await this.prisma.wikiPage.findUnique({
      where: { id },
      include: {
        knowledgeBase: {
          select: {
            id: true,
            name: true,
            user: { select: { id: true, email: true, fullName: true } },
          },
        },
        sources: {
          take: 50,
          include: {
            document: {
              select: {
                id: true,
                title: true,
                sourceType: true,
                sourceUrl: true,
              },
            },
          },
        },
        outboundLinks: { take: 50 },
      },
    });
    if (!wiki) return null;

    return {
      id: wiki.id,
      slug: wiki.slug,
      title: wiki.title,
      category: wiki.category,
      body: wiki.body,
      oneLiner: wiki.oneLiner,
      lastEditedBy: wiki.lastEditedBy,
      contentHash: wiki.contentHash,
      knowledgeBase: wiki.knowledgeBase,
      sources: wiki.sources.map((s) => ({
        documentId: s.documentId,
        spanStart: s.spanStart,
        spanEnd: s.spanEnd,
        quote: s.quote,
        document: s.document,
      })),
      outboundLinks: wiki.outboundLinks.map((l) => ({ ...l })),
      createdAt: wiki.createdAt,
      updatedAt: wiki.updatedAt,
    };
  }
}
