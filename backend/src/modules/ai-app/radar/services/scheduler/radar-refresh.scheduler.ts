import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import {
  RadarRunStatus,
  RadarRunTrigger,
  RadarTopicStatus,
} from "@prisma/client";
import { PrismaService } from "../../../../../common/prisma/prisma.service";
import { RADAR_SCHEDULER_DEFAULTS } from "../../radar.constants";
import { RadarCollectService } from "../collect/radar-collect.service";

/**
 * RadarRefreshScheduler
 *
 * 每分钟 sweep ACTIVE 且 nextDueAt <= now 的 topic，fire-and-forget 触发 collect.runRefresh。
 *
 * 守门：
 *   - 同 topic 已有 RUNNING/PENDING run → 跳过
 *   - 单 user 同时 RUNNING >= 3 → 跳过该 user 后续 topic（等下一轮）
 *   - 全局 RUNNING >= 20 → 整轮跳过（防 LLM 暴账）
 *   - 单轮处理 ≤ sweepBatchSize 个 topic
 *
 * 触发为 fire-and-forget：scheduler 立即返回，runRefresh 在后台 promise 里跑。
 * 单 topic 失败不影响其他。
 */
@Injectable()
export class RadarRefreshScheduler {
  private readonly log = new Logger(RadarRefreshScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly collect: RadarCollectService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, {
    name: "radar-refresh-sweep",
    disabled: process.env.RADAR_SCHEDULER_DISABLED === "1",
  })
  async sweep(): Promise<void> {
    const now = new Date();
    const globalRunning = await this.prisma.radarRun.count({
      where: { status: RadarRunStatus.RUNNING },
    });
    if (globalRunning >= RADAR_SCHEDULER_DEFAULTS.globalConcurrencyLimit) {
      this.log.warn(
        `Global RUNNING=${globalRunning} >= limit ${RADAR_SCHEDULER_DEFAULTS.globalConcurrencyLimit}, skipping sweep`,
      );
      return;
    }

    const due = await this.prisma.radarTopic.findMany({
      where: {
        status: RadarTopicStatus.ACTIVE,
        OR: [{ nextDueAt: { lte: now } }, { nextDueAt: null }],
      },
      orderBy: { nextDueAt: { sort: "asc", nulls: "first" } },
      take: RADAR_SCHEDULER_DEFAULTS.sweepBatchSize,
    });
    if (due.length === 0) return;

    this.log.debug(
      `Sweep tick now=${now.toISOString()} due=${due.length} globalRunning=${globalRunning}`,
    );

    const userRunningCache = new Map<string, number>();
    for (const topic of due) {
      // 同 topic dedup
      const inflight = await this.prisma.radarRun.findFirst({
        where: {
          topicId: topic.id,
          status: { in: [RadarRunStatus.PENDING, RadarRunStatus.RUNNING] },
        },
        select: { id: true },
      });
      if (inflight) continue;

      // 单 user 并发限制
      let userActive = userRunningCache.get(topic.userId);
      if (userActive === undefined) {
        userActive = await this.prisma.radarRun.count({
          where: {
            topic: { userId: topic.userId },
            status: RadarRunStatus.RUNNING,
          },
        });
      }
      if (userActive >= RADAR_SCHEDULER_DEFAULTS.perUserConcurrencyLimit) {
        userRunningCache.set(topic.userId, userActive);
        continue;
      }
      userRunningCache.set(topic.userId, userActive + 1);

      // fire-and-forget
      void this.fireRefresh(topic.id, topic.userId);
    }
  }

  private async fireRefresh(topicId: string, userId: string): Promise<void> {
    try {
      const summary = await this.collect.runRefresh(
        topicId,
        RadarRunTrigger.SCHEDULED,
        { userId },
      );
      this.log.log(
        `Scheduled refresh topic=${topicId} run=${summary.runId} status=${summary.status} inserted=${summary.itemsInserted}/${summary.itemsFetched}`,
      );
    } catch (err) {
      this.log.error(
        `Scheduled refresh topic=${topicId} failed: ${(err as Error).message}`,
      );
    }
  }
}
