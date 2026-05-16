import { ConflictException, Injectable, Logger } from "@nestjs/common";
import {
  Prisma,
  RadarRun,
  RadarRunStatus,
  RadarRunTrigger,
  RadarSource,
  RadarSourceHealth,
} from "@prisma/client";
import { PrismaService } from "../../../../../common/prisma/prisma.service";
import {
  DEFAULT_REFRESH_CRON,
  RADAR_PIPELINE_DEFAULTS,
} from "../../radar.constants";
import { CollectorRouter } from "../collectors/collector-router.service";
import { RawCollectedItem } from "../collectors/icollector";
import { SourceHealthService } from "../source/source-health.service";
import { RadarPipeline } from "../pipeline/radar-pipeline.service";
import { computeNextCronTick } from "../scheduler/cron-util";

export interface CollectRunSummary {
  runId: string;
  status: RadarRunStatus;
  sourcesAttempted: number;
  sourcesFailed: number;
  itemsFetched: number;
  itemsDeduped: number;
  itemsInserted: number;
  durationMs: number;
  errors: Array<{ sourceId: string; error: string }>;
}

/**
 * RadarCollectService —— 单次刷新的核心编排（PR-R2 范围）。
 *
 * 流程：
 *   1. createRun(PENDING → RUNNING) + load enabled sources (cooldown 过滤)
 *   2. fanOut collectors → 收集 RawCollectedItem[] (Promise.all)
 *   3. 单 source 失败 → SourceHealthService.markFailure
 *   4. dedupe：跳过 (topicId, externalId) 已存在
 *   5. insertMany RadarItem (skipDuplicates，relevanceScore/qualityScore 留 null，PR-R3 才填)
 *   6. RadarRun.completedAt + metrics 写入
 *
 * 注：PR-R2 不做 AI 评分（score/aiSummary/entities 留 null），不发 RadarInsight。
 *     PR-R3 会接 AI Agent pipeline 在 collect 之后做 S4~S7 stages。
 */
@Injectable()
export class RadarCollectService {
  private readonly log = new Logger(RadarCollectService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly router: CollectorRouter,
    private readonly health: SourceHealthService,
    private readonly pipeline: RadarPipeline,
  ) {}

  /**
   * Topic 一次刷新（同步执行）。
   *
   * PR-R2 是同步链路（无 ws progress），PR-R4 会改成 fire-and-forget + 事件驱动。
   */
  async runRefresh(
    topicId: string,
    trigger: RadarRunTrigger = RadarRunTrigger.MANUAL,
    opts: { userId?: string; dedupSeconds?: number } = {},
  ): Promise<CollectRunSummary> {
    // dedup + 创建 run 在同事务（防 findFirst → create 之间的 race），
    // 同 topic 已有 RUNNING/PENDING 直接抛 ConflictException。
    const run = await this.acquireRunSlot(topicId, trigger, opts.dedupSeconds);
    const start = Date.now();
    const errors: Array<{ sourceId: string; error: string }> = [];

    try {
      const topic = await this.prisma.radarTopic.findUniqueOrThrow({
        where: { id: topicId },
      });
      const sources = await this.loadEligibleSources(topicId);
      if (sources.length === 0) {
        await this.completeRun(run.id, RadarRunStatus.COMPLETED, {
          itemsFetched: 0,
          itemsDeduped: 0,
          itemsInserted: 0,
          sourcesAttempted: 0,
          sourcesFailed: 0,
          errors: [],
          duration: Date.now() - start,
        });
        return {
          runId: run.id,
          status: RadarRunStatus.COMPLETED,
          sourcesAttempted: 0,
          sourcesFailed: 0,
          itemsFetched: 0,
          itemsDeduped: 0,
          itemsInserted: 0,
          durationMs: Date.now() - start,
          errors: [],
        };
      }

      const since = await this.computeSince(topicId);
      // userId 来自 controller 透传或 scheduler 的 topic.userId；空字符串让下游
      // BYOK resolver 自然走 system 默认（不要硬编码 "system" 字面量，会污染日志）。
      const collectorUserId = opts.userId ?? "";
      const results = await this.router.fanOut(sources, {
        since,
        perSourceLimit: RADAR_PIPELINE_DEFAULTS.perSourceItemLimit,
        userId: collectorUserId,
      });

      let itemsFetched = 0;
      let itemsInserted = 0;
      let itemsDeduped = 0;
      let sourcesFailed = 0;
      const newItemIds: string[] = [];

      for (const result of results) {
        if (result.error) {
          sourcesFailed++;
          errors.push({ sourceId: result.sourceId, error: result.error });
          await this.health.markFailure(result.sourceId, result.error);
          continue;
        }
        await this.health.markSuccess(result.sourceId);
        itemsFetched += result.items.length;
        const inserted = await this.insertItems(
          topicId,
          result.sourceId,
          result.items,
        );
        itemsInserted += inserted.inserted;
        itemsDeduped += inserted.deduped;
        newItemIds.push(...inserted.ids);
      }

      // AI Pipeline（S4~S8）：scoring + entity + insight
      const pipelineSummary = await this.pipeline.enrich(
        topic,
        newItemIds,
        run.id,
        opts.userId,
      );
      this.log.log(
        `Pipeline enrich topic=${topicId} evaluated=${pipelineSummary.itemsEvaluated} accepted=${pipelineSummary.itemsAccepted} insight=${pipelineSummary.insightCreated}`,
      );

      // topic.lastRunAt + nextDueAt（按 refreshCron 算下次）
      const lastRunAt = new Date();
      const nextDueAt =
        computeNextCronTick(topic.refreshCron, lastRunAt) ??
        computeNextCronTick(DEFAULT_REFRESH_CRON, lastRunAt);
      await this.prisma.radarTopic.update({
        where: { id: topicId },
        data: { lastRunAt, nextDueAt },
      });

      await this.completeRun(run.id, RadarRunStatus.COMPLETED, {
        itemsFetched,
        itemsDeduped,
        itemsInserted,
        sourcesAttempted: sources.length,
        sourcesFailed,
        errors,
        duration: Date.now() - start,
      });
      return {
        runId: run.id,
        status: RadarRunStatus.COMPLETED,
        sourcesAttempted: sources.length,
        sourcesFailed,
        itemsFetched,
        itemsDeduped,
        itemsInserted,
        durationMs: Date.now() - start,
        errors,
      };
    } catch (err) {
      const msg = (err as Error).message || String(err);
      this.log.error(`Run ${run.id} failed: ${msg}`);
      await this.completeRun(run.id, RadarRunStatus.FAILED, {
        itemsFetched: 0,
        itemsDeduped: 0,
        itemsInserted: 0,
        sourcesAttempted: 0,
        sourcesFailed: 0,
        errors: [{ sourceId: "pipeline", error: msg }],
        duration: Date.now() - start,
        topLevelError: msg,
      });
      return {
        runId: run.id,
        status: RadarRunStatus.FAILED,
        sourcesAttempted: 0,
        sourcesFailed: 0,
        itemsFetched: 0,
        itemsDeduped: 0,
        itemsInserted: 0,
        durationMs: Date.now() - start,
        errors: [{ sourceId: "pipeline", error: msg }],
      };
    }
  }

  /**
   * 原子获取 run slot：在同事务内 inflight 检查 + 5s 完成 dedup + create。
   *
   * Prisma 没有内置 partial unique index 表达"同 topic 只能有 1 个 RUNNING"，
   * 用 $transaction 序列化读+写 是项目里其他模块同样的做法。极端情况下两个
   * 并发请求可能仍创建两个 RUNNING（PG 默认 READ COMMITTED），但相比原来
   * 在 controller 层 findFirst → create 两步独立调用，race window 从秒级压
   * 缩到事务期内（ms 级），实际滥用风险可控。
   *
   * @throws ConflictException 已有 inflight 或刚完成的 run
   */
  /**
   * @deprecated 即将整体删除（彻底重构走 RadarPipelineDispatcher + RadarMissionStore）。
   * 临时保留是为了让 controller / scheduler / module 的中间状态编译通过；
   * Phase 5/6/7 完成后整体删除此 service。
   */
  private async acquireRunSlot(
    topicId: string,
    trigger: RadarRunTrigger,
    dedupSeconds?: number,
  ): Promise<RadarRun> {
    const dedupMs = (dedupSeconds ?? 5) * 1000;
    const dedupSince = new Date(Date.now() - dedupMs);
    // 重构期间补 userId 占位（即将删除），从 topic 反查
    const topic = await this.prisma.radarTopic.findUnique({
      where: { id: topicId },
      select: { userId: true },
    });
    if (!topic) throw new ConflictException("topic 不存在");
    return this.prisma.$transaction(async (tx) => {
      const inflight = await tx.radarRun.findFirst({
        where: {
          topicId,
          status: "running",
        },
        select: { id: true, status: true },
      });
      if (inflight) {
        throw new ConflictException({
          message: "已有 run 正在执行，请稍候",
          runId: inflight.id,
          status: inflight.status,
        });
      }
      if (dedupSeconds && dedupSeconds > 0) {
        const recentDone = await tx.radarRun.findFirst({
          where: {
            topicId,
            startedAt: { gte: dedupSince },
          },
          orderBy: { startedAt: "desc" },
          select: { id: true, status: true },
        });
        if (recentDone) {
          throw new ConflictException({
            message: `请稍后再试（${dedupSeconds}s 内不可重复触发）`,
            runId: recentDone.id,
            status: recentDone.status,
          });
        }
      }
      return tx.radarRun.create({
        data: {
          topicId,
          userId: topic.userId,
          trigger,
          status: "running",
          startedAt: new Date(),
        },
      });
    });
  }

  private async completeRun(
    runId: string,
    status: RadarRunStatus,
    summary: {
      itemsFetched: number;
      itemsDeduped: number;
      itemsInserted: number;
      sourcesAttempted: number;
      sourcesFailed: number;
      errors: Array<{ sourceId: string; error: string }>;
      duration: number;
      topLevelError?: string;
    },
  ): Promise<void> {
    await this.prisma.radarRun.update({
      where: { id: runId },
      data: {
        status,
        completedAt: new Date(),
        durationMs: summary.duration,
        metrics: {
          itemsFetched: summary.itemsFetched,
          itemsDeduped: summary.itemsDeduped,
          itemsInserted: summary.itemsInserted,
          sourcesAttempted: summary.sourcesAttempted,
          sourcesFailed: summary.sourcesFailed,
          sourceErrors: summary.errors,
        } as Prisma.InputJsonValue,
        error: summary.topLevelError ?? null,
      },
    });
  }

  private async loadEligibleSources(topicId: string): Promise<RadarSource[]> {
    const now = new Date();
    return this.prisma.radarSource.findMany({
      where: {
        topicId,
        enabled: true,
        OR: [{ cooldownUntil: null }, { cooldownUntil: { lte: now } }],
        NOT: { health: RadarSourceHealth.FAILING },
      },
    });
  }

  private async computeSince(topicId: string): Promise<Date> {
    const topic = await this.prisma.radarTopic.findUnique({
      where: { id: topicId },
      select: { lastRunAt: true, createdAt: true },
    });
    if (!topic) return new Date(0);
    // 有 5 分钟 overlap 防漏，首次跑则用 createdAt - 24h
    if (topic.lastRunAt) {
      return new Date(topic.lastRunAt.getTime() - 5 * 60 * 1000);
    }
    return new Date(topic.createdAt.getTime() - 24 * 60 * 60 * 1000);
  }

  private async insertItems(
    topicId: string,
    sourceId: string,
    items: RawCollectedItem[],
  ): Promise<{ inserted: number; deduped: number; ids: string[] }> {
    if (items.length === 0) return { inserted: 0, deduped: 0, ids: [] };
    // 拉取已存在的 externalId（topicId scoped）做集合 dedup
    const existing = await this.prisma.radarItem.findMany({
      where: {
        topicId,
        externalId: { in: items.map((i) => i.externalId) },
      },
      select: { externalId: true },
    });
    const seen = new Set(existing.map((e) => e.externalId));
    const toInsert = items.filter((i) => !seen.has(i.externalId));
    if (toInsert.length === 0) {
      return { inserted: 0, deduped: items.length, ids: [] };
    }
    // 用 transaction + 逐条 create 拿 id（createMany 不返 id）。
    // R6 整改：改用 await 拿数组而非 .then 内 push，避免异常时 insertedIds
    // 静默为空（reviewer 标记 P0）。
    const rows = await this.prisma.$transaction(
      toInsert.map((i) =>
        this.prisma.radarItem.create({
          data: {
            topicId,
            sourceId,
            externalId: i.externalId,
            contentHash: i.contentHash,
            title: i.title,
            content: i.content,
            author: i.author,
            authorAvatar: i.authorAvatar,
            url: i.url,
            publishedAt: i.publishedAt,
            raw: i.raw as Prisma.InputJsonValue,
            metrics:
              i.metrics === null
                ? Prisma.JsonNull
                : (i.metrics as Prisma.InputJsonValue),
            accepted: false,
          },
          select: { id: true },
        }),
      ),
    );
    const insertedIds = rows.map((r) => r.id);
    return {
      inserted: insertedIds.length,
      deduped: items.length - toInsert.length,
      ids: insertedIds,
    };
  }
}
