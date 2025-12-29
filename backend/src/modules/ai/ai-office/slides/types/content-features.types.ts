/**
 * Content Features Types
 *
 * Phase 1: 内容分析层类型定义
 *
 * 用于智能识别输入内容的特征，为大纲规划和模板匹配提供依据
 */

/**
 * 幻灯片内容特征
 *
 * 通过AI分析输入内容提取的结构化特征
 */
export interface SlideContentFeatures {
  // ============================================
  // 数据特征
  // ============================================

  /** 数据类型：定量、定性、混合、无 */
  dataType: "quantitative" | "qualitative" | "mixed" | "none";

  /** 数据密度：高、中、低 */
  dataDensity: "high" | "medium" | "low";

  /** 是否包含时间序列数据 */
  hasTimeSeries: boolean;

  /** 是否包含对比数据 */
  hasComparison: boolean;

  /** 对比维度数量（如"产品A vs 产品B"为2） */
  comparisonDimensions: number;

  // ============================================
  // 结构特征
  // ============================================

  /** 结构类型：层次、并列、顺序、对比、叙事 */
  structureType:
    | "hierarchical" // 层次结构（如：战略→策略→战术）
    | "parallel" // 并列结构（如：三大支柱）
    | "sequential" // 顺序结构（如：步骤1→步骤2→步骤3）
    | "contrasting" // 对比结构（如：传统 vs 创新）
    | "narrative"; // 叙事结构（如：问题→方案→结果）

  /** 核心元素数量（章节、要点等） */
  elementCount: number;

  /** 是否包含流程或步骤 */
  hasProcessFlow: boolean;

  /** 是否包含层级或阶段 */
  hasLevelsOrStages: boolean;

  // ============================================
  // 内容目的
  // ============================================

  /** 内容主要目的 */
  contentPurpose:
    | "introduce" // 介绍性内容
    | "analyze" // 分析性内容
    | "compare" // 对比性内容
    | "conclude" // 总结性内容
    | "recommend" // 建议性内容
    | "warn" // 警示性内容
    | "showcase"; // 展示性内容

  /** 论证类型 */
  argumentType:
    | "thesis" // 论点陈述
    | "evidence" // 证据支撑
    | "synthesis" // 综合分析
    | "action"; // 行动号召

  /** 情感基调 */
  emotionalTone:
    | "neutral" // 中性
    | "positive" // 积极
    | "cautionary" // 警示
    | "urgent"; // 紧急

  // ============================================
  // 视觉需求
  // ============================================

  /** 是否需要可视化 */
  needsVisualization: boolean;

  /** 可视化类型（如果需要） */
  visualizationType:
    | "chart" // 图表（柱状图、折线图、饼图等）
    | "diagram" // 流程图、结构图
    | "iconGrid" // 图标网格
    | "timeline" // 时间线
    | "matrix" // 矩阵图
    | "none";

  /** 空间分配优先级 */
  spacePriority:
    | "text" // 文字为主（简约风格）
    | "visual" // 视觉为主（图片/图表占主导）
    | "balanced"; // 平衡（文字和视觉各占50%）

  // ============================================
  // 分析元数据
  // ============================================

  /** 分析置信度 (0-100) */
  confidence: number;

  /** 内容复杂度 (1-10) */
  complexity: number;

  /** 推荐页数范围（基于内容特征） */
  recommendedSlideRange: {
    min: number;
    max: number;
    optimal: number;
  };

  /** 分析摘要 */
  summary: string;
}

/**
 * 内容分析选项
 */
export interface ContentAnalysisOptions {
  /** 语言 */
  language?: "zh" | "en" | "auto";

  /** 详细程度 */
  detailLevel?: "quick" | "standard" | "deep";

  /** 是否分析URL内容 */
  analyzeUrls?: boolean;

  /** 是否分析文件内容 */
  analyzeFiles?: boolean;
}

/**
 * 内容分析结果
 */
export interface ContentAnalysisResult {
  /** 内容特征 */
  features: SlideContentFeatures;

  /** 提取的关键实体 */
  keyEntities: {
    type: "person" | "organization" | "concept" | "statistic";
    value: string;
    context: string;
  }[];

  /** 提取的数据点 */
  dataPoints: {
    value: string;
    type: "percentage" | "currency" | "number" | "date" | "other";
    context: string;
  }[];

  /** 识别的时间范围 */
  timeRange?: {
    start?: string;
    end?: string;
    mentions: string[];
  };

  /** 识别的对比维度 */
  comparisonDimensions?: {
    dimension: string;
    items: string[];
  }[];

  /** 分析元数据 */
  metadata: {
    analyzedAt: string;
    contentLength: number;
    processingTime: number;
    modelUsed?: string;
  };
}
