/**
 * 模板选择引擎类型定义 - AI Office 共享模块
 * 智能模板匹配、图文配对、阅读体验优化
 */

import {
  ContentCategory,
  ContentComplexity,
  ContentFeatures,
  DataDensity,
  TemporalDimension,
} from "./content-analysis.types";

// ============================================================================
// 模板类型定义
// ============================================================================

/**
 * Slides 页面模板类型 (15种)
 */
export enum SlideTemplateType {
  // 结构性页面
  COVER = "cover", // 封面
  TABLE_OF_CONTENTS = "toc", // 目录
  CHAPTER_TITLE = "chapterTitle", // 章节标题页
  CHAPTER_SUMMARY = "chapterSummary", // 章节摘要页
  CONCLUSION = "conclusion", // 结论页

  // 时间序列
  TIMELINE = "timeline", // 时间线

  // 多栏布局
  MULTI_COLUMN = "multiColumn", // 多栏展示
  SPLIT_LAYOUT = "splitLayout", // 分屏布局

  // 数据展示
  DASHBOARD = "dashboard", // 仪表盘

  // 演进与流程
  EVOLUTION_ROADMAP = "evolutionRoadmap", // 演进路线图

  // 比较分析
  COMPARISON = "comparison", // 对比分析

  // 案例展示
  CASE_STUDY = "caseStudy", // 案例研究

  // 评估矩阵
  MATURITY_MODEL = "maturityModel", // 成熟度模型

  // 风险机会
  RISK_OPPORTUNITY = "riskOpportunity", // 风险机会矩阵

  // 建议展示
  RECOMMENDATIONS = "recommendations", // 建议列表
}

/**
 * Docs 章节模板类型
 */
export enum DocsTemplateType {
  // 结构性章节
  EXECUTIVE_SUMMARY = "executiveSummary", // 执行摘要
  INTRODUCTION = "introduction", // 引言
  CONCLUSION = "conclusion", // 结论
  APPENDIX = "appendix", // 附录

  // 分析型章节
  ANALYSIS = "analysis", // 深度分析
  COMPARISON = "comparison", // 对比分析
  CASE_STUDY = "caseStudy", // 案例研究

  // 数据型章节
  DATA_REPORT = "dataReport", // 数据报告
  STATISTICS = "statistics", // 统计分析
  METHODOLOGY = "methodology", // 方法论

  // 策略型章节
  RECOMMENDATIONS = "recommendations", // 建议
  ACTION_PLAN = "actionPlan", // 行动计划
  RISK_ASSESSMENT = "riskAssessment", // 风险评估

  // 叙事型章节
  NARRATIVE = "narrative", // 叙事
  TIMELINE = "timeline", // 时间线
  PROCESS = "process", // 流程说明
}

// ============================================================================
// 图片匹配系统
// ============================================================================

/**
 * 图片类型
 */
export enum ImageType {
  // 信息图
  INFOGRAPHIC = "infographic", // 信息图表
  DIAGRAM = "diagram", // 流程图/架构图
  CHART = "chart", // 数据图表
  ICON = "icon", // 图标

  // 照片类
  PHOTO_BUSINESS = "photo_business", // 商务照片
  PHOTO_TECHNOLOGY = "photo_technology", // 科技照片
  PHOTO_PEOPLE = "photo_people", // 人物照片
  PHOTO_ABSTRACT = "photo_abstract", // 抽象照片

  // 插画类
  ILLUSTRATION_FLAT = "illustration_flat", // 扁平插画
  ILLUSTRATION_3D = "illustration_3d", // 3D插画
  ILLUSTRATION_ISOMETRIC = "illustration_isometric", // 等距插画

  // 装饰类
  BACKGROUND = "background", // 背景图
  PATTERN = "pattern", // 图案
  DECORATION = "decoration", // 装饰元素
}

/**
 * 图片位置
 */
export enum ImagePlacement {
  HERO = "hero", // 主图（大图）
  INLINE = "inline", // 行内图
  SIDE = "side", // 侧边图
  BACKGROUND = "background", // 背景
  ICON = "icon", // 图标位置
  THUMBNAIL = "thumbnail", // 缩略图
}

/**
 * 图文匹配规则
 */
export interface ImageMatchingRule {
  id: string;
  name: string;
  description: string;

  // 内容特征条件
  conditions: {
    contentCategory?: ContentCategory[];
    hasData?: boolean;
    hasTimeline?: boolean;
    hasComparison?: boolean;
    hasCaseStudy?: boolean;
    keywords?: string[];
  };

  // 推荐的图片类型
  recommendedImageTypes: ImageType[];

  // 推荐的图片位置
  recommendedPlacement: ImagePlacement;

  // 图片密度建议
  imageDensity: "sparse" | "balanced" | "rich";

  // 优先级
  priority: number;
}

/**
 * 图片需求
 */
export interface ImageRequirement {
  type: ImageType;
  placement: ImagePlacement;
  description: string;
  keywords: string[];
  aspectRatio?: "16:9" | "4:3" | "1:1" | "3:2" | "2:1";
  style?: string;
  mood?: "professional" | "creative" | "technical" | "warm" | "neutral";
  priority: "required" | "recommended" | "optional";
}

/**
 * 图文配对结果
 */
export interface ImageTextPairing {
  sectionId: string;
  sectionTitle: string;
  textContent: string;
  imageRequirements: ImageRequirement[];
  suggestedImageCount: number;
  textToImageRatio: string; // e.g., "70:30"
}

// ============================================================================
// 阅读体验优化
// ============================================================================

/**
 * 阅读节奏类型
 */
export enum ReadingRhythm {
  FAST = "fast", // 快节奏：要点、列表
  MODERATE = "moderate", // 适中：段落+列表
  SLOW = "slow", // 慢节奏：深度论述
  VARIED = "varied", // 变化：混合
}

/**
 * 视觉休息点类型
 */
export enum VisualBreakType {
  FULL_IMAGE = "full_image", // 全幅图片
  QUOTE = "quote", // 引用块
  CALLOUT = "callout", // 强调框
  DIVIDER = "divider", // 分隔线
  WHITE_SPACE = "white_space", // 留白
  INFOGRAPHIC = "infographic", // 信息图
}

/**
 * 阅读体验配置
 */
export interface ReadingExperienceConfig {
  // 信息密度控制
  density: {
    maxWordsPerParagraph: number;
    maxParagraphsPerSection: number;
    maxBulletsPerList: number;
    idealTextToVisualRatio: string; // e.g., "60:40"
  };

  // 阅读节奏
  rhythm: {
    type: ReadingRhythm;
    // 每N个段落插入视觉休息
    visualBreakFrequency: number;
    preferredBreakTypes: VisualBreakType[];
  };

  // 扫描友好性
  scanability: {
    useHeadings: boolean;
    useBulletPoints: boolean;
    useNumberedLists: boolean;
    useHighlights: boolean;
    usePullQuotes: boolean;
    useCallouts: boolean;
  };

  // 视觉层次
  visualHierarchy: {
    emphasizeKeyPoints: boolean;
    useColorCoding: boolean;
    useIconography: boolean;
    progressiveDisclosure: boolean;
  };
}

/**
 * 阅读体验分析结果
 */
export interface ReadingExperienceAnalysis {
  currentScore: number; // 0-100
  issues: ReadingExperienceIssue[];
  suggestions: ReadingExperienceSuggestion[];
  optimizedConfig: ReadingExperienceConfig;
}

export interface ReadingExperienceIssue {
  type:
    | "too_dense"
    | "too_sparse"
    | "monotonous"
    | "no_visual_breaks"
    | "poor_hierarchy"
    | "wall_of_text";
  severity: "critical" | "major" | "minor";
  location: string;
  description: string;
}

export interface ReadingExperienceSuggestion {
  type:
    | "add_visual"
    | "break_paragraph"
    | "add_heading"
    | "add_callout"
    | "simplify";
  location: string;
  description: string;
  expectedImprovement: number; // 预期分数提升
}

// ============================================================================
// 模板选择决策树
// ============================================================================

/**
 * 决策规则
 */
export interface DecisionRule {
  id: string;
  name: string;
  description: string;
  priority: number; // 优先级越高越先匹配

  // 条件
  conditions: DecisionCondition[];

  // 条件组合逻辑
  logic: "and" | "or";

  // 匹配的模板
  slideTemplate?: SlideTemplateType;
  docsTemplate?: DocsTemplateType;

  // 图片建议
  imageRecommendations?: ImageRequirement[];

  // 阅读体验调整
  readingAdjustments?: Partial<ReadingExperienceConfig>;

  // 置信度
  confidence: number; // 0-1
}

/**
 * 决策条件
 */
export interface DecisionCondition {
  field: keyof ContentFeatures | string;
  operator:
    | "equals"
    | "not_equals"
    | "contains"
    | "not_contains"
    | "greater_than"
    | "less_than"
    | "in"
    | "not_in"
    | "exists"
    | "not_exists";
  value: unknown;
}

/**
 * 模板选择结果
 */
export interface TemplateSelectionResult {
  // Slides 推荐
  slides?: {
    primaryTemplate: SlideTemplateType;
    alternativeTemplates: SlideTemplateType[];
    confidence: number;
    reasoning: string;
  };

  // Docs 推荐
  docs?: {
    primaryTemplate: DocsTemplateType;
    alternativeTemplates: DocsTemplateType[];
    confidence: number;
    reasoning: string;
  };

  // 图片推荐
  images: {
    requirements: ImageRequirement[];
    textToImageRatio: string;
    suggestedImageCount: number;
  };

  // 阅读体验建议
  readingExperience: {
    config: ReadingExperienceConfig;
    suggestedVisualBreaks: Array<{
      afterSection: string;
      type: VisualBreakType;
    }>;
  };

  // 匹配的规则
  matchedRules: string[];
}

// ============================================================================
// 预定义决策规则
// ============================================================================

/**
 * Slides 模板选择规则
 */
export const SLIDE_TEMPLATE_RULES: DecisionRule[] = [
  // 时间线规则
  {
    id: "timeline-rule",
    name: "时间线内容",
    description: "包含时间序列或发展历程的内容",
    priority: 90,
    conditions: [
      { field: "hasTimeline", operator: "equals", value: true },
      {
        field: "temporalDimension",
        operator: "in",
        value: ["historical", "timeline"],
      },
    ],
    logic: "or",
    slideTemplate: SlideTemplateType.TIMELINE,
    imageRecommendations: [
      {
        type: ImageType.DIAGRAM,
        placement: ImagePlacement.HERO,
        description: "时间线可视化",
        keywords: ["timeline", "history", "evolution"],
        priority: "required",
      },
    ],
    confidence: 0.95,
  },

  // 对比分析规则
  {
    id: "comparison-rule",
    name: "对比分析内容",
    description: "包含多个对象比较的内容",
    priority: 85,
    conditions: [
      { field: "hasComparison", operator: "equals", value: true },
      {
        field: "category",
        operator: "equals",
        value: ContentCategory.COMPARATIVE,
      },
    ],
    logic: "or",
    slideTemplate: SlideTemplateType.COMPARISON,
    imageRecommendations: [
      {
        type: ImageType.INFOGRAPHIC,
        placement: ImagePlacement.HERO,
        description: "对比表格或图表",
        keywords: ["comparison", "versus", "difference"],
        priority: "required",
      },
    ],
    confidence: 0.9,
  },

  // 数据仪表盘规则
  {
    id: "dashboard-rule",
    name: "数据密集内容",
    description: "包含大量数据指标的内容",
    priority: 80,
    conditions: [
      { field: "hasStatistics", operator: "equals", value: true },
      {
        field: "dataDensity",
        operator: "equals",
        value: DataDensity.DATA_HEAVY,
      },
    ],
    logic: "and",
    slideTemplate: SlideTemplateType.DASHBOARD,
    imageRecommendations: [
      {
        type: ImageType.CHART,
        placement: ImagePlacement.HERO,
        description: "数据可视化图表",
        keywords: ["metrics", "kpi", "dashboard"],
        aspectRatio: "16:9",
        priority: "required",
      },
    ],
    confidence: 0.88,
  },

  // 案例研究规则
  {
    id: "case-study-rule",
    name: "案例研究内容",
    description: "包含具体案例分析的内容",
    priority: 75,
    conditions: [{ field: "hasCaseStudy", operator: "equals", value: true }],
    logic: "and",
    slideTemplate: SlideTemplateType.CASE_STUDY,
    imageRecommendations: [
      {
        type: ImageType.PHOTO_BUSINESS,
        placement: ImagePlacement.SIDE,
        description: "案例相关照片或logo",
        keywords: ["case study", "success story"],
        priority: "recommended",
      },
    ],
    confidence: 0.85,
  },

  // 建议列表规则
  {
    id: "recommendations-rule",
    name: "建议内容",
    description: "包含建议或行动项的内容",
    priority: 70,
    conditions: [
      { field: "hasRecommendations", operator: "equals", value: true },
      {
        field: "category",
        operator: "equals",
        value: ContentCategory.PERSUASIVE,
      },
    ],
    logic: "or",
    slideTemplate: SlideTemplateType.RECOMMENDATIONS,
    imageRecommendations: [
      {
        type: ImageType.ICON,
        placement: ImagePlacement.ICON,
        description: "建议项图标",
        keywords: ["recommendation", "action", "next steps"],
        priority: "recommended",
      },
    ],
    confidence: 0.82,
  },

  // 风险分析规则
  {
    id: "risk-rule",
    name: "风险分析内容",
    description: "包含风险或机会分析的内容",
    priority: 75,
    conditions: [{ field: "hasRiskAnalysis", operator: "equals", value: true }],
    logic: "and",
    slideTemplate: SlideTemplateType.RISK_OPPORTUNITY,
    imageRecommendations: [
      {
        type: ImageType.INFOGRAPHIC,
        placement: ImagePlacement.HERO,
        description: "风险矩阵或热力图",
        keywords: ["risk", "opportunity", "matrix"],
        priority: "required",
      },
    ],
    confidence: 0.87,
  },

  // 路线图规则
  {
    id: "roadmap-rule",
    name: "路线图内容",
    description: "包含发展规划或阶段划分的内容",
    priority: 78,
    conditions: [
      { field: "hasSteps", operator: "equals", value: true },
      {
        field: "temporalDimension",
        operator: "equals",
        value: TemporalDimension.FUTURE,
      },
    ],
    logic: "and",
    slideTemplate: SlideTemplateType.EVOLUTION_ROADMAP,
    imageRecommendations: [
      {
        type: ImageType.DIAGRAM,
        placement: ImagePlacement.HERO,
        description: "路线图可视化",
        keywords: ["roadmap", "phases", "milestones"],
        priority: "required",
      },
    ],
    confidence: 0.85,
  },

  // 默认多栏规则
  {
    id: "multi-column-default",
    name: "多要点内容",
    description: "包含多个并列要点的内容",
    priority: 50,
    conditions: [
      { field: "listCount", operator: "greater_than", value: 2 },
      {
        field: "complexity",
        operator: "equals",
        value: ContentComplexity.MEDIUM,
      },
    ],
    logic: "and",
    slideTemplate: SlideTemplateType.MULTI_COLUMN,
    confidence: 0.7,
  },

  // 默认分屏布局
  {
    id: "split-layout-default",
    name: "图文结合内容",
    description: "适合左右分屏的内容",
    priority: 45,
    conditions: [
      { field: "dataDensity", operator: "equals", value: DataDensity.BALANCED },
    ],
    logic: "and",
    slideTemplate: SlideTemplateType.SPLIT_LAYOUT,
    imageRecommendations: [
      {
        type: ImageType.ILLUSTRATION_FLAT,
        placement: ImagePlacement.SIDE,
        description: "主题相关插画",
        keywords: [],
        aspectRatio: "1:1",
        priority: "recommended",
      },
    ],
    confidence: 0.65,
  },
];

/**
 * 图片匹配规则
 */
export const IMAGE_MATCHING_RULES: ImageMatchingRule[] = [
  {
    id: "data-visualization",
    name: "数据可视化",
    description: "数据密集内容需要图表",
    conditions: { hasData: true },
    recommendedImageTypes: [ImageType.CHART, ImageType.INFOGRAPHIC],
    recommendedPlacement: ImagePlacement.HERO,
    imageDensity: "balanced",
    priority: 95,
  },
  {
    id: "timeline-visual",
    name: "时间线可视化",
    description: "时间线内容需要流程图",
    conditions: { hasTimeline: true },
    recommendedImageTypes: [ImageType.DIAGRAM, ImageType.INFOGRAPHIC],
    recommendedPlacement: ImagePlacement.HERO,
    imageDensity: "balanced",
    priority: 90,
  },
  {
    id: "comparison-visual",
    name: "对比可视化",
    description: "对比内容需要对比图表",
    conditions: { hasComparison: true },
    recommendedImageTypes: [ImageType.INFOGRAPHIC, ImageType.CHART],
    recommendedPlacement: ImagePlacement.HERO,
    imageDensity: "balanced",
    priority: 88,
  },
  {
    id: "case-study-photo",
    name: "案例照片",
    description: "案例研究需要真实照片",
    conditions: { hasCaseStudy: true },
    recommendedImageTypes: [ImageType.PHOTO_BUSINESS, ImageType.PHOTO_PEOPLE],
    recommendedPlacement: ImagePlacement.SIDE,
    imageDensity: "sparse",
    priority: 75,
  },
  {
    id: "technology-content",
    name: "技术内容",
    description: "技术类内容使用科技图片",
    conditions: { keywords: ["技术", "系统", "架构", "平台", "AI", "云"] },
    recommendedImageTypes: [
      ImageType.ILLUSTRATION_ISOMETRIC,
      ImageType.PHOTO_TECHNOLOGY,
      ImageType.DIAGRAM,
    ],
    recommendedPlacement: ImagePlacement.HERO,
    imageDensity: "balanced",
    priority: 70,
  },
  {
    id: "business-content",
    name: "商务内容",
    description: "商务类内容使用商务图片",
    conditions: {
      keywords: ["市场", "战略", "增长", "客户", "业务", "销售"],
      contentCategory: [ContentCategory.PERSUASIVE, ContentCategory.ANALYTICAL],
    },
    recommendedImageTypes: [
      ImageType.PHOTO_BUSINESS,
      ImageType.ILLUSTRATION_FLAT,
    ],
    recommendedPlacement: ImagePlacement.SIDE,
    imageDensity: "sparse",
    priority: 65,
  },
  {
    id: "abstract-concept",
    name: "抽象概念",
    description: "抽象概念使用抽象图片",
    conditions: { contentCategory: [ContentCategory.INFORMATIONAL] },
    recommendedImageTypes: [
      ImageType.ILLUSTRATION_FLAT,
      ImageType.PHOTO_ABSTRACT,
    ],
    recommendedPlacement: ImagePlacement.HERO,
    imageDensity: "balanced",
    priority: 50,
  },
];

/**
 * 默认阅读体验配置
 */
export const DEFAULT_READING_EXPERIENCE: ReadingExperienceConfig = {
  density: {
    maxWordsPerParagraph: 150,
    maxParagraphsPerSection: 5,
    maxBulletsPerList: 7,
    idealTextToVisualRatio: "60:40",
  },
  rhythm: {
    type: ReadingRhythm.VARIED,
    visualBreakFrequency: 3,
    preferredBreakTypes: [
      VisualBreakType.INFOGRAPHIC,
      VisualBreakType.CALLOUT,
      VisualBreakType.QUOTE,
    ],
  },
  scanability: {
    useHeadings: true,
    useBulletPoints: true,
    useNumberedLists: true,
    useHighlights: true,
    usePullQuotes: true,
    useCallouts: true,
  },
  visualHierarchy: {
    emphasizeKeyPoints: true,
    useColorCoding: true,
    useIconography: true,
    progressiveDisclosure: false,
  },
};

/**
 * 根据内容复杂度调整阅读体验
 */
export function getReadingExperienceForComplexity(
  complexity: ContentComplexity,
): ReadingExperienceConfig {
  const base = { ...DEFAULT_READING_EXPERIENCE };

  switch (complexity) {
    case ContentComplexity.LOW:
      return {
        ...base,
        density: {
          ...base.density,
          maxWordsPerParagraph: 100,
          idealTextToVisualRatio: "50:50",
        },
        rhythm: {
          ...base.rhythm,
          type: ReadingRhythm.FAST,
          visualBreakFrequency: 2,
        },
      };

    case ContentComplexity.HIGH:
      return {
        ...base,
        density: {
          ...base.density,
          maxWordsPerParagraph: 200,
          maxParagraphsPerSection: 7,
          idealTextToVisualRatio: "70:30",
        },
        rhythm: {
          ...base.rhythm,
          type: ReadingRhythm.SLOW,
          visualBreakFrequency: 4,
        },
      };

    default:
      return base;
  }
}
