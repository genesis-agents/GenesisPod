/**
 * 阶段 0 contract / v3.1 文档 §0.5 §6.D6 / 演进策略说明
 *
 * 锁住"现状只有有限几处读 `.structuredOutputStrategy / .fallbackStrategies`"
 * 的不变量；同时锁住"5 个 supports_* bool 字段零业务读者"。
 *
 * 用 TypeScript Compiler API 扫所有 .ts 源文件的 PropertyAccessExpression：
 *   - PropertyAccessExpression(name == fieldName) → 真正的读取（不会误命中
 *     `{ fieldName: ... }` 这种 PropertyAssignment 的 Identifier key）
 *
 * **structuredOutputStrategy / fallbackStrategies 读者基线（运行时代码，
 *   非 .spec / .test 文件）**：
 *   - structured-output-router.service.ts ：架构合法读者（router 是唯一架构消费方）
 *   - ai-model-config.service.ts          ：buildModelConfig 把 raw Prisma row 字段
 *                                            映射到 AIModelConfig（纯转译）
 *   - llm-executor.ts                     ：把 AIModelConfig 上的两字段透传给
 *                                            router.resolveChain（不做决策）
 *   - admin.service.ts                    ：admin 写入路径，把请求 DTO 透传给
 *                                            prisma update（写流，非读决策）
 *
 * **supports_json_schema_strict / supports_json_schema / supports_tool_use /
 *   supports_json_mode / supports_gbnf_grammar 读者基线**：
 *   仅 ai-model-config.service.ts 的 buildModelConfig 做了 raw row → AIModelConfig
 *   字段映射（机械转译，无任何业务消费）。**这是 v3.1 §D6 决定删除这 5 个
 *   bool 字段的关键事实依据** —— 任何 PR 引入新读者必须重审 D6 计划。
 *
 * 演进策略：
 *   D6 阶段删除 5 个 supports_* bool 字段时本 spec 必须红 → 同步更新或删除。
 *   D 阶段把 fallback / strategy 读取下沉时 structured-output 部分也同步更新。
 */

import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";

const SRC_ROOT = path.resolve(__dirname, "../..");

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

/**
 * 收集文件中所有 PropertyAccessExpression 其 name == fieldName 的位置。
 * 关键：只收 PropertyAccessExpression（如 `cfg.structuredOutputStrategy`），
 * 不收 PropertyAssignment 的 name（如 `{ structuredOutputStrategy: ... }` 的 key）。
 */
function findPropertyAccessReads(
  filePath: string,
  fieldName: string,
): number[] {
  const sf = ts.createSourceFile(
    filePath,
    fs.readFileSync(filePath, "utf-8"),
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  );
  const lines: number[] = [];
  function visit(node: ts.Node): void {
    if (ts.isPropertyAccessExpression(node)) {
      if (node.name.text === fieldName) {
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        lines.push(line + 1);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return lines;
}

/** 扫遍 src 目录，返回所有读了 fieldName 的文件相对路径（去重）。 */
function filesReading(fieldName: string): string[] {
  const set = new Set<string>();
  for (const file of listTsFiles(SRC_ROOT)) {
    const reads = findPropertyAccessReads(file, fieldName);
    if (reads.length > 0) {
      set.add(path.relative(SRC_ROOT, file).replace(/\\/g, "/"));
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

describe("Capability Contract · structured-output field readers baseline (v3.1 §6.D6)", () => {
  const EXPECTED_STRATEGY_READERS = [
    "modules/ai-engine/llm/services/ai-model-config.service.ts",
    "modules/ai-engine/llm/structured-output/structured-output-router.service.ts",
    "modules/ai-harness/runner/executor/llm-executor.ts",
    "modules/open-api/admin/admin.service.ts",
  ];

  it("`.structuredOutputStrategy` is read only by the 4 documented files", () => {
    const actual = filesReading("structuredOutputStrategy");
    expect(actual).toEqual([...EXPECTED_STRATEGY_READERS].sort());
  });

  it("`.fallbackStrategies` is read only by the same 4 documented files", () => {
    // Note: ai-app/explore/.../ai-prompts.config.ts declares a `fallbackStrategies`
    // property on a UNRELATED prompt-best-practices config object; but it's an
    // assignment, not a PropertyAccessExpression read, so it doesn't appear here.
    const actual = filesReading("fallbackStrategies");
    // 排除非 AIModelConfig 命名空间下的同名 PropertyAccess（如 prompt 配置的
    // PromptBestPractices.fallbackStrategies）。当前业务侧用 PropertyAccess
    // 形式访问该名的，除以下 4 个 AIModelConfig 路径外，仅有 explore prompt
    // 配置文件常量读取，不会进入运行时业务决策。
    const allowedNonModelConfigReaders = [
      // 当前实际数据：业务侧 PropertyAccess 唯一同名读者
      // （prompt config 内部的 fallbackStrategies 字段，与 AIModelConfig 同名巧合）
    ];
    const expected = [
      ...EXPECTED_STRATEGY_READERS,
      ...allowedNonModelConfigReaders,
    ].sort();
    expect(actual).toEqual(expected);
  });

  // ★★★ D6 决议关键依据：5 个 supports_* bool 字段的读者仅限 ai-model-config.service.ts
  // 内 buildModelConfig 的 raw row → AIModelConfig 字段机械映射。**没有任何业务
  // 决策代码读这 5 个字段**。任何 PR 引入新读者必须重审 D6 删除计划。

  const SUPPORTS_BOOL_FIELDS = [
    "supportsJsonSchemaStrict",
    "supportsJsonSchema",
    "supportsToolUse",
    "supportsJsonMode",
    "supportsGbnfGrammar",
  ];

  it.each(SUPPORTS_BOOL_FIELDS)(
    "`.%s` has zero business runtime readers (only mechanical mapping + admin write API)",
    (field) => {
      const actual = filesReading(field);
      // 两个允许的"读者"都是机械透传，不是业务决策：
      //   - ai-model-config.service.ts：buildModelConfig 把 raw Prisma row 字段
      //     映射到 AIModelConfig（纯转译）
      //   - admin.service.ts：admin update API 把 DTO `data.supports*` 透传给
      //     prisma update（写流，不是业务读决策）
      // **没有任何 LLM 调用 / structured output 决策代码读这 5 个字段** —— D6 决议
      // 的关键事实依据。任何 PR 引入新读者必须重审 D6 删除计划。
      expect(actual).toEqual([
        "modules/ai-engine/llm/services/ai-model-config.service.ts",
        "modules/open-api/admin/admin.service.ts",
      ]);
    },
  );
});
