/**
 * RadarRefreshScheduler（彻底重构后）
 *
 * 每分钟 sweep ACTIVE 且 nextDueAt <= now 的 topic，fire-and-forget 调
 * RadarPipelineDispatcher.runRefreshMission（不再调自写 RadarCollectService）。
 *
 * 守门：
 *   - 同 topic 已有 status='running' 的 mission → 跳过
 *   - 单 user 同时 running >= 3 → 跳过该 user 后续 topic
 *   - 全局 running >= 20 → 整轮跳过（防 LLM 暴账）
 *   - 单轮处理 ≤ sweepBatchSize 个 topic
 */
import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { RadarTopicStatus } from "@prisma/client";
import { PrismaService } from "../../../../../common/prisma/prisma.service";
import { RADAR_SCHEDULER_DEFAULTS } from "../../radar.constants";
import { RadarPipelineDispatcher } from "../mission/workflow/radar-pipeline-dispatcher.service";

@Injectable()
export class RadarRefreshScheduler {
  private readonly log = new Logger(RadarRefreshScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatcher: RadarPipelineDispatcher,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, {
    name: "radar-refresh-sweep",
    disabled: process.env.RADAR_SCHEDULER_DISABLED === "1",
  })
  async sweep(): Promise<void> {
    const now = new Date();
    const globalRunning = await this.prisma.radarRun.count({
      where: { status: "running" },
    });
    if (globalRunning >= RADAR_SCHEDULER_DEFAULTS.globalConcurrencyLimit) {
      this.log.warn(
        `Global running=${globalRunning} >= limit ${RADAR_SCHEDULER_DEFAULTS.globalConcurrencyLimit}, skipping sweep`,
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
      // 同 topic dedup（runMission 内部 createAtomic 还会兜底）
      const inflight = await this.prisma.radarRun.findFirst({
        where: { topicId: topic.id, status: "running" },
        select: { id: true },
      });
      if (inflight) continue;

      let userActive = userRunningCache.get(topic.userId);
      if (userActive === undefined) {
        userActive = await this.prisma.radarRun.count({
          where: { topic: { userId: topic.userId }, status: "running" },
        });
      }
      if (userActive >= RADAR_SCHEDULER_DEFAULTS.perUserConcurrencyLimit) {
        userRunningCache.set(topic.userId, userActive);
        continue;
      }
      userRunningCache.set(topic.userId, userActive + 1);

      void this.fireRefresh(topic.id, topic.userId, topic);
    }
  }

  private async fireRefresh(
    topicId: string,
    userId: string,
    topic: {
      name: string;
      description: string | null;
      entityType: string | null;
      refreshCron: string;
      keywords: unknown;
    },
  ): Promise<void> {
    try {
      const summary = await this.dispatcher.runRefreshMission(
        {
          topicId,
          trigger: "SCHEDULED",
          topicName: topic.name,
          keywords: parseKeywords(topic.keywords),
          description: topic.description,
          entityType: topic.entityType,
          refreshCron: topic.refreshCron,
        },
        userId,
      );
      this.log.log(
        `Scheduled mission topic=${topicId} run=${summary.missionId} status=${summary.status}`,
      );
    } catch (err) {
      this.log.error(
        `Scheduled refresh topic=${topicId} failed: ${(err as Error).message}`,
      );
    }
  }
}

function parseKeywords(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}
