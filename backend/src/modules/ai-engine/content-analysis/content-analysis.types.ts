/**
 * 内容分析类型定义 - AI Office 共享模块
 * 用于 Slides 和 Docs 的智能内容分析和模板匹配
 */

// ============================================================================
// 内容特征枚举
// ============================================================================

/**
 * 内容复杂度
 */
export enum ContentComplexity {
  LOW = "low", // 简单内容，少量要点
  MEDIUM = "medium", // 中等复杂度
  HIGH = "high", // 复杂内容，多维度分析
}

/**
 * 内容类型
 */
export enum ContentCategory {
  NARRATIVE = "narrative", // 叙事型：故事、案例、发展历程
  ANALYTICAL = "analytical", // 分析型：数据分析、趋势分析
  COMPARATIVE = "comparative", // 对比型：竞品分析、方案对比
  INSTRUCTIONAL = "instructional", // 指导型：操作指南、最佳实践
  PERSUASIVE = "persuasive", // 说服型：提案、建议
  INFORMATIONAL = "informational", // 信息型：概述、介绍
}

/**
 * 数据密度
 */
export enum DataDensity {
  TEXT_HEAVY = "text_heavy", // 文字密集
  DATA_HEAVY = "data_heavy", // 数据密集
  BALANCED = "balanced", // 均衡
  VISUAL_HEAVY = "visual_heavy", // 视觉密集
}

/**
 * 时间维度
 */
export enum TemporalDimension {
  NONE = "none", // 无时间维度
  HISTORICAL = "historical", // 历史回顾
  CURRENT = "current", // 当前状态
  FUTURE = "future", // 未来展望
  TIMELINE = "timeline", // 时间线（跨多个时期）
}

/**
 * 层级结构类型
 */
export enum HierarchyType {
  FLAT = "flat", // 扁平结构
  HIERARCHICAL = "hierarchical", // 层级结构
  MATRIX = "matrix", // 矩阵结构
  NETWORK = "network", // 网络结构
}

// ============================================================================
// 内容特征分析结果
// ============================================================================

/**
 * 内容特征向量
 */
export interface ContentFeatures {
  // 基础特征
  category: ContentCategory;
  complexity: ContentComplexity;
  dataDensity: DataDensity;
  temporalDimension: TemporalDimension;
  hierarchyType: HierarchyType;

  // 数值特征
  wordCount: number;
  paragraphCount: number;
  listCount: number;
  tableCount: number;
  imageCount: number;
  codeBlockCount: number;

  // 语义特征
  keyTopics: string[];
  entities: ExtractedEntity[];
  sentiment?: "positive" | "neutral" | "negative";

  // 结构特征
  hasTimeline: boolean;
  hasComparison: boolean;
  hasStatistics: boolean;
  hasSteps: boolean;
  hasCaseStudy: boolean;
  hasRecommendations: boolean;
  hasRiskAnalysis: boolean;

  // 数据可视化机会
  visualizationOpportunities: VisualizationOpportunity[];
}

/**
 * 提取的实体
 */
export interface ExtractedEntity {
  type:
    | "person"
    | "organization"
    | "product"
    | "technology"
    | "location"
    | "date"
    | "metric"
    | "concept";
  value: string;
  count: number;
  importance: number; // 0-1
}

/**
 * 可视化机会
 */
export interface VisualizationOpportunity {
  type:
    | "chart"
    | "timeline"
    | "comparison"
    | "matrix"
    | "flowchart"
    | "hierarchy"
    | "map";
  description: string;
  dataPoints?: string[];
  suggestedChartType?: string;
  priority: "high" | "medium" | "low";
}

// ============================================================================
// 内容分析请求/响应
// ============================================================================

/**
 * 内容分析输入
 */
export interface ContentAnalysisInput {
  content: string;
  contentType?: "markdown" | "html" | "text" | "json";
  context?: {
    title?: string;
    purpose?: string;
    targetAudience?: string;
    industry?: string;
    modelId?: string; // 指定使用的 AI 模型
  };
  options?: {
    extractEntities?: boolean;
    detectVisualizationOpportunities?: boolean;
    analyzeSentiment?: boolean;
    maxKeyTopics?: number;
  };
}

/**
 * 内容分析结果
 */
export interface ContentAnalysisResult {
  features: ContentFeatures;
  summary: string;
  suggestedStructure: SuggestedStructure;
  confidence: number; // 0-1
  processingTime: number; // ms
}

/**
 * 建议的结构
 */
export interface SuggestedStructure {
  // 适用于 Slides
  forSlides?: {
    suggestedSlideCount: number;
    suggestedTemplates: string[];
    chapterBreakdown: Array<{
      title: string;
      slideCount: number;
      templates: string[];
    }>;
  };
  // 适用于 Docs
  forDocs?: {
    suggestedWordCount: number;
    suggestedSections: Array<{
      title: string;
      type: string;
      estimatedWords: number;
    }>;
    documentStyle: "formal" | "casual" | "technical" | "executive";
  };
}

// ============================================================================
// 章节/段落分析
// ============================================================================

/**
 * 段落特征
 */
export interface ParagraphFeatures {
  id: string;
  text: string;
  category: ContentCategory;
  keyPoints: string[];
  hasData: boolean;
  hasList: boolean;
  hasQuote: boolean;
  suggestedVisualization?: VisualizationOpportunity;
}

/**
 * 章节特征
 */
export interface SectionFeatures {
  id: string;
  title: string;
  level: number;
  paragraphs: ParagraphFeatures[];
  overallCategory: ContentCategory;
  complexity: ContentComplexity;
  keyMessages: string[];
  suggestedSlideTemplates?: string[];
  suggestedDocsSectionType?: string;
}

/**
 * 完整文档分析结果
 */
export interface DocumentAnalysisResult {
  title: string;
  overview: ContentAnalysisResult;
  sections: SectionFeatures[];
  crossSectionInsights: {
    mainTheme: string;
    narrativeFlow: string[];
    keyTakeaways: string[];
  };
}

// ============================================================================
// MECE 原则验证
// ============================================================================

/**
 * MECE 验证结果
 */
export interface MECEValidation {
  isMutuallyExclusive: boolean;
  isCollectivelyExhaustive: boolean;
  overlaps: Array<{
    section1: string;
    section2: string;
    overlapDescription: string;
  }>;
  gaps: Array<{
    description: string;
    suggestedAddition: string;
  }>;
  score: number; // 0-100
  recommendations: string[];
}

// ============================================================================
// 内容分段策略
// ============================================================================

/**
 * 分段策略
 */
export interface SegmentationStrategy {
  type: "by_topic" | "by_length" | "by_structure" | "hybrid";
  targetSegmentCount?: number;
  maxWordsPerSegment?: number;
  preserveHeadings: boolean;
  groupRelatedContent: boolean;
}

/**
 * 内容段落
 */
export interface ContentSegment {
  id: string;
  order: number;
  title?: string;
  content: string;
  features: ParagraphFeatures;
  suggestedTemplate: string;
  transitionHint?: string; // 与下一段的过渡提示
}
