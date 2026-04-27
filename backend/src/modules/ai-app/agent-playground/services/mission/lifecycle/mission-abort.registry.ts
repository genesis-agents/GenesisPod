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

@Injectable()
export class MissionAbortRegistry {
  private readonly log = new Logger(MissionAbortRegistry.name);
  private readonly map = new Map<string, AbortController>();

  register(missionId: string): AbortController {
    const c = new AbortController();
    this.map.set(missionId, c);
    return c;
  }

  abort(missionId: string, reason?: string): boolean {
    const c = this.map.get(missionId);
    if (!c) return false;
    try {
      c.abort(reason ?? "user_cancelled");
      this.log.log(`[abort] mission=${missionId} reason=${reason ?? "user"}`);
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
