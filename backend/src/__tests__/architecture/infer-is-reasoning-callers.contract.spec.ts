/**
 * 阶段 0 contract / v3.1 文档 §0.5 §6.D / 演进策略说明
 *
 * 锁住 `inferIsReasoning` 共享纯函数（ai-engine/llm/types/model.utils.ts）
 * 在 backend/src/ 下的真实调用方清单。
 *
 * 调用方定义：**直接调用** `inferIsReasoning(...)` 标识符（非 `this.inferIsReasoning`
 * 等同名方法）—— 这是从 model.utils 导入的纯函数的真实使用点。
 *
 * 用 TypeScript Compiler API 扫每个 .ts 源文件的 CallExpression：
 *   - 表达式为单一 Identifier `inferIsReasoning`（排除 PropertyAccess `this.x`）
 *   - 收集 (相对路径, 行号) 元组
 *   - 与 EXPECTED_CALLERS 基线比对，必须完全一致
 *
 * 演进策略：
 *   阶段 D（P1 fallback 化、能力推断收口）会改变这个清单。任何 PR 增/减
 *   调用方 → 本 spec 红 → 强制 PR 同步更新 EXPECTED_CALLERS（reviewer 可见
 *   能力推断使用面的全部变更点）。
 */

import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";

const SRC_ROOT = path.resolve(__dirname, "../..");

/**
 * 2026-05-23 baseline（按 `<src 相对路径>:<行号>` 写入；运行 spec 时若违例会
 * 打印实际 vs 期望 diff，按需更新这里 + 在 PR 描述里解释变更）。
 *
 * Spec / 测试文件本身不计入（只盯运行时业务代码）。
 */
const EXPECTED_CALLERS: ReadonlyArray<string> = [
  "modules/ai-engine/llm/services/ai-chat-model-config.service.ts:91",
  "modules/ai-engine/llm/services/ai-chat-model-config.service.ts:212",
  "modules/ai-engine/llm/services/ai-connection-test.service.ts:75",
  "modules/ai-engine/llm/services/ai-model-config.service.ts:246",
  "modules/ai-engine/llm/services/ai-model-config.service.ts:606",
  "modules/ai-engine/llm/services/ai-model-config.service.ts:612",
  "modules/ai-harness/tracing/observability/ai-observability.service.ts:258",
  "modules/ai-app/topic-insights/services/dimension/section-writer.service.ts:368",
  "modules/ai-app/topic-insights/services/dimension/section-writer.service.ts:888",
  "modules/open-api/admin/admin.service.ts:447",
];

function listTsFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name === "__tests__" ||
        entry.name === "node_modules" ||
        entry.name === "dist" ||
        entry.name === "coverage"
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

interface CallSite {
  file: string;
  line: number;
}

/**
 * 收集一个源文件中所有 `inferIsReasoning(...)` 形态的调用：
 *   - CallExpression 的表达式是单纯 Identifier 'inferIsReasoning'
 *   - 排除 `this.inferIsReasoning(...)` / `obj.inferIsReasoning(...)`（同名 method）
 */
function findSharedFunctionCalls(filePath: string): number[] {
  const text = fs.readFileSync(filePath, "utf-8");
  const sf = ts.createSourceFile(
    filePath,
    text,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  );
  const lines: number[] = [];
  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      if (ts.isIdentifier(expr) && expr.text === "inferIsReasoning") {
        const { line } = sf.getLineAndCharacterOfPosition(expr.getStart(sf));
        lines.push(line + 1); // ts 是 0-based，外部表达用 1-based
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return lines;
}

describe("Capability Contract · inferIsReasoning callers baseline (v3.1 §6.D)", () => {
  it("model.utils.ts continues to export inferIsReasoning (shared canonical implementation)", () => {
    const utilsFile = path.join(
      SRC_ROOT,
      "modules/ai-engine/llm/types/model.utils.ts",
    );
    expect(fs.existsSync(utilsFile)).toBe(true);
    const src = fs.readFileSync(utilsFile, "utf-8");
    expect(src).toMatch(/export\s+function\s+inferIsReasoning\s*\(/);
  });

  it("the set of direct `inferIsReasoning(...)` call sites matches the documented baseline", () => {
    const actual: CallSite[] = [];
    for (const file of listTsFiles(SRC_ROOT)) {
      const lines = findSharedFunctionCalls(file);
      if (lines.length === 0) continue;
      const rel = path.relative(SRC_ROOT, file).replace(/\\/g, "/");
      for (const line of lines) actual.push({ file: rel, line });
    }
    const actualSorted = actual
      .map((c) => `${c.file}:${c.line}`)
      .sort((a, b) => a.localeCompare(b));
    const expectedSorted = [...EXPECTED_CALLERS].sort((a, b) =>
      a.localeCompare(b),
    );
    expect(actualSorted).toEqual(expectedSorted);
  });
});
