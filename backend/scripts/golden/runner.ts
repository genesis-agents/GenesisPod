/**
 * Golden runner — 核心逻辑
 *
 * 对每个 baseline tag：
 * 1. 加载 baseline fixture
 * 2. 根据 mode 生成 candidate（self-test 直接 = baseline；harness 调真 pipeline — 当前桩）
 * 3. 结构对比 → StructureDiff[]
 * 4. 可选 LLM judge
 * 5. 聚合成 TagResult，最后汇总 GoldenReport 写盘
 */

import * as fs from "fs";
import * as path from "path";
import { judge } from "./judge";
import { listBaselineTags, loadBaselineFixture } from "./fixture-loader";
import { compareStructure, isPass } from "./structure-validator";
import type {
  CandidateFixture,
  GoldenReport,
  RunnerOptions,
  TagResult,
} from "./types";

/**
 * 真实 pipeline 入口（Tier Core 落地后填充）
 *
 * 当前实现为**桩**：直接返回 baseline 作为 candidate，
 * 使 self-test 模式在无 harness 的情况下也能跑通全流程。
 */
async function runHarnessPipeline(
  baseline: ReturnType<typeof loadBaselineFixture>,
): Promise<{ candidate: CandidateFixture; executed: boolean }> {
  // TODO(Tier Core): 调 Topic Insights 新 pipeline 跑 mission，
  // 再从 BaselineRecorder 写出的 fixtures 读 candidate。
  // 现在没落地，返回 baseline 的浅拷贝代替。
  return { candidate: { ...baseline }, executed: false };
}

function matchesOnly(tag: string, only?: string[]): boolean {
  if (!only || only.length === 0) return true;
  return only.some((pattern) => {
    if (pattern === tag) return true;
    if (pattern.endsWith("*")) return tag.startsWith(pattern.slice(0, -1));
    return false;
  });
}

export async function runGolden(options: RunnerOptions): Promise<GoldenReport> {
  const allTags = listBaselineTags(options.fixturesDir);
  const tags = allTags.filter((t) => matchesOnly(t, options.only));

  if (tags.length === 0) {
    console.warn(
      `[golden-runner] no baseline tags found at ${options.fixturesDir}`,
    );
  }

  const tagResults: TagResult[] = [];

  for (const tag of tags) {
    const baseline = loadBaselineFixture(options.fixturesDir, tag);

    let candidate: CandidateFixture;
    let harnessExecuted = false;

    if (options.mode === "self-test") {
      // self-test：candidate === baseline，验证 runner / structure-validator 自身
      candidate = { ...baseline };
    } else {
      // harness 模式：调真 pipeline（目前桩）
      const res = await runHarnessPipeline(baseline);
      candidate = res.candidate;
      harnessExecuted = res.executed;
    }

    const structureDiffs = compareStructure(baseline, candidate);

    const judgeResult = await judge(baseline, candidate.finalReportMd, {
      enabled: options.judgeEnabled,
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: "claude-opus-4-7",
    });

    const passed = isPass(structureDiffs);
    tagResults.push({
      baselineTag: tag,
      structureDiffs,
      passed,
      judge: judgeResult,
      harnessExecuted,
      candidate,
    });
  }

  const passed = tagResults.filter((t) => t.passed).length;
  const failed = tagResults.length - passed;
  const warnedOnly = tagResults.filter(
    (t) => t.passed && t.structureDiffs.some((d) => d.severity === "warn"),
  ).length;

  const report: GoldenReport = {
    runAt: new Date().toISOString(),
    mode: options.mode,
    totalTags: tagResults.length,
    passed,
    failed,
    warnedOnly,
    tagResults,
  };

  fs.mkdirSync(options.outDir, { recursive: true });
  const outFile = path.join(
    options.outDir,
    `golden-report-${options.mode}-${Date.now()}.json`,
  );
  // 删除 candidate 字段，避免写盘体积爆炸（它只为运行期对比用）
  const slim = {
    ...report,
    tagResults: report.tagResults.map((t) => ({
      ...t,
      candidate: undefined,
    })),
  };
  fs.writeFileSync(outFile, JSON.stringify(slim, null, 2), "utf8");

  return report;
}

export function summarize(report: GoldenReport): string {
  const lines: string[] = [];
  lines.push(`Golden report · mode=${report.mode} @ ${report.runAt}`);
  lines.push(
    `tags=${report.totalTags}  PASS=${report.passed}  FAIL=${report.failed}  warn-only=${report.warnedOnly}`,
  );
  for (const t of report.tagResults) {
    const fails = t.structureDiffs.filter((d) => d.severity === "fail").length;
    const warns = t.structureDiffs.filter((d) => d.severity === "warn").length;
    const status = t.passed ? "PASS" : "FAIL";
    const judgeInfo = t.judge.enabled
      ? ` judge=${t.judge.totalScore ?? "?"}/100`
      : " judge=skip";
    lines.push(
      `  [${status}] ${t.baselineTag}  fails=${fails} warns=${warns}${judgeInfo}`,
    );
    for (const d of t.structureDiffs) {
      if (d.severity !== "ok") {
        lines.push(
          `    - ${d.severity.toUpperCase()} ${d.field}: ${d.message}`,
        );
      }
    }
  }
  return lines.join("\n");
}
