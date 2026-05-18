#!/usr/bin/env tsx
/**
 * UI Discipline Audit — 6 条结构强制规则
 *
 * 检测前端主页面是否绕过公共组件自写实现。
 * 配套方案文档：docs/guides/testing/frontend-ui-validation.md
 * 基线日期：2026-05-18（首次扫描）
 *
 * 6 条规则（仅作用于 frontend/app/** 和 frontend/components/{ai-*,library,explore,me,profile}/**）：
 *   R1  AI app 主页（app/{ai-*,library,explore}/page.tsx）必须 import AppShell
 *   R2  列表型 .map 渲染卡片的页面必须 import AssetCard（不准自写 rounded-(xl|lg|2xl) + border 卡片）
 *   R3  含 list.length === 0 / data?.length === 0 分支必须 import EmptyState
 *   R4  含 error state 渲染分支必须 import ErrorState
 *   R5  含 isLoading skeleton 渲染必须 import LoadingState/LoadingSkeleton
 *   R6  弹层（role="dialog" 或 fixed inset-0 backdrop）必须 import MissionDialogShell/SideDrawer/Modal/ConfirmDialog
 *
 * 报告模式：默认 exit 0（warn-only 基线期），传 --strict 后违规超基线即 exit 1。
 *
 * 用法：
 *   npm run audit:ui-discipline
 *   tsx scripts/audit-ui-discipline.ts --strict
 *   tsx scripts/audit-ui-discipline.ts --baseline docs/_archive/ui-baseline.json
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { existsSync } from "node:fs";

const FRONTEND_ROOT = join(process.cwd(), "frontend");
const ARGS = new Set(process.argv.slice(2));
const STRICT = ARGS.has("--strict");
const BASELINE_PATH = (() => {
  const idx = process.argv.indexOf("--baseline");
  return idx > 0
    ? process.argv[idx + 1]
    : "docs/_archive/ui-discipline-baseline.json";
})();

interface Violation {
  rule: string;
  file: string;
  line: number;
  snippet: string;
}

const EXCLUDE_PATTERNS = [
  "node_modules",
  ".next",
  "components/admin/", // admin 自成设计系统
  "components/ai-office/slides/", // slides 自成域
  "components/playground-design/", // playground 自成 token 系统
  "components/ui/", // 公共 UI primitives 自身（Modal/Dialog/Toolbar/LoadingState 实现）
  "components/common/", // 公共组件自身（AssetCard/EmptyState/SideDrawer 实现）
  "components/profile/UserApiKeyDrawer.tsx", // 老式自定义 Drawer，已记入重构清单
  "__tests__",
  ".test.",
  ".spec.",
  ".stories.",
];

function shouldSkip(file: string): boolean {
  const norm = file.split(sep).join("/");
  return EXCLUDE_PATTERNS.some((p) => norm.includes(p));
}

async function walkDir(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  for (const e of entries) {
    if (!e.isFile()) continue;
    if (!/\.(tsx|jsx)$/.test(e.name)) continue;
    const full = join(e.parentPath ?? dir, e.name);
    if (shouldSkip(full)) continue;
    out.push(full);
  }
  return out;
}

function hasImport(src: string, symbol: string): boolean {
  // 简化版：检查 import { ... Symbol ... } 或 import Symbol
  const re = new RegExp(
    `import\\s+(?:[^;]*\\{[^}]*\\b${symbol}\\b[^}]*\\}|\\b${symbol}\\b)[^;]*from`,
    "m",
  );
  return re.test(src);
}

function findLine(src: string, marker: string | RegExp): number {
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (
      typeof marker === "string"
        ? lines[i].includes(marker)
        : marker.test(lines[i])
    ) {
      return i + 1;
    }
  }
  return 0;
}

function snippet(src: string, line: number): string {
  if (!line) return "";
  const l = src.split("\n")[line - 1] ?? "";
  return l.trim().slice(0, 120);
}

// R1: AI app 主页必须用 AppShell
function checkR1AppShell(file: string, src: string): Violation[] {
  const norm = file.split(sep).join("/");
  const isMainPage =
    /\/frontend\/app\/(ai-[a-z-]+|library|explore|knowledge-graph|custom-agents|notifications|credits|me|profile|feedback|changelog)\/(page\.tsx|\[[^\]]+\]\/page\.tsx)$/.test(
      norm,
    );
  if (!isMainPage) return [];
  if (hasImport(src, "AppShell")) return [];

  return [
    {
      rule: "R1-AppShell-Required",
      file: relative(process.cwd(), file),
      line: findLine(src, /export\s+default/),
      snippet: snippet(src, findLine(src, /export\s+default/)),
    },
  ];
}

// R2: 列表 .map 渲染卡片必须用 AssetCard，不许自写 rounded-(xl|lg|2xl) + border
function checkR2AssetCard(file: string, src: string): Violation[] {
  // 检测自写卡片：className 含 rounded-(xl|lg|2xl) + border + bg-white 三件套
  const cardPattern =
    /className\s*=\s*[`"'][^`"']*\brounded-(xl|lg|2xl|3xl)\b[^`"']*\bborder\b[^`"']*\bbg-white\b[^`"']*[`"']/g;
  const matches = [...src.matchAll(cardPattern)];
  if (matches.length === 0) return [];

  // 如果已 import AssetCard，则只报"还有 N 处自写"作为提示，不阻断
  // 如果完全没 import AssetCard 且自写 ≥3 处 → 视为 R2 违规
  if (hasImport(src, "AssetCard")) return [];
  if (matches.length < 3) return []; // 单次自写可能是合理特殊容器

  const violations: Violation[] = [];
  for (const m of matches.slice(0, 5)) {
    const idx = m.index ?? 0;
    const line = src.slice(0, idx).split("\n").length;
    violations.push({
      rule: "R2-AssetCard-Required",
      file: relative(process.cwd(), file),
      line,
      snippet: snippet(src, line),
    });
  }
  return violations;
}

// R3: 含 list.length === 0 分支必须用 EmptyState
function checkR3EmptyState(file: string, src: string): Violation[] {
  const emptyBranch =
    /\b(\w+)\.length\s*===\s*0\b|\bisEmpty\b|\b!\s*\w+\?\.length\b|\b!\s*\w+\.length\b/;
  if (!emptyBranch.test(src)) return [];
  if (hasImport(src, "EmptyState")) return [];

  const line = findLine(src, emptyBranch);
  return [
    {
      rule: "R3-EmptyState-Required",
      file: relative(process.cwd(), file),
      line,
      snippet: snippet(src, line),
    },
  ];
}

// R4: 含 error 分支渲染必须用 ErrorState
function checkR4ErrorState(file: string, src: string): Violation[] {
  // 启发式：JSX 中包含 error 渲染分支
  const errorRender =
    /\{\s*error\s*&&|\bif\s*\(\s*error\s*\)|\berror\s*\?\s*\(/;
  if (!errorRender.test(src)) return [];
  if (hasImport(src, "ErrorState")) return [];
  // 进一步检查是否真的有 JSX 错误展示（avoid 误报 try-catch 中的 error）
  if (!/<\w+[^>]*\b(error|Error)\b/.test(src)) return [];

  const line = findLine(src, errorRender);
  return [
    {
      rule: "R4-ErrorState-Required",
      file: relative(process.cwd(), file),
      line,
      snippet: snippet(src, line),
    },
  ];
}

// R5: 含 isLoading skeleton 渲染必须用 LoadingState/LoadingSkeleton
function checkR5LoadingState(file: string, src: string): Violation[] {
  // 检测自写 animate-pulse skeleton
  const customSkeleton =
    /\banimate-pulse\b.*?\bbg-(gray|slate|neutral)-(100|200)\b/;
  if (!customSkeleton.test(src)) return [];
  if (hasImport(src, "LoadingState") || hasImport(src, "LoadingSkeleton"))
    return [];

  const line = findLine(src, customSkeleton);
  return [
    {
      rule: "R5-LoadingState-Required",
      file: relative(process.cwd(), file),
      line,
      snippet: snippet(src, line),
    },
  ];
}

// R6: 弹层必须用 MissionDialogShell/SideDrawer/Modal/ConfirmDialog
function checkR6Dialog(file: string, src: string): Violation[] {
  // 检测自写 dialog/modal/drawer：fixed inset-0 + z-* + backdrop
  const customDialog =
    /className\s*=\s*[`"'][^`"']*\bfixed\b[^`"']*\binset-0\b[^`"']*\bz-\d+/;
  if (!customDialog.test(src)) return [];
  const knownDialogs = [
    "MissionDialogShell",
    "SideDrawer",
    "Modal",
    "ConfirmDialog",
    "AdminDrawer",
    "AdminModal",
  ];
  if (knownDialogs.some((s) => hasImport(src, s))) return [];

  const line = findLine(src, customDialog);
  return [
    {
      rule: "R6-Dialog-Component-Required",
      file: relative(process.cwd(), file),
      line,
      snippet: snippet(src, line),
    },
  ];
}

async function main() {
  console.log("[audit:ui-discipline] 扫描 frontend/ 公共组件强制复用规则...");

  const files = await walkDir(FRONTEND_ROOT);
  console.log(`  扫描文件数：${files.length}`);

  const allViolations: Violation[] = [];
  for (const file of files) {
    let src: string;
    try {
      src = await readFile(file, "utf8");
    } catch {
      continue;
    }
    allViolations.push(...checkR1AppShell(file, src));
    allViolations.push(...checkR2AssetCard(file, src));
    allViolations.push(...checkR3EmptyState(file, src));
    allViolations.push(...checkR4ErrorState(file, src));
    allViolations.push(...checkR5LoadingState(file, src));
    allViolations.push(...checkR6Dialog(file, src));
  }

  // 按 rule 聚合
  const byRule = new Map<string, Violation[]>();
  for (const v of allViolations) {
    if (!byRule.has(v.rule)) byRule.set(v.rule, []);
    byRule.get(v.rule)!.push(v);
  }

  console.log("");
  console.log("── 违规汇总 ──");
  const summary: Record<string, number> = {};
  for (const [rule, list] of [...byRule.entries()].sort()) {
    summary[rule] = list.length;
    console.log(`  ${rule}: ${list.length}`);
  }
  console.log(`  TOTAL: ${allViolations.length}`);
  console.log("");

  // 打印前 N 条样本
  if (allViolations.length > 0) {
    console.log("── 样本（每规则最多 3 条）──");
    for (const [rule, list] of [...byRule.entries()].sort()) {
      console.log(`\n  [${rule}]`);
      for (const v of list.slice(0, 3)) {
        console.log(`    ${v.file}:${v.line}`);
        if (v.snippet) console.log(`      | ${v.snippet}`);
      }
    }
    console.log("");
  }

  // 基线对比
  let baseline: Record<string, number> | null = null;
  if (existsSync(BASELINE_PATH)) {
    try {
      baseline = JSON.parse(await readFile(BASELINE_PATH, "utf8")) as Record<
        string,
        number
      >;
    } catch {
      baseline = null;
    }
  }

  let regressions: string[] = [];
  if (baseline) {
    console.log("── 与基线对比 ──");
    for (const rule of Object.keys({ ...summary, ...baseline })) {
      const cur = summary[rule] ?? 0;
      const base = baseline[rule] ?? 0;
      const delta = cur - base;
      const tag = delta > 0 ? "↑" : delta < 0 ? "↓" : "·";
      console.log(
        `  ${tag} ${rule}: ${base} → ${cur} (${delta >= 0 ? "+" : ""}${delta})`,
      );
      if (delta > 0) regressions.push(`${rule}: ${base} → ${cur} (+${delta})`);
    }
    console.log("");
  } else {
    console.log(`(无基线文件 ${BASELINE_PATH}，本次为首次扫描)`);
    console.log("");
  }

  // 写出最新基线（仅在 --update-baseline 模式）
  if (ARGS.has("--update-baseline")) {
    await writeFile(
      BASELINE_PATH,
      JSON.stringify(summary, null, 2) + "\n",
      "utf8",
    );
    console.log(`✓ 基线已更新：${BASELINE_PATH}`);
  }

  if (STRICT && regressions.length > 0) {
    console.error("✗ UI discipline 回归（strict 模式）：");
    for (const r of regressions) console.error(`  ${r}`);
    process.exit(1);
  }

  console.log(STRICT ? "✓ 无回归" : "(warn-only 模式，未阻断)");
}

main().catch((err) => {
  console.error("audit-ui-discipline failed:", err);
  process.exit(2);
});
