#!/usr/bin/env node
/**
 * One-shot: 给前端 playground 相关文件加 // @blueprint:<kind> 文件头标签。
 * 已归档：跑过一次即可，留作审计。
 *
 * Kind 白名单（前端，ADR 009 / BLUEPRINT.md §3）：
 *   - page                  路由层 (frontend/app/agent-playground/*)
 *   - api                   REST 调用封装 (frontend/services/agent-playground/*)
 *   - panel                 team-specific UI 组件 (components/agent-playground/*)
 *   - ui-helper             纯展示 helper (ui/* + lib/features/*formatters/stage-id-mapping/friendly-error)
 *   - legacy-derive         待下沉到后端的业务推导 (lib/features 下 derive / synthesize / ledger 等)
 *
 * CLI 复制行为（PR-B 实现时）：
 *   - page → 改名复制 + 替换 endpoint path
 *   - api → 同上
 *   - panel → 改名复制；body 清空保留壳（"TODO: render team-specific content"）
 *   - ui-helper → 改名复制（保留实现，纯展示无业务）
 *   - legacy-derive → **不复制**（已下沉到后端）
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");

// 显式分类（按路径前缀 / 文件名匹配）
const RULES = [
  { match: /^frontend\/app\/agent-playground\//, kind: "page" },
  { match: /^frontend\/services\/agent-playground\//, kind: "api" },
  // legacy-derive 优先于 ui-helper（先匹配特定文件名）
  {
    match:
      /^frontend\/lib\/features\/agent-playground\/(derive|drawer-derive|synthesize-artifact|todo-ledger)\.ts$/,
    kind: "legacy-derive",
  },
  {
    match:
      /^frontend\/lib\/features\/agent-playground\/(formatters|stage-id-mapping|friendly-error\.util|report-artifact\.types)\.ts$/,
    kind: "ui-helper",
  },
  {
    match: /^frontend\/components\/agent-playground\/ui\//,
    kind: "ui-helper",
  },
  {
    match: /^frontend\/components\/agent-playground\/.+\.(ts|tsx)$/,
    kind: "panel",
  },
];

function listFiles(absRoot, base = "") {
  const out = [];
  if (!fs.existsSync(absRoot)) return out;
  for (const e of fs.readdirSync(absRoot, { withFileTypes: true })) {
    const full = path.join(absRoot, e.name);
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (e.name === "__tests__" || e.name === "node_modules") continue;
      out.push(...listFiles(full, rel));
    } else if (e.isFile() && (e.name.endsWith(".ts") || e.name.endsWith(".tsx"))) {
      if (e.name.endsWith(".spec.ts") || e.name.endsWith(".test.ts")) continue;
      if (e.name === "index.ts" || e.name === "index.tsx") continue;
      out.push({ abs: full, rel });
    }
  }
  return out;
}

function classify(rel) {
  for (const r of RULES) {
    if (r.match.test(rel)) return r.kind;
  }
  return null;
}

function hasExistingTag(content) {
  return /\/\/\s*@blueprint:/m.test(content.slice(0, 500));
}

function insertTag(content, kind) {
  return `// @blueprint:${kind}\n${content}`;
}

function main() {
  const all = [];
  for (const sub of [
    "frontend/app/agent-playground",
    "frontend/components/agent-playground",
    "frontend/services/agent-playground",
    "frontend/lib/features/agent-playground",
  ]) {
    all.push(...listFiles(path.join(ROOT, sub), sub));
  }

  const stats = { page: 0, api: 0, panel: 0, "ui-helper": 0, "legacy-derive": 0, skip: 0, unclassified: 0 };
  const detail = { page: [], api: [], panel: [], "ui-helper": [], "legacy-derive": [], unclassified: [] };

  for (const { abs, rel } of all) {
    const content = fs.readFileSync(abs, "utf8");
    if (hasExistingTag(content)) {
      stats.skip += 1;
      continue;
    }
    const kind = classify(rel);
    if (!kind) {
      stats.unclassified += 1;
      detail.unclassified.push(rel);
      continue;
    }
    fs.writeFileSync(abs, insertTag(content, kind), "utf8");
    stats[kind] += 1;
    detail[kind].push(rel);
  }

  console.log("=== Frontend blueprint tag insertion summary ===");
  for (const k of ["page", "api", "panel", "ui-helper", "legacy-derive"]) {
    console.log(`${k.padEnd(18)}: ${stats[k]}`);
  }
  console.log(`skip (already tagged): ${stats.skip}`);
  console.log(`unclassified         : ${stats.unclassified}`);
  for (const k of ["page", "api", "panel", "ui-helper", "legacy-derive"]) {
    if (detail[k].length === 0) continue;
    console.log(`\n--- ${k} ---`);
    for (const f of detail[k]) console.log(`  ${f}`);
  }
  if (detail.unclassified.length > 0) {
    console.log(`\n!!! UNCLASSIFIED (need manual review):`);
    for (const f of detail.unclassified) console.log(`  ${f}`);
  }
}

main();
