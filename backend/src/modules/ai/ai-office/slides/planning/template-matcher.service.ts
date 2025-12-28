/**
 * Template Matcher Service
 *
 * 模板匹配服务 - 根据内容类型和目的自动选择最合适的幻灯片模板
 *
 * 职责：
 * 1. 提供12种专业模板定义（参考 Genspark 标准）
 * 2. 根据内容类型和目的智能匹配模板
 * 3. 分析内容结构，自动检测内容类型
 * 4. 提供模板推荐和评分功能
 *
 * 核心能力：
 * - 智能内容分析（数据点检测、对比结构检测、时间线检测）
 * - 模板匹配算法（精确匹配 > purpose 匹配 > contentType 匹配）
 * - 模板推荐系统（返回排序后的推荐列表）
 */

import { Injectable, Logger } from "@nestjs/common";
import type {
  SlidePurpose,
  SlideLayoutType,
  SlideSpec,
  GeneratedSlideContent,
} from "../types/slides.types";

// ============================================
// 模板定义类型
// ============================================

/**
 * 幻灯片内容目的
 */
export type SlidePurposeExtended =
  | "title"
  | "agenda"
  | "section_header"
  | "content"
  | "comparison"
  | "timeline"
  | "statistics"
  | "quote"
  | "case_study"
  | "framework"
  | "closing"
  | "qna";

/**
 * 内容类型
 */
export type ContentType =
  | "text_only" // 纯文本
  | "bullet_points" // 要点列表
  | "numbered_list" // 编号列表
  | "key_value" // 键值对
  | "comparison" // 对比内容
  | "timeline" // 时间线
  | "statistics" // 统计数据
  | "quote" // 引用
  | "case_cards" // 案例卡片
  | "framework_3" // 三要素框架
  | "framework_5" // 五要素框架
  | "roadmap"; // 路线图

/**
 * 布局配置
 */
export interface LayoutConfig {
  type:
    | "center"
    | "single_column"
    | "two_column"
    | "three_column"
    | "five_column"
    | "cards"
    | "metrics"
    | "timeline"
    | "phases"
    | "two_section";
  showBrand?: boolean;
  showPageRefs?: boolean;
  showChapterNumber?: boolean;
  cardCount?: number | { min: number; max: number };
  showLabels?: boolean;
  showVsIcon?: boolean;
  showConnectors?: boolean;
  style?: string;
  metricCount?: { min: number; max: number };
  direction?: "horizontal" | "vertical";
  eventCount?: { min: number; max: number };
  phaseCount?: { min: number; max: number };
  showArrows?: boolean;
  insightSection?: boolean;
  actionSection?: boolean;
  showLogo?: boolean;
}

/**
 * 样式配置
 */
export interface StyleConfig {
  backgroundType?: "solid" | "gradient" | "accent";
  emphasisLevel?: "high" | "medium" | "low";
  showIcons?: boolean;
  showNumbers?: boolean;
  showMetrics?: boolean;
  showTrend?: boolean;
  showComparison?: boolean;
  showConnectors?: boolean;
}

/**
 * 幻灯片模板
 */
export interface SlideTemplate {
  key: string;
  name: string;
  nameZh: string;
  purpose: SlidePurpose[];
  contentTypes: ContentType[];
  layout: LayoutConfig;
  defaultStyle: StyleConfig;
  description?: string;
}

// ============================================
// 专业模板定义（12种）
// ============================================

const PROFESSIONAL_TEMPLATES: SlideTemplate[] = [
  {
    key: "cover_hero",
    name: "Cover Hero",
    nameZh: "封面·商务简约",
    purpose: ["title"],
    contentTypes: ["text_only"],
    layout: { type: "center", showBrand: true },
    defaultStyle: { backgroundType: "gradient", emphasisLevel: "high" },
    description: "适合演示文稿封面，商务简约风格，支持品牌展示",
  },
  {
    key: "agenda_simple",
    name: "Agenda Simple",
    nameZh: "目录·简洁列表",
    purpose: ["agenda"],
    contentTypes: ["numbered_list"],
    layout: { type: "single_column", showPageRefs: true },
    defaultStyle: { backgroundType: "solid" },
    description: "简洁的目录页，支持页码引用",
  },
  {
    key: "section_divider",
    name: "Section Divider",
    nameZh: "章节扉页",
    purpose: ["section_header"],
    contentTypes: ["text_only"],
    layout: { type: "center", showChapterNumber: true },
    defaultStyle: { backgroundType: "accent", emphasisLevel: "high" },
    description: "章节分隔页，高视觉冲击力",
  },
  {
    key: "exec_summary",
    name: "Executive Summary",
    nameZh: "执行摘要",
    purpose: ["content", "closing"],
    contentTypes: ["bullet_points", "key_value"],
    layout: { type: "cards", cardCount: { min: 3, max: 5 } },
    defaultStyle: { showIcons: true },
    description: "执行摘要，卡片式布局，3-5个关键点",
  },
  {
    key: "two_column_compare",
    name: "Two Column Compare",
    nameZh: "两列对比",
    purpose: ["comparison", "content"],
    contentTypes: ["comparison", "bullet_points"],
    layout: { type: "two_column", showLabels: true, showVsIcon: true },
    defaultStyle: {},
    description: "两列对比布局，适合对比分析",
  },
  {
    key: "three_pillars",
    name: "Three Pillars",
    nameZh: "三支柱框架",
    purpose: ["content"],
    contentTypes: ["framework_3", "bullet_points"],
    layout: { type: "three_column", showConnectors: true },
    defaultStyle: { showIcons: true, backgroundType: "solid" },
    description: "三支柱框架，展示三个核心要素及其关系",
  },
  {
    key: "framework_5",
    name: "Five Elements",
    nameZh: "五要素框架",
    purpose: ["content"],
    contentTypes: ["framework_5"],
    layout: { type: "five_column", style: "pentagon" },
    defaultStyle: { showNumbers: true },
    description: "五要素框架，五边形布局",
  },
  {
    key: "case_cards",
    name: "Case Cards",
    nameZh: "案例卡片",
    purpose: ["content"],
    contentTypes: ["case_cards"],
    layout: { type: "cards", cardCount: 3, showLogo: true },
    defaultStyle: { showMetrics: true },
    description: "案例卡片，适合展示3个典型案例",
  },
  {
    key: "kpi_highlights",
    name: "KPI Highlights",
    nameZh: "关键数据",
    purpose: ["statistics"],
    contentTypes: ["statistics", "key_value"],
    layout: { type: "metrics", metricCount: { min: 3, max: 5 } },
    defaultStyle: { showTrend: true, showComparison: true },
    description: "关键数据展示，支持趋势和对比",
  },
  {
    key: "timeline_horizontal",
    name: "Timeline Horizontal",
    nameZh: "时间轴",
    purpose: ["timeline"],
    contentTypes: ["timeline"],
    layout: {
      type: "timeline",
      direction: "horizontal",
      eventCount: { min: 4, max: 6 },
    },
    defaultStyle: { showConnectors: true },
    description: "水平时间轴，4-6个时间节点",
  },
  {
    key: "roadmap",
    name: "Roadmap",
    nameZh: "路线图",
    purpose: ["timeline"],
    contentTypes: ["roadmap", "timeline"],
    layout: {
      type: "phases",
      phaseCount: { min: 3, max: 5 },
      showArrows: true,
    },
    defaultStyle: { backgroundType: "gradient" },
    description: "路线图，3-5个阶段",
  },
  {
    key: "conclusion_actions",
    name: "Conclusion & Actions",
    nameZh: "结论与建议",
    purpose: ["closing"],
    contentTypes: ["bullet_points", "key_value"],
    layout: { type: "two_section", insightSection: true, actionSection: true },
    defaultStyle: {},
    description: "结论与建议，分为洞察和行动两部分",
  },
];

// ============================================
// 模板匹配服务
// ============================================

@Injectable()
export class TemplateMatcher {
  private readonly logger = new Logger(TemplateMatcher.name);
  private readonly templates: Map<string, SlideTemplate>;

  constructor() {
    // 将模板数组转换为 Map，便于快速查找
    this.templates = new Map(PROFESSIONAL_TEMPLATES.map((t) => [t.key, t]));
    this.logger.log(
      `[TemplateMatcher] Initialized with ${this.templates.size} templates`,
    );
  }

  /**
   * 根据 SlideSpec 匹配最佳模板
   *
   * 匹配策略：
   * 1. 精确匹配：purpose 和 contentType 都匹配
   * 2. Purpose 匹配：只匹配 purpose
   * 3. ContentType 匹配：只匹配 contentType
   * 4. 默认：返回通用模板
   *
   * @param slideSpec 幻灯片规格
   * @returns 匹配的模板
   */
  matchTemplate(slideSpec: SlideSpec): SlideTemplate {
    const { purpose, contentOutline } = slideSpec;

    // 分析内容类型
    const contentType = this.analyzeContentType({
      title: slideSpec.title,
      bulletPoints: contentOutline,
    });

    this.logger.debug(
      `[matchTemplate] Matching template for purpose="${purpose}", contentType="${contentType}"`,
    );

    // 计算所有模板的匹配分数
    const scoredTemplates = Array.from(this.templates.values()).map(
      (template) => ({
        template,
        score: this.scoreTemplateMatch(template, {
          ...slideSpec,
          contentType,
        }),
      }),
    );

    // 按分数排序
    scoredTemplates.sort((a, b) => b.score - a.score);

    const bestMatch = scoredTemplates[0];

    this.logger.debug(
      `[matchTemplate] Best match: ${bestMatch.template.key} (score: ${bestMatch.score})`,
    );

    return bestMatch.template;
  }

  /**
   * 分析内容类型
   *
   * 检测策略：
   * - 数字多 → statistics
   * - 对比结构 → comparison
   * - 时间序列 → timeline
   * - 编号列表 → numbered_list
   * - 要点列表 → bullet_points
   * - 默认 → text_only
   *
   * @param content 幻灯片内容
   * @returns 内容类型
   */
  analyzeContentType(content: Partial<GeneratedSlideContent>): ContentType {
    const { bulletPoints, numberedItems, statistics, quote } = content;

    // 引用内容
    if (quote) {
      return "quote";
    }

    // 统计数据
    if (statistics && statistics.length > 0) {
      return "statistics";
    }

    // 编号列表
    if (numberedItems && numberedItems.length > 0) {
      return "numbered_list";
    }

    // 要点列表
    if (bulletPoints && bulletPoints.length > 0) {
      const text = bulletPoints.join(" ");

      // 检测数据点
      const dataPoints = this.detectDataPoints(text);
      if (dataPoints >= 3) {
        return "statistics";
      }

      // 检测对比结构
      if (this.detectComparisonStructure(text)) {
        return "comparison";
      }

      // 检测时间线
      if (this.detectTimelineStructure(text)) {
        return "timeline";
      }

      // 检测框架结构
      if (bulletPoints.length === 3) {
        return "framework_3";
      }
      if (bulletPoints.length === 5) {
        return "framework_5";
      }

      return "bullet_points";
    }

    return "text_only";
  }

  /**
   * 根据 key 获取模板
   *
   * @param key 模板 key
   * @returns 模板，如果不存在则返回 undefined
   */
  getTemplateByKey(key: string): SlideTemplate | undefined {
    return this.templates.get(key);
  }

  /**
   * 获取所有模板
   *
   * @returns 所有模板列表
   */
  getAllTemplates(): SlideTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * 为幻灯片推荐模板
   *
   * 返回排序后的推荐列表（按匹配度从高到低）
   *
   * @param slideSpec 幻灯片规格
   * @param limit 返回的推荐数量（默认 3）
   * @returns 推荐模板列表
   */
  suggestTemplatesForSlide(
    slideSpec: SlideSpec,
    limit: number = 3,
  ): Array<{ template: SlideTemplate; score: number; reason: string }> {
    const { contentOutline } = slideSpec;

    // 分析内容类型
    const contentType = this.analyzeContentType({
      title: slideSpec.title,
      bulletPoints: contentOutline,
    });

    // 计算所有模板的匹配分数
    const scoredTemplates = Array.from(this.templates.values()).map(
      (template) => {
        const score = this.scoreTemplateMatch(template, {
          ...slideSpec,
          contentType,
        });
        const reason = this.getMatchReason(template, slideSpec, contentType);
        return { template, score, reason };
      },
    );

    // 按分数排序
    scoredTemplates.sort((a, b) => b.score - a.score);

    return scoredTemplates.slice(0, limit);
  }

  // ============================================
  // 私有辅助方法
  // ============================================

  /**
   * 计算模板与内容的匹配度
   *
   * 评分规则：
   * - Purpose 完全匹配：+50 分
   * - ContentType 完全匹配：+40 分
   * - Purpose 部分匹配：+20 分
   * - ContentType 部分匹配：+10 分
   *
   * @param template 模板
   * @param spec 幻灯片规格（包含 contentType）
   * @returns 匹配分数 (0-100)
   */
  private scoreTemplateMatch(
    template: SlideTemplate,
    spec: SlideSpec & { contentType: ContentType },
  ): number {
    let score = 0;

    // Purpose 匹配
    if (template.purpose.includes(spec.purpose)) {
      score += 50;
    } else if (this.isSimilarPurpose(template.purpose, spec.purpose)) {
      score += 20;
    }

    // ContentType 匹配
    if (template.contentTypes.includes(spec.contentType)) {
      score += 40;
    } else if (
      this.isSimilarContentType(template.contentTypes, spec.contentType)
    ) {
      score += 10;
    }

    return Math.min(score, 100);
  }

  /**
   * 获取匹配原因
   *
   * @param template 模板
   * @param _spec 幻灯片规格（用于未来扩展）
   * @param contentType 内容类型
   * @returns 匹配原因描述
   */
  private getMatchReason(
    template: SlideTemplate,
    _spec: SlideSpec,
    contentType: ContentType,
  ): string {
    const reasons: string[] = [];

    if (template.purpose.includes(_spec.purpose)) {
      reasons.push(`目的匹配（${_spec.purpose}）`);
    }

    if (template.contentTypes.includes(contentType)) {
      reasons.push(`内容类型匹配（${contentType}）`);
    }

    if (reasons.length === 0) {
      return "通用模板";
    }

    return reasons.join("，");
  }

  /**
   * 判断两个 purpose 是否相似
   *
   * @param templatePurposes 模板支持的目的列表
   * @param purpose 幻灯片目的
   * @returns 是否相似
   */
  private isSimilarPurpose(
    templatePurposes: SlidePurpose[],
    purpose: SlidePurpose,
  ): boolean {
    // 定义相似的 purpose 映射
    const similarPurposes: Record<SlidePurpose, SlidePurpose[]> = {
      title: ["section_header"],
      section_header: ["title"],
      content: ["agenda", "statistics", "timeline"],
      closing: ["content"],
      agenda: ["content"],
      comparison: ["content"],
      timeline: ["content"],
      statistics: ["content"],
      quote: [],
      team: ["content"],
      image_focus: ["content"],
      chart: ["statistics"],
      qna: ["closing"],
    };

    const similar = similarPurposes[purpose] || [];
    return templatePurposes.some((tp) => similar.includes(tp));
  }

  /**
   * 判断内容类型是否相似
   *
   * @param templateContentTypes 模板支持的内容类型列表
   * @param contentType 内容类型
   * @returns 是否相似
   */
  private isSimilarContentType(
    templateContentTypes: ContentType[],
    contentType: ContentType,
  ): boolean {
    // 定义相似的内容类型映射
    const similarContentTypes: Record<ContentType, ContentType[]> = {
      text_only: [],
      bullet_points: ["numbered_list", "key_value"],
      numbered_list: ["bullet_points"],
      key_value: ["bullet_points", "statistics"],
      comparison: ["bullet_points"],
      timeline: ["roadmap"],
      statistics: ["key_value"],
      quote: [],
      case_cards: ["bullet_points"],
      framework_3: ["bullet_points"],
      framework_5: ["bullet_points"],
      roadmap: ["timeline"],
    };

    const similar = similarContentTypes[contentType] || [];
    return templateContentTypes.some((tct) => similar.includes(tct));
  }

  /**
   * 检测内容中的数据点数量
   *
   * 数据点定义：数字 + 单位/百分号/趋势词
   *
   * @param content 内容字符串
   * @returns 数据点数量
   */
  detectDataPoints(content: string): number {
    // 匹配模式：
    // - 数字 + %
    // - 数字 + 单位（万、亿、k、M、B）
    // - 数字 + 增长/下降/同比/环比
    const patterns = [
      /\d+(\.\d+)?%/g, // 百分比
      /\d+(\.\d+)?(万|亿|千|百|k|K|M|B)/g, // 带单位的数字
      /\d+(\.\d+)?.*(增长|下降|上升|下跌|同比|环比|增加|减少)/g, // 趋势数据
      /[$¥€£]\s*\d+(\.\d+)?/g, // 货币
    ];

    let count = 0;
    for (const pattern of patterns) {
      const matches = content.match(pattern);
      if (matches) {
        count += matches.length;
      }
    }

    return count;
  }

  /**
   * 检测是否有对比结构
   *
   * 对比结构特征：
   * - vs/versus
   * - 对比、比较
   * - 左右、前后、新旧
   *
   * @param content 内容字符串
   * @returns 是否为对比结构
   */
  detectComparisonStructure(content: string): boolean {
    const comparisonKeywords = [
      /\bvs\.?\b/i,
      /\bversus\b/i,
      /对比/,
      /比较/,
      /左.*右/,
      /前.*后/,
      /新.*旧/,
      /优.*劣/,
      /优势.*劣势/,
      /before.*after/i,
      /传统.*现代/,
    ];

    return comparisonKeywords.some((pattern) => pattern.test(content));
  }

  /**
   * 检测是否有时间线结构
   *
   * 时间线特征：
   * - 日期序列（2020、2021、2022）
   * - 阶段词（第一阶段、第二阶段）
   * - 时间词（Q1、Q2、第一季度）
   *
   * @param content 内容字符串
   * @returns 是否为时间线结构
   */
  detectTimelineStructure(content: string): boolean {
    // 检测多个年份
    const years = content.match(/\b(19|20)\d{2}\b/g);
    if (years && years.length >= 3) {
      return true;
    }

    // 检测季度
    const quarters = content.match(/Q[1-4]|第[一二三四]季度/g);
    if (quarters && quarters.length >= 2) {
      return true;
    }

    // 检测阶段
    const phases = content.match(
      /第[一二三四五六七八九十]阶段|阶段[一二三四五1-5]/g,
    );
    if (phases && phases.length >= 2) {
      return true;
    }

    // 检测时间序列词
    const timelineKeywords = [
      /过去.*现在.*未来/,
      /历史.*现状.*展望/,
      /起步.*发展.*成熟/,
      /初期.*中期.*后期/,
    ];

    return timelineKeywords.some((pattern) => pattern.test(content));
  }

  /**
   * 将模板布局类型映射到 SlideLayoutType
   *
   * @param template 模板
   * @returns 对应的 SlideLayoutType
   */
  mapTemplateToLayoutType(template: SlideTemplate): SlideLayoutType {
    // 根据模板 key 映射到具体的布局类型
    const layoutMapping: Record<string, SlideLayoutType> = {
      cover_hero: "title_center",
      agenda_simple: "numbered_list",
      section_divider: "title_subtitle",
      exec_summary: "cards_grid",
      two_column_compare: "comparison_split",
      three_pillars: "three_columns",
      framework_5: "cards_grid",
      case_cards: "cards_grid",
      kpi_highlights: "statistics_cards",
      timeline_horizontal: "timeline_horizontal",
      roadmap: "timeline_horizontal",
      conclusion_actions: "two_columns",
    };

    return layoutMapping[template.key] || "bullet_points";
  }
}
