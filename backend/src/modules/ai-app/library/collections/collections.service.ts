import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { ChatFacade } from "@/modules/ai-harness/facade";
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

  constructor(
    private prisma: PrismaService,
    private chatFacade: ChatFacade,
  ) {}

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
   * 使用 _count 获取真实条目数，批量加载所有收藏集的预览条目（避免 N+1）
   */
  async getUserCollections(userId: string) {
    // Step 1: Get collections with item counts (constant query count)
    const collections = await this.prisma.collection.findMany({
      where: { userId },
      include: { _count: { select: { items: true } } },
      orderBy: { sortOrder: "asc" },
    });

    if (collections.length === 0) return [];

    // Step 2: Batch-fetch preview items for ALL collections in one query
    // Replaces N per-collection queries with a single IN query
    const collectionIds = collections.map((c) => c.id);
    const allItems = await this.prisma.collectionItem.findMany({
      where: { collectionId: { in: collectionIds } },
      select: {
        id: true,
        collectionId: true,
        position: true,
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
      orderBy: { position: "asc" },
    });

    // Group by collectionId, take first 10 per collection
    const itemsByCollection = new Map<
      string,
      { id: string; resource: (typeof allItems)[0]["resource"] }[]
    >();
    for (const item of allItems) {
      const list = itemsByCollection.get(item.collectionId);
      if (!list) {
        itemsByCollection.set(item.collectionId, [
          { id: item.id, resource: item.resource },
        ]);
      } else if (list.length < 10) {
        list.push({ id: item.id, resource: item.resource });
      }
    }

    return collections.map(({ _count, ...collection }) => ({
      ...collection,
      itemCount: _count.items,
      items: itemsByCollection.get(collection.id) || [],
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

    // 异步生成AI标签（不阻塞返回）
    this.generateAutoTags(
      item.id,
      item.resource
        ? {
            title: item.resource.title,
            abstract: item.resource.abstract ?? undefined,
            type: item.resource.type ?? undefined,
          }
        : null,
    ).catch((err: Error) => {
      this.logger.warn(`Failed to generate auto-tags: ${err.message}`);
    });

    return { success: true, item };
  }

  /**
   * AI自动生成标签
   * 使用配置的默认文本模型，不硬编码模型名称
   */
  private async generateAutoTags(
    itemId: string,
    resource: { title: string; abstract?: string; type?: string } | null,
  ) {
    if (!resource) return;

    try {
      // ★ 通过 AIFacade 获取默认文本模型
      const model = await this.chatFacade.getDefaultTextModel();
      if (!model) {
        this.logger.warn("[generateAutoTags] No default text model available");
        return;
      }
      const content = `Title: ${resource.title}\n${resource.abstract ? `Abstract: ${resource.abstract}` : ""}`;

      const response = await this.chatFacade.chat({
        messages: [
          {
            role: "user",
            content: `Generate tags for:\n${content}`,
          },
        ],
        systemPrompt:
          'You are a tagging assistant. Generate 3-5 relevant tags for the given content. Return ONLY a JSON array of strings, no other text. Example: ["machine learning", "NLP", "deep learning"]',
        taskProfile: {
          creativity: "low",
          outputLength: "minimal",
        },
      });

      // Parse the response to extract tags
      const tagsText = response.content.trim();
      let tags: string[] = [];

      try {
        // Try to parse as JSON array
        tags = JSON.parse(tagsText);
        if (!Array.isArray(tags)) {
          tags = [];
        }
      } catch {
        // Fallback: extract words that look like tags
        const matches = tagsText.match(/"([^"]+)"/g);
        if (matches) {
          tags = matches.map((m) => m.replace(/"/g, ""));
        }
      }

      // Limit to 5 tags and clean up
      tags = tags
        .slice(0, 5)
        .map((t) => t.toLowerCase().trim())
        .filter((t) => t.length > 0 && t.length <= 30);

      if (tags.length > 0) {
        await this.prisma.collectionItem.update({
          where: { id: itemId },
          data: { tags },
        });
        this.logger.log(
          `Auto-tags generated for item ${itemId} using ${model.displayName}: ${tags.join(", ")}`,
        );
      }
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Auto-tagging failed for item ${itemId}: ${errMsg}`);
    }
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
   * 使用 PostgreSQL JSONB 聚合，避免将全部数据加载到 JS 内存
   */
  async getUserTags(userId: string) {
    const rows = await this.prisma.$queryRaw<{ name: string; count: bigint }[]>`
      SELECT tag AS name, COUNT(*) AS count
      FROM collection_items ci
      JOIN collections c ON c.id = ci.collection_id
      CROSS JOIN LATERAL jsonb_array_elements_text(ci.tags) AS tag
      WHERE c.user_id = ${userId}
        AND ci.tags IS NOT NULL
        AND jsonb_typeof(ci.tags) = 'array'
        AND jsonb_array_length(ci.tags) > 0
      GROUP BY tag
      ORDER BY count DESC
    `;

    return rows.map((r) => ({ name: r.name, count: Number(r.count) }));
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

  // ========== AI Organize Methods ==========

  /**
   * 获取AI整理统计数据
   */
  async getAIOrganizeStats(userId: string) {
    const [totalCount, untaggedCount, unclassifiedCount] = await Promise.all([
      // 总数
      this.prisma.collectionItem.count({
        where: { collection: { userId } },
      }),
      // 没有标签的数量
      this.prisma.collectionItem.count({
        where: {
          collection: { userId },
          OR: [{ tags: { equals: [] } }, { tags: { equals: Prisma.DbNull } }],
        },
      }),
      // 在默认收藏集中的数量（未分类）
      this.prisma.collectionItem.count({
        where: {
          collection: {
            userId,
            name: { in: ["默认收藏", "Default", "Uncategorized"] },
          },
        },
      }),
    ]);

    return {
      totalCount,
      untaggedCount,
      unclassifiedCount,
    };
  }

  /**
   * AI批量生成标签
   * 使用配置的默认文本模型，不硬编码模型名称
   */
  async aiBatchGenerateTags(userId: string, collectionId?: string) {
    // ★ 通过 AIFacade 获取默认文本模型
    const model = await this.chatFacade.getDefaultTextModel();
    if (!model) {
      throw new Error("No default text model available for batch tagging");
    }
    this.logger.log(`AI batch tagging using model: ${model.displayName}`);

    // 获取没有标签的收藏项
    const whereClause: Record<string, unknown> = {
      collection: { userId },
      OR: [{ tags: { equals: [] } }, { tags: { equals: Prisma.DbNull } }],
    };

    if (collectionId) {
      whereClause.collectionId = collectionId;
    }

    const items = await this.prisma.collectionItem.findMany({
      where: whereClause,
      include: {
        resource: {
          select: {
            id: true,
            title: true,
            abstract: true,
            type: true,
          },
        },
      },
      take: 50, // 限制每次处理数量
    });

    if (items.length === 0) {
      return { taggedCount: 0, message: "No items without tags found" };
    }

    let taggedCount = 0;
    const errors: string[] = [];

    // 并行处理（每批5个）
    const batchSize = 5;
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(async (item) => {
          if (!item.resource) return null;

          const content = `Title: ${item.resource.title}\n${item.resource.abstract ? `Abstract: ${item.resource.abstract}` : ""}`;

          try {
            const response = await this.chatFacade.chat({
              messages: [
                {
                  role: "user",
                  content: `Generate tags for:\n${content}`,
                },
              ],
              systemPrompt:
                'You are a tagging assistant. Generate 3-5 relevant tags for the given content. Return ONLY a JSON array of strings, no other text. Example: ["machine learning", "NLP"]',
              taskProfile: {
                creativity: "low",
                outputLength: "minimal",
              },
              // ★ 自动积分扣除
              billing: {
                userId,
                moduleType: "library",
                operationType: "ai-extract",
                referenceId: item.id,
                description: "批量生成标签",
              },
            });

            let tags: string[] = [];
            try {
              tags = JSON.parse(response.content.trim());
              if (!Array.isArray(tags)) tags = [];
            } catch {
              const matches = response.content.match(/"([^"]+)"/g);
              if (matches) {
                tags = matches.map((m) => m.replace(/"/g, ""));
              }
            }

            tags = tags
              .slice(0, 5)
              .map((t) => t.toLowerCase().trim())
              .filter((t) => t.length > 0 && t.length <= 30);

            if (tags.length > 0) {
              await this.prisma.collectionItem.update({
                where: { id: item.id },
                data: { tags },
              });
              return true;
            }
            return false;
          } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            this.logger.warn(`Failed to tag item ${item.id}: ${errMsg}`);
            return false;
          }
        }),
      );

      results.forEach((result) => {
        if (result.status === "fulfilled" && result.value) {
          taggedCount++;
        }
      });
    }

    this.logger.log(
      `AI batch tagging completed: ${taggedCount}/${items.length} items tagged using ${model.displayName}`,
    );

    return {
      taggedCount,
      totalProcessed: items.length,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * AI智能分类建议
   * 使用配置的默认文本模型，不硬编码模型名称
   */
  async aiSmartClassify(userId: string) {
    // ★ 通过 AIFacade 获取默认文本模型
    const model = await this.chatFacade.getDefaultTextModel();
    if (!model) {
      throw new Error("No default text model available for smart classify");
    }
    this.logger.log(`AI smart classify using model: ${model.displayName}`);

    // 获取用户的所有收藏集
    const collections = await this.prisma.collection.findMany({
      where: { userId },
      select: { id: true, name: true, description: true },
    });

    if (collections.length <= 1) {
      return {
        suggestions: [],
        message: "Need at least 2 collections for smart classification",
      };
    }

    // 获取默认收藏集中的项目
    const defaultItems = await this.prisma.collectionItem.findMany({
      where: {
        collection: {
          userId,
          name: { in: ["默认收藏", "Default", "Uncategorized"] },
        },
      },
      include: {
        resource: {
          select: {
            id: true,
            title: true,
            abstract: true,
            type: true,
          },
        },
      },
      take: 20,
    });

    if (defaultItems.length === 0) {
      return { suggestions: [], message: "No uncategorized items to classify" };
    }

    const collectionDescriptions = collections
      .filter((c) => !["默认收藏", "Default", "Uncategorized"].includes(c.name))
      .map((c) => `- ${c.name}: ${c.description || "No description"}`)
      .join("\n");

    const suggestions: Array<{
      itemId: string;
      resourceTitle: string;
      suggestedCollection: string;
      confidence: number;
    }> = [];

    // 批量处理
    for (const item of defaultItems.slice(0, 10)) {
      if (!item.resource) continue;

      try {
        const response = await this.chatFacade.chat({
          messages: [
            {
              role: "user",
              content: `Resource: ${item.resource.title}\n${item.resource.abstract || ""}\n\nAvailable collections:\n${collectionDescriptions}\n\nWhich collection fits best?`,
            },
          ],
          systemPrompt: `You are a classification assistant. Given a resource and a list of collections, suggest the best matching collection. Return ONLY a JSON object with "collection" (string) and "confidence" (number 0-1).`,
          taskProfile: {
            creativity: "low",
            outputLength: "minimal",
          },
          billing: {
            userId,
            moduleType: "library",
            operationType: "ai-classify",
            referenceId: item.id,
            description: `智能分类 - ${item.resource.title.substring(0, 30)}`,
          },
        });

        try {
          const result = JSON.parse(response.content.trim());
          if (result.collection) {
            suggestions.push({
              itemId: item.id,
              resourceTitle: item.resource.title,
              suggestedCollection: result.collection,
              confidence: result.confidence || 0.5,
            });
          }
        } catch {
          // Parse error, skip
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Classification failed for ${item.id}: ${errMsg}`);
      }
    }

    return {
      suggestions,
      totalProcessed: defaultItems.length,
    };
  }

  /**
   * AI主题聚类发现
   * 使用配置的默认文本模型，不硬编码模型名称
   */
  async aiThemeCluster(userId: string) {
    // ★ 通过 AIFacade 获取默认文本模型
    const model = await this.chatFacade.getDefaultTextModel();
    if (!model) {
      throw new Error("No default text model available for theme clustering");
    }
    this.logger.log(`AI theme cluster using model: ${model.displayName}`);

    // 获取用户所有收藏项的标题和摘要
    const items = await this.prisma.collectionItem.findMany({
      where: { collection: { userId } },
      include: {
        resource: {
          select: {
            id: true,
            title: true,
            abstract: true,
          },
        },
      },
      take: 100,
    });

    if (items.length < 5) {
      return {
        clusters: [],
        message: "Need at least 5 items for theme clustering",
      };
    }

    // 构建内容摘要
    const contentSummary = items
      .filter((item) => item.resource)
      .slice(0, 50)
      .map((item, idx) => `${idx + 1}. ${item.resource?.title ?? ""}`)
      .join("\n");

    try {
      const response = await this.chatFacade.chat({
        messages: [
          {
            role: "user",
            content: `Analyze these resources and identify main themes:\n\n${contentSummary}`,
          },
        ],
        systemPrompt: `You are a theme discovery assistant. Analyze the given list of resource titles and identify 3-7 main themes or topics. Return ONLY a JSON array of objects with "name" (theme name) and "keywords" (array of related keywords).`,
        taskProfile: {
          creativity: "medium",
          outputLength: "short",
        },
        billing: {
          userId,
          moduleType: "library",
          operationType: "ai-cluster",
          referenceId: userId,
          description: `主题聚类 - ${items.length} 个资源`,
        },
      });

      let clusters: Array<{
        name: string;
        keywords: string[];
        count?: number;
      }> = [];

      try {
        clusters = JSON.parse(response.content.trim());
        if (!Array.isArray(clusters)) clusters = [];

        // 计算每个主题的资源数量
        clusters = clusters.map((cluster) => {
          const keywords = cluster.keywords || [];
          const matchCount = items.filter((item) => {
            const title = item.resource?.title?.toLowerCase() || "";
            return keywords.some(
              (kw: string) =>
                title.includes(kw.toLowerCase()) ||
                cluster.name.toLowerCase().includes(kw.toLowerCase()),
            );
          }).length;

          return {
            ...cluster,
            count: matchCount || Math.floor(items.length / clusters.length),
          };
        });
      } catch {
        this.logger.warn("Failed to parse theme clusters response");
      }

      return {
        clusters,
        totalItems: items.length,
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Theme clustering failed: ${errMsg}`);
      return {
        clusters: [],
        error: errMsg,
      };
    }
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
    const emptyResult = {
      items: [] as unknown[],
      pagination: { page, limit, total: 0, totalPages: 0, hasMore: false },
    };

    // Pre-fetch user's collectionIds to replace relation filter JOIN
    // Uses @@index([userId]) on collections — fast lookup
    const where: Record<string, unknown> = {};

    if (collectionId) {
      // Verify collection belongs to this user (authorization)
      const owned = await this.prisma.collection.findFirst({
        where: { id: collectionId, userId },
        select: { id: true },
      });
      if (!owned) return emptyResult;
      where.collectionId = collectionId;
    } else {
      const userCollections = await this.prisma.collection.findMany({
        where: { userId },
        select: { id: true },
      });
      if (userCollections.length === 0) return emptyResult;
      where.collectionId = { in: userCollections.map((c) => c.id) };
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
    let orderBy: Prisma.CollectionItemOrderByWithRelationInput;

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
