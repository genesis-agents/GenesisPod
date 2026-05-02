/**
 * ChapterReviewerAgent —— 单章节质量门控
 *
 * 接收 ChapterWriter 的草稿 → 评分 + decision (pass/revise) + critique。
 * < pass 阈值时 orchestrator 把 critique 喂回 ChapterWriter 重写。
 */

import { z } from "zod";
import {
  AgentSpec,
  DefineAgent,
  CHAPTER_REVIEWER_INTERNAL_MAX_ITERATIONS,
} from "@/modules/ai-harness/facade";

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

/** Iter 2d: critique 改结构化 issues 数组（替代大段叙述） */
const ReviewIssue = z.object({
  severity: z.enum(["must-fix", "should-fix", "nice-to-have"]),
  dimension: z.enum([
    "evidence",
    "logic",
    "structure",
    "citation",
    "length",
    "style",
  ]),
  /** 例 "§2 第 3 段" / "Implications" */
  pointer: z.string(),
  /** 一句话问题 */
  issue: z.string(),
  /** 一句话改法（动词开头）*/
  suggestion: z.string(),
});

const Output = z.object({
  index: z.number().int(),
  decision: z.enum(["pass", "revise"]),
  score: z.number().int().min(0).max(100),
  /** 结构化 issues（最多 6 条；pass 时可空数组） */
  issues: z.array(ReviewIssue).max(6).default([]),
  /** 1-2 句话总评摘要（≤ 150 字符）—— 替代旧 critique 中的"概括陈述"部分 */
  summary: z.string().max(300),
  /**
   * @deprecated 兼容旧客户端 —— 平铺 issues 拼成的可读文本。
   * 新前端应消费 issues + summary，不要直接展示这个字段。
   */
  critique: z.string().optional(),
});

@DefineAgent({
  id: "playground.chapter-reviewer",
  identity: {
    role: "chapter-reviewer",
    description: "Quality gate for a single chapter draft",
  },
  loop: "simple",
  // PR-X-skill-bridge: 6 项 chapter QA gate
  skills: ["chapter-quality-gate"],
  taskProfile: {
    creativity: "deterministic",
    outputLength: "short",
    taskKind: "review",
  },
  inputSchema: Input,
  outputSchema: Output,
  // ★ 2026-05-01 (PR-G iter9): maxIterations 走集中常量
  budget: {
    maxTokens: 6_000,
    maxIterations: CHAPTER_REVIEWER_INTERNAL_MAX_ITERATIONS,
  },
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
      `## 评审 checklist（核心评分维度，总分 100）`,
      `★ 核心理念：质量优先，字数仅作参考。一段 800 字精炼论述胜过 2000 字注水。`,
      ``,
      `1. 观点独立性 (25 分)：每段是否包含独立、具体、可被证伪的 thesis claim？`,
      `   ★ 段首仅复述章节标题（如标题"产品定义"首句也是"本章定义产品"）= 不通过`,
      `   ★ 全章必须 ≥ 1~2 个独立分析判断（"这意味着..."/"核心原因在于..."/"值得警惕的是..."），`,
      `      不能仅复述 finding`,
      `2. 证据具体 (25 分)：是否含具体数字 / 时间 / 实体 / 案例？是否对 finding 有真实分析？`,
      `3. 引用充分 (20 分)：是否含 ≥ 2 处引用标记（可以是 \`[N]\` / \`[label](url)\` / 裸 URL 任一形式）？`,
      `   ★ 引用格式 NOT 计入扣分项 —— 框架的 ReportAssembler 会把三种形式统一规范化为 \`[N]\`。`,
      `4. 去模板化 (20 分)：是否避免了固定八股？`,
      `   ★ 不允许每章首段都用 \`> **核心判断**：\` blockquote + 末段都用 \`**Implications**：\` 前缀`,
      `   ★ 不允许同一句式在所有章节复用（章节有自己的开头/收尾节奏）`,
      `   ★ 不允许"随着 X 的发展"/"在当今"/"众所周知"/"综上所述"等套话开头`,
      `5. 字数参考 (10 分)：targetWords ${input.chapter.targetWords} 字，实际 ${input.chapter.wordCount} 字。`,
      `   ★ 字数权重最低（10/100）。仅极端不足（< target × 40%）才扣满 10 分。`,
      `   ★ 字数超出（甚至 1.5×）不扣分 —— 详尽分析比硬塞更有价值。`,
      `   ★ 字数仅参考维度，不要因字数差异作为 revise 主理由。`,
      ``,
      `## decision 规则`,
      `- ≥ 60 分 → "pass"（核心 4 维度达标即可放行，字数不要求严格）`,
      `- < 60 → "revise" + critique 必须明确指出哪条 checklist 不达标 + 怎么改`,
      `- ★ revise 主理由必须是观点 / 证据 / 引用 / 去模板化 中的问题，不能是字数。`,
      `- ★ 字数硬规则：仅当字数 < target × 40%（极端不足）才强制 revise；其他情况字数不当 revise 触发条件。`,
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
      `  "summary": "<1-2 句总评，≤ 150 字>",`,
      `  "issues": [  // 0-6 条结构化问题。pass 时可为空数组。`,
      `    {`,
      `      "severity": "must-fix" | "should-fix" | "nice-to-have",`,
      `      "dimension": "evidence" | "logic" | "structure" | "citation" | "length" | "style",`,
      `      "pointer": "<位置如 §2 第 3 段 / 首段 / 末段>",`,
      `      "issue": "<一句话问题描述>",`,
      `      "suggestion": "<一句话改法，动词开头>"`,
      `    }`,
      `    // ★ 禁止"建议提升整体质量"这种笼统描述`,
      `    // ★ revise 必须 ≥ 1 条 must-fix；pass 可全部 nice-to-have 或空`,
      `  ],`,
      `  "critique": "<可选，旧客户端兼容字段：把 issues 串成可读文本>"`,
      `}`,
    ].join("\n");
  }
}
