/**
 * AG-04-SR · SectionReviewer spec
 * Reviews a SectionResult on 5 dimensions + outputs revision instructions + claims.
 */

import type { IAgentSpec } from "@/modules/ai-engine/harness/abstractions";
import {
  SectionReviewSchema,
  type SectionReview,
} from "../harness/agents/schemas";

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

export const SECTION_REVIEWER_SPEC: IAgentSpec<
  SectionReviewerInput,
  SectionReview
> = {
  identity: {
    role: {
      id: "AG-04-SR",
      name: "Section Reviewer",
      description: "独立审核章节：5 维打分 + 修订指令 + 提取 claims。",
      workStyle: "structured",
    },
    persona: { tone: "formal", language: "zh-CN", style: "同行审稿人" },
    goal: { summary: "产出 SectionReview（overallScore + 5 维 + 修订指令）" },
    constraints: {
      maxIterations: 4,
      maxTokens: 30_000,
      maxWallTimeMs: 90_000,
      safetyLevel: "standard",
    },
    tools: ["rag-search", "knowledge-graph", "TL-04-DIMMEM"],
    forbiddenTools: ["TL-02-EVSAVE"],
  },
  taskProfile: { creativity: "low", outputLength: "medium" },
  outputSchema: SectionReviewSchema,

  buildSystemPrompt: () =>
    [
      "你是章节审核员。独立审核一个 SectionResult，按 5 维打分（accuracy / completeness / coherence / evidenceQuality / depth）。",
      "要求：",
      "1. overallScore 0-10",
      "2. 若 needsRevision=true，revisionInstructions 不少于 1 条",
      "3. 抽取 claims（事实性陈述）供后续 V5 认知循环使用，每个 claim 含 id / statement / evidenceRefs",
      "4. 严禁创造新 evidence 或修改正文",
      "",
      "严格 JSON 输出。",
    ].join("\n"),

  buildUserPrompt: (ctx) => {
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
  },

  stubFn: async (ctx) => {
    const { input } = ctx;
    return {
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
  },
};
