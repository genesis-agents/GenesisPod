/**
 * MissionLifecycleManager — Mission 生命周期统一接口（task #23）
 *
 * 背景：
 *   截止本 PR 前，cancel mission 散点 3 套接口：
 *     1. {app}.controller.cancelMission() — abortRegistry.abort
 *        + store.markCancelled + buffer.broadcast 三连
 *     2. dispatcher.handleMissionFailure() — 直接走 markFailed
 *     3. runtime-shell wallTimer — missionAbort.abort 走 abortRegistry
 *   每处接口不一样，新增 cancel 入口（如 admin 强 kill）每次重写三连。
 *
 * 机制性解决：
 *   提供 MissionLifecycleManager.cancel(missionId, reason)，包装：
 *     1. abort signal 触发（让 in-flight LLM 中断）
 *     2. DB 状态切 cancelled
 *     3. 事件 broadcast 给前端
 *   未来新增 cancel 入口（admin / scheduler / user）只调这一个方法。
 *
 * 注意：
 *   本 service 在 ai-harness/lifecycle 层（与 mission-checkpoint / abort-registry
 *   同级），不知 {app} 业务（不 import mission-store）。store 操作
 *   通过抽象接口注入，让 ai-app 层装配真实实现。
 */

import { Injectable, Logger } from "@nestjs/common";
import { MissionAbortRegistry } from "./abort-registry";

/**
 * Mission 状态变更接口（ai-app 层提供具体实现）
 */
export interface MissionLifecycleStore {
  markCancelled(missionId: string): Promise<void>;
}

/**
 * Mission 事件广播接口（ai-app 层提供具体实现）
 */
export interface MissionLifecycleBroadcaster {
  broadcastCancelled(args: {
    missionId: string;
    userId: string;
    reason: string;
    message?: string;
  }): Promise<void>;
}

@Injectable()
export class MissionLifecycleManager {
  private readonly log = new Logger(MissionLifecycleManager.name);

  constructor(private readonly abortRegistry: MissionAbortRegistry) {}

  /**
   * 取消 mission（统一三连：abort → mark cancelled → broadcast）。
   *
   * 入参 store / broadcaster 由 caller 注入（避免本 service 持有 ai-app 依赖）。
   * 调用方典型：controller.cancelMission / admin force kill / scheduler timeout。
   */
  async cancel(args: {
    missionId: string;
    userId: string;
    reason: string;
    message?: string;
    store: MissionLifecycleStore;
    broadcaster: MissionLifecycleBroadcaster;
  }): Promise<{ ok: true; status: "cancelled" }> {
    const { missionId, userId, reason, message, store, broadcaster } = args;
    // 1. abort signal — 让 in-flight LLM / tool call 立即中断
    this.abortRegistry.abort(missionId, reason);

    // 2. DB 状态切 cancelled
    await store.markCancelled(missionId);

    // 3. 事件广播给前端（吞掉 broadcaster 异常，不影响主流程）
    try {
      await broadcaster.broadcastCancelled({
        missionId,
        userId,
        reason,
        message,
      });
    } catch (err) {
      this.log.warn(
        `[cancel ${missionId}] broadcast failed (non-fatal): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    return { ok: true, status: "cancelled" as const };
  }
}
