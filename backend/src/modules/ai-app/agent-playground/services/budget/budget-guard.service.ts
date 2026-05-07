// PR-6 v1.6 D4 budget guard atomic API
//
// 设计：
//   - tryDeduct: atomic check + deduct（Lua CAS 在 prod；此实现用 JS 单线程语义在内存原子完成）
//   - tryReserve: atomic 预占（与 tryDeduct 同语义；语义上区分 stage 入队前 vs 实际扣费）
//   - getRemaining: 仅 UI 显示用，禁止用于决策（参 v1.6 § 16.4 元教训 P2#2）
//   - 删除 refund 接口（参 v1.6 § 15.2 PR13-S4 — refund 死循环 P0）：
//     LLM 失败的 cost 已付 provider 不可逆；retry 上限由总 budget 自然限制
//
// 生产部署 follow-up：
//   - Redis Lua script for cross-pod atomicity
//   - 当前 in-memory 实现仅在单 pod 模式下原子；多 pod 部署必须升级 Redis 实现

import { Injectable } from "@nestjs/common";

export type DeductResult = {
  /** true = 已扣，false = budget 不足 */
  success: boolean;
  /** 扣后剩余预算（USD） */
  remaining: number;
};

@Injectable()
export class BudgetGuardService {
  /** mission_id → 剩余预算（USD），单 pod in-memory；prod Redis Lua */
  private readonly remaining = new Map<string, number>();

  /**
   * 初始化 mission 预算池（mission 创建时调用，maxCredits 来自 SCALE_PRESETS[scale]）
   */
  initBudget(missionId: string, maxCredits: number): void {
    this.remaining.set(missionId, maxCredits);
  }

  /**
   * Atomic check + deduct（PR13-S2 v1.6 修复 TOCTOU）。
   *
   * 在 JS 单线程下 read-modify-write 在同一 tick 内原子；
   * prod 多 pod 必须改 Redis Lua script 或 DECRBY-then-rollback 模式。
   *
   * 删除 refund 路径（v1.6 § 15.2 PR13-S4）：失败也扣，cost 已付 provider 不可逆，
   * retry 上限由总 budget 自然限制。
   */
  tryDeduct(missionId: string, cost: number): DeductResult {
    const current = this.remaining.get(missionId) ?? 0;
    if (current < cost) {
      return { success: false, remaining: current };
    }
    const next = current - cost;
    this.remaining.set(missionId, next);
    return { success: true, remaining: next };
  }

  /**
   * Atomic 预占（PR13-S7 v1.6 修复 tryRetryStage TOCTOU）。
   *
   * 语义上是"我打算花，stage 真跑时再 deduct"；但实现复用 tryDeduct（CAS 减），
   * 因为 stage 内 sub-section 各自调 tryDeduct 时已经在新预算基线上扣，无双重扣款风险。
   * stage 实际花费 ≤ 预占时，剩余预占自然留在 budget 里。
   */
  tryReserve(missionId: string, cost: number): DeductResult {
    return this.tryDeduct(missionId, cost);
  }

  /**
   * 仅 UI 显示用 — 禁止用于决策路径（TOCTOU 风险）。
   *
   * 决策路径必须用 tryDeduct / tryReserve 的 atomic 返回值。
   */
  getRemaining(missionId: string): number {
    return this.remaining.get(missionId) ?? 0;
  }

  // ❌ refund 方法已从 v1.6 BudgetGuard 接口删除
  //   (security R3 N2 P0: refund + retry 配合形成死循环刷 budget 攻击 CWE-400)
  //   见 docs/architecture/ai-app/agent-playground/agent-playground-overhaul-v1.6.md § 15.2

  /** 测试 / mission 完成清理 */
  clearBudget(missionId: string): void {
    this.remaining.delete(missionId);
  }
}
