// PR-7 v1.6 D5 rerun intent 路由 — PR13-S8 无条件前置 ensureRerunable
//
// 关键设计（security R2/R3 P0 修补）：
//   1. dispatchRerunIntent 无条件先调 ensureRerunable（除 fresh-research 走 ensureMissionOwnership）
//      —— 不依赖 per-handler flag（v1.4 PR13-S8 反转：删 flag，避免实施时漏 opt-in 静默绕过守护）
//   2. fresh-research 创建新 mission + parent_mission_id；原 mission 保留
//      —— 仅校验所有权（不需 rerunable 状态机检查）

import { BadRequestException, Injectable } from "@nestjs/common";
import type { RerunIntent } from "./rerun-intents";
import { INTENT_STAGES } from "./rerun-intents";

export type IntentHandler = (
  missionId: string,
  userId: string,
  payload: unknown,
) => Promise<{ runMissionId: string; intent: RerunIntent }>;

export interface RerunGuardLike {
  /** 三元 WHERE: id + user_id + status ∈ rerunable → 允许 */
  ensureRerunable(missionId: string, userId: string): Promise<void>;
  /** 仅校验所有权，不检查 rerunable 状态机（fresh-research 用） */
  ensureMissionOwnership(missionId: string, userId: string): Promise<void>;
}

@Injectable()
export class RerunIntentDispatcher {
  private readonly handlers = new Map<RerunIntent, IntentHandler>();

  registerHandler(intent: RerunIntent, handler: IntentHandler): void {
    this.handlers.set(intent, handler);
  }

  /**
   * 无条件前置守护 + 路由到对应 handler。
   *
   * v1.6 § 14 PR13-S8 反转：
   *   v1.4 用 per-handler `requiresEnsureRerunable: true` flag → 实施漏写 = 静默绕过
   *   v1.6 在 dispatcher 层无条件先调 ensureRerunable，handler 不需 opt-in
   */
  async dispatch(
    missionId: string,
    userId: string,
    intent: RerunIntent,
    payload: unknown,
    guard: RerunGuardLike,
  ): Promise<{ runMissionId: string; intent: RerunIntent }> {
    if (!INTENT_STAGES[intent]) {
      throw new BadRequestException(`Unknown rerun intent: ${intent}`);
    }

    const handler = this.handlers.get(intent);
    if (!handler) {
      throw new BadRequestException(
        `No handler registered for intent: ${intent}`,
      );
    }

    // ★ v1.6 § 14 PR13-S8: 无条件前置守护
    if (intent === "fresh-research") {
      // fresh-research 创建新 mission，原 mission 不进入 rerun 状态机；仅校验所有权
      await guard.ensureMissionOwnership(missionId, userId);
    } else {
      // 其他 7 意图必经 rerunable 状态机三元 WHERE 守护（CWE-639）
      await guard.ensureRerunable(missionId, userId);
    }

    return await handler(missionId, userId, payload);
  }
}
