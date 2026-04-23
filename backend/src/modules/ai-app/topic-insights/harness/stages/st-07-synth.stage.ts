/**
 * ST-07-SYNTH · 报告合成
 *
 * 调 AG-11-SY 基于 dimension metas 产出最终报告。
 * 严禁 Synthesizer 访问 evidence-save 工具（由 Agent 自身 forbiddenTools 保护）。
 */

import { Injectable } from "@nestjs/common";
import {
  HarnessAgentRegistry,
  type SynthesisResult,
  type SynthesizerInput,
} from "../agents";
import type {
  PipelineIdentityContext,
  Stage,
  StageResults,
} from "../pipeline/types";
import type {
  IntegrateStageOutput,
  SynthStageOutput,
  WriteStageOutput,
} from "./stage-context";

export interface SynthStageInput {
  readonly dimensionMetas: IntegrateStageOutput["dimensionMetas"];
  readonly integratedSectionsPerDim: Record<string, string>;
}

@Injectable()
export class SynthStage implements Stage<SynthStageInput, SynthStageOutput> {
  readonly id = "ST-07-SYNTH" as const;
  readonly name = "Report synthesis";
  readonly dependsOn = ["ST-05-INTEGRATE" as const];
  readonly runsWhen = "always" as const;
  readonly slo = {
    p95Ms: 180_000,
    maxTokens: 40_000,
    targetSuccessRate: 0.9,
  };
  readonly emitsEvents = [
    "report:synthesis_started",
    "report:synthesis_completed",
  ];

  constructor(private readonly agentRegistry: HarnessAgentRegistry) {}

  // eslint-disable-next-line @typescript-eslint/require-await
  async prepare(
    _identity: PipelineIdentityContext,
    upstream: StageResults,
  ): Promise<SynthStageInput> {
    const integrate = upstream.get<IntegrateStageOutput>("ST-05-INTEGRATE");
    const write = upstream.get<WriteStageOutput>("ST-03-WRITE");

    const byDim: Record<string, string> = {};
    for (const s of write.sections) {
      byDim[s.dimensionId] = (byDim[s.dimensionId] ?? "") + "\n\n" + s.content;
    }

    return {
      dimensionMetas: integrate.dimensionMetas,
      integratedSectionsPerDim: byDim,
    };
  }

  async execute(
    identity: PipelineIdentityContext,
    input: SynthStageInput,
    signal: AbortSignal,
  ): Promise<SynthStageOutput> {
    const runner = this.agentRegistry.mustGet<
      SynthesizerInput,
      SynthesisResult
    >("AG-11-SY");
    const res = await runner.run({
      input: {
        topicId: identity.topicId,
        topicName: `Mission-${identity.missionId}`, // Group E 接真 topic name
        dimensionMetas: input.dimensionMetas,
        integratedSectionsPerDim: input.integratedSectionsPerDim,
        language: "zh",
      },
      identity,
      signal,
    });
    return { synthesis: res.output };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async persist(
    _identity: PipelineIdentityContext,
    _output: SynthStageOutput,
  ): Promise<void> {
    // Group E: 写 TopicReport.fullReport / executiveSummary / highlights / riskMatrix
  }
}
