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
import { MissionAbortRegistry, MissionAbortReason } from "./abort-registry";

/**
 * ★ C0 / G1（2026-05-22）：最小平台 mission 状态值域（single source of truth）。
 * 不改既有 IMissionStore 的 status 字面量（保 'completed' 不改 'succeeded'，RM6）。
 * 平台 lifecycle 不掺业务语义（quality-failed 等是业务 outcome，留 app failureCode，G6）。
 */
export type MissionLifecycleStatus =
  | "starting"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

/** 终态子集（running→terminal 的目标态）。 */
export type MissionTerminalStatus = "completed" | "failed" | "cancelled";

/**
 * 终态意图——所有想把 mission 推到终态的来源（dispatcher / liveness / abort / controller）
 * 都提交这个意图给 MissionLifecycleManager.finalize，由它单点仲裁，而非各自直写 DB。
 * failureCode 暂为 string（C2 会升为 canonical enum）；extra 透传 app 的 metrics/tokens/cost。
 */
export interface MissionTerminalIntent {
  readonly status: MissionTerminalStatus;
  readonly reason?: MissionAbortReason;
  readonly failureCode?: string;
  readonly errorMessage?: string;
  readonly extra?: Readonly<Record<string, unknown>>;
}

/**
 * ★ C0 终态仲裁端口（ai-app 层提供实现，harness 不知 app 表结构）。
 * 实现**必须**用条件写 `UPDATE ... WHERE status='running'`（首写者赢，原子）：
 *   - 返回 true  = 本次写赢了（行此前仍 running，已切到 intent.status）
 *   - 返回 false = 本次写输了（行已被别的来源推到终态，本次 no-op，不得覆盖）
 * 这是 C0"先有单写 owner + 首写赢"承诺的落地点：杜绝 budget→cancelled→失联 这类层层改写。
 */
export interface MissionTerminalArbiter {
  applyTerminalIfRunning(
    missionId: string,
    intent: MissionTerminalIntent,
  ): Promise<boolean>;
}

/**
 * Mission 状态变更接口（ai-app 层提供具体实现）
 * @deprecated C0/G1：终态写改走 finalize() + MissionTerminalArbiter（条件写仲裁）。
 *   本端口仅 legacy cancel() 暂用，T16 三 app 切换完后随 cancel() 一并移除。
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
   * ★ C0 / G1：**唯一终态写入口**。所有把 mission 推到 completed/failed/cancelled 的来源
   * （dispatcher 正常完成 / dispatcher 失败 / liveness 回收 / abort / controller 取消）都
   * 调这一个方法提交意图，由它单点仲裁，禁止各自直写 DB。
   *
   * 仲裁靠 arbiter 的条件写（WHERE status='running'）：首写赢、后到者 no-op，不覆盖首写原因。
   * 这直接打穿"真因 budget_exhausted 被层层改写成 cancelled/失联"的并发竞争。
   *
   * @returns won=true 本次赢得终态写；won=false 已被别的来源终结（本次 no-op）。
   */
  async finalize(args: {
    missionId: string;
    intent: MissionTerminalIntent;
    arbiter: MissionTerminalArbiter;
    /** 是否同时触发 abort signal（user cancel / budget / wall-time 场景置 true）。幂等。 */
    abort?: boolean;
    /** 仅在赢得仲裁后执行的副作用（事件广播 / 清理）。输了不执行。异常被吞（非致命）。 */
    onWon?: () => Promise<void>;
  }): Promise<{ won: boolean }> {
    const { missionId, intent, arbiter, abort, onWon } = args;

    // 1. abort signal —— 让 in-flight LLM / tool call 立即中断（幂等，多次 abort 无害）
    if (abort) {
      this.abortRegistry.abort(
        missionId,
        intent.reason ?? MissionAbortReason.user_cancelled,
      );
    }

    // 2. 条件写仲裁（首写者赢）
    const won = await arbiter.applyTerminalIfRunning(missionId, intent);
    if (!won) {
      this.log.log(
        `[finalize ${missionId}] lost race → already terminal; intent='${intent.status}' no-op (不覆盖首写)`,
      );
      return { won: false };
    }
    this.log.log(
      `[finalize ${missionId}] won → '${intent.status}'${
        intent.failureCode ? ` code=${intent.failureCode}` : ""
      }`,
    );

    // 3. 赢家副作用（广播等），吞异常不影响终态
    if (onWon) {
      try {
        await onWon();
      } catch (err) {
        this.log.warn(
          `[finalize ${missionId}] onWon side-effect failed (non-fatal): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    return { won: true };
  }

  /**
   * 取消 mission（统一三连：abort → mark cancelled → broadcast）。
   * @deprecated C0/G1：改用 finalize({ intent:{status:'cancelled'}, abort:true, ... })，
   *   它带条件写仲裁。本方法 T16 三 app 切换完后移除。
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
    // @deprecated 路径：reason 仍是 string，cast 到 enum（合法 reason 值一致）；本方法待移除。
    this.abortRegistry.abort(missionId, reason as MissionAbortReason);

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
