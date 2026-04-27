/**
 * VerifierAgent —— 客观事实核验员（multi-mode 单一 class）
 *
 * 与 Reviewer 的根本区别:
 *   - Reviewer 评主观质量（流畅 / 结构 / 洞察）
 *   - Verifier 核客观事实（数字 / 时间 / 引用 / 一手二手）
 *
 * 4 种工作 mode（discriminatedUnion）:
 *   - citation-audit  : 核 [N] 引用是否对应真实 source
 *   - number-check    : 报告内数字与 source 是否一致
 *   - claim-grounding : 每个声明是否有 source 支持（grounded / ungrounded）
 *   - source-tier     : 来源分级（一手 / 二手 / 三手）
 *
 * 当前最小实现：仅 citation-audit 一个 duty，其他 mode 留 schema 占位，
 * 待后续 PR 接入 orchestrator 时再实现 prompt + duty。
 */

import { z } from "zod";
import {
  AgentSpec,
  DefineAgent,
} from "../../../../ai-harness/facade";
import { buildPromptFromDuty } from "../../utils/duty-loader";

const Citation = z.object({
  index: z.number().int(),
  url: z.string(),
  inlineQuote: z.string().optional(),
});

const Input = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("citation-audit"),
    topic: z.string(),
    language: z.enum(["zh-CN", "en-US"]),
    citations: z.array(Citation).min(1),
  }),
  z.object({
    mode: z.literal("number-check"),
    topic: z.string(),
    language: z.enum(["zh-CN", "en-US"]),
    claims: z.array(
      z.object({
        text: z.string(),
        sourceUrl: z.string(),
      }),
    ),
  }),
  z.object({
    mode: z.literal("claim-grounding"),
    topic: z.string(),
    language: z.enum(["zh-CN", "en-US"]),
    claims: z.array(z.string()),
  }),
  z.object({
    mode: z.literal("source-tier"),
    topic: z.string(),
    language: z.enum(["zh-CN", "en-US"]),
    sources: z.array(z.string()),
  }),
]);

const Verdict = z.object({
  index: z.number().int().optional(),
  url: z.string().optional(),
  status: z.enum([
    "verified",
    "unverified-but-plausible",
    "unverified-suspicious",
    "contradicted",
  ]),
  evidence: z.string(),
});

const Output = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("citation-audit"),
    summary: z.object({
      total: z.number().int(),
      verified: z.number().int(),
      unverified: z.number().int(),
      contradicted: z.number().int(),
    }),
    verdicts: z.array(Verdict),
  }),
  z.object({
    mode: z.literal("number-check"),
    summary: z.object({
      total: z.number().int(),
      matched: z.number().int(),
      mismatched: z.number().int(),
    }),
    verdicts: z.array(Verdict),
  }),
  z.object({
    mode: z.literal("claim-grounding"),
    summary: z.object({
      total: z.number().int(),
      grounded: z.number().int(),
      ungrounded: z.number().int(),
    }),
    verdicts: z.array(Verdict),
  }),
  z.object({
    mode: z.literal("source-tier"),
    tiers: z.array(
      z.object({
        url: z.string(),
        tier: z.enum(["primary", "secondary", "tertiary", "unknown"]),
        rationale: z.string(),
      }),
    ),
  }),
]);

export type VerifierInput = z.infer<typeof Input>;
export type VerifierOutput = z.infer<typeof Output>;

@DefineAgent({
  id: "playground.verifier",
  version: "1.0.0",
  identity: {
    role: "verifier",
    description:
      "客观事实核验员。一个 class，4 种 mode 覆盖引用 / 数字 / claim / 来源分级。",
  },
  loop: "react",
  toolCategories: ["information"],
  taskProfile: {
    creativity: "deterministic",
    outputLength: "medium",
    reasoningDepth: "moderate",
  },
  inputSchema: Input,
  outputSchema: Output,
  budget: { maxTokens: 12_000, maxIterations: 4 },
})
export class VerifierAgent extends AgentSpec<typeof Input, typeof Output> {
  buildSystemPrompt({ input }: { input: z.infer<typeof Input> }): string {
    const dutyMap: Record<typeof input.mode, string> = {
      "citation-audit": "citation-audit",
      "number-check": "number-check",
      "claim-grounding": "claim-grounding",
      "source-tier": "source-tier",
    };
    return buildPromptFromDuty("verifier", dutyMap[input.mode], {
      ...(input as Record<string, unknown>),
      currentDate: new Date().toISOString().slice(0, 10),
    });
  }
}
