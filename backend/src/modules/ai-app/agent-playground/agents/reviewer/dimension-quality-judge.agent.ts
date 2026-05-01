/**
 * DimensionQualityJudgeAgent —— 维度级 5-axis 评分（TI 同款）
 *
 * 5 个维度：
 *   - 广度 breadth：是否覆盖该维度的多个子主题
 *   - 深度 depth：每个子主题是否有充分论证
 *   - 证据 evidence：是否引用具体数据 / 时间 / 实体
 *   - 连贯性 coherence：章节衔接是否流畅、无重复
 *   - 时效性 freshness：引用的 source 是否近期
 *
 * 输出 grade（excellent/good/fair/poor）+ overall 总分 + 5 axis 分项。
 */

import { z } from "zod";
import { AgentSpec, DefineAgent } from "../../../../ai-harness/facade";

const Input = z.object({
  topic: z.string(),
  dimension: z.string(),
  language: z.enum(["zh-CN", "en-US"]),
  abstract: z.string(),
  fullMarkdown: z.string(),
  totalWordCount: z.number().int(),
  /** 引用的 source 列表（含日期信息） */
  sources: z.array(
    z.object({
      url: z.string(),
      publishedDate: z.string().optional(),
    }),
  ),
});

const AxisScore = z.object({
  score: z.number().int().min(0).max(100),
  comment: z.string(),
});

const Output = z.object({
  dimension: z.string(),
  overall: z.number().int().min(0).max(100),
  grade: z.enum(["excellent", "good", "fair", "poor"]),
  axes: z.object({
    breadth: AxisScore,
    depth: AxisScore,
    evidence: AxisScore,
    coherence: AxisScore,
    freshness: AxisScore,
  }),
  summary: z.string(),
});

@DefineAgent({
  id: "playground.dimension-quality-judge",
  identity: {
    role: "quality-judge",
    description: "5-axis quality grading for a dimension report",
  },
  loop: "simple",
  // PR-X-skill-bridge: per-dim 5-axis 评分协议
  skills: ["dimension-quality-review"],
  taskProfile: {
    creativity: "deterministic",
    outputLength: "medium",
    taskKind: "review",
  },
  inputSchema: Input,
  outputSchema: Output,
  budget: { maxTokens: 8_000, maxIterations: 3 },
})
export class DimensionQualityJudgeAgent extends AgentSpec<
  typeof Input,
  typeof Output
> {
  buildSystemPrompt({ input }: { input: z.infer<typeof Input> }): string {
    const sourceList = input.sources
      .slice(0, 30)
      .map(
        (s, i) =>
          `  [${i}] ${s.url}${s.publishedDate ? ` (${s.publishedDate})` : ""}`,
      )
      .join("\n");
    return [
      `You are a strict quality judge for the dimension "${input.dimension}" of topic "${input.topic}".`,
      `Language: ${input.language}.`,
      ``,
      `## 5 个评分维度（每项 0-100，独立打分）`,
      ``,
      `### 1. 广度 breadth`,
      `- 该维度报告是否覆盖了多个子主题（≥ 4 个不同视角）？`,
      `- 单一视角覆盖再深也只能给 ≤ 60`,
      ``,
      `### 2. 深度 depth`,
      `- 每个子主题是否有充分论证、案例、数据？`,
      `- 仅罗列没分析 → ≤ 50`,
      ``,
      `### 3. 证据 evidence`,
      `- 是否引用具体数字 / 时间 / 实体名 / 链接？`,
      `- 含 ≥ 5 个明确数字 + ≥ 5 条 source URL 才能 ≥ 80`,
      ``,
      `### 4. 连贯性 coherence`,
      `- 章节衔接是否流畅？是否有重复 / 矛盾？`,
      `- 章节 abstract 是否和正文一致？`,
      ``,
      `### 5. 时效性 freshness`,
      `- 引用的 source 是否近期（2024 后为 ≥ 80，2023-24 为 60-80，更早 < 60）？`,
      `- 无日期视为低分`,
      ``,
      `## overall 总分计算`,
      `weighted average: breadth 20% + depth 25% + evidence 25% + coherence 15% + freshness 15%`,
      ``,
      `## grade 映射`,
      `- ≥ 85 → "excellent"`,
      `- 70-84 → "good"`,
      `- 55-69 → "fair"`,
      `- < 55 → "poor"`,
      ``,
      `## 待评维度报告`,
      `### Abstract`,
      input.abstract,
      ``,
      `### Sources (${input.sources.length} 条)`,
      sourceList,
      ``,
      `### Full report (前 4000 字)`,
      input.fullMarkdown.slice(0, 4000),
      ``,
      `## 输出 JSON shape (字段名必须完全匹配)`,
      `{`,
      `  "dimension": "${input.dimension}",`,
      `  "overall": <0-100 整数>,`,
      `  "grade": "excellent" | "good" | "fair" | "poor",`,
      `  "axes": {`,
      `    "breadth":   { "score": <0-100>, "comment": "<具体观察>" },`,
      `    "depth":     { "score": <0-100>, "comment": "..." },`,
      `    "evidence":  { "score": <0-100>, "comment": "..." },`,
      `    "coherence": { "score": <0-100>, "comment": "..." },`,
      `    "freshness": { "score": <0-100>, "comment": "..." }`,
      `  },`,
      `  "summary": "<2-3 句总评>"`,
      `}`,
    ].join("\n");
  }
}
