/**
 * Mission app conformance(C8 / L5a 静态)—— §0.5 RB3 + RM2(2026-05-22)。
 *
 * 不变量:**每个 mission 型 app 模块都必须注册 liveness adapter**——否则孤儿 running 行
 * 永不回收(G0 真事故)。这是"对任意 mission app 的不变量",非"对具体 app 的清单":
 * 新增 mission app 时把它加进 MISSION_APP_MODULES,缺 liveness 注册即红。
 *
 * 分层(RM2):
 *   - L5a 静态(本 spec):liveness adapter 注册存在性 —— 可静态验证。
 *   - L5b 行为(集成测试,另处):cancel 真停(signal.aborted/budget 停增)、失败落 canonical
 *     failureCode、三方竞争首写赢 —— 见 mission-lifecycle-manager.finalize.spec / 三 app
 *     dispatcher/cancel 集成测试。
 *
 * ★ RB3:本断言放在 app-test 层(可点名 app),不放 harness runtime(harness 禁 app 名,R0-A5)。
 */

import { readFileSync } from "fs";
import { join } from "path";

const APP_ROOT = join(__dirname, "../../modules/ai-app");

/** 所有 mission 型 app 的模块文件(新增 mission app 必须登记到此 + 注册 liveness)。 */
const MISSION_APP_MODULES = [
  "agent-playground/agent-playground.module.ts",
  "radar/radar.module.ts",
  "social/ai-social.module.ts",
];

describe("Mission app conformance — C8/L5a 静态", () => {
  it.each(MISSION_APP_MODULES)(
    "%s 必须注册 liveness adapter(防孤儿 running 行)",
    (rel) => {
      const src = readFileSync(join(APP_ROOT, rel), "utf8");
      expect(src).toMatch(/livenessGuard\.registerAdapter\(/);
    },
  );

  it("登记的 mission app 集合非空(conformance 是对注册项的不变量)", () => {
    expect(MISSION_APP_MODULES.length).toBeGreaterThan(0);
  });
});
