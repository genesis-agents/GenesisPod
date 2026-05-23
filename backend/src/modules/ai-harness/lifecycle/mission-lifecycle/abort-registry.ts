/**
 * MissionAbortRegistry —— 管理 mission 级 AbortController
 *
 * 上游：mission-pipeline-baseline.md §9.4 / Q11 (取消支持)
 *
 * 用法：
 *   - mission 启动时 register(missionId, controller)
 *   - cancelMission HTTP endpoint 调 abort(missionId)
 *   - mission 结束（成功/失败/取消）调 unregister(missionId)
 *   - orchestrator 把 controller.signal 透传给 AgentRunner.run({ signal })
 */

import { Injectable, Logger } from "@nestjs/common";

/**
 * ★ C1 / G2（2026-05-22）：mission abort 原因 canonical enum（single source of truth）。
 * 取代此前 `abort(id, reason?: string)` 的裸字符串——传字符串现在 tsc 即红（L1 类型主防线）。
 * string enum，值 === 既有字符串字面量 → 零行为变化，仅加类型约束。
 * AbortReason 是 MissionFailureCode 的真子集（C2 映射恒等 + source=runtime）。
 */
export enum MissionAbortReason {
  user_cancelled = "user_cancelled",
  budget_exhausted = "budget_exhausted",
  mission_wall_time_exceeded = "mission_wall_time_exceeded",
  mission_row_missing = "mission_row_missing",
  rerun_replacing_stale = "rerun_replacing_stale",
  superseded = "superseded",
  orchestrator_shutdown = "orchestrator_shutdown",
}

@Injectable()
export class MissionAbortRegistry {
  private readonly log = new Logger(MissionAbortRegistry.name);
  private readonly map = new Map<string, AbortController>();

  register(missionId: string): AbortController {
    const c = new AbortController();
    this.map.set(missionId, c);
    return c;
  }

  abort(missionId: string, reason: MissionAbortReason): boolean {
    const c = this.map.get(missionId);
    if (!c) return false;
    // ★ P2-2 (2026-04-29): abort 是幂等的，二次调用 signal 已 aborted；跳过重复日志
    if (c.signal.aborted) return false;
    try {
      c.abort(reason);
      this.log.log(`[abort] mission=${missionId} reason=${reason}`);
      return true;
    } catch (err) {
      this.log.warn(
        `[abort] mission=${missionId} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }

  unregister(missionId: string): void {
    this.map.delete(missionId);
  }

  getSignal(missionId: string): AbortSignal | undefined {
    return this.map.get(missionId)?.signal;
  }

  /** Phase P16-1: trace + monitoring */
  isAborted(missionId: string): boolean {
    return this.map.get(missionId)?.signal?.aborted ?? false;
  }

  size(): number {
    return this.map.size;
  }

  /** dev-only：列出当前活跃的 mission（debug） */
  listActive(): string[] {
    return Array.from(this.map.keys());
  }
}
