/**
 * ST-08-QGATE · 质量硬门（Enhancement Tier）
 *
 * 基于客观规则对 synthesis 产物打分：
 * - citationDensityCheck：引用密度（UT-CIT-DENSITY utility）
 * - sectionStructure：## section count vs dimensionMetas.length
 * - wordCount：fullMarkdown 字数 vs depth 期望
 * - evidenceCoverage：synthesis 产物字数 vs evidenceCount
 *
 * 产出 verdict：pass / warn / fail + needsRemediate flag。
 * 当前**不**回退 ST-07（remediate loop 留给 Advanced Tier AG-12-SREM）；
 * fail 时只记录并标记 needsRemediate，pipeline 继续向下（ST-11-ASM）。
 */

import { Injectable, Logger } from "@nestjs/common";
import type {
  PipelineIdentityContext,
  Stage,
  StageResults,
} from "../pipeline/types";
import { citationDensityCheck } from "../utils";
import type {
  IntegrateStageOutput,
  QualityGateStageOutput,
  SynthStageOutput,
} from "./stage-context";

export interface QualityGateInput {
  readonly synthesis: SynthStageOutput["synthesis"];
  readonly dimensionMetas: IntegrateStageOutput["dimensionMetas"];
}

@Injectable()
export class QualityGateStage implements Stage<
  QualityGateInput,
  QualityGateStageOutput
> {
  private readonly logger = new Logger(QualityGateStage.name);
  readonly id = "ST-08-QGATE" as const;
  readonly name = "Quality gate";
  readonly dependsOn = ["ST-07-SYNTH" as const];
  readonly runsWhen = "always" as const;
  readonly slo = { p95Ms: 2_000, tokenBudget: 0, targetSuccessRate: 0.99 };
  readonly emitsEvents = ["quality:gate_evaluated"];

  // eslint-disable-next-line @typescript-eslint/require-await
  async prepare(
    _identity: PipelineIdentityContext,
    upstream: StageResults,
  ): Promise<QualityGateInput> {
    const synthOut = upstream.get<SynthStageOutput>("ST-07-SYNTH");
    const integrate = upstream.get<IntegrateStageOutput>("ST-05-INTEGRATE");
    return {
      synthesis: synthOut.synthesis,
      dimensionMetas: integrate.dimensionMetas,
    };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(
    _identity: PipelineIdentityContext,
    input: QualityGateInput,
    _signal: AbortSignal,
  ): Promise<QualityGateStageOutput> {
    const issues: string[] = [];

    // 1. Citation density
    const density = citationDensityCheck(input.synthesis.fullMarkdown, {
      minRatio: 0.3,
      warnRatio: 0.8,
    });
    let citationScore = 100;
    if (density.verdict === "fail") {
      citationScore = 30;
      issues.push(`Citation density too low: ${density.reason}`);
    } else if (density.verdict === "warn") {
      citationScore = 70;
      issues.push(`Citation density borderline: ${density.reason}`);
    }

    // 2. Section structure：## 计数应与 dimensionMetas 匹配（±2 容忍）
    const h2Count = (input.synthesis.fullMarkdown.match(/^##\s+/gm) ?? [])
      .length;
    const expected = input.dimensionMetas.length;
    const h2Diff = Math.abs(h2Count - expected);
    let structureScore = 100;
    if (h2Diff > 4) {
      structureScore = 40;
      issues.push(
        `Section count mismatch: expected≈${expected}, got ${h2Count}`,
      );
    } else if (h2Diff > 2) {
      structureScore = 75;
      issues.push(`Section count drift: expected≈${expected}, got ${h2Count}`);
    }

    // 3. Word count：期望 ≥ 800
    const wordCount = input.synthesis.fullMarkdown.length;
    let wordScore = 100;
    if (wordCount < 400) {
      wordScore = 20;
      issues.push(`Report too short: ${wordCount} chars`);
    } else if (wordCount < 800) {
      wordScore = 60;
      issues.push(`Report short: ${wordCount} chars`);
    }

    // 4. Evidence coverage：dimensionMetas 的 evidenceCount 总和 ≥ 5
    const totalEvidence = input.dimensionMetas.reduce(
      (sum, m) => sum + m.evidenceCount,
      0,
    );
    let evidenceScore = 100;
    if (totalEvidence < 3) {
      evidenceScore = 25;
      issues.push(`Evidence coverage too sparse: ${totalEvidence}`);
    } else if (totalEvidence < 8) {
      evidenceScore = 70;
      issues.push(`Evidence coverage sparse: ${totalEvidence}`);
    }

    const overall = Math.round(
      0.35 * citationScore +
        0.25 * structureScore +
        0.2 * wordScore +
        0.2 * evidenceScore,
    );

    let verdict: "pass" | "warn" | "fail";
    if (overall >= 80) verdict = "pass";
    else if (overall >= 60) verdict = "warn";
    else verdict = "fail";

    const needsRemediate = verdict === "fail";

    this.logger.log(
      `qgate overall=${overall} verdict=${verdict} issues=${issues.length} ` +
        `(cite=${citationScore}/struct=${structureScore}/words=${wordScore}/evidence=${evidenceScore})`,
    );

    return {
      score: overall,
      breakdown: {
        citationDensity: citationScore,
        sectionStructure: structureScore,
        wordCount: wordScore,
        evidenceCoverage: evidenceScore,
      },
      needsRemediate,
      verdict,
      issues,
    };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async persist(
    _identity: PipelineIdentityContext,
    _output: QualityGateStageOutput,
  ): Promise<void> {
    // Quality gate 结果不单独持久化；ST-13-PERSIST 会把它合并写到 qualityTrace
  }
}
