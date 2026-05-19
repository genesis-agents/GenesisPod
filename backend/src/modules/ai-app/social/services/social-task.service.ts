import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SocialContentTaskStatus } from '@prisma/client';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import { SocialDataSourceRegistry } from '../registry/social-data-source.registry';
import { ContentFetcherService } from './content-fetcher.service';
import { SocialPipelineDispatcher } from './mission/workflow/social-pipeline-dispatcher.service';
import { CreateSocialTaskDto } from '../dto/create-social-task.dto';
import type { RawContentBag, RunSocialMissionInput } from './mission/workflow/mission-context';

@Injectable()
export class SocialTaskService {
  private readonly logger = new Logger(SocialTaskService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: SocialDataSourceRegistry,
    private readonly contentFetcher: ContentFetcherService,
    private readonly dispatcher: SocialPipelineDispatcher,
  ) {}

  async createTask(
    dto: CreateSocialTaskDto,
    userId: string,
  ): Promise<{ id: string }> {
    const urlCount = dto.externalUrls?.length ?? 0;
    if (dto.sources.length + urlCount < 1) {
      throw new BadRequestException(
        'At least one source or externalUrl is required',
      );
    }

    for (const platform of dto.platforms) {
      if (!dto.accountIds[platform]) {
        throw new BadRequestException(
          `Missing accountId for platform: ${platform}`,
        );
      }
    }

    const task = await this.prisma.socialContentTask.create({
      data: {
        userId,
        status: SocialContentTaskStatus.PENDING,
        prompt: dto.prompt ?? null,
        externalUrls: dto.externalUrls ?? [],
        platforms: dto.platforms,
        accountIds: dto.accountIds as object,
        sources: {
          createMany: {
            data: dto.sources.map((s) => ({
              userId,
              sourceType: s.sourceType,
              sourceId: s.sourceId,
            })),
          },
        },
      },
    });

    void this.dispatchTask(task.id, dto, userId);

    return { id: task.id };
  }

  async listTasks(
    userId: string,
    opts: { status?: string; cursor?: string; limit?: number },
  ) {
    const limit = Math.min(opts.limit ?? 20, 100);
    const items = await this.prisma.socialContentTask.findMany({
      where: {
        userId,
        ...(opts.status ? { status: opts.status as SocialContentTaskStatus } : {}),
        ...(opts.cursor ? { createdAt: { lt: new Date(opts.cursor) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      include: {
        sources: true,
        versions: {
          take: 1,
          select: { id: true, status: true },
        },
      },
    });

    const hasMore = items.length > limit;
    const result = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore
      ? result[result.length - 1].createdAt.toISOString()
      : undefined;

    return { items: result, nextCursor };
  }

  async getTask(taskId: string, userId: string) {
    const task = await this.prisma.socialContentTask.findFirst({
      where: { id: taskId, userId },
      include: {
        sources: true,
        versions: true,
      },
    });

    if (!task) {
      throw new NotFoundException(`Task ${taskId} not found`);
    }

    return task;
  }

  async cancelTask(taskId: string, userId: string): Promise<void> {
    const task = await this.prisma.socialContentTask.findFirst({
      where: { id: taskId, userId },
      select: { id: true, status: true },
    });

    if (!task) {
      throw new NotFoundException(`Task ${taskId} not found`);
    }

    const cancellable: SocialContentTaskStatus[] = [
      SocialContentTaskStatus.PENDING,
      SocialContentTaskStatus.GENERATING,
    ];

    if (!cancellable.includes(task.status)) {
      throw new BadRequestException(
        `Cannot cancel task in status: ${task.status}`,
      );
    }

    await this.prisma.socialContentTask.update({
      where: { id: taskId },
      data: { status: SocialContentTaskStatus.CANCELLED },
    });
  }

  private async dispatchTask(
    taskId: string,
    dto: CreateSocialTaskDto,
    userId: string,
  ): Promise<void> {
    try {
      await this.prisma.socialContentTask.update({
        where: { id: taskId },
        data: { status: SocialContentTaskStatus.GENERATING },
      });

      const aggregated = await this.aggregateContent(dto, userId);

      const input: RunSocialMissionInput = {
        contentId: taskId,
        platforms: dto.platforms,
        connectionIds: dto.accountIds,
        depth: dto.depth ?? 'standard',
        budgetProfile: 'standard',
        language: 'zh-CN',
      };

      const { missionId } = this.dispatcher.tryReserveInFlight(
        userId,
        taskId,
        dto.platforms,
      );

      await this.prisma.socialContentTask.update({
        where: { id: taskId },
        data: { missionId },
      });

      const result = await this.dispatcher.runMission(
        missionId,
        input,
        userId,
        undefined,
        aggregated,
      );

      if (result.status === 'completed') {
        await this.prisma.socialContentTask.update({
          where: { id: taskId },
          data: { status: SocialContentTaskStatus.DRAFT_READY },
        });
      } else {
        const errMsg =
          result.error instanceof Error
            ? result.error.message.slice(0, 500)
            : String(result.error ?? 'Mission failed').slice(0, 500);
        await this.prisma.socialContentTask.update({
          where: { id: taskId },
          data: {
            status: SocialContentTaskStatus.FAILED,
            errorMessage: errMsg,
          },
        });
      }
    } catch (err) {
      this.logger.error(
        `[${taskId}] dispatchTask threw: ${err instanceof Error ? err.message : String(err)}`,
      );
      const errMsg =
        err instanceof Error
          ? err.message.slice(0, 500)
          : String(err).slice(0, 500);
      await this.prisma.socialContentTask
        .update({
          where: { id: taskId },
          data: {
            status: SocialContentTaskStatus.FAILED,
            errorMessage: errMsg,
          },
        })
        .catch((updateErr: unknown) => {
          this.logger.error(
            `[${taskId}] Failed to mark task as FAILED: ${updateErr instanceof Error ? updateErr.message : String(updateErr)}`,
          );
        });
    }
  }

  private async aggregateContent(
    dto: CreateSocialTaskDto,
    userId: string,
  ): Promise<RawContentBag> {
    // Group sources by sourceType
    const byType = new Map<string, string[]>();
    for (const s of dto.sources) {
      if (!byType.has(s.sourceType)) byType.set(s.sourceType, []);
      byType.get(s.sourceType)!.push(s.sourceId);
    }

    // Fetch all source bundles in parallel (grouped by type)
    const bundleResults = await Promise.allSettled(
      Array.from(byType.entries()).map(([sourceType, ids]) => {
        const src = this.registry.get(sourceType);
        if (!src) {
          return Promise.reject(
            new Error(`Unknown source type: ${sourceType}`),
          );
        }
        return src.fetchBundle(ids, userId);
      }),
    );

    // Fetch external URLs in parallel
    const urlResults = await Promise.allSettled(
      (dto.externalUrls ?? []).map((url) =>
        this.contentFetcher.fetchFromUrl(url),
      ),
    );

    // Collect successful bundles
    const bundles: { title: string; body: string }[] = [];

    for (const r of bundleResults) {
      if (r.status === 'fulfilled') {
        for (const b of r.value) {
          bundles.push({ title: b.title, body: b.body });
        }
      } else {
        this.logger.warn(
          `aggregateContent: source fetch failed (non-fatal): ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`,
        );
      }
    }

    for (const r of urlResults) {
      if (r.status === 'fulfilled') {
        bundles.push({
          title: r.value.title || 'External Content',
          body: r.value.content,
        });
      } else {
        this.logger.warn(
          `aggregateContent: URL fetch failed (non-fatal): ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`,
        );
      }
    }

    if (bundles.length === 0) {
      throw new Error(
        'All sources and URLs failed to fetch — cannot generate content',
      );
    }

    const firstTitle = bundles[0].title || 'AI 社媒草稿';

    const bodyParts: string[] = [];
    if (dto.prompt) {
      bodyParts.push(`用户补充提示：${dto.prompt}\n`);
    }
    for (const b of bundles) {
      bodyParts.push(`# ${b.title}\n\n${b.body}`);
    }
    const body = bodyParts.join('\n\n---\n\n');

    return {
      title: firstTitle,
      body,
      digest: null,
      coverImageUrl: null,
    };
  }
}
