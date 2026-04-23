/**
 * CLI 入口 — `npm run test:golden`
 *
 * 用法：
 *   npm run test:golden                       # 默认 self-test 模式
 *   npm run test:golden -- --mode=harness     # 跑真 pipeline（pipeline 没 ready 前是 stub）
 *   npm run test:golden -- --only=macro-*     # 只跑匹配的 tag
 *   GOLDEN_JUDGE_ENABLED=1 npm run test:golden
 */

import * as path from "path";
import { runGolden, summarize } from "./runner";
import type { RunnerOptions } from "./types";

function parseArgs(argv: string[]): Partial<RunnerOptions> {
  const out: Partial<RunnerOptions> = {};
  for (const arg of argv) {
    if (arg.startsWith("--mode=")) {
      const v = arg.slice("--mode=".length);
      if (v === "self-test" || v === "harness") out.mode = v;
    } else if (arg.startsWith("--only=")) {
      out.only = arg
        .slice("--only=".length)
        .split(",")
        .map((s) => s.trim());
    } else if (arg.startsWith("--fixtures=")) {
      out.fixturesDir = path.resolve(arg.slice("--fixtures=".length));
    } else if (arg.startsWith("--out=")) {
      out.outDir = path.resolve(arg.slice("--out=".length));
    }
  }
  return out;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const parsed = parseArgs(argv);

  const cwd = process.cwd();
  const isBackendCwd = path.basename(cwd) === "backend";

  const fixturesDir =
    parsed.fixturesDir ??
    (isBackendCwd
      ? path.resolve(cwd, "fixtures/golden")
      : path.resolve(cwd, "backend/fixtures/golden"));
  const outDir =
    parsed.outDir ??
    (isBackendCwd
      ? path.resolve(cwd, "fixtures/golden-reports")
      : path.resolve(cwd, "backend/fixtures/golden-reports"));

  const options: RunnerOptions = {
    fixturesDir,
    outDir,
    mode: parsed.mode ?? "self-test",
    only: parsed.only,
    judgeEnabled: process.env.GOLDEN_JUDGE_ENABLED === "1",
  };

  console.log(
    `[golden-runner] mode=${options.mode} judge=${options.judgeEnabled} fixtures=${fixturesDir}`,
  );

  const report = await runGolden(options);
  console.log(summarize(report));

  if (report.failed > 0) {
    console.error(`\n[golden-runner] ${report.failed} tag(s) FAILED`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[golden-runner] unexpected error:", err);
  process.exit(1);
});
