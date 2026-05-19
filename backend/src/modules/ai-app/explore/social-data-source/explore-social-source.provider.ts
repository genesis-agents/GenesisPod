import { Injectable } from '@nestjs/common';
import { ResourceType } from '@prisma/client';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import {
  SocialDataSource,
  SocialDataSourceProvider,
  SourceContentBundle,
  SourceItem,
  SourceListFilter,
  SourceListResult,
} from '../../contracts/social-data-source';

/** ResourceType values that represent video content */
const VIDEO_TYPES = new Set<ResourceType>([ResourceType.YOUTUBE_VIDEO]);

function toContentKind(type: ResourceType): SourceItem['contentKind'] {
  return VIDEO_TYPES.has(type) ? 'video' : 'article';
}

/**
 * ExploreSocialSourceProvider
 *
 * Exposes the current user's curated Explore resources as a SocialDataSource.
 *
 * Resource itself has no userId — it is a public catalog. A resource counts as
 * "the user's" only when it appears in at least one of the user's collections
 * (Collection.userId === requestingUserId). Cross-user isolation is enforced
 * structurally via the `collectionItems.some.collection.userId` filter.
 */
@Injectable()
@SocialDataSourceProvider()
export class ExploreSocialSourceProvider implements SocialDataSource {
  readonly id = 'AI_EXPLORE';
  readonly displayName = { 'zh-CN': 'AI 探索', 'en-US': 'AI Explore' };
  readonly icon = 'Compass';
  readonly description = {
    'zh-CN': '从我收藏的 AI 探索资源（视频/文章）中选择',
    'en-US': "Pick from my curated AI Explore resources (videos/articles)",
  };
  readonly contentKinds = ['article', 'video'] as const;
  readonly maxItemsPerTask = 10;

  constructor(private readonly prisma: PrismaService) {}

  async listItems(
    userId: string,
    filter: SourceListFilter,
  ): Promise<SourceListResult> {
    const limit = filter.limit ?? 20;

    const resources = await this.prisma.resource.findMany({
      where: {
        // Structural cross-user isolation: only resources in user's own
        // collections are visible.
        collectionItems: {
          some: { collection: { userId } },
        },
        NOT: { title: '' },
        ...(filter.search
          ? {
              OR: [
                { title: { contains: filter.search, mode: 'insensitive' } },
                { abstract: { contains: filter.search, mode: 'insensitive' } },
              ],
            }
          : {}),
        ...(filter.tags && filter.tags.length > 0
          ? { tags: { path: [], array_contains: filter.tags } }
          : {}),
        ...(filter.dateRange
          ? {
              createdAt: {
                gte: new Date(filter.dateRange.from),
                lte: new Date(filter.dateRange.to),
              },
            }
          : {}),
        ...(filter.cursor ? { id: { gt: filter.cursor } } : {}),
      },
      select: {
        id: true,
        type: true,
        title: true,
        abstract: true,
        thumbnailUrl: true,
        tags: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });

    const hasMore = resources.length > limit;
    const items = hasMore ? resources.slice(0, limit) : resources;

    const result: SourceItem[] = items.map((r) => ({
      id: r.id,
      title: r.title,
      preview: r.abstract ? r.abstract.slice(0, 200) : undefined,
      contentKind: toContentKind(r.type),
      thumbnailUrl: r.thumbnailUrl ?? undefined,
      tags: Array.isArray(r.tags) ? (r.tags as string[]) : undefined,
      createdAt: r.createdAt.toISOString(),
    }));

    return {
      items: result,
      nextCursor: hasMore ? items[items.length - 1].id : undefined,
    };
  }

  async fetchBundle(
    itemIds: string[],
    userId: string,
  ): Promise<SourceContentBundle[]> {
    if (itemIds.length === 0) return [];

    // Strict cross-user isolation: resource must be in one of the user's
    // own collections. A resource that was never collected by the caller
    // is structurally excluded from results.
    const resources = await this.prisma.resource.findMany({
      where: {
        id: { in: itemIds },
        collectionItems: {
          some: { collection: { userId } },
        },
      },
      select: {
        id: true,
        type: true,
        title: true,
        abstract: true,
        content: true,
        sourceUrl: true,
        thumbnailUrl: true,
        tags: true,
        createdAt: true,
      },
    });

    return resources.map((r) => ({
      sourceType: this.id,
      sourceId: r.id,
      title: r.title,
      body: r.content ?? r.abstract ?? '',
      bodyMime: 'text/plain' as const,
      sourceMetadata: {
        resourceType: r.type,
        contentKind: toContentKind(r.type),
        sourceUrl: r.sourceUrl,
        thumbnailUrl: r.thumbnailUrl ?? null,
        tags: Array.isArray(r.tags) ? r.tags : [],
        createdAt: r.createdAt.toISOString(),
      },
      displayMetadata: {
        contentKind: toContentKind(r.type),
        thumbnailUrl: r.thumbnailUrl ?? null,
      },
    }));
  }
}
