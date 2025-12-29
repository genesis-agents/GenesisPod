/**
 * Content Analyzer Service
 *
 * Phase 5 - 内容分析服务
 *
 * 职责：
 * 1. 分析用户输入内容特征
 * 2. 提取关键信息和主题
 * 3. 返回内容特征用于后续规划
 */

import { Injectable, Logger } from "@nestjs/common";

/**
 * 内容特征分析结果（Phase 5 简化版）
 */
export interface ContentFeatures {
  /** 主题领域 */
  topic: string;

  /** 内容类型 */
  contentType: "business" | "technical" | "educational" | "creative" | "mixed";

  /** 目标受众 */
  targetAudience: string;

  /** 情感基调 */
  tone: "professional" | "casual" | "inspiring" | "analytical";

  /** 是否数据驱动 */
  dataHeavy: boolean;

  /** 是否需要视觉化 */
  visualIntensive: boolean;

  /** 推荐的幻灯片数量范围 */
  suggestedSlideRange: {
    min: number;
    max: number;
  };

  /** 关键词列表 */
  keywords: string[];

  /** 内容密度 (字数) */
  wordCount: number;

  /** 是否包含代码/技术内容 */
  hasTechnicalContent: boolean;

  /** 是否包含图表数据 */
  hasChartData: boolean;
}

@Injectable()
export class ContentAnalyzerService {
  private readonly logger = new Logger(ContentAnalyzerService.name);

  /**
   * 分析内容特征
   */
  async analyze(content: string, urls?: string[]): Promise<ContentFeatures> {
    const startTime = Date.now();
    this.logger.log(`[analyze] Analyzing content, length: ${content.length}`);

    // 1. 基础统计
    const wordCount = this.countWords(content);
    const hasTechnicalContent = this.detectTechnicalContent(content);
    const hasChartData = this.detectChartData(content);
    const dataHeavy = this.isDataHeavy(content);

    // 2. 提取关键词
    const keywords = this.extractKeywords(content);

    // 3. 检测内容类型
    const contentType = this.detectContentType(content, keywords);

    // 4. 检测基调
    const tone = this.detectTone(content);

    // 5. 确定是否视觉密集
    const visualIntensive = this.isVisualIntensive(content, urls);

    // 6. 计算推荐幻灯片数量
    const suggestedSlideRange = this.calculateSlideRange(
      wordCount,
      dataHeavy,
      visualIntensive,
    );

    // 7. 提取主题
    const topic = this.extractTopic(content, keywords);

    // 8. 推测目标受众
    const targetAudience = this.detectTargetAudience(
      content,
      contentType,
      tone,
    );

    const elapsed = Date.now() - startTime;
    this.logger.log(
      `[analyze] Completed in ${elapsed}ms: topic="${topic}", type=${contentType}, slides=${suggestedSlideRange.min}-${suggestedSlideRange.max}`,
    );

    return {
      topic,
      contentType,
      targetAudience,
      tone,
      dataHeavy,
      visualIntensive,
      suggestedSlideRange,
      keywords,
      wordCount,
      hasTechnicalContent,
      hasChartData,
    };
  }

  // ============================================
  // 私有方法 - 分析逻辑
  // ============================================

  private countWords(content: string): number {
    const chineseChars = (content.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishWords = content
      .replace(/[\u4e00-\u9fa5]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 0).length;
    return chineseChars + englishWords;
  }

  private detectTechnicalContent(content: string): boolean {
    const technicalKeywords = [
      "function",
      "class",
      "const",
      "let",
      "var",
      "import",
      "export",
      "algorithm",
      "api",
      "database",
      "server",
      "client",
      "code",
      "函数",
      "算法",
      "接口",
      "数据库",
      "服务器",
      "客户端",
      "代码",
    ];
    const lowerContent = content.toLowerCase();
    return technicalKeywords.some((keyword) => lowerContent.includes(keyword));
  }

  private detectChartData(content: string): boolean {
    const patterns = [
      /\d+%/g,
      /\$\d+/g,
      /¥\d+/g,
      /\d{1,3}(,\d{3})+/g,
      /\d+\.\d+/g,
      /Q[1-4]\s+\d{4}/gi,
    ];
    return patterns.some((pattern) => pattern.test(content));
  }

  private isDataHeavy(content: string): boolean {
    const numberCount = (content.match(/\d+/g) || []).length;
    const wordCount = this.countWords(content);
    return numberCount / Math.max(wordCount, 1) > 0.05;
  }

  private extractKeywords(content: string): string[] {
    const words = content
      .toLowerCase()
      .replace(/[^\u4e00-\u9fa5a-z0-9\s]/gi, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2);

    const freq: Record<string, number> = {};
    for (const word of words) {
      freq[word] = (freq[word] || 0) + 1;
    }

    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }

  private detectContentType(
    content: string,
    keywords: string[],
  ): ContentFeatures["contentType"] {
    const lowerContent = content.toLowerCase();
    const keywordStr = keywords.join(" ");

    const businessKeywords = [
      "business",
      "market",
      "sales",
      "revenue",
      "strategy",
      "商业",
      "市场",
      "销售",
      "营收",
      "战略",
    ];
    if (
      businessKeywords.some(
        (kw) => lowerContent.includes(kw) || keywordStr.includes(kw),
      )
    ) {
      return "business";
    }

    const techKeywords = [
      "technology",
      "software",
      "algorithm",
      "development",
      "技术",
      "软件",
      "算法",
      "开发",
    ];
    if (
      techKeywords.some(
        (kw) => lowerContent.includes(kw) || keywordStr.includes(kw),
      )
    ) {
      return "technical";
    }

    const eduKeywords = [
      "learn",
      "teach",
      "education",
      "tutorial",
      "学习",
      "教学",
      "教育",
      "教程",
    ];
    if (
      eduKeywords.some(
        (kw) => lowerContent.includes(kw) || keywordStr.includes(kw),
      )
    ) {
      return "educational";
    }

    const creativeKeywords = [
      "design",
      "creative",
      "art",
      "innovation",
      "设计",
      "创意",
      "艺术",
      "创新",
    ];
    if (
      creativeKeywords.some(
        (kw) => lowerContent.includes(kw) || keywordStr.includes(kw),
      )
    ) {
      return "creative";
    }

    return "mixed";
  }

  private detectTone(content: string): ContentFeatures["tone"] {
    const lowerContent = content.toLowerCase();

    const professionalIndicators = [
      "analysis",
      "data",
      "research",
      "study",
      "分析",
      "数据",
      "研究",
    ];
    if (professionalIndicators.some((ind) => lowerContent.includes(ind))) {
      return "professional";
    }

    const inspiringIndicators = [
      "inspire",
      "vision",
      "future",
      "opportunity",
      "愿景",
      "未来",
      "机会",
    ];
    if (inspiringIndicators.some((ind) => lowerContent.includes(ind))) {
      return "inspiring";
    }

    const analyticalIndicators = [
      "therefore",
      "however",
      "analysis",
      "conclusion",
      "因此",
      "然而",
      "结论",
    ];
    if (analyticalIndicators.some((ind) => lowerContent.includes(ind))) {
      return "analytical";
    }

    return "professional";
  }

  private isVisualIntensive(content: string, urls?: string[]): boolean {
    if (urls && urls.length > 2) {
      return true;
    }

    const visualKeywords = [
      "image",
      "photo",
      "picture",
      "visual",
      "design",
      "图片",
      "照片",
      "视觉",
      "设计",
    ];
    const lowerContent = content.toLowerCase();
    return visualKeywords.some((kw) => lowerContent.includes(kw));
  }

  private calculateSlideRange(
    wordCount: number,
    dataHeavy: boolean,
    visualIntensive: boolean,
  ): { min: number; max: number } {
    let baseSlides = Math.ceil(wordCount / 1000) * 4;

    if (dataHeavy) {
      baseSlides = Math.ceil(baseSlides * 1.3);
    }

    if (visualIntensive) {
      baseSlides = Math.ceil(baseSlides * 1.2);
    }

    const min = Math.max(8, Math.floor(baseSlides * 0.8));
    const max = Math.min(40, Math.ceil(baseSlides * 1.2));

    return { min, max };
  }

  private extractTopic(_content: string, keywords: string[]): string {
    if (keywords.length === 0) {
      return "Untitled Presentation";
    }
    return keywords.slice(0, 3).join(" & ");
  }

  private detectTargetAudience(
    content: string,
    contentType: ContentFeatures["contentType"],
    tone: ContentFeatures["tone"],
  ): string {
    const lowerContent = content.toLowerCase();

    if (lowerContent.includes("executive") || lowerContent.includes("管理层")) {
      return "executives";
    }
    if (lowerContent.includes("developer") || lowerContent.includes("开发者")) {
      return "developers";
    }
    if (lowerContent.includes("student") || lowerContent.includes("学生")) {
      return "students";
    }
    if (lowerContent.includes("investor") || lowerContent.includes("投资者")) {
      return "investors";
    }

    if (contentType === "business" && tone === "professional") {
      return "business professionals";
    }
    if (contentType === "technical") {
      return "technical audience";
    }
    if (contentType === "educational") {
      return "learners";
    }

    return "general audience";
  }
}
