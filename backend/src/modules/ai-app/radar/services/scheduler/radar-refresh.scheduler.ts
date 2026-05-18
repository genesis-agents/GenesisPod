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
 *
 * PR-DR2-3 扩展（B7+B8+B9+B11+B18）：
 *   - sweepDailyBriefing：每分钟扫 ACTIVE topic，按用户时区判断 briefingTime，入队 daily job
 *   - sweepWeeklyBriefing：周日 18:00 UTC 扫 ACTIVE topic，直接生成周报 + dispatch
 *   - onTier3Signal：监听 radar.briefing.signal.created，tier=3 立即推送
 *   - sweepBriefingsCleanup：每日 02:00 UTC 清理 90 天前的 daily briefings
 */
import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { OnEvent } from "@nestjs/event-emitter";
import { RadarTopicStatus } from "@prisma/client";
import { PrismaService } from "@/common/prisma/prisma.service";
import { RADAR_SCHEDULER_DEFAULTS } from "../../radar.constants";
import { RadarPipelineDispatcher } from "../mission/workflow/radar-pipeline-dispatcher.service";
import { RadarBriefingQueueService } from "./radar-briefing-queue.service";
import { RadarDailyBriefingRepo } from "../briefing/radar-daily-briefing.repo";
import { RadarWeeklyBriefingService } from "../briefing/radar-weekly-briefing.service";
import { NotificationDispatcher } from "@/modules/ai-infra/notifications/dispatcher/notification-dispatcher.service";
import { NotificationPreferenceService } from "@/modules/ai-infra/notifications/dispatcher/preferences/notification-preference.service";
import {
  RADAR_BRIEFING_SIGNAL_CREATED_EVENT,
  type RadarBriefingSignalCreatedEvent,
} from "../mission/stages/s9-daily-top-n.stage";
import { CacheService } from "@/common/cache/cache.service";

@Injectable()
export class RadarRefreshScheduler {
  private readonly log = new Logger(RadarRefreshScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatcher: RadarPipelineDispatcher,
    private readonly briefingQueue: RadarBriefingQueueService,
    private readonly dailyRepo: RadarDailyBriefingRepo,
    private readonly weeklyService: RadarWeeklyBriefingService,
    private readonly notificationDispatcher: NotificationDispatcher,
    private readonly preferenceService: NotificationPreferenceService,
    private readonly cache: CacheService,
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

  /**
   * B7 — 每分钟扫描 ACTIVE topic，按用户本地时区判断 briefingTime 是否到达，入队 daily job。
   *
   * 流程：
   * 1. 查所有 ACTIVE topic（含 user.timezone）
   * 2. 用用户时区（topic.briefingTimezone ?? user.timezone ?? 'UTC'）判断当前本地时间是否匹配 briefingTime
   * 3. 跳过本日已生成的 topic（唯一约束查询）
   * 4. 跳过 weekendSkip=true 且今日是周六/周日的 topic
   * 5. 入队（K3 限流：全局 <=20 并发 + 用户 <=10/天；超额 silently drop）
   */
  @Cron(CronExpression.EVERY_MINUTE, {
    name: "radar-daily-briefing-sweep",
    disabled: process.env.RADAR_SCHEDULER_DISABLED === "1",
  })
  async sweepDailyBriefing(): Promise<void> {
    const now = new Date();

    const topics = await this.prisma.radarTopic.findMany({
      where: { status: RadarTopicStatus.ACTIVE },
      select: {
        id: true,
        userId: true,
        briefingTime: true,
        briefingTimezone: true,
        weekendSkip: true,
        user: { select: { timezone: true } },
      },
    });
    if (topics.length === 0) return;

    for (const topic of topics) {
      try {
        const tz = topic.briefingTimezone ?? topic.user?.timezone ?? "UTC";
        const localHHMM = getLocalHHMM(now, tz);
        if (localHHMM !== topic.briefingTime) continue;

        // 跳过周末
        if (topic.weekendSkip) {
          const dayOfWeek = getLocalDayOfWeek(now, tz); // 0=Sun, 6=Sat
          if (dayOfWeek === 0 || dayOfWeek === 6) continue;
        }

        // 跳过今日已生成的
        const briefingDate = getLocalDateMidnight(now, tz);
        const existing = await this.dailyRepo.findByTopicAndDate(
          topic.id,
          briefingDate,
        );
        if (existing) continue;

        const briefingDateStr = briefingDate.toISOString().slice(0, 10);
        const result = await this.briefingQueue.enqueue(topic.userId, {
          type: "daily",
          topicId: topic.id,
          briefingDate: briefingDateStr,
        });

        if (!result.enqueued) {
          this.log.warn(
            `sweepDailyBriefing rate-limited: topic=${topic.id} user=${topic.userId} reason=${result.reason}`,
          );
        } else {
          this.log.debug(
            `sweepDailyBriefing enqueued: topic=${topic.id} jobId=${result.jobId} date=${briefingDateStr}`,
          );
        }
        // TODO: RADAR_DAILY dispatch — 在 daily worker 完成后调用（后续 PR 接入）
      } catch (err) {
        this.log.error(
          `sweepDailyBriefing topic=${topic.id} error: ${(err as Error).message}`,
        );
      }
    }
  }

  /**
   * B8 — 周日 18:00 UTC 扫描 ACTIVE topic，直接生成周报 + dispatch RADAR_WEEKLY。
   *
   * 流程：
   * 1. 查所有 ACTIVE topic（含 user.timezone）
   * 2. 按用户时区判断本地是否为周日（简化：UTC 周日 18:00 覆盖全球绝大多数时区当地周末）
   * 3. 跳过本周已生成 weekly briefing 的 topic
   * 4. 直接调 weeklyService.generateAndPersist（无 LLM，省成本）
   * 5. 生成完后 dispatch RADAR_WEEKLY（B11 同步路径）
   */
  @Cron("0 18 * * SUN", {
    timeZone: "UTC",
    name: "radar-weekly-briefing-sweep",
  })
  async sweepWeeklyBriefing(): Promise<void> {
    const now = new Date();
    // 本周 Monday 00:00 UTC ~ Sunday 23:59:59 UTC
    const { weekStart, weekEnd } = getWeekBounds(now);

    const topics = await this.prisma.radarTopic.findMany({
      where: { status: RadarTopicStatus.ACTIVE },
      select: {
        id: true,
        userId: true,
        briefingTimezone: true,
        user: { select: { timezone: true } },
      },
    });
    if (topics.length === 0) return;

    for (const topic of topics) {
      try {
        // 跳过本周已生成
        const existing = await this.weeklyService.findInRange(
          topic.id,
          weekStart,
          weekEnd,
        );
        if (existing.length > 0) continue;

        const weekly = await this.weeklyService.generateAndPersist({
          topicId: topic.id,
          userId: topic.userId,
          weekStart,
          weekEnd,
        });

        // B11 — dispatch RADAR_WEEKLY（同步路径；weekly 无 signals 时跳过避免 spam）
        const payload = weekly.payload as {
          topSignals?: unknown[];
          tier3Count?: number;
        };
        if (!payload.topSignals?.length && !payload.tier3Count) {
          this.log.debug(
            `sweepWeeklyBriefing skip dispatch — no signals: topic=${topic.id}`,
          );
          continue;
        }

        void this.notificationDispatcher
          .dispatch(topic.userId, {
            type: "RADAR_WEEKLY",
            title: "本周精选摘要已就绪",
            message: `本周共有 ${payload.tier3Count ?? 0} 条 ⭐⭐⭐ 重要信号`,
            link: `/ai-radar/topic/${topic.id}?view=weekly`,
            metadata: { topicId: topic.id, weekStart: weekStart.toISOString() },
          })
          .catch((err: Error) =>
            this.log.warn(
              `RADAR_WEEKLY dispatch failed topic=${topic.id}: ${err.message}`,
            ),
          );

        this.log.log(
          `sweepWeeklyBriefing done: topic=${topic.id} weekStart=${weekStart.toISOString()}`,
        );
      } catch (err) {
        this.log.error(
          `sweepWeeklyBriefing topic=${topic.id} error: ${(err as Error).message}`,
        );
      }
    }
  }

  /**
   * B9 — 监听 radar.briefing.signal.created，tier=3 信号立即推送。
   *
   * 守门：
   * 1. tier !== 3 → silently return
   * 2. instantPushForTier3 主开关（channelSubscriptions[RADAR_TIER3_INSTANT]）→ 关则 return
   * 3. quietHours 静默时段 → return
   * 4. Redis INCR 频率闸 key=radar:tier3:{topicId}:{YYYY-MM-DD-UTC}，≤3/天；超额 drop + warn
   * 5. dispatch RADAR_TIER3_INSTANT（excludeChannels: ['email']，避 spam）
   */
  @OnEvent(RADAR_BRIEFING_SIGNAL_CREATED_EVENT)
  async onTier3Signal(payload: RadarBriefingSignalCreatedEvent): Promise<void> {
    if (payload.signal.tier !== 3) return;

    const { userId, topicId, signal } = payload;

    // instantPushForTier3 主开关（pref 读失败 → 走默认通知路径，不 block）
    const pref = await this.preferenceService.get(userId);
    if (pref) {
      const subs = (pref.channelSubscriptions ?? {}) as Record<
        string,
        Record<string, boolean>
      >;
      const tier3Pref = subs["RADAR_TIER3_INSTANT"];
      // 显式关闭 site channel = 主开关关
      if (
        tier3Pref &&
        typeof tier3Pref === "object" &&
        tier3Pref["site"] === false
      ) {
        return;
      }
    }

    // quietHours 检查
    const inQuiet = await this.preferenceService.isInQuietHours(userId);
    if (inQuiet) {
      this.log.debug(
        `onTier3Signal quietHours skip: user=${userId} signal=${signal.id}`,
      );
      return;
    }

    // Redis INCR 频率闸：每 topic 每天 ≤3 条
    const today = new Date().toISOString().slice(0, 10);
    const rateLimitKey = `radar:tier3:${topicId}:${today}`;
    let count: number;
    try {
      count = await this.cache.incrby(rateLimitKey, 1);
      if (count === 1) await this.cache.expire(rateLimitKey, 86400);
    } catch (err) {
      // fail-open: Redis 故障不阻塞推送
      this.log.warn(
        `onTier3Signal incrby failed (fail-open): ${(err as Error).message}`,
      );
      count = 1;
    }

    if (count > 3) {
      this.log.warn(
        `onTier3Signal rate-limited: topic=${topicId} count=${count} signal=${signal.id}`,
      );
      return;
    }

    // dispatch — tier3 不发 email 避 spam（产品决策）
    void this.notificationDispatcher
      .dispatch(
        userId,
        {
          type: "RADAR_TIER3_INSTANT",
          title: `[⭐⭐⭐] ${signal.title}`,
          message: signal.oneLineTakeaway,
          link: `/ai-radar/topic/${topicId}?signal=${signal.id}`,
          metadata: {
            signalId: signal.id,
            tier: 3,
            narrativeId: signal.narrativeId,
          },
          priority: "high",
        },
        { excludeChannels: ["email"] },
      )
      .catch((err: Error) =>
        this.log.warn(
          `RADAR_TIER3_INSTANT dispatch failed user=${userId} signal=${signal.id}: ${err.message}`,
        ),
      );
  }

  /**
   * B18 — 每日 02:00 UTC 清理超过 90 天的 daily briefings（决策 D1）。
   */
  @Cron("0 2 * * *", { name: "radar-briefings-cleanup" })
  async sweepBriefingsCleanup(): Promise<void> {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - 90);
    cutoff.setUTCHours(0, 0, 0, 0);
    try {
      const deleted = await this.dailyRepo.deleteOlderThan(cutoff);
      if (deleted > 0) {
        this.log.log(
          `Daily briefing cleanup: deleted ${deleted} rows older than ${cutoff.toISOString()}`,
        );
      }
    } catch (err) {
      this.log.error(`sweepBriefingsCleanup failed: ${(err as Error).message}`);
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

/**
 * 返回 now 在指定 IANA 时区的本地 "HH:mm" 字符串。
 * 用 Intl.DateTimeFormat 获取时区感知的小时/分钟。
 * 如果时区无效，fallback 到 UTC。
 */
function getLocalHHMM(now: Date, tz: string): string {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = fmt.formatToParts(now);
    const h = parts.find((p) => p.type === "hour")?.value ?? "00";
    const m = parts.find((p) => p.type === "minute")?.value ?? "00";
    // Intl hour12:false 可能给 "24" 代表午夜，标准化为 "00"
    const hh = h === "24" ? "00" : h.padStart(2, "0");
    return `${hh}:${m.padStart(2, "0")}`;
  } catch {
    // 时区无效 fallback UTC
    const h = now.getUTCHours().toString().padStart(2, "0");
    const m = now.getUTCMinutes().toString().padStart(2, "0");
    return `${h}:${m}`;
  }
}

/**
 * 返回 now 在指定时区的星期几（0=Sun, 1=Mon, ..., 6=Sat）。
 */
function getLocalDayOfWeek(now: Date, tz: string): number {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
    });
    const dayStr = fmt.format(now);
    const map: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    return map[dayStr] ?? now.getDay();
  } catch {
    return now.getUTCDay();
  }
}

/**
 * 返回 now 在指定时区的本地日期对应的 UTC 午夜 Date（用于 DB @db.Date 字段比对）。
 */
function getLocalDateMidnight(now: Date, tz: string): Date {
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const ymd = fmt.format(now); // 'YYYY-MM-DD'
    return new Date(`${ymd}T00:00:00.000Z`);
  } catch {
    const ymd = now.toISOString().slice(0, 10);
    return new Date(`${ymd}T00:00:00.000Z`);
  }
}

/**
 * 返回当前周的 UTC 边界：Monday 00:00:00 ~ Sunday 23:59:59。
 */
function getWeekBounds(now: Date): { weekStart: Date; weekEnd: Date } {
  const day = now.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const daysToMonday = day === 0 ? 6 : day - 1;
  const weekStart = new Date(now);
  weekStart.setUTCDate(now.getUTCDate() - daysToMonday);
  weekStart.setUTCHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
  weekEnd.setUTCHours(23, 59, 59, 999);
  return { weekStart, weekEnd };
}
