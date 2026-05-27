/**
 * Segment Extractors —— 把已有 stage 产物（analyst / reconciler / researcher / leader / critic）
 * 抽取为 ReportSegments 格式，让 StructuralReportAssembler 能够拼装 ReportArtifact。
 *
 * 上游：docs/architecture/ai-harness/evaluation/report-assembly-invariant-redesign.md v1.4 §4.4.1
 *
 * 设计要点：
 *   - 纯函数，0 LLM call
 *   - 接收已就绪 ctx 字段（s8-pre 时机），输出 ReportSegments
 *   - dim body 来自 researcherResults[i].fullMarkdown（per-dim chapter pipeline 已产出）
 *   - executiveSummary / preface / crossDimAnalysis / riskAssessment /
 *     recommendations / conclusion 全部从 analystOutput 拿（5 字段在 PR-A0 已加齐）
 *
 * 失败模式：
 *   - 任何字段为 null/undefined 时返回空字符串，让 StructuralReportAssembler
 *     的 optional slot 跳过该段；perDimension body=null 由 assembler 占位文字补
 */

import type { ReportSegments } from "@/modules/ai-harness/facade";
import type {
  ArtifactCitation,
  ArtifactFigure,
  ArtifactFactTriple,
  ArtifactMetadata,
} from "@/modules/ai-harness/facade";

interface AnalystOutputShape {
  themeSummary?: string;
  preface?: string;
  crossDimAnalysis?: string;
  riskAssessment?: string;
  strategicRecommendations?: string;
  conclusion?: string;
  insights?: {
    headline: string;
    narrative: string;
    supportingDimensions: string[];
    confidence: number;
  }[];
  // ★ PR-quickview-parity (2026-05-09): 5 组结构化 quickView 字段
  keyFindingsByDimension?: {
    dimensionName: string;
    findings: {
      finding: string;
      // ★ 2026-05-27 (#108): analyst LLM 输出可选 body 解释段。
      body?: string;
      significance: "high" | "medium" | "low";
    }[];
  }[];
  trendsByDimension?: {
    dimensionName: string;
    trends: {
      trend: string;
      direction: "increasing" | "decreasing" | "stable" | "emerging";
      timeframe: string;
    }[];
  }[];
  riskMatrix?: {
    riskType: string;
    probability: "高" | "中" | "低";
    impact: "高" | "中" | "低";
    timeframe: string;
  }[];
  recommendationsByAudience?: {
    forEnterprise?: { shortTerm: string[]; midTerm: string[] };
    forInvestors?: { shortTerm: string[]; midTerm: string[] };
  };
  whatYouWillLearn?: string[];
}

interface ReconcilerOutputShape {
  reconciliationReport?: string;
  conflicts?: unknown[];
  gaps?: unknown[];
}

interface ResearcherResultShape {
  dimension: string;
  fullMarkdown?: string;
  summary?: string;
}

interface PlanShape {
  themeSummary: string;
  dimensions: { id: string; name: string; rationale: string }[];
}

export interface SegmentExtractorInput {
  plan: PlanShape;
  analystOutput?: AnalystOutputShape | null;
  reconcilerOutput?: ReconcilerOutputShape | null;
  researcherResults?: ResearcherResultShape[];
  citations?: ArtifactCitation[];
  figures?: ArtifactFigure[];
  factTable?: ArtifactFactTriple[];
  metadata: ArtifactMetadata;
  qualityInputs?: ReportSegments["qualityInputs"];
}

/**
 * 主入口：从 ctx 已就绪 stage 产物抽取 ReportSegments
 */
export function extractReportSegments(
  input: SegmentExtractorInput,
): ReportSegments {
  const analyst = input.analystOutput ?? {};
  const recon = input.reconcilerOutput ?? {};
  const researchers = input.researcherResults ?? [];

  // 把 researcher results 按 dim id 关联（容忍乱序 / partial failure）
  const perDimension = input.plan.dimensions.map((dim) => {
    const r = researchers.find(
      (x) => x.dimension === dim.id || x.dimension === dim.name,
    );
    const body = r?.fullMarkdown?.trim() || r?.summary?.trim() || null;
    return { dimensionId: dim.id, body };
  });

  return {
    plan: {
      themeSummary: input.plan.themeSummary,
      dimensions: input.plan.dimensions,
    },
    bodies: {
      executiveSummary: analyst.themeSummary?.trim() ?? "",
      preface: analyst.preface?.trim() ?? "",
      perDimension,
      crossDimAnalysis: pickCrossDim(analyst, recon),
      riskAssessment: analyst.riskAssessment?.trim(),
      recommendations: analyst.strategicRecommendations?.trim(),
      conclusion: analyst.conclusion?.trim(),
    },
    quickViewData: {
      keyFindingsByDimension: analyst.keyFindingsByDimension,
      trendsByDimension: analyst.trendsByDimension,
      riskMatrix: analyst.riskMatrix,
      recommendationsByAudience: analyst.recommendationsByAudience,
      whatYouWillLearn: analyst.whatYouWillLearn,
      insights: analyst.insights,
    },
    citations: input.citations ?? [],
    figures: input.figures ?? [],
    factTable: input.factTable ?? [],
    metadata: input.metadata,
    qualityInputs: input.qualityInputs ?? {
      verifierScores: {},
      warnings: [],
    },
  };
}

/**
 * crossDimAnalysis 来源选择：
 *   优先 analyst.crossDimAnalysis（LLM 写过的 400-600 字章节）
 *   fallback 到 reconciler.reconciliationReport markdown 文本
 *   都没有则 undefined → optional slot 跳过该段
 *
 * fallback 归一化：
 *   reconciliationReport 按 cross-dim-fact-check SKILL.md 契约会写成
 *   `# 对账总览` + 多个 `## 事实表概要/冲突/重叠/空白/下游消费指引` H2 子段。
 *   StructuralReportAssembler 会再用 `## 跨维度分析` 包裹这段 body，
 *   而前端 splitFullReportIntoChapters 按 `## ` 切章节，会把 reconciler
 *   的 H2 子段全部裂成独立章节。因此 fallback 时把所有 H1/H2 统一降到 H3，
 *   保证整段作为单一连续章节渲染。
 */
function pickCrossDim(
  analyst: AnalystOutputShape,
  recon: ReconcilerOutputShape,
): string | undefined {
  if (analyst.crossDimAnalysis?.trim()) return analyst.crossDimAnalysis.trim();
  if (recon.reconciliationReport?.trim()) {
    return demoteTopHeadingsToH3(recon.reconciliationReport.trim());
  }
  return undefined;
}

function demoteTopHeadingsToH3(md: string): string {
  return md.replace(/^(#{1,2})(?=\s+\S)/gm, "###");
}
