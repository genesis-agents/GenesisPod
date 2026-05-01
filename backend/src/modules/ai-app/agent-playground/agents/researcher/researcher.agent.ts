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
  /** ★ withFigures=true 时强制 researcher 调 web-scraper extractImages=true 抽图 */
  withFigures: z.boolean().default(true),
  /**
   * ★ 用户在 mission launch 时选的本地 KB —— 调 rag-search 时必须把这些 ids 作为
   * knowledgeBaseIds 参数传入，否则 rag-search 不会启用本地召回。
   * 空 / 不传 → 直接跳过 rag-search 走 web-search。
   */
  knowledgeBaseIds: z.array(z.string().uuid()).optional(),
});

const Output = z.object({
  dimension: z.string(),
  findings: z.array(
    z.object({
      claim: z.string(),
      evidence: z.string(),
      // 必修 #17: 放宽 URL 校验
      source: z.string().min(1),
      // ★ 2026-04-30 (PR-C): 引用元数据补全（mission 4fd5efa1 暴露：86% citation
      //   title=domain、0 条有 snippet、0 条有 publishedAt → hover tooltip 富信息
      //   全部空转、时间过滤永远归到「未标日期」、可信度评分单一）。这里把
      //   web-search / web-scraper / arxiv-search 等工具 observation 中已有的
      //   字段透传到 finding，让下游 buildCitations 能还原完整元数据。
      sourceTitle: z.string().optional(),
      sourceSnippet: z.string().optional(),
      sourcePublishedAt: z.string().optional(),
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
  // PR-X-skill-bridge: dimension-research 协议 + web-research 工具使用规范
  skills: ["dimension-research", "web-research"],
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
  // ★ wallTime 600s（默认 300s）—— withFigures=true 时必须多 1 轮 web-scraper extractImages，
  //   抽图本身 60-120s，5 min 容易超时致 RUNNER_OUTPUT_SCHEMA_MISMATCH retry 风暴。
  // ★ Phase P1 fix (2026-04-29 mission 8c7b4358)：maxIterationsHardCap=10 是绝对硬上限。
  //   leader-assess-research stage 用 budgetMultiplier 7.28× 把 base 5 放大到 36，
  //   触发 LLM 60+ 轮 parallel_tool_call 永不 finalize 的死循环（44 分钟单 dim retry）。
  //   硬上限 10 = base 5 × 2，给容错重试一轮但不给"再搜很多轮"的余地。
  //   maxTokens / maxWallTimeMs 仍允许放大（容错），只锁 maxIterations（决策边界）。
  budget: {
    maxTokens: 30_000,
    maxIterations: 5,
    maxIterationsHardCap: 10,
    maxWallTimeMs: 600_000,
  },
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
          ``,
          `## ★★★ 退出闸（必须遵守，否则被框架强制中断）`,
          `你**最多 3 轮 parallel_tool_call**。3 轮后 framework 会注入 ITERATION BUDGET WARNING reminder，`,
          `下一轮 LLM 必须 emit { "kind": "finalize", ... }，不允许再调 tool。`,
          `如果 3 轮内没集齐 critique 要求的所有源（5-7 个一手源 / 州法 / 执行案例），`,
          `**直接 finalize 当前 findings**，并在 summary 字段尾部追加：`,
          `  「未能在 budget 内集齐：[列出还缺什么]」`,
          `这样 leader 在二审能看到诚实的 gap，比反复刷 tool 跑超时更可信。`,
          `质量 > 完整：4 条扎实的 finding 比 7 条凑数 finding 更高分。`,
        ].join("\n")
      : "";

    const kbIds = input.knowledgeBaseIds ?? [];
    const kbBlock =
      kbIds.length > 0
        ? [
            ``,
            `## ★ 本地知识库（用户选的）`,
            `用户在 mission launch 时选了 ${kbIds.length} 个本地 KB（id: ${kbIds.join(", ")}）。`,
            `调 rag-search 时**必须把这些 id 作为 knowledgeBaseIds 参数传入**，否则不会启用本地召回。`,
            `示例 tool call: { "tool": "rag-search", "input": { "query": "...", "knowledgeBaseIds": ${JSON.stringify(kbIds)}, "topK": 5 } }`,
            `先调 1 轮 rag-search 看本地知识够不够；不够再走 web-search。`,
          ].join("\n")
        : ``;

    return [
      `You are a domain researcher for topic "${input.topic}", dimension "${input.dimension}".`,
      `Current date: ${currentDate}. Language: ${input.language}.`,
      critiqueBlock,
      kbBlock,
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
      input.withFigures
        ? `3. **★ 必须 1 轮 web-scraper extractImages=true**（withFigures=true）：从 search 结果里挑 1-2 个高价值图文 URL（如 stanford / mckinsey / brookings / 政府 / arxiv 报告），调用 web-scraper 时**必须带 extractImages=true**。工具会把合法 <img>（过滤图标/pixel）放进 output.images。再从 output.images 抽 1-3 张到 figureCandidates。**没调 web-scraper extractImages 视为不达标**。`
        : `3. **At most one scrape/parse round**: 高价值 URL 抓全文用 web-scraper / file-parser。摘要够用就跳过这步。`,
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
      `      "source": "<URL or DOI/arxiv id>",`,
      `      // ★ 引用元数据补全（必填，让下游 citation 不再 fallback 成 domain）：`,
      `      // - sourceTitle: web-search/scrape 结果里的 page title 或 og:title`,
      `      //   （e.g. "API Overview - Claude API"，不要写域名 "platform.claude.com"）`,
      `      "sourceTitle": "<page 真实标题（必填，从 search 结果 title / scrape og:title 取）>",`,
      `      // - sourceSnippet: 1-2 句关键摘要，从 search snippet / scrape og:description 取`,
      `      //   或者本 finding 直接关联的原文片段（≤ 300 chars）`,
      `      "sourceSnippet": "<原文摘要或 search snippet（必填，≤300 字）>",`,
      `      // - sourcePublishedAt: ISO-8601 日期（如 "2025-08-15" 或 "2025-08-15T00:00:00Z"），`,
      `      //   从 search 结果 date 字段 / scrape article:published_time / 页面正文中提取；`,
      `      //   找不到就省略字段（不要瞎填）`,
      `      "sourcePublishedAt": "<YYYY-MM-DD 或 ISO-8601，可选，找不到时省略>" }`,
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
