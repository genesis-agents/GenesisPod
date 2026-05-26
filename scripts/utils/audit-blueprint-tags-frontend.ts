#!/usr/bin/env tsx
//
// Frontend Blueprint Tags Audit (BLUEPRINT.md §9 / ADR 009 维护协议)
//
// 扫描前端 playground 相关目录，确保每个源文件有且仅有一个 // @blueprint:<kind>
// 文件头标签。这是 CLI 复制 playground 时的必备元数据。
//
// 看护规则：
//   (A) 每个源文件（除 index.ts / *.spec.ts / __tests__/）必须在前 10 行内有
//       // @blueprint:<kind> 标签
//   (B) tag kind 必须命中前端白名单：page / api / panel / ui-helper / legacy-derive
//   (C) legacy-derive 标签限定路径（frontend/lib/features/agent-playground/）
//
// 范围：
//   - frontend/app/agent-playground/
//   - frontend/components/agent-playground/
//   - frontend/services/agent-playground/
//   - frontend/lib/features/agent-playground/
//
// 用法：
//   tsx scripts/utils/audit-blueprint-tags-frontend.ts
//
// 集成：
//   - package.json scripts: audit:blueprint-tags
//   - pre-push 可挂（与现有 audit:ui-discipline 同级）

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const PROJECT_ROOT = process.cwd();
const SCAN_ROOTS = [
  "frontend/app/agent-playground",
  "frontend/components/agent-playground",
  "frontend/services/agent-playground",
  "frontend/lib/features/agent-playground",
];

const ALLOWED_KINDS = new Set([
  "page",
  "api",
  "panel",
  "ui-helper",
  "legacy-derive",
]);

const LEGACY_DERIVE_ALLOWED_PATH_PREFIX = "frontend/lib/features/agent-playground/";

const TAG_REGEX = /^\/\/\s*@blueprint:(\S+)(?:\s+mode=(\S+))?\s*$/;

interface FileEntry {
  abs: string;
  rel: string;
}

function listSourceFiles(absDir: string, relBase: string, acc: FileEntry[]): void {
  let entries: ReturnType<typeof readdirSync>;
  try {
    entries = readdirSync(absDir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name === "__tests__" || name === "node_modules") continue;
    if (name === "index.ts" || name === "index.tsx") continue;
    if (name.endsWith(".spec.ts") || name.endsWith(".test.ts")) continue;
    if (name.endsWith(".spec.tsx") || name.endsWith(".test.tsx")) continue;
    const full = join(absDir, name);
    const rel = relBase ? `${relBase}/${name}` : name;
    const st = statSync(full);
    if (st.isDirectory()) {
      listSourceFiles(full, rel, acc);
    } else if (st.isFile() && (name.endsWith(".ts") || name.endsWith(".tsx"))) {
      acc.push({ abs: full, rel });
    }
  }
}

function findTag(abs: string): { kind: string; mode: string | null } | null {
  const content = readFileSync(abs, "utf8");
  const head = content.split("\n", 10);
  for (const line of head) {
    const m = line.match(TAG_REGEX);
    if (m) return { kind: m[1], mode: m[2] ?? null };
  }
  return null;
}

interface Violation {
  rel: string;
  reason: string;
}

function main(): void {
  const all: FileEntry[] = [];
  for (const sub of SCAN_ROOTS) {
    const abs = join(PROJECT_ROOT, sub);
    listSourceFiles(abs, sub, all);
  }

  const violations: Violation[] = [];
  const stats: Record<string, number> = {
    page: 0,
    api: 0,
    panel: 0,
    "ui-helper": 0,
    "legacy-derive": 0,
  };

  for (const { abs, rel } of all) {
    const tag = findTag(abs);
    if (!tag) {
      violations.push({ rel, reason: "missing @blueprint tag (file head)" });
      continue;
    }
    if (!ALLOWED_KINDS.has(tag.kind)) {
      violations.push({
        rel,
        reason: `invalid kind "${tag.kind}" (allowed: ${[...ALLOWED_KINDS].join("/")})`,
      });
      continue;
    }
    if (
      tag.kind === "legacy-derive" &&
      !rel.startsWith(LEGACY_DERIVE_ALLOWED_PATH_PREFIX)
    ) {
      violations.push({
        rel,
        reason: `legacy-derive only allowed under ${LEGACY_DERIVE_ALLOWED_PATH_PREFIX}`,
      });
      continue;
    }
    stats[tag.kind] = (stats[tag.kind] ?? 0) + 1;
  }

  console.log("=== Frontend Blueprint Tags Audit ===");
  console.log(`scanned: ${all.length} files`);
  for (const k of Object.keys(stats)) {
    console.log(`  ${k.padEnd(16)}: ${stats[k]}`);
  }

  if (violations.length === 0) {
    console.log("\nOK — all frontend playground files have valid @blueprint tags.");
    process.exit(0);
  }

  console.error(`\nFAIL — ${violations.length} violations:`);
  for (const v of violations) {
    console.error(`  ${v.rel}: ${v.reason}`);
  }
  process.exit(1);
}

main();
