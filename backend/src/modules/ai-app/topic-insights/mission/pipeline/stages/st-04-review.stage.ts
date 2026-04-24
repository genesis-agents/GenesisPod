/**
 * ST-04-REVIEW · Section 级审核（含 claims 抽取）
 *
 * 每个 section 调 AG-04-SR，产出 SectionReview。
 */

import { Injectable } from "@nestjs/common";
import { SpecAgentRegistry } from "@/modules/ai-engine/harness";
import type { SectionReviewerInput } from "@/modules/ai-app/topic-insights/agents/specs";
import type { SectionReview } from "@/modules/ai-app/topic-insights/agents/specs/schemas";
import type { PipelineIdentityContext, Stage, StageResults } from "../types";
import type { ReviewStageOutput, WriteStageOutput } from "./stage-context";

@Injectable()
export class ReviewStage implements Stage<WriteStageOutput, ReviewStageOutput> {
  readonly id = "ST-04-REVIEW" as const;
  readonly name = "Section review";
  readonly dependsOn = ["ST-03-WRITE" as const];
  readonly runsWhen = "always" as const;
  readonly slo = {
    p95Ms: 120_000,
    tokenBudget: 15_000,
    targetSuccessRate: 0.9,
  };
  readonly emitsEvents = ["section:review_started", "section:review_completed"];

  constructor(private readonly agentRegistry: SpecAgentRegistry) {}

  // eslint-disable-next-line @typescript-eslint/require-await
  async prepare(
    _identity: PipelineIdentityContext,
    upstream: StageResults,
  ): Promise<WriteStageOutput> {
    return upstream.get<WriteStageOutput>("ST-03-WRITE");
  }

  async execute(
    _identity: PipelineIdentityContext,
    input: WriteStageOutput,
    signal: AbortSignal,
  ): Promise<ReviewStageOutput> {
    const runner = this.agentRegistry.get<SectionReviewerInput, SectionReview>(
      "AG-04-SR",
    );
    if (!runner)
      throw new Error("AG-04-SR not registered in SpecAgentRegistry");

    const reviews: SectionReview[] = [];
    for (const section of input.sections) {
      if (signal.aborted) {
        throw new DOMException(`[${this.id}] aborted`, "AbortError");
      }
      const res = await runner.executeSpec({
        sectionResult: {
          sectionId: section.sectionId,
          dimensionId: section.dimensionId,
          title: section.title,
          content: section.content,
          wordCount: section.wordCount,
          keyFindings: section.keyFindings,
        },
        revisionRound: 1,
      });
      if (res.state !== "completed") {
        throw new Error(
          `AG-04-SR failed at ${section.sectionId}: ${res.errors?.join("; ") ?? "unknown"}`,
        );
      }
      reviews.push(res.output);
    }
    return { reviews };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async persist(
    _identity: PipelineIdentityContext,
    _output: ReviewStageOutput,
  ): Promise<void> {
    // Group E: 写 SectionReview 表（如有），或合并进 TopicReportSection.review
  }
}
