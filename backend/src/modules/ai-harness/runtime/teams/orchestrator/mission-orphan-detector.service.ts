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
 * - 不依赖 MissionStore（agent-playground 内部）—— OrphanDetector 是 harness 层通用
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
import { MissionRuntimeStateStore } from "./mission-runtime-state.store";

/**
 * Orphan 检测回调 —— 由 ai-app（agent-playground）注入实际的 DB / event 操作
 */
export interface OrphanDetectorCallbacks {
  /** 拉取所有当前 running 的 missionId（不含 cancelled / completed / failed） */
  fetchRunningMissions: () => Promise<{ id: string; userId: string }[]>;
  /** 标记 orphan 为 failed，并 emit 用户可见事件 */
  markOrphanFailed: (
    missionId: string,
    userId: string,
    reason: string,
  ) => Promise<void>;
}

const SCAN_INTERVAL_MS = 60_000; // 1 min — 比 HealthScheduler 5min 更快感知
const STARTUP_DELAY_MS = 30_000; // 启动 30s 后首扫，给 mission 资源稳定时间
// heartbeat TTL 是 90s；这里宽容一点，给 redis 抖动 + clock skew 留缓冲
const ORPHAN_GRACE_MS = 120_000;

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
    if (!this.runtimeStore) {
      this.logger.warn(
        "MissionRuntimeStateStore not available — orphan detector disabled (single-instance mode)",
      );
      return;
    }
    setTimeout(() => {
      void this.scan();
      this.timer = setInterval(() => {
        void this.scan();
      }, SCAN_INTERVAL_MS);
      if (typeof this.timer.unref === "function") this.timer.unref();
    }, STARTUP_DELAY_MS);
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
    let running: { id: string; userId: string }[] = [];
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
      const beat = await this.runtimeStore.getHeartbeat(m.id).catch(() => null);
      if (!beat) {
        // 没有心跳记录：可能是
        //   (a) Redis 重启丢失（极少）
        //   (b) heartbeat TTL 90s 已过期（默认场景）
        //   (c) mission 在 store 落地之前 pod 崩溃
        // 三种情况都视为 orphan
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
      "Mission 进程在执行过程中被回收（pod 心跳丢失 > 2min，可能由部署或资源回收触发）。" +
      "运行时状态已保存到 Redis，可从顶部「重新运行」按钮重启 —— 后续版本将支持自动断点续跑。";
    await this.callbacks.markOrphanFailed(missionId, userId, reason);
    // 清掉 store 残留 key（避免重复扫描）
    if (this.runtimeStore) {
      await this.runtimeStore.clearAll(missionId).catch(() => undefined);
    }
  }
}
