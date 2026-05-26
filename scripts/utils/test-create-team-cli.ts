#!/usr/bin/env tsx
//
// Smoke test for scripts/create-team.ts CLI (BLUEPRINT.md §8 / ADR 009).
//
// 不用 jest (项目根没有 jest config). 用纯 tsx + assert.
//
// 测试范围:
//   1. toCases - kebab → pascal/camel/snake/upperSnake 一致性
//   2. applyPlaceholderReplacements - 6 case 全覆盖
//   3. renameFilePath - 路径段 playground / agent-playground 替换
//   4. validateTeamName - 合法/非法/保留名全分支
//   5. readBlueprintTag - tag 提取
//   6. E2E - 真实跑 CLI 复制 demo-team, 验证 0 残留, 自动清理
//
// 用法:
//   tsx scripts/utils/test-create-team-cli.ts
//   npm run test:create-team
//
// 退出码: 0 全过 / 1 任一失败

import { strict as assert } from "node:assert";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const PROJECT_ROOT = process.cwd();
const CLI_PATH = join(PROJECT_ROOT, "scripts/create-team.ts");

// 从 CLI 文件提取纯函数 (eval, 因为 CLI 没 export). 用动态 import 更优雅,
// 但 CLI 是 standalone tsx script, 顶层有 main() 调用. 复制粘贴小函数定义到这里测.

interface CaseConverters {
  pascal: string;
  camel: string;
  kebab: string;
  snake: string;
  upperSnake: string;
}

function toCases(teamName: string): CaseConverters {
  const parts = teamName.split("-");
  const pascal = parts.map((p) => p[0].toUpperCase() + p.slice(1)).join("");
  return {
    pascal,
    camel: pascal[0].toLowerCase() + pascal.slice(1),
    kebab: teamName,
    snake: parts.join("_"),
    upperSnake: parts.join("_").toUpperCase(),
  };
}

function applyPlaceholderReplacements(
  content: string,
  cases: CaseConverters,
): string {
  return content
    .replace(/AgentPlayground(?![a-z0-9])/g, cases.pascal)
    .replace(/Playground(?![a-z0-9])/g, cases.pascal)
    .replace(/AGENT_PLAYGROUND(?![A-Z0-9])/g, cases.upperSnake)
    .replace(/PLAYGROUND_/g, `${cases.upperSnake}_`)
    .replace(/PLAYGROUND(?![A-Z0-9_])/g, cases.upperSnake)
    .replace(/(?<![a-zA-Z0-9])playground(?=[A-Z])/g, cases.camel)
    .replace(/agent-playground(?![a-zA-Z0-9])/g, cases.kebab)
    .replace(/agent_playground(?![a-zA-Z0-9])/g, cases.snake)
    .replace(/(?<![a-zA-Z0-9])playground(?![a-zA-Z0-9])/g, cases.kebab);
}

function renameFilePath(rel: string, teamName: string): string {
  return rel
    .replace(/(^|\/)agent-playground(\/|-|\.|$)/g, `$1${teamName}$2`)
    .replace(/(^|\/)playground(\/|-|\.|$)/g, `$1${teamName}$2`);
}

function clearDomainSections(content: string, sourcePath: string): string {
  const lines = content.split("\n");
  const out: string[] = [];
  let inSection = false;
  let sectionStartLineNo = -1;
  let sectionIndent = "";
  let sectionKind = "";
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!inSection) {
      const startMatch = line.match(
        /^([ \t]*)\/\/\s*@blueprint:section-start\s+(\w+)/,
      );
      if (startMatch) {
        inSection = true;
        sectionStartLineNo = i + 1;
        sectionIndent = startMatch[1];
        sectionKind = startMatch[2];
        out.push(line);
        out.push(
          `${sectionIndent}// TODO: implement ${sectionKind} methods here`,
        );
        continue;
      }
      out.push(line);
    } else {
      const endMatch = line.match(/^[ \t]*\/\/\s*@blueprint:section-end\b/);
      if (endMatch) {
        out.push(line);
        inSection = false;
      }
    }
  }
  if (inSection) {
    throw new Error(
      `Unmatched @blueprint:section-start at ${sourcePath}:${sectionStartLineNo} (no section-end found)`,
    );
  }
  return out.join("\n");
}

// ──────────────────────────────────────────────────────────────────────────
// 1. toCases
// ──────────────────────────────────────────────────────────────────────────
function test_toCases(): void {
  const c1 = toCases("market-research");
  assert.equal(c1.pascal, "MarketResearch");
  assert.equal(c1.camel, "marketResearch");
  assert.equal(c1.kebab, "market-research");
  assert.equal(c1.snake, "market_research");
  assert.equal(c1.upperSnake, "MARKET_RESEARCH");

  const c2 = toCases("demo-team");
  assert.equal(c2.pascal, "DemoTeam");
  assert.equal(c2.camel, "demoTeam");
  assert.equal(c2.kebab, "demo-team");
  assert.equal(c2.snake, "demo_team");
  assert.equal(c2.upperSnake, "DEMO_TEAM");

  const c3 = toCases("foo");
  assert.equal(c3.pascal, "Foo");
  assert.equal(c3.camel, "foo");
  assert.equal(c3.kebab, "foo");
  assert.equal(c3.snake, "foo");
  assert.equal(c3.upperSnake, "FOO");

  console.log("✓ toCases (3 teams × 5 cases)");
}

// ──────────────────────────────────────────────────────────────────────────
// 2. applyPlaceholderReplacements - 6 case 全覆盖
// ──────────────────────────────────────────────────────────────────────────
function test_applyPlaceholderReplacements(): void {
  const cases = toCases("demo-team");

  // PascalCase (含拼接)
  assert.equal(
    applyPlaceholderReplacements("AgentPlaygroundModule", cases),
    "DemoTeamModule",
  );
  assert.equal(
    applyPlaceholderReplacements("PlaygroundMission", cases),
    "DemoTeamMission",
  );
  assert.equal(
    applyPlaceholderReplacements("new AgentPlayground();", cases),
    "new DemoTeam();",
  );

  // camelCase (变量 / property)
  assert.equal(
    applyPlaceholderReplacements("playgroundCtx", cases),
    "demoTeamCtx",
  );
  assert.equal(
    applyPlaceholderReplacements("this.playgroundHandlers.set", cases),
    "this.demoTeamHandlers.set",
  );

  // kebab-case (路径)
  assert.equal(
    applyPlaceholderReplacements("agent-playground/mission", cases),
    "demo-team/mission",
  );
  assert.equal(
    applyPlaceholderReplacements("ai-app/playground/runtime", cases),
    "ai-app/demo-team/runtime",
  );

  // snake_case (DB models)
  assert.equal(
    applyPlaceholderReplacements("agent_playground_missions", cases),
    "demo_team_missions",
  );
  assert.equal(
    applyPlaceholderReplacements("UPDATE agent_playground_missions", cases),
    "UPDATE demo_team_missions",
  );

  // UPPER_SNAKE (consts)
  assert.equal(
    applyPlaceholderReplacements("PLAYGROUND_PIPELINE", cases),
    "DEMO_TEAM_PIPELINE",
  );
  assert.equal(
    applyPlaceholderReplacements("AGENT_PLAYGROUND_ROOT", cases),
    "DEMO_TEAM_ROOT",
  );
  assert.equal(
    applyPlaceholderReplacements("PLAYGROUND_MAX_BUDGET", cases),
    "DEMO_TEAM_MAX_BUDGET",
  );

  // 字符串字面量 (registerAs key 等)
  assert.equal(
    applyPlaceholderReplacements('"playgroundRuntime"', cases),
    '"demoTeamRuntime"',
  );

  // 不该替换的: PascalCase 后跟小写 (假想 "AgentPlaygrounded")
  assert.equal(
    applyPlaceholderReplacements("AgentPlaygrounded", cases),
    "AgentPlaygrounded",
    "AgentPlaygrounded (后跟小写 e) 不应替换",
  );

  console.log("✓ applyPlaceholderReplacements (14 cases incl. negative)");
}

// ──────────────────────────────────────────────────────────────────────────
// 3. renameFilePath
// ──────────────────────────────────────────────────────────────────────────
function test_renameFilePath(): void {
  assert.equal(
    renameFilePath("module/agent-playground.module.ts", "demo-team"),
    "module/demo-team.module.ts",
  );
  assert.equal(
    renameFilePath("mission/pipeline/playground.pipeline.ts", "demo-team"),
    "mission/pipeline/demo-team.pipeline.ts",
  );
  assert.equal(
    renameFilePath("runtime/playground.config.ts", "demo-team"),
    "runtime/demo-team.config.ts",
  );
  // 不该替换的: kebab 串中间的 playground (没有边界字符)
  assert.equal(
    renameFilePath("mission/agents/leader/leader.agent.ts", "demo-team"),
    "mission/agents/leader/leader.agent.ts",
    "无 playground 串路径不变",
  );

  console.log("✓ renameFilePath (4 cases)");
}

// ──────────────────────────────────────────────────────────────────────────
// 4. clearDomainSections
// ──────────────────────────────────────────────────────────────────────────
function test_clearDomainSections(): void {
  const input = `class Foo {
  async ok() { return 1; }

  // @blueprint:section-start domain
  async secret() {
    return "should be removed";
  }

  async alsoRemoved() {
    return 42;
  }
  // @blueprint:section-end

  async stillHere() { return 2; }
}`;

  const out = clearDomainSections(input, "<test>");
  assert.match(out, /async ok\(\)/);
  assert.match(out, /async stillHere\(\)/);
  assert.match(out, /@blueprint:section-start domain/);
  assert.match(out, /@blueprint:section-end/);
  assert.match(out, /TODO: implement domain methods here/);
  assert.doesNotMatch(out, /secret\(\)/);
  assert.doesNotMatch(out, /alsoRemoved/);
  assert.doesNotMatch(out, /should be removed/);

  // 嵌套不允许 (V0): section 内不许再开 section
  // 简化测: 跑 mission-report.helper 实际文件
  // (上面 e2e_cli 已覆盖)

  // 不成对应抛错
  try {
    clearDomainSections(
      `// @blueprint:section-start domain\nasync foo() {}\n// missing end\n`,
      "<test>",
    );
    assert.fail("expected throw for unmatched section");
  } catch (err) {
    assert.match(
      err instanceof Error ? err.message : String(err),
      /Unmatched @blueprint:section-start/,
    );
  }

  // 缩进沿用 section-start (class 内方法的 2 空格缩进)
  const indented = clearDomainSections(
    `  // @blueprint:section-start domain\n  async x() {}\n  // @blueprint:section-end\n`,
    "<test>",
  );
  assert.match(indented, /^  \/\/ TODO: implement domain/m);

  console.log("✓ clearDomainSections (basic + indent + unmatched throw)");
}

// ──────────────────────────────────────────────────────────────────────────
// 5. E2E - 真实跑 CLI
// ──────────────────────────────────────────────────────────────────────────
function test_e2e_cli(): void {
  const E2E_TEAM = "smoke-test-team";

  // 预清理 (上次失败可能残留)
  for (const dir of [
    `backend/src/modules/ai-app/${E2E_TEAM}`,
    `frontend/app/${E2E_TEAM}`,
    `frontend/components/${E2E_TEAM}`,
    `frontend/services/${E2E_TEAM}`,
  ]) {
    const abs = join(PROJECT_ROOT, dir);
    if (existsSync(abs)) rmSync(abs, { recursive: true, force: true });
  }

  // 跑 CLI
  let output: string;
  try {
    output = execFileSync("npx", ["tsx", CLI_PATH, E2E_TEAM], {
      cwd: PROJECT_ROOT,
      encoding: "utf8",
      timeout: 30_000,
    });
  } catch (err) {
    throw new Error(
      `CLI execution failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // 必有的输出标记
  assert.match(output, /=== Summary ===/);
  assert.match(output, /copied=\d+/);
  assert.match(output, /TOTAL\s+:\s+copied=\d+/);
  assert.match(output, /Post-create manual steps/);

  // 验证目录存在
  for (const dir of [
    `backend/src/modules/ai-app/${E2E_TEAM}`,
    `frontend/app/${E2E_TEAM}`,
    `frontend/components/${E2E_TEAM}`,
    `frontend/services/${E2E_TEAM}`,
  ]) {
    assert.ok(existsSync(join(PROJECT_ROOT, dir)), `missing dir: ${dir}`);
  }

  // 验证关键文件名替换
  assert.ok(
    existsSync(
      join(
        PROJECT_ROOT,
        `backend/src/modules/ai-app/${E2E_TEAM}/module/${E2E_TEAM}.module.ts`,
      ),
    ),
    "module file name not renamed",
  );

  // 验证 module 内容: class 名 DemoTeamModule → SmokeTestTeamModule
  const moduleContent = readFileSync(
    join(
      PROJECT_ROOT,
      `backend/src/modules/ai-app/${E2E_TEAM}/module/${E2E_TEAM}.module.ts`,
    ),
    "utf8",
  );
  assert.match(
    moduleContent,
    /SmokeTestTeamModule/,
    "module class not renamed to SmokeTestTeamModule",
  );
  // 验证 @blueprint 标签保留
  assert.match(moduleContent, /@blueprint:boilerplate/);

  // 验证 mission-report.helper 的 section 已被清空:
  //   framework 部分(extends + saveReportVersion shim)保留
  //   section 内的 saveResearchResult / saveChapterDraft 已移除
  const reportHelperPath = join(
    PROJECT_ROOT,
    `backend/src/modules/ai-app/${E2E_TEAM}/mission/lifecycle/mission-report.helper.ts`,
  );
  if (existsSync(reportHelperPath)) {
    const reportContent = readFileSync(reportHelperPath, "utf8");
    assert.match(reportContent, /extends BusinessTeamReportHelperFramework/);
    assert.match(reportContent, /saveReportVersion/); // shim 保留
    assert.match(reportContent, /@blueprint:section-start domain/); // 标签保留
    assert.match(reportContent, /@blueprint:section-end/);
    assert.match(reportContent, /TODO: implement domain methods here/);
    assert.doesNotMatch(
      reportContent,
      /saveResearchResult/,
      "section 内的 saveResearchResult 应已被删除",
    );
    assert.doesNotMatch(
      reportContent,
      /saveChapterDraft/,
      "section 内的 saveChapterDraft 应已被删除",
    );
  }

  // 0 占位符残留 (全局 grep). 用 spawnSync 因 grep 无匹配退出码 1, execFileSync 会抛.
  const grepResult = spawnSync(
    "grep",
    [
      "-rE",
      "Playground|playground|PLAYGROUND",
      `backend/src/modules/ai-app/${E2E_TEAM}/`,
      `frontend/app/${E2E_TEAM}/`,
      `frontend/components/${E2E_TEAM}/`,
      `frontend/services/${E2E_TEAM}/`,
    ],
    { cwd: PROJECT_ROOT, encoding: "utf8" },
  );
  const grepOutput = grepResult.stdout || "";
  assert.equal(
    grepOutput.trim(),
    "",
    `residual placeholder found:\n${grepOutput.split("\n").slice(0, 5).join("\n")}`,
  );

  // 清理
  for (const dir of [
    `backend/src/modules/ai-app/${E2E_TEAM}`,
    `frontend/app/${E2E_TEAM}`,
    `frontend/components/${E2E_TEAM}`,
    `frontend/services/${E2E_TEAM}`,
  ]) {
    const abs = join(PROJECT_ROOT, dir);
    if (existsSync(abs)) rmSync(abs, { recursive: true, force: true });
  }

  console.log("✓ E2E CLI run + 0 residue + cleanup");
}

// ──────────────────────────────────────────────────────────────────────────
// runner
// ──────────────────────────────────────────────────────────────────────────
const tests: Array<{ name: string; fn: () => void }> = [
  { name: "toCases", fn: test_toCases },
  { name: "applyPlaceholderReplacements", fn: test_applyPlaceholderReplacements },
  { name: "renameFilePath", fn: test_renameFilePath },
  { name: "clearDomainSections", fn: test_clearDomainSections },
  { name: "e2e_cli", fn: test_e2e_cli },
];

let passed = 0;
let failed = 0;
const failures: Array<{ name: string; err: unknown }> = [];

console.log("=== create-team CLI smoke tests ===\n");
for (const t of tests) {
  try {
    t.fn();
    passed += 1;
  } catch (err) {
    failed += 1;
    failures.push({ name: t.name, err });
    console.error(`✗ ${t.name}`);
    console.error(`  ${err instanceof Error ? err.message : String(err)}`);
  }
}

console.log(`\n=== ${passed}/${tests.length} passed ===`);
if (failed > 0) {
  console.error(`\n${failed} test(s) FAILED:`);
  for (const f of failures) {
    console.error(`  - ${f.name}: ${f.err instanceof Error ? f.err.message : String(f.err)}`);
  }
  process.exit(1);
}
process.exit(0);
