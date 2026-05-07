// PR-6 v1.6 D4 budget guard — RV-13.11/12/13/14 + RV-budget-1
//
// 关键反向证据：
//   1. atomic CAS — 并发 tryDeduct 不会出现 double-spend（PR13-S2）
//   2. 删 refund — LLM 失败也扣，retry 由总 budget 自然限制（PR13-S4，防 CWE-400 死循环）
//   3. tryReserve atomic — tryRetryStage 入队前一致性（PR13-S7）
//   4. 没有 refund 方法签名（PR13-S8 dead code attack surface 移除）

import { BudgetGuardService } from "../budget-guard.service";

describe("PR-6 v1.6 BudgetGuardService", () => {
  let bg: BudgetGuardService;
  beforeEach(() => {
    bg = new BudgetGuardService();
  });

  describe("RV-13.11 (PR13-S2): atomic check+deduct 防 TOCTOU", () => {
    it("基本扣费：tryDeduct → success + remaining 减", () => {
      bg.initBudget("m1", 10);
      const r = bg.tryDeduct("m1", 3);
      expect(r.success).toBe(true);
      expect(r.remaining).toBe(7);
    });

    it("budget 不足：tryDeduct → success=false + 不扣（remaining 不变）", () => {
      bg.initBudget("m1", 5);
      const r = bg.tryDeduct("m1", 10);
      expect(r.success).toBe(false);
      expect(r.remaining).toBe(5);
      expect(bg.getRemaining("m1")).toBe(5); // 未扣
    });

    it("并发场景：两次 tryDeduct 总开销超 budget → 第一个 success / 第二个 fail（不会 double-spend）", () => {
      bg.initBudget("m1", 7);
      const r1 = bg.tryDeduct("m1", 5);
      const r2 = bg.tryDeduct("m1", 5);
      expect(r1.success).toBe(true);
      expect(r1.remaining).toBe(2);
      expect(r2.success).toBe(false);
      expect(r2.remaining).toBe(2); // 仍是 2，不是 -3
    });

    it("不存在 mission → remaining 0 → 任何 tryDeduct 都 fail", () => {
      const r = bg.tryDeduct("nonexistent", 1);
      expect(r.success).toBe(false);
      expect(r.remaining).toBe(0);
    });
  });

  describe("RV-13.12 / 13.13 (PR13-S4): 删 refund，失败也扣，retry 自然限", () => {
    it("BudgetGuard 接口无 refund 方法（PR13-S8 dead code 删除）", () => {
      // @ts-expect-error 编译期断言：refund 不存在
      expect(bg.refund).toBeUndefined();
    });

    it("RV-13.13 模拟 retry 3 次每次 LLM 失败但 cost 都已付 → 总扣 0.90", () => {
      bg.initBudget("m1", 1.0);
      const cost = 0.3;
      // attempt 1
      let r = bg.tryDeduct("m1", cost);
      expect(r.success).toBe(true);
      // 假装 LLM call 抛错（cost 已付不能 refund）
      // attempt 2
      r = bg.tryDeduct("m1", cost);
      expect(r.success).toBe(true);
      // attempt 3
      r = bg.tryDeduct("m1", cost);
      expect(r.success).toBe(true);
      // 第 4 次 budget 不够（剩 0.10 < 0.30）
      r = bg.tryDeduct("m1", cost);
      expect(r.success).toBe(false);
      expect(r.remaining).toBeCloseTo(0.1, 5);
      // 关键：3 次后真实扣了 0.90（没被 refund 还原），retry 死循环不可能
    });
  });

  describe("RV-budget-1 (PR13-S7): tryReserve atomic 防 tryRetryStage TOCTOU", () => {
    it("tryReserve 与 tryDeduct 同 atomic 语义", () => {
      bg.initBudget("m1", 10);
      const r1 = bg.tryReserve("m1", 6);
      const r2 = bg.tryReserve("m1", 6);
      expect(r1.success).toBe(true);
      expect(r1.remaining).toBe(4);
      expect(r2.success).toBe(false);
      expect(r2.remaining).toBe(4);
    });

    it("快速双触发场景：第一次 reserve 通过，第二次 atomic 拦截", () => {
      bg.initBudget("m1", 5);
      // 模拟同一 user 同一 mission 100ms 内双击 D4 retry
      const r1 = bg.tryReserve("m1", 4);
      const r2 = bg.tryReserve("m1", 4);
      expect(r1.success).toBe(true);
      expect(r2.success).toBe(false);
    });
  });

  describe("getRemaining 仅 UI 用", () => {
    it("getRemaining 不修改状态", () => {
      bg.initBudget("m1", 10);
      expect(bg.getRemaining("m1")).toBe(10);
      expect(bg.getRemaining("m1")).toBe(10); // 多次读不变
    });
  });

  describe("clearBudget 清理", () => {
    it("clearBudget 后 getRemaining 返 0", () => {
      bg.initBudget("m1", 10);
      bg.clearBudget("m1");
      expect(bg.getRemaining("m1")).toBe(0);
    });
  });
});
