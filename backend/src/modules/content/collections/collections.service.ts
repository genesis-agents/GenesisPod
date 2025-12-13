import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";
import {
  CreateCollectionDto,
  UpdateCollectionDto,
  AddToCollectionDto,
  UpdateCollectionItemDto,
  BatchMoveItemsDto,
  BatchDeleteItemsDto,
  BatchUpdateTagsDto,
  BatchUpdateStatusDto,
} from "./dto";

/**
 * 收藏系统服务
 *
 * 核心功能：
 * 1. 创建和管理收藏集
 * 2. 添加/移除资源到收藏集
 * 3. 收藏集排序和组织
 * 4. 收藏集分享（公开/私有）
 */
@Injectable()
export class CollectionsService {
  private readonly logger = new Logger(CollectionsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * 创建收藏集
   */
  async createCollection(userId: string, dto: CreateCollectionDto) {
    // Check if collection with same name already exists for this user
    const existingCollection = await this.prisma.collection.findFirst({
      where: {
        userId,
        name: dto.name,
      },
    });

    if (existingCollection) {
      this.logger.log(
        `Collection "${dto.name}" already exists for user ${userId}, returning existing`,
      );
      return existingCollection;
    }

    const collection = await this.prisma.collection.create({
      data: {
        userId,
        name: dto.name,
        description: dto.description,
        icon: dto.icon,
        color: dto.color,
        isPublic: dto.isPublic ?? false,
      },
      include: {
        items: {
          include: {
            resource: true,
          },
        },
      },
    });

    this.logger.log(`Collection created: ${collection.name} by user ${userId}`);

    return collection;
  }

  /**
   * 获取用户的所有收藏集
   */
  async getUserCollections(userId: string) {
    const collections = await this.prisma.collection.findMany({
      where: { userId },
      include: {
        items: {
          include: {
            resource: {
              select: {
                id: true,
                type: true,
                title: true,
                thumbnailUrl: true,
                publishedAt: true,
              },
            },
          },
          orderBy: {
            position: "asc",
          },
        },
      },
      orderBy: {
        sortOrder: "asc",
      },
    });

    return collections.map((collection) => ({
      ...collection,
      itemCount: collection.items.length,
    }));
  }

  /**
   * 获取单个收藏集详情
   */
  async getCollection(collectionId: string, userId?: string) {
    const collection = await this.prisma.collection.findUnique({
      where: { id: collectionId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
          },
        },
        items: {
          include: {
            resource: true,
          },
          orderBy: {
            position: "asc",
          },
        },
      },
    });

    if (!collection) {
      throw new NotFoundException("Collection not found");
    }

    // 如果是私有收藏集，只有所有者可以查看
    if (!collection.isPublic && collection.userId !== userId) {
      throw new ForbiddenException("You do not have access to this collection");
    }

    return {
      ...collection,
      itemCount: collection.items.length,
    };
  }

  /**
   * 更新收藏集
   */
  async updateCollection(
    collectionId: string,
    userId: string,
    dto: UpdateCollectionDto,
  ) {
    // 验证所有权
    const collection = await this.prisma.collection.findUnique({
      where: { id: collectionId },
    });

    if (!collection) {
      throw new NotFoundException("Collection not found");
    }

    if (collection.userId !== userId) {
      throw new ForbiddenException("You can only update your own collections");
    }

    const updated = await this.prisma.collection.update({
      where: { id: collectionId },
      data: {
        name: dto.name,
        description: dto.description,
        icon: dto.icon,
        color: dto.color,
        isPublic: dto.isPublic,
        sortOrder: dto.sortOrder,
      },
      include: {
        items: {
          include: {
            resource: true,
          },
        },
      },
    });

    this.logger.log(`Collection updated: ${updated.name}`);

    return updated;
  }

  /**
   * 删除收藏集
   */
  async deleteCollection(collectionId: string, userId: string) {
    // 验证所有权
    const collection = await this.prisma.collection.findUnique({
      where: { id: collectionId },
    });

    if (!collection) {
      throw new NotFoundException("Collection not found");
    }

    if (collection.userId !== userId) {
      throw new ForbiddenException("You can only delete your own collections");
    }

    await this.prisma.collection.delete({
      where: { id: collectionId },
    });

    this.logger.log(`Collection deleted: ${collection.name}`);

    return { success: true };
  }

  /**
   * 添加资源到收藏集
   */
  async addToCollection(
    collectionId: string,
    userId: string,
    dto: AddToCollectionDto,
  ) {
    // 验证所有权
    const collection = await this.prisma.collection.findUnique({
      where: { id: collectionId },
      include: {
        items: true,
      },
    });

    if (!collection) {
      throw new NotFoundException("Collection not found");
    }

    if (collection.userId !== userId) {
      throw new ForbiddenException("You can only add to your own collections");
    }

    // 检查是否已存在
    const existingItem = collection.items.find(
      (item) => item.resourceId === dto.resourceId,
    );
    if (existingItem) {
      return { success: true, message: "Resource already in collection" };
    }

    // 添加到收藏集
    const item = await this.prisma.collectionItem.create({
      data: {
        collectionId,
        resourceId: dto.resourceId,
        note: dto.note,
        position: collection.items.length,
      },
      include: {
        resource: true,
      },
    });

    this.logger.log(
      `Resource ${dto.resourceId} added to collection ${collectionId}`,
    );

    return { success: true, item };
  }

  /**
   * 从收藏集移除资源
   */
  async removeFromCollection(
    collectionId: string,
    resourceId: string,
    userId: string,
  ) {
    // 验证所有权
    const collection = await this.prisma.collection.findUnique({
      where: { id: collectionId },
    });

    if (!collection) {
      throw new NotFoundException("Collection not found");
    }

    if (collection.userId !== userId) {
      throw new ForbiddenException(
        "You can only remove from your own collections",
      );
    }

    // 查找并删除
    const item = await this.prisma.collectionItem.findFirst({
      where: {
        collectionId,
        resourceId,
      },
    });

    if (!item) {
      throw new NotFoundException("Item not found in collection");
    }

    await this.prisma.collectionItem.delete({
      where: { id: item.id },
    });

    this.logger.log(
      `Resource ${resourceId} removed from collection ${collectionId}`,
    );

    return { success: true };
  }

  /**
   * 更新收藏项笔记
   */
  async updateCollectionItemNote(
    collectionId: string,
    resourceId: string,
    userId: string,
    note: string,
  ) {
    // 验证所有权
    const collection = await this.prisma.collection.findUnique({
      where: { id: collectionId },
    });

    if (!collection) {
      throw new NotFoundException("Collection not found");
    }

    if (collection.userId !== userId) {
      throw new ForbiddenException("You can only update your own collections");
    }

    // 更新笔记
    const item = await this.prisma.collectionItem.findFirst({
      where: {
        collectionId,
        resourceId,
      },
    });

    if (!item) {
      throw new NotFoundException("Item not found in collection");
    }

    const updated = await this.prisma.collectionItem.update({
      where: { id: item.id },
      data: { note },
      include: {
        resource: true,
      },
    });

    return updated;
  }

  /**
   * 检查资源是否在用户的某个收藏集中
   */
  async isResourceInUserCollections(userId: string, resourceId: string) {
    const items = await this.prisma.collectionItem.findMany({
      where: {
        resourceId,
        collection: {
          userId,
        },
      },
      include: {
        collection: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return {
      isCollected: items.length > 0,
      collections: items.map((item) => item.collection),
    };
  }

  /**
   * 更新收藏项（标签、阅读状态等）
   */
  async updateCollectionItem(
    itemId: string,
    userId: string,
    dto: UpdateCollectionItemDto,
  ) {
    const item = await this.prisma.collectionItem.findUnique({
      where: { id: itemId },
      include: { collection: true },
    });

    if (!item) {
      throw new NotFoundException("Item not found");
    }

    if (item.collection.userId !== userId) {
      throw new ForbiddenException("You can only update your own items");
    }

    const updateData: Record<string, unknown> = {};

    if (dto.note !== undefined) updateData.note = dto.note;
    if (dto.readStatus !== undefined) updateData.readStatus = dto.readStatus;
    if (dto.readProgress !== undefined) {
      updateData.readProgress = dto.readProgress;
      if (dto.readProgress > 0) {
        updateData.lastReadAt = new Date();
      }
    }
    if (dto.tags !== undefined) updateData.tags = dto.tags;
    if (dto.position !== undefined) updateData.position = dto.position;

    const updated = await this.prisma.collectionItem.update({
      where: { id: itemId },
      data: updateData,
      include: { resource: true },
    });

    return updated;
  }

  /**
   * 获取用户的所有标签
   */
  async getUserTags(userId: string) {
    const items = await this.prisma.collectionItem.findMany({
      where: {
        collection: { userId },
      },
      select: { tags: true },
    });

    const tagCounts: Record<string, number> = {};
    items.forEach((item) => {
      const tags = item.tags as string[] | null;
      if (tags && Array.isArray(tags)) {
        tags.forEach((tag: string) => {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
      }
    });

    return Object.entries(tagCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * 批量移动收藏项到另一个收藏集
   */
  async batchMoveItems(userId: string, dto: BatchMoveItemsDto) {
    // 验证目标收藏集所有权
    const targetCollection = await this.prisma.collection.findUnique({
      where: { id: dto.targetCollectionId },
    });

    if (!targetCollection) {
      throw new NotFoundException("Target collection not found");
    }

    if (targetCollection.userId !== userId) {
      throw new ForbiddenException("You can only move to your own collections");
    }

    // 验证所有项属于用户
    const items = await this.prisma.collectionItem.findMany({
      where: {
        id: { in: dto.itemIds },
        collection: { userId },
      },
    });

    if (items.length !== dto.itemIds.length) {
      throw new ForbiddenException("Some items do not belong to you");
    }

    // 执行移动
    const updated = await this.prisma.collectionItem.updateMany({
      where: { id: { in: dto.itemIds } },
      data: { collectionId: dto.targetCollectionId },
    });

    this.logger.log(
      `Moved ${updated.count} items to collection ${dto.targetCollectionId}`,
    );

    return { success: true, movedCount: updated.count };
  }

  /**
   * 批量删除收藏项
   */
  async batchDeleteItems(userId: string, dto: BatchDeleteItemsDto) {
    // 验证所有项属于用户
    const items = await this.prisma.collectionItem.findMany({
      where: {
        id: { in: dto.itemIds },
        collection: { userId },
      },
    });

    if (items.length !== dto.itemIds.length) {
      throw new ForbiddenException("Some items do not belong to you");
    }

    const deleted = await this.prisma.collectionItem.deleteMany({
      where: { id: { in: dto.itemIds } },
    });

    this.logger.log(`Deleted ${deleted.count} items`);

    return { success: true, deletedCount: deleted.count };
  }

  /**
   * 批量更新标签
   */
  async batchUpdateTags(userId: string, dto: BatchUpdateTagsDto) {
    const items = await this.prisma.collectionItem.findMany({
      where: {
        id: { in: dto.itemIds },
        collection: { userId },
      },
    });

    if (items.length !== dto.itemIds.length) {
      throw new ForbiddenException("Some items do not belong to you");
    }

    const operation = dto.operation || "set";
    let updatedCount = 0;

    for (const item of items) {
      const currentTags = (item.tags as string[]) || [];
      let newTags: string[];

      switch (operation) {
        case "add":
          newTags = [...new Set([...currentTags, ...dto.tags])];
          break;
        case "remove":
          newTags = currentTags.filter((t) => !dto.tags.includes(t));
          break;
        case "set":
        default:
          newTags = dto.tags;
      }

      await this.prisma.collectionItem.update({
        where: { id: item.id },
        data: { tags: newTags },
      });
      updatedCount++;
    }

    return { success: true, updatedCount };
  }

  /**
   * 批量更新阅读状态
   */
  async batchUpdateStatus(userId: string, dto: BatchUpdateStatusDto) {
    const items = await this.prisma.collectionItem.findMany({
      where: {
        id: { in: dto.itemIds },
        collection: { userId },
      },
    });

    if (items.length !== dto.itemIds.length) {
      throw new ForbiddenException("Some items do not belong to you");
    }

    const updated = await this.prisma.collectionItem.updateMany({
      where: { id: { in: dto.itemIds } },
      data: { readStatus: dto.status },
    });

    return { success: true, updatedCount: updated.count };
  }

  /**
   * 获取用户收藏统计
   */
  async getUserStats(userId: string) {
    const [totalItems, byStatus, recentItems] = await Promise.all([
      this.prisma.collectionItem.count({
        where: { collection: { userId } },
      }),
      this.prisma.collectionItem.groupBy({
        by: ["readStatus"],
        where: { collection: { userId } },
        _count: { readStatus: true },
      }),
      this.prisma.collectionItem.count({
        where: {
          collection: { userId },
          addedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    const statusCounts: Record<string, number> = {};
    byStatus.forEach((s) => {
      statusCounts[s.readStatus] = s._count.readStatus;
    });

    return {
      totalItems,
      recentItems,
      byStatus: statusCounts,
    };
  }

  /**
   * 分页获取收藏项
   */
  async getCollectionItemsPaginated(
    collectionId: string | null,
    userId: string,
    options: {
      page?: number;
      limit?: number;
      status?: string;
      tag?: string;
      search?: string;
      sortBy?: string;
      sortOrder?: "asc" | "desc";
    },
  ) {
    const page = options.page || 1;
    const limit = Math.min(options.limit || 20, 100);
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {
      collection: { userId },
    };

    if (collectionId) {
      where.collectionId = collectionId;
    }

    if (options.status) {
      where.readStatus = options.status;
    }

    if (options.tag) {
      where.tags = { array_contains: [options.tag] };
    }

    if (options.search) {
      where.resource = {
        title: { contains: options.search, mode: "insensitive" },
      };
    }

    const sortBy = options.sortBy || "addedAt";
    const sortOrder = options.sortOrder || "desc";

    // Build orderBy clause based on sortBy field
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let orderBy: any;

    if (sortBy === "title") {
      orderBy = { resource: { title: sortOrder } };
    } else if (sortBy === "publishedAt") {
      orderBy = { resource: { publishedAt: sortOrder } };
    } else {
      orderBy = { [sortBy]: sortOrder };
    }

    const [items, total] = await Promise.all([
      this.prisma.collectionItem.findMany({
        where,
        include: {
          resource: {
            select: {
              id: true,
              type: true,
              title: true,
              abstract: true,
              thumbnailUrl: true,
              sourceUrl: true,
              publishedAt: true,
              upvoteCount: true,
            },
          },
          collection: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.collectionItem.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total,
      },
    };
  }
}
