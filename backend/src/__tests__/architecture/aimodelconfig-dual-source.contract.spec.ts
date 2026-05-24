/**
 * 阶段 0 contract / v3.1 文档 §0.5 / 演进策略说明
 *
 * 锁定"现状 AIModelConfig 双源"的不变量：
 *   - ai-engine/llm/services/ai-chat-model-config.service.ts 仍存在并 export
 *     interface AIModelConfig（旧/精简版 ~23 字段）
 *   - ai-engine/llm/services/ai-model-config.service.ts 同样 export interface
 *     AIModelConfig（完整版，是前者的字段超集，含 5 个 structured-output bool +
 *     structuredOutputStrategy / fallbackStrategies 共 7 个 §3.x 新字段）
 *
 * 用 TypeScript Compiler API 解析两份 interface，断言：
 *   (a) 两个文件都存在且都 export AIModelConfig
 *   (b) ai-model-config.service.ts 的字段集 ⊇ ai-chat-model-config.service.ts
 *
 * 演进策略：
 *   阶段 A0（双源合并）开始时，此 spec 必须同步更新或删除。任何在 A0 之前
 *   无意修改这两份 interface 字段集的 PR 会让本 spec 红，强制 reviewer 确认
 *   "是否真的要在 A0 之前动 contract"。
 */

import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";

const SRC_ROOT = path.resolve(__dirname, "../..");

const FILE_OLD = path.join(
  SRC_ROOT,
  "modules/ai-engine/llm/services/ai-chat-model-config.service.ts",
);
const FILE_NEW = path.join(
  SRC_ROOT,
  "modules/ai-engine/llm/services/ai-model-config.service.ts",
);

/**
 * 解析 TS 源文件，返回名为 `AIModelConfig` 的 exported interface 的属性名集合。
 * 找不到（不存在 / 未 export / 不是 interface）返回 null。
 */
function extractInterfaceFields(filePath: string): Set<string> | null {
  if (!fs.existsSync(filePath)) return null;
  const source = ts.createSourceFile(
    filePath,
    fs.readFileSync(filePath, "utf-8"),
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  );
  let result: Set<string> | null = null;
  source.forEachChild((node) => {
    if (!ts.isInterfaceDeclaration(node)) return;
    if (node.name.text !== "AIModelConfig") return;
    const isExported =
      node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ??
      false;
    if (!isExported) return;
    const fields = new Set<string>();
    for (const member of node.members) {
      if (ts.isPropertySignature(member) && ts.isIdentifier(member.name)) {
        fields.add(member.name.text);
      }
    }
    result = fields;
  });
  return result;
}

describe("Capability Contract · AIModelConfig dual-source baseline (v3.1 §0.5)", () => {
  it("ai-chat-model-config.service.ts still exists and exports interface AIModelConfig (legacy source)", () => {
    expect(fs.existsSync(FILE_OLD)).toBe(true);
    const fields = extractInterfaceFields(FILE_OLD);
    expect(fields).not.toBeNull();
    expect(fields!.size).toBeGreaterThan(0);
  });

  it("ai-model-config.service.ts still exists and exports interface AIModelConfig (canonical source)", () => {
    expect(fs.existsSync(FILE_NEW)).toBe(true);
    const fields = extractInterfaceFields(FILE_NEW);
    expect(fields).not.toBeNull();
    expect(fields!.size).toBeGreaterThan(0);
  });

  it("canonical AIModelConfig is a strict superset of legacy AIModelConfig (field set ⊇)", () => {
    const oldFields = extractInterfaceFields(FILE_OLD);
    const newFields = extractInterfaceFields(FILE_NEW);
    expect(oldFields).not.toBeNull();
    expect(newFields).not.toBeNull();
    const missingInNew = [...oldFields!].filter((f) => !newFields!.has(f));
    expect(missingInNew).toEqual([]);
  });

  it("canonical AIModelConfig still carries the v3.x structured-output extension fields (deletion gate for阶段 D6)", () => {
    // 这 7 个字段是双源差集（canonical 超集 - legacy）。D6 计划要删除 5 个 bool
    // 字段（supports_json_*）—— 删除时本断言必须同步更新。
    const newFields = extractInterfaceFields(FILE_NEW);
    expect(newFields).not.toBeNull();
    const v3xExtensionFields = [
      "structuredOutputStrategy",
      "fallbackStrategies",
      "supportsJsonSchemaStrict",
      "supportsJsonSchema",
      "supportsToolUse",
      "supportsJsonMode",
      "supportsGbnfGrammar",
    ];
    for (const f of v3xExtensionFields) {
      expect(newFields!.has(f)).toBe(true);
    }
  });
});
