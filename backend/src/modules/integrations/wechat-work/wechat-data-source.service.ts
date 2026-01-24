/**
 * WeChat Data Source Service
 * Manages WeChat items as a data source (similar to bookmarks, notes, images)
 */

import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { WechatItemType, Prisma } from "@prisma/client";

export interface CreateWechatItemParams {
  userId: string;
  type: WechatItemType;
  title: string;
  sourceUrl: string;
  description?: string;
  thumbnail?: string;
  author?: string;
  source?: string;
  publishedAt?: Date;
  syncSource?: string;
  wechatWorkUser?: string;
}

export interface WechatItemWithMeta {
  id: string;
  type: WechatItemType;
  title: string;
  description: string | null;
  sourceUrl: string;
  thumbnail: string | null;
  author: string | null;
  source: string | null;
  publishedAt: Date | null;
  syncedAt: Date;
  syncedToRag: boolean;
  ragKnowledgeBaseId: string | null;
  createdAt: Date;
}

export interface WechatDataSourceStats {
  totalItems: number;
  articleCount: number;
  videoCount: number;
  externalCount: number;
  syncedToRagCount: number;
  lastSyncAt: Date | null;
}

@Injectable()
export class WechatDataSourceService {
  private readonly logger = new Logger(WechatDataSourceService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new WeChat item in the data source
   */
  async createItem(
    params: CreateWechatItemParams,
  ): Promise<WechatItemWithMeta> {
    // Check for duplicates
    const existingItem = await this.prisma.wechatItem.findUnique({
      where: {
        userId_sourceUrl: {
          userId: params.userId,
          sourceUrl: params.sourceUrl,
        },
      },
    });

    if (existingItem) {
      throw new Error(`该内容已存在`);
    }

    const item = await this.prisma.wechatItem.create({
      data: {
        userId: params.userId,
        type: params.type,
        title: params.title,
        sourceUrl: params.sourceUrl,
        description: params.description,
        thumbnail: params.thumbnail,
        author: params.author,
        source: params.source,
        publishedAt: params.publishedAt,
        syncSource: params.syncSource || "wechat_work",
        wechatWorkUser: params.wechatWorkUser,
      },
    });

    this.logger.log(
      `Created WeChat item: ${item.id} for user ${params.userId}`,
    );

    return this.mapToItemWithMeta(item);
  }

  /**
   * Get WeChat items for a user with pagination
   */
  async getItems(
    userId: string,
    options: {
      type?: WechatItemType;
      syncedToRag?: boolean;
      limit?: number;
      offset?: number;
      orderBy?: "createdAt" | "syncedAt";
      order?: "asc" | "desc";
    } = {},
  ): Promise<{ items: WechatItemWithMeta[]; total: number }> {
    const {
      type,
      syncedToRag,
      limit = 50,
      offset = 0,
      orderBy = "createdAt",
      order = "desc",
    } = options;

    const where: Prisma.WechatItemWhereInput = {
      userId,
      ...(type && { type }),
      ...(syncedToRag !== undefined && { syncedToRag }),
    };

    const [items, total] = await Promise.all([
      this.prisma.wechatItem.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { [orderBy]: order },
      }),
      this.prisma.wechatItem.count({ where }),
    ]);

    return {
      items: items.map((item) => this.mapToItemWithMeta(item)),
      total,
    };
  }

  /**
   * Get a single WeChat item
   */
  async getItem(userId: string, itemId: string): Promise<WechatItemWithMeta> {
    const item = await this.prisma.wechatItem.findFirst({
      where: {
        id: itemId,
        userId,
      },
    });

    if (!item) {
      throw new NotFoundException("WeChat item not found");
    }

    return this.mapToItemWithMeta(item);
  }

  /**
   * Delete a WeChat item
   */
  async deleteItem(userId: string, itemId: string): Promise<void> {
    const item = await this.prisma.wechatItem.findFirst({
      where: {
        id: itemId,
        userId,
      },
    });

    if (!item) {
      throw new NotFoundException("WeChat item not found");
    }

    await this.prisma.wechatItem.delete({
      where: { id: itemId },
    });

    this.logger.log(`Deleted WeChat item: ${itemId}`);
  }

  /**
   * Delete multiple WeChat items
   */
  async deleteItems(userId: string, itemIds: string[]): Promise<number> {
    const result = await this.prisma.wechatItem.deleteMany({
      where: {
        id: { in: itemIds },
        userId,
      },
    });

    this.logger.log(`Deleted ${result.count} WeChat items for user ${userId}`);
    return result.count;
  }

  /**
   * Mark item as synced to RAG
   */
  async markSyncedToRag(
    itemId: string,
    ragDocumentId: string,
    ragKnowledgeBaseId: string,
  ): Promise<WechatItemWithMeta> {
    const item = await this.prisma.wechatItem.update({
      where: { id: itemId },
      data: {
        syncedToRag: true,
        ragDocumentId,
        ragKnowledgeBaseId,
      },
    });

    return this.mapToItemWithMeta(item);
  }

  /**
   * Get statistics for a user's WeChat data source
   */
  async getStats(userId: string): Promise<WechatDataSourceStats> {
    const [
      totalItems,
      articleCount,
      videoCount,
      externalCount,
      syncedToRagCount,
      lastItem,
    ] = await Promise.all([
      this.prisma.wechatItem.count({ where: { userId } }),
      this.prisma.wechatItem.count({ where: { userId, type: "ARTICLE" } }),
      this.prisma.wechatItem.count({ where: { userId, type: "VIDEO" } }),
      this.prisma.wechatItem.count({ where: { userId, type: "EXTERNAL" } }),
      this.prisma.wechatItem.count({ where: { userId, syncedToRag: true } }),
      this.prisma.wechatItem.findFirst({
        where: { userId },
        orderBy: { syncedAt: "desc" },
        select: { syncedAt: true },
      }),
    ]);

    return {
      totalItems,
      articleCount,
      videoCount,
      externalCount,
      syncedToRagCount,
      lastSyncAt: lastItem?.syncedAt || null,
    };
  }

  /**
   * Check if a URL already exists for a user
   */
  async urlExists(userId: string, sourceUrl: string): Promise<boolean> {
    const item = await this.prisma.wechatItem.findUnique({
      where: {
        userId_sourceUrl: {
          userId,
          sourceUrl,
        },
      },
      select: { id: true },
    });

    return !!item;
  }

  /**
   * Identify the type of WeChat link
   */
  identifyLinkType(url: string): WechatItemType {
    try {
      const parsedUrl = new URL(url);
      const hostname = parsedUrl.hostname.toLowerCase();

      if (hostname.includes("mp.weixin.qq.com")) {
        return "ARTICLE";
      }
      if (hostname.includes("channels.weixin.qq.com")) {
        return "VIDEO";
      }
      if (hostname.includes("weixin.qq.com")) {
        // WeChat short links usually redirect to articles
        return "ARTICLE";
      }
    } catch (error) {
      this.logger.warn(`Failed to parse URL: ${url}`);
    }

    return "EXTERNAL";
  }

  private mapToItemWithMeta(item: any): WechatItemWithMeta {
    return {
      id: item.id,
      type: item.type,
      title: item.title,
      description: item.description,
      sourceUrl: item.sourceUrl,
      thumbnail: item.thumbnail,
      author: item.author,
      source: item.source,
      publishedAt: item.publishedAt,
      syncedAt: item.syncedAt,
      syncedToRag: item.syncedToRag,
      ragKnowledgeBaseId: item.ragKnowledgeBaseId,
      createdAt: item.createdAt,
    };
  }

  /**
   * 获取用户的 WeChat Work 绑定信息
   */
  async getWechatWorkBinding(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { preferences: true },
    });

    const preferences = user?.preferences as Record<string, unknown> | null;
    const wechatWorkUserId = preferences?.wechatWorkUserId as
      | string
      | undefined;

    return {
      isBound: !!wechatWorkUserId,
      wechatWorkUserId: wechatWorkUserId || null,
    };
  }

  /**
   * 绑定 WeChat Work 用户 ID
   */
  async bindWechatWorkUserId(userId: string, wechatWorkUserId: string) {
    // 检查该 WeChat Work ID 是否已被其他用户绑定
    const existingUser = await this.prisma.user.findFirst({
      where: {
        preferences: {
          path: ["wechatWorkUserId"],
          equals: wechatWorkUserId,
        },
        NOT: { id: userId },
      },
    });

    if (existingUser) {
      throw new Error("This WeChat Work ID is already bound to another account");
    }

    // 获取当前用户的 preferences
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { preferences: true },
    });

    const currentPreferences =
      (user?.preferences as Record<string, unknown>) || {};

    // 更新 preferences
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        preferences: {
          ...currentPreferences,
          wechatWorkUserId,
        },
      },
    });

    this.logger.log(`User ${userId} bound WeChat Work ID: ${wechatWorkUserId}`);

    return {
      success: true,
      wechatWorkUserId,
    };
  }

  /**
   * 解绑 WeChat Work 用户 ID
   */
  async unbindWechatWorkUserId(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { preferences: true },
    });

    const currentPreferences =
      (user?.preferences as Record<string, unknown>) || {};

    // 移除 wechatWorkUserId
    const { wechatWorkUserId, ...remainingPreferences } = currentPreferences;

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        preferences: remainingPreferences as object,
      },
    });

    this.logger.log(`User ${userId} unbound WeChat Work ID`);

    return {
      success: true,
    };
  }
}
