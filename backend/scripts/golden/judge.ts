/**
 * LLM judge — 10 维 rubric 评分
 *
 * 默认 **disabled**：走到这里会返回 `enabled: false` 并记录 skip 原因。
 * 真正启用时走 env flag `GOLDEN_JUDGE_ENABLED=1` + 注入 API key。
 *
 * 启用后：
 * - 用 Claude Opus-4.7 对 candidate report 按 rubric 评分
 * - 独立运行 3 次取中位数
 * - 返回 JudgeResult
 *
 * 本文件当前只提供 **stub**，真实实现等 PR-0.4 / Tier Core 验收时补全。
 */

import type { BaselineFixture, JudgeResult, QualityRubric } from "./types";

export interface JudgeOptions {
  enabled: boolean;
  apiKey?: string;
  model?: string;
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

  if (!options.apiKey) {
    return {
      enabled: false,
      skippedReason: "Judge enabled but no API key provided",
    };
  }

  // TODO(Tier Core): 调 Claude Opus-4.7 打分 3 次取中位
  // 目前走 stub 路径：返回一个基于 baseline 自身长度的粗糙估算，仅供结构测试用
  const baseLen = baseline.finalReportMd.length;
  const candLen = candidateReportMd.length;
  const lenScore = Math.max(
    0,
    Math.min(10, Math.round((candLen / baseLen) * 10)),
  );

  const stubRubric: QualityRubric = {
    contentCompleteness: lenScore,
    analysisDepth: 7,
    evidenceUse: 7,
    logicCoherence: 7,
    wordCount: lenScore,
    planAlignment: 7,
    writingQuality: 7,
    figuresUse: 5,
    sectionTransitions: 7,
    independentAnalysis: 7,
  };

  return {
    enabled: true,
    rawRuns: [stubRubric, stubRubric, stubRubric],
    median: stubRubric,
    totalScore: Object.values(stubRubric).reduce((a, b) => a + b, 0),
    skippedReason: "STUB: real Claude judge implementation pending",
  };
}
