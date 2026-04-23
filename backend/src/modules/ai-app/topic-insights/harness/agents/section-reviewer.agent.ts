/**
 * AG-04-SR · SectionReviewer
 *
 * 输入 SectionResult + plan → 输出 SectionReview（5 维评分 + 修订指令 + claims）。
 * Access matrix：只读 rag/knowledge-graph/TL-04-DIMMEM；严禁 TL-02-EVSAVE。
 */

import { Injectable, Optional } from "@nestjs/common";
import type { TaskProfile } from "@/modules/ai-engine/facade";
import { BaseAgentRunner } from "./base-agent-runner";
import { SectionReviewSchema, type SectionReview } from "./schemas";
import type { AccessToolId, AgentRunContext } from "./types";
import { LlmInvokerService } from "../llm";

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
  protected readonly taskProfile: TaskProfile = {
    creativity: "low",
    outputLength: "medium",
  };

  constructor(@Optional() llmInvoker?: LlmInvokerService) {
    super(llmInvoker);
  }

  protected buildSystemPrompt(
    _ctx: AgentRunContext<SectionReviewerInput>,
  ): string {
    return [
      "你是章节审核员。独立审核一个 SectionResult，按 5 维打分（accuracy / completeness / coherence / evidenceQuality / depth）。",
      "要求：",
      "1. overallScore 0-10",
      "2. 若 needsRevision=true，revisionInstructions 不少于 1 条",
      "3. 抽取 claims（事实性陈述）供后续 V5 认知循环使用，每个 claim 含 id / statement / evidenceRefs",
      "4. 严禁创造新 evidence 或修改正文",
      "",
      "严格 JSON 输出。",
    ].join("\n");
  }

  protected buildUserPrompt(
    ctx: AgentRunContext<SectionReviewerInput>,
  ): string {
    const { input } = ctx;
    const section = input.sectionResult;
    return [
      `revisionRound: ${input.revisionRound}`,
      input.priorReview
        ? `priorReview.overallScore: ${input.priorReview.overallScore}`
        : "",
      "",
      `section:`,
      `  sectionId=${section.sectionId}`,
      `  dimensionId=${section.dimensionId}`,
      `  title=${section.title}`,
      `  wordCount=${section.wordCount}`,
      `  keyFindings: ${section.keyFindings.map((kf) => kf.statement).join(" | ")}`,
      "",
      "section content:",
      section.content.slice(0, 6000),
      "",
      "请输出 SectionReview JSON。",
    ]
      .filter(Boolean)
      .join("\n");
  }

  protected stubOutput(
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
    return Promise.resolve({ output: review, tokensUsed: 0, costUsd: 0 });
  }
}
