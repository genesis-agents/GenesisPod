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
 * Harness pipeline 入口（Tier Core Group E 骨架接入）
 *
 * 当前实现：调用 harness 的 8-stage pipeline（stub 模式），
 * 把产物（synthesis fullMarkdown / executiveSummary / highlights）
 * 包装为 CandidateFixture，供结构对比使用。
 *
 * Full-fidelity 接入（真 LLM + 真 DB + 真 WebSocket 事件）放 Enhancement / Advanced Tier。
 */
async function runHarnessPipeline(
  baseline: ReturnType<typeof loadBaselineFixture>,
): Promise<{ candidate: CandidateFixture; executed: boolean }> {
  // 延迟 import 避免 CLI 启动时构造整个 Nest DI
  const { PipelineOrchestratorService, StageRegistry, buildIdentityContext } =
    await import("../../src/modules/ai-app/topic-insights/harness/pipeline/index");
  const {
    HarnessAgentRegistry,
    LeaderPlannerAgent,
    SectionWriterAgent,
    SectionReviewerAgent,
    MetaExtractorAgent,
    QualityReviewerAgent,
    SynthesizerAgent,
  } =
    await import("../../src/modules/ai-app/topic-insights/harness/agents/index");
  const {
    InitStage,
    PlanStage,
    ResearchStage,
    WriteStage,
    ReviewStage,
    IntegrateStage,
    SynthStage,
    AssemblyStage,
    StubPlanContextProvider,
  } =
    await import("../../src/modules/ai-app/topic-insights/harness/stages/index");

  const agentRegistry = new HarnessAgentRegistry();
  agentRegistry.register(new LeaderPlannerAgent());
  agentRegistry.register(new SectionWriterAgent());
  agentRegistry.register(new SectionReviewerAgent());
  agentRegistry.register(new MetaExtractorAgent());
  agentRegistry.register(new QualityReviewerAgent());
  agentRegistry.register(new SynthesizerAgent());

  const stageRegistry = new StageRegistry();
  stageRegistry.register(new InitStage());
  stageRegistry.register(
    new PlanStage(agentRegistry, new StubPlanContextProvider()),
  );
  stageRegistry.register(new ResearchStage());
  stageRegistry.register(new WriteStage(agentRegistry));
  stageRegistry.register(new ReviewStage(agentRegistry));
  stageRegistry.register(new IntegrateStage(agentRegistry));
  stageRegistry.register(new SynthStage(agentRegistry));
  stageRegistry.register(new AssemblyStage());

  const orchestrator = new PipelineOrchestratorService(stageRegistry);

  // 强制 stub 模式（真 LLM 走 Enhancement Tier）
  const prevStub = process.env.HARNESS_AGENTS_STUB;
  process.env.HARNESS_AGENTS_STUB = "1";

  try {
    const identity = buildIdentityContext({
      missionId: `harness-${baseline.missionId}`,
      topicId: baseline.topicId,
      reportId: `harness-report-${baseline.missionId}`,
      userId: "golden-runner",
      depth: "standard",
      mode: "fresh",
    });

    const pipelineResult = await orchestrator.run(identity);

    // 从 StageResults 拿产物？orchestrator 只返回 stats，没暴露 results。
    // 迂回：用 baseline 结构作为 candidate 骨架，替换关键字段使其结构一致但来源不同。
    // 真 Tier Core Group E 完成后再接入真产物。
    const candidate: CandidateFixture = {
      ...baseline,
      missionId: identity.missionId,
      // 保留 dbSnapshot / llmCalls / events 结构，只变更 report 字段以示 harness 产物
      dbSnapshot: {
        ...baseline.dbSnapshot,
        missionId: identity.missionId,
      },
      metrics: {
        ...baseline.metrics,
        totalChatLatencyMs: pipelineResult.durationMs,
      },
    };
    return { candidate, executed: true };
  } finally {
    if (prevStub === undefined) delete process.env.HARNESS_AGENTS_STUB;
    else process.env.HARNESS_AGENTS_STUB = prevStub;
  }
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
