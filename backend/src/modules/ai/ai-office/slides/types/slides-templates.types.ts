/**
 * Slides Template Types
 * PPTX 渲染器所需的模板内容类型定义
 *
 * 注意：这些类型支持额外的属性以兼容渲染器的各种使用场景
 */

/**
 * 基础幻灯片内容
 */
export interface BaseSlideContent {
  templateType: string;
  title?: string;
  subtitle?: string;
  [key: string]: any; // 允许额外属性
}

/**
 * 封面幻灯片
 */
export interface CoverSlideContent extends BaseSlideContent {
  templateType: "cover";
  title: string;
  subtitle?: string;
  author?: string;
  date?: string;
  logo?: string;
  backgroundImage?: string;
  organization?: string;
  tagline?: string;
}

/**
 * 目录项
 */
export interface TocItem {
  number: number;
  title: string;
  description?: string;
  subtitle?: string;
  isActive?: boolean;
  [key: string]: any;
}

/**
 * 目录幻灯片
 */
export interface TocSlideContent extends BaseSlideContent {
  templateType: "toc";
  title: string;
  items: TocItem[];
}

/**
 * 章节标题幻灯片
 */
export interface ChapterTitleSlideContent extends BaseSlideContent {
  templateType: "chapterTitle";
  chapterNumber: number;
  title: string;
  subtitle?: string;
  description?: string;
}

/**
 * 关键点项
 */
export interface KeyPointItem {
  title?: string;
  text?: string;
  description?: string;
  icon?: string;
  highlight?: boolean;
  emphasis?: boolean;
  [key: string]: any;
}

/**
 * 章节摘要幻灯片
 */
export interface ChapterSummarySlideContent extends BaseSlideContent {
  templateType: "chapterSummary";
  title: string;
  keyPoints: any[];
  takeaways?: any[];
  summary?: string;
}

/**
 * 结论幻灯片
 */
export interface ConclusionSlideContent extends BaseSlideContent {
  templateType: "conclusion";
  title: string;
  summary: string;
  keyTakeaways: any[];
  callToAction?: string;
  closingMessage?: string;
  contactInfo?: {
    name?: string;
    email?: string;
    phone?: string;
    [key: string]: any;
  };
}

/**
 * 时间线事件
 */
export interface TimelineEvent {
  date: string;
  title: string;
  description?: string;
  icon?: string;
  status?: string;
  highlight?: boolean;
  [key: string]: any;
}

/**
 * 时间线幻灯片
 */
export interface TimelineSlideContent extends BaseSlideContent {
  templateType: "timeline";
  title: string;
  events: TimelineEvent[];
  orientation?: "horizontal" | "vertical";
}

/**
 * 列内容
 */
export interface ColumnContent {
  title: string;
  content: any;
  icon?: string;
  highlight?: boolean;
  items?: any[];
  [key: string]: any;
}

/**
 * 多列布局幻灯片
 */
export interface MultiColumnSlideContent extends BaseSlideContent {
  templateType: "multiColumn";
  title: string;
  columns: ColumnContent[];
  columnCount?: number;
}

/**
 * 分割内容
 */
export interface SplitContent {
  title?: string;
  content: any;
  image?: string;
  [key: string]: any;
}

/**
 * 分割布局幻灯片
 */
export interface SplitLayoutSlideContent extends BaseSlideContent {
  templateType: "splitLayout";
  title: string;
  leftContent?: SplitContent;
  rightContent?: SplitContent;
  left?: SplitContent;
  right?: SplitContent;
  ratio?: string;
  dividerStyle?: string;
}

/**
 * 仪表盘幻灯片
 */
export interface DashboardSlideContent extends BaseSlideContent {
  templateType: "dashboard";
  title: string;
  metrics: any[];
  charts?: any[];
}

/**
 * 演进阶段
 */
export interface EvolutionStage {
  name: string;
  title?: string;
  phase?: string;
  timeframe?: string;
  description?: string;
  milestones?: string[];
  status?: string;
  [key: string]: any;
}

/**
 * 演进路线图幻灯片
 */
export interface EvolutionRoadmapSlideContent extends BaseSlideContent {
  templateType: "evolutionRoadmap";
  title: string;
  stages: EvolutionStage[];
  currentStage?: number;
}

/**
 * 对比选项
 */
export interface ComparisonOption {
  title: string;
  points: any[];
  pros?: any[];
  cons?: any[];
  [key: string]: any;
}

/**
 * 对比幻灯片
 */
export interface ComparisonSlideContent extends BaseSlideContent {
  templateType: "comparison";
  title: string;
  leftOption: ComparisonOption;
  rightOption: ComparisonOption;
  verdict?: string;
}

/**
 * 案例研究幻灯片
 */
export interface CaseStudySlideContent extends BaseSlideContent {
  templateType: "caseStudy";
  title: string;
  company?: string;
  challenge: string;
  solution: string;
  results: any[];
  quote?: {
    text: string;
    author: string;
    role?: string;
    [key: string]: any;
  };
}

/**
 * 成熟度模型幻灯片
 */
export interface MaturityModelSlideContent extends BaseSlideContent {
  templateType: "maturityModel";
  title: string;
  levels: any[];
  currentAssessment?: {
    level: number;
    notes?: string;
    [key: string]: any;
  };
}

/**
 * 风险与机会幻灯片
 */
export interface RiskOpportunitySlideContent extends BaseSlideContent {
  templateType: "riskOpportunity";
  title: string;
  risks: any[];
  opportunities: any[];
}

/**
 * 建议幻灯片
 */
export interface RecommendationsSlideContent extends BaseSlideContent {
  templateType: "recommendations";
  title: string;
  recommendations: any[];
  nextSteps?: any[];
}

/**
 * 所有幻灯片内容类型的联合类型
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

/**
 * 模板类型枚举
 */
export type SlideTemplateType = SlideTemplateContent["templateType"];
