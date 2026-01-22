import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { PlaywrightService } from "./playwright.service";
import { WechatAdapter } from "../adapters/wechat.adapter";
import { XiaohongshuAdapter } from "../adapters/xiaohongshu.adapter";
import {
  SocialContentStatus,
  SocialPlatformType,
  SocialContent,
  SocialPlatformConnection,
} from "../types";

// Prisma client accessor for models not yet migrated
type PrismaAny = any;

export interface PublishResult {
  success: boolean;
  externalUrl?: string;
  externalId?: string;
  errorMessage?: string;
}

@Injectable()
export class PublishExecutorService {
  private readonly logger = new Logger(PublishExecutorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly playwrightService: PlaywrightService,
    private readonly wechatAdapter: WechatAdapter,
    private readonly xiaohongshuAdapter: XiaohongshuAdapter,
  ) {}

  // Helper to access prisma with new models
  private get db(): PrismaAny {
    return this.prisma;
  }

  // Expose playwright for adapters that may need direct access
  getPlaywright(): PlaywrightService {
    return this.playwrightService;
  }

  async execute(contentId: string): Promise<PublishResult> {
    const content = await this.db.socialContent.findUnique({
      where: { id: contentId },
      include: { connection: true },
    });

    if (!content) {
      return { success: false, errorMessage: "内容不存在" };
    }

    // 获取要使用的连接
    let connection = content.connection;

    // 如果没有关联连接，或者连接的会话数据无效，尝试找用户的活跃连接
    const needsFallback =
      !connection ||
      !connection.sessionData ||
      !this.hasValidSession(connection);

    if (needsFallback) {
      this.logger.warn(
        `Content ${contentId} has invalid connection, looking for active connection...`,
      );

      // 根据内容类型确定平台
      const platformType =
        content.contentType === "WECHAT_ARTICLE"
          ? SocialPlatformType.WECHAT_MP
          : SocialPlatformType.XIAOHONGSHU;

      // 查找用户的活跃连接
      const activeConnection = await this.db.socialPlatformConnection.findFirst(
        {
          where: {
            userId: content.userId,
            platformType,
            isActive: true,
          },
          orderBy: { lastCheckAt: "desc" },
        },
      );

      if (activeConnection && this.hasValidSession(activeConnection)) {
        this.logger.log(
          `Found active connection ${activeConnection.id} with valid session`,
        );
        connection = activeConnection;

        // 更新内容的连接关联
        await this.db.socialContent.update({
          where: { id: contentId },
          data: { connectionId: activeConnection.id },
        });
      } else if (!connection) {
        return { success: false, errorMessage: "未关联发布账号" };
      }
    }

    try {
      // 更新状态为发布中
      await this.db.socialContent.update({
        where: { id: contentId },
        data: { status: SocialContentStatus.PUBLISHING },
      });

      let result: PublishResult;

      switch (connection.platformType) {
        case SocialPlatformType.WECHAT_MP:
          result = await this.wechatAdapter.publish(
            content as SocialContent,
            connection as SocialPlatformConnection,
          );
          break;
        case SocialPlatformType.XIAOHONGSHU:
          result = await this.xiaohongshuAdapter.publish(
            content as SocialContent,
            connection as SocialPlatformConnection,
          );
          break;
        default:
          result = {
            success: false,
            errorMessage: `不支持的平台类型: ${connection.platformType}`,
          };
      }

      // 更新发布结果
      await this.db.socialContent.update({
        where: { id: contentId },
        data: {
          status: result.success
            ? SocialContentStatus.PUBLISHED
            : SocialContentStatus.FAILED,
          publishedAt: result.success ? new Date() : null,
          externalUrl: result.externalUrl,
          externalId: result.externalId,
          errorMessage: result.errorMessage,
        },
      });

      // 记录发布日志
      await this.db.socialPublishLog.create({
        data: {
          contentId,
          action: "PUBLISH",
          status: result.success ? "SUCCESS" : "FAILED",
          details: {
            externalUrl: result.externalUrl,
            externalId: result.externalId,
          },
          errorMessage: result.errorMessage,
        },
      });

      return result;
    } catch (error) {
      const err = error as Error;
      this.logger.error(`发布失败: ${err.message}`, err.stack);

      await this.db.socialContent.update({
        where: { id: contentId },
        data: {
          status: SocialContentStatus.FAILED,
          errorMessage: err.message,
        },
      });

      // 记录错误日志
      await this.db.socialPublishLog.create({
        data: {
          contentId,
          action: "PUBLISH",
          status: "FAILED",
          errorMessage: err.message,
        },
      });

      return { success: false, errorMessage: err.message };
    }
  }

  /**
   * 检查连接是否有有效的会话数据
   */
  private hasValidSession(connection: any): boolean {
    if (!connection?.sessionData) {
      return false;
    }

    const sessionData =
      typeof connection.sessionData === "string"
        ? JSON.parse(connection.sessionData)
        : connection.sessionData;

    return sessionData?.cookies?.length > 0;
  }
}
