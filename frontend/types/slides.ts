/**
 * AI Slides - 前端类型定义
 * 从后端类型重新导出供前端使用
 */

// ============================================================================
// 15种页面模板类型
// ============================================================================

export type SlideTemplateTypeString =
  | 'cover'
  | 'toc'
  | 'chapterTitle'
  | 'chapterSummary'
  | 'conclusion'
  | 'timeline'
  | 'multiColumn'
  | 'splitLayout'
  | 'dashboard'
  | 'evolutionRoadmap'
  | 'comparison'
  | 'caseStudy'
  | 'maturityModel'
  | 'riskOpportunity'
  | 'recommendations';

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
  templateType: 'cover';
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
  templateType: 'toc';
  title: string;
  items: Array<{
    number: number;
    title: string;
    subtitle?: string;
    isActive?: boolean;
  }>;
  style?: 'numbered' | 'icons' | 'cards';
}

/**
 * 章节标题页内容
 */
export interface ChapterTitleSlideContent {
  templateType: 'chapterTitle';
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
  templateType: 'chapterSummary';
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
  templateType: 'conclusion';
  title: string;
  keyTakeaways: Array<{
    icon?: string;
    text: string;
    emphasis?: 'high' | 'medium' | 'low';
  }>;
  callToAction?: string;
  nextSteps?: string[];
  closingMessage?: string;
}

/**
 * 时间线页内容
 */
export interface TimelineSlideContent {
  templateType: 'timeline';
  title: string;
  description?: string;
  events: Array<{
    id: string;
    date: string;
    title: string;
    description?: string;
    icon?: string;
    status: 'past' | 'current' | 'future';
    highlight?: boolean;
    color?: string;
    /** 🆕 事件配图 URL */
    imageUrl?: string;
  }>;
  orientation: 'horizontal' | 'vertical';
  showConnectors?: boolean;
}

/**
 * 多栏页内容
 */
export interface MultiColumnSlideContent {
  templateType: 'multiColumn';
  title: string;
  subtitle?: string;
  columns: Array<{
    icon?: string;
    title: string;
    content: string;
    items?: string[];
    highlight?: boolean;
    color?: string;
    /** 🆕 语义块配图 URL */
    imageUrl?: string;
    /** 🆕 图片位置 */
    imagePosition?: 'top' | 'bottom' | 'background';
  }>;
  columnCount: 2 | 3 | 4;
  layout?: 'equal' | 'weighted';
}

/**
 * 分屏布局页内容
 */
export interface SplitLayoutSlideContent {
  templateType: 'splitLayout';
  title: string;
  left: SplitSectionContent;
  right: SplitSectionContent;
  ratio: '50-50' | '60-40' | '40-60' | '70-30' | '30-70';
  dividerStyle?: 'line' | 'gradient' | 'none';
}

export interface SplitSectionContent {
  type: 'text' | 'image' | 'chart' | 'list' | 'quote' | 'stats';
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
    trend?: 'up' | 'down' | 'stable';
  }>;
  chartType?: 'bar' | 'line' | 'pie' | 'donut';
  chartData?: Array<{ label: string; value: number; color?: string }>;
}

/**
 * 仪表盘页内容
 */
export interface DashboardSlideContent {
  templateType: 'dashboard';
  title: string;
  subtitle?: string;
  metrics: Array<{
    id: string;
    label: string;
    value: string | number;
    unit?: string;
    trend?: 'up' | 'down' | 'stable';
    trendValue?: string;
    icon?: string;
    color?: string;
    size?: 'small' | 'medium' | 'large';
  }>;
  charts?: Array<{
    type: 'bar' | 'line' | 'pie' | 'donut' | 'area' | 'sparkline';
    title?: string;
    data: Array<{ label: string; value: number; color?: string }>;
    position:
      | 'top-left'
      | 'top-right'
      | 'bottom-left'
      | 'bottom-right'
      | 'center';
    size?: 'small' | 'medium' | 'large';
  }>;
  layout: 'grid' | 'flow' | 'bento';
  summary?: string;
}

/**
 * 演进路线图页内容
 */
export interface EvolutionRoadmapSlideContent {
  templateType: 'evolutionRoadmap';
  title: string;
  description?: string;
  stages: Array<{
    id: string;
    phase: string;
    title: string;
    description: string;
    timeframe?: string;
    status: 'completed' | 'in_progress' | 'planned' | 'future';
    milestones?: string[];
    deliverables?: string[];
    color?: string;
    icon?: string;
    /** 🆕 阶段配图 URL */
    imageUrl?: string;
  }>;
  currentStage?: number;
  showProgress?: boolean;
  orientation: 'horizontal' | 'vertical';
}

/**
 * 对比分析页内容
 */
export interface ComparisonSlideContent {
  templateType: 'comparison';
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
  layout: 'table' | 'cards' | 'side-by-side';
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
  templateType: 'caseStudy';
  title: string;
  company: string;
  industry?: string;
  logo?: string;
  heroImage?: string;
  challenge: {
    title?: string;
    description: string;
    painPoints?: string[];
    /** 🆕 挑战配图 URL */
    imageUrl?: string;
  };
  solution: {
    title?: string;
    description: string;
    highlights?: string[];
    /** 🆕 解决方案配图 URL */
    imageUrl?: string;
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
  templateType: 'maturityModel';
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
  templateType: 'riskOpportunity';
  title: string;
  description?: string;
  risks: Array<{
    id: string;
    title: string;
    description: string;
    probability: 'high' | 'medium' | 'low';
    impact: 'high' | 'medium' | 'low';
    category?: string;
    mitigation?: string;
    owner?: string;
    icon?: string;
    /** 🆕 风险配图 URL */
    imageUrl?: string;
  }>;
  opportunities: Array<{
    id: string;
    title: string;
    description: string;
    potential: 'high' | 'medium' | 'low';
    feasibility: 'high' | 'medium' | 'low';
    category?: string;
    action?: string;
    owner?: string;
    icon?: string;
    /** 🆕 机会配图 URL */
    imageUrl?: string;
  }>;
  showMatrix?: boolean;
  showMitigations?: boolean;
  layout: 'split' | 'matrix' | 'list';
}

/**
 * 建议列表页内容
 */
export interface RecommendationsSlideContent {
  templateType: 'recommendations';
  title: string;
  subtitle?: string;
  summary?: string;
  recommendations: Array<{
    id: string;
    number?: number;
    title: string;
    description: string;
    priority: 'critical' | 'high' | 'medium' | 'low';
    category?: string;
    timeframe?: 'immediate' | 'short_term' | 'medium_term' | 'long_term';
    effort?: 'low' | 'medium' | 'high';
    impact?: 'low' | 'medium' | 'high';
    owner?: string;
    icon?: string;
    dependencies?: string[];
    /** 🆕 建议配图 URL */
    imageUrl?: string;
  }>;
  showPriorityLegend?: boolean;
  showTimeline?: boolean;
  layout: 'numbered' | 'cards' | 'timeline';
  callToAction?: string;
}
