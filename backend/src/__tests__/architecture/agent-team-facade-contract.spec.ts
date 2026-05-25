/**
 * Agent Team App — Harness Facade Contract Spec
 *
 * 2026-05-24 night (P22/Wave 4): agent team app (playground/social/radar)
 * mission/pipeline/** 文件**只能**通过 `@/modules/ai-harness/facade` 或
 * `@/modules/ai-engine/facade` 访问框架能力，禁止直接走 ai-harness 内部子路径
 * （teams/business-team/dispatcher/* 等）。
 *
 * 为什么不光靠 ESLint？
 *   - ESLint SECTION 10 已覆盖 ai-app/** 不得 import ai-harness 内部
 *   - 但 ESLint 不查动态 `import("...")` 和注释 escape，本 spec 用 regex
 *     抽所有 import 语句（含 dynamic + require）保底
 *   - 同时本 spec 是"contract 文档"：未来 reviewer 看 spec 就知道契约
 *
 * 例外：
 *   - 各 app 的 *.module.ts 装配 NestJS provider 可能装配具体 harness module
 *     class（facade re-export 类型不能装配） —— 排除
 *   - test 文件允许直接 mock 内部路径
 */

import * as fs from "fs";
import * as path from "path";

const APP_ROOT = path.resolve(__dirname, "../../modules/ai-app");
const AGENT_TEAM_APPS = ["agent-playground", "social", "radar"];

function listTsFiles(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (
        e.name === "__tests__" ||
        e.name === "node_modules" ||
        e.name === "dist"
      )
        continue;
      listTsFiles(full, acc);
    } else if (
      e.isFile() &&
      e.name.endsWith(".ts") &&
      !e.name.endsWith(".spec.ts") &&
      !e.name.endsWith(".test.ts") &&
      !e.name.endsWith(".d.ts") &&
      !e.name.endsWith(".module.ts")
    ) {
      acc.push(full);
    }
  }
  return acc;
}

function extractImportTargets(filePath: string): string[] {
  const raw = fs.readFileSync(filePath, "utf-8");
  const stripped = raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const re = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)["']([^"']+)["']/g;
  const targets: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(stripped)) !== null) {
    targets.push(m[1]);
  }
  return targets;
}

/**
 * 命中"ai-harness 内部 import"判定（穿透 facade）：
 *   - 路径里出现 `ai-harness/` 但不指向 `ai-harness/facade` 或 `*.module*`
 *   - 不在白名单（abstractions/index）
 */
function detectHarnessInternalImport(spec: string): string | null {
  const m = spec.match(/(?:@\/|\.\.?\/)*modules\/ai-harness\/([^"']+)/);
  if (!m) return null;
  const sub = m[1];
  if (
    sub === "facade" ||
    sub.startsWith("facade/") ||
    /\.module(\.ts)?$/.test(sub) ||
    sub.startsWith("abstractions/")
  ) {
    return null;
  }
  return sub;
}

function detectEngineInternalImport(spec: string): string | null {
  const m = spec.match(/(?:@\/|\.\.?\/)*modules\/ai-engine\/([^"']+)/);
  if (!m) return null;
  const sub = m[1];
  if (
    sub === "facade" ||
    sub.startsWith("facade/") ||
    /\.module(\.ts)?$/.test(sub) ||
    sub.startsWith("abstractions/")
  ) {
    return null;
  }
  return sub;
}

describe("Agent Team App — Harness Facade Contract", () => {
  describe.each(AGENT_TEAM_APPS)(
    "%s mission/pipeline/** 只走 ai-harness/facade",
    (app) => {
      const pipelineDir = path.join(APP_ROOT, app, "mission", "pipeline");
      const files = listTsFiles(pipelineDir);

      it("扫描到目标文件（不能 0 个，否则白验证）", () => {
        expect(files.length).toBeGreaterThan(0);
      });

      it("无 ai-harness 内部穿透 import", () => {
        const violations: string[] = [];
        for (const f of files) {
          for (const target of extractImportTargets(f)) {
            const sub = detectHarnessInternalImport(target);
            if (sub) {
              const rel = path.relative(APP_ROOT, f).replace(/\\/g, "/");
              violations.push(`${rel} → ai-harness/${sub}`);
            }
          }
        }
        expect(violations).toEqual([]);
      });

      it("无 ai-engine 内部穿透 import", () => {
        const violations: string[] = [];
        for (const f of files) {
          for (const target of extractImportTargets(f)) {
            const sub = detectEngineInternalImport(target);
            if (sub) {
              const rel = path.relative(APP_ROOT, f).replace(/\\/g, "/");
              violations.push(`${rel} → ai-engine/${sub}`);
            }
          }
        }
        expect(violations).toEqual([]);
      });
    },
  );

  describe.each(AGENT_TEAM_APPS)(
    "%s mission/lifecycle/** 只走 ai-harness/facade",
    (app) => {
      const lifecycleDir = path.join(APP_ROOT, app, "mission", "lifecycle");
      if (!fs.existsSync(lifecycleDir)) return;
      const files = listTsFiles(lifecycleDir);

      it("无 ai-harness / ai-engine 内部穿透 import", () => {
        const violations: string[] = [];
        for (const f of files) {
          for (const target of extractImportTargets(f)) {
            const sub =
              detectHarnessInternalImport(target) ??
              detectEngineInternalImport(target);
            if (sub) {
              const rel = path.relative(APP_ROOT, f).replace(/\\/g, "/");
              violations.push(`${rel} → ${target}`);
            }
          }
        }
        expect(violations).toEqual([]);
      });
    },
  );
});
