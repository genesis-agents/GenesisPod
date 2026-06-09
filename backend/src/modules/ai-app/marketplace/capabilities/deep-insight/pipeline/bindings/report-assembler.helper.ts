/**
 * report-assembler.helper —— s8/s9b 富组装与评估的纯映射工具（无副作用，无 LLM）。
 *
 * 职责（把 crossStageState 里的产物映射成 harness 富服务的入参形状）：
 *   - buildAssembleInput：writer report + researcherResults + plan + analyst + usage
 *     → ReportArtifactAssembler.assemble 的 AssembleInput。
 *   - buildChapterInputs：reportArtifact.sections → ReportEvaluation 的 ChapterInput[]。
 *   - buildCriticArtifactSummary：reportArtifact → critic agent 的 artifactSummary。
 *   - sectionsToMarkdown：把 reportArtifact.sections 回写成 fullMarkdown（s8b 段落替换用）。
 *
 * 设计：所有函数纯映射，bindings 据此组合 harness 富服务；零 app import、零 DB、零 LLM。
 */
import type { ChapterInput } from "@/modules/ai-harness/facade";

/**
 * ReportArtifactAssembler.assemble 的入参形状（本地结构副本）。
 *
 * 说明：harness facade 当前**未导出** `AssembleInput` 类型（只导出了
 * ReportArtifactAssembler 服务类与 ReportArtifact 输出类型）。本地按 assemble 形参
 * 结构镜像一份，使 buildAssembleInput 返回值在 bindings 调 assemble(input) 时结构兼容。
 * 待主 Agent 在 ai-harness/facade 补 `export type { AssembleInput }` 后，本地副本可删，
 * 改为直接 import（见返回里的「需主 Agent 补的 facade 导出」）。
 */
export interface AssembleInput {
  topic: string;
  language: "zh-CN" | "en-US";
  styleProfile: "academic" | "executive" | "journalistic" | "technical";
  lengthProfile: "brief" | "standard" | "deep" | "extended" | "epic" | "mega";
  audienceProfile: "executive" | "domain-expert" | "general-public";
  plan: {
    themeSummary: string;
    dimensions: { id: string; name: string; rationale: string }[];
  };
  researcherResults: Array<{
    dimension: string;
    findings: Array<{
      claim: string;
      evidence: string;
      source: string;
      sourceTitle?: string;
      sourceSnippet?: string;
      sourcePublishedAt?: string;
    }>;
    summary: string;
    figureCandidates?: Array<{
      sourceUrl: string;
      imageUrl?: string;
      caption: string;
      sourcePageOrSection?: string;
      relevanceHint?: "high" | "medium" | "low";
    }>;
  }>;
  analyst?: {
    themeSummary?: string;
    keyInsights?: { title?: string; oneLine?: string }[];
    contradictions?: unknown[];
    gaps?: unknown[];
    preface?: string;
    crossDimAnalysis?: string;
    riskAssessment?: string;
    strategicRecommendations?: string;
  };
  writerReport: {
    title: string;
    summary: string;
    sections: { heading: string; body: string; sources?: string[] }[];
    conclusion: string;
    citations?: string[];
  };
  generationTimeMs: number;
  totalTokens: { prompt: number; completion: number; total: number };
  costCents: number;
  modelTrail: string[];
}

/** plan 阶段产物（与 bindings 内同形）。 */
export interface PlanShape {
  themeSummary: string;
  dimensions: { id: string; name: string; rationale: string }[];
}

/** 单维 researcher 产物（findings + summary + 可选图候选）。 */
export interface ResearcherShape {
  dimension: string;
  findings: Array<{
    claim?: string;
    evidence?: string;
    source?: string;
    sourceTitle?: string;
    sourceSnippet?: string;
    sourcePublishedAt?: string;
  }>;
  summary: string;
  figureCandidates?: Array<{
    sourceUrl: string;
    imageUrl?: string;
    caption: string;
    sourcePageOrSection?: string;
    relevanceHint?: "high" | "medium" | "low";
  }>;
}

/** writer 阶段产物（ResearchReport schema 形状）。 */
export interface WriterReportShape {
  title?: string;
  summary?: string;
  sections?: Array<{
    heading?: string;
    title?: string;
    body?: string;
    sources?: string[];
  }>;
  conclusion?: string;
  citations?: string[];
}

/** analyst 阶段产物（report-structure 字段 + insights）。 */
export interface AnalystShape {
  themeSummary?: string;
  insights?: Array<{
    headline?: string;
    title?: string;
    narrative?: string;
    oneLine?: string;
  }>;
  contradictions?: unknown[];
  gaps?: unknown[];
  preface?: string;
  crossDimAnalysis?: string;
  riskAssessment?: string;
  strategicRecommendations?: string;
}

/** 报告深度/风格档位（从 invocation 映射到 assembler metadata profile）。 */
export interface ProfileShape {
  topic: string;
  language: "zh-CN" | "en-US";
  depth?: "quick" | "standard" | "deep";
}

/** 用量（算力 trail，assembler metadata 用）。 */
export interface UsageShape {
  totalTokens: number;
  totalCostCents: number;
  generationTimeMs: number;
}

/** depth → assembler lengthProfile（playground 默认映射）。 */
function lengthProfileFor(
  depth: ProfileShape["depth"],
): AssembleInput["lengthProfile"] {
  switch (depth) {
    case "quick":
      return "brief";
    case "deep":
      return "deep";
    default:
      return "standard";
  }
}

/**
 * 把 crossStageState 产物组装成 ReportArtifactAssembler 的入参。
 * 缺字段时给安全默认（assembler 内部对空 sections/figures 已做兜底）。
 */
export function buildAssembleInput(args: {
  profile: ProfileShape;
  plan: PlanShape | undefined;
  researcherResults: ResearcherShape[];
  analyst: AnalystShape | undefined;
  writerReport: WriterReportShape | undefined;
  usage: UsageShape;
}): AssembleInput {
  const { profile, plan, researcherResults, analyst, writerReport, usage } =
    args;
  const themeSummary =
    analyst?.themeSummary ?? plan?.themeSummary ?? profile.topic;

  return {
    topic: profile.topic,
    language: profile.language,
    styleProfile: "academic",
    lengthProfile: lengthProfileFor(profile.depth),
    audienceProfile: "domain-expert",
    plan: {
      themeSummary,
      dimensions: (plan?.dimensions ?? []).map((d) => ({
        id: d.id,
        name: d.name,
        rationale: d.rationale ?? "",
      })),
    },
    researcherResults: researcherResults.map((r) => ({
      dimension: r.dimension,
      findings: (r.findings ?? []).map((f) => ({
        claim: f.claim ?? "",
        evidence: f.evidence ?? "",
        source: f.source ?? "",
        ...(f.sourceTitle ? { sourceTitle: f.sourceTitle } : {}),
        ...(f.sourceSnippet ? { sourceSnippet: f.sourceSnippet } : {}),
        ...(f.sourcePublishedAt
          ? { sourcePublishedAt: f.sourcePublishedAt }
          : {}),
      })),
      summary: r.summary ?? "",
      ...(r.figureCandidates?.length
        ? { figureCandidates: r.figureCandidates }
        : {}),
    })),
    analyst: {
      ...(analyst?.themeSummary ? { themeSummary: analyst.themeSummary } : {}),
      keyInsights: (analyst?.insights ?? []).map((i) => ({
        ...((i.headline ?? i.title) ? { title: i.headline ?? i.title } : {}),
        ...((i.oneLine ?? i.narrative)
          ? { oneLine: i.oneLine ?? i.narrative }
          : {}),
      })),
      ...(analyst?.contradictions
        ? { contradictions: analyst.contradictions }
        : {}),
      ...(analyst?.gaps ? { gaps: analyst.gaps } : {}),
      ...(analyst?.preface ? { preface: analyst.preface } : {}),
      ...(analyst?.crossDimAnalysis
        ? { crossDimAnalysis: analyst.crossDimAnalysis }
        : {}),
      ...(analyst?.riskAssessment
        ? { riskAssessment: analyst.riskAssessment }
        : {}),
      ...(analyst?.strategicRecommendations
        ? { strategicRecommendations: analyst.strategicRecommendations }
        : {}),
    },
    writerReport: {
      title: writerReport?.title ?? profile.topic,
      summary: writerReport?.summary ?? themeSummary,
      sections: (writerReport?.sections ?? []).map((s) => ({
        heading: s.heading ?? s.title ?? "",
        body: s.body ?? "",
        ...(s.sources ? { sources: s.sources } : {}),
      })),
      conclusion: writerReport?.conclusion ?? "",
      ...(writerReport?.citations ? { citations: writerReport.citations } : {}),
    },
    generationTimeMs: usage.generationTimeMs,
    totalTokens: {
      prompt: 0,
      completion: 0,
      total: usage.totalTokens,
    },
    costCents: usage.totalCostCents,
    modelTrail: [],
  };
}

/** reportArtifact section 的最小投影（assembler 输出 ArtifactSection 子集）。 */
interface ArtifactSectionLite {
  id?: string;
  title?: string;
  heading?: string;
  content?: string;
  body?: string;
  citationIds?: unknown[];
}

export interface ReportArtifactLite {
  title?: string;
  content?: { fullMarkdown?: string; fullReportSize?: number };
  sections?: ArtifactSectionLite[];
  citations?: unknown[];
  figures?: unknown[];
  quality?: { overall?: number; dimensions?: Record<string, unknown> };
  metadata?: Record<string, unknown>;
  quickView?: { foresight?: unknown };
}

/** ArtifactSectionLite 公开（s8b 补救逐 section 读写用）。 */
export type { ArtifactSectionLite };

/** 安全把 unknown 当 reportArtifact 读。 */
export function asArtifact(raw: unknown): ReportArtifactLite | undefined {
  return raw && typeof raw === "object"
    ? (raw as ReportArtifactLite)
    : undefined;
}

/**
 * reportArtifact.sections → ReportEvaluation 的 ChapterInput[]。
 * writerModel 用占位（能力内核无逐章 model trail）；sourcesUsed 用 citationIds 数。
 */
export function buildChapterInputs(
  artifact: ReportArtifactLite | undefined,
): ChapterInput[] {
  const sections = artifact?.sections ?? [];
  return sections
    .map((s, i) => ({
      chapterId: s.id ?? `chapter-${i + 1}`,
      chapterTitle: s.title ?? s.heading ?? `章节 ${i + 1}`,
      writerModel: "",
      content: s.content ?? s.body ?? "",
      sourcesUsed: Array.isArray(s.citationIds) ? s.citationIds.length : 0,
    }))
    .filter((c) => c.content.length > 0);
}

/** reportArtifact → critic agent 的 artifactSummary（量化锚点，非全文）。 */
export function buildCriticArtifactSummary(
  artifact: ReportArtifactLite | undefined,
  topic: string,
): Record<string, unknown> {
  const sections = artifact?.sections ?? [];
  const sectionTitles = sections.map((s) => s.title ?? s.heading ?? "");
  return {
    title: artifact?.title ?? topic,
    executiveSummary: "",
    sectionCount: sectionTitles.length,
    sectionTitles,
    citationCount: artifact?.citations?.length ?? 0,
    factCount: 0,
    figureCount: artifact?.figures?.length ?? 0,
    overallQuality:
      typeof artifact?.quality?.overall === "number"
        ? artifact.quality.overall
        : 70,
    qualityDimensions: artifact?.quality?.dimensions ?? {},
  };
}
