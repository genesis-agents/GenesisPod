import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Optional,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import {
  CacheService,
  CachePrefix,
  CacheTTL,
} from "../../../common/cache/cache.service";
import { ContentCheckerService } from "./services/content-checker.service";
import { PublishExecutorService } from "./services/publish-executor.service";
import { SocialBrowserService } from "./services/social-browser.service";

interface BrowserPage {
  goto(url: string, options?: { timeout?: number }): Promise<unknown>;
  waitForNetworkIdle(options?: {
    idleTime?: number;
    timeout?: number;
  }): Promise<void>;
  url(): string;
  $(selector: string): Promise<unknown>;
}
import { XhsMcpAdapter } from "./adapters/xiaohongshu.adapter";
import type {
  XhsFeed,
  XhsFeedDetail,
  XhsUserProfile,
} from "./adapters/xiaohongshu.adapter";
import { CreateContentDto } from "./dto/create-content.dto";
import { UpdateContentDto } from "./dto/update-content.dto";
import { PublishContentDto } from "./dto/publish-content.dto";
import {
  SocialPlatformType,
  SocialContentStatus,
  SocialContentSourceType,
} from "./types";
import { encryptSession, decryptSession } from "./utils/session-crypto";
import { SessionData } from "./types/platform.types";
import { MissionExecutorService, KernelContext } from "../../ai-engine/facade";
import { LruMap } from "@/common/utils/lru-map";

@Injectable()
export class AiSocialService {
  private readonly logger = new Logger(AiSocialService.name);
  private readonly kernelProcessIds = new LruMap<string, string>(500);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly contentChecker: ContentCheckerService,
    private readonly publishExecutor: PublishExecutorService,
    private readonly playwright: SocialBrowserService,
    private readonly xhsMcpAdapter: XhsMcpAdapter,
    @Optional() private readonly missionExecutor?: MissionExecutorService,
  ) {}

  // ==================== 平台连接 ====================

  async getConnections(userId: string) {
    return this.prisma.socialPlatformConnection.findMany({
      where: { userId },
    });
  }

  /**
   * 构建登录会话缓存键
   */
  private buildLoginSessionKey(
    userId: string,
    platformType: SocialPlatformType,
  ): string {
    return this.cache.buildKey(CachePrefix.SOCIAL_LOGIN, userId, platformType);
  }

  /**
   * 构建验证锁缓存键
   */
  private buildVerifyingLockKey(
    userId: string,
    platformType: SocialPlatformType,
  ): string {
    return this.cache.buildKey(
      CachePrefix.SOCIAL_VERIFYING,
      userId,
      platformType,
    );
  }

  async initConnection(userId: string, type: string) {
    const platformType = type.toUpperCase() as SocialPlatformType;

    // 检查是否已存在连接
    const existing = await this.prisma.socialPlatformConnection.findUnique({
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

    // 小红书使用 MCP 外部登录
    if (platformType === SocialPlatformType.XIAOHONGSHU) {
      return this.initXhsMcpConnection(userId, platformType);
    }

    try {
      // 其他平台使用 Playwright 登录会话
      const { sessionKey, screenshot } =
        await this.playwright.startLoginSession(userId, platformType);

      // 保存待验证的会话到 Redis (10分钟过期)
      const cacheKey = this.buildLoginSessionKey(userId, platformType);
      await this.cache.set(
        cacheKey,
        {
          sessionKey,
          platformType,
        },
        CacheTTL.LOGIN_SESSION,
      );

      this.logger.log(
        `Login session created for ${platformType}, sessionKey: ${sessionKey}, cached at ${cacheKey}`,
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

    // 小红书使用 MCP 验证
    if (platformType === SocialPlatformType.XIAOHONGSHU) {
      return this.verifyXhsMcpConnection(userId, platformType);
    }

    const loginCacheKey = this.buildLoginSessionKey(userId, platformType);
    const lockCacheKey = this.buildVerifyingLockKey(userId, platformType);

    // 防止并发验证 - 如果已经在验证中，直接返回pending状态
    const isVerifying = await this.cache.get<boolean>(lockCacheKey);
    if (isVerifying) {
      this.logger.debug(
        `Verification already in progress for ${userId}-${platformType}`,
      );
      return {
        status: "pending",
        message: "验证中，请稍候...",
      };
    }

    this.logger.log(`Verifying connection ${platformType} for user ${userId}`);

    // 获取待验证的会话
    const pending = await this.cache.get<{
      sessionKey: string;
      platformType: SocialPlatformType;
    }>(loginCacheKey);

    if (!pending) {
      this.logger.warn(
        `No pending session found for ${userId}-${platformType}. User may need to restart login.`,
      );
      return {
        status: "error",
        message: "没有待验证的登录会话，请重新开始连接流程",
      };
    }

    // 获取锁 (设置短TTL，防止死锁)
    await this.cache.set(lockCacheKey, true, CacheTTL.SHORT);

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
        // Encrypt session data before storing
        const encryptedSessionData = encryptSession(result.sessionData);

        const connection = await this.prisma.socialPlatformConnection.upsert({
          where: {
            userId_platformType: {
              userId,
              platformType,
            },
          },
          update: {
            accountName: result.accountName || platformType,
            sessionData: encryptedSessionData,
            isActive: true,
            lastCheckAt: new Date(),
          },
          create: {
            userId,
            platformType,
            accountName: result.accountName || platformType,
            sessionData: encryptedSessionData,
            isActive: true,
            lastCheckAt: new Date(),
          },
        });

        // 清理登录会话和锁
        await this.playwright.endLoginSession(pending.sessionKey);
        await this.cache.del(loginCacheKey);
        await this.cache.del(lockCacheKey);

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
      await this.cache.del(lockCacheKey);
    }
  }

  async deleteConnection(userId: string, type: string) {
    const platformType = type.toUpperCase() as SocialPlatformType;

    await this.prisma.socialPlatformConnection.delete({
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
    const connection = await this.prisma.socialPlatformConnection.findFirst({
      where: { id: connectionId, userId },
    });

    if (!connection) {
      throw new NotFoundException("连接不存在");
    }

    // 实际验证会话有效性
    const validationResult = await this.validateSession(connection);

    // 更新最后检查时间和状态
    await this.prisma.socialPlatformConnection.update({
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
  private async validateSession(connection: {
    id: string;
    platformType: string;
    sessionData: unknown;
  }): Promise<{
    isValid: boolean;
    message?: string;
  }> {
    if (!connection.sessionData) {
      return { isValid: false, message: "无会话数据" };
    }

    // 小红书 MCP-managed 连接
    if (
      connection.platformType === SocialPlatformType.XIAOHONGSHU &&
      connection.sessionData === "mcp-managed"
    ) {
      try {
        const loginStatus = await this.xhsMcpAdapter.checkLoginStatus();
        return {
          isValid: loginStatus.loggedIn,
          message: loginStatus.loggedIn ? "" : "小红书登录已过期",
        };
      } catch (error) {
        this.logger.error(
          `XHS MCP validation failed: ${(error as Error).message}`,
        );
        return { isValid: false, message: "MCP 服务不可用" };
      }
    }

    const contextId = `validate-${connection.id}-${Date.now()}`;

    try {
      const sessionDataStr =
        typeof connection.sessionData === "string"
          ? connection.sessionData
          : JSON.stringify(connection.sessionData);

      const sessionData = decryptSession<SessionData>(sessionDataStr);

      await this.playwright.restoreSession(contextId, sessionData);
      const page = await this.playwright.createPage(contextId);

      let isValid = false;
      let message = "";

      if (connection.platformType === SocialPlatformType.WECHAT_MP) {
        isValid = await this.validateWechatSession(page);
        if (!isValid) message = "微信公众号登录已过期";
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

  private async validateWechatSession(page: BrowserPage): Promise<boolean> {
    try {
      await page.goto("https://mp.weixin.qq.com/cgi-bin/home", {
        timeout: 30000,
      });
      await page
        .waitForNetworkIdle({ idleTime: 500, timeout: 15000 })
        .catch((err: Error) => {
          this.logger.debug(
            `waitForNetworkIdle timed out (non-critical): ${err.message}`,
          );
        });

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

  // ==================== 小红书 MCP 连接管理 ====================

  private async initXhsMcpConnection(
    userId: string,
    platformType: SocialPlatformType,
  ) {
    try {
      if (!this.xhsMcpAdapter.isAvailable()) {
        return {
          status: "pending",
          loginMethod: "external-mcp",
          instructions: [
            "1. 确保 xiaohongshu-mcp 服务已启动 (默认端口 18060)",
            "2. 在终端运行 xiaohongshu-login 工具登录",
            "3. 浏览器会自动打开，使用小红书 App 扫码登录",
            "4. 登录成功后回到此页面点击「确认登录」",
          ],
          message: "MCP 服务未连接，请先启动 xiaohongshu-mcp 服务",
        };
      }

      const loginStatus = await this.xhsMcpAdapter.checkLoginStatus();

      if (loginStatus.loggedIn) {
        const connection = await this.prisma.socialPlatformConnection.create({
          data: {
            userId,
            platformType,
            accountName: loginStatus.nickname || "小红书用户",
            sessionData: "mcp-managed",
            isActive: true,
            lastCheckAt: new Date(),
          },
        });

        return {
          status: "success",
          connection,
          message: "小红书已连接",
        };
      }

      return {
        status: "pending",
        loginMethod: "external-mcp",
        instructions: [
          "1. 在终端运行 xiaohongshu-login 工具",
          "2. 浏览器会自动打开小红书登录页面",
          "3. 使用小红书 App 扫码登录",
          "4. 登录成功后回到此页面点击「确认登录」",
        ],
        message: "请按照指引完成小红书登录",
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to init XHS MCP connection: ${errorMsg}`);
      return {
        status: "error",
        message: `小红书连接失败: ${errorMsg}`,
      };
    }
  }

  private async verifyXhsMcpConnection(
    userId: string,
    platformType: SocialPlatformType,
  ) {
    try {
      const loginStatus = await this.xhsMcpAdapter.checkLoginStatus();

      if (loginStatus.loggedIn) {
        const connection = await this.prisma.socialPlatformConnection.upsert({
          where: {
            userId_platformType: { userId, platformType },
          },
          update: {
            accountName: loginStatus.nickname || "小红书用户",
            sessionData: "mcp-managed",
            isActive: true,
            lastCheckAt: new Date(),
          },
          create: {
            userId,
            platformType,
            accountName: loginStatus.nickname || "小红书用户",
            sessionData: "mcp-managed",
            isActive: true,
            lastCheckAt: new Date(),
          },
        });

        return {
          status: "success",
          connection,
          message: "小红书连接成功",
        };
      }

      return {
        status: "pending",
        message: "等待小红书登录确认...",
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`XHS MCP verify failed: ${errorMsg}`);
      return {
        status: "error",
        message: `验证失败: ${errorMsg}`,
      };
    }
  }

  // ==================== 小红书 MCP 功能 ====================

  async xhsGetLoginStatus() {
    return this.xhsMcpAdapter.checkLoginStatus();
  }

  async xhsListFeeds(): Promise<XhsFeed[]> {
    return this.xhsMcpAdapter.listFeeds();
  }

  async xhsSearchFeeds(keyword: string): Promise<XhsFeed[]> {
    return this.xhsMcpAdapter.searchFeeds(keyword);
  }

  async xhsGetFeedDetail(
    feedId: string,
    xsecToken: string,
  ): Promise<XhsFeedDetail | null> {
    return this.xhsMcpAdapter.getFeedDetail(feedId, xsecToken);
  }

  async xhsPostComment(
    feedId: string,
    xsecToken: string,
    content: string,
  ): Promise<{ success: boolean; error?: string }> {
    return this.xhsMcpAdapter.postComment(feedId, xsecToken, content);
  }

  async xhsGetUserProfile(
    userId: string,
    xsecToken: string,
  ): Promise<XhsUserProfile | null> {
    return this.xhsMcpAdapter.getUserProfile(userId, xsecToken);
  }

  async refreshConnection(userId: string, connectionId: string) {
    const connection = await this.prisma.socialPlatformConnection.findFirst({
      where: { id: connectionId, userId },
    });

    if (!connection) {
      throw new NotFoundException("连接不存在");
    }

    // Validate session is still active
    const validationResult = await this.validateSession(connection);

    // Update connection status based on validation
    const updated = await this.prisma.socialPlatformConnection.update({
      where: { id: connectionId },
      data: {
        lastCheckAt: new Date(),
        isActive: validationResult.isValid,
        updatedAt: new Date(),
      },
    });

    return {
      ...updated,
      validationResult: {
        isValid: validationResult.isValid,
        message: validationResult.isValid
          ? "会话有效，连接正常"
          : validationResult.message || "会话已过期，请重新连接",
      },
    };
  }

  // ==================== 内容管理 ====================

  /**
   * 内容查询结果类型
   */
  private readonly CONTENT_SELECT_FIELDS = Prisma.sql`
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
  `;

  /**
   * 构建内容查询的 WHERE 条件
   */
  private buildContentWhereClause(
    userId: string,
    statusFilter?: string,
    contentTypeFilter?: string,
  ): Prisma.Sql {
    const conditions: Prisma.Sql[] = [Prisma.sql`sc.user_id = ${userId}`];

    if (statusFilter) {
      conditions.push(
        Prisma.sql`sc.status = ${statusFilter}::"SocialContentStatus"`,
      );
    }

    if (contentTypeFilter) {
      conditions.push(
        Prisma.sql`sc.content_type = ${contentTypeFilter}::"SocialContentType"`,
      );
    }

    return Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;
  }

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

    // Build dynamic WHERE clause
    const whereClause = this.buildContentWhereClause(
      userId,
      statusFilter,
      contentTypeFilter,
    );

    // Execute queries using shared SQL fragments
    const contents = await this.prisma.$queryRaw<ContentRow[]>`
      SELECT ${this.CONTENT_SELECT_FIELDS}
      FROM social_contents sc
      LEFT JOIN social_platform_connections spc ON sc.connection_id = spc.id
      ${whereClause}
      ORDER BY sc.created_at DESC
      LIMIT ${options.limit} OFFSET ${offset}
    `;

    const countResult = await this.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM social_contents sc
      ${whereClause}
    `;

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

    const results = await this.prisma.$queryRaw<
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
    const results = await this.prisma.$queryRaw<
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

    // Build safe update data object - only include defined fields
    const updateData: Record<string, unknown> = {};

    if (dto.title !== undefined) {
      updateData.title = dto.title;
    }
    if (dto.content !== undefined) {
      updateData.content = dto.content;
    }
    if (dto.author !== undefined) {
      updateData.author = dto.author;
    }
    if (dto.digest !== undefined) {
      updateData.digest = dto.digest;
    }
    if (dto.coverImageUrl !== undefined) {
      updateData.coverImageUrl = dto.coverImageUrl;
    }
    if (dto.images !== undefined) {
      updateData.images = dto.images;
    }
    if (dto.tags !== undefined) {
      updateData.tags = dto.tags;
    }
    if (dto.location !== undefined) {
      updateData.location = dto.location;
    }
    if (dto.connectionId !== undefined) {
      updateData.connectionId = dto.connectionId;
    }

    // If no fields to update, just return current content
    if (Object.keys(updateData).length === 0) {
      return this.getContent(userId, id);
    }

    // Use Prisma ORM for safe parameterized update
    await this.prisma.socialContent.update({
      where: {
        id,
        userId, // Ensures user owns the content
      },
      data: {
        ...updateData,
        updatedAt: new Date(),
      },
    });

    return this.getContent(userId, id);
  }

  async deleteContent(userId: string, id: string) {
    // First verify the content exists and belongs to user
    await this.getContent(userId, id);

    await this.prisma.$executeRaw`
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
    await this.prisma.$executeRaw`
      UPDATE social_contents
      SET compliance_check = ${JSON.stringify(resultWithTimestamp)}::jsonb, updated_at = NOW()
      WHERE id = ${content.id}
    `;

    return resultWithTimestamp;
  }

  // ==================== 发布管理 ====================

  async publishContent(userId: string, id: string, dto: PublishContentDto) {
    const content = await this.getContent(userId, id);

    // Guard: only DRAFT or FAILED (retry) content can be published
    if (
      content.status !== SocialContentStatus.DRAFT &&
      content.status !== SocialContentStatus.FAILED
    ) {
      throw new BadRequestException(
        `当前状态(${content.status})不允许发布，只有草稿或失败状态可以发布`,
      );
    }

    // Guard: compliance check must pass before publishing (if check was run)
    const compliance = content.complianceCheck as {
      passed?: boolean;
      score?: number;
    } | null;
    if (compliance && compliance.passed === false) {
      throw new BadRequestException(
        "内容合规检测未通过，请修改后再发布。可在内容详情查看具体问题",
      );
    }

    if (!content.connectionId && !dto.connectionId) {
      throw new BadRequestException("请选择发布账号");
    }

    // After the guard above, at least one of dto.connectionId or content.connectionId is set
    let connectionId = (dto.connectionId || content.connectionId) as string;

    // 验证连接是否存在
    const connection = await this.prisma.socialPlatformConnection.findUnique({
      where: { id: connectionId },
    });

    if (!connection) {
      // 连接已被删除，尝试找用户的活跃连接
      const platformType =
        content.contentType === "WECHAT_ARTICLE" ? "WECHAT_MP" : "XIAOHONGSHU";

      const activeConnection =
        await this.prisma.socialPlatformConnection.findFirst({
          where: {
            userId,
            platformType,
            isActive: true,
          },
        });

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
    await this.prisma.$executeRaw`
      UPDATE social_contents
      SET status = 'PENDING'::"SocialContentStatus",
          connection_id = ${connectionId},
          updated_at = NOW()
      WHERE id = ${content.id}
    `;

    // ★ AI Kernel: 创建进程记录
    if (this.missionExecutor) {
      try {
        const kernelResult = await this.missionExecutor.execute({
          userId,
          agentId: "social-agent",
          teamSessionId: content.id,
          input: { contentType: content.contentType, title: content.title },
        });
        this.kernelProcessIds.set(content.id, kernelResult.processId);
      } catch (err) {
        this.logger.warn(
          `[Kernel] Failed to spawn process: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // 执行发布
    const contentProcessId = this.kernelProcessIds.get(content.id);
    const executeGeneration = async () => {
      try {
        const result = await this.publishExecutor.execute(content.id);
        this.completeKernelProcess(content.id, { contentId: content.id });
        return result;
      } catch (err) {
        this.failKernelProcess(
          content.id,
          err instanceof Error ? err.message : String(err),
        );
        throw err;
      }
    };
    return contentProcessId
      ? KernelContext.run(
          { processId: contentProcessId, userId: content.userId || "" },
          executeGeneration,
        )
      : executeGeneration();
  }

  async scheduleContent(userId: string, id: string, scheduledAt: Date) {
    const content = await this.getContent(userId, id);

    // Use $executeRaw to avoid Prisma ORM issues with text[] columns
    await this.prisma.$executeRaw`
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
    await this.prisma.$executeRaw`
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

    return this.prisma.socialPublishLog.findMany({
      where: { contentId },
      orderBy: { createdAt: "desc" },
    });
  }

  // ==================== 导入来源 ====================

  async getExploreSources(
    _userId: string,
    options: {
      type?: string;
      page: number;
      limit?: number;
      since?: string;
    },
  ) {
    const where: Record<string, unknown> = {};

    if (options.type) {
      where.type = options.type.toUpperCase();
    }

    // 时间范围过滤：默认最近 7 天
    if (options.since) {
      const sinceDate = new Date(options.since);
      if (!isNaN(sinceDate.getTime())) {
        where.createdAt = { gte: sinceDate };
      }
    }

    const take = options.limit || 200; // 无 limit 时取较大值
    const resources = await this.prisma.resource.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (options.page - 1) * take,
      take,
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

  async getTopicInsightsSources(userId: string) {
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
        reports: {
          orderBy: { version: "desc" },
          take: 1,
          select: {
            id: true,
            version: true,
            executiveSummary: true,
            generatedAt: true,
          },
        },
      },
    });

    // 只返回有报告的 topics
    return topics
      .filter((topic) => topic.reports.length > 0)
      .map((topic) => ({
        id: topic.id,
        name: topic.name,
        description: topic.description,
        status: topic.status,
        updatedAt: topic.updatedAt,
        latestReport:
          topic.reports[0] != null
            ? {
                id: topic.reports[0].id,
                version: topic.reports[0].version,
                executiveSummary: topic.reports[0].executiveSummary?.substring(
                  0,
                  200,
                ),
                generatedAt: topic.reports[0].generatedAt,
              }
            : null,
      }));
  }

  async getSeriesContents(userId: string, seriesId: string) {
    const results = await this.prisma.$queryRaw<
      Array<{
        id: string;
        title: string;
        content: string;
        digest: string | null;
        series_id: string;
        series_order: number;
        status: string;
        cover_image_url: string | null;
        created_at: Date;
        updated_at: Date;
      }>
    >`
      SELECT id, title, content, digest, series_id, series_order, status,
             cover_image_url, created_at, updated_at
      FROM social_contents
      WHERE user_id = ${userId}::uuid AND series_id = ${seriesId}
        AND series_order IS NOT NULL
      ORDER BY series_order ASC
    `;

    return results.map((row) => ({
      id: row.id,
      title: row.title,
      content: row.content,
      digest: row.digest,
      seriesId: row.series_id,
      seriesOrder: row.series_order,
      status: row.status,
      coverImageUrl: row.cover_image_url,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  // ==================== 批量操作 ====================

  /**
   * 批量删除内容（使用数据库事务）
   */
  async batchDeleteContents(
    userId: string,
    ids: string[],
  ): Promise<{
    success: boolean;
    total: number;
    succeeded: number;
    failed: number;
    errors?: Array<{ id: string; error: string }>;
  }> {
    const errors: Array<{ id: string; error: string }> = [];
    let succeeded = 0;

    // 使用事务确保原子性
    await this.prisma.$transaction(async (tx) => {
      for (const id of ids) {
        try {
          // 验证内容存在且属于用户
          const content = await tx.socialContent.findFirst({
            where: { id, userId },
          });

          if (!content) {
            errors.push({ id, error: "内容不存在或无权限" });
            continue;
          }

          // 不允许删除已发布的内容
          if (content.status === "PUBLISHED") {
            errors.push({ id, error: "已发布内容无法删除" });
            continue;
          }

          await tx.socialContent.delete({ where: { id } });
          succeeded++;
        } catch (error) {
          const message = error instanceof Error ? error.message : "删除失败";
          errors.push({ id, error: message });
        }
      }
    });

    return {
      success: errors.length === 0,
      total: ids.length,
      succeeded,
      failed: errors.length,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * 批量发布内容（使用数据库事务）
   */
  async batchPublishContents(
    userId: string,
    ids: string[],
    connectionId: string,
  ): Promise<{
    success: boolean;
    total: number;
    succeeded: number;
    failed: number;
    errors?: Array<{ id: string; error: string }>;
  }> {
    const errors: Array<{ id: string; error: string }> = [];
    let succeeded = 0;
    const succeededIds: string[] = [];

    // 验证连接有效性
    const connection = await this.prisma.socialPlatformConnection.findFirst({
      where: { id: connectionId, userId, isActive: true },
    });

    if (!connection) {
      return {
        success: false,
        total: ids.length,
        succeeded: 0,
        failed: ids.length,
        errors: [{ id: "connection", error: "平台连接无效或已断开" }],
      };
    }

    // 使用事务处理批量发布（只做状态更新和记录创建，不触发外部调用）
    await this.prisma.$transaction(async (tx) => {
      for (const id of ids) {
        try {
          const content = await tx.socialContent.findFirst({
            where: { id, userId },
          });

          if (!content) {
            errors.push({ id, error: "内容不存在或无权限" });
            continue;
          }

          // 只允许发布草稿或失败(重试)状态的内容
          if (!["DRAFT", "FAILED"].includes(content.status)) {
            errors.push({
              id,
              error: `当前状态(${content.status})不允许发布`,
            });
            continue;
          }

          // 更新状态为待发布
          await tx.socialContent.update({
            where: { id },
            data: {
              status: "PENDING",
              updatedAt: new Date(),
            },
          });

          // 创建发布记录
          await tx.socialPublishLog.create({
            data: {
              contentId: id,
              action: "PUBLISH",
              status: "PENDING",
              details: { connectionId },
              createdAt: new Date(),
            },
          });

          succeededIds.push(id);
          succeeded++;
        } catch (error) {
          const message = error instanceof Error ? error.message : "发布失败";
          errors.push({ id, error: message });
        }
      }
    });

    // 事务结束后触发实际发布执行（fire-and-forget，与单条 publishContent 行为一致）
    for (const contentId of succeededIds) {
      this.publishExecutor.execute(contentId).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `Failed to trigger publish for content ${contentId}: ${message}`,
        );
      });
    }

    return {
      success: errors.length === 0,
      total: ids.length,
      succeeded,
      failed: errors.length,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  // ─── AI Kernel Helpers ───

  private completeKernelProcess(
    contentId: string,
    output?: Record<string, unknown>,
  ): void {
    const processId = this.kernelProcessIds.get(contentId);
    if (!processId || !this.missionExecutor) return;
    void this.missionExecutor
      .complete(processId, output)
      .catch((err: unknown) =>
        this.logger.warn(
          `[Kernel] Failed to complete process: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    this.kernelProcessIds.delete(contentId);
  }

  private failKernelProcess(contentId: string, error: string): void {
    const processId = this.kernelProcessIds.get(contentId);
    if (!processId || !this.missionExecutor) return;
    void this.missionExecutor
      .fail(processId, error)
      .catch((err: unknown) =>
        this.logger.warn(
          `[Kernel] Failed to mark process as failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    this.kernelProcessIds.delete(contentId);
  }
}
