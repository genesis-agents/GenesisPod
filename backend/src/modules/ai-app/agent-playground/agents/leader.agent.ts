/**
 * Leader Agent —— 解析 topic + 拆维度 + 为每个维度给工具召回 hint。
 *
 * 设计原则（mission-pipeline-baseline.md §3.3 / §10 Q1 Q2）：
 *
 *   分层职责：
 *   - Agent spec     → 声明业务意图 + toolCategories（安全池，category 维度）
 *   - Leader 输出     → 每 dim 的 toolHint = { categories, preferIds? }
 *   - Orchestrator    → 把 dim.toolHint 透传为下游 Researcher 的 RunOptions.toolRecallHint
 *   - AgentRunner     → 五步召回 + 安全校验（hint.categories ⊆ spec.toolCategories）
 *
 *   Runtime 感知：
 *   - 工具清单不在 prompt 里硬编码 —— 由 AgentRunner.collectAugmentBlocks() 从
 *     ToolRegistry 实时读取 spec.toolCategories 召回工具的 description / inputSchema /
 *     invocationExample，注入到 systemPrompt 末尾的 <available_tools> block。
 *   - 系统增删工具不需要改 prompt，spec.toolCategories 是声明式契约。
 *   - Leader 只写"决策规则"（按 dim 性质应该选什么 category），具体 id 让 LLM
 *     从 runtime 注入的 catalog 现取。
 */

import { z } from "zod";
import {
  HarnessAgentSpec as AgentSpec,
  DefineAgent,
} from "../../../ai-engine/facade";

const Input = z.object({
  topic: z.string(),
  depth: z.enum(["quick", "standard", "deep"]),
  language: z.enum(["zh-CN", "en-US"]),
});

const Output = z.object({
  themeSummary: z.string(),
  dimensions: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        rationale: z.string(),
        // ★ Leader 给 dim 的工具 hint（mission-pipeline-baseline.md §3.3）
        // - categories：必须 ⊆ Researcher.spec.toolCategories（越界静默丢弃）
        // - preferIds：弱推荐，catalog 加 ★（不强制 LLM 用）
        toolHint: z.object({
          categories: z.array(z.string()).min(1),
          preferIds: z.array(z.string()).optional(),
        }),
        // ★ Phase P1-17: 1-2 层依赖（mission-pipeline-baseline.md §11 D17）
        // 允许 Leader 标某 dim 依赖另一 dim 的产出（如"对比"依赖"现状"先做完）
        // Orchestrator 拓扑排序后批次并行；循环依赖回退全并行
        dependsOn: z.array(z.string()).optional(),
      }),
    )
    .min(2)
    .max(7),
});

@DefineAgent({
  id: "playground.leader",
  version: "1.2.0",
  identity: {
    role: "leader",
    description:
      "Research lead — understand intent, decompose topic into 2-7 dimensions, and recommend tool categories per dimension",
  },
  loop: "react",
  // ★ 显式 reasoningDepth=moderate（对照 TI leader-planning：reasoningDepth="deep"）
  // 缺省路径在 BYOK reasoning 模型上不可控，必须显式声明
  taskProfile: {
    creativity: "low",
    outputLength: "medium",
    reasoningDepth: "moderate",
  },
  inputSchema: Input,
  outputSchema: Output,
  // ★ Leader 自己规划时也需看到完整 information 工具池才知道有哪些 category
  // toolCategories 是 Leader 召回的池子（仅 information 类够用）
  toolCategories: ["information"],
  // Leader 只规划：12k → 16k 留给 dim-level toolHint 推理
  budget: { maxTokens: 16_000, maxIterations: 4 },
})
export class LeaderAgent extends AgentSpec<typeof Input, typeof Output> {
  buildSystemPrompt({ input }: { input: z.infer<typeof Input> }): string {
    const target =
      input.depth === "quick" ? "2-3" : input.depth === "deep" ? "5-7" : "3-5";
    // ★ 动态注入当前日期（对照 TI leader-planning：避免 LLM 用陈旧时间假设）
    const currentDate = new Date().toISOString().slice(0, 10);
    const langInstruction =
      input.language === "zh-CN"
        ? "请用中文输出（包括 themeSummary、name、rationale 全部字段）。"
        : "Please respond in English (themeSummary, name, rationale).";
    return [
      `You are the research lead for the topic: "${input.topic}".`,
      `Current date: ${currentDate}. ${langInstruction}`,
      `Depth: ${input.depth} → produce ${target} dimensions.`,
      ``,
      `Each dimension must be:`,
      `- Mutually exclusive (no overlap)`,
      `- Collectively exhaustive (covers the topic)`,
      `- Researchable in 5-10 minutes by one researcher`,
      ``,
      `## Tool recommendation (★ critical responsibility)`,
      ``,
      `For each dimension, produce a toolHint object:`,
      `  toolHint = {`,
      `    "categories": ["..."],   // 1+ category, 必须从 <available_tools> block 看到的工具的 category 中选`,
      `    "preferIds": ["..."]      // 可选：从 <available_tools> 列出的 id 中选 1-3 个最相关的（弱推荐）`,
      `  }`,
      ``,
      `Rules:`,
      `- 不要硬编码工具 id —— 看 <available_tools> block 里实际可用的工具，从中选 category。`,
      `- categories 优先选最贴合 dim 性质的（每 dim 1-3 个 category 即可，多了没意义）。`,
      `- preferIds 仅在 dim 性质强烈指向某些具体工具时填（如政策类→federal-register）。`,
      ``,
      `决策启发（按 dim 性质）：`,
      `- 学术/技术/科研性质 → category=academic（或类似分类，看 catalog 提供）`,
      `- 政策/法规/监管 → category=policy / web`,
      `- 代码/开源/工程 → category=community / web`,
      `- 商业/市场/竞品 → category=web / data`,
      `- 通用/泛知识 → category=web / knowledge`,
      ``,
      `Hard rules:`,
      `- 1 ≤ toolHint.categories.length`,
      `- categories 中的字符串必须是 <available_tools> 里某些工具的 category 字段（看不到的 category 不要写）。`,
      ``,
      `## Final output JSON shape (exact field names required):`,
      `{`,
      `  "themeSummary": "<one paragraph summarizing the research frame>",`,
      `  "dimensions": [`,
      `    {`,
      `      "id": "<short-stable-id e.g. dim-1>",`,
      `      "name": "<short title>",`,
      `      "rationale": "<1-2 sentences why this dimension matters>",`,
      `      "toolHint": { "categories": ["..."], "preferIds": ["..."] }`,
      `    }`,
      `    // ... ${target} dimensions total`,
      `  ]`,
      `}`,
      ``,
      `Use field names exactly as shown — id / name / rationale / toolHint.categories / toolHint.preferIds.`,
      `Do NOT use alternative field names like "description", "title", "tools", or "whyMECE".`,
    ].join("\n");
  }
}
