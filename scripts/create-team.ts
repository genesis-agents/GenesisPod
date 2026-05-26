#!/usr/bin/env tsx
/**
 * create-team — 基于 playground 全栈复制一个新 agent team app
 *
 * 用法:
 *   npm run create:team <team-name>
 *   tsx scripts/create-team.ts <team-name>
 *
 * 示例:
 *   npm run create:team market-research
 *   → 创建 backend/src/modules/ai-app/market-research/
 *   → 创建 frontend/{app,components,services}/market-research/
 *
 * 实现 (V0 最小骨架):
 *   1. 验证 team-name 合规 (kebab-case) 且目标路径不存在
 *   2. 复制 playground 全栈到新 team 路径
 *   3. 按 @blueprint:<kind> 标签分类:
 *      - boilerplate / framework-subclass / page / api / panel / ui-helper → 复制
 *      - legacy-derive → 跳过 (已下沉到后端)
 *      - canonical-shell → 跳过 (前端用 canonical 壳, 不需要复制)
 *   4. 全局占位符替换 (路径 + 内容):
 *      - Playground → <TeamName>
 *      - AgentPlayground → <TeamName>
 *      - agent-playground → <team-name>
 *      - agent_playground → <team_name>
 *      - PLAYGROUND_ → <TEAM_NAME>_
 *      - 文件名前缀 playground- → <team-name>-
 *   5. 输出后续手工步骤提示 (不自动改 app.module.ts / Prisma schema)
 *
 * V0 不做 (留待 V1+):
 *   - domain 文件 body 清空 (开发者手动按 @blueprint:section 标签处理)
 *   - section-start/section-end 区段内容删除
 *   - Prisma schema model rename
 *   - 自动注册到 app.module.ts
 *   - i18n key 替换
 *
 * 验证:
 *   生成后必须跑:
 *     - npx jest backend/src/__tests__/architecture/agent-team-layout.spec.ts
 *     - npx jest backend/src/__tests__/architecture/agent-team-blueprint-tags.spec.ts
 *     - cd backend && npm run type-check
 *     - npm run audit:blueprint-tags
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";

const PROJECT_ROOT = process.cwd();

interface CaseConverters {
  pascal: string;
  camel: string;
  kebab: string;
  snake: string;
  upperSnake: string;
}

function toCases(teamName: string): CaseConverters {
  // input: kebab-case (e.g. "market-research")
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

function validateTeamName(name: string): void {
  if (!/^[a-z][a-z0-9-]*[a-z0-9]$/.test(name)) {
    throw new Error(
      `Invalid team-name "${name}". Must be kebab-case (e.g. "my-team"): lowercase letters, digits, hyphens; start with letter; not end with hyphen.`,
    );
  }
  if (name.length < 3 || name.length > 40) {
    throw new Error(
      `Invalid team-name "${name}". Length must be 3-40 chars.`,
    );
  }
  if (name === "agent-playground" || name === "playground") {
    throw new Error(`team-name "${name}" reserved.`);
  }
}

interface CopyPlan {
  src: string; // absolute source path
  dst: string; // absolute destination path (with renamed dirs)
  label: string; // descriptive label
}

const FULL_STACK_COPY_PLAN = (teamName: string): CopyPlan[] => [
  {
    src: join(PROJECT_ROOT, "backend/src/modules/ai-app/agent-playground"),
    dst: join(PROJECT_ROOT, `backend/src/modules/ai-app/${teamName}`),
    label: "backend module",
  },
  {
    src: join(PROJECT_ROOT, "frontend/app/agent-playground"),
    dst: join(PROJECT_ROOT, `frontend/app/${teamName}`),
    label: "frontend app",
  },
  {
    src: join(PROJECT_ROOT, "frontend/components/agent-playground"),
    dst: join(PROJECT_ROOT, `frontend/components/${teamName}`),
    label: "frontend components",
  },
  {
    src: join(PROJECT_ROOT, "frontend/services/agent-playground"),
    dst: join(PROJECT_ROOT, `frontend/services/${teamName}`),
    label: "frontend services",
  },
];

interface FileVisit {
  abs: string;
  relFromCopyRoot: string;
}

function walkFiles(rootAbs: string, base = ""): FileVisit[] {
  const out: FileVisit[] = [];
  if (!existsSync(rootAbs)) return out;
  for (const name of readdirSync(rootAbs)) {
    if (name === "__tests__" || name === "node_modules") continue;
    const full = join(rootAbs, name);
    const rel = base ? `${base}/${name}` : name;
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walkFiles(full, rel));
    } else if (st.isFile()) {
      out.push({ abs: full, relFromCopyRoot: rel });
    }
  }
  return out;
}

function readBlueprintTag(content: string): string | null {
  const head = content.split("\n", 10);
  for (const line of head) {
    const m = line.match(/^\/\/\s*@blueprint:(\S+)/);
    if (m) return m[1];
  }
  return null;
}

const SKIP_KINDS = new Set(["legacy-derive", "canonical-shell"]);

function applyPlaceholderReplacements(
  content: string,
  cases: CaseConverters,
): string {
  // 长串先替换避免短串污染长串。
  // 不能用 \b: AgentPlaygroundModule 在 d 和 M 之间没有 word boundary (都是 alphanumeric).
  // 用 negative lookahead: 后面不能是同 case 的延续 (alphanumeric / underscore).
  return (
    content
      // PascalCase: AgentPlayground / Playground (含跟另一 PascalWord 拼接的场景)
      // 后面不能跟小写字母/数字 (防 AgentPlaygrounded → DemoTeamed 这种)
      .replace(/AgentPlayground(?![a-z0-9])/g, cases.pascal)
      .replace(/Playground(?![a-z0-9])/g, cases.pascal)
      // UPPER_SNAKE: AGENT_PLAYGROUND, PLAYGROUND_PREFIX 等
      .replace(/AGENT_PLAYGROUND(?![A-Z0-9])/g, cases.upperSnake)
      .replace(/PLAYGROUND_/g, `${cases.upperSnake}_`)
      .replace(/PLAYGROUND(?![A-Z0-9_])/g, cases.upperSnake)
      // camelCase 变量 / property: playgroundXxx (小写 p 开头, 后跟大写)
      // 需在 kebab-case 替换前处理, 否则 playgroundXxx 会被 kebab 正则部分吃掉
      .replace(/(?<![a-zA-Z0-9])playground(?=[A-Z])/g, cases.camel)
      // kebab-case 路径 / 文件名: agent-playground (后跟 - 是延续 token 的合法分隔)
      .replace(/agent-playground(?![a-zA-Z0-9])/g, cases.kebab)
      // snake_case (DB models): agent_playground (后跟 _ 是延续 token 的合法分隔)
      .replace(/agent_playground(?![a-zA-Z0-9])/g, cases.snake)
      // 单独的 playground (kebab 路径 / lowercase identifier / 字符串字面量)
      // 必须放最后,避免污染前面长串
      .replace(
        /(?<![a-zA-Z0-9])playground(?![a-zA-Z0-9])/g,
        cases.kebab,
      )
  );
}

function renameFilePath(rel: string, teamName: string): string {
  // 在路径段里替换 playground / agent-playground 前缀
  return rel
    .replace(/(^|\/)agent-playground(\/|-|\.|$)/g, `$1${teamName}$2`)
    .replace(/(^|\/)playground(\/|-|\.|$)/g, `$1${teamName}$2`);
}

interface PlanResult {
  copied: number;
  skipped: number;
  bytesWritten: number;
  skipDetail: Array<{ rel: string; kind: string }>;
}

function processCopyPlan(plan: CopyPlan, cases: CaseConverters): PlanResult {
  const files = walkFiles(plan.src);
  const result: PlanResult = {
    copied: 0,
    skipped: 0,
    bytesWritten: 0,
    skipDetail: [],
  };

  for (const { abs, relFromCopyRoot } of files) {
    const isTextFile = /\.(ts|tsx|md|json|sql|yaml|yml)$/.test(relFromCopyRoot);
    let content: string | null = null;
    if (isTextFile) {
      content = readFileSync(abs, "utf8");
      // 仅 .ts/.tsx 看 blueprint tag 来跳过 (markdown/json 都复制)
      if (relFromCopyRoot.endsWith(".ts") || relFromCopyRoot.endsWith(".tsx")) {
        const tag = readBlueprintTag(content);
        if (tag && SKIP_KINDS.has(tag)) {
          result.skipped += 1;
          result.skipDetail.push({ rel: relFromCopyRoot, kind: tag });
          continue;
        }
      }
      content = applyPlaceholderReplacements(content, cases);
    }

    const newRel = renameFilePath(relFromCopyRoot, cases.kebab);
    const dstAbs = join(plan.dst, newRel);
    mkdirSync(dirname(dstAbs), { recursive: true });
    if (content !== null) {
      writeFileSync(dstAbs, content, "utf8");
      result.bytesWritten += content.length;
    } else {
      cpSync(abs, dstAbs);
      result.bytesWritten += statSync(abs).size;
    }
    result.copied += 1;
  }

  return result;
}

function checkDstNotExist(plan: CopyPlan[]): void {
  for (const p of plan) {
    if (existsSync(p.dst)) {
      throw new Error(
        `Destination already exists: ${relative(PROJECT_ROOT, p.dst)}. Refusing to overwrite. Remove it first or choose a different team name.`,
      );
    }
  }
}

function printPostCreateInstructions(
  teamName: string,
  cases: CaseConverters,
): void {
  const cap = cases.pascal;
  console.log("\n=== Post-create manual steps (V0 CLI does NOT auto-do) ===");
  console.log("");
  console.log(`1. Register module in backend/src/app.module.ts:`);
  console.log(
    `   import { ${cap}Module } from './modules/ai-app/${teamName}/module/${teamName}.module';`,
  );
  console.log(`   imports: [..., ${cap}Module],`);
  console.log("");
  console.log(`2. Register frontend route in frontend/app/_layout (if needed)`);
  console.log("");
  console.log(`3. Prisma schema - duplicate model AgentPlaygroundMission:`);
  console.log(`   - Open backend/prisma/schema/models.prisma`);
  console.log(`   - Copy AgentPlaygroundMission → ${cap}Mission (rename fields)`);
  console.log(`   - Run: npx prisma generate`);
  console.log(`   - Create migration: backend/prisma/migrations/YYYYMMDD_create_${cases.snake}_missions/migration.sql`);
  console.log("");
  console.log(`4. Update spec lists:`);
  console.log(
    `   - backend/src/__tests__/architecture/agent-team-layout.spec.ts: add "${teamName}" to AGENT_TEAM_APPS`,
  );
  console.log(
    `   - backend/src/__tests__/architecture/mission-app-conformance.spec.ts: add ${cap}Module path to MISSION_APP_MODULES`,
  );
  console.log("");
  console.log(`5. Clean up domain (BLUEPRINT.md §3.3):`);
  console.log(`   - Open each // @blueprint:domain file, replace body with TODO`);
  console.log(`   - Remove content between // @blueprint:section-start domain ... section-end`);
  console.log("");
  console.log(`6. Fill domain in order (BLUEPRINT.md §2 Step 3):`);
  console.log(`   - runtime/${teamName}.config.ts (defineMissionPipeline steps/roles)`);
  console.log(`   - mission/agents/<role>/SKILL.md`);
  console.log(`   - mission/pipeline/stages/*.stage.ts`);
  console.log(`   - api/dto/run-mission.dto.ts`);
  console.log("");
  console.log(`7. Verify:`);
  console.log(`   cd backend && npm run type-check`);
  console.log(`   npx jest src/__tests__/architecture/`);
  console.log(`   npm run audit:blueprint-tags`);
  console.log("");
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.length !== 1) {
    console.error("Usage: npm run create:team <team-name>");
    console.error("       team-name must be kebab-case, 3-40 chars (e.g. market-research)");
    process.exit(2);
  }
  const teamName = args[0];

  try {
    validateTeamName(teamName);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(2);
  }
  const cases = toCases(teamName);

  const plan = FULL_STACK_COPY_PLAN(teamName);
  checkDstNotExist(plan);

  console.log(`\n=== Creating team: ${teamName} ===`);
  console.log(`  PascalCase  : ${cases.pascal}`);
  console.log(`  snake_case  : ${cases.snake}`);
  console.log(`  UPPER_SNAKE : ${cases.upperSnake}`);
  console.log("");

  const summary: Array<{ label: string; result: PlanResult }> = [];
  try {
    for (const p of plan) {
      console.log(`Copying ${p.label} ...`);
      console.log(`  ${relative(PROJECT_ROOT, p.src)} → ${relative(PROJECT_ROOT, p.dst)}`);
      const r = processCopyPlan(p, cases);
      summary.push({ label: p.label, result: r });
      console.log(
        `  copied=${r.copied}  skipped=${r.skipped}  bytes=${r.bytesWritten}`,
      );
    }
  } catch (err) {
    console.error("\nFailed during copy:", err);
    console.error("Rolling back destinations ...");
    for (const p of plan) {
      if (existsSync(p.dst)) {
        rmSync(p.dst, { recursive: true, force: true });
        console.error(`  removed ${relative(PROJECT_ROOT, p.dst)}`);
      }
    }
    process.exit(1);
  }

  console.log("\n=== Summary ===");
  let totalCopied = 0;
  let totalSkipped = 0;
  for (const s of summary) {
    console.log(
      `  ${s.label.padEnd(22)}: copied=${s.result.copied}, skipped=${s.result.skipped}`,
    );
    totalCopied += s.result.copied;
    totalSkipped += s.result.skipped;
  }
  console.log(`  TOTAL                : copied=${totalCopied}, skipped=${totalSkipped}`);

  if (totalSkipped > 0) {
    console.log("\nSkipped files (by @blueprint tag):");
    for (const s of summary) {
      for (const sk of s.result.skipDetail) {
        console.log(`  [${sk.kind}] ${sk.rel}`);
      }
    }
  }

  printPostCreateInstructions(teamName, cases);
}

main();
