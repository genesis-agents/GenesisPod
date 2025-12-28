/**
 * PPT 专业模板类型定义
 * 基于 Genspark 7+2 金字塔结构的15种页面模板
 *
 * 与 shared 模块配合使用：
 * - ContentFeatures: 内容特征分析
 * - ImageRequirement: 图片需求
 */

// 本地定义类型，避免循环依赖

/**
 * 15种页面模板类型（字符串字面量）
 */
export type SlideTemplateTypeString =
  | "cover"
  | "toc"
  | "chapterTitle"
  | "chapterSummary"
  | "conclusion"
  | "timeline"
  | "multiColumn"
  | "splitLayout"
  | "dashboard"
  | "evolutionRoadmap"
  | "comparison"
  | "caseStudy"
  | "maturityModel"
  | "riskOpportunity"
  | "recommendations";

// ============================================================================
// 模板内容类型定义
// ============================================================================

/**
 * 所有模板内容的联合类型
 */
export type SlideTemplateContent =
  | CoverSlideContent
  | TocSlideContent
  | ChapterTitleSlideContent
  | ChapterSummarySlideContent
  | ConclusionSlideContent
  | TimelineSlideContent
  | MultiColumnSlideContent
  | SplitLayoutSlideContent
  | DashboardSlideContent
  | EvolutionRoadmapSlideContent
  | ComparisonSlideContent
  | CaseStudySlideContent
  | MaturityModelSlideContent
  | RiskOpportunitySlideContent
  | RecommendationsSlideContent;

// ============================================================================
// 各模板内容详细定义
// ============================================================================

/**
 * 封面页内容
 */
export interface CoverSlideContent {
  templateType: "cover";
  title: string;
  subtitle?: string;
  author?: string;
  organization?: string;
  date?: string;
  tagline?: string;
  backgroundImage?: string;
  logo?: string;
}

/**
 * 目录页内容
 */
export interface TocSlideContent {
  templateType: "toc";
  title: string;
  items: Array<{
    number: number;
    title: string;
    subtitle?: string;
    isActive?: boolean;
  }>;
  style?: "numbered" | "icons" | "cards";
}

/**
 * 章节标题页内容
 */
export interface ChapterTitleSlideContent {
  templateType: "chapterTitle";
  chapterNumber: number;
  title: string;
  subtitle?: string;
  description?: string;
  icon?: string;
  backgroundImage?: string;
}

/**
 * 章节摘要页内容
 */
export interface ChapterSummarySlideContent {
  templateType: "chapterSummary";
  title: string;
  keyPoints: Array<{
    icon?: string;
    title: string;
    description: string;
    highlight?: boolean;
  }>;
  summary?: string;
  transitionText?: string;
}

/**
 * 结论页内容
 */
export interface ConclusionSlideContent {
  templateType: "conclusion";
  title: string;
  keyTakeaways: Array<{
    icon?: string;
    text: string;
    emphasis?: "high" | "medium" | "low";
  }>;
  callToAction?: string;
  nextSteps?: string[];
  closingMessage?: string;
}

/**
 * 时间线页内容
 */
export interface TimelineSlideContent {
  templateType: "timeline";
  title: string;
  description?: string;
  events: Array<{
    id: string;
    date: string;
    title: string;
    description?: string;
    icon?: string;
    status: "past" | "current" | "future";
    highlight?: boolean;
    color?: string;
  }>;
  orientation: "horizontal" | "vertical";
  showConnectors?: boolean;
}

/**
 * 多栏页内容
 */
export interface MultiColumnSlideContent {
  templateType: "multiColumn";
  title: string;
  subtitle?: string;
  columns: Array<{
    icon?: string;
    title: string;
    content: string;
    items?: string[];
    highlight?: boolean;
    color?: string;
  }>;
  columnCount: 2 | 3 | 4;
  layout?: "equal" | "weighted";
}

/**
 * 分屏布局页内容
 */
export interface SplitLayoutSlideContent {
  templateType: "splitLayout";
  title: string;
  left: SplitSectionContent;
  right: SplitSectionContent;
  ratio: "50-50" | "60-40" | "40-60" | "70-30" | "30-70";
  dividerStyle?: "line" | "gradient" | "none";
}

export interface SplitSectionContent {
  type: "text" | "image" | "chart" | "list" | "quote" | "stats";
  title?: string;
  content?: string;
  items?: string[];
  imageUrl?: string;
  quote?: {
    text: string;
    author?: string;
  };
  stats?: Array<{
    label: string;
    value: string;
    trend?: "up" | "down" | "stable";
  }>;
  chartType?: "bar" | "line" | "pie" | "donut";
  chartData?: Array<{ label: string; value: number; color?: string }>;
}

/**
 * 仪表盘页内容
 */
export interface DashboardSlideContent {
  templateType: "dashboard";
  title: string;
  subtitle?: string;
  metrics: Array<{
    id: string;
    label: string;
    value: string | number;
    unit?: string;
    trend?: "up" | "down" | "stable";
    trendValue?: string;
    icon?: string;
    color?: string;
    size?: "small" | "medium" | "large";
  }>;
  charts?: Array<{
    type: "bar" | "line" | "pie" | "donut" | "area" | "sparkline";
    title?: string;
    data: Array<{ label: string; value: number; color?: string }>;
    position:
      | "top-left"
      | "top-right"
      | "bottom-left"
      | "bottom-right"
      | "center";
    size?: "small" | "medium" | "large";
  }>;
  layout: "grid" | "flow" | "bento";
  summary?: string;
}

/**
 * 演进路线图页内容
 */
export interface EvolutionRoadmapSlideContent {
  templateType: "evolutionRoadmap";
  title: string;
  description?: string;
  stages: Array<{
    id: string;
    phase: string;
    title: string;
    description: string;
    timeframe?: string;
    status: "completed" | "in_progress" | "planned" | "future";
    milestones?: string[];
    deliverables?: string[];
    color?: string;
    icon?: string;
  }>;
  currentStage?: number;
  showProgress?: boolean;
  orientation: "horizontal" | "vertical";
}

/**
 * 对比分析页内容
 */
export interface ComparisonSlideContent {
  templateType: "comparison";
  title: string;
  description?: string;
  subjects: Array<{
    id: string;
    name: string;
    logo?: string;
    tagline?: string;
    isWinner?: boolean;
    color?: string;
  }>;
  criteria: Array<{
    name: string;
    icon?: string;
    weight?: number;
    values: Record<string, ComparisonValue>;
    winner?: string;
  }>;
  showScores?: boolean;
  showOverallWinner?: boolean;
  layout: "table" | "cards" | "side-by-side";
}

export type ComparisonValue =
  | string
  | number
  | boolean
  | { text: string; score?: number; highlight?: boolean };

/**
 * 案例研究页内容
 */
export interface CaseStudySlideContent {
  templateType: "caseStudy";
  title: string;
  company: string;
  industry?: string;
  logo?: string;
  heroImage?: string;
  challenge: {
    title?: string;
    description: string;
    painPoints?: string[];
  };
  solution: {
    title?: string;
    description: string;
    highlights?: string[];
  };
  results: Array<{
    metric: string;
    value: string;
    improvement?: string;
    icon?: string;
    color?: string;
  }>;
  testimonial?: {
    quote: string;
    author: string;
    title: string;
    avatar?: string;
  };
  timeline?: string;
  tags?: string[];
}

/**
 * 成熟度模型页内容
 */
export interface MaturityModelSlideContent {
  templateType: "maturityModel";
  title: string;
  description?: string;
  modelName?: string;
  dimensions: Array<{
    id: string;
    name: string;
    description?: string;
    icon?: string;
    weight?: number;
  }>;
  levels: Array<{
    level: number;
    name: string;
    description: string;
    color?: string;
    criteria?: string[];
  }>;
  currentAssessment: Record<string, number>;
  targetState?: Record<string, number>;
  showRadar?: boolean;
  showProgress?: boolean;
  recommendations?: string[];
}

/**
 * 风险机会矩阵页内容
 */
export interface RiskOpportunitySlideContent {
  templateType: "riskOpportunity";
  title: string;
  description?: string;
  risks: Array<{
    id: string;
    title: string;
    description: string;
    probability: "high" | "medium" | "low";
    impact: "high" | "medium" | "low";
    category?: string;
    mitigation?: string;
    owner?: string;
    icon?: string;
  }>;
  opportunities: Array<{
    id: string;
    title: string;
    description: string;
    potential: "high" | "medium" | "low";
    feasibility: "high" | "medium" | "low";
    category?: string;
    action?: string;
    owner?: string;
    icon?: string;
  }>;
  showMatrix?: boolean;
  showMitigations?: boolean;
  layout: "split" | "matrix" | "list";
}

/**
 * 建议列表页内容
 */
export interface RecommendationsSlideContent {
  templateType: "recommendations";
  title: string;
  subtitle?: string;
  summary?: string;
  recommendations: Array<{
    id: string;
    number?: number;
    title: string;
    description: string;
    priority: "critical" | "high" | "medium" | "low";
    category?: string;
    timeframe?: "immediate" | "short_term" | "medium_term" | "long_term";
    effort?: "low" | "medium" | "high";
    impact?: "low" | "medium" | "high";
    owner?: string;
    icon?: string;
    dependencies?: string[];
  }>;
  showPriorityLegend?: boolean;
  showTimeline?: boolean;
  layout: "numbered" | "cards" | "timeline";
  callToAction?: string;
}

// ============================================================================
// 模板规格定义
// ============================================================================

/**
 * 图片位置类型（本地定义避免循环依赖）
 */
type ImagePlacementLocal =
  | "hero"
  | "inline"
  | "side"
  | "background"
  | "icon"
  | "thumbnail";

/**
 * 图片需求（简化版）
 */
interface ImageRequirementLocal {
  type?: string;
  placement?: ImagePlacementLocal;
  priority?: "required" | "recommended" | "optional";
}

/**
 * 模板规格
 */
export interface SlideTemplateSpec {
  type: SlideTemplateTypeString;
  name: string;
  nameZh: string;
  description: string;
  category:
    | "structural"
    | "timeline"
    | "layout"
    | "data"
    | "analysis"
    | "action";
  minDataPoints?: number;
  maxDataPoints?: number;
  supportsImages: boolean;
  supportsCharts: boolean;
  imageRequirements?: ImageRequirementLocal[];
  bestFor: string[];
  avoidFor: string[];
}

/**
 * 模板规格定义
 */
export const SLIDE_TEMPLATE_SPECS: Record<
  SlideTemplateTypeString,
  SlideTemplateSpec
> = {
  cover: {
    type: "cover",
    name: "Cover",
    nameZh: "封面",
    description: "报告封面页，包含标题、副标题、作者信息",
    category: "structural",
    supportsImages: true,
    supportsCharts: false,
    imageRequirements: [{ placement: "background", priority: "optional" }],
    bestFor: ["开篇", "标题展示"],
    avoidFor: ["内容展示"],
  },
  toc: {
    type: "toc",
    name: "Table of Contents",
    nameZh: "目录",
    description: "目录导航页，展示报告结构",
    category: "structural",
    supportsImages: false,
    supportsCharts: false,
    bestFor: ["导航", "结构概览"],
    avoidFor: ["详细内容"],
  },
  chapterTitle: {
    type: "chapterTitle",
    name: "Chapter Title",
    nameZh: "章节标题",
    description: "章节标题页，用于章节过渡",
    category: "structural",
    supportsImages: true,
    supportsCharts: false,
    bestFor: ["章节开始", "主题切换"],
    avoidFor: ["详细论述"],
  },
  chapterSummary: {
    type: "chapterSummary",
    name: "Chapter Summary",
    nameZh: "章节摘要",
    description: "章节要点总结页",
    category: "structural",
    minDataPoints: 3,
    maxDataPoints: 6,
    supportsImages: false,
    supportsCharts: false,
    bestFor: ["要点总结", "章节结尾"],
    avoidFor: ["详细数据"],
  },
  conclusion: {
    type: "conclusion",
    name: "Conclusion",
    nameZh: "结论",
    description: "结论页，总结关键发现和行动号召",
    category: "structural",
    supportsImages: false,
    supportsCharts: false,
    bestFor: ["总结", "行动号召"],
    avoidFor: ["新内容引入"],
  },
  timeline: {
    type: "timeline",
    name: "Timeline",
    nameZh: "时间线",
    description: "时间线展示，适合发展历程和规划",
    category: "timeline",
    minDataPoints: 3,
    maxDataPoints: 8,
    supportsImages: true,
    supportsCharts: false,
    bestFor: ["历史发展", "项目规划", "里程碑"],
    avoidFor: ["非时间序列数据"],
  },
  multiColumn: {
    type: "multiColumn",
    name: "Multi Column",
    nameZh: "多栏布局",
    description: "多栏并列展示，适合并列要点",
    category: "layout",
    minDataPoints: 2,
    maxDataPoints: 4,
    supportsImages: true,
    supportsCharts: false,
    bestFor: ["并列概念", "多维度展示"],
    avoidFor: ["时间序列", "层级关系"],
  },
  splitLayout: {
    type: "splitLayout",
    name: "Split Layout",
    nameZh: "分屏布局",
    description: "左右分屏，图文结合",
    category: "layout",
    supportsImages: true,
    supportsCharts: true,
    imageRequirements: [{ placement: "side", priority: "recommended" }],
    bestFor: ["图文配合", "对照展示"],
    avoidFor: ["纯数据"],
  },
  dashboard: {
    type: "dashboard",
    name: "Dashboard",
    nameZh: "仪表盘",
    description: "数据仪表盘，展示关键指标",
    category: "data",
    minDataPoints: 4,
    maxDataPoints: 12,
    supportsImages: false,
    supportsCharts: true,
    bestFor: ["KPI展示", "数据概览", "业务监控"],
    avoidFor: ["叙事内容", "详细分析"],
  },
  evolutionRoadmap: {
    type: "evolutionRoadmap",
    name: "Evolution Roadmap",
    nameZh: "演进路线图",
    description: "阶段性发展规划展示",
    category: "timeline",
    minDataPoints: 3,
    maxDataPoints: 6,
    supportsImages: true,
    supportsCharts: false,
    bestFor: ["战略规划", "产品路线", "阶段目标"],
    avoidFor: ["历史数据", "单一事件"],
  },
  comparison: {
    type: "comparison",
    name: "Comparison",
    nameZh: "对比分析",
    description: "多维度对比展示",
    category: "analysis",
    minDataPoints: 2,
    maxDataPoints: 5,
    supportsImages: true,
    supportsCharts: true,
    bestFor: ["竞品分析", "方案对比", "优劣分析"],
    avoidFor: ["单一主题"],
  },
  caseStudy: {
    type: "caseStudy",
    name: "Case Study",
    nameZh: "案例研究",
    description: "案例展示，包含问题、解决方案、结果",
    category: "analysis",
    supportsImages: true,
    supportsCharts: true,
    imageRequirements: [{ placement: "side", priority: "recommended" }],
    bestFor: ["成功案例", "客户故事", "最佳实践"],
    avoidFor: ["理论概念"],
  },
  maturityModel: {
    type: "maturityModel",
    name: "Maturity Model",
    nameZh: "成熟度模型",
    description: "能力成熟度评估展示",
    category: "analysis",
    minDataPoints: 3,
    maxDataPoints: 7,
    supportsImages: false,
    supportsCharts: true,
    bestFor: ["能力评估", "差距分析", "发展阶段"],
    avoidFor: ["时间序列", "简单对比"],
  },
  riskOpportunity: {
    type: "riskOpportunity",
    name: "Risk & Opportunity",
    nameZh: "风险机会",
    description: "风险和机会矩阵展示",
    category: "analysis",
    supportsImages: false,
    supportsCharts: true,
    bestFor: ["风险评估", "机会识别", "SWOT分析"],
    avoidFor: ["单向分析"],
  },
  recommendations: {
    type: "recommendations",
    name: "Recommendations",
    nameZh: "建议",
    description: "建议和行动项列表",
    category: "action",
    minDataPoints: 3,
    maxDataPoints: 8,
    supportsImages: false,
    supportsCharts: false,
    bestFor: ["行动建议", "下一步", "改进措施"],
    avoidFor: ["数据展示", "历史回顾"],
  },
};

// ============================================================================
// 模板选择结果
// ============================================================================

/**
 * 模板匹配结果
 */
export interface TemplateMatchResult {
  templateType: SlideTemplateTypeString;
  confidence: number;
  reasoning: string;
  contentSuggestions: string[];
  imageRequirements: ImageRequirementLocal[];
  alternativeTemplates: Array<{
    type: SlideTemplateTypeString;
    confidence: number;
    reason: string;
  }>;
}

/**
 * 根据模板类型获取默认内容结构
 */
export function getDefaultTemplateContent(
  templateType: SlideTemplateTypeString,
): Partial<SlideTemplateContent> {
  const defaults: Record<
    SlideTemplateTypeString,
    Partial<SlideTemplateContent>
  > = {
    cover: { templateType: "cover", title: "", subtitle: "" },
    toc: { templateType: "toc", title: "目录", items: [] },
    chapterTitle: { templateType: "chapterTitle", chapterNumber: 1, title: "" },
    chapterSummary: {
      templateType: "chapterSummary",
      title: "",
      keyPoints: [],
    },
    conclusion: { templateType: "conclusion", title: "结论", keyTakeaways: [] },
    timeline: {
      templateType: "timeline",
      title: "",
      events: [],
      orientation: "horizontal",
    },
    multiColumn: {
      templateType: "multiColumn",
      title: "",
      columns: [],
      columnCount: 3,
    },
    splitLayout: {
      templateType: "splitLayout",
      title: "",
      left: { type: "text" },
      right: { type: "image" },
      ratio: "50-50",
    },
    dashboard: {
      templateType: "dashboard",
      title: "",
      metrics: [],
      layout: "grid",
    },
    evolutionRoadmap: {
      templateType: "evolutionRoadmap",
      title: "",
      stages: [],
      orientation: "horizontal",
    },
    comparison: {
      templateType: "comparison",
      title: "",
      subjects: [],
      criteria: [],
      layout: "table",
    },
    caseStudy: {
      templateType: "caseStudy",
      title: "",
      company: "",
      challenge: { description: "" },
      solution: { description: "" },
      results: [],
    },
    maturityModel: {
      templateType: "maturityModel",
      title: "",
      dimensions: [],
      levels: [],
      currentAssessment: {},
    },
    riskOpportunity: {
      templateType: "riskOpportunity",
      title: "",
      risks: [],
      opportunities: [],
      layout: "split",
    },
    recommendations: {
      templateType: "recommendations",
      title: "建议",
      recommendations: [],
      layout: "numbered",
    },
  };

  return defaults[templateType];
}
