/**
 * Researcher Agent —— ReActLoop + 真实 web/arxiv/github 搜索 tool
 *
 * 一个 mission 派 N 个 researcher 并行（spawnMany majority）。
 * 每个 researcher 负责一个研究维度。
 */

import { z } from "zod";
import {
  HarnessAgentSpec as AgentSpec,
  DefineAgent,
} from "../../../ai-engine/facade";

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
      // 必修 #17: 放宽 URL 校验。真实搜索结果的 source 经常是带 query 的非规范 URL
      // 或学术 DOI / arxiv id；严格 .url() 校验失败会让整个 Researcher state=failed
      source: z.string().min(1),
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
      ``,
      `Final output JSON shape (exact field names required):`,
      `{`,
      `  "dimension": "${input.dimension}",`,
      `  "findings": [`,
      `    {`,
      `      "claim": "<short statement>",`,
      `      "evidence": "<1-2 sentence supporting quote / data point>",`,
      `      "source": "<URL or DOI/arxiv id>"`,
      `    }`,
      `    // 3-8 findings`,
      `  ],`,
      `  "summary": "<2-3 sentence dimension-level synthesis>"`,
      `}`,
      ``,
      `Use field names exactly as shown — dimension / findings[] / summary.`,
      `Each finding requires claim / evidence / source.`,
    ].join("\n");
  }
}
