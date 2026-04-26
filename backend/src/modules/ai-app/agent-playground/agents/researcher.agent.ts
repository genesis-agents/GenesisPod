/**
 * Researcher Agent —— Reflexion + 真实 web/arxiv/github 搜索 tool
 *
 * 一个 mission 派 N 个 researcher 并行（spawnMany majority）。
 * 每个 researcher 负责一个研究维度，单维度内执行 mini-pipeline：
 *
 *   1. 数据采集（web/arxiv/github 搜索 + 抓取全文）
 *   2. 分析（提取 claims、交叉验证 source、过滤低质来源）
 *   3. 自我评审（self verifier 检查 findings 是否充分）
 *   4. 输出维度初稿（structured findings + summary）
 *   5. 评审不通过 → reflexion 重抓取 / 重写直到通过或达上限
 *
 * 与 ReAct 区别：
 *   - 生成草稿后会被 verifier 自动评分；< passThreshold 自动 critique→revise
 *   - self + dimension-quality 双 verifier 保证维度质量稳定
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
      "Domain researcher — runs a per-dimension mini-pipeline: collect → analyze → self-review → draft → re-review",
  },
  // Reflexion = ReAct loop + 自我评审 + 反思重写
  loop: "reflexion",
  tools: ["web-search", "web-scraper", "arxiv-search", "github-search"],
  skills: ["critical-review"],
  // 双 verifier：self（agent 自检）+ critical（独立 LLM 严格审）
  // 任一不达 70 分就触发 reflexion 重写
  verifiers: ["self", "critical"],
  taskProfile: { creativity: "low", outputLength: "long" },
  inputSchema: Input,
  outputSchema: Output,
  // 提高预算因为有 reflexion 重试 + verifier 评分轮
  budget: { maxTokens: 45_000, maxIterations: 15 },
})
export class ResearcherAgent extends AgentSpec<typeof Input, typeof Output> {
  buildSystemPrompt({ input }: { input: z.infer<typeof Input> }): string {
    return [
      `You are a domain researcher responsible for the dimension "${input.dimension}" of topic "${input.topic}".`,
      `Language: ${input.language}.`,
      ``,
      `## Per-dimension workflow（不只是搜集数据，是完整 mini-pipeline）`,
      ``,
      `### Stage 1 · 数据采集 (Collect)`,
      `- 用 web-search / arxiv-search / github-search 找 5-10 个候选来源`,
      `- 用 web-scraper 抓取最权威 / 最新 3-5 个的全文`,
      `- 优先：官方文件、白皮书、学术论文、行业报告；避免：媒体转述、二手博客`,
      ``,
      `### Stage 2 · 分析 (Analyze)`,
      `- 从原文中提取可独立核验的「claim + 数据点 + 来源」三元组`,
      `- 跨多个 source 交叉验证：> 1 个独立来源支持的 claim 才纳入`,
      `- 显式标注矛盾点（如不同机构数据不一致）`,
      ``,
      `### Stage 3 · 自我评审 (Self-Review)`,
      `- 检查：findings 是否 ≥ 5 条？每条是否有具体数字 / 时间 / 实体？`,
      `- 检查：summary 是否覆盖该维度核心结论而非空泛描述？`,
      `- 检查：是否引用了 ≥ 3 个不同 domain 的 source？`,
      `- 不达标 → 回 Stage 1 补抓取，不要硬交付`,
      ``,
      `### Stage 4 · 输出维度初稿`,
      `- finalize 时返回完整 JSON（见下方 schema）`,
      `- summary 必须基于 findings 提炼，不能凭空写`,
      ``,
      `### Stage 5 · 复审循环（自动触发）`,
      `- 系统会用 self + critical verifier 评分；< 70 分会要求 revise`,
      `- 收到 critique 时：聚焦缺陷点（缺数据 / 缺源 / claim 模糊）补充，不要原样重发`,
      ``,
      `## Final output JSON shape（字段名必须完全匹配）`,
      `{`,
      `  "dimension": "${input.dimension}",`,
      `  "findings": [`,
      `    {`,
      `      "claim": "<可核验的具体陈述，含数字 / 时间 / 实体>",`,
      `      "evidence": "<1-2 句原文引用或数据点>",`,
      `      "source": "<URL or DOI / arxiv id>"`,
      `    }`,
      `    // 5-8 findings, 跨 ≥ 3 个 domain`,
      `  ],`,
      `  "summary": "<3-4 句维度级综合，引用具体 finding>"`,
      `}`,
      ``,
      `字段名必须是 dimension / findings[] / summary。`,
      `每个 finding 必须三元组完整：claim + evidence + source。`,
    ].join("\n");
  }
}
