/**
 * ST-05-INTEGRATE · Dimension 合并 + meta 提取
 *
 * 每个维度：把 section 正文拼接 + 调 AG-05-ME 出 DimensionMeta。
 */

import { Injectable } from "@nestjs/common";
import {
  HarnessAgentRegistry,
  type DimensionMeta,
  type MetaExtractorInput,
} from "../agents";
import type {
  PipelineIdentityContext,
  Stage,
  StageResults,
} from "../pipeline/types";
import type {
  IntegrateStageOutput,
  ResearchStageOutput,
  WriteStageOutput,
} from "./stage-context";

export interface IntegrateStageInput {
  readonly write: WriteStageOutput;
  readonly research: ResearchStageOutput;
}

@Injectable()
export class IntegrateStage implements Stage<
  IntegrateStageInput,
  IntegrateStageOutput
> {
  readonly id = "ST-05-INTEGRATE" as const;
  readonly name = "Dimension integrate + meta";
  readonly dependsOn = ["ST-04-REVIEW" as const];
  readonly runsWhen = "always" as const;
  readonly slo = {
    p95Ms: 60_000,
    tokenBudget: 10_000,
    targetSuccessRate: 0.95,
  };
  readonly emitsEvents = ["dimension:integrated"];

  constructor(private readonly agentRegistry: HarnessAgentRegistry) {}

  // eslint-disable-next-line @typescript-eslint/require-await
  async prepare(
    _identity: PipelineIdentityContext,
    upstream: StageResults,
  ): Promise<IntegrateStageInput> {
    return {
      write: upstream.get<WriteStageOutput>("ST-03-WRITE"),
      research: upstream.get<ResearchStageOutput>("ST-02-RESEARCH"),
    };
  }

  async execute(
    identity: PipelineIdentityContext,
    input: IntegrateStageInput,
    signal: AbortSignal,
  ): Promise<IntegrateStageOutput> {
    const runner = this.agentRegistry.mustGet<
      MetaExtractorInput,
      DimensionMeta
    >("AG-05-ME");

    // 按维度聚合 section 正文
    const sectionsByDim = new Map<string, string[]>();
    for (const s of input.write.sections) {
      let arr = sectionsByDim.get(s.dimensionId);
      if (!arr) {
        arr = [];
        sectionsByDim.set(s.dimensionId, arr);
      }
      arr.push(s.content);
    }

    const evidenceCountByDim = new Map(
      input.research.byDimension.map((d) => [d.dimensionId, d.evidenceCount]),
    );

    const metas: DimensionMeta[] = [];
    for (const [dimensionId, contents] of sectionsByDim.entries()) {
      if (signal.aborted) {
        throw new DOMException(`[${this.id}] aborted`, "AbortError");
      }
      const dim = input.research.byDimension.find(
        (d) => d.dimensionId === dimensionId,
      );
      const res = await runner.run({
        input: {
          dimensionId,
          dimensionName: dim?.dimensionName ?? dimensionId,
          integratedSections: contents.join("\n\n---\n\n"),
          evidenceCount: evidenceCountByDim.get(dimensionId) ?? 0,
        },
        identity,
        signal,
      });
      metas.push(res.output);
    }

    return { dimensionMetas: metas };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async persist(
    _identity: PipelineIdentityContext,
    _output: IntegrateStageOutput,
  ): Promise<void> {
    // Group E: 写 DimensionAnalysis 表
  }
}
