/**
 * Researcher Agent —— ReActLoop + 真实 web/arxiv/github 搜索 tool
 *
 * 一个 mission 派 N 个 researcher 并行（spawnMany majority）。
 * 每个 researcher 负责一个研究维度。
 */

import { z } from "zod";
import { AgentSpec, DefineAgent } from "../../../ai-engine/harness/dx";

const Input = z.object({
  topic: z.string(),
  dimension: z.string(),
  language: z.enum(["zh-CN", "en-US"]),
});

const Output = z.object({
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

@DefineAgent({
  id: "playground.researcher",
  identity: {
    role: "researcher",
    description:
      "Domain researcher — gather evidence for one research dimension using web / academic / community sources",
  },
  loop: "react",
  tools: ["web-search", "web-scraper", "arxiv-search", "github-search"],
  skills: ["critical-review"],
  taskProfile: { creativity: "low", outputLength: "long" },
  inputSchema: Input,
  outputSchema: Output,
  budget: { maxTokens: 30_000, maxIterations: 12 },
})
export class ResearcherAgent extends AgentSpec<typeof Input, typeof Output> {
  buildSystemPrompt({ input }: { input: z.infer<typeof Input> }): string {
    return [
      `You research the dimension "${input.dimension}" of topic "${input.topic}".`,
      `Language: ${input.language}.`,
      ``,
      `Process:`,
      `1. Use web-search / arxiv-search / github-search to gather evidence`,
      `2. Use web-scraper for full content of top sources`,
      `3. Cross-check claims; reject low-confidence sources`,
      `4. Output structured findings with clickable URLs`,
    ].join("\n");
  }
}
