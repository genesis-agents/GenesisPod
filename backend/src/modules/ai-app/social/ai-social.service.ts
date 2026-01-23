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

  // 防止并发验证的锁
  private verifyingConnections: Set<string> = new Set();

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

      this.logger.log(
        `Login session created for ${platformType}, sessionKey: ${sessionKey}`,
      );

      return {
        status: "pending",
        sessionKey,
        screenshot, // base64 截图
        message: "请扫码登录",
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to init connection for ${platformType}: ${errorMsg}`,
      );
      return {
        status: "error",
        message: `启动登录失败: ${errorMsg}`,
      };
    }
  }

  async verifyConnection(userId: string, type: string) {
    const platformType = type.toUpperCase() as SocialPlatformType;
    const pendingKey = userId + "-" + platformType;

    // 防止并发验证 - 如果已经在验证中，直接返回pending状态
    if (this.verifyingConnections.has(pendingKey)) {
      this.logger.debug(`Verification already in progress for ${pendingKey}`);
      return {
        status: "pending",
        message: "验证中，请稍候...",
      };
    }

    this.logger.log(`Verifying connection ${platformType} for user ${userId}`);

    // 获取待验证的会话
    const pending = this.pendingLoginSessions.get(pendingKey);

    // 调试日志：显示当前所有待验证会话
    this.logger.debug(
      `Current pending sessions: ${Array.from(this.pendingLoginSessions.keys()).join(", ") || "none"}`,
    );

    if (!pending) {
      this.logger.warn(
        `No pending session found for key: ${pendingKey}. User may need to restart login.`,
      );
      return {
        status: "error",
        message: "没有待验证的登录会话，请重新开始连接流程",
      };
    }

    // 获取锁
    this.verifyingConnections.add(pendingKey);

    try {
      // 检查登录状态
      const result = await this.playwright.checkLoginStatus(pending.sessionKey);

      if (result.loggedIn) {
        // 验证 sessionData 有有效的 cookies
        const hasValidCookies =
          result.sessionData?.cookies && result.sessionData.cookies.length > 0;
        if (!hasValidCookies) {
          this.logger.warn(
            `Login detected but no valid cookies in sessionData, returning pending`,
          );
          return {
            status: "pending",
            screenshot: result.screenshot,
            message: "登录检测中，请稍候...",
          };
        }

        // 登录成功，使用 upsert 处理已存在的连接
        const connection = await this.db.socialPlatformConnection.upsert({
          where: {
            userId_platformType: {
              userId,
              platformType,
            },
          },
          update: {
            accountName: result.accountName || platformType,
            sessionData: JSON.stringify(result.sessionData),
            isActive: true,
            lastCheckAt: new Date(),
          },
          create: {
            userId,
            platformType,
            accountName: result.accountName || platformType,
            sessionData: JSON.stringify(result.sessionData),
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
      this.logger.debug(`Login not detected yet, returning screenshot`);
      return {
        status: "pending",
        screenshot: result.screenshot,
        message: "等待扫码确认",
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to verify connection for ${platformType}: ${errorMsg}`,
      );
      return {
        status: "error",
        message: `验证失败: ${errorMsg}`,
      };
    } finally {
      // 释放锁
      this.verifyingConnections.delete(pendingKey);
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

    // 实际验证会话有效性
    const validationResult = await this.validateSession(connection);

    // 更新最后检查时间和状态
    await this.db.socialPlatformConnection.update({
      where: { id: connectionId },
      data: {
        lastCheckAt: new Date(),
        isActive: validationResult.isValid,
      },
    });

    return {
      success: validationResult.isValid,
      message: validationResult.isValid
        ? "连接正常"
        : validationResult.message || "连接已失效，请重新授权",
    };
  }

  /**
   * 验证会话是否仍然有效
   */
  private async validateSession(connection: any): Promise<{
    isValid: boolean;
    message?: string;
  }> {
    if (!connection.sessionData) {
      return { isValid: false, message: "无会话数据" };
    }

    const contextId = `validate-${connection.id}-${Date.now()}`;

    try {
      // 恢复会话
      const sessionData =
        typeof connection.sessionData === "string"
          ? JSON.parse(connection.sessionData)
          : connection.sessionData;

      await this.playwright.restoreSession(contextId, sessionData);
      const page = await this.playwright.createPage(contextId);

      // 根据平台类型验证
      let isValid = false;
      let message = "";

      if (connection.platformType === SocialPlatformType.WECHAT_MP) {
        isValid = await this.validateWechatSession(page);
        if (!isValid) message = "微信公众号登录已过期";
      } else if (connection.platformType === SocialPlatformType.XIAOHONGSHU) {
        isValid = await this.validateXiaohongshuSession(page);
        if (!isValid) message = "小红书登录已过期";
      } else {
        return { isValid: false, message: "不支持的平台类型" };
      }

      return { isValid, message };
    } catch (error) {
      this.logger.error(
        `Session validation failed: ${(error as Error).message}`,
      );
      return { isValid: false, message: "验证失败，请重新连接" };
    } finally {
      await this.playwright.closeContext(contextId);
    }
  }

  private async validateWechatSession(page: any): Promise<boolean> {
    try {
      await page.goto("https://mp.weixin.qq.com/cgi-bin/home", {
        timeout: 30000,
      });
      await page
        .waitForLoadState("networkidle", { timeout: 15000 })
        .catch(() => {});

      const url = page.url();

      // 如果重定向到登录页，说明未登录
      if (url.includes("/cgi-bin/bizlogin") || url.includes("action=login")) {
        this.logger.debug("WeChat validation: redirected to login page");
        return false;
      }

      // 检查是否在后台
      if (url.includes("/cgi-bin/home") || url.includes("/cgi-bin/frame")) {
        this.logger.debug("WeChat validation: in backend, session valid");
        return true;
      }

      // 检查页面元素
      const selectors = [
        ".weui-desktop-account__nickname",
        "#menuBar",
        ".main_bd",
      ];
      for (const selector of selectors) {
        const element = await page.$(selector);
        if (element) {
          this.logger.debug(
            `WeChat validation: found indicator ${selector}, session valid`,
          );
          return true;
        }
      }

      return false;
    } catch (error) {
      this.logger.error(
        `WeChat session validation error: ${(error as Error).message}`,
      );
      return false;
    }
  }

  private async validateXiaohongshuSession(page: any): Promise<boolean> {
    try {
      await page.goto("https://creator.xiaohongshu.com/publish/publish", {
        timeout: 30000,
      });
      await page
        .waitForLoadState("networkidle", { timeout: 15000 })
        .catch(() => {});

      const url = page.url();

      // 如果重定向到登录页，说明未登录
      if (url.includes("/login") || url.includes("login.xiaohongshu.com")) {
        this.logger.debug("Xiaohongshu validation: redirected to login page");
        return false;
      }

      // 检查页面元素
      const selectors = [
        ".user-avatar",
        ".publish-container",
        ".upload-wrapper",
      ];
      for (const selector of selectors) {
        const element = await page.$(selector);
        if (element) {
          this.logger.debug(
            `Xiaohongshu validation: found indicator ${selector}, session valid`,
          );
          return true;
        }
      }

      return false;
    } catch (error) {
      this.logger.error(
        `Xiaohongshu session validation error: ${(error as Error).message}`,
      );
      return false;
    }
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

    // Validate and sanitize enum values to prevent SQL injection
    const validStatuses = [
      "DRAFT",
      "PENDING",
      "SCHEDULED",
      "PUBLISHING",
      "PUBLISHED",
      "FAILED",
    ];
    const validContentTypes = ["WECHAT_ARTICLE", "XIAOHONGSHU_NOTE"];

    const statusFilter = options.status?.toUpperCase();
    const contentTypeFilter = options.contentType?.toUpperCase();

    // Validate enum values - reject invalid inputs
    if (statusFilter && !validStatuses.includes(statusFilter)) {
      throw new BadRequestException(`Invalid status: ${options.status}`);
    }
    if (contentTypeFilter && !validContentTypes.includes(contentTypeFilter)) {
      throw new BadRequestException(
        `Invalid content type: ${options.contentType}`,
      );
    }

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

    // Use parameterized query to prevent SQL injection
    // Build query based on which filters are provided
    let contents: ContentRow[];
    let countResult: Array<{ count: bigint }>;

    if (statusFilter && contentTypeFilter) {
      // Both filters
      contents = (await this.db.$queryRaw`
        SELECT
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
        WHERE sc.user_id = ${userId}
          AND sc.status = ${statusFilter}::"SocialContentStatus"
          AND sc.content_type = ${contentTypeFilter}::"SocialContentType"
        ORDER BY sc.created_at DESC
        LIMIT ${options.limit} OFFSET ${offset}
      `) as ContentRow[];

      countResult = (await this.db.$queryRaw`
        SELECT COUNT(*) as count FROM social_contents sc
        WHERE sc.user_id = ${userId}
          AND sc.status = ${statusFilter}::"SocialContentStatus"
          AND sc.content_type = ${contentTypeFilter}::"SocialContentType"
      `) as Array<{ count: bigint }>;
    } else if (statusFilter) {
      // Only status filter
      contents = (await this.db.$queryRaw`
        SELECT
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
        WHERE sc.user_id = ${userId}
          AND sc.status = ${statusFilter}::"SocialContentStatus"
        ORDER BY sc.created_at DESC
        LIMIT ${options.limit} OFFSET ${offset}
      `) as ContentRow[];

      countResult = (await this.db.$queryRaw`
        SELECT COUNT(*) as count FROM social_contents sc
        WHERE sc.user_id = ${userId}
          AND sc.status = ${statusFilter}::"SocialContentStatus"
      `) as Array<{ count: bigint }>;
    } else if (contentTypeFilter) {
      // Only content type filter
      contents = (await this.db.$queryRaw`
        SELECT
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
        WHERE sc.user_id = ${userId}
          AND sc.content_type = ${contentTypeFilter}::"SocialContentType"
        ORDER BY sc.created_at DESC
        LIMIT ${options.limit} OFFSET ${offset}
      `) as ContentRow[];

      countResult = (await this.db.$queryRaw`
        SELECT COUNT(*) as count FROM social_contents sc
        WHERE sc.user_id = ${userId}
          AND sc.content_type = ${contentTypeFilter}::"SocialContentType"
      `) as Array<{ count: bigint }>;
    } else {
      // No filters, just userId
      contents = (await this.db.$queryRaw`
        SELECT
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
        WHERE sc.user_id = ${userId}
        ORDER BY sc.created_at DESC
        LIMIT ${options.limit} OFFSET ${offset}
      `) as ContentRow[];

      countResult = (await this.db.$queryRaw`
        SELECT COUNT(*) as count FROM social_contents sc
        WHERE sc.user_id = ${userId}
      `) as Array<{ count: bigint }>;
    }

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
    // Use $queryRaw because images and tags columns are text[] in database
    const sourceType = dto.sourceType || SocialContentSourceType.MANUAL;
    const images = JSON.stringify(dto.images || []);
    const tags = JSON.stringify(dto.tags || []);

    const results = await this.db.$queryRaw<
      Array<{
        id: string;
        user_id: string;
        content_type: string;
        source_type: string;
        title: string;
        content: string;
        status: string;
        created_at: Date;
        updated_at: Date;
      }>
    >`
      INSERT INTO "social_contents" (
        "id", "user_id", "content_type", "source_type", "source_id",
        "title", "content", "author", "digest", "source_url", "cover_image_url",
        "images", "tags", "location", "status", "created_at", "updated_at"
      ) VALUES (
        gen_random_uuid(),
        ${userId},
        ${dto.contentType}::"SocialContentType",
        ${sourceType}::"SocialContentSourceType",
        ${dto.sourceId || null},
        ${dto.title},
        ${dto.content},
        ${dto.author || null},
        ${dto.digest || null},
        ${dto.sourceUrl || null},
        ${dto.coverImageUrl || null},
        ARRAY(SELECT jsonb_array_elements_text(${images}::jsonb)),
        ARRAY(SELECT jsonb_array_elements_text(${tags}::jsonb)),
        ${dto.location || null},
        'DRAFT'::"SocialContentStatus",
        NOW(),
        NOW()
      )
      RETURNING id, user_id, content_type, source_type, title, content, status, created_at, updated_at
    `;

    return results[0];
  }

  async getContent(userId: string, id: string) {
    // Use $queryRaw because images and tags columns are text[] in database
    const results = await this.db.$queryRaw<
      Array<{
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
        complianceCheck: unknown;
        reviewStatus: string | null;
        scheduledAt: Date | null;
        publishedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
        connectionAccountName: string | null;
        connectionPlatformType: string | null;
      }>
    >`
      SELECT
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
        sc.compliance_check AS "complianceCheck",
        sc.review_status AS "reviewStatus",
        sc.scheduled_at AS "scheduledAt",
        sc.published_at AS "publishedAt",
        sc.created_at AS "createdAt",
        sc.updated_at AS "updatedAt",
        spc.account_name AS "connectionAccountName",
        spc.platform_type AS "connectionPlatformType"
      FROM social_contents sc
      LEFT JOIN social_platform_connections spc ON sc.connection_id = spc.id
      WHERE sc.id = ${id} AND sc.user_id = ${userId}
    `;

    if (!results[0]) {
      throw new NotFoundException("内容不存在");
    }

    const c = results[0];
    return {
      ...c,
      connection: c.connectionId
        ? {
            accountName: c.connectionAccountName,
            platformType: c.connectionPlatformType,
          }
        : null,
    };
  }

  async updateContent(userId: string, id: string, dto: UpdateContentDto) {
    // First verify the content exists and belongs to user
    await this.getContent(userId, id);

    // Build dynamic update query
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (dto.title !== undefined) {
      updates.push(`title = $${paramIndex++}`);
      values.push(dto.title);
    }
    if (dto.content !== undefined) {
      updates.push(`content = $${paramIndex++}`);
      values.push(dto.content);
    }
    if (dto.author !== undefined) {
      updates.push(`author = $${paramIndex++}`);
      values.push(dto.author);
    }
    if (dto.digest !== undefined) {
      updates.push(`digest = $${paramIndex++}`);
      values.push(dto.digest);
    }
    if (dto.coverImageUrl !== undefined) {
      updates.push(`cover_image_url = $${paramIndex++}`);
      values.push(dto.coverImageUrl);
    }
    if (dto.images !== undefined) {
      updates.push(
        `images = ARRAY(SELECT jsonb_array_elements_text($${paramIndex++}::jsonb))`,
      );
      values.push(JSON.stringify(dto.images));
    }
    if (dto.tags !== undefined) {
      updates.push(
        `tags = ARRAY(SELECT jsonb_array_elements_text($${paramIndex++}::jsonb))`,
      );
      values.push(JSON.stringify(dto.tags));
    }
    if (dto.location !== undefined) {
      updates.push(`location = $${paramIndex++}`);
      values.push(dto.location);
    }
    if (dto.connectionId !== undefined) {
      updates.push(`connection_id = $${paramIndex++}`);
      values.push(dto.connectionId);
    }

    updates.push(`updated_at = NOW()`);

    if (updates.length === 1) {
      // Only updated_at, no actual changes
      return this.getContent(userId, id);
    }

    // Execute update - we need to use $queryRawUnsafe here because we're building dynamic SQL
    // But all values are parameterized, so it's safe
    const query = `
      UPDATE social_contents
      SET ${updates.join(", ")}
      WHERE id = $${paramIndex++} AND user_id = $${paramIndex}
    `;
    values.push(id, userId);

    await this.db.$executeRawUnsafe(query, ...values);

    return this.getContent(userId, id);
  }

  async deleteContent(userId: string, id: string) {
    // First verify the content exists and belongs to user
    await this.getContent(userId, id);

    await this.db.$executeRaw`
      DELETE FROM social_contents
      WHERE id = ${id} AND user_id = ${userId}
    `;

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

    // Use $executeRaw to avoid Prisma ORM issues with text[] columns
    await this.db.$executeRaw`
      UPDATE social_contents
      SET compliance_check = ${JSON.stringify(resultWithTimestamp)}::jsonb, updated_at = NOW()
      WHERE id = ${content.id}
    `;

    return resultWithTimestamp;
  }

  // ==================== 发布管理 ====================

  async publishContent(userId: string, id: string, dto: PublishContentDto) {
    const content = await this.getContent(userId, id);

    if (!content.connectionId && !dto.connectionId) {
      throw new BadRequestException("请选择发布账号");
    }

    let connectionId = dto.connectionId || content.connectionId;

    // 验证连接是否存在
    const connection = await this.db.socialPlatformConnection.findUnique({
      where: { id: connectionId },
    });

    if (!connection) {
      // 连接已被删除，尝试找用户的活跃连接
      const platformType =
        content.contentType === "WECHAT_ARTICLE" ? "WECHAT_MP" : "XIAOHONGSHU";

      const activeConnection = await this.db.socialPlatformConnection.findFirst(
        {
          where: {
            userId,
            platformType,
            isActive: true,
          },
        },
      );

      if (!activeConnection) {
        throw new BadRequestException(
          "发布账号已断开连接，请在连接管理中重新连接后再发布",
        );
      }

      connectionId = activeConnection.id;
      this.logger.log(
        `Original connection not found, using active connection: ${connectionId}`,
      );
    }

    // Use $executeRaw to avoid Prisma ORM issues with text[] columns
    await this.db.$executeRaw`
      UPDATE social_contents
      SET status = 'PENDING'::"SocialContentStatus",
          connection_id = ${connectionId},
          updated_at = NOW()
      WHERE id = ${content.id}
    `;

    // 执行发布
    return this.publishExecutor.execute(content.id);
  }

  async scheduleContent(userId: string, id: string, scheduledAt: Date) {
    const content = await this.getContent(userId, id);

    // Use $executeRaw to avoid Prisma ORM issues with text[] columns
    await this.db.$executeRaw`
      UPDATE social_contents
      SET status = 'SCHEDULED'::"SocialContentStatus",
          scheduled_at = ${scheduledAt},
          updated_at = NOW()
      WHERE id = ${content.id}
    `;

    return this.getContent(userId, id);
  }

  async cancelPublish(userId: string, id: string) {
    const content = await this.getContent(userId, id);

    if (
      content.status !== SocialContentStatus.SCHEDULED &&
      content.status !== SocialContentStatus.PENDING
    ) {
      throw new BadRequestException("只能取消排期或待发布状态的内容");
    }

    // Use $executeRaw to avoid Prisma ORM issues with text[] columns
    await this.db.$executeRaw`
      UPDATE social_contents
      SET status = 'DRAFT'::"SocialContentStatus",
          scheduled_at = NULL,
          updated_at = NOW()
      WHERE id = ${content.id}
    `;

    return this.getContent(userId, id);
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
