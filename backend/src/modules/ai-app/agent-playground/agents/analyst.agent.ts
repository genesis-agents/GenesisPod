/**
 * Analyst Agent —— ReflexionLoop + self/critical verifiers
 *
 * 整合 N 个 researcher 的结果，做交叉验证、矛盾消解、洞察归纳。
 * < passThreshold 自动 critique → revise，最多 maxRevisions 轮。
 */

import { z } from "zod";
import {
  HarnessAgentSpec as AgentSpec,
  DefineAgent,
} from "../../../ai-engine/facade";

const ResearcherFinding = z.object({
  dimension: z.string(),
  findings: z.array(
    z.object({
      claim: z.string(),
      evidence: z.string(),
      source: z.string().url(),
    }),
  ),
  summary: z.string(),
});

const Input = z.object({
  topic: z.string(),
  language: z.enum(["zh-CN", "en-US"]),
  researcherResults: z.array(ResearcherFinding).min(1),
});

const Output = z.object({
  insights: z.array(
    z.object({
      headline: z.string(),
      narrative: z.string(),
      supportingDimensions: z.array(z.string()),
      confidence: z.number().min(0).max(1),
    }),
  ),
  contradictions: z
    .array(
      z.object({
        claim: z.string(),
        conflictingSources: z.array(z.string()),
        resolution: z.string(),
      }),
    )
    .optional(),
  themeSummary: z.string(),
});

@DefineAgent({
  id: "playground.analyst",
  identity: {
    role: "analyst",
    description: "Synthesize multi-dimension research into top insights",
  },
  loop: "reflexion",
  skills: ["critical-review"],
  verifiers: ["self", "critical"],
  taskProfile: { creativity: "low", outputLength: "long" },
  inputSchema: Input,
  outputSchema: Output,
  budget: { maxTokens: 25_000, maxIterations: 8 },
})
export class AnalystAgent extends AgentSpec<typeof Input, typeof Output> {
  buildSystemPrompt({ input }: { input: z.infer<typeof Input> }): string {
    return [
      `You synthesize research on "${input.topic}" from ${input.researcherResults.length} dimensions.`,
      `Language: ${input.language}.`,
      ``,
      `Goals:`,
      `- Identify 3-7 top insights with cross-dimension support`,
      `- Surface contradictions between sources; propose resolution`,
      `- Each insight needs confidence score (0..1) + supporting dimensions`,
    ].join("\n");
  }
}
