/**
 * Topic Research - Report Types
 *
 * 综合研究报告的类型定义
 */

// ==================== Report Section ====================

/**
 * 报告章节
 */
export interface ReportSection {
  /** 章节编号 (如 "1", "2") */
  sectionNumber: string;
  /** 章节标题 */
  title: string;
  /** 核心观点列表 */
  coreViewpoints: string[];
  /** 章节内容 (Markdown 格式) */
  content: string;
  /** 关键数据 */
  keyData: Array<{
    data: string;
    source: string;
  }>;
  /** 图表引用 */
  figureReferences: Array<{
    id: string;
    description: string;
    suggestedType: "趋势图" | "对比图" | "流程图" | "表格" | "其他";
  }>;
}

// ==================== Report Appendix ====================

/**
 * 报告附录
 */
export interface ReportAppendix {
  /** 附录标题 */
  title: string;
  /** 附录内容 (Markdown 格式) */
  content: string;
}

// ==================== Report Reference ====================

/**
 * 参考文献
 */
export interface ReportReference {
  /** 引用索引 */
  index: number;
  /** 标题 */
  title: string;
  /** URL */
  url: string;
  /** 访问日期 */
  accessDate: string;
  /** 来源域名 */
  domain: string | null;
}

// ==================== Report Metadata ====================

/**
 * 报告元数据
 */
export interface ReportMetadata {
  /** 总字数 */
  totalWords: number;
  /** 总来源数 */
  totalSources: number;
  /** 研究时间范围 */
  researchPeriod: string;
  /** 生成时间 */
  generatedAt: string;
}

// ==================== Comprehensive Report ====================

/**
 * 综合研究报告
 */
export interface ComprehensiveReport {
  /** 前言 (Markdown 格式) */
  preface: string;
  /** 目录 (Markdown 格式) */
  tableOfContents: string;
  /** 执行摘要 (面向高管的快速阅读版) */
  executiveSummary: string;
  /** 各章节内容 */
  sections: ReportSection[];
  /** 结束语/建议 (Markdown 格式) */
  conclusion: string;
  /** 附录列表 */
  appendices: ReportAppendix[];
  /** 参考文献列表 */
  references: ReportReference[];
  /** 元数据 */
  metadata: ReportMetadata;
}

// ==================== Report Highlight ====================

/**
 * 报告亮点 (旧格式兼容)
 */
export interface ReportHighlight {
  /** 亮点标题 */
  title: string;
  /** 亮点内容 */
  content: string;
  /** 类别 */
  category: string;
  /** 来源维度名称 */
  dimensionName: string;
}

// ==================== AI Response Types ====================

/**
 * AI 报告合成响应
 */
export interface AIReportSynthesisResponse {
  preface: string;
  tableOfContents: string;
  executiveSummary: string;
  sections: ReportSection[];
  conclusion: string;
  appendices: ReportAppendix[];
  references: Array<{
    index: number;
    title: string;
    url: string;
    accessDate: string;
    domain: string | null;
  }>;
  metadata: {
    totalWords: number;
    totalSources: number;
    researchPeriod: string;
    generatedAt: string;
  };
}

// ==================== Dimension Analysis Input ====================

/**
 * 维度分析输入（用于报告合成）
 */
export interface DimensionAnalysisInput {
  dimensionId: string;
  dimensionName: string;
  dimensionDescription: string | null;
  summary: string;
  keyFindings: Array<{
    finding: string;
    significance: string;
    evidenceIds: string[];
  }>;
  trends: Array<{
    trend: string;
    direction: string;
    timeframe: string;
    evidenceIds: string[];
  }>;
  challenges: Array<{
    challenge: string;
    impact: string;
    evidenceIds: string[];
  }>;
  opportunities: Array<{
    opportunity: string;
    potential: string;
    evidenceIds: string[];
  }>;
  detailedContent: string;
  sourcesUsed: number;
}

// ==================== Evidence Input ====================

/**
 * 证据输入（用于报告合成）
 */
export interface EvidenceInput {
  citationIndex: number;
  title: string;
  url: string;
  domain: string | null;
  sourceType: string | null;
  publishedAt: Date | null;
  credibilityScore: number | null;
}

// ==================== Report Synthesis Result ====================

/**
 * 报告合成结果
 */
export interface ReportSynthesisResult {
  /** 执行摘要 */
  executiveSummary: string;
  /** 完整报告 (Markdown 格式，包含所有章节) */
  fullReport: string;
  /** 亮点列表 (兼容旧格式) */
  highlights: ReportHighlight[];
  /** 结构化报告数据 */
  structuredReport: ComprehensiveReport;
}
