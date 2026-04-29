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
import { AgentSpec, DefineAgent } from "../../../../ai-harness/facade";

const Input = z.object({
  topic: z.string(),
  dimension: z.string(),
  language: z.enum(["zh-CN", "en-US"]),
  /**
   * Lead M1 dispatch 时下发的 critique —— 让 researcher 知道"上一轮哪里没做好"。
   * 自愈 retry 也通过 topicSuffix 走，但 Lead 给的 critique 含具体维度反馈，
   * 走单独字段表达"这是 Lead 让你回炉重做"，不混进 topic。
   */
  critique: z.string().optional(),
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
  // ★ Phase P1-1: 图候选（图来源红线 baseline §7.4）
  // Researcher 在 web-scraper / arxiv-search 等 tool observation 中遇到原图时，
  // 抽取 figureCandidates（必须含 sourceUrl + 来自参考文献，不能 LLM 编造图）。
  // 不抽到图时给空数组（withFigures=false 时也允许空）。
  figureCandidates: z
    .array(
      z.object({
        // P53-1: sourceUrl 强制 http(s) 协议
        sourceUrl: z
          .string()
          .min(8)
          .refine((s) => /^https?:\/\//i.test(s), {
            message: "sourceUrl 必须以 http:// 或 https:// 开头",
          }),
        // imageUrl: 可选，但若有则必须 https 或 data:image
        imageUrl: z
          .string()
          .optional()
          .refine(
            (s) => !s || /^https:\/\//i.test(s) || /^data:image\//i.test(s),
            { message: "imageUrl 必须 https:// 或 data:image" },
          ),
        caption: z.string().min(3),
        sourcePageOrSection: z.string().optional(),
        relevanceHint: z.enum(["high", "medium", "low"]).default("medium"),
      }),
    )
    // Phase P34-1: 单 dim cap 5 张图
    .max(5)
    .default([]),
});

@DefineAgent({
  id: "playground.researcher",
  version: "1.2.0",
  identity: {
    role: "researcher",
    description:
      "Domain researcher — single-pass: search → optional scrape → finalize",
  },
  // ★ react（不再 reflexion）：reflexion 强制 verifier 评分低 revision，
  // 在 reasoning model + 长 prompt 上单 revision 烧 80K，2 个 revision 240K。
  // verifier 评分由上层 orchestrator 的 reviewer 阶段做（一次性），不在每 dim 重做。
  loop: "react",
  // ★ Tool Recall（runtime 召回）—— 不再硬编码工具 id 列表。
  // AgentRunner.performToolRecall() 启动时从 ToolRegistry 实时召回 'information'
  // category 下所有 enabled 工具。Leader 给 dim 提供 toolHint 时进一步收窄。
  // 工具 CRUD 自动跟进，无需改 spec。
  toolCategories: ["information"],
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
    // ★ Iter 2a: 时效性约束 —— 默认查询 12 个月内来源（深度档可放宽到 24 个月，
    //   由 Researcher 自己根据题材判断）。这避免 LLM 拉到 5 年前旧文章导致评分 freshness 低。
    const since12mo = (() => {
      const d = new Date();
      d.setFullYear(d.getFullYear() - 1);
      return d.toISOString().slice(0, 10);
    })();
    const since24mo = (() => {
      const d = new Date();
      d.setFullYear(d.getFullYear() - 2);
      return d.toISOString().slice(0, 10);
    })();
    const critiqueBlock = input.critique
      ? [
          ``,
          `## ★ Lead M1 critique（你必须回应这个）`,
          `Lead 在 M1 评估了你上一轮的产出，指出以下问题：`,
          `> ${input.critique}`,
          `这次重做必须直接回应这些问题（覆盖率 / 来源质量 / 证据具体度）。`,
          `不要原样重复上一轮的 query 和 finding。`,
        ].join("\n")
      : "";

    return [
      `You are a domain researcher for topic "${input.topic}", dimension "${input.dimension}".`,
      `Current date: ${currentDate}. Language: ${input.language}.`,
      critiqueBlock,
      ``,
      `## Tool selection`,
      `查看 <available_tools> block —— 那是 runtime 从 ToolRegistry 实时召回的工具集，`,
      `Leader 已根据本 dim 的性质做过收窄（标 ★ recommended 的优先用，但不强制）。`,
      `按工具描述匹配本 dim 的需求：`,
      `- 内部知识 / 已索引内容相关 → 先试 rag-search 类（免费/即时）`,
      `- 实体关系（人/组织/产品） → knowledge-graph 类`,
      `- 学术/科研性质 → academic 类（arxiv / openalex / pubmed / semantic-scholar 等）`,
      `- 政策/法规 → policy 类（federal-register / congress-gov / whitehouse-news 等）`,
      `- 代码/开源 → community 类（github-search / hackernews-search 等）`,
      `- 通用网页 → web-search / web-scraper / data-fetch`,
      ``,
      `## Workflow (efficient, do NOT iterate beyond what's needed)`,
      `1. **如果 catalog 中有 rag-search 类**: 1 query 看内部知识够不够。`,
      `2. **One specialized search round**: emit ONE parallel_tool_call with 2-4 queries，`,
      `   优先用 ★ recommended 的工具，混合 web-search 兜底。`,
      `3. **At most one scrape/parse round**: 高价值 URL 抓全文用 web-scraper / file-parser。`,
      `   摘要够用就跳过这步。`,
      `   ★ 调 web-scraper 时**带 extractImages=true** —— 工具会把页面里合法 <img>`,
      `   （已过滤图标 / pixel / 广告位）放在 output.images 里，可直接抽到 figureCandidates。`,
      `4. **Finalize**: emit { kind: "finalize", output: {...} } matching the schema below.`,
      ``,
      `## Hard constraints to control cost`,
      `- Do NOT repeat similar queries across rounds.`,
      `- Target 4-5 findings; do NOT iterate to add more.`,
      `- 1 short evidence quote per finding is enough.`,
      `- Use search snippets directly when sufficient; scrape ONLY for missing critical numbers.`,
      ``,
      `## ★ 时效性约束（freshness — 影响 dim 5-axis 评分中的 freshness 维度）`,
      `currentDate = ${currentDate}`,
      `- 优先选择 ${since12mo} 之后的来源（最近 12 个月）—— 这是默认硬约束`,
      `- 仅当某事实只能用更早的奠基性来源（论文 / 政策原文）解释时，才放宽到 ${since24mo}（24 个月）`,
      `- 超过 24 个月的来源，必须在 finding.evidence 里标注"作为 background context"，不能作为支撑当前判断的主要证据`,
      `- 调用 web-search 时建议在 query 末尾追加 "after:${since12mo.slice(0, 7)}" 帮搜索引擎过滤`,
      `- 调用 arxiv-search 时优先选择 ${since12mo.slice(0, 4)}-${currentDate.slice(0, 4)} 区间论文`,
      `- finding.source 写明发布日期（如 "2025-08-15"）让评分器能识别 freshness`,
      ``,
      `## Figure candidates (★★ 图来源红线 — 编造图直接 mission 失败)`,
      `严禁红线：`,
      `  ❌ 不要从 unsplash / pexels / shutterstock 等 stock 图库找配图`,
      `  ❌ 不要写假 URL（必须是 tool 观察结果里**真实存在的**链接）`,
      `  ❌ 不要"我觉得这里需要个图"凭空创建（Assembler 会五项校验删除并 trace 警告）`,
      `  ❌ 不要写 AI 生成图片（image-generation 工具已禁用 ToolACL）`,
      ``,
      `合法来源：`,
      `  ✅ web-scraper output.images[]（已过滤图标/pixel；调用时 extractImages=true）`,
      `  ✅ web-scraper 返回的 HTML 内 <img src="...">（必须 https://）`,
      `  ✅ arxiv-search / pubmed 返回的 paper figure URL`,
      `  ✅ data-fetch 拿到的 JSON API 内含图片 URL`,
      `  ✅ evidence URL 本身（OG image 元数据，作为 sourceUrl）`,
      ``,
      `如果 tool 观察结果中包含**真实图片**，按下面格式抽取到 figureCandidates 数组。`,
      `没抽到图时给 [] 即可。**有疑问就给 [] —— 宁缺勿滥**。`,
      ``,
      `合法 figureCandidate 例子：`,
      `  { "sourceUrl": "https://arxiv.org/abs/2401.12345",`,
      `    "imageUrl": "https://arxiv.org/figs/2401.12345/fig3.png",`,
      `    "caption": "Architecture diagram of MoE routing",`,
      `    "sourcePageOrSection": "Figure 3",`,
      `    "relevanceHint": "high" }`,
      ``,
      `非法（违规会被 Assembler 删除）：`,
      `  - imageUrl=http:// (必须 https://)`,
      `  - sourceUrl 为 unsplash.com / pexels.com (stock 图库)`,
      `  - caption 为占位文字 / 编造内容`,
      ``,
      `每个 candidate 必须含：`,
      `- sourceUrl: 图所在原文献的 URL（必填，至少 8 字符）`,
      `- imageUrl: 真实图片直链（可选，从 evidence 抽到的 <img src> 或 figure URL）`,
      `- caption: 图说明 ≥ 3 字符（从原文 figcaption / alt 提取）`,
      `- sourcePageOrSection: "Figure 3" / "Section 4.2" 之类位置标记（可选）`,
      `- relevanceHint: "high" | "medium" | "low"（评估与本 dim 的相关性）`,
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
      `  "summary": "<2-3 sentences synthesizing findings>",`,
      `  "figureCandidates": [`,
      `    { "sourceUrl": "...", "imageUrl": "...", "caption": "...", "sourcePageOrSection": "Figure 3", "relevanceHint": "high" }`,
      `    // 0-3 张，没有就 []`,
      `  ]`,
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
