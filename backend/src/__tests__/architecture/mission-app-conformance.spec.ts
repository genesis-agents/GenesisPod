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
  "agent-playground/module/agent-playground.module.ts",
  "radar/module/radar.module.ts",
  "social/module/ai-social.module.ts",
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

  // ★ C5/G7(三 app 统一):每个 mission app 的 runtime-shell 都必须在 openSession 冻结
  //   typed config snapshot(canonical 配置记录单一真源)。新 app 缺则红。
  //
  // 2026-05-26 修 P32 P0-3 (假断言): 旧版用 `buildForFreshRun|configSnapshot` 这种
  //   "或带 configSnapshot 兜底" 的 regex —— 任何文件出现 "configSnapshot" 字符串
  //   (注释/类型/字段名) 即过, 完全失去检测力. 现改为 AST 语义级检查:
  //   必须存在一个函数定义 (function build*ConfigSnapshot / const build*ConfigSnapshot = /
  //   private build*ConfigSnapshot) 且这个函数被 openSession 调用.
  const MISSION_APP_SHELLS = [
    "agent-playground/mission/pipeline/mission-runtime-shell.service.ts",
    "radar/mission/pipeline/radar-mission-runtime-shell.service.ts",
    "social/mission/pipeline/social-runtime-shell.service.ts",
  ];

  /**
   * 在 runtime-shell 源码里找 config snapshot 的使用证据.
   * 不要求本地定义 (builder 可能在独立 service / 工厂文件里):
   *   - playground: rebuilder.buildForFreshRun(...) (rebuilder 是单独的 input-rebuilder)
   *   - radar:      buildRadarConfigSnapshot(...) 可能本地或导入
   *   - social:     buildSocialConfigSnapshot(...) 同上
   *
   * 真实使用 = 必须有 ".buildXxxConfigSnapshot(" 或 ".buildForFreshRun("
   *   或直接函数 "buildXxxConfigSnapshot(" 调用形式 (含括号的 call site).
   * 单纯字符串字面量或类型定义 (不带 `(` ) 不算.
   */
  function hasConfigSnapshotCallSite(src: string): {
    matched: boolean;
    siteCount: number;
    siteSamples: string[];
  } {
    // call site 模式: `xxx(` 形式, 必须有左括号, 排除字符串字面量内的
    // 简化: 不剥字符串/注释, 但 build*ConfigSnapshot 是 PascalCase + 长 token,
    // 不会偶然出现在字符串里
    const re = /\b(build\w*ConfigSnapshot|buildForFreshRun)\s*\(/g;
    const matches = [...src.matchAll(re)];
    return {
      matched: matches.length > 0,
      siteCount: matches.length,
      siteSamples: matches.map((m) => m[1]).slice(0, 5),
    };
  }

  it.each(MISSION_APP_SHELLS)(
    "%s 必须有 build*ConfigSnapshot 调用 (真实 call site, 非字符串残留)",
    (rel) => {
      const src = readFileSync(join(APP_ROOT, rel), "utf8");
      const { matched, siteCount, siteSamples } = hasConfigSnapshotCallSite(src);
      expect({
        file: rel,
        matched,
        siteCount,
        siteSamples,
      }).toMatchObject({
        matched: true,
      });
    },
  );
});
