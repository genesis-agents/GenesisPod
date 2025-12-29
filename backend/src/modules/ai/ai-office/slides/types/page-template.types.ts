/**
 * Slide Page Template Types - 15种专业页面模板
 *
 * 基于 Genspark 7+2 金字塔结构的完整模板类型定义
 * 与 slides-templates.types.ts 配合使用
 */

import {
  SlideTemplateTypeString,
  CoverSlideContent,
  TocSlideContent,
  ChapterTitleSlideContent,
  ChapterSummarySlideContent,
  ConclusionSlideContent,
  TimelineSlideContent,
  MultiColumnSlideContent,
  SplitLayoutSlideContent,
  DashboardSlideContent,
  EvolutionRoadmapSlideContent,
  ComparisonSlideContent,
  CaseStudySlideContent,
  MaturityModelSlideContent,
  RiskOpportunitySlideContent,
  RecommendationsSlideContent,
} from "./slides-templates.types";

// ============================================================================
// 模板类型映射
// ============================================================================

/**
 * 15种页面模板类型
 */
export type SlidePageTemplate =
  // 结构性 (5种)
  | "cover" // 封面页
  | "toc" // 目录页
  | "chapterTitle" // 章节标题页
  | "chapterSummary" // 章节小结页
  | "conclusion" // 结语页
  // 内容型 (10种)
  | "timeline" // 时间线页
  | "multiColumn" // 多栏并列页 (2-5栏)
  | "splitLayout" // 左右分栏页
  | "dashboard" // 数据仪表盘页
  | "evolutionRoadmap" // 演进路线图页
  | "comparison" // 对比分析页
  | "caseStudy" // 案例展示页
  | "maturityModel" // 成熟度模型页
  | "riskOpportunity" // 风险/机遇对比页
  | "recommendations"; // 建议行动页

/**
 * 确保 SlidePageTemplate 与 SlideTemplateTypeString 一致
 * 编译时类型断言 - 如果两个类型不兼容，编译会失败
 */
export type AssertTemplateCompatibility =
  SlidePageTemplate extends SlideTemplateTypeString
    ? SlideTemplateTypeString extends SlidePageTemplate
      ? true
      : never
    : never;

// ============================================================================
// 模板配置接口
// ============================================================================

/**
 * 封面页配置
 */
export interface CoverPageConfig extends CoverSlideContent {
  templateType: "cover";
  // 视觉风格
  visualStyle?: "minimal" | "bold" | "elegant" | "corporate" | "creative";
  // 色调
  colorTone?: "vibrant" | "muted" | "professional" | "warm" | "cool";
}

/**
 * 目录页配置
 */
export interface TocPageConfig extends TocSlideContent {
  templateType: "toc";
  // 显示样式
  displayStyle?: "numbered" | "icons" | "cards" | "timeline";
  // 是否显示进度
  showProgress?: boolean;
  // 当前章节高亮
  highlightedChapter?: number;
}

/**
 * 章节标题页配置
 */
export interface ChapterTitlePageConfig extends ChapterTitleSlideContent {
  templateType: "chapterTitle";
  // 过渡动画风格
  transitionStyle?: "fade" | "slide" | "zoom" | "none";
  // 是否显示章节编号
  showChapterNumber?: boolean;
}

/**
 * 章节摘要页配置
 */
export interface ChapterSummaryPageConfig extends ChapterSummarySlideContent {
  templateType: "chapterSummary";
  // 要点布局
  keyPointsLayout?: "list" | "grid" | "timeline";
  // 是否显示图标
  showIcons?: boolean;
}

/**
 * 结论页配置
 */
export interface ConclusionPageConfig extends ConclusionSlideContent {
  templateType: "conclusion";
  // 是否显示行动号召
  showCTA?: boolean;
  // 结束风格
  closingStyle?: "summary" | "call-to-action" | "thank-you";
}

/**
 * 时间线页配置
 */
export interface TimelinePageConfig extends TimelineSlideContent {
  templateType: "timeline";
  // 事件数量
  eventCount?: number;
  // 时间跨度
  timeSpan?: string;
  // 是否显示连接线
  showConnectors?: boolean;
  // 是否显示日期
  showDates?: boolean;
}

/**
 * 多栏页配置
 */
export interface MultiColumnPageConfig extends MultiColumnSlideContent {
  templateType: "multiColumn";
  // 栏间距
  columnGap?: "small" | "medium" | "large";
  // 是否显示分隔线
  showDividers?: boolean;
  // 对齐方式
  alignment?: "top" | "center" | "stretch";
}

/**
 * 分屏页配置
 */
export interface SplitLayoutPageConfig extends SplitLayoutSlideContent {
  templateType: "splitLayout";
  // 是否显示分隔线
  showDivider?: boolean;
  // 对齐方式
  verticalAlign?: "top" | "center" | "bottom";
}

/**
 * 仪表盘页配置
 */
export interface DashboardPageConfig extends DashboardSlideContent {
  templateType: "dashboard";
  // 指标突出显示
  highlightMetrics?: string[]; // metric IDs
  // 是否显示趋势
  showTrends?: boolean;
  // 是否显示图表
  includeCharts?: boolean;
}

/**
 * 演进路线图页配置
 */
export interface EvolutionRoadmapPageConfig
  extends EvolutionRoadmapSlideContent {
  templateType: "evolutionRoadmap";
  // 是否显示当前阶段
  highlightCurrent?: boolean;
  // 是否显示时间框架
  showTimeframes?: boolean;
  // 是否显示里程碑
  showMilestones?: boolean;
}

/**
 * 对比分析页配置
 */
export interface ComparisonPageConfig extends ComparisonSlideContent {
  templateType: "comparison";
  // 是否显示评分
  showRatings?: boolean;
  // 是否高亮胜者
  highlightWinner?: boolean;
  // 对比维度
  comparisonDimensions?: string[];
}

/**
 * 案例展示页配置
 */
export interface CaseStudyPageConfig extends CaseStudySlideContent {
  templateType: "caseStudy";
  // 是否显示客户标志
  showLogo?: boolean;
  // 是否显示推荐语
  showTestimonial?: boolean;
  // 强调重点
  emphasis?: "challenge" | "solution" | "results";
}

/**
 * 成熟度模型页配置
 */
export interface MaturityModelPageConfig extends MaturityModelSlideContent {
  templateType: "maturityModel";
  // 显示类型
  displayType?: "radar" | "bars" | "matrix";
  // 是否显示目标状态
  showTargetState?: boolean;
  // 是否显示改进建议
  showRecommendations?: boolean;
}

/**
 * 风险机会矩阵页配置
 */
export interface RiskOpportunityPageConfig extends RiskOpportunitySlideContent {
  templateType: "riskOpportunity";
  // 矩阵显示方式
  matrixStyle?: "2x2" | "3x3" | "list";
  // 是否显示缓解措施
  showMitigations?: boolean;
  // 是否显示负责人
  showOwners?: boolean;
}

/**
 * 建议行动页配置
 */
export interface RecommendationsPageConfig extends RecommendationsSlideContent {
  templateType: "recommendations";
  // 优先级显示
  showPriority?: boolean;
  // 是否显示时间框架
  showTimeframe?: boolean;
  // 是否显示影响评估
  showImpact?: boolean;
  // 分组方式
  groupBy?: "priority" | "category" | "timeframe" | "none";
}

// ============================================================================
// 模板配置联合类型
// ============================================================================

/**
 * 所有模板配置的联合类型
 */
export type PageTemplateConfig =
  | CoverPageConfig
  | TocPageConfig
  | ChapterTitlePageConfig
  | ChapterSummaryPageConfig
  | ConclusionPageConfig
  | TimelinePageConfig
  | MultiColumnPageConfig
  | SplitLayoutPageConfig
  | DashboardPageConfig
  | EvolutionRoadmapPageConfig
  | ComparisonPageConfig
  | CaseStudyPageConfig
  | MaturityModelPageConfig
  | RiskOpportunityPageConfig
  | RecommendationsPageConfig;

// ============================================================================
// 模板元数据
// ============================================================================

/**
 * 模板元数据
 */
export interface TemplateMetadata {
  type: SlidePageTemplate;
  name: string;
  nameZh: string;
  category: "structural" | "content";
  subcategory?:
    | "timeline"
    | "layout"
    | "data"
    | "analysis"
    | "action"
    | "navigation";
  description: string;
  // 适用场景
  useCases: string[];
  // 不适用场景
  antiPatterns: string[];
  // 推荐数据点数量范围
  dataPointRange?: {
    min: number;
    max: number;
  };
  // 是否支持图片
  supportsImages: boolean;
  // 是否支持图表
  supportsCharts: boolean;
  // 复杂度
  complexity: "low" | "medium" | "high";
}

/**
 * 模板元数据字典
 */
export const TEMPLATE_METADATA: Record<SlidePageTemplate, TemplateMetadata> = {
  cover: {
    type: "cover",
    name: "Cover",
    nameZh: "封面",
    category: "structural",
    subcategory: "navigation",
    description: "报告封面页，展示标题、副标题和作者信息",
    useCases: ["报告开篇", "主题介绍", "品牌展示"],
    antiPatterns: ["中间内容页", "数据展示"],
    supportsImages: true,
    supportsCharts: false,
    complexity: "low",
  },
  toc: {
    type: "toc",
    name: "Table of Contents",
    nameZh: "目录",
    category: "structural",
    subcategory: "navigation",
    description: "目录导航页，展示报告结构和章节",
    useCases: ["报告导航", "结构概览", "章节预览"],
    antiPatterns: ["详细内容展示", "数据分析"],
    dataPointRange: { min: 3, max: 8 },
    supportsImages: false,
    supportsCharts: false,
    complexity: "low",
  },
  chapterTitle: {
    type: "chapterTitle",
    name: "Chapter Title",
    nameZh: "章节标题",
    category: "structural",
    subcategory: "navigation",
    description: "章节标题页，用于章节过渡",
    useCases: ["章节开始", "主题切换", "视觉休息"],
    antiPatterns: ["详细论述", "数据展示"],
    supportsImages: true,
    supportsCharts: false,
    complexity: "low",
  },
  chapterSummary: {
    type: "chapterSummary",
    name: "Chapter Summary",
    nameZh: "章节摘要",
    category: "structural",
    subcategory: "navigation",
    description: "章节要点总结页",
    useCases: ["章节总结", "要点回顾", "过渡承接"],
    antiPatterns: ["详细数据", "新内容引入"],
    dataPointRange: { min: 3, max: 6 },
    supportsImages: false,
    supportsCharts: false,
    complexity: "medium",
  },
  conclusion: {
    type: "conclusion",
    name: "Conclusion",
    nameZh: "结论",
    category: "structural",
    subcategory: "navigation",
    description: "结论页，总结关键发现和行动号召",
    useCases: ["报告总结", "关键发现", "行动号召"],
    antiPatterns: ["新内容引入", "详细数据"],
    dataPointRange: { min: 3, max: 5 },
    supportsImages: false,
    supportsCharts: false,
    complexity: "medium",
  },
  timeline: {
    type: "timeline",
    name: "Timeline",
    nameZh: "时间线",
    category: "content",
    subcategory: "timeline",
    description: "时间线展示，适合发展历程和规划",
    useCases: ["历史发展", "项目规划", "里程碑展示", "演进过程"],
    antiPatterns: ["非时间序列数据", "并列对比"],
    dataPointRange: { min: 3, max: 8 },
    supportsImages: true,
    supportsCharts: false,
    complexity: "medium",
  },
  multiColumn: {
    type: "multiColumn",
    name: "Multi Column",
    nameZh: "多栏布局",
    category: "content",
    subcategory: "layout",
    description: "多栏并列展示，适合并列要点",
    useCases: ["并列概念", "多维度展示", "分类说明", "要点列举"],
    antiPatterns: ["时间序列", "层级关系", "复杂数据"],
    dataPointRange: { min: 2, max: 4 },
    supportsImages: true,
    supportsCharts: false,
    complexity: "low",
  },
  splitLayout: {
    type: "splitLayout",
    name: "Split Layout",
    nameZh: "分屏布局",
    category: "content",
    subcategory: "layout",
    description: "左右分屏，图文结合",
    useCases: ["图文配合", "对照展示", "概念说明"],
    antiPatterns: ["纯数据", "多项并列"],
    supportsImages: true,
    supportsCharts: true,
    complexity: "medium",
  },
  dashboard: {
    type: "dashboard",
    name: "Dashboard",
    nameZh: "仪表盘",
    category: "content",
    subcategory: "data",
    description: "数据仪表盘，展示关键指标",
    useCases: ["KPI展示", "数据概览", "业务监控", "绩效展示"],
    antiPatterns: ["叙事内容", "详细分析", "非数据内容"],
    dataPointRange: { min: 4, max: 12 },
    supportsImages: false,
    supportsCharts: true,
    complexity: "high",
  },
  evolutionRoadmap: {
    type: "evolutionRoadmap",
    name: "Evolution Roadmap",
    nameZh: "演进路线图",
    category: "content",
    subcategory: "timeline",
    description: "阶段性发展规划展示",
    useCases: ["战略规划", "产品路线", "阶段目标", "发展规划"],
    antiPatterns: ["历史回顾", "单一事件", "非阶段性内容"],
    dataPointRange: { min: 3, max: 6 },
    supportsImages: true,
    supportsCharts: false,
    complexity: "high",
  },
  comparison: {
    type: "comparison",
    name: "Comparison",
    nameZh: "对比分析",
    category: "content",
    subcategory: "analysis",
    description: "多维度对比展示",
    useCases: ["竞品分析", "方案对比", "优劣分析", "选择决策"],
    antiPatterns: ["单一主题", "时间序列"],
    dataPointRange: { min: 2, max: 5 },
    supportsImages: true,
    supportsCharts: true,
    complexity: "high",
  },
  caseStudy: {
    type: "caseStudy",
    name: "Case Study",
    nameZh: "案例研究",
    category: "content",
    subcategory: "analysis",
    description: "案例展示，包含问题、解决方案、结果",
    useCases: ["成功案例", "客户故事", "最佳实践", "经验分享"],
    antiPatterns: ["理论概念", "纯数据", "通用说明"],
    supportsImages: true,
    supportsCharts: true,
    complexity: "high",
  },
  maturityModel: {
    type: "maturityModel",
    name: "Maturity Model",
    nameZh: "成熟度模型",
    category: "content",
    subcategory: "analysis",
    description: "能力成熟度评估展示",
    useCases: ["能力评估", "差距分析", "发展阶段", "评估诊断"],
    antiPatterns: ["时间序列", "简单对比", "单一指标"],
    dataPointRange: { min: 3, max: 7 },
    supportsImages: false,
    supportsCharts: true,
    complexity: "high",
  },
  riskOpportunity: {
    type: "riskOpportunity",
    name: "Risk & Opportunity",
    nameZh: "风险机会",
    category: "content",
    subcategory: "analysis",
    description: "风险和机会矩阵展示",
    useCases: ["风险评估", "机会识别", "SWOT分析", "战略决策"],
    antiPatterns: ["单向分析", "时间序列", "纯数据展示"],
    supportsImages: false,
    supportsCharts: true,
    complexity: "high",
  },
  recommendations: {
    type: "recommendations",
    name: "Recommendations",
    nameZh: "建议",
    category: "content",
    subcategory: "action",
    description: "建议和行动项列表",
    useCases: ["行动建议", "下一步", "改进措施", "实施计划"],
    antiPatterns: ["数据展示", "历史回顾", "理论说明"],
    dataPointRange: { min: 3, max: 8 },
    supportsImages: false,
    supportsCharts: false,
    complexity: "medium",
  },
};

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 获取模板元数据
 */
export function getTemplateMetadata(
  template: SlidePageTemplate,
): TemplateMetadata {
  return TEMPLATE_METADATA[template];
}

/**
 * 获取某个类别的所有模板
 */
export function getTemplatesByCategory(
  category: "structural" | "content",
): SlidePageTemplate[] {
  return Object.entries(TEMPLATE_METADATA)
    .filter(([, meta]) => meta.category === category)
    .map(([type]) => type as SlidePageTemplate);
}

/**
 * 获取某个子类别的所有模板
 */
export function getTemplatesBySubcategory(
  subcategory:
    | "timeline"
    | "layout"
    | "data"
    | "analysis"
    | "action"
    | "navigation",
): SlidePageTemplate[] {
  return Object.entries(TEMPLATE_METADATA)
    .filter(([, meta]) => meta.subcategory === subcategory)
    .map(([type]) => type as SlidePageTemplate);
}

/**
 * 检查模板是否支持图片
 */
export function templateSupportsImages(template: SlidePageTemplate): boolean {
  return TEMPLATE_METADATA[template].supportsImages;
}

/**
 * 检查模板是否支持图表
 */
export function templateSupportsCharts(template: SlidePageTemplate): boolean {
  return TEMPLATE_METADATA[template].supportsCharts;
}
