import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { ContentCheckerService } from "./services/content-checker.service";
import { PublishExecutorService } from "./services/publish-executor.service";
import { CreateContentDto } from "./dto/create-content.dto";
import { UpdateContentDto } from "./dto/update-content.dto";
import { PublishContentDto } from "./dto/publish-content.dto";
import {
  SocialPlatformType,
  SocialContentStatus,
  SocialContentSourceType,
} from "./types";

// Prisma client accessor for models not yet migrated
type PrismaAny = any;

@Injectable()
export class AiSocialService {
  private readonly logger = new Logger(AiSocialService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contentChecker: ContentCheckerService,
    private readonly publishExecutor: PublishExecutorService,
  ) {}

  // Helper to access prisma with new models
  private get db(): PrismaAny {
    return this.prisma;
  }

  // ==================== 平台连接 ====================

  async getConnections(userId: string) {
    return this.db.socialPlatformConnection.findMany({
      where: { userId },
      select: {
        id: true,
        platformType: true,
        accountName: true,
        accountId: true,
        avatarUrl: true,
        isActive: true,
        lastCheckAt: true,
        expiresAt: true,
        createdAt: true,
      },
    });
  }

  async initConnection(userId: string, type: string) {
    const platformType = type.toUpperCase() as SocialPlatformType;

    // 检查是否已存在连接
    const existing = await this.db.socialPlatformConnection.findUnique({
      where: {
        userId_platformType: {
          userId,
          platformType,
        },
      },
    });

    if (existing) {
      return {
        status: "existing",
        connection: existing,
        message: "平台已连接，如需重新连接请先断开",
      };
    }

    // TODO: 启动 Playwright 获取登录二维码
    // 这里返回一个占位响应，实际需要集成 Playwright
    return {
      status: "pending",
      qrCodeUrl: null, // Playwright 生成的二维码 URL
      message: "请扫码登录",
    };
  }

  async verifyConnection(userId: string, type: string) {
    const platformType = type.toUpperCase() as SocialPlatformType;
    this.logger.log(`Verifying connection ${platformType} for user ${userId}`);

    // TODO: 检查 Playwright session 状态
    // 如果登录成功，保存 session 到数据库

    return {
      status: "pending",
      message: "等待扫码确认",
    };
  }

  async deleteConnection(userId: string, type: string) {
    const platformType = type.toUpperCase() as SocialPlatformType;

    await this.db.socialPlatformConnection.delete({
      where: {
        userId_platformType: {
          userId,
          platformType,
        },
      },
    });

    return { success: true };
  }

  // ==================== 内容管理 ====================

  async getContents(
    userId: string,
    options: {
      status?: string;
      contentType?: string;
      page: number;
      limit: number;
    },
  ) {
    const where: Record<string, unknown> = { userId };

    if (options.status) {
      where.status = options.status.toUpperCase();
    }

    if (options.contentType) {
      where.contentType = options.contentType.toUpperCase();
    }

    const [contents, total] = await Promise.all([
      this.db.socialContent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (options.page - 1) * options.limit,
        take: options.limit,
        include: {
          connection: {
            select: {
              accountName: true,
              platformType: true,
            },
          },
        },
      }),
      this.db.socialContent.count({ where }),
    ]);

    return {
      contents,
      pagination: {
        page: options.page,
        limit: options.limit,
        total,
        totalPages: Math.ceil(total / options.limit),
      },
    };
  }

  async createContent(userId: string, dto: CreateContentDto) {
    return this.db.socialContent.create({
      data: {
        userId,
        contentType: dto.contentType,
        sourceType: dto.sourceType || SocialContentSourceType.MANUAL,
        sourceId: dto.sourceId,
        sourceUrl: dto.sourceUrl,
        title: dto.title,
        content: dto.content,
        author: dto.author,
        digest: dto.digest,
        coverImageUrl: dto.coverImageUrl,
        images: dto.images || [],
        tags: dto.tags || [],
        location: dto.location,
        status: SocialContentStatus.DRAFT,
      },
    });
  }

  async getContent(userId: string, id: string) {
    const content = await this.db.socialContent.findFirst({
      where: { id, userId },
      include: {
        connection: {
          select: {
            accountName: true,
            platformType: true,
          },
        },
      },
    });

    if (!content) {
      throw new NotFoundException("内容不存在");
    }

    return content;
  }

  async updateContent(userId: string, id: string, dto: UpdateContentDto) {
    const content = await this.getContent(userId, id);

    return this.db.socialContent.update({
      where: { id: content.id },
      data: {
        title: dto.title,
        content: dto.content,
        author: dto.author,
        digest: dto.digest,
        coverImageUrl: dto.coverImageUrl,
        images: dto.images,
        tags: dto.tags,
        location: dto.location,
        connectionId: dto.connectionId,
      },
    });
  }

  async deleteContent(userId: string, id: string) {
    const content = await this.getContent(userId, id);

    await this.db.socialContent.delete({
      where: { id: content.id },
    });

    return { success: true };
  }

  // ==================== 内容检测 ====================

  async checkContent(userId: string, id: string) {
    const content = await this.getContent(userId, id);
    const result = await this.contentChecker.check(content.content);

    await this.db.socialContent.update({
      where: { id: content.id },
      data: {
        complianceCheck: result as object,
      },
    });

    return result;
  }

  // ==================== 发布管理 ====================

  async publishContent(userId: string, id: string, dto: PublishContentDto) {
    const content = await this.getContent(userId, id);

    if (!content.connectionId && !dto.connectionId) {
      throw new Error("请选择发布账号");
    }

    // 更新状态为待发布
    await this.db.socialContent.update({
      where: { id: content.id },
      data: {
        status: SocialContentStatus.PENDING,
        connectionId: dto.connectionId || content.connectionId,
      },
    });

    // 执行发布
    return this.publishExecutor.execute(content.id);
  }

  async scheduleContent(userId: string, id: string, scheduledAt: Date) {
    const content = await this.getContent(userId, id);

    return this.db.socialContent.update({
      where: { id: content.id },
      data: {
        status: SocialContentStatus.SCHEDULED,
        scheduledAt,
      },
    });
  }

  async cancelPublish(userId: string, id: string) {
    const content = await this.getContent(userId, id);

    if (
      content.status !== SocialContentStatus.SCHEDULED &&
      content.status !== SocialContentStatus.PENDING
    ) {
      throw new Error("只能取消排期或待发布状态的内容");
    }

    return this.db.socialContent.update({
      where: { id: content.id },
      data: {
        status: SocialContentStatus.DRAFT,
        scheduledAt: null,
      },
    });
  }

  // ==================== 导入来源 ====================

  async getExploreSources(
    _userId: string,
    options: { type?: string; page: number; limit: number },
  ) {
    const where: Record<string, unknown> = {};

    if (options.type) {
      where.type = options.type.toUpperCase();
    }

    const resources = await this.prisma.resource.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (options.page - 1) * options.limit,
      take: options.limit,
      select: {
        id: true,
        type: true,
        title: true,
        abstract: true,
        sourceUrl: true,
        thumbnailUrl: true,
        createdAt: true,
      },
    });

    return resources;
  }

  async getResearchSources(userId: string) {
    const topics = await this.prisma.researchTopic.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        updatedAt: true,
      },
    });

    return topics;
  }

  async getOfficeSources(userId: string) {
    const documents = await this.prisma.officeDocument.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: {
        id: true,
        title: true,
        type: true,
        updatedAt: true,
      },
    });

    return documents;
  }

  async getWritingSources(userId: string) {
    const projects = await this.prisma.writingProject.findMany({
      where: { ownerId: userId },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        updatedAt: true,
      },
    });

    return projects;
  }
}
