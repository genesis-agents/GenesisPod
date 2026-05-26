/**
 * Agent Team App — Blueprint Tag Conformance Spec
 *
 * 2026-05-26 (ADR 009 / PR-A.5 / BLUEPRINT.md §8 维护协议):
 * playground 作为全栈 blueprint 复制源，每个 .ts 文件**必须**有且仅有一个
 * `// @blueprint:<kind>` 文件头标签。CLI 据此分类做不同变换。
 *
 * 看护规则：
 *   (A) playground 下的每个 .ts 文件（除 index.ts / *.spec.ts / __tests__/）
 *       必须在前 10 行内出现 `// @blueprint:<kind>` 标签
 *   (B) tag kind 必须命中白名单
 *   (C) framework-subclass 标签的文件必须实际 extends *Framework 或标 mode=delegate
 *   (D) boilerplate 标签限定文件白名单（避免误用）
 *
 * 三层看护对位：
 *   1. ESLint 不查（无统一 plugin 支持自定义注释标签）
 *   2. jest spec（本文件）—— 文件头标签必填 + kind 合规
 *   3. pre-push hook —— jest changedSince 自然覆盖本 spec
 *
 * 范围（PR-A.5 / Phase 2）：
 *   - 只看护 agent-playground/（活标杆）
 *   - social/radar 在 PR-F 同步迁移时纳入
 *
 * 设计参考：
 *   - BLUEPRINT.md §3 文件分类 / §8 自动看护
 *   - ADR 009 §2 三层元数据协议
 *   - standard 23 §8 CLI 流程
 */

import * as fs from "fs";
import * as path from "path";

const PLAYGROUND_ROOT = path.resolve(
  __dirname,
  "../../modules/ai-app/agent-playground",
);

/** Tag kind 白名单（与 BLUEPRINT.md §3 一致）。 */
const ALLOWED_TAG_KINDS = new Set([
  "boilerplate",
  "framework-subclass",
  "domain",
]);

/** boilerplate 标签限定文件白名单（防误用扩散）。 */
const BOILERPLATE_FILE_WHITELIST = new Set([
  "module/agent-playground.module.ts",
]);

/** 提取文件头 `// @blueprint:<kind>` 标签（含可选 mode=...）。 */
const TAG_REGEX = /^\/\/\s*@blueprint:(\S+)(?:\s+mode=(\S+))?\s*$/;

function listSourceFiles(dir: string, base = "", acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (e.name === "__tests__" || e.name === "node_modules") continue;
      listSourceFiles(full, rel, acc);
    } else if (e.isFile() && e.name.endsWith(".ts")) {
      if (e.name.endsWith(".spec.ts") || e.name.endsWith(".test.ts")) continue;
      if (e.name.endsWith(".d.ts")) continue;
      if (e.name === "index.ts") continue;
      acc.push(rel);
    }
  }
  return acc;
}

function readHeadLines(absPath: string, lines = 10): string[] {
  const content = fs.readFileSync(absPath, "utf8");
  return content.split("\n", lines);
}

function findBlueprintTag(
  absPath: string,
): { kind: string; mode: string | null } | null {
  const head = readHeadLines(absPath);
  for (const line of head) {
    const m = line.match(TAG_REGEX);
    if (m) {
      return { kind: m[1], mode: m[2] ?? null };
    }
  }
  return null;
}

function hasExtendsFramework(absPath: string): boolean {
  const content = fs.readFileSync(absPath, "utf8");
  // 匹配 `extends XxxFramework`（含泛型）；忽略 implements / inline 注释
  return /\bextends\s+\w*Framework\b/.test(content);
}

describe("Agent Team App Blueprint Tags — playground (ADR 009)", () => {
  const allFiles = listSourceFiles(PLAYGROUND_ROOT);

  it("playground 下至少有 1 个源文件被扫到（保底断言，目录变动早发现）", () => {
    expect(allFiles.length).toBeGreaterThan(50);
  });

  it.each(["boilerplate", "framework-subclass", "domain"])(
    "tag kind 白名单包含 %s",
    (kind) => {
      expect(ALLOWED_TAG_KINDS.has(kind)).toBe(true);
    },
  );

  describe("(A) 每个源文件必须有 @blueprint 标签（10 行内）", () => {
    it("所有文件都有 tag（穷举）", () => {
      const missing: string[] = [];
      for (const rel of allFiles) {
        const abs = path.join(PLAYGROUND_ROOT, rel);
        const tag = findBlueprintTag(abs);
        if (!tag) missing.push(rel);
      }
      expect(missing).toEqual([]);
    });
  });

  describe("(B) tag kind 必须命中白名单", () => {
    it("所有 tag kind 合规", () => {
      const offending: Array<{ file: string; kind: string }> = [];
      for (const rel of allFiles) {
        const abs = path.join(PLAYGROUND_ROOT, rel);
        const tag = findBlueprintTag(abs);
        if (tag && !ALLOWED_TAG_KINDS.has(tag.kind)) {
          offending.push({ file: rel, kind: tag.kind });
        }
      }
      expect(offending).toEqual([]);
    });
  });

  describe("(C) framework-subclass 必须 extends *Framework 或显式 mode=delegate", () => {
    it("framework-subclass 文件实际继承 framework", () => {
      const violations: string[] = [];
      for (const rel of allFiles) {
        const abs = path.join(PLAYGROUND_ROOT, rel);
        const tag = findBlueprintTag(abs);
        if (!tag || tag.kind !== "framework-subclass") continue;
        if (tag.mode === "delegate") continue; // delegate 模式合法
        if (!hasExtendsFramework(abs)) {
          violations.push(rel);
        }
      }
      expect(violations).toEqual([]);
    });
  });

  describe("(D) boilerplate 标签限定白名单（防误用扩散）", () => {
    it("只有 module/<team>.module.ts 允许标 boilerplate", () => {
      const violations: string[] = [];
      for (const rel of allFiles) {
        const abs = path.join(PLAYGROUND_ROOT, rel);
        const tag = findBlueprintTag(abs);
        if (tag && tag.kind === "boilerplate") {
          if (!BOILERPLATE_FILE_WHITELIST.has(rel)) {
            violations.push(rel);
          }
        }
      }
      expect(violations).toEqual([]);
    });

    it("boilerplate 白名单大小锁定（改动需同步 BLUEPRINT.md §3.1）", () => {
      expect(BOILERPLATE_FILE_WHITELIST.size).toBe(1);
    });
  });

  describe("(E) section 标签必须成对（start/end 数量一致）", () => {
    it("framework-subclass 文件内 section-start 和 section-end 数量一致", () => {
      const offending: Array<{ file: string; start: number; end: number }> = [];
      for (const rel of allFiles) {
        const abs = path.join(PLAYGROUND_ROOT, rel);
        const content = fs.readFileSync(abs, "utf8");
        const starts = (
          content.match(/\/\/\s*@blueprint:section-start\b/g) ?? []
        ).length;
        const ends = (content.match(/\/\/\s*@blueprint:section-end\b/g) ?? [])
          .length;
        if (starts !== ends) {
          offending.push({ file: rel, start: starts, end: ends });
        }
      }
      expect(offending).toEqual([]);
    });

    it("section-start 标签必须带 kind（domain / experimental / legacy 之一）", () => {
      const SECTION_KINDS = new Set(["domain", "experimental", "legacy"]);
      const offending: Array<{ file: string; line: string }> = [];
      for (const rel of allFiles) {
        const abs = path.join(PLAYGROUND_ROOT, rel);
        const content = fs.readFileSync(abs, "utf8");
        const matches = content.matchAll(
          /\/\/\s*@blueprint:section-start(?:\s+(\S+))?/g,
        );
        for (const m of matches) {
          const kind = m[1];
          if (!kind || !SECTION_KINDS.has(kind)) {
            offending.push({ file: rel, line: m[0] });
          }
        }
      }
      expect(offending).toEqual([]);
    });
  });

  describe("文件统计快照（防意外回退）", () => {
    it("playground 各 kind 数量在合理范围", () => {
      let boilerplate = 0;
      let frameworkSubclass = 0;
      let domain = 0;
      for (const rel of allFiles) {
        const abs = path.join(PLAYGROUND_ROOT, rel);
        const tag = findBlueprintTag(abs);
        if (!tag) continue;
        if (tag.kind === "boilerplate") boilerplate += 1;
        else if (tag.kind === "framework-subclass") frameworkSubclass += 1;
        else if (tag.kind === "domain") domain += 1;
      }
      // 数量软锁定：playground 持续演化，但分布不应剧烈偏移
      // PR-A.5 落地时基线：1 / 19 / 86
      expect(boilerplate).toBe(1);
      expect(frameworkSubclass).toBeGreaterThanOrEqual(15);
      expect(frameworkSubclass).toBeLessThanOrEqual(40);
      expect(domain).toBeGreaterThanOrEqual(50);
      expect(domain).toBeLessThanOrEqual(150);
    });
  });
});
