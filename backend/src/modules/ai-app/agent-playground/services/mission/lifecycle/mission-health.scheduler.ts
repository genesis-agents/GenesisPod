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
// ★ P2-R5 (5) (2026-04-30): 30s 与 recoverOrphanedRunning 在 Railway 大表场景
//   下可能撞车（粗粒度全表 update）。扩到 60s 留足缓冲，避免双方同时争 row lock。
const STARTUP_DELAY_MS = 60 * 1000;

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
        // ★ 2026-04-30: 60 min 无活动才算 stale（之前 30min 误判正常 deep/thorough mission）
        //   mission 跑 60min 是常见档位（每个 dim 10-15min × 4-6 个 dim），活动事件是
        //   章节级别 emit 的，stage 切换间偶有 5-10min 沉默正常 → 需要 30min 缓冲。
        staleThresholdMs: 60 * 60 * 1000,
        // 整体 wall-time 上限 4 小时（远超正常 mission 最长档位）
        maxWallTimeMs: 4 * 60 * 60 * 1000,
        includeStatuses: ["running"],
      },
    });
  }

  onModuleInit(): void {
    // ★ 2026-05-01 (PR-G iter6): 临时禁用自动扫描
    //   mission 8d7aa245 跑 67min 持续 emit iteration:progress events，仍被
    //   scheduler 误判为 "no activity for 61 min"。lastActivityAt 计算逻辑
    //   有问题 —— 跟 orphan detector 同根因（heartbeat / event flush 不可靠）。
    //   在补完观测性之前，连同 orphan detector 一起禁用，让 missions 能跑完。
    //   forceRun() 测试入口保留。
    this.log.warn(
      "[health] auto scan DISABLED — false-positive 'no activity' kills missions. " +
        "Re-enable after fixing event flush observability.",
    );
    // 不起 timer
    void STARTUP_DELAY_MS;
    void SCAN_INTERVAL_MS;
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
    // ★ P2-R5 (2) (2026-04-30): take=200 上限 —— 当系统真有 200+ running mission
    //   时被截断 → 截掉的 mission 永远不被巡检。warn 提示运维（应该极少触发，
    //   但发生时静默扫漏会很危险）。
    const HEALTH_SCAN_LIMIT = 200;
    const rows = await this.prisma.agentPlaygroundMission
      .findMany({
        where: { status: "running" },
        select: {
          id: true,
          userId: true,
          status: true,
          startedAt: true,
        },
        take: HEALTH_SCAN_LIMIT,
        orderBy: { startedAt: "asc" }, // 最老的优先扫，避免新 mission 抢资源
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
    if (rows.length === HEALTH_SCAN_LIMIT) {
      this.log.warn(
        `[health] fetchRunningMissions hit take=${HEALTH_SCAN_LIMIT} cap — some running missions may not be scanned this cycle`,
      );
    }

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
        // ★ P2-R5 (1) (2026-04-30): bigint 极端值精度风险 — Number() 超过
        //   Number.MAX_SAFE_INTEGER (9007199254740991ms ≈ year 2255) 精度丢失。
        //   epoch ms 当下不会越界，但显式 clamp 让 bug 走特殊路径而非静默错位。
        const tsMs = Number(ts);
        if (!Number.isFinite(tsMs) || tsMs > Number.MAX_SAFE_INTEGER) {
          this.log.warn(
            `[health] mission ${a.missionId} ts=${String(ts)} exceeds MAX_SAFE_INTEGER, skipping`,
          );
          continue;
        }
        activityMap.set(a.missionId, new Date(tsMs));
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
