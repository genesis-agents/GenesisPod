/**
 * Analyst Agent —— ReflexionLoop + self/critical verifiers
 *
 * 整合 N 个 researcher 的结果，做交叉验证、矛盾消解、洞察归纳。
 * < passThreshold 自动 critique → revise，最多 maxRevisions 轮。
 */

import { z } from "zod";
import { AgentSpec, DefineAgent } from "@/modules/ai-harness/facade";

const ResearcherFinding = z.object({
  dimension: z.string(),
  findings: z.array(
    z.object({
      claim: z.string(),
      evidence: z.string(),
      // 必修 #17: 与 ResearcherAgent 一致放宽 — DOI / arxiv id / 带 query 的 URL 都算
      source: z.string().min(1),
    }),
  ),
  summary: z.string(),
});

const Input = z.object({
  topic: z.string(),
  language: z.enum(["zh-CN", "en-US"]),
  researcherResults: z.array(ResearcherFinding).min(1),
  // ★ Phase P1-5: Reconciler [3.5] 产物（mission-pipeline-baseline.md §3.5 / Q6）
  // Analyst 必须显式消费这些字段（contradictions / gaps），不允许"假装看不见"
  reconciliationReport: z
    .object({
      factTable: z.array(z.unknown()).optional(),
      conflicts: z
        .array(
          z.object({
            factIds: z.array(z.string()),
            resolutionType: z.enum([
              "kept-both",
              "preferred-one",
              "flagged-unresolved",
            ]),
            preferredFactId: z.string().optional(),
            rationale: z.string(),
          }),
        )
        .optional(),
      overlaps: z.array(z.unknown()).optional(),
      gaps: z.array(z.unknown()).optional(),
      reconciliationReport: z.string().optional(),
      // P86-1: Analyst 应使用 canonical term 表达
      termGlossary: z
        .array(
          z.object({
            canonical: z.string(),
            variants: z.array(z.string()),
          }),
        )
        .optional(),
    })
    .optional(),
  // ★ 第二轮简化提示（仅在 s6 stage 第一轮 LLM 返回 null/格式错误时由 orchestrator 注入）
  retryHint: z.string().optional(),
});

const Output = z.object({
  insights: z.array(
    z.object({
      headline: z.string(),
      narrative: z.string(),
      supportingDimensions: z.array(z.string()),
      confidence: z.number().min(0).max(1),
    }),
  ),
  contradictions: z
    .array(
      z.object({
        claim: z.string(),
        conflictingSources: z.array(z.string()),
        resolution: z.string(),
      }),
    )
    .optional(),
  themeSummary: z.string(),
  // ★ F-alignment (2026-05-06): 对齐 Topic Insight buildFullReportFromDimensions —— 4 个章节必填字段
  // 缺席时 assembler 用 themeSummary / dimension findings 兜底，确保报告结构完整。
  preface: z.string().optional(),
  crossDimAnalysis: z.string().optional(),
  riskAssessment: z.string().optional(),
  strategicRecommendations: z.string().optional(),
});

@DefineAgent({
  id: "playground.analyst",
  identity: {
    role: "analyst",
    description: "Synthesize multi-dimension research into top insights",
  },
  loop: "reflexion",
  skills: ["critical-review", "cross-dim-synthesis"],
  verifiers: ["self", "critical"],
  taskProfile: { creativity: "low", outputLength: "long" },
  inputSchema: Input,
  outputSchema: Output,
  // 整合 N 个 researcher 输出 + reflexion 至少 2-3 轮 critique→revise
  budget: { maxTokens: 60_000, maxIterations: 10 },
})
export class AnalystAgent extends AgentSpec<typeof Input, typeof Output> {
  buildSystemPrompt({ input }: { input: z.infer<typeof Input> }): string {
    const recon = input.reconciliationReport;
    const conflictBlock = recon?.conflicts?.length
      ? [
          ``,
          `## ★ Reconciler 已识别冲突（必须在 contradictions 字段显式列出）`,
          ...recon.conflicts.map(
            (c, i) =>
              `${i + 1}. [${c.resolutionType}] factIds=${c.factIds.join(",")} → ${c.rationale.slice(0, 120)}`,
          ),
          ``,
        ]
      : [];
    const reportBlock = recon?.reconciliationReport
      ? [
          ``,
          `## Reconciler 总览`,
          recon.reconciliationReport.slice(0, 1500),
          ``,
        ]
      : [];
    const termBlock =
      recon?.termGlossary && recon.termGlossary.length > 0
        ? [
            ``,
            `## ★ 术语统一（必须采用 canonical term）`,
            ...recon.termGlossary.map(
              (g) => `- "${g.canonical}" 取代变体: ${g.variants.join(" / ")}`,
            ),
            ``,
          ]
        : [];
    return [
      `You synthesize research on "${input.topic}" from ${input.researcherResults.length} dimensions.`,
      `Language: ${input.language}.`,
      ``,
      `Goals:`,
      `- Identify 3-7 top insights with cross-dimension support`,
      `- Surface contradictions between sources; propose resolution`,
      `- Each insight needs confidence score (0..1) + supporting dimensions`,
      `- ★ MANDATORY: 必须在 contradictions 字段中列出 Reconciler 识别的所有 conflicts，`,
      `  并对每个冲突写出最终采用的立场（preferred-one / kept-both 双方并列）。`,
      `  不能假装没看到冲突。`,
      `- ★ MANDATORY 报告章节（4 字段必须全部输出，不能省略）：`,
      `  preface:                  200-300 字引言，交代研究背景和本报告的意义`,
      `  crossDimAnalysis:         400-600 字跨维度综合分析，找出各 dim 之间的因果链 / 相互强化 / 张力`,
      `  riskAssessment:           400-600 字风险评估，按"高/中/低"三级列主要风险 + 每条附应对建议`,
      `  strategicRecommendations: 400-600 字战略建议，按受众（决策者 / 执行者 / 研究者）分组，每组 ≥ 2 条可行建议`,
      ...conflictBlock,
      ...reportBlock,
      ...termBlock,
      ``,
      `Final output JSON shape (exact field names required):`,
      `{`,
      `  "themeSummary": "<400-600 字主题综合，这是报告执行摘要的核心，务必完整>",`,
      `  "preface": "<200-300 字前言，研究背景 + 报告意义>",`,
      `  "crossDimAnalysis": "<400-600 字跨维度综合分析>",`,
      `  "riskAssessment": "<400-600 字风险评估，高/中/低分级 + 应对建议>",`,
      `  "strategicRecommendations": "<400-600 字战略建议，按受众分组>",`,
      `  "insights": [`,
      `    {`,
      `      "headline": "<short insight title>",`,
      `      "narrative": "<2-4 sentence explanation>",`,
      `      "supportingDimensions": ["<dimension name>", ...],`,
      `      "confidence": 0.85`,
      `    }`,
      `    // 3-7 insights`,
      `  ],`,
      `  "contradictions": [  // optional`,
      `    { "claim": "<conflicting claim>", "conflictingSources": ["..."], "resolution": "..." }`,
      `  ]`,
      `}`,
      ``,
      `Use field names exactly as shown.`,
      `confidence is a number between 0 and 1.`,
      `★ preface / crossDimAnalysis / riskAssessment / strategicRecommendations 四个字段是报告章节骨架，`,
      `  必须输出真实内容（非占位符）。缺失任何一项将导致报告章节空白，质量评分自动 -20。`,
      ...(input.retryHint
        ? ["", `## ★ Retry 提示（上一次失败原因）`, input.retryHint, ""]
        : []),
    ].join("\n");
  }
}
