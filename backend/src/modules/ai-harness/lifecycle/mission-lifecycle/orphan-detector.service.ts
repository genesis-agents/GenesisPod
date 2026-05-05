/**
 * MissionOrphanDetectorService — 基于 runtime heartbeat 的快速 orphan 检测
 *
 * 与 MissionHealthScheduler 的区别：
 * - HealthScheduler 用"DB lastActivityAt"判断 stale，窗口 60min（保守，避免误杀）
 * - OrphanDetector 用"Redis heartbeat"判断 owner alive，窗口 90s（精准，快速）
 *
 * heartbeat 由 TeamsMissionOrchestrator 启动 mission 时 claimOrBeat，每 30s 续期；
 * pod 崩溃后 90s TTL 过期，本服务在下一次扫描中检测到并 markFailed。
 *
 * Phase 9 (2026-04-30): 第一阶段为 fail-fast（标 failed + 通知用户重新发起）。
 * 第二阶段（待独立 PR）会扩展为 resumeFromState —— 从 store snapshot 重启 generator。
 *
 * 故意保持解耦：
 * - 不依赖 MissionStore（<consumer> 内部）—— OrphanDetector 是 harness 层通用
 * - 调用方提供 fetchRunningMissions / markFailed callback（依赖反转）
 * - 默认 NoOp 实现（callback 未注入时只 log，不动 DB）—— harness 单独使用安全
 */

import {
  Injectable,
  Logger,
  Optional,
  type OnModuleInit,
  type OnModuleDestroy,
} from "@nestjs/common";
import { MissionRuntimeStateStore } from "./runtime-state-store";

/**
 * Orphan 检测回调 —— 由 ai-app（<consumer>）注入实际的 DB / event 操作
 */
export interface OrphanDetectorCallbacks {
  /** 拉取所有当前 running 的 missionId（不含 cancelled / completed / failed） */
  fetchRunningMissions: () => Promise<
    { id: string; userId: string; startedAt?: Date | null }[]
  >;
  /** 标记 orphan 为 failed，并 emit 用户可见事件 */
  markOrphanFailed: (
    missionId: string,
    userId: string,
    reason: string,
  ) => Promise<void>;
}

const SCAN_INTERVAL_MS = 60_000; // 1 min — 比 HealthScheduler 5min 更快感知
const STARTUP_DELAY_MS = 30_000; // 启动 30s 后首扫，给 mission 资源稳定时间
// ★ 2026-05-01 (PR-G heartbeat fix): 阈值放宽
//   原 ORPHAN_GRACE_MS = 120s 对 reasoning 模型单次 LLM call (232s/162s/156s)
//   太紧，触发系统性 false orphan 杀掉所有 deep / extended mission。
//   放宽到 360s = 6min，给单次 LLM call 留充足缓冲。
const ORPHAN_GRACE_MS = 360_000;
// ★ 2026-05-01 (PR-G heartbeat fix): mission 启动后的"初始恩典"窗口
//   如果 mission started_at < 5min，即使 heartbeat 缺失也不视为 orphan。
//   避免初始 claimOrBeat 写 Redis 失败（transient error）→ 后续 scan
//   立即标 orphan → 用户体验：mission 几十秒就死，毫无 ramp-up 时间。
//   只在 mission 跑过这个窗口后才严格按 heartbeat 判断。
const STARTUP_GRACE_FROM_MISSION_START_MS = 300_000; // 5 min

@Injectable()
export class MissionOrphanDetectorService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(MissionOrphanDetectorService.name);
  private timer: NodeJS.Timeout | null = null;
  private callbacks: OrphanDetectorCallbacks | null = null;

  constructor(
    @Optional() private readonly runtimeStore?: MissionRuntimeStateStore,
  ) {}

  /** 由 ai-app 模块在 onModuleInit 中注册 callbacks */
  registerCallbacks(callbacks: OrphanDetectorCallbacks): void {
    this.callbacks = callbacks;
    this.logger.log("Orphan detector callbacks registered");
  }

  onModuleInit(): void {
    // ★ 2026-05-01 (PR-G iter3): 临时禁用 orphan detector 自动扫描
    //   连续 7 个 mission 都在 78-399s 之间被误判 orphan 杀掉。
    //   heartbeat refresh setInterval 没有按预期工作（要么 cache.set 静默失败、
    //   要么 Redis 连接抖动导致 lookup 失败）。在补完 heartbeat 可观测性之前，
    //   先彻底禁用自动扫描，让 MissionHealthScheduler（DB lastActivityAt，60min）
    //   作为唯一的 orphan 检测路径。`forceScan()` 测试入口仍可用。
    this.logger.warn(
      "[orphan-detector] auto scan DISABLED — heartbeat refresh unreliable, " +
        "falling back to MissionHealthScheduler for stale detection. " +
        "Re-enable after adding heartbeat observability.",
    );
    if (!this.runtimeStore) {
      this.logger.warn(
        "MissionRuntimeStateStore not available — orphan detector disabled (single-instance mode)",
      );
      return;
    }
    // 不起 timer —— scan() 仅 forceScan() 调用时跑（测试用）
    void STARTUP_DELAY_MS;
    void SCAN_INTERVAL_MS;
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** 测试入口 */
  async forceScan(): Promise<{ checked: number; orphans: number }> {
    return this.scan();
  }

  private async scan(): Promise<{ checked: number; orphans: number }> {
    if (!this.runtimeStore || !this.callbacks) {
      return { checked: 0, orphans: 0 };
    }
    let running: { id: string; userId: string; startedAt?: Date | null }[] = [];
    try {
      running = await this.callbacks.fetchRunningMissions();
    } catch (err) {
      this.logger.warn(
        `[scan] fetchRunningMissions failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { checked: 0, orphans: 0 };
    }
    if (running.length === 0) return { checked: 0, orphans: 0 };

    const now = Date.now();
    const orphans: { id: string; userId: string }[] = [];
    for (const m of running) {
      // ★ 2026-05-01 (PR-G): mission 启动 < 5min 一律给恩典，无视 heartbeat
      //   这避免：初始 claimOrBeat 写 Redis 偶发失败 → 立即被标 orphan
      //   只在 mission 跑过 STARTUP_GRACE_FROM_MISSION_START_MS 后才严格判断
      const ageSinceStart = m.startedAt
        ? now - new Date(m.startedAt).getTime()
        : Number.POSITIVE_INFINITY; // 没 startedAt 信息时按 严格 走（保守）
      if (ageSinceStart < STARTUP_GRACE_FROM_MISSION_START_MS) {
        continue;
      }
      const beat = await this.runtimeStore.getHeartbeat(m.id).catch(() => null);
      if (!beat) {
        // 跑过 5min grace 后仍无心跳记录 → 三种 orphan 场景：
        //   (a) Redis 重启丢失（极少）
        //   (b) heartbeat TTL 90s 已过期（默认场景）
        //   (c) mission 在 store 落地之前 pod 崩溃
        orphans.push(m);
        continue;
      }
      const age = now - beat.lastBeatAt;
      if (age > ORPHAN_GRACE_MS) {
        orphans.push(m);
      }
    }

    if (orphans.length > 0) {
      this.logger.warn(
        `[scan] detected ${orphans.length}/${running.length} orphan missions (no heartbeat / heartbeat aged > ${ORPHAN_GRACE_MS}ms)`,
      );
      await Promise.all(
        orphans.map((m) =>
          this.handleOrphan(m.id, m.userId).catch((err) =>
            this.logger.warn(
              `[scan] handleOrphan(${m.id}) failed: ${err instanceof Error ? err.message : String(err)}`,
            ),
          ),
        ),
      );
    } else {
      this.logger.debug(
        `[scan] checked=${running.length}, all heartbeats fresh`,
      );
    }
    return { checked: running.length, orphans: orphans.length };
  }

  private async handleOrphan(missionId: string, userId: string): Promise<void> {
    if (!this.callbacks) return;
    const reason =
      "Mission 进程在执行过程中被回收（pod 心跳丢失 > 6min，可能由部署或资源回收触发）。" +
      "运行时状态已保存到 Redis，可从顶部「重新运行」按钮重启 —— 后续版本将支持自动断点续跑。";
    await this.callbacks.markOrphanFailed(missionId, userId, reason);
    // 清掉 store 残留 key（避免重复扫描）
    if (this.runtimeStore) {
      await this.runtimeStore.clearAll(missionId).catch(() => undefined);
    }
  }
}
