import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { AIModelService } from "./ai-model.service";
import {
  CreateDocumentDto,
  UpdateDocumentDto,
  CreateVersionDto,
  AddResourceRefDto,
  OfficeDocumentType,
  OfficeDocumentStatus,
  VersionTrigger,
  ResourceRefType,
} from "./office-document.dto";

// ============================================================================
// Service
// ============================================================================

@Injectable()
export class OfficeDocumentService {
  private readonly logger = new Logger(OfficeDocumentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiModelService: AIModelService,
  ) {}

  // ==========================================================================
  // Document CRUD
  // ==========================================================================

  /**
   * 创建新文档
   */
  async createDocument(userId: string, dto: CreateDocumentDto) {
    this.logger.log(
      `[createDocument] Creating document for user ${userId}: ${dto.title}`,
    );

    // 动态获取 AI 模型 (严禁硬编码!)
    const textModel = await this.aiModelService.getDefaultTextModel(
      dto.aiConfig?.textModelId,
    );

    const document = await this.prisma.officeDocument.create({
      data: {
        userId,
        workspaceId: dto.workspaceId,
        title: dto.title,
        type: dto.type,
        status: "DRAFT" as const,
        content: {}, // 初始空内容
        metadata: {
          slideCount: 0,
          wordCount: 0,
        },
        aiConfig: {
          textModelId: textModel.id,
          imageModelId: dto.aiConfig?.imageModelId,
          temperature: dto.aiConfig?.temperature ?? 0.7,
          style: dto.aiConfig?.style ?? "genspark",
        },
      },
      include: {
        versions: true,
        resourceRefs: {
          include: {
            resource: {
              select: {
                id: true,
                title: true,
                type: true,
                thumbnailUrl: true,
                aiSummary: true,
              },
            },
          },
        },
      },
    });

    // 如果有资源引用，创建关联
    if (dto.resourceIds && dto.resourceIds.length > 0) {
      await this.addResourceRefs(document.id, dto.resourceIds);
    }

    this.logger.log(`[createDocument] Document created: ${document.id}`);
    return document;
  }

  /**
   * 获取文档详情
   */
  async getDocument(documentId: string, userId: string) {
    const document = await this.prisma.officeDocument.findFirst({
      where: {
        id: documentId,
        userId, // 确保用户有权限
      },
      include: {
        versions: {
          orderBy: { versionNumber: "desc" },
          take: 20, // 最多返回最近 20 个版本
        },
        resourceRefs: {
          include: {
            resource: {
              select: {
                id: true,
                title: true,
                type: true,
                thumbnailUrl: true,
                aiSummary: true,
              },
            },
          },
        },
      },
    });

    if (!document) {
      throw new NotFoundException(`Document ${documentId} not found`);
    }

    return document;
  }

  /**
   * 获取用户的文档列表
   */
  async listDocuments(
    userId: string,
    options?: {
      type?: OfficeDocumentType;
      status?: OfficeDocumentStatus;
      workspaceId?: string;
      limit?: number;
      offset?: number;
    },
  ) {
    const where: any = { userId };
    if (options?.type) where.type = options.type;
    if (options?.status) where.status = options.status;
    if (options?.workspaceId) where.workspaceId = options.workspaceId;

    const [documents, total] = await Promise.all([
      this.prisma.officeDocument.findMany({
        where,
        include: {
          _count: {
            select: { versions: true },
          },
        },
        orderBy: { updatedAt: "desc" },
        take: options?.limit ?? 20,
        skip: options?.offset ?? 0,
      }),
      this.prisma.officeDocument.count({ where }),
    ]);

    return { documents, total };
  }

  /**
   * 更新文档
   */
  async updateDocument(
    documentId: string,
    userId: string,
    dto: UpdateDocumentDto,
    autoSaveVersion = true,
  ) {
    const document = await this.getDocument(documentId, userId);

    // 如果内容有变化且需要自动保存版本
    if (
      autoSaveVersion &&
      dto.content &&
      JSON.stringify(dto.content) !== JSON.stringify(document.content)
    ) {
      await this.createVersion(documentId, userId, {
        trigger: "USER_EDIT" as VersionTrigger,
        triggerSource: "Content update",
      });
    }

    const updated = await this.prisma.officeDocument.update({
      where: { id: documentId },
      data: {
        ...(dto.title && { title: dto.title }),
        ...(dto.content && { content: dto.content }),
        ...(dto.markdown && { markdown: dto.markdown }),
        ...(dto.metadata && { metadata: dto.metadata }),
        ...(dto.status && { status: dto.status }),
      },
      include: {
        versions: {
          orderBy: { versionNumber: "desc" },
          take: 5,
        },
      },
    });

    return updated;
  }

  /**
   * 删除文档
   */
  async deleteDocument(documentId: string, userId: string) {
    // 验证权限
    await this.getDocument(documentId, userId);

    await this.prisma.officeDocument.delete({
      where: { id: documentId },
    });

    this.logger.log(`[deleteDocument] Document deleted: ${documentId}`);
    return { success: true };
  }

  // ==========================================================================
  // Version Management (Genspark 风格)
  // ==========================================================================

  /**
   * 创建新版本 (保存点)
   */
  async createVersion(
    documentId: string,
    userId: string,
    dto: CreateVersionDto,
  ) {
    const document = await this.getDocument(documentId, userId);

    // 获取当前最大版本号
    const maxVersion = await this.prisma.officeDocumentVersion.findFirst({
      where: { documentId },
      orderBy: { versionNumber: "desc" },
      select: { versionNumber: true },
    });

    const newVersionNumber = (maxVersion?.versionNumber ?? 0) + 1;
    const versionName = `保存点-${newVersionNumber}`;

    // 生成版本描述 (如果没有提供)
    let description = dto.description;
    if (!description) {
      description = await this.generateVersionDescription(
        document,
        dto.trigger,
      );
    }

    // 创建版本
    const version = await this.prisma.officeDocumentVersion.create({
      data: {
        documentId,
        versionNumber: newVersionNumber,
        name: versionName,
        description,
        contentSnapshot: document.content as any,
        markdownSnapshot: document.markdown,
        metadataSnapshot: document.metadata as any,
        trigger: dto.trigger,
        triggerSource: dto.triggerSource,
        aiModelId: (document.aiConfig as any)?.textModelId,
      },
    });

    // 更新文档的当前版本ID
    await this.prisma.officeDocument.update({
      where: { id: documentId },
      data: { currentVersionId: version.id },
    });

    this.logger.log(
      `[createVersion] Version ${versionName} created for document ${documentId}`,
    );
    return version;
  }

  /**
   * 获取文档的所有版本
   */
  async getVersions(documentId: string, userId: string) {
    // 验证权限
    await this.getDocument(documentId, userId);

    return this.prisma.officeDocumentVersion.findMany({
      where: { documentId },
      orderBy: { versionNumber: "desc" },
    });
  }

  /**
   * 获取特定版本详情
   */
  async getVersion(documentId: string, versionId: string, userId: string) {
    await this.getDocument(documentId, userId);

    const version = await this.prisma.officeDocumentVersion.findFirst({
      where: {
        id: versionId,
        documentId,
      },
    });

    if (!version) {
      throw new NotFoundException(`Version ${versionId} not found`);
    }

    return version;
  }

  /**
   * 恢复到特定版本
   */
  async restoreVersion(documentId: string, versionId: string, userId: string) {
    await this.getDocument(documentId, userId);
    const version = await this.getVersion(documentId, versionId, userId);

    // 先保存当前状态为新版本
    await this.createVersion(documentId, userId, {
      trigger: "MANUAL_SAVE" as VersionTrigger,
      triggerSource: `Restored from version: ${version.name}`,
    });

    // 恢复内容
    const restored = await this.prisma.officeDocument.update({
      where: { id: documentId },
      data: {
        content: version.contentSnapshot as any,
        markdown: version.markdownSnapshot,
        metadata: version.metadataSnapshot as any,
        currentVersionId: version.id,
      },
    });

    this.logger.log(
      `[restoreVersion] Document ${documentId} restored to version ${version.name}`,
    );
    return restored;
  }

  /**
   * 对比两个版本
   */
  async compareVersions(
    documentId: string,
    version1Id: string,
    version2Id: string,
    userId: string,
  ) {
    const [v1, v2] = await Promise.all([
      this.getVersion(documentId, version1Id, userId),
      this.getVersion(documentId, version2Id, userId),
    ]);

    // 简单对比，返回两个版本的内容
    // 实际应用中可以使用 diff 算法生成详细差异
    return {
      version1: {
        id: v1.id,
        name: v1.name,
        versionNumber: v1.versionNumber,
        content: v1.contentSnapshot,
        metadata: v1.metadataSnapshot,
        createdAt: v1.createdAt,
      },
      version2: {
        id: v2.id,
        name: v2.name,
        versionNumber: v2.versionNumber,
        content: v2.contentSnapshot,
        metadata: v2.metadataSnapshot,
        createdAt: v2.createdAt,
      },
    };
  }

  // ==========================================================================
  // Resource References (@ 引用系统)
  // ==========================================================================

  /**
   * 添加资源引用
   */
  async addResourceRef(
    documentId: string,
    userId: string,
    dto: AddResourceRefDto,
  ) {
    await this.getDocument(documentId, userId);

    // 检查资源是否存在
    const resource = await this.prisma.resource.findUnique({
      where: { id: dto.resourceId },
    });
    if (!resource) {
      throw new NotFoundException(`Resource ${dto.resourceId} not found`);
    }

    // 创建引用 (upsert 避免重复)
    const ref = await this.prisma.officeDocumentResourceRef.upsert({
      where: {
        documentId_resourceId: {
          documentId,
          resourceId: dto.resourceId,
        },
      },
      create: {
        documentId,
        resourceId: dto.resourceId,
        refType: dto.refType ?? ("PRIMARY" as ResourceRefType),
      },
      update: {
        refType: dto.refType ?? ("PRIMARY" as ResourceRefType),
      },
      include: {
        resource: {
          select: {
            id: true,
            title: true,
            type: true,
            thumbnailUrl: true,
            aiSummary: true,
          },
        },
      },
    });

    return ref;
  }

  /**
   * 批量添加资源引用
   */
  async addResourceRefs(
    documentId: string,
    resourceIds: string[],
    refType?: ResourceRefType,
  ) {
    const refs = await Promise.all(
      resourceIds.map((resourceId) =>
        this.prisma.officeDocumentResourceRef.upsert({
          where: {
            documentId_resourceId: {
              documentId,
              resourceId,
            },
          },
          create: {
            documentId,
            resourceId,
            refType: refType ?? ("PRIMARY" as ResourceRefType),
          },
          update: {},
        }),
      ),
    );

    return refs;
  }

  /**
   * 移除资源引用
   */
  async removeResourceRef(
    documentId: string,
    resourceId: string,
    userId: string,
  ) {
    await this.getDocument(documentId, userId);

    await this.prisma.officeDocumentResourceRef.delete({
      where: {
        documentId_resourceId: {
          documentId,
          resourceId,
        },
      },
    });

    return { success: true };
  }

  /**
   * 获取文档的所有资源引用
   */
  async getResourceRefs(documentId: string, userId: string) {
    await this.getDocument(documentId, userId);

    return this.prisma.officeDocumentResourceRef.findMany({
      where: { documentId },
      include: {
        resource: {
          select: {
            id: true,
            title: true,
            type: true,
            thumbnailUrl: true,
            aiSummary: true,
            abstract: true,
          },
        },
      },
    });
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * 生成版本描述 (AI 辅助)
   * TODO: 实际调用 AI 模型生成描述
   */
  private async generateVersionDescription(
    document: any,
    trigger: VersionTrigger,
  ): Promise<string> {
    const metadata = document.metadata as any;
    const typeLabel = this.getDocumentTypeLabel(document.type);

    switch (trigger) {
      case "AI_GENERATION":
        return `AI 生成${typeLabel}，共 ${metadata?.slideCount || metadata?.wordCount || 0} ${
          document.type === "PPT" ? "页" : "字"
        }`;
      case "USER_EDIT":
        return `用户编辑${typeLabel}内容`;
      case "MANUAL_SAVE":
        return `手动保存`;
      case "AUTO_SAVE":
        return `自动保存`;
      default:
        return `版本更新`;
    }
  }

  private getDocumentTypeLabel(type: OfficeDocumentType): string {
    const labels: Record<OfficeDocumentType, string> = {
      ARTICLE: "文章",
      PPT: "PPT",
      SPREADSHEET: "表格",
      REPORT: "报告",
      PROPOSAL: "提案",
      RESEARCH: "研究文档",
    };
    return labels[type] || "文档";
  }
}
