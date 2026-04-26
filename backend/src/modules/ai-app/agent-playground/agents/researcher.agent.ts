/**
 * Researcher Agent —— 单轮 ReAct + 真实 web 搜索
 *
 * 一个 mission 派 N 个 researcher 并行（每维度 1 个）。
 * 每个 researcher 单 dim 走 react loop：
 *   1. 一轮 parallel web-search（2-4 query）
 *   2. 至多一轮 web-scraper 抓 1-2 个高价值 url
 *   3. finalize 输出 narrow JSON
 *
 * 历史教训：曾用 reflexion + self/critical verifier + 5-stage workflow，
 * 单 dim 烧 80-100K tokens，6 dim mission ≈ 600K-1M tokens。完全不可接受。
 * 现在改 react loop + 限制 budget + 简化 prompt，单 dim 目标 ~25K tokens，
 * 6 dim ≈ 150K，相比旧方案减少 75-85%。
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
      // 必修 #17: 放宽 URL 校验
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
      "Domain researcher — single-pass: search → optional scrape → finalize",
  },
  // ★ react（不再 reflexion）：reflexion 强制 verifier 评分低 revision，
  // 在 reasoning model + 长 prompt 上单 revision 烧 80K，2 个 revision 240K。
  // verifier 评分由上层 orchestrator 的 reviewer 阶段做（一次性），不在每 dim 重做。
  loop: "react",
  // ★ 完整研究工具集 —— Harness 系统注册 50+ 工具，agent 必须显式声明才能给 LLM 看到。
  // 之前只声明 web-search/web-scraper 等于"屏蔽"了 LLM 对系统能力的认知。
  // 现在覆盖所有 dim 研究可能用到的 information-gathering / parsing 工具。
  tools: [
    "web-search", // 公网搜索
    "web-scraper", // 抓 URL 全文
    "rag-search", // 内部 RAG / 已索引内容（复用历史研究）
    "knowledge-graph", // 实体关系图（已建表）
    "data-fetch", // 通用 HTTP（拿 JSON API / 数据集）
    "file-parser", // 解析 PDF/DOC/CSV（scrape 拿到非 HTML 资源时用）
    "arxiv-search", // 学术论文
    "github-search", // 代码 / 开源项目
  ],
  // ★ 去 verifiers + 去 skills（critical-review 本来是 verifier 路径）
  taskProfile: {
    creativity: "low",
    outputLength: "long",
    reasoningDepth: "moderate",
  },
  inputSchema: Input,
  outputSchema: Output,
  // ★ budget 大幅收紧：120K → 30K，maxIter 20 → 5
  // 单 dim 5 iter 足够：1 search + 1 scrape + 1 finalize = 3 iter；5 iter 留 buffer
  // 6 dim × 30K = 180K（vs 旧 720K），减 75%
  budget: { maxTokens: 30_000, maxIterations: 5 },
})
export class ResearcherAgent extends AgentSpec<typeof Input, typeof Output> {
  buildSystemPrompt({ input }: { input: z.infer<typeof Input> }): string {
    const currentDate = new Date().toISOString().slice(0, 10);
    return [
      `You are a domain researcher for topic "${input.topic}", dimension "${input.dimension}".`,
      `Current date: ${currentDate}. Language: ${input.language}.`,
      ``,
      `## Tool selection (refer to <available_tools> for full list & invocation examples)`,
      `Pick the right tool for the right job; you have 8+ tools, not just web-search:`,
      `- **rag-search**: ALWAYS try first — checks internal knowledge base for already-indexed`,
      `  content on this topic (free, instant, often sufficient).`,
      `- **knowledge-graph**: query entity relationships if the dimension involves people/orgs/products.`,
      `- **web-search**: public web search (general fallback).`,
      `- **arxiv-search**: when dimension is technical/academic (LLM/AI/science).`,
      `- **github-search**: when dimension involves code/projects/open-source.`,
      `- **data-fetch**: hit a known JSON API or dataset URL directly.`,
      `- **web-scraper**: extract full content from a specific URL (use AFTER search returns it).`,
      `- **file-parser**: parse PDF/DOC content if scrape returns binary resource.`,
      ``,
      `## Workflow (efficient, do NOT iterate beyond what's needed)`,
      `1. **rag-search first**: 1 query checking internal knowledge. If results are good, may suffice.`,
      `2. **One web/specialized search round**: emit ONE parallel_tool_call with 2-4 queries`,
      `   choosing the right tools (web-search / arxiv-search / github-search / data-fetch).`,
      `3. **At most one scrape/parse round**: if a high-value URL needs full content, emit ONE`,
      `   parallel_tool_call with web-scraper / file-parser. Skip if snippets are sufficient.`,
      `4. **Finalize**: emit { kind: "finalize", output: {...} } matching the schema below.`,
      ``,
      `## Hard constraints to control cost`,
      `- Do NOT repeat similar queries across rounds.`,
      `- Target 4-5 findings; do NOT iterate to add more.`,
      `- 1 short evidence quote per finding is enough.`,
      `- Use search snippets directly when sufficient; scrape ONLY for missing critical numbers.`,
      ``,
      `## Output JSON shape (field names must match exactly)`,
      `{`,
      `  "dimension": "${input.dimension}",`,
      `  "findings": [`,
      `    { "claim": "<verifiable specific statement, include numbers/dates/entities>",`,
      `      "evidence": "<1 sentence quote or data point>",`,
      `      "source": "<URL or DOI/arxiv id>" }`,
      `    // 4-5 findings`,
      `  ],`,
      `  "summary": "<2-3 sentences synthesizing findings>"`,
      `}`,
    ].join("\n");
  }

  /**
   * ★ 内容驱动退出闸：finalize 时框架调此校验。issues 非空就 reject + critique
   * → LLM 直接补缺。这是退出机制的"业务级硬要求"，比 zod schema 更严：
   *   - findings 数量下限 4
   *   - 每条 finding 三元组完整 + claim 含具体词
   *   - source 必须形似 URL（http 或带 .）
   *   - summary 不能是占位
   */
  validateBusinessRules(output: z.infer<typeof Output>): void {
    const issues: string[] = [];
    const findings = output?.findings ?? [];
    if (!Array.isArray(findings) || findings.length < 4) {
      issues.push(
        `findings.length=${findings.length} (要求 ≥4，请用已搜到的工具结果补到至少 4 条)`,
      );
    }
    findings.forEach((f, i) => {
      if (!f?.claim || f.claim.trim().length < 10) {
        issues.push(
          `findings[${i}].claim 太短或缺失（要求 ≥10 字符且含具体数字/时间/实体）`,
        );
      }
      if (!f?.evidence || f.evidence.trim().length < 5) {
        issues.push(`findings[${i}].evidence 缺失或过短`);
      }
      if (!f?.source || f.source.trim().length < 4) {
        issues.push(`findings[${i}].source 缺失`);
      } else if (!/^https?:|^doi:|^arxiv:|\./i.test(f.source.trim())) {
        issues.push(
          `findings[${i}].source="${f.source.slice(0, 30)}" 不像 URL/DOI（必须是 http(s):// 或 doi: 前缀）`,
        );
      }
    });
    if (!output?.summary || output.summary.trim().length < 20) {
      issues.push(`summary 缺失或过短（要求 ≥20 字符的真实综合，不接受占位）`);
    }
    if (issues.length > 0) {
      throw new Error(issues.join("; "));
    }
  }
}
