/**
 * Docs 专业文档模板类型定义
 * 针对长文档的结构化章节模板
 *
 * 与 Slides 模板的区别：
 * - Slides: 页面为单位，视觉优先，信息密度低
 * - Docs: 章节为单位，内容优先，信息密度高
 *
 * 设计原则：
 * - 图文并茂：每个章节都有图片需求定义
 * - 阅读体验：控制段落长度、视觉休息点
 * - MECE原则：章节间完整且不重叠
 */

import {
  ImageType,
  ImagePlacement,
  VisualBreakType,
  ReadingRhythm,
} from "../common";
import type { ReadingExperienceConfig } from "../common";

/**
 * Docs 模板类型字符串联合类型
 * 用于 Record 的键类型
 */
export type DocsTemplateTypeString =
  | "executiveSummary"
  | "introduction"
  | "conclusion"
  | "appendix"
  | "analysis"
  | "comparison"
  | "caseStudy"
  | "dataReport"
  | "statistics"
  | "methodology"
  | "recommendations"
  | "actionPlan"
  | "riskAssessment"
  | "narrative"
  | "timeline"
  | "process";

// ============================================================================
// 文档章节内容类型
// ============================================================================

/**
 * 所有章节内容的联合类型
 */
export type DocsSectionContent =
  | ExecutiveSummarySectionContent
  | IntroductionSectionContent
  | ConclusionSectionContent
  | AppendixSectionContent
  | AnalysisSectionContent
  | ComparisonSectionContent
  | CaseStudySectionContent
  | DataReportSectionContent
  | StatisticsSectionContent
  | MethodologySectionContent
  | RecommendationsSectionContent
  | ActionPlanSectionContent
  | RiskAssessmentSectionContent
  | NarrativeSectionContent
  | TimelineSectionContent
  | ProcessSectionContent;

// ============================================================================
// 各章节内容详细定义
// ============================================================================

/**
 * 执行摘要章节
 */
export interface ExecutiveSummarySectionContent {
  templateType: "executiveSummary";
  title: string;
  overview: string;
  keyFindings: Array<{
    icon?: string;
    title: string;
    description: string;
    importance: "high" | "medium" | "low";
  }>;
  keyMetrics?: Array<{
    label: string;
    value: string;
    context?: string;
  }>;
  recommendations?: string[];
  conclusion?: string;
  readingTime?: string;
}

/**
 * 引言章节
 */
export interface IntroductionSectionContent {
  templateType: "introduction";
  title: string;
  background: string;
  purpose: string;
  scope: string;
  methodology?: string;
  structure?: Array<{
    chapter: string;
    description: string;
  }>;
  keyTerms?: Array<{
    term: string;
    definition: string;
  }>;
}

/**
 * 结论章节
 */
export interface ConclusionSectionContent {
  templateType: "conclusion";
  title: string;
  summary: string;
  keyTakeaways: Array<{
    title: string;
    description: string;
    actionable?: boolean;
  }>;
  implications?: string;
  futureOutlook?: string;
  callToAction?: string;
  limitations?: string[];
}

/**
 * 附录章节
 */
export interface AppendixSectionContent {
  templateType: "appendix";
  title: string;
  items: Array<{
    id: string;
    title: string;
    type: "table" | "figure" | "data" | "reference" | "glossary";
    content: string;
    source?: string;
  }>;
  references?: Array<{
    id: string;
    citation: string;
    url?: string;
  }>;
}

/**
 * 深度分析章节
 */
export interface AnalysisSectionContent {
  templateType: "analysis";
  title: string;
  introduction: string;
  framework?: {
    name: string;
    description: string;
    components: string[];
  };
  sections: Array<{
    title: string;
    content: string;
    findings?: string[];
    evidence?: string[];
    charts?: ChartSpec[];
    images?: ImageSpec[];
  }>;
  synthesis: string;
  implications?: string;
}

/**
 * 对比分析章节
 */
export interface ComparisonSectionContent {
  templateType: "comparison";
  title: string;
  introduction: string;
  subjects: Array<{
    id: string;
    name: string;
    description: string;
    strengths?: string[];
    weaknesses?: string[];
  }>;
  dimensions: Array<{
    name: string;
    description?: string;
    comparisons: Record<string, string | number>;
    winner?: string;
    analysis?: string;
  }>;
  summary: string;
  recommendation?: string;
  comparisonTable?: boolean;
}

/**
 * 案例研究章节
 */
export interface CaseStudySectionContent {
  templateType: "caseStudy";
  title: string;
  introduction: string;
  cases: Array<{
    id: string;
    name: string;
    company?: string;
    industry?: string;
    background: string;
    challenge: string;
    solution: string;
    implementation?: string;
    results: Array<{
      metric: string;
      value: string;
      improvement?: string;
    }>;
    lessons?: string[];
    quote?: {
      text: string;
      author: string;
      title?: string;
    };
    image?: ImageSpec;
  }>;
  crossCaseAnalysis?: string;
  keyInsights: string[];
}

/**
 * 数据报告章节
 */
export interface DataReportSectionContent {
  templateType: "dataReport";
  title: string;
  introduction: string;
  dataOverview: {
    source: string;
    period?: string;
    sampleSize?: string;
    methodology?: string;
  };
  sections: Array<{
    title: string;
    description: string;
    data: DataTable | ChartSpec;
    analysis: string;
    insights?: string[];
  }>;
  summary: string;
  dataLimitations?: string[];
}

/**
 * 统计分析章节
 */
export interface StatisticsSectionContent {
  templateType: "statistics";
  title: string;
  introduction: string;
  methodology: string;
  statistics: Array<{
    name: string;
    description: string;
    value: string | number;
    confidence?: string;
    significance?: string;
    chart?: ChartSpec;
  }>;
  correlations?: Array<{
    variables: string[];
    coefficient: number;
    interpretation: string;
  }>;
  summary: string;
  technicalNotes?: string;
}

/**
 * 方法论章节
 */
export interface MethodologySectionContent {
  templateType: "methodology";
  title: string;
  overview: string;
  approach: {
    name: string;
    description: string;
    rationale: string;
  };
  steps: Array<{
    number: number;
    title: string;
    description: string;
    tools?: string[];
    outputs?: string[];
  }>;
  dataCollection?: {
    methods: string[];
    sources: string[];
    period?: string;
  };
  analysisFramework?: string;
  limitations?: string[];
  validationApproach?: string;
}

/**
 * 建议章节
 */
export interface RecommendationsSectionContent {
  templateType: "recommendations";
  title: string;
  introduction: string;
  recommendations: Array<{
    id: string;
    number?: number;
    title: string;
    description: string;
    rationale: string;
    priority: "critical" | "high" | "medium" | "low";
    timeframe?: "immediate" | "short_term" | "medium_term" | "long_term";
    effort?: "low" | "medium" | "high";
    impact?: "low" | "medium" | "high";
    stakeholders?: string[];
    dependencies?: string[];
    successMetrics?: string[];
  }>;
  implementationConsiderations?: string;
  prioritizationMatrix?: boolean;
  summary: string;
}

/**
 * 行动计划章节
 */
export interface ActionPlanSectionContent {
  templateType: "actionPlan";
  title: string;
  introduction: string;
  objectives: Array<{
    id: string;
    title: string;
    description: string;
    measurable: string;
  }>;
  phases: Array<{
    id: string;
    name: string;
    timeframe: string;
    objectives: string[];
    activities: Array<{
      title: string;
      description: string;
      owner?: string;
      deadline?: string;
      resources?: string[];
    }>;
    deliverables: string[];
    milestones: string[];
    risks?: string[];
  }>;
  resourceRequirements?: {
    budget?: string;
    team?: string[];
    tools?: string[];
  };
  successCriteria: string[];
  monitoringPlan?: string;
}

/**
 * 风险评估章节
 */
export interface RiskAssessmentSectionContent {
  templateType: "riskAssessment";
  title: string;
  introduction: string;
  methodology?: string;
  risks: Array<{
    id: string;
    title: string;
    description: string;
    category: string;
    probability: "high" | "medium" | "low";
    impact: "high" | "medium" | "low";
    riskScore?: number;
    triggers?: string[];
    mitigation: {
      strategy: string;
      actions: string[];
      owner?: string;
      timeline?: string;
    };
    contingency?: string;
    residualRisk?: string;
  }>;
  riskMatrix?: boolean;
  summary: string;
  overallRiskProfile?: string;
  recommendations?: string[];
}

/**
 * 叙事章节
 */
export interface NarrativeSectionContent {
  templateType: "narrative";
  title: string;
  introduction: string;
  paragraphs: Array<{
    content: string;
    emphasis?: string;
    quote?: {
      text: string;
      author?: string;
    };
    image?: ImageSpec;
    callout?: {
      type: "info" | "warning" | "success" | "tip";
      title?: string;
      content: string;
    };
  }>;
  conclusion?: string;
}

/**
 * 时间线章节
 */
export interface TimelineSectionContent {
  templateType: "timeline";
  title: string;
  introduction: string;
  events: Array<{
    id: string;
    date: string;
    title: string;
    description: string;
    significance?: string;
    details?: string[];
    image?: ImageSpec;
    category?: string;
  }>;
  analysis?: string;
  futureOutlook?: string;
  showVisualization?: boolean;
}

/**
 * 流程说明章节
 */
export interface ProcessSectionContent {
  templateType: "process";
  title: string;
  introduction: string;
  overview?: string;
  steps: Array<{
    number: number;
    title: string;
    description: string;
    inputs?: string[];
    outputs?: string[];
    responsible?: string;
    tools?: string[];
    tips?: string[];
    warnings?: string[];
    image?: ImageSpec;
  }>;
  diagram?: boolean;
  bestPractices?: string[];
  commonMistakes?: string[];
  summary?: string;
}

// ============================================================================
// 辅助类型
// ============================================================================

/**
 * 图表规格
 */
export interface ChartSpec {
  type:
    | "bar"
    | "line"
    | "pie"
    | "donut"
    | "area"
    | "radar"
    | "scatter"
    | "heatmap";
  title: string;
  data: Array<{
    label: string;
    value: number;
    category?: string;
    color?: string;
  }>;
  xAxis?: string;
  yAxis?: string;
  showLegend?: boolean;
  caption?: string;
}

/**
 * 图片规格
 */
export interface ImageSpec {
  type: ImageType;
  placement: ImagePlacement;
  description: string;
  keywords: string[];
  aspectRatio?: "16:9" | "4:3" | "1:1" | "3:2" | "2:1";
  caption?: string;
  source?: string;
  alt?: string;
}

/**
 * 数据表格
 */
export interface DataTable {
  title?: string;
  headers: string[];
  rows: Array<Record<string, string | number>>;
  footer?: string[];
  caption?: string;
  highlightRows?: number[];
}

// ============================================================================
// 章节模板规格
// ============================================================================

/**
 * 简化的图片需求 (用于模板规格)
 */
interface TemplateImageRecommendation {
  type: ImageType;
  placement: ImagePlacement;
  priority: "required" | "recommended" | "optional";
}

/**
 * 简化的阅读体验配置 (用于模板规格)
 */
interface TemplateReadingExperience {
  density?: {
    maxWordsPerParagraph?: number;
    maxParagraphsPerSection?: number;
    maxBulletsPerList?: number;
    idealTextToVisualRatio?: string;
  };
  rhythm?: {
    type?: ReadingRhythm;
    visualBreakFrequency?: number;
    preferredBreakTypes?: VisualBreakType[];
  };
}

/**
 * 章节模板规格
 */
export interface DocsSectionTemplateSpec {
  type: DocsTemplateTypeString;
  name: string;
  nameZh: string;
  description: string;
  category: "structural" | "analytical" | "data" | "strategic" | "narrative";
  estimatedWordCount: {
    min: number;
    max: number;
  };
  imageRecommendations: TemplateImageRecommendation[];
  readingExperience: TemplateReadingExperience;
  visualBreaks: VisualBreakType[];
  bestFor: string[];
  avoidFor: string[];
}

/**
 * 章节模板规格定义
 */
export const DOCS_TEMPLATE_SPECS: Record<
  DocsTemplateTypeString,
  DocsSectionTemplateSpec
> = {
  executiveSummary: {
    type: "executiveSummary",
    name: "Executive Summary",
    nameZh: "执行摘要",
    description: "高层摘要，快速传达核心信息",
    category: "structural",
    estimatedWordCount: { min: 300, max: 800 },
    imageRecommendations: [
      {
        type: ImageType.INFOGRAPHIC,
        placement: ImagePlacement.HERO,
        priority: "recommended",
      },
    ],
    readingExperience: {
      density: {
        maxWordsPerParagraph: 100,
        idealTextToVisualRatio: "70:30",
      },
    },
    visualBreaks: [VisualBreakType.CALLOUT, VisualBreakType.INFOGRAPHIC],
    bestFor: ["决策者阅读", "快速概览"],
    avoidFor: ["技术细节", "完整论证"],
  },
  introduction: {
    type: "introduction",
    name: "Introduction",
    nameZh: "引言",
    description: "介绍背景、目的和范围",
    category: "structural",
    estimatedWordCount: { min: 400, max: 1000 },
    imageRecommendations: [],
    readingExperience: {
      density: {
        maxWordsPerParagraph: 150,
        idealTextToVisualRatio: "80:20",
      },
    },
    visualBreaks: [VisualBreakType.QUOTE, VisualBreakType.DIVIDER],
    bestFor: ["设定上下文", "定义范围"],
    avoidFor: ["详细分析", "结论"],
  },
  conclusion: {
    type: "conclusion",
    name: "Conclusion",
    nameZh: "结论",
    description: "总结发现和建议",
    category: "structural",
    estimatedWordCount: { min: 300, max: 700 },
    imageRecommendations: [
      {
        type: ImageType.ILLUSTRATION_FLAT,
        placement: ImagePlacement.HERO,
        priority: "optional",
      },
    ],
    readingExperience: {
      density: {
        maxWordsPerParagraph: 120,
        idealTextToVisualRatio: "75:25",
      },
    },
    visualBreaks: [VisualBreakType.CALLOUT],
    bestFor: ["总结", "行动号召"],
    avoidFor: ["新信息引入"],
  },
  appendix: {
    type: "appendix",
    name: "Appendix",
    nameZh: "附录",
    description: "补充材料和参考文献",
    category: "structural",
    estimatedWordCount: { min: 200, max: 2000 },
    imageRecommendations: [],
    readingExperience: {
      density: {
        idealTextToVisualRatio: "90:10",
      },
    },
    visualBreaks: [VisualBreakType.DIVIDER],
    bestFor: ["详细数据", "参考文献"],
    avoidFor: ["核心论证"],
  },
  analysis: {
    type: "analysis",
    name: "Analysis",
    nameZh: "深度分析",
    description: "深度分析和论证",
    category: "analytical",
    estimatedWordCount: { min: 800, max: 2500 },
    imageRecommendations: [
      {
        type: ImageType.CHART,
        placement: ImagePlacement.INLINE,
        priority: "required",
      },
      {
        type: ImageType.DIAGRAM,
        placement: ImagePlacement.HERO,
        priority: "recommended",
      },
    ],
    readingExperience: {
      density: {
        maxWordsPerParagraph: 180,
        maxParagraphsPerSection: 6,
        idealTextToVisualRatio: "60:40",
      },
      rhythm: {
        visualBreakFrequency: 3,
      },
    },
    visualBreaks: [
      VisualBreakType.INFOGRAPHIC,
      VisualBreakType.CALLOUT,
      VisualBreakType.QUOTE,
    ],
    bestFor: ["深度论证", "数据分析"],
    avoidFor: ["快速概览"],
  },
  comparison: {
    type: "comparison",
    name: "Comparison",
    nameZh: "对比分析",
    description: "多方案或多对象对比",
    category: "analytical",
    estimatedWordCount: { min: 600, max: 1500 },
    imageRecommendations: [
      {
        type: ImageType.INFOGRAPHIC,
        placement: ImagePlacement.HERO,
        priority: "required",
      },
    ],
    readingExperience: {
      density: {
        idealTextToVisualRatio: "50:50",
      },
    },
    visualBreaks: [VisualBreakType.INFOGRAPHIC],
    bestFor: ["方案对比", "竞品分析"],
    avoidFor: ["单一主题"],
  },
  caseStudy: {
    type: "caseStudy",
    name: "Case Study",
    nameZh: "案例研究",
    description: "真实案例分析",
    category: "analytical",
    estimatedWordCount: { min: 600, max: 1800 },
    imageRecommendations: [
      {
        type: ImageType.PHOTO_BUSINESS,
        placement: ImagePlacement.SIDE,
        priority: "recommended",
      },
    ],
    readingExperience: {
      density: {
        idealTextToVisualRatio: "65:35",
      },
    },
    visualBreaks: [VisualBreakType.QUOTE, VisualBreakType.CALLOUT],
    bestFor: ["实践证明", "最佳实践"],
    avoidFor: ["理论概念"],
  },
  dataReport: {
    type: "dataReport",
    name: "Data Report",
    nameZh: "数据报告",
    description: "数据驱动的报告章节",
    category: "data",
    estimatedWordCount: { min: 500, max: 1500 },
    imageRecommendations: [
      {
        type: ImageType.CHART,
        placement: ImagePlacement.INLINE,
        priority: "required",
      },
    ],
    readingExperience: {
      density: {
        idealTextToVisualRatio: "40:60",
      },
    },
    visualBreaks: [VisualBreakType.INFOGRAPHIC],
    bestFor: ["数据呈现", "趋势分析"],
    avoidFor: ["叙事内容"],
  },
  statistics: {
    type: "statistics",
    name: "Statistics",
    nameZh: "统计分析",
    description: "统计方法和结果",
    category: "data",
    estimatedWordCount: { min: 400, max: 1200 },
    imageRecommendations: [
      {
        type: ImageType.CHART,
        placement: ImagePlacement.INLINE,
        priority: "required",
      },
    ],
    readingExperience: {
      density: {
        idealTextToVisualRatio: "45:55",
      },
    },
    visualBreaks: [VisualBreakType.INFOGRAPHIC],
    bestFor: ["量化分析", "假设验证"],
    avoidFor: ["定性描述"],
  },
  methodology: {
    type: "methodology",
    name: "Methodology",
    nameZh: "方法论",
    description: "研究方法说明",
    category: "data",
    estimatedWordCount: { min: 400, max: 1000 },
    imageRecommendations: [
      {
        type: ImageType.DIAGRAM,
        placement: ImagePlacement.HERO,
        priority: "recommended",
      },
    ],
    readingExperience: {
      density: {
        idealTextToVisualRatio: "70:30",
      },
    },
    visualBreaks: [VisualBreakType.DIVIDER],
    bestFor: ["方法说明", "流程描述"],
    avoidFor: ["结果展示"],
  },
  recommendations: {
    type: "recommendations",
    name: "Recommendations",
    nameZh: "建议",
    description: "行动建议和优先级",
    category: "strategic",
    estimatedWordCount: { min: 500, max: 1200 },
    imageRecommendations: [
      {
        type: ImageType.ICON,
        placement: ImagePlacement.ICON,
        priority: "recommended",
      },
    ],
    readingExperience: {
      density: {
        maxBulletsPerList: 5,
        idealTextToVisualRatio: "70:30",
      },
    },
    visualBreaks: [VisualBreakType.CALLOUT],
    bestFor: ["行动指导", "决策支持"],
    avoidFor: ["纯分析"],
  },
  actionPlan: {
    type: "actionPlan",
    name: "Action Plan",
    nameZh: "行动计划",
    description: "具体实施计划",
    category: "strategic",
    estimatedWordCount: { min: 600, max: 1500 },
    imageRecommendations: [
      {
        type: ImageType.DIAGRAM,
        placement: ImagePlacement.HERO,
        priority: "required",
      },
    ],
    readingExperience: {
      density: {
        idealTextToVisualRatio: "55:45",
      },
    },
    visualBreaks: [VisualBreakType.INFOGRAPHIC, VisualBreakType.DIVIDER],
    bestFor: ["实施规划", "项目管理"],
    avoidFor: ["理论分析"],
  },
  riskAssessment: {
    type: "riskAssessment",
    name: "Risk Assessment",
    nameZh: "风险评估",
    description: "风险识别和应对",
    category: "strategic",
    estimatedWordCount: { min: 500, max: 1300 },
    imageRecommendations: [
      {
        type: ImageType.INFOGRAPHIC,
        placement: ImagePlacement.HERO,
        priority: "required",
      },
    ],
    readingExperience: {
      density: {
        idealTextToVisualRatio: "55:45",
      },
    },
    visualBreaks: [VisualBreakType.CALLOUT, VisualBreakType.INFOGRAPHIC],
    bestFor: ["风险管理", "应急预案"],
    avoidFor: ["机会分析"],
  },
  narrative: {
    type: "narrative",
    name: "Narrative",
    nameZh: "叙事",
    description: "故事性叙述",
    category: "narrative",
    estimatedWordCount: { min: 400, max: 1500 },
    imageRecommendations: [
      {
        type: ImageType.PHOTO_ABSTRACT,
        placement: ImagePlacement.HERO,
        priority: "recommended",
      },
    ],
    readingExperience: {
      density: {
        maxWordsPerParagraph: 200,
        idealTextToVisualRatio: "75:25",
      },
      rhythm: {
        visualBreakFrequency: 4,
      },
    },
    visualBreaks: [VisualBreakType.QUOTE, VisualBreakType.FULL_IMAGE],
    bestFor: ["故事讲述", "背景介绍"],
    avoidFor: ["数据分析"],
  },
  timeline: {
    type: "timeline",
    name: "Timeline",
    nameZh: "时间线",
    description: "时间顺序叙述",
    category: "narrative",
    estimatedWordCount: { min: 400, max: 1200 },
    imageRecommendations: [
      {
        type: ImageType.DIAGRAM,
        placement: ImagePlacement.HERO,
        priority: "required",
      },
    ],
    readingExperience: {
      density: {
        idealTextToVisualRatio: "50:50",
      },
    },
    visualBreaks: [VisualBreakType.INFOGRAPHIC],
    bestFor: ["历史回顾", "发展脉络"],
    avoidFor: ["非时间相关内容"],
  },
  process: {
    type: "process",
    name: "Process",
    nameZh: "流程说明",
    description: "步骤和流程说明",
    category: "narrative",
    estimatedWordCount: { min: 400, max: 1000 },
    imageRecommendations: [
      {
        type: ImageType.DIAGRAM,
        placement: ImagePlacement.HERO,
        priority: "required",
      },
      {
        type: ImageType.ICON,
        placement: ImagePlacement.ICON,
        priority: "recommended",
      },
    ],
    readingExperience: {
      density: {
        idealTextToVisualRatio: "55:45",
      },
    },
    visualBreaks: [VisualBreakType.INFOGRAPHIC, VisualBreakType.CALLOUT],
    bestFor: ["操作指南", "流程文档"],
    avoidFor: ["分析论证"],
  },
};

// ============================================================================
// 文档结构类型
// ============================================================================

/**
 * 增强的文档结构 (V2)
 */
export interface DocsStructureV2 {
  // 元数据
  metadata: {
    title: string;
    subtitle?: string;
    author?: string;
    organization?: string;
    date: string;
    version?: string;
    classification?: "public" | "internal" | "confidential";
    language: "zh-CN" | "en-US";
  };

  // 文档类型
  documentType:
    | "research_report"
    | "analysis_report"
    | "strategy_report"
    | "consulting_report"
    | "technical_report";

  // 章节结构
  sections: DocsSectionV2[];

  // 阅读体验配置
  readingExperience: ReadingExperienceConfig;

  // 图片配置
  imageStrategy: {
    density: "sparse" | "balanced" | "rich";
    style: "photo" | "illustration" | "mixed";
    primaryTypes: ImageType[];
  };

  // 统计信息
  stats: {
    totalSections: number;
    estimatedWordCount: number;
    estimatedReadingTime: number;
    imageCount: number;
    chartCount: number;
    tableCount: number;
  };
}

/**
 * 增强文档章节 (V2版本，用于模板系统)
 */
export interface DocsSectionV2 {
  id: string;
  order: number;
  level: 1 | 2 | 3;
  templateType: DocsTemplateTypeString;
  title: string;
  content: DocsSectionContent;
  images: ImageSpec[];
  charts: ChartSpec[];
  tables: DataTable[];
  visualBreaks: Array<{
    afterParagraph: number;
    type: VisualBreakType;
    content?: string;
  }>;
  wordCount: number;
  readingTime: number;
}

/**
 * 获取模板默认内容结构
 */
export function getDefaultDocsSectionContent(
  templateType: DocsTemplateTypeString,
): Partial<DocsSectionContent> {
  const defaults: Record<
    DocsTemplateTypeString,
    Partial<DocsSectionContent>
  > = {
    executiveSummary: {
      templateType: "executiveSummary",
      title: "执行摘要",
      overview: "",
      keyFindings: [],
    },
    introduction: {
      templateType: "introduction",
      title: "引言",
      background: "",
      purpose: "",
      scope: "",
    },
    conclusion: {
      templateType: "conclusion",
      title: "结论",
      summary: "",
      keyTakeaways: [],
    },
    appendix: {
      templateType: "appendix",
      title: "附录",
      items: [],
    },
    analysis: {
      templateType: "analysis",
      title: "",
      introduction: "",
      sections: [],
      synthesis: "",
    },
    comparison: {
      templateType: "comparison",
      title: "",
      introduction: "",
      subjects: [],
      dimensions: [],
      summary: "",
    },
    caseStudy: {
      templateType: "caseStudy",
      title: "",
      introduction: "",
      cases: [],
      keyInsights: [],
    },
    dataReport: {
      templateType: "dataReport",
      title: "",
      introduction: "",
      dataOverview: { source: "" },
      sections: [],
      summary: "",
    },
    statistics: {
      templateType: "statistics",
      title: "",
      introduction: "",
      methodology: "",
      statistics: [],
      summary: "",
    },
    methodology: {
      templateType: "methodology",
      title: "方法论",
      overview: "",
      approach: { name: "", description: "", rationale: "" },
      steps: [],
    },
    recommendations: {
      templateType: "recommendations",
      title: "建议",
      introduction: "",
      recommendations: [],
      summary: "",
    },
    actionPlan: {
      templateType: "actionPlan",
      title: "行动计划",
      introduction: "",
      objectives: [],
      phases: [],
      successCriteria: [],
    },
    riskAssessment: {
      templateType: "riskAssessment",
      title: "风险评估",
      introduction: "",
      risks: [],
      summary: "",
    },
    narrative: {
      templateType: "narrative",
      title: "",
      introduction: "",
      paragraphs: [],
    },
    timeline: {
      templateType: "timeline",
      title: "",
      introduction: "",
      events: [],
    },
    process: {
      templateType: "process",
      title: "",
      introduction: "",
      steps: [],
    },
  };

  return defaults[templateType];
}
