#!/usr/bin/env tsx
/**
 * UI Discipline Audit — 8 条结构强制规则
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
 *   R7  自写横向 tab 栏（setActiveTab / activeTab 条件样式）必须 import ui/tabs/Tabs
 *   R8  feature 代码禁止直写原生 <table>（交互用 common/tables/DataTable，展示用 ui/table）
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
  const allMatches = [...src.matchAll(cardPattern)];
  if (allMatches.length === 0) return [];
  if (hasImport(src, "AssetCard")) return [];

  // 仅计「列表 map 渲染的卡片」：card className 出现在某个 .map( 之后 ~600 字符内。
  // 排除设置卡 / 容器卡 / 统计卡等静态卡片（非 asset 列表）的假阳性。
  const matches = allMatches.filter((m) => {
    const idx = m.index ?? 0;
    return /\.map\s*\(/.test(src.slice(Math.max(0, idx - 600), idx));
  });
  if (matches.length < 3) return []; // 非列表 / 单次自写 = 合理特殊容器

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

// R3: 「空态被渲染为 JSX」时必须用 EmptyState
// 仅当 .length===0 / .length<1 / isEmpty / !x.length 紧接 JSX 渲染（&& ( / ? ( /
// && < / ? <）时计违规——排除 `if (x.length===0) return []`、`? null :` 等逻辑判断假阳性。
const EMPTY_RENDER =
  /(?:\.length\s*===\s*0|\.length\s*<\s*1|\bisEmpty\b|!\s*\w+\??\.length)\s*(?:&&|\?)\s*[(<]/;

// R3 已审批例外：length===0 渲染的是「富欢迎/对话起始页」（登录引导 / 功能介绍 /
// 建议问题按钮），非「空数据」空态——EmptyState 不适配，保留自写（标准 22 §3 留痕）。
const R3_WELCOME_OK = [
  "app/ai-ask/page.tsx", // 未登录欢迎页 + 功能 chips + 建议 prompts
  "app/library/knowledge-graph/page.tsx", // 对话起始 + 建议问题按钮
];

function checkR3EmptyState(file: string, src: string): Violation[] {
  if (!EMPTY_RENDER.test(src)) return [];
  if (hasImport(src, "EmptyState")) return [];
  const norm = file.split(sep).join("/");
  if (R3_WELCOME_OK.some((p) => norm.endsWith(p))) return [];

  const line = findLine(src, EMPTY_RENDER);
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

// R7: 自写横向 tab 栏必须用 ui/tabs/Tabs
// 检测「tab 按钮 render」——即 onClick 直接调用 tab setter 的可点击元素。
// 比旧版逐行 button 样式（border-b-2+px+font-medium 同行）更可靠（漏 bg/pill/跨行），
// 又比纯 `activeTab===` 状态信号更精准（排除只持有/消费状态、不渲染 bar 的
// state holder / consumer / 委托组件，如 ExploreContext / ExploreContent）。
const SELF_TAB =
  /onClick=\{[^}]*\b(?:setActiveTab|onTabChange|setTab|setActiveKey|setSelectedTab|handleTabChange|switchTab|changeTab|selectTab)\s*\(/;

// R7 已审批 bespoke 例外（2026-05-20，用户批准）：canonical Tabs 不适配的非标准 tab。
// 标准 22 §3 例外审批留痕——这些保留自写，不算违规。
const R7_BESPOKE_OK = [
  // 主导航：每 tab 品牌色 + 响应式隐藏 label + 布局入口，canonical underline/pill 不模型化
  "components/layout/ResponsiveNav.tsx",
  // 资源详情：图标方块工具栏（h-10 w-10 渐变 + 角标），非文本 tab 栏
  "app/explore/resource/[id]/page.tsx",
];

function checkR7Tabs(file: string, src: string): Violation[] {
  if (!SELF_TAB.test(src)) return [];
  // 已用 tab 组件的不算自写：canonical Tabs，或 admin 设计系统 AdminTabs
  // （AdminTabs→Tabs 属迷你设计系统统一，另册，不在 R7「自写」范畴）。
  if (hasImport(src, "Tabs") || hasImport(src, "AdminTabs")) return [];
  const norm = file.split(sep).join("/");
  if (R7_BESPOKE_OK.some((p) => norm.endsWith(p))) return [];

  const line = findLine(src, SELF_TAB);
  return [
    {
      rule: "R7-Tabs-Required",
      file: relative(process.cwd(), file),
      line,
      snippet: snippet(src, line),
    },
  ];
}

// R8: feature 代码禁止直写原生 <table>（标准 22 §2.4 两层模型）。
// 交互数据网格用 common/tables/DataTable，纯展示表用 ui/table 原语。
// canonical 实现自身（components/ui/ · components/common/ · components/admin/）
// 已被 EXCLUDE_PATTERNS 排除；用 DataTable/ui/table 的文件渲染 <DataTable>/<Table>
// 而非原生 <table>，故"在范围内仍出现原生 <table>"即违规。
function checkR8Table(file: string, src: string): Violation[] {
  const NATIVE_TABLE = /<table[\s/>]/;
  if (!NATIVE_TABLE.test(src)) return [];

  const line = findLine(src, NATIVE_TABLE);
  return [
    {
      rule: "R8-Table-Component-Required",
      file: relative(process.cwd(), file),
      line,
      snippet: snippet(src, line),
    },
  ];
}

// TODO(R9): ProgressBar 强制规则待补——需更精准的检测器避免误报
//   R9 进度条：`overflow-hidden rounded-full bg-gray-200` + width 填充需区分于头像/胶囊

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
    allViolations.push(...checkR7Tabs(file, src));
    allViolations.push(...checkR8Table(file, src));
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
