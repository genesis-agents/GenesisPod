/**
 * standards/16 §三·补 HTTP 接口面看护
 *
 * 规则（OS 透镜）：HTTP 入口只属 **L4 open-api（系统 API 网关）** 与
 * **L3 ai-app（用户态产品）**；**engine（硬件）/ harness（内核）/ platform（固件）
 * 永不开 HTTP**。即这三层不得出现 `@Controller`。
 *
 * - engine / harness：硬焊 0，立刻锁死、防回归。
 * - platform：System 的 HTTP 应上提 open-api/system（controller 搬走、service 留
 *   platform，详见 standards/16 §三·补）。当前仍有少量待搬，列入 ALLOWLIST 作
 *   **收缩进度条**：每完成一个上提就从 ALLOWLIST 删一行；清空即与 engine/harness
 *   同样硬焊 0。新增任何 ALLOWLIST 之外的 controller → 本测试红。
 */

import * as fs from "fs";
import * as path from "path";

const SRC_ROOT = path.resolve(__dirname, "../../..");

/** 递归列出 .ts 运行时文件（排除 spec/test/d.ts/__tests__/node_modules）。 */
function listTsFiles(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name === "__tests__" ||
        entry.name === "node_modules" ||
        entry.name === "dist"
      )
        continue;
      listTsFiles(full, acc);
    } else if (
      entry.isFile() &&
      entry.name.endsWith(".ts") &&
      !entry.name.endsWith(".spec.ts") &&
      !entry.name.endsWith(".test.ts") &&
      !entry.name.endsWith(".d.ts")
    ) {
      acc.push(full);
    }
  }
  return acc;
}

/** 返回某模块根下所有含 `@Controller(` 的文件（相对 SRC_ROOT，正斜杠）。 */
function controllersIn(moduleRel: string): string[] {
  const root = path.join(SRC_ROOT, "modules", moduleRel);
  return listTsFiles(root)
    .filter((f) => /@Controller\s*\(/.test(fs.readFileSync(f, "utf-8")))
    .map((f) => path.relative(SRC_ROOT, f).replace(/\\/g, "/"))
    .sort();
}

/**
 * platform 残留 controller 收缩名单（standards/16 §三·补）。
 * 完成一个上提 → 删一行。清空 = platform 与 engine/harness 同样 0 HTTP。
 */
const PLATFORM_ALLOWLIST: string[] = [
  // ⏳ PENDING：System HTTP，待上提 open-api/system（service 留 platform）
  "modules/platform/auth/auth.controller.ts",
  // ⚙️ SPECIAL：Prometheus `/metrics` 抓取端点（机器拉取，非用户/管理 API）。
  //    OS 类比 = 硬件遥测针脚；可作**永久例外**，或上提 open-api/system/monitoring
  //    求严格 0（待裁决）。
  "modules/platform/monitoring/metrics/metrics.controller.ts",
];

describe("standards/16 · HTTP 只在 L3/L4，下层不开 HTTP", () => {
  it("ai-engine（硬件层）= 0 个 @Controller", () => {
    expect(controllersIn("ai-engine")).toEqual([]);
  });

  it("ai-harness（内核层）= 0 个 @Controller", () => {
    expect(controllersIn("ai-harness")).toEqual([]);
  });

  it("platform（固件层）的 controller 不得超出收缩 ALLOWLIST（新增即红）", () => {
    const actual = controllersIn("platform");
    const allowed = new Set(PLATFORM_ALLOWLIST);
    const offenders = actual.filter((c) => !allowed.has(c));
    expect(offenders).toEqual([]);
  });

  // 软告警：并发上提后名单可能有"已搬走却还列着"的过期条目。**不**硬失败
  // （否则别人上提就把 main 弄红 = 竞态），只提示维护者清理，保持进度准确。
  it("剩余例外可见 + 过期条目软提示（不阻断）", () => {
    const actual = controllersIn("platform");
    const stale = PLATFORM_ALLOWLIST.filter((c) => !actual.includes(c));
    if (stale.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `[std16-http-guard] ALLOWLIST 过期条目（已上提，请从名单删除）：\n  ${stale.join("\n  ")}`,
      );
    }
    // eslint-disable-next-line no-console
    console.info(
      `[std16-http-guard] platform 剩余 HTTP 例外 ${actual.length} 个：${actual.join(", ") || "（已清零，可硬焊 0）"}`,
    );
    expect(true).toBe(true);
  });
});
