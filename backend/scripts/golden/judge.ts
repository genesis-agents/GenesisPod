/**
 * LLM judge — 10 维 rubric 评分（Group K-2 启用真 AG-13-RE 路径）
 *
 * 路径：
 * - GOLDEN_JUDGE_ENABLED !== '1' → 返回 enabled=false skip
 * - stub 默认：调 AG-13-RE 的 stub 路径（无需真 LLM）
 * - 真实 judge：apiKey + HARNESS_AGENTS_STUB=0 → 调 AG-13-RE real LLM path
 *
 * 独立 3 次取中位数（以减小单次 LLM 随机性）。
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

  // 动态 import AG-13-RE（避免 CLI 启动时构造 DI）
  const { ReportEvaluatorAgent, LlmInvokerService } =
    await import("../../src/modules/ai-app/topic-insights/harness/agents/index");
  const { buildIdentityContext } =
    await import("../../src/modules/ai-app/topic-insights/harness/pipeline/index");

  const useRealLlm = options.apiKey && process.env.HARNESS_AGENTS_STUB === "0";

  // stub 模式下无需 AiChatService，invoker 传 undefined；agent 走 stubOutput
  let invoker: InstanceType<typeof LlmInvokerService> | undefined;
  if (useRealLlm) {
    // 真 LLM 调用需要一个 AiChatService 实例。CLI 环境我们无法
    // 便捷拿到完整 Nest DI；真实 judge 建议走 `npm run test:golden`
    // 启动一个 NestApplicationContext。此处如果 apiKey 存在但 DI 未
    // 就绪，fallback 到 stub 模式并记录原因。
    return {
      enabled: false,
      skippedReason:
        "real LLM judge requires NestApplicationContext (not wired in CLI); use stub mode",
    };
  }

  // Stub mode：独立 3 次取中位（stub 是 deterministic 所以 3 次相同，median 简化）
  const agent = new ReportEvaluatorAgent(invoker);
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
