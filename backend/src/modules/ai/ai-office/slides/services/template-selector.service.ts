/**
 * Template Selector Service - 智能模板选择引擎
 *
 * 完整实现设计文档规范的决策树逻辑
 *
 * 职责：
 * 1. 根据内容特征选择最佳页面模板（15种模板）
 * 2. 实现5个规则集的决策逻辑
 * 3. 上下文感知的模板选择（避免重复、保持多样性）
 * 4. 动态参数调整
 * 5. PageTemplate → SlideLayoutType 映射
 */

import { Injectable, Logger } from "@nestjs/common";
import {
  SlideSpec,
  PPTOutline,
  SlideOutlineItem,
  SlideLayoutType,
  SlidePurpose,
} from "../types/slides.types";
import { SlidePageTemplate } from "../types/page-template.types";
import { SlideContentFeatures } from "../types/content-features.types";

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 模板选择结果
 */
export interface TemplateSelection {
  /** 选择的页面模板 */
  template: SlidePageTemplate;
  /** 对应的布局类型 */
  layoutType: SlideLayoutType;
  /** 选择理由 */
  reasoning: string;
  /** 置信度 (0-1) */
  confidence: number;
  /** 布局参数 */
  params: LayoutParams;
  /** 备选模板 */
  alternative?: SlidePageTemplate;
}

/**
 * 布局参数
 */
export interface LayoutParams {
  /** 栏数（针对 multiColumn） */
  columnCount?: number;
  /** 左右比例（针对 splitLayout） */
  ratio?: string;
  /** KPI 卡片数量（针对 dashboard） */
  kpiCount?: number;
  /** 图表布局（针对 dashboard） */
  chartLayout?: "fullWidth" | "sideBySide" | "grid";
  /** 时间轴方向（针对 timeline） */
  axis?: "horizontal" | "vertical";
  /** 内容密度 */
  contentDensity: "low" | "medium" | "high";
  /** 视觉权重 (0-100) */
  visualWeight: number;
  /** 是否显示图标 */
  showIcons?: boolean;
  /** 是否显示分隔线 */
  showDividers?: boolean;
}

/**
 * 选择上下文
 */
export interface SelectionContext {
  /** 前面的页面 */
  previousPages: { template: SlidePageTemplate; chapter?: string }[];
  /** 章节上下文 */
  chapterContext?: {
    chapterIndex: number;
    totalPagesInChapter: number;
    currentPositionInChapter: number;
  };
  /** 报告类型 */
  reportType?: "quick" | "standard" | "deep";
  /** 总页数 */
  totalSlides: number;
  /** 当前索引 */
  currentIndex: number;
}

/**
 * 模板配置（向后兼容）
 */
export interface TemplateConfig {
  index: number;
  layoutType: SlideLayoutType;
  reason: string;
  slideSpec: SlideSpec;
  parameters: {
    contentDensity: "low" | "medium" | "high";
    visualWeight: number;
    needsAnimation: boolean;
    priority: "hero" | "normal" | "support";
  };
}

// ============================================================================
// 映射表
// ============================================================================

/**
 * PageTemplate → SlideLayoutType 映射
 */
const PAGE_TEMPLATE_TO_LAYOUT: Record<SlidePageTemplate, SlideLayoutType> = {
  // 结构性模板
  cover: "title_center",
  toc: "numbered_list",
  chapterTitle: "title_subtitle",
  chapterSummary: "bullet_points",
  conclusion: "title_center",
  // 内容型模板
  timeline: "timeline_horizontal",
  multiColumn: "cards_grid",
  splitLayout: "text_image_right",
  dashboard: "statistics_cards",
  evolutionRoadmap: "timeline_vertical",
  comparison: "comparison_split",
  caseStudy: "cards_grid",
  maturityModel: "chart_with_text",
  riskOpportunity: "two_columns",
  recommendations: "numbered_list",
};

/**
 * 备选模板映射
 */
const ALTERNATIVE_TEMPLATES: Record<SlidePageTemplate, SlidePageTemplate[]> = {
  timeline: ["evolutionRoadmap", "splitLayout"],
  multiColumn: ["splitLayout", "caseStudy"],
  splitLayout: ["multiColumn", "dashboard"],
  dashboard: ["splitLayout", "comparison"],
  comparison: ["multiColumn", "caseStudy"],
  caseStudy: ["multiColumn", "splitLayout"],
  maturityModel: ["evolutionRoadmap", "splitLayout"],
  riskOpportunity: ["comparison", "splitLayout"],
  recommendations: ["multiColumn", "splitLayout"],
  evolutionRoadmap: ["timeline", "splitLayout"],
  // 结构性模板的备选
  cover: ["chapterTitle", "splitLayout"],
  toc: ["multiColumn", "splitLayout"],
  chapterTitle: ["cover", "splitLayout"],
  chapterSummary: ["multiColumn", "recommendations"],
  conclusion: ["recommendations", "splitLayout"],
};

/**
 * SlidePurpose → SlidePageTemplate 映射（固定模板）
 */
const PURPOSE_TO_FIXED_TEMPLATE: Partial<
  Record<SlidePurpose, SlidePageTemplate>
> = {
  title: "cover",
  closing: "conclusion",
  qna: "conclusion",
  agenda: "toc",
  section_header: "chapterTitle",
};

// ============================================================================
// 服务实现
// ============================================================================

@Injectable()
export class TemplateSelectorService {
  private readonly logger = new Logger(TemplateSelectorService.name);

  /**
   * 为整个大纲选择模板
   */
  async selectForOutline(
    outline: PPTOutline,
    features: SlideContentFeatures,
  ): Promise<TemplateConfig[]> {
    const startTime = Date.now();
    this.logger.log(
      `[selectForOutline] Selecting templates for ${outline.slides.length} slides`,
    );

    const configs: TemplateConfig[] = [];
    const previousPages: { template: SlidePageTemplate; chapter?: string }[] =
      [];

    for (let i = 0; i < outline.slides.length; i++) {
      const outlineItem = outline.slides[i];

      // 创建选择上下文
      const context: SelectionContext = {
        previousPages: [...previousPages],
        totalSlides: outline.slides.length,
        currentIndex: i,
      };

      // 选择模板
      const selection = this.selectTemplate(outlineItem, features, context);

      // 构建配置
      const config = this.buildTemplateConfig(outlineItem, selection);
      configs.push(config);

      // 更新历史
      previousPages.push({ template: selection.template });
      if (previousPages.length > 5) {
        previousPages.shift();
      }
    }

    const elapsed = Date.now() - startTime;
    this.logger.log(`[selectForOutline] Selected templates in ${elapsed}ms`);

    return configs;
  }

  /**
   * 为单页选择模板（主入口）
   */
  selectTemplate(
    outlineItem: SlideOutlineItem,
    features: SlideContentFeatures,
    context?: SelectionContext,
  ): TemplateSelection {
    // Step 1: 检查是否为固定模板页（封面、目录、章节标题等）
    const fixedTemplate = PURPOSE_TO_FIXED_TEMPLATE[outlineItem.purpose];
    if (fixedTemplate) {
      return this.createSelection(
        fixedTemplate,
        `Fixed template for ${outlineItem.purpose}`,
        1.0,
        features,
      );
    }

    // Step 2: 根据内容目的选择规则集
    let baseTemplate = this.selectByContentPurpose(features, outlineItem);

    // Step 3: 应用上下文规则
    if (context) {
      baseTemplate = this.applyContextRules(baseTemplate, features, context);
    }

    // Step 4: 调整布局参数
    const params = this.adjustLayoutParams(baseTemplate, features, outlineItem);

    // Step 5: 获取备选模板
    const alternative = ALTERNATIVE_TEMPLATES[baseTemplate]?.[0];

    return {
      template: baseTemplate,
      layoutType: PAGE_TEMPLATE_TO_LAYOUT[baseTemplate],
      reasoning: this.generateReasoning(baseTemplate, features, outlineItem),
      confidence: this.calculateConfidence(baseTemplate, features),
      params,
      alternative,
    };
  }

  // ============================================================================
  // 规则集实现
  // ============================================================================

  /**
   * 根据内容目的选择基础模板
   */
  private selectByContentPurpose(
    features: SlideContentFeatures,
    outlineItem: SlideOutlineItem,
  ): SlidePageTemplate {
    const { contentPurpose, hasTimeSeries, hasComparison } = features;

    // 根据主要目的分发到不同规则集
    switch (contentPurpose) {
      case "analyze":
        // 分析性内容：根据是否有时间序列或对比决定
        if (hasTimeSeries) {
          return this.selectForTrend(features);
        }
        if (hasComparison) {
          return this.selectForComparison(features);
        }
        return this.selectForData(features);

      case "compare":
        return this.selectForComparison(features);

      case "recommend":
        return this.selectForRecommendations(features);

      case "warn":
        return this.selectForRiskAnalysis(features);

      case "showcase":
        if (features.hasLevelsOrStages) {
          return this.selectForHierarchy(features);
        }
        return "caseStudy";

      case "introduce":
      case "conclude":
      default:
        // 默认逻辑：根据结构特征选择
        return this.selectByStructure(features, outlineItem);
    }
  }

  /**
   * 规则集 A: 趋势/演进类内容
   */
  private selectForTrend(features: SlideContentFeatures): SlidePageTemplate {
    const {
      hasTimeSeries,
      hasLevelsOrStages,
      elementCount,
      dataDensity,
      structureType,
    } = features;

    // A1: 有明确时间节点的历史演进
    if (hasTimeSeries && elementCount >= 3) {
      if (elementCount <= 5) {
        return "timeline";
      } else {
        return "evolutionRoadmap";
      }
    }

    // A2: 阶段性能力演进（如L1→L2→L3）
    if (hasLevelsOrStages) {
      if (structureType === "sequential") {
        return "evolutionRoadmap";
      } else {
        return "maturityModel";
      }
    }

    // A3: 数据驱动的趋势展示
    if (dataDensity === "high") {
      return "dashboard";
    }

    // A4: 叙事性的趋势描述
    return "splitLayout";
  }

  /**
   * 规则集 B: 对比/比较类内容
   */
  private selectForComparison(
    features: SlideContentFeatures,
  ): SlidePageTemplate {
    const { comparisonDimensions, emotionalTone, dataDensity, structureType } =
      features;

    // B1: 二元对比（A vs B）
    if (comparisonDimensions === 2) {
      if (emotionalTone === "cautionary") {
        return "riskOpportunity";
      } else if (dataDensity === "high") {
        return "comparison";
      } else {
        return "splitLayout";
      }
    }

    // B2: 三项对比
    if (comparisonDimensions === 3) {
      return "multiColumn";
    }

    // B3: 四项及以上对比
    if (comparisonDimensions >= 4) {
      if (comparisonDimensions <= 5) {
        return "multiColumn";
      } else {
        return "caseStudy";
      }
    }

    // B4: 多维度对比（如公司 × 指标）
    if (structureType === "contrasting") {
      return "comparison";
    }

    return "splitLayout";
  }

  /**
   * 规则集 C: 层级/框架类内容
   */
  private selectForHierarchy(
    features: SlideContentFeatures,
  ): SlidePageTemplate {
    const { hasLevelsOrStages, structureType, elementCount, hasProcessFlow } =
      features;

    // C1: 成熟度/等级模型（L0-L5类）
    if (hasLevelsOrStages && structureType === "hierarchical") {
      return "maturityModel";
    }

    // C2: 并列支柱/要素（如"三大支柱"）
    if (structureType === "parallel") {
      if (elementCount <= 5) {
        return "multiColumn";
      } else {
        return "splitLayout";
      }
    }

    // C3: 流程/步骤类
    if (hasProcessFlow) {
      if (elementCount <= 4) {
        return "evolutionRoadmap";
      } else {
        return "splitLayout";
      }
    }

    // C4: 分类体系
    return "multiColumn";
  }

  /**
   * 规则集 D: 数据展示类内容
   */
  private selectForData(features: SlideContentFeatures): SlidePageTemplate {
    const {
      dataDensity,
      elementCount,
      visualizationType,
      spacePriority,
      hasComparison,
      contentPurpose,
    } = features;

    // D1: 高密度多指标
    if (dataDensity === "high" && elementCount >= 4) {
      return "dashboard";
    }

    // D2: 单一主题数据分析
    if (visualizationType === "chart") {
      if (spacePriority === "visual") {
        return "dashboard";
      } else {
        return "splitLayout";
      }
    }

    // D3: 对比性数据
    if (hasComparison) {
      return "comparison";
    }

    // D4: 监测/指标体系
    if (contentPurpose === "warn") {
      return "riskOpportunity";
    }

    return "dashboard";
  }

  /**
   * 规则集 E: 建议/行动类内容
   */
  private selectForRecommendations(
    features: SlideContentFeatures,
  ): SlidePageTemplate {
    const { elementCount, emotionalTone, hasTimeSeries } = features;

    // E1: 少量关键建议（≤4条）
    if (elementCount <= 4) {
      if (emotionalTone === "urgent") {
        return "recommendations";
      } else {
        return "multiColumn";
      }
    }

    // E2: 多条建议（5-7条）
    if (elementCount <= 7) {
      return "recommendations";
    }

    // E3: 大量建议（>7条）
    if (elementCount > 7) {
      return "splitLayout";
    }

    // E4: 带时间节点的行动路线
    if (hasTimeSeries) {
      return "recommendations";
    }

    return "recommendations";
  }

  /**
   * 风险分析专用规则
   */
  private selectForRiskAnalysis(
    features: SlideContentFeatures,
  ): SlidePageTemplate {
    const { hasComparison, dataDensity, elementCount } = features;

    // 风险/机遇对比
    if (hasComparison) {
      return "riskOpportunity";
    }

    // 高密度风险指标
    if (dataDensity === "high") {
      return "dashboard";
    }

    // 风险列表
    if (elementCount > 4) {
      return "splitLayout";
    }

    return "riskOpportunity";
  }

  /**
   * 根据结构特征选择（通用回退）
   */
  private selectByStructure(
    features: SlideContentFeatures,
    outlineItem: SlideOutlineItem,
  ): SlidePageTemplate {
    const { structureType, elementCount, dataDensity } = features;

    // 根据结构类型
    switch (structureType) {
      case "hierarchical":
        return this.selectForHierarchy(features);

      case "parallel":
        if (elementCount <= 5) {
          return "multiColumn";
        }
        return "splitLayout";

      case "sequential":
        if (features.hasTimeSeries) {
          return "timeline";
        }
        return "evolutionRoadmap";

      case "contrasting":
        return this.selectForComparison(features);

      case "narrative":
      default:
        // 叙事结构：根据数据密度决定
        if (dataDensity === "high") {
          return "dashboard";
        }
        // 根据关键点数量
        if (outlineItem.keyPoints.length <= 3) {
          return "splitLayout";
        }
        return "multiColumn";
    }
  }

  // ============================================================================
  // 上下文感知选择
  // ============================================================================

  /**
   * 应用上下文规则
   */
  private applyContextRules(
    baseTemplate: SlidePageTemplate,
    features: SlideContentFeatures,
    context: SelectionContext,
  ): SlidePageTemplate {
    const { previousPages, chapterContext } = context;

    // 规则 1: 避免连续使用相同模板
    if (previousPages.length > 0) {
      const lastTemplate = previousPages[previousPages.length - 1].template;
      if (baseTemplate === lastTemplate) {
        const alternative = this.getAlternativeTemplate(baseTemplate, features);
        if (alternative) {
          this.logger.debug(
            `[applyContextRules] Switching from ${baseTemplate} to ${alternative} to avoid repetition`,
          );
          return alternative;
        }
      }
    }

    // 规则 2: 章节内模板多样性
    const recentTemplates = previousPages.slice(-3).map((p) => p.template);
    const uniqueCount = new Set(recentTemplates).size;
    if (uniqueCount < 2 && recentTemplates.length >= 3) {
      const alternative = this.getDifferentTemplate(
        baseTemplate,
        recentTemplates,
      );
      if (alternative) {
        this.logger.debug(
          `[applyContextRules] Switching from ${baseTemplate} to ${alternative} for variety`,
        );
        return alternative;
      }
    }

    // 规则 3: 数据页和分析页交替
    if (previousPages.length > 0) {
      const lastTemplate = previousPages[previousPages.length - 1].template;
      if (
        this.isDataHeavyTemplate(lastTemplate) &&
        this.isDataHeavyTemplate(baseTemplate)
      ) {
        if (this.canBeNarrative(features)) {
          return "splitLayout";
        }
      }
    }

    // 规则 4: 章节结尾收敛
    if (chapterContext && this.isNearChapterEnd(chapterContext)) {
      if (
        !["chapterSummary", "splitLayout", "recommendations"].includes(
          baseTemplate,
        )
      ) {
        return this.adjustForConclusion(baseTemplate);
      }
    }

    return baseTemplate;
  }

  /**
   * 获取备选模板
   */
  getAlternativeTemplate(
    template: SlidePageTemplate,
    _features: SlideContentFeatures,
  ): SlidePageTemplate | undefined {
    const alternatives = ALTERNATIVE_TEMPLATES[template];
    if (!alternatives || alternatives.length === 0) {
      return undefined;
    }
    return alternatives[0];
  }

  /**
   * 获取不同于已有模板的模板
   */
  private getDifferentTemplate(
    baseTemplate: SlidePageTemplate,
    existingTemplates: SlidePageTemplate[],
  ): SlidePageTemplate | undefined {
    const alternatives = ALTERNATIVE_TEMPLATES[baseTemplate];
    if (!alternatives) return undefined;

    return alternatives.find((alt) => !existingTemplates.includes(alt));
  }

  /**
   * 检查是否为数据密集型模板
   */
  private isDataHeavyTemplate(template: SlidePageTemplate): boolean {
    return ["dashboard", "comparison", "maturityModel"].includes(template);
  }

  /**
   * 检查内容是否可以使用叙事模板
   */
  private canBeNarrative(features: SlideContentFeatures): boolean {
    return (
      features.structureType === "narrative" ||
      features.spacePriority === "text"
    );
  }

  /**
   * 检查是否接近章节结尾
   */
  private isNearChapterEnd(chapterContext: {
    currentPositionInChapter: number;
    totalPagesInChapter: number;
  }): boolean {
    const { currentPositionInChapter, totalPagesInChapter } = chapterContext;
    return totalPagesInChapter - currentPositionInChapter <= 2;
  }

  /**
   * 调整为总结性模板
   */
  private adjustForConclusion(template: SlidePageTemplate): SlidePageTemplate {
    // 如果是数据展示模板，切换到分屏布局
    if (this.isDataHeavyTemplate(template)) {
      return "splitLayout";
    }
    return template;
  }

  // ============================================================================
  // 参数调整
  // ============================================================================

  /**
   * 调整布局参数
   */
  adjustLayoutParams(
    template: SlidePageTemplate,
    features: SlideContentFeatures,
    _outlineItem?: SlideOutlineItem,
  ): LayoutParams {
    const baseParams: LayoutParams = {
      contentDensity: this.calculateContentDensity(features),
      visualWeight: this.calculateVisualWeight(features),
    };

    switch (template) {
      case "multiColumn":
        // 自动计算栏数
        let columnCount = Math.min(5, Math.max(2, features.elementCount));
        // 如果内容复杂度高，限制栏数
        if (features.complexity > 7) {
          columnCount = Math.min(columnCount, 3);
        }
        return {
          ...baseParams,
          columnCount,
          showIcons: features.visualizationType === "iconGrid",
          showDividers: columnCount <= 3,
        };

      case "splitLayout":
        // 根据空间优先级计算比例
        const leftWeight = features.spacePriority === "text" ? 60 : 50;
        const rightWeight = 100 - leftWeight;
        return {
          ...baseParams,
          ratio: `${leftWeight}:${rightWeight}`,
        };

      case "dashboard":
        // KPI 卡片数量
        const kpiCount = Math.min(4, Math.max(2, features.elementCount));
        return {
          ...baseParams,
          kpiCount,
          chartLayout: kpiCount <= 2 ? "fullWidth" : "sideBySide",
        };

      case "timeline":
      case "evolutionRoadmap":
        // 时间轴方向
        return {
          ...baseParams,
          axis: features.elementCount > 4 ? "vertical" : "horizontal",
        };

      default:
        return baseParams;
    }
  }

  /**
   * 计算内容密度
   */
  private calculateContentDensity(
    features: SlideContentFeatures,
  ): "low" | "medium" | "high" {
    if (features.dataDensity === "high" || features.elementCount > 6) {
      return "high";
    }
    if (features.elementCount <= 2 || features.dataDensity === "low") {
      return "low";
    }
    return "medium";
  }

  /**
   * 计算视觉权重
   */
  private calculateVisualWeight(features: SlideContentFeatures): number {
    let weight = 50;

    if (features.needsVisualization) weight += 20;
    if (features.spacePriority === "visual") weight += 15;
    if (features.dataDensity === "high") weight += 10;

    return Math.min(100, weight);
  }

  // ============================================================================
  // 辅助方法
  // ============================================================================

  /**
   * 创建选择结果
   */
  private createSelection(
    template: SlidePageTemplate,
    reasoning: string,
    confidence: number,
    features: SlideContentFeatures,
  ): TemplateSelection {
    return {
      template,
      layoutType: PAGE_TEMPLATE_TO_LAYOUT[template],
      reasoning,
      confidence,
      params: this.adjustLayoutParams(template, features),
      alternative: ALTERNATIVE_TEMPLATES[template]?.[0],
    };
  }

  /**
   * 生成选择理由
   */
  private generateReasoning(
    template: SlidePageTemplate,
    features: SlideContentFeatures,
    _outlineItem: SlideOutlineItem,
  ): string {
    const reasons: string[] = [];

    // 基于目的
    reasons.push(`Purpose: ${features.contentPurpose}`);

    // 基于结构
    reasons.push(`Structure: ${features.structureType}`);

    // 基于数据特征
    if (features.dataDensity === "high") {
      reasons.push("High data density");
    }
    if (features.hasTimeSeries) {
      reasons.push("Has time series");
    }
    if (features.hasComparison) {
      reasons.push(`${features.comparisonDimensions} comparison dimensions`);
    }

    return `Selected ${template}: ${reasons.join("; ")}`;
  }

  /**
   * 计算置信度
   */
  private calculateConfidence(
    template: SlidePageTemplate,
    features: SlideContentFeatures,
  ): number {
    // 基础置信度
    let confidence = features.confidence / 100;

    // 如果特征匹配度高，增加置信度
    if (template === "timeline" && features.hasTimeSeries) {
      confidence += 0.1;
    }
    if (template === "comparison" && features.hasComparison) {
      confidence += 0.1;
    }
    if (template === "dashboard" && features.dataDensity === "high") {
      confidence += 0.1;
    }

    return Math.min(1.0, confidence);
  }

  /**
   * 构建模板配置（向后兼容）
   */
  private buildTemplateConfig(
    outlineItem: SlideOutlineItem,
    selection: TemplateSelection,
  ): TemplateConfig {
    const slideSpec: SlideSpec = {
      id: `slide-${outlineItem.index}`,
      index: outlineItem.index,
      purpose: outlineItem.purpose,
      title: outlineItem.title,
      contentOutline: outlineItem.keyPoints,
      layoutType: selection.layoutType,
      layoutReasoning: selection.reasoning,
      backgroundDecision: {
        type: "gradient",
        reasoning: "Default background",
      },
    };

    return {
      index: outlineItem.index,
      layoutType: selection.layoutType,
      reason: selection.reasoning,
      slideSpec,
      parameters: {
        contentDensity: selection.params.contentDensity,
        visualWeight: selection.params.visualWeight,
        needsAnimation:
          outlineItem.purpose === "title" || outlineItem.purpose === "closing",
        priority: this.determinePriority(outlineItem),
      },
    };
  }

  /**
   * 确定优先级
   */
  private determinePriority(
    outlineItem: SlideOutlineItem,
  ): "hero" | "normal" | "support" {
    if (
      outlineItem.purpose === "title" ||
      outlineItem.purpose === "closing" ||
      outlineItem.emphasis === "high"
    ) {
      return "hero";
    }
    if (
      outlineItem.purpose === "section_header" ||
      outlineItem.emphasis === "medium"
    ) {
      return "normal";
    }
    return "support";
  }
}
