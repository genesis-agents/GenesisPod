/**
 * AG-09-HV · HypothesisVerifier spec
 */

import type { IAgentSpec } from "@/modules/ai-engine/harness/abstractions";
import {
  HypothesisVerifierResultSchema,
  type HypothesisVerifierResult,
} from "./schemas";

export interface HypothesisVerifierInput {
  readonly hypotheses: ReadonlyArray<{ id: string; statement: string }>;
  readonly evidenceSummaries: ReadonlyArray<{
    id: string;
    title: string;
    snippet: string;
  }>;
}

export const HYPOTHESIS_VERIFIER_SPEC: IAgentSpec<
  HypothesisVerifierInput,
  HypothesisVerifierResult
> = {
  identity: {
    role: {
      id: "AG-09-HV",
      name: "Hypothesis Verifier",
      description: "对假设 verdict 为 verified / refuted / inconclusive。",
      workStyle: "structured",
    },
    persona: { tone: "formal", language: "zh-CN", style: "严谨研究员" },
    goal: {
      summary:
        "产出 HypothesisVerifierResult（verdict + confidence + reasoning）",
    },
    constraints: {
      maxIterations: 3,
      maxTokens: 30_000,
      maxWallTimeMs: 90_000,
      safetyLevel: "standard",
    },
    tools: ["rag-search"],
    forbiddenTools: ["TL-02-EVSAVE"],
  },
  taskProfile: { creativity: "deterministic", outputLength: "medium" },
  outputSchema: HypothesisVerifierResultSchema,

  buildSystemPrompt: () =>
    [
      "你是假设验证员。对每个 hypothesis：",
      "1. 基于提供的 evidence 决定 verdict ∈ {verified, refuted, inconclusive}",
      "2. 列出 supportingEvidenceIds（来自 evidenceSummaries）",
      "3. confidence 0-1",
      "4. reasoning 简明说明",
      "",
      "只可使用提供的 evidence。严格 JSON 输出。",
    ].join("\n"),

  buildUserPrompt: (ctx) => {
    const { input } = ctx;
    return [
      "hypotheses:",
      ...input.hypotheses.map((h) => `  - ${h.id}: ${h.statement}`),
      "",
      "evidenceSummaries:",
      ...input.evidenceSummaries
        .slice(0, 15)
        .map((e) => `  - ${e.id}: ${e.title}\n    ${e.snippet.slice(0, 150)}`),
      "",
      "请输出 HypothesisVerifierResult JSON。",
    ].join("\n");
  },

  stubFn: async (ctx) => {
    const { input } = ctx;
    return {
      hypotheses: input.hypotheses.map((h) => ({
        id: h.id,
        statement: h.statement,
        verdict: "inconclusive" as const,
        supportingEvidenceIds: input.evidenceSummaries
          .slice(0, 2)
          .map((e) => e.id),
        confidence: 0.5,
        reasoning: "stub: insufficient evidence to verify",
      })),
    };
  },
};
