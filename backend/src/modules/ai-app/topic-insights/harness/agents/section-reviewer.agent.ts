/**
 * AG-04-SR · SectionReviewer
 *
 * 输入 SectionResult + plan → 输出 SectionReview（5 维评分 + 修订指令 + claims）。
 * Access matrix：只读 rag/knowledge-graph/TL-04-DIMMEM；严禁 TL-02-EVSAVE。
 */

import { Injectable } from "@nestjs/common";
import { BaseAgentRunner } from "./base-agent-runner";
import { SectionReviewSchema, type SectionReview } from "./schemas";
import type { AccessToolId, AgentRunContext } from "./types";

export interface SectionReviewerInput {
  readonly sectionResult: {
    readonly sectionId: string;
    readonly dimensionId: string;
    readonly title: string;
    readonly content: string;
    readonly wordCount: number;
    readonly keyFindings: ReadonlyArray<{
      statement: string;
      evidenceRefs: ReadonlyArray<string>;
    }>;
  };
  readonly revisionRound: 1 | 2;
  readonly priorReview?: SectionReview;
}

@Injectable()
export class SectionReviewerAgent extends BaseAgentRunner<
  SectionReviewerInput,
  SectionReview
> {
  readonly id = "AG-04-SR";
  readonly name = "Section Reviewer";
  readonly tools: ReadonlyArray<AccessToolId> = [
    "rag-search",
    "knowledge-graph",
    "TL-04-DIMMEM",
  ];
  readonly forbiddenTools: ReadonlyArray<AccessToolId> = ["TL-02-EVSAVE"];
  readonly outputSchema = SectionReviewSchema;

  protected async executeImpl(
    _ctx: AgentRunContext<SectionReviewerInput>,
  ): Promise<{ output: unknown; tokensUsed: number; costUsd: number }> {
    throw new Error(
      `[${this.id}] Real LLM execution not yet wired — use HARNESS_AGENTS_STUB=1`,
    );
  }

  protected async stubOutput(
    ctx: AgentRunContext<SectionReviewerInput>,
  ): Promise<{ output: unknown; tokensUsed: number; costUsd: number }> {
    const { input } = ctx;
    const review: SectionReview = {
      sectionId: input.sectionResult.sectionId,
      overallScore: 7.5,
      scores: {
        accuracy: 8,
        completeness: 7,
        coherence: 8,
        evidenceQuality: 7,
        depth: 7,
      },
      needsRevision: input.revisionRound === 1,
      revisionInstructions:
        input.revisionRound === 1
          ? ["补充 trends 部分的数据支撑", "统一术语"]
          : [],
      issues: ["部分引用重复使用"],
      claims: input.sectionResult.keyFindings.map((kf, idx) => ({
        id: `claim-${input.sectionResult.sectionId}-${idx + 1}`,
        statement: kf.statement,
        evidenceRefs: [...kf.evidenceRefs],
      })),
    };
    return { output: review, tokensUsed: 0, costUsd: 0 };
  }
}
