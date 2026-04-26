/**
 * ChapterWriterAgent —— 撰写单个章节（参照 TI SECTION_WRITING_SYSTEM_PROMPT）
 *
 * 严格写作规范：内联加粗、禁止套话、引用编号、列表/段落规则。
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
  chapter: z.object({
    index: z.number().int(),
    heading: z.string(),
    thesis: z.string(),
    keyPoints: z.array(z.string()),
  }),
  sources: z.array(
    z.object({
      claim: z.string(),
      evidence: z.string(),
      source: z.string(),
    }),
  ),
  targetWords: z.number().int().min(200).max(5000),
  /** 之前已写完的章节标题列表（用于去重，不要重复前文） */
  previousChapterHeadings: z.array(z.string()).optional(),
  previousCritique: z.string().optional(),
  previousDraft: z.string().optional(),
});

const Output = z.object({
  index: z.number().int(),
  heading: z.string(),
  body: z.string(),
  wordCount: z.number().int(),
  citationsUsed: z.array(z.string()),
});

@DefineAgent({
  id: "playground.chapter-writer",
  identity: {
    role: "chapter-writer",
    description:
      "Writes one chapter of a dimension report, TI-style strict format",
  },
  loop: "react",
  taskProfile: { creativity: "medium", outputLength: "long" },
  inputSchema: Input,
  outputSchema: Output,
  budget: { maxTokens: 18_000, maxIterations: 4 },
})
export class ChapterWriterAgent extends AgentSpec<typeof Input, typeof Output> {
  buildSystemPrompt({ input }: { input: z.infer<typeof Input> }): string {
    const sourceList = input.sources
      .map(
        (s, i) =>
          `  [${i + 1}] claim=${s.claim} | evidence=${s.evidence.slice(0, 240)} | source=${s.source}`,
      )
      .join("\n");
    const lang =
      input.language === "zh-CN"
        ? "用简体中文撰写。"
        : "Write in formal English.";
    return [
      `你是一位专业的研究分析师，负责撰写研究报告的第 ${input.chapter.index} 章。`,
      lang,
      ``,
      `## 章节规格`,
      `- 维度: ${input.dimension}（topic: ${input.topic}）`,
      `- 章节标题: ${input.chapter.heading}`,
      `- 章节核心论点 (thesis): ${input.chapter.thesis}`,
      `- keyPoints: ${input.chapter.keyPoints.map((p, i) => `${i + 1}) ${p}`).join("；")}`,
      `- 目标字数: 约 ${input.targetWords} 字（偏差 ≤ 30%）`,
      ``,
      `## 核心要求`,
      `1. **聚焦性**: 只写本章节，不要越界其他章节内容`,
      `2. **深度**: 即使字数有限，也要有洞察力，不是信息堆砌`,
      `3. **证据支撑**: 关键论点必须有引用，使用 \`[N]\` 格式（N 对应下方"可用资料"编号，从 1 开始）`,
      `4. **连贯性**: 与前置章节保持逻辑连贯，避免重复前文论点`,
      ``,
      `## 写作风格规范`,
      `- 专业、客观、简洁；用具体数据和事实说话`,
      `- 全文以**段落论述**为主体，每段 100-300 字，围绕一个分析论点展开`,
      `- 列表只用于并列同类项目；数据佐证和因果推理必须留在段落中展开，不要拆成独立列表项`,
      `- **列表项不得超过 60 字**：超过 60 字的内容必须写成段落`,
      `- 段落中可适当用 **加粗** 强调核心论点（必须是实质性名词/论断，嵌入句中，不独占一行）`,
      ``,
      `## 章节结构（必须遵循）`,
      `1. **首段引言**：一行 markdown blockquote："> **核心判断**：<本章最关键结论>"`,
      `2. **主体 3-5 段**：每段一个 keyPoint，含具体数字 / 时间 / 实体 / 案例 + \`[N]\` 引用`,
      `3. **末段 Implications**：以 "**Implications**：" 开头一段，写本章对读者的实际意义`,
      ``,
      `## 去重与独特性（重要）`,
      `- 不要在章节开头重复研究背景或维度概述`,
      `- 不要用"随着...的发展"、"在当今..."、"根据 XX 报告..."等套话开头`,
      `- 必须包含 ≥ 1 个独立分析判断（"这意味着..."、"核心原因在于..."、"值得警惕的是..."）`,
      input.previousChapterHeadings && input.previousChapterHeadings.length > 0
        ? `\n### 已写过的前置章节（避免重复）\n${input.previousChapterHeadings.map((h, i) => `  - ${i + 1}. ${h}`).join("\n")}\n`
        : "",
      ``,
      `## 严禁格式（违反将被 reviewer 打回）`,
      `- ❌ 加粗独占一行（如 "**关键瓶颈**" 后换行写正文）`,
      `- ❌ 加粗段落开头导语句（"**综合现有证据，可以得出**：..."）`,
      `- ❌ 加粗序数词 / 过渡词（"**其一**"、"**其二**"）`,
      `- ❌ 本章要点块（任何 "**本章要点**" 标题）`,
      `- ❌ 无 marker 短句独行`,
      `- ❌ 字数统计 / 编辑备注（如 "(约 850 字)"）`,
      `- ❌ HTML 标签 / HTML 实体`,
      ``,
      input.previousCritique
        ? `## 上一轮 Reviewer critique（必须针对性修复）\n${input.previousCritique}\n`
        : "",
      input.previousDraft
        ? `\n## 上一轮草稿（仅供参考，不要原样重发，针对 critique 重构）\n${input.previousDraft.slice(0, 2500)}\n`
        : "",
      ``,
      `## 可用资料（[N] 引用编号 = 下方编号）`,
      sourceList,
      ``,
      `## 输出 JSON shape (字段名必须完全匹配)`,
      `{`,
      `  "index": ${input.chapter.index},`,
      `  "heading": "${input.chapter.heading}",`,
      `  "body": "<完整 markdown 正文，含 [N] 引用编号>",`,
      `  "wordCount": <实际字数>,`,
      `  "citationsUsed": ["<source url 1>", "<source url 2>"]  // 与 [N] 编号对应的 source url 列表`,
      `}`,
    ].join("\n");
  }
}
