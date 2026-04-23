/**
 * AG-06-QR · QualityReviewer（dimension / overall scopes）
 *
 * Discriminated union by scope — dimension 或 overall。
 * Access matrix：只读 rag/TL-04-DIMMEM；严禁 TL-02-EVSAVE。
 */

import { Injectable } from "@nestjs/common";
import { BaseAgentRunner } from "./base-agent-runner";
import {
  QualityReviewSchema,
  type DimensionMeta,
  type QualityReview,
  type SectionReview,
} from "./schemas";
import type { AccessToolId, AgentRunContext } from "./types";

export type QualityReviewerInput =
  | {
      scope: "dimension";
      dimensionId: string;
      dimensionName: string;
      dimensionMeta: DimensionMeta;
      sectionReviews: ReadonlyArray<SectionReview>;
    }
  | {
      scope: "overall";
      missionId: string;
      dimensionMetas: ReadonlyArray<DimensionMeta>;
    };

@Injectable()
export class QualityReviewerAgent extends BaseAgentRunner<
  QualityReviewerInput,
  QualityReview
> {
  readonly id = "AG-06-QR";
  readonly name = "Quality Reviewer";
  readonly tools: ReadonlyArray<AccessToolId> = ["rag-search", "TL-04-DIMMEM"];
  readonly forbiddenTools: ReadonlyArray<AccessToolId> = ["TL-02-EVSAVE"];
  readonly outputSchema = QualityReviewSchema;

  protected async executeImpl(
    _ctx: AgentRunContext<QualityReviewerInput>,
  ): Promise<{ output: unknown; tokensUsed: number; costUsd: number }> {
    throw new Error(
      `[${this.id}] Real LLM execution not yet wired — use HARNESS_AGENTS_STUB=1`,
    );
  }

  protected async stubOutput(
    ctx: AgentRunContext<QualityReviewerInput>,
  ): Promise<{ output: unknown; tokensUsed: number; costUsd: number }> {
    const { input } = ctx;
    if (input.scope === "dimension") {
      const avgSection =
        input.sectionReviews.length > 0
          ? input.sectionReviews.reduce((a, r) => a + r.overallScore, 0) /
            input.sectionReviews.length
          : 7;
      return {
        output: {
          scope: "dimension" as const,
          dimensionId: input.dimensionId,
          overallScore: Math.round(avgSection * 10) / 10,
          issues: ["stub: 无重大问题"],
          recommendations: ["补充交叉引用", "加强数据图表"],
          needsReresearch: avgSection < 5,
        },
        tokensUsed: 0,
        costUsd: 0,
      };
    }
    // overall
    const avg =
      input.dimensionMetas.length > 0
        ? input.dimensionMetas.reduce(
            (a, m) => a + (m.evidenceCount > 0 ? 7 : 5),
            0,
          ) / input.dimensionMetas.length
        : 7;
    return {
      output: {
        scope: "overall" as const,
        missionId: input.missionId,
        overallScore: Math.round(avg * 10) / 10,
        crossDimensionIssues: ["stub: 维度间逻辑一致性良好"],
        recommendations: ["加强跨维度因果推导", "补充长期趋势"],
        needsReresearch: avg < 5,
        dimensionsToReresearch: [],
      },
      tokensUsed: 0,
      costUsd: 0,
    };
  }
}
