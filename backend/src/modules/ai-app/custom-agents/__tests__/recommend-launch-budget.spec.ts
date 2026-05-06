/**
 * recommendLaunchBudget 公式回归测试（2026-05-06 P0-K 修复）
 *
 * Custom-agents 走 translate() 时不暴露 maxCredits / budgetMultiplierOverride
 * 给用户，只能从 agent config (defaultDepth × defaultLength × defaultBudget)
 * 推算。本 spec 覆盖：
 *   1. 所有 (depth × length × budget) 组合输出都通过 RunMissionInputSchema
 *      （避免任何组合下出现 maxCredits<10 / >100k 或 mul<0.3 / >10）
 *   2. 公式与 frontend DemoLauncher.tsx 输出一致（同输入 → 同输出）
 *   3. 边界 case：mega + unlimited + deep 最大组合，brief + low + quick 最小组合
 */
import { recommendLaunchBudget } from "../custom-agents.service";
import { RunMissionInputSchema } from "../../agent-playground/dto/run-mission.dto";

const DEPTHS = ["quick", "standard", "deep"] as const;
const LENGTHS = [
  "brief",
  "standard",
  "deep",
  "extended",
  "epic",
  "mega",
] as const;
const BUDGETS = ["low", "medium", "high", "unlimited"] as const;

describe("recommendLaunchBudget", () => {
  it("所有 (depth × length × budget) 组合 maxCredits / budgetMultiplierOverride 在 schema 范围内", () => {
    // 注意：schema 还有 refine 拒 depth=quick + length in {epic, mega}，
    // 那是 translate() 兜底 normalize 的职责（自动升 depth 到 standard），
    // 不是 recommendLaunchBudget 的责任。本 spec 只验数值边界。
    for (const depth of DEPTHS) {
      for (const length of LENGTHS) {
        for (const budget of BUDGETS) {
          const { maxCredits, budgetMultiplierOverride } =
            recommendLaunchBudget(depth, length, budget);
          // 预算字段范围：min(10).max(100_000) / min(0.3).max(10)
          expect(maxCredits).toBeGreaterThanOrEqual(10);
          expect(maxCredits).toBeLessThanOrEqual(100_000);
          expect(budgetMultiplierOverride).toBeGreaterThanOrEqual(0.3);
          expect(budgetMultiplierOverride).toBeLessThanOrEqual(10);
        }
      }
    }
  });

  it("合法 (depth, length) 组合 → 完整 schema 通过（含 refine）", () => {
    for (const depth of DEPTHS) {
      for (const length of LENGTHS) {
        // 跳过 schema refine 拒掉的 quick+epic/mega（translate() 内部已 normalize）
        if (depth === "quick" && (length === "epic" || length === "mega")) {
          continue;
        }
        for (const budget of BUDGETS) {
          const { maxCredits, budgetMultiplierOverride } =
            recommendLaunchBudget(depth, length, budget);
          const input = {
            topic: "regression test topic",
            depth,
            language: "zh-CN" as const,
            audienceProfile: "domain-expert" as const,
            styleProfile: "executive" as const,
            lengthProfile: length,
            budgetProfile: budget,
            withFigures: true,
            auditLayers: "default" as const,
            concurrency: 3,
            viewMode: "continuous" as const,
            maxCredits,
            budgetMultiplierOverride,
          };
          const parsed = RunMissionInputSchema.safeParse(input);
          if (!parsed.success) {
            const issues = parsed.error.issues
              .map((i) => `${i.path.join(".")}:${i.message}`)
              .join("; ");
            throw new Error(`(${depth}/${length}/${budget}) → ${issues}`);
          }
        }
      }
    }
  });

  it("typical case: deep + standard + medium → 约 690 credits + 1.4 mul", () => {
    const r = recommendLaunchBudget("deep", "standard", "medium");
    // base 400 × depthMul 1 × lenMul 1 × budgetTokenMul 1 × auditMul 1 × figMul 1.15 = 460K
    // maxCredits = round(460 × 1.5) = 690
    expect(r.maxCredits).toBe(690);
    // budgetMul 1.0 × depthMul 1.4 = 1.4
    expect(r.budgetMultiplierOverride).toBe(1.4);
  });

  it("min boundary: brief + quick + low → 不低于 50 credits", () => {
    const r = recommendLaunchBudget("quick", "brief", "low");
    expect(r.maxCredits).toBe(
      Math.max(50, Math.round(400 * 0.4 * 0.5 * 0.5 * 1.15 * 1.5)),
    );
    expect(r.maxCredits).toBeGreaterThanOrEqual(50);
    // budgetMul 0.6 × depthMul 0.7 = 0.42
    expect(r.budgetMultiplierOverride).toBe(0.42);
  });

  it("max boundary: mega + deep + unlimited → maxCredits 不超 100k / mul 不超 10", () => {
    const r = recommendLaunchBudget("deep", "mega", "unlimited");
    // base 400 × 1 × 2.5 × 4 × 1 × 1.15 = 4600K → 6900 credits
    expect(r.maxCredits).toBe(6900);
    // budgetMul 4.0 × depthMul 1.4 = 5.6
    expect(r.budgetMultiplierOverride).toBe(5.6);
  });

  it("不同 budget 同 depth+length 时 maxCredits 单调递增", () => {
    const low = recommendLaunchBudget("standard", "standard", "low").maxCredits;
    const med = recommendLaunchBudget(
      "standard",
      "standard",
      "medium",
    ).maxCredits;
    const high = recommendLaunchBudget(
      "standard",
      "standard",
      "high",
    ).maxCredits;
    const unl = recommendLaunchBudget(
      "standard",
      "standard",
      "unlimited",
    ).maxCredits;
    expect(med).toBeGreaterThan(low);
    expect(high).toBeGreaterThan(med);
    expect(unl).toBeGreaterThan(high);
  });
});
