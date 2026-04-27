/**
 * ChapterReviewerAgent —— 单章节质量门控
 *
 * 接收 ChapterWriter 的草稿 → 评分 + decision (pass/revise) + critique。
 * < pass 阈值时 orchestrator 把 critique 喂回 ChapterWriter 重写。
 */

import { z } from "zod";
import {
  HarnessAgentSpec as AgentSpec,
  DefineAgent,
} from "../../../../ai-engine/facade";

const Input = z.object({
  topic: z.string(),
  dimension: z.string(),
  language: z.enum(["zh-CN", "en-US"]),
  chapter: z.object({
    index: z.number().int(),
    heading: z.string(),
    thesis: z.string(),
    body: z.string(),
    wordCount: z.number().int(),
    targetWords: z.number().int(),
  }),
});

const Output = z.object({
  index: z.number().int(),
  decision: z.enum(["pass", "revise"]),
  score: z.number().int().min(0).max(100),
  critique: z.string(),
});

@DefineAgent({
  id: "playground.chapter-reviewer",
  identity: {
    role: "chapter-reviewer",
    description: "Quality gate for a single chapter draft",
  },
  loop: "react",
  taskProfile: { creativity: "deterministic", outputLength: "short" },
  inputSchema: Input,
  outputSchema: Output,
  budget: { maxTokens: 6_000, maxIterations: 3 },
})
export class ChapterReviewerAgent extends AgentSpec<
  typeof Input,
  typeof Output
> {
  buildSystemPrompt({ input }: { input: z.infer<typeof Input> }): string {
    return [
      `You are a strict quality gate for chapter ${input.chapter.index} "${input.chapter.heading}" of dimension "${input.dimension}".`,
      `Language: ${input.language}.`,
      ``,
      `## 评审 checklist（每项 0-20 分，总分 100）`,
      `1. 论点清晰 (claim)：thesis 是否直接呼应章节标题？`,
      `2. 证据具体 (evidence)：是否含具体数字 / 时间 / 实体 / 案例？`,
      `3. 引用合规 (citation)：是否用 markdown link 引用 source URL？至少 2 个`,
      `4. 结构完整：Key Finding 引言 + 主体段 + Implications 收尾 三段式齐全？`,
      `5. 字数达标：实际字数与 targetWords (${input.chapter.targetWords}) 偏差 ≤ 30%？`,
      ``,
      `## decision 规则`,
      `- ≥ 75 分 → "pass"`,
      `- < 75 → "revise" + critique 必须明确指出哪条 checklist 不达标 + 怎么改`,
      ``,
      `## 章节草稿（${input.chapter.wordCount} 字）`,
      ``,
      input.chapter.body.slice(0, 6000),
      ``,
      `## 输出 JSON shape (字段名必须完全匹配)`,
      `{`,
      `  "index": ${input.chapter.index},`,
      `  "decision": "pass" or "revise",`,
      `  "score": <0-100 整数>,`,
      `  "critique": "<具体可执行的修改建议；pass 时给出强项总结>"`,
      `}`,
    ].join("\n");
  }
}
