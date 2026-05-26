#!/usr/bin/env node
/**
 * One-shot script: 给 backend/src/modules/ai-app/agent-playground/ 下所有 .ts
 * 文件加 // @blueprint:<kind> 文件头标签。
 *
 * Run: node scripts/_oneshot/add-blueprint-tags-playground.cjs
 * 跑完归档：mv 到 scripts/_archive/ 或删除。
 *
 * 分类规则（详 BLUEPRINT.md §3）：
 *   - boilerplate         : 仅 module/<team>.module.ts
 *   - framework-subclass  : extends *Framework  (含 mode=delegate 子分)
 *   - domain              : 其他全部
 *
 * 跳过：
 *   - *.spec.ts / __tests__/
 *   - index.ts (re-export barrel, 没业务意义)
 *   - 已有 @blueprint 标签的文件 (幂等)
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(
  __dirname,
  "../../backend/src/modules/ai-app/agent-playground",
);

// 文件路径模式 → tag（精确匹配优先；剩余兜底为 domain）
const BOILERPLATE_FILES = new Set(["module/agent-playground.module.ts"]);

// framework-subclass: extends 模式 (默认) / delegate 模式 (持有 framework 引用)
// 用文件内容里的 "extends.*Framework" 自动判定，不在表里硬编码
const FRAMEWORK_DELEGATE_FILES = new Set([
  // 手工标记 delegate 模式：MissionRuntimeShellService 持有 framework 引用而非 extends
  "mission/pipeline/mission-runtime-shell.service.ts",
]);

function listFiles(dir, base = "") {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (e.name === "__tests__" || e.name === "node_modules") continue;
      out.push(...listFiles(full, rel));
    } else if (e.isFile() && e.name.endsWith(".ts")) {
      if (e.name.endsWith(".spec.ts") || e.name.endsWith(".test.ts")) continue;
      if (e.name === "index.ts") continue;
      out.push({ abs: full, rel });
    }
  }
  return out;
}

function classify(rel, content) {
  if (BOILERPLATE_FILES.has(rel)) return { kind: "boilerplate", mode: null };
  if (/extends\s+\w*Framework\b|extends\s+\w*Framework</.test(content)) {
    return { kind: "framework-subclass", mode: null };
  }
  if (FRAMEWORK_DELEGATE_FILES.has(rel)) {
    return { kind: "framework-subclass", mode: "delegate" };
  }
  return { kind: "domain", mode: null };
}

function hasExistingTag(content) {
  return /\/\/\s*@blueprint:/m.test(content.slice(0, 500));
}

function insertTag(content, kind, mode) {
  const tagLine = mode
    ? `// @blueprint:${kind} mode=${mode}`
    : `// @blueprint:${kind}`;
  // 策略：放在 file header docblock 之前，作为最顶 1 行；如果 file 已经以
  // `/**` docblock 开头，插入到 docblock 上方一行；否则放最顶。
  if (/^\/\*\*/.test(content)) {
    return `${tagLine}\n${content}`;
  }
  if (/^\/\//.test(content)) {
    // 已有单行注释开头，仍放最顶
    return `${tagLine}\n${content}`;
  }
  return `${tagLine}\n${content}`;
}

function main() {
  const files = listFiles(ROOT);
  const stats = { boilerplate: 0, "framework-subclass": 0, domain: 0, skip: 0 };
  const detail = {
    boilerplate: [],
    "framework-subclass": [],
    "framework-delegate": [],
    domain: [],
  };

  for (const { abs, rel } of files) {
    const content = fs.readFileSync(abs, "utf8");
    if (hasExistingTag(content)) {
      stats.skip += 1;
      continue;
    }
    const { kind, mode } = classify(rel, content);
    const next = insertTag(content, kind, mode);
    fs.writeFileSync(abs, next, "utf8");
    stats[kind] += 1;
    if (mode === "delegate") {
      detail["framework-delegate"].push(rel);
    } else {
      detail[kind].push(rel);
    }
  }

  console.log("=== Blueprint tag insertion summary ===");
  console.log(`boilerplate         : ${stats.boilerplate}`);
  console.log(`framework-subclass  : ${stats["framework-subclass"]}`);
  console.log(`  (of which delegate): ${detail["framework-delegate"].length}`);
  console.log(`domain              : ${stats.domain}`);
  console.log(`skip (already tagged): ${stats.skip}`);
  console.log("");
  console.log("--- framework-subclass files ---");
  for (const f of detail["framework-subclass"]) console.log(`  ${f}`);
  console.log("--- framework-delegate files ---");
  for (const f of detail["framework-delegate"]) console.log(`  ${f}`);
  console.log("--- boilerplate files ---");
  for (const f of detail.boilerplate) console.log(`  ${f}`);
  console.log("--- domain files (first 20) ---");
  for (const f of detail.domain.slice(0, 20)) console.log(`  ${f}`);
  if (detail.domain.length > 20) {
    console.log(`  ... (${detail.domain.length - 20} more)`);
  }
}

main();
