/**
 * ST-02-RESEARCH · 每个维度的搜索 / 证据落库
 *
 * 当前骨架：按 plan.dimensions 产出占位 ResearchOutcome。
 * Group E 集成时：接 SearchOrchestratorService 执行真实搜索，evidence 写 DB，
 * 从 DB count 读 evidenceCount（原则 6）。
 */

import { Injectable } from "@nestjs/common";
import type {
  PipelineIdentityContext,
  Stage,
  StageResults,
} from "../pipeline/types";
import type { PlanStageOutput, ResearchStageOutput } from "./stage-context";

@Injectable()
export class ResearchStage implements Stage<
  PlanStageOutput,
  ResearchStageOutput
> {
  readonly id = "ST-02-RESEARCH" as const;
  readonly name = "Dimension research";
  readonly dependsOn = ["ST-01-PLAN" as const];
  readonly runsWhen = "always" as const;
  readonly slo = {
    p95Ms: 300_000,
    maxTokens: 50_000,
    targetSuccessRate: 0.9,
  };
  readonly emitsEvents = [
    "dimension:research_started",
    "dimension:research_completed",
  ];

  // eslint-disable-next-line @typescript-eslint/require-await
  async prepare(
    _identity: PipelineIdentityContext,
    upstream: StageResults,
  ): Promise<PlanStageOutput> {
    return upstream.get<PlanStageOutput>("ST-01-PLAN");
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(
    _identity: PipelineIdentityContext,
    input: PlanStageOutput,
    signal: AbortSignal,
  ): Promise<ResearchStageOutput> {
    if (signal.aborted) throw new DOMException("aborted", "AbortError");
    const byDimension = input.plan.dimensions.map((dim) => ({
      dimensionId: dim.id,
      dimensionName: dim.name,
      evidenceIds: Array.from({ length: 5 }).map(
        (_, i) => `${dim.id}-ev-${i + 1}`,
      ),
      evidenceCount: 5,
    }));
    return { byDimension };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async persist(
    _identity: PipelineIdentityContext,
    _output: ResearchStageOutput,
  ): Promise<void> {
    // Group E: 写 TopicEvidence 表
  }
}
