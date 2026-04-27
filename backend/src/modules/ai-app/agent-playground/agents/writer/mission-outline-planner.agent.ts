/**
 * MissionOutlinePlannerAgent —— Writer W1：写作大纲规划
 *
 * 上游：mission-pipeline-baseline.md §3.7 W1 / mission-pipeline-writer-artifact.md §3.1
 *
 * 职责：在 W2 ChapterWriter 并行写章前，先做一次：
 *   - 章节骨架 chapterOutlines
 *   - 字数分配 targetWordsPerChapter
 *   - 事实分配 factAllocation（解决 TI 章节抢/漏事实的问题）
 *   - 图分配 figurePlan（仅 withFigures=true 时启用）
 *
 * 不调工具，纯规划。
 */

import { z } from "zod";
import {
  HarnessAgentSpec as AgentSpec,
  DefineAgent,
} from "../../../../ai-engine/facade";

const Input = z.object({
  topic: z.string(),
  language: z.enum(["zh-CN", "en-US"]),
  audienceProfile: z.enum(["executive", "domain-expert", "general-public"]),
  styleProfile: z.enum(["academic", "executive", "journalistic", "technical"]),
  lengthProfile: z.enum(["brief", "standard", "deep", "extended"]),
  withFigures: z.boolean(),
  plan: z.object({
    themeSummary: z.string(),
    dimensions: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        rationale: z.string(),
      }),
    ),
  }),
  factTable: z
    .array(
      z.object({
        id: z.string(),
        entity: z.string(),
        attribute: z.string(),
        value: z.string(),
      }),
    )
    .optional(),
  figureCandidates: z
    .array(
      z.object({
        id: z.string(),
        caption: z.string(),
        fromDimensionId: z.string().optional(),
      }),
    )
    .optional(),
});

const Output = z.object({
  chapterOutlines: z.array(
    z.object({
      sectionId: z.string(),
      heading: z.string(),
      subheadings: z.array(z.string()).default([]),
      thesis: z.string().min(10),
      keyPointsToCover: z.array(z.string()).min(1),
    }),
  ),
  targetWordsPerChapter: z.record(z.string(), z.number()),
  factAllocation: z.record(z.string(), z.array(z.string())).default({}),
  figurePlan: z.record(z.string(), z.array(z.string())).default({}),
});

@DefineAgent({
  id: "playground.writer.outline-planner",
  version: "1.0.0",
  identity: {
    role: "outline-planner",
    description:
      "W1 outline planner — pre-allocate facts/figures to chapters before parallel writing",
  },
  loop: "react",
  toolCategories: [],
  taskProfile: {
    creativity: "low",
    outputLength: "medium",
    reasoningDepth: "moderate",
  },
  inputSchema: Input,
  outputSchema: Output,
  budget: { maxTokens: 8_000, maxIterations: 2, maxWallTimeMs: 60_000 },
})
export class MissionOutlinePlannerAgent extends AgentSpec<
  typeof Input,
  typeof Output
> {
  buildSystemPrompt({ input }: { input: z.infer<typeof Input> }): string {
    const target = lengthTarget(input.lengthProfile);
    const perChapter = Math.round(target / input.plan.dimensions.length);
    return [
      `You are the W1 outline planner for a ${input.lengthProfile} (~${target} words) report on "${input.topic}".`,
      `Audience: ${input.audienceProfile}. Style: ${input.styleProfile}.`,
      input.language === "zh-CN" ? "用中文输出。" : "Respond in English.",
      ``,
      `## Your job (no LLM creative writing yet — only plan)`,
      ``,
      `For each plan.dimension, output a chapterOutline with:`,
      `- sectionId: dim.id`,
      `- heading: 章节标题（可比 dim.name 更生动具体）`,
      `- subheadings: 2-4 个 h3 子节标题（可空，short report 不必有）`,
      `- thesis: 一句话章节核心论点（≥10 chars）`,
      `- keyPointsToCover: 该章必须覆盖的 3-5 个要点（用于 ChapterWriter 检查覆盖度）`,
      ``,
      `## Allocations`,
      `- targetWordsPerChapter: 给每个 sectionId 分配字数（合计 ≈ ${target}，每章约 ${perChapter}）`,
      `- factAllocation: { sectionId: [factId, ...] } 把 factTable 中的事实显式分配到章节，`,
      `  避免后续章节抢/漏事实。每事实只能分给 1 章。`,
      `- figurePlan: { sectionId: [figureId, ...] } 仅 withFigures=true 时填，每章 1-3 张。${input.withFigures ? "" : "本次 withFigures=false，figurePlan 给 {} 空对象即可。"}`,
      ``,
      `## Output JSON shape`,
      `{`,
      `  "chapterOutlines": [{ "sectionId": "...", "heading": "...", "subheadings": [...], "thesis": "...", "keyPointsToCover": [...] }],`,
      `  "targetWordsPerChapter": { "<sectionId>": ${perChapter}, ... },`,
      `  "factAllocation": { "<sectionId>": ["fact-1", "fact-3"] },`,
      `  "figurePlan": { "<sectionId>": ["fig-id-1"] }`,
      `}`,
    ].join("\n");
  }
}

function lengthTarget(p: "brief" | "standard" | "deep" | "extended"): number {
  return { brief: 3000, standard: 8000, deep: 15000, extended: 25000 }[p];
}
