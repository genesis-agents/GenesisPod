import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  SocialContentTaskStatus,
  SocialContentVersionStatus,
} from "@prisma/client";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { SocialDataSourceRegistry } from "../registry/social-data-source.registry";
import { ContentFetcherService } from "./content-fetcher.service";
import { SocialPipelineDispatcher } from "./mission/workflow/social-pipeline-dispatcher.service";
import { SocialEventBuffer } from "./mission/lifecycle/social-event-buffer.service";
import { CreateSocialTaskDto } from "../dto/create-social-task.dto";
import type {
  RawContentBag,
  RunSocialMissionInput,
} from "./mission/workflow/mission-context";

@Injectable()
export class SocialTaskService {
  private readonly logger = new Logger(SocialTaskService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: SocialDataSourceRegistry,
    private readonly contentFetcher: ContentFetcherService,
    private readonly dispatcher: SocialPipelineDispatcher,
    private readonly buffer: SocialEventBuffer,
  ) {}

  /**
   * 拉取该 social mission 的累积事件（前端 hydrate + polling 兜底）。
   * 仿 agent-playground replay；事件源 = SocialEventBuffer（DomainEventBus adapter）。
   * 鉴权：mission 必须属于该用户（按 missionId 查 task）。
   */
  async getMissionReplay(
    missionId: string,
    userId: string,
    sinceTs?: number,
  ): Promise<{ events: readonly unknown[]; serverNow: number }> {
    const owned = await this.prisma.socialContentTask.findFirst({
      where: { missionId, userId },
      select: { id: true },
    });
    if (!owned) {
      throw new NotFoundException("Mission not found");
    }
    const events = this.buffer.read(missionId, sinceTs);
    return { events, serverNow: Date.now() };
  }

  async createTask(
    dto: CreateSocialTaskDto,
    userId: string,
  ): Promise<{ id: string }> {
    const urlCount = dto.externalUrls?.length ?? 0;
    if (dto.sources.length + urlCount < 1) {
      throw new BadRequestException(
        "At least one source or externalUrl is required",
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
        title: dto.title?.trim().slice(0, 200) ?? null,
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
        ...(opts.status
          ? { status: opts.status as SocialContentTaskStatus }
          : {}),
        ...(opts.cursor ? { createdAt: { lt: new Date(opts.cursor) } } : {}),
      },
      orderBy: { createdAt: "desc" },
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

  /**
   * 智能 delete：
   *   - PENDING / GENERATING → 标 CANCELLED（保留 row 供用户查看）
   *   - 其他终态（CANCELLED / FAILED / DRAFT_READY / PUBLISHED / PARTIAL_PUBLISHED / PUBLISHING）
   *     → 真删 row + cascade 清理 sources / versions
   *
   * 返回 { mode: 'cancelled' | 'deleted' } 让前端做合适的 toast。
   */
  async cancelTask(
    taskId: string,
    userId: string,
  ): Promise<{ mode: "cancelled" | "deleted" }> {
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

    if (cancellable.includes(task.status)) {
      await this.prisma.socialContentTask.update({
        where: { id: taskId },
        data: { status: SocialContentTaskStatus.CANCELLED },
      });
      return { mode: "cancelled" };
    }

    // 终态 → 真删除，cascade 由 schema 的 onDelete: Cascade 保证（versions /
    // sources 自动连带清理）
    await this.prisma.socialContentTask.delete({ where: { id: taskId } });
    return { mode: "deleted" };
  }

  /**
   * Retry a FAILED task: reset error state and re-dispatch with original sources/platforms.
   */
  async retryTask(taskId: string, userId: string): Promise<{ id: string }> {
    const task = await this.prisma.socialContentTask.findFirst({
      where: { id: taskId, userId },
      include: { sources: true },
    });
    if (!task) throw new NotFoundException(`Task not found: ${taskId}`);
    if (task.status !== SocialContentTaskStatus.FAILED) {
      throw new BadRequestException(
        `Only FAILED tasks can be retried (current: ${task.status})`,
      );
    }

    await this.prisma.socialContentTask.update({
      where: { id: taskId },
      data: {
        status: SocialContentTaskStatus.PENDING,
        errorMessage: null,
        missionId: null,
      },
    });

    const dto: CreateSocialTaskDto = {
      sources: task.sources.map((s) => ({
        sourceType: s.sourceType,
        sourceId: s.sourceId,
      })),
      externalUrls: task.externalUrls,
      prompt: task.prompt ?? undefined,
      platforms: task.platforms,
      accountIds: task.accountIds as CreateSocialTaskDto["accountIds"],
    };

    void this.dispatchTask(taskId, dto, userId);
    return { id: taskId };
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

      // ★ 2026-05-19 fix: SocialMission.contentId has FK → SocialContent.id.
      //   V4 task-mode doesn't naturally produce a SocialContent row, but the
      //   FK is still enforced at insert time (prod blocker:
      //   social_missions_content_id_fkey violation). Create a placeholder
      //   SocialContent row so the mission insert satisfies the constraint;
      //   the actual content body still flows through preHydratedContent and
      //   never reads from this row.
      const platformToContentType: Record<
        string,
        "WECHAT_ARTICLE" | "XIAOHONGSHU_NOTE"
      > = {
        WECHAT_MP: "WECHAT_ARTICLE",
        XIAOHONGSHU: "XIAOHONGSHU_NOTE",
      };
      const placeholder = await this.prisma.socialContent.create({
        data: {
          userId,
          contentType:
            platformToContentType[dto.platforms[0]] ?? "WECHAT_ARTICLE",
          sourceType: "MANUAL",
          title: (dto.prompt ?? `Task ${taskId.slice(0, 8)}`).slice(0, 200),
          content: aggregated.body ?? "",
        },
      });

      const input: RunSocialMissionInput = {
        contentId: placeholder.id,
        platforms: dto.platforms,
        connectionIds: dto.accountIds,
        depth: dto.depth ?? "standard",
        budgetProfile: "standard",
        language: "zh-CN",
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

      if (result.status === "completed") {
        // 先把生成内容落 SocialContentTaskVersion（输出报告 tab / 发布读此表；
        // s11 只写了 mission.trajectory，导致 task.versions 永远空 → 「版本生成中…」）
        await this.persistTaskVersions(taskId, missionId, dto.platforms);
        // ★ R3 P1-2 / R4 P1 fix (2026-05-18): 方案 §6.3 状态聚合规则 —
        //   按 SocialContentTaskVersion[].status 聚合任务级 status。
        await this.recomputeTaskStatus(taskId);
      } else {
        const errMsg =
          result.error instanceof Error
            ? result.error.message.slice(0, 500)
            : String(result.error ?? "Mission failed").slice(0, 500);
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

  /**
   * 方案 §6.3 任务级状态聚合规则：按 SocialContentTaskVersion[].status 聚合
   * - 全部 PUBLISHED                 → PUBLISHED
   * - 部分 PUBLISHED + 部分 FAILED   → PARTIAL_PUBLISHED
   * - 全部 FAILED                    → FAILED
   * - 任一 PUBLISHING                → PUBLISHING
   * - 无 version 或仅 DRAFT_READY/GENERATING → DRAFT_READY（默认草稿就绪）
   *
   * 调用时机：dispatcher 完成 mission（result.status === 'completed'）。
   * dispatcher 内部按 stage 写入 versions 行（可能晚于 mission completed 通知），
   * 因此本方法以 task version 当前快照为准。
   */
  /**
   * 把 mission 生成的最终内容（存在 social_missions.trajectory）落到
   * SocialContentTaskVersion —— 输出报告 tab / 发布面板读此表。
   * 修复：之前只写 trajectory JSON，task.versions 永远空 → 详情页「版本生成中…」。
   * 内容映射：title ← trajectory.platformVersions[平台].title；
   *           content ← trajectory.composed[平台].bodyHtml。
   */
  private async persistTaskVersions(
    taskId: string,
    missionId: string,
    platforms: string[],
  ): Promise<void> {
    try {
      const mission = await this.prisma.socialMission.findUnique({
        where: { id: missionId },
        select: { trajectory: true },
      });
      const traj = mission?.trajectory as {
        composed?: Record<string, { bodyHtml?: string }>;
        platformVersions?: Record<
          string,
          { title?: string; digest?: string | null }
        >;
      } | null;
      if (!traj) return;
      for (const platform of platforms) {
        const content = traj.composed?.[platform]?.bodyHtml ?? "";
        const title = traj.platformVersions?.[platform]?.title ?? "";
        const digest = traj.platformVersions?.[platform]?.digest ?? null;
        if (!content && !title) continue;
        await this.prisma.socialContentTaskVersion.upsert({
          where: { taskId_platform: { taskId, platform } },
          create: {
            taskId,
            platform,
            title: title || "(未命名)",
            content,
            digest,
            bodyMime: "text/html",
            status: SocialContentVersionStatus.DRAFT_READY,
          },
          update: {
            title: title || "(未命名)",
            content,
            digest,
            status: SocialContentVersionStatus.DRAFT_READY,
          },
        });
      }
    } catch (err) {
      this.logger.warn(
        `[${taskId}] persistTaskVersions failed (non-fatal): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private async recomputeTaskStatus(taskId: string): Promise<void> {
    const versions = await this.prisma.socialContentTaskVersion.findMany({
      where: { taskId },
      select: { status: true },
    });

    let nextStatus: SocialContentTaskStatus;
    if (versions.length === 0) {
      // dispatcher 未写 versions：按默认 DRAFT_READY 处理（用户可点击发布触发实际推送）
      nextStatus = SocialContentTaskStatus.DRAFT_READY;
    } else {
      const all = versions.length;
      const published = versions.filter((v) => v.status === "PUBLISHED").length;
      const failed = versions.filter((v) => v.status === "FAILED").length;
      const publishing = versions.filter(
        (v) => v.status === "PUBLISHING",
      ).length;

      if (publishing > 0) {
        nextStatus = SocialContentTaskStatus.PUBLISHING;
      } else if (published === all) {
        nextStatus = SocialContentTaskStatus.PUBLISHED;
      } else if (failed === all) {
        nextStatus = SocialContentTaskStatus.FAILED;
      } else if (published > 0 && failed > 0) {
        nextStatus = SocialContentTaskStatus.PARTIAL_PUBLISHED;
      } else {
        // 混合 DRAFT_READY/GENERATING/未发布 状态，按 DRAFT_READY 处理
        nextStatus = SocialContentTaskStatus.DRAFT_READY;
      }
    }

    await this.prisma.socialContentTask.update({
      where: { id: taskId },
      data: { status: nextStatus },
    });
    this.logger.log(
      `[${taskId}] status recomputed: ${nextStatus} (versions=${versions.length})`,
    );
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
    // ★ R5 P1 fix (2026-05-18): 每条 source body 截断到 10K char 防 prompt
    //   injection 攻击 LLM context window + LLM token 预算爆掉。
    const MAX_BODY_CHARS_PER_BUNDLE = 10000;
    const truncate = (s: string) =>
      s.length > MAX_BODY_CHARS_PER_BUNDLE
        ? s.slice(0, MAX_BODY_CHARS_PER_BUNDLE) + "\n\n…[truncated]"
        : s;

    const bundles: { title: string; body: string }[] = [];

    for (const r of bundleResults) {
      if (r.status === "fulfilled") {
        for (const b of r.value) {
          bundles.push({ title: b.title, body: truncate(b.body) });
        }
      } else {
        this.logger.warn(
          `aggregateContent: source fetch failed (non-fatal): ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`,
        );
      }
    }

    for (const r of urlResults) {
      if (r.status === "fulfilled") {
        bundles.push({
          title: r.value.title || "External Content",
          body: truncate(r.value.content),
        });
      } else {
        this.logger.warn(
          `aggregateContent: URL fetch failed (non-fatal): ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`,
        );
      }
    }

    if (bundles.length === 0) {
      throw new Error(
        "All sources and URLs failed to fetch — cannot generate content",
      );
    }

    const firstTitle = bundles[0].title || "AI 社媒草稿";

    const bodyParts: string[] = [];
    if (dto.prompt) {
      bodyParts.push(`用户补充提示：${dto.prompt}\n`);
    }
    for (const b of bundles) {
      bodyParts.push(`# ${b.title}\n\n${b.body}`);
    }
    const body = bodyParts.join("\n\n---\n\n");

    return {
      title: firstTitle,
      body,
      digest: null,
      coverImageUrl: null,
    };
  }
}
