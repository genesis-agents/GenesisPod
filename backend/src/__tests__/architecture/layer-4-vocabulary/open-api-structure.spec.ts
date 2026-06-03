/**
 * standards/24 Open API 目录结构看护
 *
 * 看护三条铁律（见 standards/24-open-api-structure.md）：
 *   律1 admin 唯一：所有 `@Controller('admin/...')` 必须在 open-api/admin/ 下。
 *   律2 目录词汇：顶层目录 ∈ 规范词集（去冗余后缀 -api/-admin/-server/-core）。
 *   律4 薄网关：open-api 的 controller 不得直接注入 PrismaService（业务逻辑应下沉下层 service）。
 *
 * 每条用**收缩 ALLOWLIST** 跟踪存量违规：搬一个删一行，清空即硬焊。新增违规即红。
 * 过期条目（已整改但还列着）走软告警，不硬失败（避免与并发整改竞态）。
 */

import * as fs from "fs";
import * as path from "path";

const SRC_ROOT = path.resolve(__dirname, "../../..");
const OA = path.join(SRC_ROOT, "modules/open-api");

function listTs(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "__tests__" || e.name === "node_modules" || e.name === "dist") continue;
      listTs(full, acc);
    } else if (e.isFile() && e.name.endsWith(".ts") && !e.name.endsWith(".spec.ts") && !e.name.endsWith(".d.ts")) {
      acc.push(full);
    }
  }
  return acc;
}
const rel = (f: string) => path.relative(SRC_ROOT, f).replace(/\\/g, "/");

// ── 律2 顶层目录词汇 ──
const CANONICAL_DIRS = ["admin", "system", "public", "a2a", "mcp", "agents", "skills", "teams", "ai", "webhooks"];
const DIR_VOCAB_ALLOWLIST = []; // 待去后缀（teams-api 已整改）

// ── 律1 admin 散落 ──
const ADMIN_SCATTER_ALLOWLIST = [
];

// ── 律4 薄网关（Prisma in controller）──
const THIN_GATEWAY_ALLOWLIST = [
  "modules/open-api/admin/approvals/approvals.controller.ts",
  "modules/open-api/admin/byok/admin-byok-dashboard.controller.ts",
  "modules/open-api/admin/kernel/kernel.controller.ts",
  "modules/open-api/admin/knowledge/knowledge.controller.ts",
  "modules/open-api/admin/monitoring/monitoring.controller.ts",
];

function softStaleWarn(name: string, allowlist: string[], actual: string[]) {
  const stale = allowlist.filter((a) => !actual.includes(a));
  if (stale.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(`[std24:${name}] ALLOWLIST 过期条目（已整改，请删行）：\n  ${stale.join("\n  ")}`);
  }
  // eslint-disable-next-line no-console
  console.info(`[std24:${name}] 剩余违规 ${actual.length} 个`);
}

describe("standards/24 · Open API 目录结构", () => {
  it("律1：所有 admin/* 路由唯一在 open-api/admin/（散落即红）", () => {
    const offenders = listTs(OA)
      .filter((f) => /@Controller\(\s*['"]admin\//.test(fs.readFileSync(f, "utf-8")))
      .map(rel)
      .filter((r) => !r.startsWith("modules/open-api/admin/"))
      .sort();
    softStaleWarn("admin-cohesion", ADMIN_SCATTER_ALLOWLIST, offenders);
    expect(offenders.filter((o) => !ADMIN_SCATTER_ALLOWLIST.includes(o))).toEqual([]);
  });

  it("律2：open-api 顶层目录 ∈ 规范词集（冗余后缀即红）", () => {
    const dirs = fs
      .readdirSync(OA, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name !== "__tests__")
      .map((e) => e.name)
      .sort();
    const offenders = dirs.filter((d) => !CANONICAL_DIRS.includes(d));
    softStaleWarn("dir-vocab", DIR_VOCAB_ALLOWLIST, offenders);
    expect(offenders.filter((o) => !DIR_VOCAB_ALLOWLIST.includes(o))).toEqual([]);
  });

  it("律4：open-api controller 不得直接注入 PrismaService（薄网关）", () => {
    const offenders = listTs(OA)
      .filter((f) => f.endsWith(".controller.ts"))
      .filter((f) => /\bPrismaService\b/.test(fs.readFileSync(f, "utf-8")))
      .map(rel)
      .sort();
    softStaleWarn("thin-gateway", THIN_GATEWAY_ALLOWLIST, offenders);
    expect(offenders.filter((o) => !THIN_GATEWAY_ALLOWLIST.includes(o))).toEqual([]);
  });

  it("律2b：open-api/admin 下控制器文件名禁带冗余 -admin 后缀（目录已表达 admin 身份）", () => {
    const offenders = listTs(path.join(OA, "admin"))
      .filter((file) => /-admin.controller.ts$/.test(file))
      .map(rel)
      .sort();
    expect(offenders).toEqual([]);
  });

});
