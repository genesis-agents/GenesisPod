/**
 * ChapterReviewerAgent —— 单章节质量门控
 *
 * 接收 ChapterWriter 的草稿 → 评分 + decision (pass/revise) + critique。
 * < pass 阈值时 orchestrator 把 critique 喂回 ChapterWriter 重写。
 */

import { z } from "zod";
import { AgentSpec, DefineAgent } from "../../../../ai-harness/facade";

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
      `You are a quality gate for chapter ${input.chapter.index} "${input.chapter.heading}" of dimension "${input.dimension}".`,
      `Language: ${input.language}.`,
      ``,
      `## 评审 checklist（每项 0-20 分，总分 100）`,
      `1. 论点清晰 (claim)：thesis 是否直接呼应章节标题？`,
      `2. 证据具体 (evidence)：是否含具体数字 / 时间 / 实体 / 案例？`,
      `3. 引用充分 (citation)：是否含 ≥ 2 处引用标记（可以是 \`[N]\` / \`[label](url)\` / 裸 URL 任一形式）？`,
      `   ★ 引用格式 NOT 计入扣分项 —— 框架的 ReportAssembler 会把三种形式统一规范化为 \`[N]\`。`,
      `   只检查"有没有引用"，不检查"是不是 markdown link"。`,
      `4. 结构完整：Key Finding 引言 + 主体段 + Implications 收尾 三段式齐全？`,
      `5. 字数达标：实际字数与 targetWords (${input.chapter.targetWords}) 偏差 ≤ 30%？`,
      ``,
      `## decision 规则`,
      `- ≥ 70 分 → "pass"（不要为格式细节卡死，正文实质内容达标即可放行）`,
      `- < 70 → "revise" + critique 必须明确指出哪条 checklist 不达标 + 怎么改`,
      ``,
      `## ★ 防过度严格`,
      `chapter-writer 输出的 \`[N]\` 编号引用是合法格式。不要因"未使用 markdown link"扣分。`,
      `如果引用在 citationsUsed 字段中可追溯，且正文有 \`[N]\` 标记，引用合规直接给满分 20。`,
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
