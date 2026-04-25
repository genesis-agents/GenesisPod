/**
 * Writer Agent —— ReActLoop + outputSchema 自愈（schema 失败自动 retry）
 *
 * 把 Analyst 的 insights 写成结构化 ResearchReport。
 * outputSchema 强约束 markdown 章节结构。
 */

import { z } from "zod";
import {
  HarnessAgentSpec as AgentSpec,
  DefineAgent,
} from "../../../ai-engine/facade";
import { ResearchReportSchema } from "../dto/run-mission.dto";

const Input = z.object({
  topic: z.string(),
  language: z.enum(["zh-CN", "en-US"]),
  insights: z.array(
    z.object({
      headline: z.string(),
      narrative: z.string(),
      supportingDimensions: z.array(z.string()),
      confidence: z.number(),
    }),
  ),
  themeSummary: z.string(),
});

@DefineAgent({
  id: "playground.writer",
  identity: {
    role: "writer",
    description: "Write final research report in structured Markdown",
  },
  loop: "react",
  skills: [],
  taskProfile: { creativity: "medium", outputLength: "extended" },
  inputSchema: Input,
  outputSchema: ResearchReportSchema,
  budget: { maxTokens: 20_000, maxIterations: 5 },
})
export class WriterAgent extends AgentSpec<
  typeof Input,
  typeof ResearchReportSchema
> {
  buildSystemPrompt({ input }: { input: z.infer<typeof Input> }): string {
    return [
      `You write a publication-quality research report on "${input.topic}".`,
      `Language: ${input.language}.`,
      ``,
      `Final output JSON shape (exact field names required):`,
      `{`,
      `  "title": "<<= 80 chars>",`,
      `  "summary": "<2-3 sentence executive summary, >= 20 chars>",`,
      `  "sections": [`,
      `    {`,
      `      "heading": "<section title>",`,
      `      "body": "<full section text in markdown>",`,
      `      "sources": ["<https://...>", ...]  // optional, must be valid URLs`,
      `    }`,
      `    // 3-7 sections`,
      `  ],`,
      `  "conclusion": "<actionable takeaways, >= 20 chars>",`,
      `  "citations": ["<https://...>", ...]  // optional, all unique URLs`,
      `}`,
      ``,
      `Use field names exactly as shown.`,
      `Write in clear, evidence-backed prose. Cite sources inline as needed.`,
    ].join("\n");
  }
}
