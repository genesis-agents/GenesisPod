/**
 * ST-03-WRITE · 分章节写作
 *
 * 对每个维度的每个 section 调 AG-03-SW。
 * 骨架：每个 dim 产出 2 个占位 section。
 */

import { Injectable } from "@nestjs/common";
import {
  HarnessAgentRegistry,
  type SectionResult,
  type SectionWriterInput,
} from "../agents";
import type {
  PipelineIdentityContext,
  Stage,
  StageResults,
} from "../pipeline/types";
import type {
  PlanStageOutput,
  ResearchStageOutput,
  WriteStageOutput,
} from "./stage-context";

export interface WriteStageInput {
  readonly plan: PlanStageOutput["plan"];
  readonly research: ResearchStageOutput;
}

@Injectable()
export class WriteStage implements Stage<WriteStageInput, WriteStageOutput> {
  readonly id = "ST-03-WRITE" as const;
  readonly name = "Section writing";
  readonly dependsOn = ["ST-02-RESEARCH" as const];
  readonly runsWhen = "always" as const;
  readonly slo = {
    p95Ms: 180_000,
    maxTokens: 20_000,
    targetSuccessRate: 0.9,
  };
  readonly emitsEvents = ["section:write_started", "section:write_completed"];

  constructor(private readonly agentRegistry: HarnessAgentRegistry) {}

  // eslint-disable-next-line @typescript-eslint/require-await
  async prepare(
    _identity: PipelineIdentityContext,
    upstream: StageResults,
  ): Promise<WriteStageInput> {
    const planOut = upstream.get<PlanStageOutput>("ST-01-PLAN");
    const research = upstream.get<ResearchStageOutput>("ST-02-RESEARCH");
    return { plan: planOut.plan, research };
  }

  async execute(
    identity: PipelineIdentityContext,
    input: WriteStageInput,
    signal: AbortSignal,
  ): Promise<WriteStageOutput> {
    const runner = this.agentRegistry.mustGet<
      SectionWriterInput,
      SectionResult
    >("AG-03-SW");
    const sections: SectionResult[] = [];

    for (const dim of input.plan.dimensions) {
      for (let si = 0; si < 2; si++) {
        if (signal.aborted) {
          throw new DOMException(
            `[${this.id}] aborted at dim=${dim.id} section=${si}`,
            "AbortError",
          );
        }
        const sectionInput: SectionWriterInput = {
          topicId: identity.topicId,
          topicName: dim.name, // upstream context（Group E 接真 topic name）
          dimensionId: dim.id,
          dimensionName: dim.name,
          sectionPlan: {
            id: `${dim.id}-s-${si + 1}`,
            title: `${dim.name} 子章节 ${si + 1}`,
            description: dim.description,
            targetWords: 400,
            keyPoints: [`子章节 ${si + 1} 要点 A`, `要点 B`],
          },
          evidenceSummary: `evidence for ${dim.name}`,
          language: "zh",
        };
        const res = await runner.run({ input: sectionInput, identity, signal });
        sections.push(res.output);
      }
    }

    return { sections };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async persist(
    _identity: PipelineIdentityContext,
    _output: WriteStageOutput,
  ): Promise<void> {
    // Group E: 写 TopicReportSection 表
  }
}
