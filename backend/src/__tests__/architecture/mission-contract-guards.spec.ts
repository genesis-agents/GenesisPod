/**
 * Mission 契约看护 spec —— G10 / RM1（2026-05-22）。
 *
 * L1 类型是主防线(值对象私有构造 / abort enum / patch 白名单 —— 编译期);本 spec 是 L3
 * **补充**守护(grep 级,收窄到具体目录,避免全仓误伤,见 §0.5 RM1)。只锁两条机械不变量:
 *   1. credits→usd/tokens 换算只在 ResolvedBudgetCaps 一处(guardrails/budget 目录内扫散落)。
 *   2. C2 failure category 只能由 codeToCategory 派生(mission-failure.ts 不得出现独立 category 字面量赋值)。
 */

import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const BUDGET_DIR = join(
  __dirname,
  "../../modules/ai-harness/guardrails/budget",
);

describe("mission 契约看护 (G10/L3，补充层)", () => {
  it("credits 换算字面量(× 0.002 / × 1000)只允许出现在 resolved-budget-caps.ts", () => {
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const ent of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, ent.name);
        if (ent.isDirectory()) {
          if (ent.name !== "__tests__") walk(p);
          continue;
        }
        if (!ent.name.endsWith(".ts") || ent.name.endsWith(".spec.ts"))
          continue;
        if (ent.name === "resolved-budget-caps.ts") continue; // 唯一换算处(白名单)
        const src = readFileSync(p, "utf8");
        // 词边界:* 0.002 / * 1000(credits 换算)。budget 目录内别处不得散落。
        if (/\*\s*0\.002\b/.test(src) || /\*\s*1000\b/.test(src)) {
          offenders.push(p);
        }
      }
    };
    walk(BUDGET_DIR);
    expect(offenders).toEqual([]);
  });

  it("mission-failure.ts:category 由 codeToCategory 派生(buildMissionFailure 不独立赋 category)", () => {
    const src = readFileSync(
      join(
        __dirname,
        "../../modules/ai-harness/lifecycle/mission-lifecycle/abstractions/mission-failure.ts",
      ),
      "utf8",
    );
    // buildMissionFailure 必须用 codeToCategory(code) 产出 category,不得写死 FailureCategory.xxx
    expect(src).toContain("category: codeToCategory(code)");
  });
});
