/**
 * ST-06-COGLOOP · V5 认知循环（thorough+ only）
 *
 * 并行工作流：
 * 1. AG-08-GS 对每个 dimension 找 knowledge gaps
 * 2. AG-09-HV 验证从 dimensionMetas 提取的 hypotheses
 * 3. AG-10-FX 跨维度抽取 facts
 *
 * 结果合并供 ST-07-SYNTH 消费（当前 SynthesizerInput 未扩展使用，
 * Advanced Tier 可在 prompt 里加入 cross-dim facts；本 stage 仅保证输出结构完整）。
 */

import { Injectable } from "@nestjs/common";
import { SpecAgentRegistry } from "@/modules/ai-engine/harness";
import type {
  GapSearcherInput,
  HypothesisVerifierInput,
  FactExtractorInput,
} from "@/modules/ai-app/topic-insights/agents/specs";
import type {
  GapSearcherResult,
  HypothesisVerifierResult,
  FactExtractorResult,
} from "@/modules/ai-app/topic-insights/agents/specs/schemas";
import type { PipelineIdentityContext, Stage, StageResults } from "../types";
import type {
  CogLoopStageOutput,
  IntegrateStageOutput,
  ResearchStageOutput,
} from "./stage-context";

export interface CogLoopStageInput {
  readonly integrate: IntegrateStageOutput;
  readonly research: ResearchStageOutput;
}

@Injectable()
export class CogLoopStage implements Stage<
  CogLoopStageInput,
  CogLoopStageOutput
> {
  readonly id = "ST-06-COGLOOP" as const;
  readonly name = "V5 cognitive loop";
  readonly dependsOn = ["ST-05-INTEGRATE" as const];
  readonly runsWhen = "thoroughOrDeep" as const;
  readonly slo = {
    p95Ms: 300_000,
    tokenBudget: 60_000,
    targetSuccessRate: 0.9,
  };
  readonly emitsEvents = ["cogloop:started", "cogloop:completed"];

  constructor(private readonly agentRegistry: SpecAgentRegistry) {}

  // eslint-disable-next-line @typescript-eslint/require-await
  async prepare(
    _identity: PipelineIdentityContext,
    upstream: StageResults,
  ): Promise<CogLoopStageInput> {
    return {
      integrate: upstream.get<IntegrateStageOutput>("ST-05-INTEGRATE"),
      research: upstream.get<ResearchStageOutput>("ST-02-RESEARCH"),
    };
  }

  async execute(
    _identity: PipelineIdentityContext,
    input: CogLoopStageInput,
    signal: AbortSignal,
  ): Promise<CogLoopStageOutput> {
    const gapRunner = this.agentRegistry.get<
      GapSearcherInput,
      GapSearcherResult
    >("AG-08-GS");
    const hvRunner = this.agentRegistry.get<
      HypothesisVerifierInput,
      HypothesisVerifierResult
    >("AG-09-HV");
    const fxRunner = this.agentRegistry.get<
      FactExtractorInput,
      FactExtractorResult
    >("AG-10-FX");
    if (!gapRunner || !hvRunner || !fxRunner) {
      throw new Error(
        "AG-08-GS / AG-09-HV / AG-10-FX missing in SpecAgentRegistry",
      );
    }

    // 1. Gap search per dimension
    const gapsByDim: Record<string, GapSearcherResult["gaps"]> = {};
    for (const meta of input.integrate.dimensionMetas) {
      if (signal.aborted) {
        throw new DOMException(`[${this.id}] aborted`, "AbortError");
      }
      const res = await gapRunner.executeSpec({
        dimensionId: meta.dimensionId,
        dimensionName: meta.dimensionName,
        dimensionSummary: meta.summary,
        existingKeyFindings: meta.keyFindings,
        existingEvidenceCount: meta.evidenceCount,
      });
      if (res.state !== "completed") {
        throw new Error(
          `AG-08-GS failed: ${res.errors?.join("; ") ?? "unknown"}`,
        );
      }
      gapsByDim[meta.dimensionId] = res.output.gaps;
    }

    // 2. Hypothesis verification：从 dim metas 抽 hypotheses（trends / challenges）
    const hypotheses = input.integrate.dimensionMetas
      .flatMap((m) => [
        ...m.trends.map((t, i) => ({
          id: `hyp-${m.dimensionId}-t${i}`,
          statement: `${m.dimensionName}：${t}`,
        })),
        ...m.challenges.map((c, i) => ({
          id: `hyp-${m.dimensionId}-c${i}`,
          statement: `${m.dimensionName} 风险：${c}`,
        })),
      ])
      .slice(0, 10); // 防止 prompt 过长

    // evidence pool：所有维度 evidenceIds 合并
    const evidenceIds = input.research.byDimension.flatMap(
      (d) => d.evidenceIds,
    );
    const evidenceSummaries = evidenceIds.slice(0, 20).map((id) => ({
      id,
      title: `evidence ${id}`,
      snippet: "",
    }));

    let hvResult: HypothesisVerifierResult = { hypotheses: [] };
    if (hypotheses.length > 0) {
      const res = await hvRunner.executeSpec({ hypotheses, evidenceSummaries });
      if (res.state !== "completed") {
        throw new Error(
          `AG-09-HV failed: ${res.errors?.join("; ") ?? "unknown"}`,
        );
      }
      hvResult = res.output;
    }

    // 3. Fact extraction
    const fxResult = await fxRunner.executeSpec({
      dimensions: input.integrate.dimensionMetas.map((m) => ({
        id: m.dimensionId,
        name: m.dimensionName,
        summary: m.summary,
        keyFindings: m.keyFindings,
      })),
      evidenceIds,
    });
    if (fxResult.state !== "completed") {
      throw new Error(
        `AG-10-FX failed: ${fxResult.errors?.join("; ") ?? "unknown"}`,
      );
    }

    return {
      gapsByDimension: gapsByDim,
      hypotheses: hvResult.hypotheses,
      facts: fxResult.output.facts,
    };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async persist(
    _identity: PipelineIdentityContext,
    _output: CogLoopStageOutput,
  ): Promise<void> {
    // cogloop 结果进入 qualityTrace（由 ST-13 合并写入）
  }
}
