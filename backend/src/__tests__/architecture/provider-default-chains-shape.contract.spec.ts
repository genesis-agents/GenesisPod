/**
 * 阶段 0 contract / v3.1 文档 §0.5 §6.C / 演进策略说明
 *
 * 锁住 `StructuredOutputRouter.PROVIDER_DEFAULT_CHAINS` 现状 shape：
 *   - 当前在 structured-output-router.service.ts 内的 module-level const
 *     PROVIDER_DEFAULT_CHAINS 是 readonly array<{ match, chain }>
 *   - 长度、每条 entry 的字段（match + chain）、chain 内值是合法 Strategy
 *
 * 该常量是 module-private（未 export），无法直接 import；用 TypeScript Compiler
 * API 解析源文件 AST，从 VariableDeclaration 抓取 ArrayLiteralExpression 元素，
 * 校验每条 entry 形态。
 *
 * 演进策略：
 *   阶段 C 计划删除 PROVIDER_DEFAULT_CHAINS（推断逻辑下沉到 strategy 选择器 /
 *   model registry）。删除时本 spec 必须红 → 提醒 PR 同步删 spec / 同步迁移
 *   规则到新位置。在 C 阶段之前，任何无意修改这个常量也会让 spec 红。
 */

import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";

const SRC_ROOT = path.resolve(__dirname, "../..");

const ROUTER_FILE = path.join(
  SRC_ROOT,
  "modules/ai-engine/llm/structured-output/structured-output-router.service.ts",
);
const STRATEGY_FILE = path.join(
  SRC_ROOT,
  "modules/ai-engine/llm/structured-output/structured-output-strategy.types.ts",
);

/** 已知合法 Strategy（来自 structured-output-strategy.types.ts 的 STRUCTURED_OUTPUT_STRATEGIES）。 */
function readKnownStrategies(): Set<string> {
  const sf = ts.createSourceFile(
    STRATEGY_FILE,
    fs.readFileSync(STRATEGY_FILE, "utf-8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const out = new Set<string>();
  function visit(node: ts.Node): void {
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (
          ts.isIdentifier(decl.name) &&
          decl.name.text === "STRUCTURED_OUTPUT_STRATEGIES" &&
          decl.initializer
        ) {
          // initializer 形如 [...] as const；剥外层 AsExpression
          let init: ts.Node = decl.initializer;
          if (ts.isAsExpression(init)) init = init.expression;
          if (ts.isArrayLiteralExpression(init)) {
            for (const el of init.elements) {
              if (ts.isStringLiteral(el)) out.add(el.text);
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return out;
}

interface ProviderChainEntry {
  hasMatch: boolean;
  chain: string[];
}

/**
 * 从 router 源文件抓 `PROVIDER_DEFAULT_CHAINS` 常量的 ArrayLiteral，逐项解析
 * { match: ..., chain: [...] } 形态。chain 内的字符串字面量收回数组。
 */
function readProviderChains(): ProviderChainEntry[] | null {
  const sf = ts.createSourceFile(
    ROUTER_FILE,
    fs.readFileSync(ROUTER_FILE, "utf-8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  let entries: ProviderChainEntry[] | null = null;
  function visit(node: ts.Node): void {
    if (entries !== null) return;
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (
          ts.isIdentifier(decl.name) &&
          decl.name.text === "PROVIDER_DEFAULT_CHAINS" &&
          decl.initializer
        ) {
          let init: ts.Node = decl.initializer;
          if (ts.isAsExpression(init)) init = init.expression;
          if (!ts.isArrayLiteralExpression(init)) return;
          const collected: ProviderChainEntry[] = [];
          for (const el of init.elements) {
            if (!ts.isObjectLiteralExpression(el)) {
              collected.push({ hasMatch: false, chain: [] });
              continue;
            }
            let hasMatch = false;
            let chain: string[] = [];
            for (const prop of el.properties) {
              if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name))
                continue;
              if (prop.name.text === "match") {
                // 任何形式的函数都算 hasMatch（arrow / function expression）
                if (
                  ts.isArrowFunction(prop.initializer) ||
                  ts.isFunctionExpression(prop.initializer)
                ) {
                  hasMatch = true;
                }
              } else if (prop.name.text === "chain") {
                let chainInit: ts.Node = prop.initializer;
                if (ts.isAsExpression(chainInit))
                  chainInit = chainInit.expression;
                if (ts.isArrayLiteralExpression(chainInit)) {
                  chain = chainInit.elements
                    .filter((c): c is ts.StringLiteral => ts.isStringLiteral(c))
                    .map((c) => c.text);
                }
              }
            }
            collected.push({ hasMatch, chain });
          }
          entries = collected;
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return entries;
}

// 2026-05-23 baseline length（当前实现 17 条规则）。删除 / 新增 provider 规则
// 必须同步更新这里 + 阶段 C 拆除时同步删 spec。
const EXPECTED_ENTRY_COUNT = 17;

describe("Capability Contract · PROVIDER_DEFAULT_CHAINS shape baseline (v3.1 §6.C)", () => {
  it("structured-output-router.service.ts still declares the const PROVIDER_DEFAULT_CHAINS", () => {
    const entries = readProviderChains();
    expect(entries).not.toBeNull();
  });

  it("the const has the documented number of entries (baseline guard)", () => {
    const entries = readProviderChains()!;
    expect(entries.length).toBe(EXPECTED_ENTRY_COUNT);
  });

  it("every entry has both a `match` function and a non-empty `chain` array", () => {
    const entries = readProviderChains()!;
    const malformed: number[] = [];
    entries.forEach((e, idx) => {
      if (!e.hasMatch || e.chain.length === 0) malformed.push(idx);
    });
    expect(malformed).toEqual([]);
  });

  it("every chain entry value is a known StructuredOutputStrategy", () => {
    const known = readKnownStrategies();
    expect(known.size).toBeGreaterThan(0);
    const entries = readProviderChains()!;
    const unknown: string[] = [];
    for (const e of entries) {
      for (const s of e.chain) {
        if (!known.has(s)) unknown.push(s);
      }
    }
    expect(unknown).toEqual([]);
  });
});
