/**
 * capability-singleton.spec.ts — 能力单一权威实现守护（MECE 原则：一能力一家）
 *
 * 锁定 2026-06-03 MECE 整改成果：curated 清单内的 canonical 概念，其权威定义
 * 必须恰好 1 处且落在预期归属目录。防止收敛后被复制/漂移回去（如凭证再散回
 * ai-engine、QualityGateService 再现三份）。
 *
 * 重要：这**不是**"全局同名唯一"——项目有 60+ 处合法同名（per-module DTO /
 * agent / per-app 服务），强制全局唯一会大量误报。本 spec 只锁本清单的高价值概念。
 * 新增需收敛的概念时往 SINGLETONS 加一行。
 */
import * as fs from "fs";
import * as path from "path";

const PROJECT_ROOT = path.join(__dirname, "..", "..", "..", "..");
const SRC = path.join(PROJECT_ROOT, "src");

function walk(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "dist") continue;
      walk(p, acc);
    } else if (
      e.name.endsWith(".ts") &&
      !e.name.endsWith(".spec.ts") &&
      !e.name.endsWith(".test.ts") &&
      !p.includes(`${path.sep}__tests__${path.sep}`)
    ) {
      acc.push(p);
    }
  }
  return acc;
}

const ALL_FILES = walk(SRC);
const relForward = (p: string) => path.relative(SRC, p).replace(/\\/g, "/");

/** canonical 概念 → (kind, 期望归属目录前缀 forward-slash) */
const SINGLETONS: ReadonlyArray<{
  kind: "class" | "interface";
  name: string;
  dir: string;
}> = [
  // 凭证全栈收敛 L1（PR #233/#234）
  {
    kind: "class",
    name: "KeyResolverService",
    dir: "modules/platform/credentials/",
  },
  {
    kind: "class",
    name: "KeyExecutorService",
    dir: "modules/platform/credentials/",
  },
  {
    kind: "class",
    name: "ToolKeyResolverService",
    dir: "modules/platform/credentials/",
  },
  // 质量门同名消歧（PR #239）：裸 QualityGateService 只在 engine
  {
    kind: "class",
    name: "QualityGateService",
    dir: "modules/ai-engine/evaluation/",
  },
  // 对象存储编排去 R2 名（PR #240）
  {
    kind: "class",
    name: "ObjectStorageService",
    dir: "modules/platform/storage/",
  },
  // mission 协作服务上迁 harness（PR #236）
  {
    kind: "class",
    name: "MissionStateManager",
    dir: "modules/ai-harness/teams/collaboration/context/",
  },
  {
    kind: "class",
    name: "MissionContextService",
    dir: "modules/ai-harness/teams/collaboration/context/",
  },
  {
    kind: "class",
    name: "MissionInputService",
    dir: "modules/ai-harness/teams/collaboration/context/",
  },
  // token-bucket 基元下沉 L1（PR #230）
  {
    kind: "interface",
    name: "ITokenBucketStore",
    dir: "modules/platform/resilience/",
  },
];

describe("capability singleton — 一能力一家（curated 清单）", () => {
  const defs = new Map<string, string[]>();
  for (const f of ALL_FILES) {
    const src = fs.readFileSync(f, "utf8");
    for (const { kind, name } of SINGLETONS) {
      if (new RegExp(`export\\s+${kind}\\s+${name}\\b`).test(src)) {
        defs.set(name, [...(defs.get(name) ?? []), relForward(f)]);
      }
    }
  }

  it.each(SINGLETONS)("$name：恰好 1 处权威定义且在 $dir", ({ name, dir }) => {
    const files = defs.get(name) ?? [];
    // 恰好 1 处权威定义（0 = 漂移/改名未同步；>1 = 被复制回散开）
    expect(files).toHaveLength(1);
    expect(files[0].startsWith(dir)).toBe(true);
  });

  it("ai-engine/credentials 目录已不存在（凭证已收敛 platform/credentials）", () => {
    expect(fs.existsSync(path.join(SRC, "modules/ai-engine/credentials"))).toBe(
      false,
    );
  });
});
