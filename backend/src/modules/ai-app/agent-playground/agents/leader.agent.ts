/**
 * Leader Agent —— 解析 topic + 拆维度。
 *
 * 与 LeaderWorkerLoop 的 ILeaderBrain 互补：本 Agent 是声明式 spec（@DefineAgent），
 * Orchestrator 调用它先解析维度，再决定派几个 Researcher。
 *
 * 把 ILeaderBrain 的能力下沉为可复用的 spec agent —— 业务方更易上手。
 */

import { z } from "zod";
import {
  HarnessAgentSpec as AgentSpec,
  DefineAgent,
} from "../../../ai-engine/facade";

const Input = z.object({
  topic: z.string(),
  depth: z.enum(["quick", "standard", "deep"]),
  language: z.enum(["zh-CN", "en-US"]),
});

const Output = z.object({
  themeSummary: z.string(),
  dimensions: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        rationale: z.string(),
      }),
    )
    .min(2)
    .max(7),
});

@DefineAgent({
  id: "playground.leader",
  identity: {
    role: "leader",
    description:
      "Research lead — understand intent, decompose topic into 2-7 research dimensions",
  },
  loop: "react",
  taskProfile: { creativity: "low", outputLength: "medium" },
  inputSchema: Input,
  outputSchema: Output,
  budget: { maxTokens: 6_000, maxIterations: 3 },
})
export class LeaderAgent extends AgentSpec<typeof Input, typeof Output> {
  buildSystemPrompt({ input }: { input: z.infer<typeof Input> }): string {
    const target =
      input.depth === "quick" ? "2-3" : input.depth === "deep" ? "5-7" : "3-5";
    return [
      `You are the research lead for the topic: "${input.topic}".`,
      `Language: ${input.language}.`,
      `Depth: ${input.depth} → produce ${target} dimensions.`,
      ``,
      `Each dimension must be:`,
      `- Mutually exclusive (no overlap)`,
      `- Collectively exhaustive (covers the topic)`,
      `- Researchable in 5-10 minutes by one researcher`,
      ``,
      `Final output JSON shape (exact field names required):`,
      `{`,
      `  "themeSummary": "<one paragraph summarizing the research frame>",`,
      `  "dimensions": [`,
      `    {`,
      `      "id": "<short-stable-id e.g. dim-1>",`,
      `      "name": "<short title>",`,
      `      "rationale": "<1-2 sentences why this dimension matters>"`,
      `    }`,
      `    // ... ${target} dimensions total`,
      `  ]`,
      `}`,
      ``,
      `Use field names exactly as shown — id / name / rationale.`,
      `Do NOT use alternative field names like "description", "title", or "whyMECE".`,
    ].join("\n");
  }
}
