#!/usr/bin/env tsx
/**
 * Hardcoded-Chinese Audit (i18n ratchet) — 2026-06-15
 *
 * 背景：全系统 ~715 个前端文件把中文 UI 文案硬编码进 JSX，绕过 i18n（t()），
 * 英文模式下不翻译。pre-push 原 i18n 检查只查占位符语法，不查硬编码中文 ——
 * 缺口既无人拦截也无人度量。
 *
 * 本脚本 = 「不劣化棘轮」护栏（对齐 audit-ui-discipline 的基线机制）：
 *   - 度量：每个 .tsx/.jsx 文件「去掉注释 + logger/console 行」后剩余的中文串数量
 *     （[一-鿿]+ 连续中文段计 1 处，≈ 一条待翻译文案）。
 *   - 基线：docs/_archive/i18n-hardcoded-baseline.json 冻结当前每文件计数。
 *   - 门禁（默认模式）：任一文件 cur > base（或新文件 cur>0 且不在基线）即 exit 1。
 *     存量被冻结、只能减不能增；新文件必须从一开始就用 t()（base=0）。
 *   - --update-baseline：把基线全量重写为当前（迁移一批后跑一次锁定新低点）。
 *
 * 注：度量是「按文件计数的代理指标」，刻意排除注释 / logger / console（开发面向，
 * 不需 i18n）。它不区分「JSX 文本 vs 逻辑里的中文字面量」——作为棘轮足够：目标是
 * 「不新增、逐步清零」，不是逐串精确判定。
 *
 * 用法：
 *   npm run audit:i18n-hardcoded              # 门禁：超基线即拒
 *   npm run audit:i18n-hardcoded:baseline     # 重写基线
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { existsSync } from "node:fs";

const FRONTEND_ROOT = join(process.cwd(), "frontend");
const SCAN_DIRS = ["components", "app"];
const ARGS = new Set(process.argv.slice(2));
const UPDATE = ARGS.has("--update-baseline");
const BASELINE_PATH = (() => {
  const idx = process.argv.indexOf("--baseline");
  return idx > 0
    ? process.argv[idx + 1]
    : "docs/_archive/i18n-hardcoded-baseline.json";
})();

const EXCLUDE_PATTERNS = [
  "node_modules",
  ".next",
  "__tests__",
  ".test.",
  ".spec.",
  ".stories.",
];

function shouldSkip(file: string): boolean {
  const norm = file.split(sep).join("/");
  return EXCLUDE_PATTERNS.some((p) => norm.includes(p));
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries: Awaited<ReturnType<typeof readdir>>;
  try {
    entries = await readdir(dir, { withFileTypes: true, recursive: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (!e.isFile()) continue;
    if (!/\.(tsx|jsx)$/.test(e.name)) continue;
    const full = join(e.parentPath ?? dir, e.name);
    if (shouldSkip(full)) continue;
    out.push(full);
  }
  return out;
}

const CJK_RUN = /[一-鿿]+/g;

/**
 * 去掉「不需要 i18n」的中文来源：块注释、行注释、logger/console 调用行。
 * 剩余里的中文连续段计数 ≈ 待翻译 UI 文案数。
 */
function countHardcodedCjk(src: string): number {
  // 1. 删块注释
  let s = src.replace(/\/\*[\s\S]*?\*\//g, "");
  // 2. 逐行：丢掉 logger./console. 行，去掉行尾 // 注释
  s = s
    .split("\n")
    .filter((l) => !/\b(?:logger|console)\s*\./.test(l))
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
  const m = s.match(CJK_RUN);
  return m ? m.length : 0;
}

async function main() {
  console.log("[audit:i18n-hardcoded] 扫描前端硬编码中文（i18n 棘轮）...");

  const files: string[] = [];
  for (const d of SCAN_DIRS) files.push(...(await walk(join(FRONTEND_ROOT, d))));

  const counts: Record<string, number> = {};
  let total = 0;
  for (const file of files) {
    let src = "";
    try {
      src = await readFile(file, "utf8");
    } catch {
      continue;
    }
    const n = countHardcodedCjk(src);
    if (n > 0) {
      counts[relative(process.cwd(), file).split(sep).join("/")] = n;
      total += n;
    }
  }

  const dirtyFiles = Object.keys(counts).length;
  console.log(`  扫描 ${files.length} 文件；含硬编码中文 ${dirtyFiles} 文件，共 ${total} 处`);

  // 读基线
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

  if (UPDATE) {
    const next = { __total__: total, ...counts };
    await writeFile(BASELINE_PATH, JSON.stringify(next, null, 2) + "\n", "utf8");
    console.log(`✓ 基线已全量重写：${BASELINE_PATH}（${dirtyFiles} 文件 / ${total} 处）`);
    return;
  }

  if (!baseline) {
    console.log(`(无基线文件 ${BASELINE_PATH}；先跑 npm run audit:i18n-hardcoded:baseline 建立基线)`);
    return;
  }

  // 门禁：任一文件 cur > base（新文件 base 视为 0）即劣化
  const regressions: string[] = [];
  for (const [file, cur] of Object.entries(counts)) {
    const base = baseline[file] ?? 0;
    if (cur > base) regressions.push(`  ↑ ${file}: ${base} → ${cur} (+${cur - base})`);
  }

  const baseTotal = baseline.__total__ ?? 0;
  const delta = total - baseTotal;
  console.log(`  基线总量 ${baseTotal} → 当前 ${total}（${delta >= 0 ? "+" : ""}${delta}）`);

  if (regressions.length > 0) {
    console.error("");
    console.error("✗ 硬编码中文劣化（i18n 棘轮：存量冻结、新增必须走 t()）：");
    for (const r of regressions) console.error(r);
    console.error("");
    console.error("  修法：用 useTranslation() 的 t('key') 替换硬编码中文（键加到 en.json+zh.json）。");
    console.error("  迁移一批后跑 npm run audit:i18n-hardcoded:baseline 锁定新低点。");
    process.exit(1);
  }

  console.log(`✓ i18n 棘轮通过（无文件超过基线；存量 ${dirtyFiles} 文件待逐步清零）`);
}

main().catch((err) => {
  console.error("audit-hardcoded-chinese failed:", err);
  process.exit(2);
});
