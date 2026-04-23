/**
 * ST-09-EVAL · 10-dim rubric 评审（thorough+ only）
 *
 * 依赖 ST-07-SYNTH，产出 10 维度评分（与 08-test-strategy 的 judge rubric 对齐）。
 * 与 ST-08-QGATE 的区别：QGATE 是客观规则硬门；EVAL 是 LLM 主观 rubric 打分。
 *
 * 当前采用**启发式计算**（不调额外 LLM 节省成本）：
 * - contentCompleteness ← sectionCount / expectedDimensions
 * - analysisDepth ← averageFindingsPerDim
 * - evidenceUse ← totalEvidence / dimensionCount 比例
 * - wordCount ← fullMarkdown.length / target
 * - ...
 *
 * 真正用 LLM judge 的路径走 Golden runner 的 GOLDEN_JUDGE_ENABLED。
 */

import { Injectable } from "@nestjs/common";
import type {
  PipelineIdentityContext,
  Stage,
  StageResults,
} from "../pipeline/types";
import type {
  EvalStageOutput,
  IntegrateStageOutput,
  ResearchStageOutput,
  SynthStageOutput,
} from "./stage-context";

export interface EvalStageInput {
  readonly synthesis: SynthStageOutput["synthesis"];
  readonly dimensionMetas: IntegrateStageOutput["dimensionMetas"];
  readonly research: ResearchStageOutput;
}

@Injectable()
export class EvalStage implements Stage<EvalStageInput, EvalStageOutput> {
  readonly id = "ST-09-EVAL" as const;
  readonly name = "10-dim rubric evaluation";
  readonly dependsOn = ["ST-07-SYNTH" as const];
  readonly runsWhen = "thoroughOrDeep" as const;
  readonly slo = {
    p95Ms: 90_000,
    tokenBudget: 15_000,
    targetSuccessRate: 0.95,
  };
  readonly emitsEvents = ["eval:completed"];

  // eslint-disable-next-line @typescript-eslint/require-await
  async prepare(
    _identity: PipelineIdentityContext,
    upstream: StageResults,
  ): Promise<EvalStageInput> {
    const synth = upstream.get<SynthStageOutput>("ST-07-SYNTH");
    const integrate = upstream.get<IntegrateStageOutput>("ST-05-INTEGRATE");
    const research = upstream.get<ResearchStageOutput>("ST-02-RESEARCH");
    return {
      synthesis: synth.synthesis,
      dimensionMetas: integrate.dimensionMetas,
      research,
    };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(
    _identity: PipelineIdentityContext,
    input: EvalStageInput,
    _signal: AbortSignal,
  ): Promise<EvalStageOutput> {
    const metas = input.dimensionMetas;
    const md = input.synthesis.fullMarkdown;

    const h2Count = (md.match(/^##\s+/gm) ?? []).length;
    const avgFindings =
      metas.reduce((s, m) => s + m.keyFindings.length, 0) /
      Math.max(1, metas.length);
    const totalEvidence = input.research.byDimension.reduce(
      (s, d) => s + d.evidenceCount,
      0,
    );

    const rubricScores = {
      contentCompleteness: clamp10(
        h2Count >= metas.length ? 8 : (h2Count / metas.length) * 8,
      ),
      analysisDepth: clamp10(avgFindings),
      evidenceUse: clamp10(Math.log2(1 + totalEvidence) * 1.5),
      logicCoherence: clamp10(h2Count >= 2 ? 7 : 5),
      wordCount: clamp10(Math.min(md.length / 2000, 10)),
      planAlignment: clamp10(h2Count === metas.length ? 9 : 7),
      writingQuality: clamp10(md.length > 800 ? 7.5 : 5),
      figuresUse: clamp10(
        (md.match(/!\[.*?\]\(.*?\)/g) ?? []).length > 0 ? 8 : 4,
      ),
      sectionTransitions: clamp10(
        md.includes("综上") || md.includes("总结") ? 7 : 6,
      ),
      independentAnalysis: clamp10(
        input.synthesis.crossDimensionAnalysis.length > 100 ? 7.5 : 5,
      ),
    };

    const total = Object.values(rubricScores).reduce((a, b) => a + b, 0);
    const avg = total / 10;

    let verdict: "excellent" | "good" | "acceptable" | "poor";
    if (avg >= 8.5) verdict = "excellent";
    else if (avg >= 7) verdict = "good";
    else if (avg >= 5) verdict = "acceptable";
    else verdict = "poor";

    const notes: string[] = [];
    for (const [key, score] of Object.entries(rubricScores)) {
      if (score < 5) notes.push(`${key} low (${score.toFixed(1)})`);
    }

    return {
      rubricScores,
      totalScore: Math.round(total * 10) / 10,
      verdict,
      notes,
    };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async persist(
    _identity: PipelineIdentityContext,
    _output: EvalStageOutput,
  ): Promise<void> {
    // 评分合并到 ST-13-PERSIST 的 qualityTrace
  }
}

function clamp10(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(10, x));
}
