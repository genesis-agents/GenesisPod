/**
 * LLM judge — 10 维 rubric 评分
 *
 * 路径（Group L-1 完整打通）：
 * - GOLDEN_JUDGE_ENABLED !== '1' → 返回 enabled=false skip
 * - HARNESS_AGENTS_STUB=1（default）→ AG-13-RE stub 判分（deterministic）
 * - HARNESS_AGENTS_STUB=0 + apiKey → 启动 NestApplicationContext 拿真 invoker，
 *   AG-13-RE 走真 Claude Opus-4.7 路径，独立 3 次取中位数
 */

import type { BaselineFixture, JudgeResult, QualityRubric } from "./types";

export interface JudgeOptions {
  enabled: boolean;
  apiKey?: string;
  model?: string;
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function medianRubric(runs: QualityRubric[]): QualityRubric {
  const keys: (keyof QualityRubric)[] = [
    "contentCompleteness",
    "analysisDepth",
    "evidenceUse",
    "logicCoherence",
    "wordCount",
    "planAlignment",
    "writingQuality",
    "figuresUse",
    "sectionTransitions",
    "independentAnalysis",
  ];
  const result = {} as QualityRubric;
  for (const k of keys) {
    result[k] = median(runs.map((r) => r[k]));
  }
  return result;
}

export async function judge(
  baseline: BaselineFixture,
  candidateReportMd: string,
  options: JudgeOptions,
): Promise<JudgeResult> {
  if (!options.enabled) {
    return {
      enabled: false,
      skippedReason: "GOLDEN_JUDGE_ENABLED not set",
    };
  }

  const { ReportEvaluatorAgent } =
    await import("../../src/modules/ai-app/topic-insights/harness/agents/index");
  const { buildIdentityContext } =
    await import("../../src/modules/ai-app/topic-insights/harness/pipeline/index");

  const stubMode = process.env.HARNESS_AGENTS_STUB !== "0";
  const useRealLlm = !stubMode && !!options.apiKey;

  // 构造 agent：real 模式从 NestApplicationContext 拿 LlmInvoker；否则 stub
  let agent: InstanceType<typeof ReportEvaluatorAgent>;
  if (useRealLlm) {
    const { createHarnessCLIContext } = await import("./harness-context");
    const ctx = await createHarnessCLIContext();
    agent = new ReportEvaluatorAgent(ctx.llmInvoker);
  } else {
    agent = new ReportEvaluatorAgent();
  }

  const identity = buildIdentityContext({
    missionId: "golden-judge",
    topicId: baseline.topicId,
    reportId: "golden-judge-report",
    userId: "golden-judge",
    depth: "standard",
    mode: "fresh",
  });

  const runs: QualityRubric[] = [];
  for (let i = 0; i < 3; i++) {
    const res = await agent.run({
      input: {
        reportMarkdown: candidateReportMd,
        expectedDimensions: baseline.dbSnapshot.dimensions.length,
        expectedEvidenceCount: baseline.dbSnapshot.evidenceCount,
      },
      identity,
      signal: identity.abortController.signal,
    });
    runs.push(res.output.rubric);
  }

  const med = medianRubric(runs);
  const total = Object.values(med).reduce((a, b) => a + b, 0);

  return {
    enabled: true,
    rawRuns: runs,
    median: med,
    totalScore: Math.round(total * 10) / 10,
    skippedReason: useRealLlm ? undefined : "AG-13-RE stub mode",
  };
}
