/**
 * MissionHealthScheduler — playground 健康巡检 scheduler
 *
 * Phase 6 (2026-04-29) 接入 ai-harness 沉淀的 MissionHealthMonitor：
 *   - 启动时立即扫一次（recoverOrphanedRunning 同等效果）
 *   - 每 5 分钟扫一次"running 但活动停滞"的 mission
 *   - 检测到不健康 → 调 markFailed + emit mission:failed 事件
 *
 * 与 mission-store.recoverOrphanedRunning 的区别：
 *   - recoverOrphanedRunning 是粗粒度（startedAt > 30 min），适合启动一次性恢复
 *   - 本 scheduler 用 lastActivityAt 做精细判断，避免误杀长任务
 */

import {
  Injectable,
  Logger,
  type OnModuleInit,
  type OnModuleDestroy,
} from "@nestjs/common";
import {
  DomainEventBus,
  MissionHealthMonitor,
  type MissionHealthSnapshot,
  type HealthVerdict,
} from "@/modules/ai-harness/facade";
import { PrismaService } from "../../../../../../common/prisma/prisma.service";
import { MissionStore } from "./mission-store.service";

const SCAN_INTERVAL_MS = 5 * 60 * 1000; // 5 min
const STARTUP_DELAY_MS = 30 * 1000; // 30s 给系统先启动稳定再扫

@Injectable()
export class MissionHealthScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(MissionHealthScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private monitor: MissionHealthMonitor;

  constructor(
    private readonly prisma: PrismaService,
    private readonly store: MissionStore,
    private readonly eventBus: DomainEventBus,
  ) {
    this.monitor = new MissionHealthMonitor({
      fetchRunningMissions: () => this.fetchRunningMissions(),
      onTimeout: (v) => this.handleTimeout(v),
      config: {
        // mission 启动后 30 min 无活动算 stale（与 recoverOrphanedRunning 默认对齐）
        staleThresholdMs: 30 * 60 * 1000,
        // 整体 wall-time 上限 4 小时（远超正常 mission 最长档位）
        maxWallTimeMs: 4 * 60 * 60 * 1000,
        includeStatuses: ["running"],
      },
    });
  }

  onModuleInit(): void {
    // 启动 30s 后跑首次（避免与 recoverOrphanedRunning 撞车 + 让系统稳定）
    setTimeout(() => {
      void this.runScan();
      // 之后每 5 min 扫一次
      this.timer = setInterval(() => {
        void this.runScan();
      }, SCAN_INTERVAL_MS);
      // unref 避免阻止 process exit
      this.timer.unref?.();
    }, STARTUP_DELAY_MS);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** dev/测试入口 */
  async forceRun(): Promise<void> {
    await this.runScan();
  }

  private async runScan(): Promise<void> {
    try {
      const result = await this.monitor.runOnce();
      if (result.unhealthyCount > 0) {
        this.log.warn(
          `[health] checked=${result.totalChecked} unhealthy=${result.unhealthyCount}`,
        );
      } else {
        this.log.debug(`[health] checked=${result.totalChecked}, all healthy`);
      }
    } catch (err) {
      this.log.error(
        `[health] scan failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async fetchRunningMissions(): Promise<MissionHealthSnapshot[]> {
    const rows = await this.prisma.agentPlaygroundMission
      .findMany({
        where: { status: "running" },
        select: {
          id: true,
          userId: true,
          status: true,
          startedAt: true,
        },
        take: 200,
      })
      .catch((err: unknown) => {
        this.log.warn(
          `[health] fetchRunningMissions failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        return [] as {
          id: string;
          userId: string;
          status: string;
          startedAt: Date;
        }[];
      });

    if (rows.length === 0) return [];

    // lastActivityAt: 用最近一条 mission event 的 ts；无 event 则 fallback startedAt
    const ids = rows.map((r) => r.id);
    const lastActivities = await this.prisma.agentPlaygroundMissionEvent
      .groupBy({
        by: ["missionId"],
        where: { missionId: { in: ids } },
        _max: { ts: true },
      })
      .catch(() => [] as { missionId: string; _max: { ts: bigint | null } }[]);

    const activityMap = new Map<string, Date>();
    for (const a of lastActivities) {
      const ts = a._max.ts;
      if (ts != null) {
        activityMap.set(a.missionId, new Date(Number(ts)));
      }
    }

    return rows.map((r) => ({
      missionId: r.id,
      userId: r.userId,
      status: r.status,
      startedAt: r.startedAt,
      lastActivityAt: activityMap.get(r.id),
    }));
  }

  private async handleTimeout(verdict: HealthVerdict): Promise<void> {
    this.log.warn(
      `[health] mission ${verdict.missionId} unhealthy: reason=${verdict.reason} ageMs=${verdict.ageMs} inactiveMs=${verdict.inactiveMs}`,
    );
    const errorMessage =
      verdict.reason === "wall-time-exceeded"
        ? `Mission exceeded max wall time (${Math.round(verdict.ageMs / 60_000)} min)`
        : `Mission stale - no activity for ${Math.round(verdict.inactiveMs / 60_000)} min`;
    await this.store.markFailed(verdict.missionId, {
      errorMessage,
      wallTimeMs: verdict.ageMs,
    });
    // ★ P1-R5-F (2026-04-30): scheduler 之前只 markFailed 不 emit；前端只能 polling
    //   才看到状态变化。补 emit mission:failed，让 WS 实时通知。
    await this.eventBus
      .emit({
        type: "agent-playground.mission:failed",
        scope: {
          missionId: verdict.missionId,
          userId: verdict.snapshot.userId ?? "",
        },
        payload: {
          message: errorMessage,
          failureCode:
            verdict.reason === "wall-time-exceeded"
              ? "RUNNER_WALL_TIME_EXCEEDED"
              : "MISSION_STALE",
          wallTimeMs: verdict.ageMs,
          source: "health-scheduler",
        },
        timestamp: Date.now(),
      })
      .catch((err: unknown) => {
        this.log.warn(
          `[health] emit mission:failed for ${verdict.missionId} dropped: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }
}
