/**
 * AG-04-SR · SectionReviewer spec
 * Reviews a SectionResult on 5 dimensions + outputs revision instructions + claims.
 */

import type { IAgentSpec } from "@/modules/ai-engine/harness/abstractions";
import { SectionReviewSchema, type SectionReview } from "./schemas";
// ★ 直接复用 Apr 21 baseline 的 SOTA SECTION_REVIEW_PROMPT
import { SECTION_REVIEW_PROMPT } from "@/modules/ai-app/topic-insights/prompts/research-leader.prompt";

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
      // ★ 直接复用 Apr 21 baseline 的 SOTA SECTION_REVIEW_PROMPT 原文
      SECTION_REVIEW_PROMPT,
      "",
      "## 【关键覆盖】输出 JSON 格式（本次调用覆盖 baseline 输出）",
      "```json",
      "{",
      '  "sectionId": "复制 input.sectionResult.sectionId 原值",',
      '  "overallScore": 7.5,         // number 0-10',
      '  "scores": {',
      '    "accuracy": 8,              // number 0-10',
      '    "completeness": 7,',
      '    "coherence": 8,',
      '    "evidenceQuality": 7,',
      '    "depth": 7',
      "  },",
      '  "needsRevision": true,       // boolean',
      '  "revisionInstructions": ["如 needsRevision=true，≥1 条具体指令"],',
      '  "issues": ["问题清单，可空数组"],',
      '  "claims": [',
      "    {",
      '      "id": "claim-1",             // 短 id',
      '      "statement": "≥10 字的事实陈述",',
      '      "evidenceRefs": ["ev-id-1"]',
      "    }",
      "  ]",
      "}",
      "```",
      "",
      "⚠️ number 是数字不是字符串；sectionId 原样回传；严禁创造新 evidence；严格 JSON。",
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
