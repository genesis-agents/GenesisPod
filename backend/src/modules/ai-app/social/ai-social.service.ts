import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { ContentCheckerService } from "./services/content-checker.service";
import { PublishExecutorService } from "./services/publish-executor.service";
import { PlaywrightService } from "./services/playwright.service";
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
    private readonly playwright: PlaywrightService,
  ) {}

  // Helper to access prisma with new models
  private get db(): PrismaAny {
    return this.prisma;
  }

  // ==================== 平台连接 ====================

  async getConnections(userId: string) {
    return this.db.socialPlatformConnection.findMany({
      where: { userId },
    });
  }

  // 存储待验证的登录会话
  private pendingLoginSessions: Map<
    string,
    { sessionKey: string; platformType: SocialPlatformType }
  > = new Map();

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

    try {
      // 启动 Playwright 登录会话
      const { sessionKey, screenshot } =
        await this.playwright.startLoginSession(userId, platformType);

      // 保存待验证的会话
      this.pendingLoginSessions.set(userId + "-" + platformType, {
        sessionKey,
        platformType,
      });

      return {
        status: "pending",
        sessionKey,
        screenshot, // base64 截图
        message: "请扫码登录",
      };
    } catch (error) {
      this.logger.error(`Failed to init connection: ${error}`);
      return {
        status: "error",
        message: "启动登录失败，请稍后重试",
      };
    }
  }

  async verifyConnection(userId: string, type: string) {
    const platformType = type.toUpperCase() as SocialPlatformType;
    this.logger.log(`Verifying connection ${platformType} for user ${userId}`);

    // 获取待验证的会话
    const pendingKey = userId + "-" + platformType;
    const pending = this.pendingLoginSessions.get(pendingKey);

    if (!pending) {
      return {
        status: "error",
        message: "没有待验证的登录会话，请重新开始",
      };
    }

    try {
      // 检查登录状态
      const result = await this.playwright.checkLoginStatus(pending.sessionKey);

      if (result.loggedIn) {
        // 登录成功，保存到数据库
        const connection = await this.db.socialPlatformConnection.create({
          data: {
            userId,
            platformType,
            accountName: result.accountName || platformType,
            sessionData: result.sessionData as object,
            isActive: true,
            lastCheckAt: new Date(),
          },
        });

        // 清理登录会话
        await this.playwright.endLoginSession(pending.sessionKey);
        this.pendingLoginSessions.delete(pendingKey);

        return {
          status: "success",
          connection,
          message: "连接成功",
        };
      }

      // 未登录，返回新截图
      return {
        status: "pending",
        screenshot: result.screenshot,
        message: "等待扫码确认",
      };
    } catch (error) {
      this.logger.error(`Failed to verify connection: ${error}`);
      return {
        status: "error",
        message: "验证失败，请重试",
      };
    }
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

  async testConnection(userId: string, connectionId: string) {
    const connection = await this.db.socialPlatformConnection.findFirst({
      where: { id: connectionId, userId },
    });

    if (!connection) {
      throw new NotFoundException("连接不存在");
    }

    // TODO: 实际测试连接状态（如检查 session 有效性）
    // 目前返回 mock 结果
    const isValid = connection.isActive;

    // 更新最后检查时间
    await this.db.socialPlatformConnection.update({
      where: { id: connectionId },
      data: { lastCheckAt: new Date() },
    });

    return {
      success: isValid,
      message: isValid ? "连接正常" : "连接已失效，请重新授权",
    };
  }

  async refreshConnection(userId: string, connectionId: string) {
    const connection = await this.db.socialPlatformConnection.findFirst({
      where: { id: connectionId, userId },
    });

    if (!connection) {
      throw new NotFoundException("连接不存在");
    }

    // TODO: 实际刷新 session（如重新获取 token）
    // 目前只更新时间戳
    return this.db.socialPlatformConnection.update({
      where: { id: connectionId },
      data: {
        lastCheckAt: new Date(),
        updatedAt: new Date(),
      },
    });
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
    // Use $queryRaw because images and tags columns are text[] in database
    // but Prisma schema declares them as Json - causes type mismatch with ORM
    const offset = (options.page - 1) * options.limit;

    // Build WHERE conditions
    const conditions: string[] = [`sc.user_id = '${userId}'`];
    if (options.status) {
      conditions.push(`sc.status = '${options.status.toUpperCase()}'`);
    }
    if (options.contentType) {
      conditions.push(
        `sc.content_type = '${options.contentType.toUpperCase()}'`,
      );
    }
    const whereClause = conditions.join(" AND ");

    // Define result type
    interface ContentRow {
      id: string;
      userId: string;
      connectionId: string | null;
      contentType: string;
      sourceType: string;
      sourceId: string | null;
      sourceUrl: string | null;
      title: string;
      content: string;
      author: string | null;
      digest: string | null;
      coverImageUrl: string | null;
      images: string[];
      tags: string[];
      location: string | null;
      status: string;
      aiProcessLog: unknown;
      aiSuggestions: unknown;
      complianceCheck: unknown;
      reviewStatus: string | null;
      reviewedById: string | null;
      reviewedAt: Date | null;
      reviewNote: string | null;
      scheduledAt: Date | null;
      publishedAt: Date | null;
      autoPublish: boolean;
      externalId: string | null;
      externalUrl: string | null;
      errorMessage: string | null;
      retryCount: number;
      createdAt: Date;
      updatedAt: Date;
      connectionAccountName: string | null;
      connectionPlatformType: string | null;
    }

    // Query contents with connection join
    const contents = (await this.db.$queryRawUnsafe(
      `SELECT
        sc.id,
        sc.user_id AS "userId",
        sc.connection_id AS "connectionId",
        sc.content_type AS "contentType",
        sc.source_type AS "sourceType",
        sc.source_id AS "sourceId",
        sc.source_url AS "sourceUrl",
        sc.title,
        sc.content,
        sc.author,
        sc.digest,
        sc.cover_image_url AS "coverImageUrl",
        sc.images,
        sc.tags,
        sc.location,
        sc.status,
        sc.ai_process_log AS "aiProcessLog",
        sc.ai_suggestions AS "aiSuggestions",
        sc.compliance_check AS "complianceCheck",
        sc.review_status AS "reviewStatus",
        sc.reviewed_by_id AS "reviewedById",
        sc.reviewed_at AS "reviewedAt",
        sc.review_note AS "reviewNote",
        sc.scheduled_at AS "scheduledAt",
        sc.published_at AS "publishedAt",
        sc.auto_publish AS "autoPublish",
        sc.external_id AS "externalId",
        sc.external_url AS "externalUrl",
        sc.error_message AS "errorMessage",
        sc.retry_count AS "retryCount",
        sc.created_at AS "createdAt",
        sc.updated_at AS "updatedAt",
        spc.account_name AS "connectionAccountName",
        spc.platform_type AS "connectionPlatformType"
      FROM social_contents sc
      LEFT JOIN social_platform_connections spc ON sc.connection_id = spc.id
      WHERE ${whereClause}
      ORDER BY sc.created_at DESC
      LIMIT ${options.limit} OFFSET ${offset}`,
    )) as ContentRow[];

    // Query total count
    const countResult = (await this.db.$queryRawUnsafe(
      `SELECT COUNT(*) as count FROM social_contents sc WHERE ${whereClause}`,
    )) as Array<{ count: bigint }>;
    const total = Number(countResult[0]?.count || 0);

    // Transform to expected format
    const transformedContents = contents.map((c: ContentRow) => ({
      ...c,
      connection: c.connectionId
        ? {
            accountName: c.connectionAccountName,
            platformType: c.connectionPlatformType,
          }
        : null,
    }));

    return {
      contents: transformedContents,
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

    // Add checkedAt timestamp for frontend compatibility
    const resultWithTimestamp = {
      ...result,
      checkedAt: new Date().toISOString(),
    };

    await this.db.socialContent.update({
      where: { id: content.id },
      data: {
        complianceCheck: resultWithTimestamp as object,
      },
    });

    return resultWithTimestamp;
  }

  // ==================== 发布管理 ====================

  async publishContent(userId: string, id: string, dto: PublishContentDto) {
    const content = await this.getContent(userId, id);

    if (!content.connectionId && !dto.connectionId) {
      throw new BadRequestException("请选择发布账号");
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
      throw new BadRequestException("只能取消排期或待发布状态的内容");
    }

    return this.db.socialContent.update({
      where: { id: content.id },
      data: {
        status: SocialContentStatus.DRAFT,
        scheduledAt: null,
      },
    });
  }

  async getPublishLogs(userId: string, contentId: string) {
    // 验证内容归属
    await this.getContent(userId, contentId);

    return this.db.socialPublishLog.findMany({
      where: { contentId },
      orderBy: { createdAt: "desc" },
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
