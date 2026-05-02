/**
 * ReportArtifact —— Writer Stage 的结构化输出契约
 *
 * 上游：mission-pipeline-baseline.md §7 / mission-pipeline-writer-artifact.md §2
 *
 * 与现有 ResearchReport（裸 markdown + sections）的关系：
 *   - ResearchReport = v1（保留向后兼容，老 mission 仍可 render）
 *   - ReportArtifact = v2（结构化，三视图共享，角标溯源，图来源红线）
 *
 * 持久化路径：
 *   - agent_playground_missions.report_full = ReportArtifact（v2 时）
 *   - agent_playground_missions.report_artifact_version = 2
 */

/** 章节节点（章节视图核心） */
export interface ArtifactSection {
  id: string;
  type:
    | "executive_summary"
    | "preface"
    | "dimension"
    | "cross_dimension"
    | "risk_assessment"
    | "recommendations"
    | "conclusion"
    | "appendix";
  level: 2 | 3;
  title: string;
  anchor: string;
  startOffset: number;
  endOffset: number;
  wordCount: number;
  readingTimeMinutes: number;
  parentId?: string;
  children?: ArtifactSection[];
  citations: number[];
  figureIds: string[];
  factIds: string[];
  noveltyScore?: number;
  sourceDimensionId?: string;
}

/** 引用条目（角标溯源核心） */
export interface ArtifactCitation {
  index: number;
  uuid: string;
  title: string;
  url: string;
  domain: string;
  snippet?: string;
  snippetUri?: string;
  publishedAt?: string;
  accessedAt: string;
  sourceType:
    | "gov"
    | "academic"
    | "industry"
    | "news"
    | "blog"
    | "community"
    | "other";
  credibilityScore: number;
  occurrences: ArtifactCitationOccurrence[];
}

export interface ArtifactCitationOccurrence {
  sectionId: string;
  paragraphIndex: number;
  characterOffset: number;
}

/** 图（图文并茂核心） */
export interface ArtifactFigure {
  id: string;
  type: "reference" | "extracted_chart";
  evidenceCitationIndex: number;
  sourceUrl: string;
  sourcePageOrSection?: string;
  imageUrl?: string;
  imageDataUri?: string;
  data?: unknown;
  chartType?: "line" | "bar" | "pie" | "scatter" | "flow" | "table";
  title: string;
  caption: string;
  altText: string;
  accessibilityDesc?: string;
  sectionId: string;
  paragraphIndex: number;
  anchorMode: "after_paragraph" | "inline" | "sidebar";
  referencedBy: { sectionId: string; phrase: string }[];
  width?: "full" | "half" | "quarter";
  position?: "left" | "center" | "right";
}

/** 快速视图（QuickView） */
export interface ArtifactQuickView {
  executiveSummary: { markdown: string; wordCount: number };
  topHighlights: ArtifactHighlight[];
  topTrends: {
    title: string;
    description: string;
    sourceDimensionId?: string;
  }[];
  keyRisks: { title: string; description: string }[];
  topRecommendations: { title: string; description: string }[];
  keyCitations: number[];
  keyFigures: string[];
  estimatedReadingTime: number;
  whatYouWillLearn: string[];
}

export interface ArtifactHighlight {
  type: "finding" | "trend" | "risk" | "opportunity" | "recommendation";
  title: string;
  oneLineSummary: string;
  sourceDimensionId: string;
  citations: number[];
  figureIds?: string[];
}

/** 事实表（超越 TI 的差异化能力） */
export interface ArtifactFactTriple {
  id: string;
  entity: string;
  attribute: string;
  value: string;
  sources: number[];
  conflict?: ArtifactConflictResolution;
}

export interface ArtifactConflictResolution {
  factIds: string[];
  resolutionType: "kept-both" | "preferred-one" | "flagged-unresolved";
  rationale: string;
}

/** 元信息 */
export interface ArtifactMetadata {
  topic: string;
  generatedAt: string;
  generationTimeMs: number;
  version: number;
  versionLabel?: string;
  isIncremental: boolean;
  changesFromPrev?: {
    sectionId: string;
    type: "added" | "modified" | "deleted";
  }[];
  dimensionCount: number;
  sourceCount: number;
  factCount: number;
  figureCount: number;
  wordCount: number;
  readingTimeMinutes: number;
  styleProfile: "academic" | "executive" | "journalistic" | "technical";
  lengthProfile: "brief" | "standard" | "deep" | "extended" | "epic" | "mega";
  audienceProfile: "executive" | "domain-expert" | "general-public";
  language: "zh-CN" | "en-US";
  totalTokens: { prompt: number; completion: number; total: number };
  costCents: number;
  modelTrail: string[];
  /**
   * ★ Phase Lead-2: M6 SYNTHESIS Lead Foreword
   * Lead 在 mission 末尾写的 meta-level 执行摘要（不同于 Writer.summary）：
   *   - whatWeAnswered[] vs M0 successCriteria 逐条评估
   *   - whatRemainsUnclear[] 诚实承认局限
   *   - howToRead 引导用户阅读
   *   - recommendedFollowUp[] 下一步研究方向
   * 渲染时放在 ExecutiveSummary 之前，作为整份报告"老板视角"。
   */
  leaderForeword?: {
    whatWeAnswered: {
      criterion: string;
      addressed: "yes" | "partial" | "no";
      evidence: string;
    }[];
    whatRemainsUnclear: string[];
    howToRead: string;
    recommendedFollowUp: string[];
    generatedAt: string;
  };
  /**
   * ★ 沉淀消费 v3 (2026-04-29): 全链路质量 trace —— 5 探针 + 5 维评分 + Top issues
   * 由 ai-harness/evaluation/critique/QualityTraceComputeService 汇总，
   * 写入 reportArtifact.metadata，前端可视化 + 离线评估都用同一份。
   */
  pipelineQualityTrace?: import("../../../facade").QualityTrace;
  /**
   * ★ 沉淀消费 v3 (2026-04-29): 10 维 EVALUATOR 模型独立评分 + 模型对比
   */
  pipelineEvaluation?: import("../../../facade").EvaluationResult;
}

/** 10 维质量评分 */
export interface ArtifactQualityVerdicts {
  overall: number;
  dimensions: {
    traceability: number;
    factualConsistency: number;
    novelty: number;
    coverage: number;
    redundancy: number;
    formatCorrectness: number;
    citationDensity: number;
    styleConformance: number;
    lengthAccuracy: number;
    chapterBalance: number;
  };
  hardGateViolations: {
    dimension: string;
    severity: "error" | "warning";
    message: string;
  }[];
  warnings: { dimension: string; message: string }[];
  qualityTrace: {
    stage: string;
    check: string;
    passed: boolean;
    timestamp: number;
  }[];
  /**
   * P100-1: 终态汇总（前端可一眼看到的"质量信号"）
   * - excellent: overall ≥ 85 & 无 hardGate
   * - good: overall 70-84 & 无 hardGate
   * - acceptable: overall 50-69 OR hardGate=warning
   * - poor: overall <50 OR hardGate=error
   */
  finalVerdict?: "excellent" | "good" | "acceptable" | "poor";
}

/** ★ ReportArtifact 完整结构（v2） */
export interface ReportArtifact {
  // 段 1：核心内容
  content: {
    fullMarkdown: string;
    fullReportUri?: string;
    fullReportSize: number;
  };
  // 段 2：结构元数据
  sections: ArtifactSection[];
  // 段 3：引用表
  citations: ArtifactCitation[];
  // 段 4：图表表
  figures: ArtifactFigure[];
  // 段 5：快速视图
  quickView: ArtifactQuickView;
  // 段 6：事实表
  factTable: ArtifactFactTriple[];
  // 段 7：元信息
  metadata: ArtifactMetadata;
  // 段 8：质量
  quality: ArtifactQualityVerdicts;
}
