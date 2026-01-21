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
    let content;
    try {
      content = await this.db.socialContent.findUnique({
        where: { id: contentId },
        include: { connection: true },
      });
    } catch (error) {
      // Handle Prisma P2023 (inconsistent column data) by fetching raw data
      if (
        error instanceof Error &&
        error.message.includes("Inconsistent column data")
      ) {
        this.logger.warn(
          `Data inconsistency detected for content ${contentId}, attempting raw query`,
        );
        // Try to fetch with raw query and fix the data
        const rawContent = await this.db.$queryRaw`
          SELECT id, user_id, connection_id, content_type, status, title, content
          FROM social_contents WHERE id = ${contentId}
        `;
        if (Array.isArray(rawContent) && rawContent.length > 0) {
          // Fix the corrupted record
          await this.db.$executeRaw`
            UPDATE social_contents
            SET images = '[]'::jsonb, tags = '[]'::jsonb
            WHERE id = ${contentId}
            AND (images IS NULL OR tags IS NULL OR images::text = '' OR tags::text = '')
          `;
          // Retry the query
          content = await this.db.socialContent.findUnique({
            where: { id: contentId },
            include: { connection: true },
          });
        }
      }
      if (!content) {
        throw error;
      }
    }

    if (!content) {
      return { success: false, errorMessage: "内容不存在" };
    }

    if (!content.connection) {
      return { success: false, errorMessage: "未关联发布账号" };
    }

    try {
      // 更新状态为发布中
      await this.db.socialContent.update({
        where: { id: contentId },
        data: { status: SocialContentStatus.PUBLISHING },
      });

      let result: PublishResult;

      switch (content.connection.platformType) {
        case SocialPlatformType.WECHAT_MP:
          result = await this.wechatAdapter.publish(
            content as SocialContent,
            content.connection as SocialPlatformConnection,
          );
          break;
        case SocialPlatformType.XIAOHONGSHU:
          result = await this.xiaohongshuAdapter.publish(
            content as SocialContent,
            content.connection as SocialPlatformConnection,
          );
          break;
        default:
          result = {
            success: false,
            errorMessage: `不支持的平台类型: ${content.connection.platformType}`,
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
}
