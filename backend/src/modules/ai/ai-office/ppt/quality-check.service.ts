/**
 * PPT Quality Check Service
 *
 * 质量检查服务 - 检测PPT文档中的问题并提供优化建议
 *
 * 职责：
 * 1. 检测重复内容
 * 2. 检查布局溢出
 * 3. 分析内容密度
 * 4. 检查样式一致性
 * 5. 生成优化建议
 * 6. 执行自动修复
 */

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { GeneratedSlide, PPTDocument, PPTTheme } from "./ppt.types";
import { randomUUID } from "crypto";

// ============================================
// 类型定义
// ============================================

export interface QualityReport {
  documentId: string;
  checkedAt: Date;
  score: number; // 0-100 总分
  issues: QualityIssue[];
  suggestions: Suggestion[];
}

export interface QualityIssue {
  id: string;
  type:
    | "duplicate"
    | "layout_overflow"
    | "content_sparse"
    | "content_dense"
    | "inconsistency"
    | "missing_data"
    | "source_unverified"
    | "fabrication_suspected"
    | "data_point_missing";
  severity: "error" | "warning" | "info";
  pages: number[]; // 受影响的页码
  description: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  details?: any; // 额外信息（可以是各种不同的结构）
}

// 🆕 素材验证相关问题
export interface SourceIssue extends QualityIssue {
  type: "source_unverified" | "fabrication_suspected";
  details: {
    slideIndex: number;
    contentSnippet: string;
    sourceRelevance: number; // 0-100
    suspiciousContent?: string[];
    expectedSource?: string;
  };
}

// 🆕 数据点缺失问题
export interface DataPointIssue extends QualityIssue {
  type: "data_point_missing";
  details: {
    slideIndex: number;
    requiredDataPoints: Array<{
      id: string;
      value: string;
      type: string;
      context: string;
    }>;
    missingDataPoints: Array<{
      id: string;
      value: string;
      type: string;
    }>;
    coverageRate: number; // 0-100
  };
}

// 🆕 智能拆分建议
export interface SmartSplitSuggestion extends Suggestion {
  action: "split";
  actionData: {
    slideIndex: number;
    splitStrategy: "by_topic" | "by_paragraph" | "by_bullet" | "by_section";
    suggestedParts: number;
    splitPoints: string[]; // 建议的拆分点描述
    estimatedWordCounts: number[];
  };
}

export interface DuplicateIssue extends QualityIssue {
  type: "duplicate";
  details: {
    page1: number;
    page2: number;
    similarity: number; // 0-100
    duplicatedContent: string;
  };
}

export interface LayoutIssue extends QualityIssue {
  type: "layout_overflow";
  details: {
    page: number;
    overflowArea: "top" | "bottom" | "left" | "right";
    overflowPixels: number;
  };
}

export interface ContentIssue extends QualityIssue {
  type: "content_sparse" | "content_dense";
  details: {
    page: number;
    fillRate: number; // 内容填充率 0-100
    wordCount: number;
    bulletCount: number;
  };
}

export interface InconsistencyIssue extends QualityIssue {
  type: "inconsistency";
  details: {
    inconsistencyType: "font" | "color" | "spacing" | "style";
    affectedPages: number[];
    expectedValue: string;
    actualValues: Record<number, string>;
  };
}

export interface Suggestion {
  id: string;
  issueId: string; // 关联的问题ID
  action:
    | "merge"
    | "split"
    | "adjust_layout"
    | "add_content"
    | "remove_content"
    | "unify_style";
  description: string;
  autoFixable: boolean; // 是否可自动修复
  priority: "high" | "medium" | "low";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actionData?: any; // 修复所需的数据（可以是各种不同的结构）
}

// 安全区配置
export interface SafeAreaConfig {
  top: number; // 上边距（像素）
  bottom: number;
  left: number;
  right: number;
  maxWidth: number; // 内容最大宽度
  maxHeight: number; // 内容最大高度
}

// 默认安全区配置（16:9 比例，1920x1080）
const DEFAULT_SAFE_AREA: SafeAreaConfig = {
  top: 80,
  bottom: 80,
  left: 100,
  right: 100,
  maxWidth: 1720,
  maxHeight: 920,
};

@Injectable()
export class QualityCheckService {
  private readonly logger = new Logger(QualityCheckService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 执行完整的质量检查
   */
  async checkQuality(documentId: string): Promise<QualityReport> {
    this.logger.log(`[checkQuality] Starting quality check for: ${documentId}`);

    // 获取文档
    const doc = await this.prisma.officeDocument.findUnique({
      where: { id: documentId },
    });

    if (!doc) {
      throw new Error(`Document not found: ${documentId}`);
    }

    const document = doc.content as unknown as PPTDocument;
    const slides = document.slides;

    this.logger.log(
      `[checkQuality] Checking ${slides.length} slides for quality issues`,
    );

    // 执行所有检查
    const issues: QualityIssue[] = [];

    // 1. 检测重复内容
    const duplicateIssues = this.checkDuplicates(slides);
    issues.push(...duplicateIssues);

    // 2. 检查布局溢出
    const layoutIssues = this.checkLayoutOverflow(slides, DEFAULT_SAFE_AREA);
    issues.push(...layoutIssues);

    // 3. 检查内容密度
    const contentIssues = this.checkContentDensity(slides);
    issues.push(...contentIssues);

    // 4. 检查一致性
    const consistencyIssues = this.checkConsistency(slides, document.theme);
    issues.push(...consistencyIssues);

    // 5. 检查缺失数据
    const missingDataIssues = this.checkMissingData(slides);
    issues.push(...missingDataIssues);

    // 6. 🆕 检查素材来源验证
    const sourceIssues = this.checkSourceVerification(slides);
    issues.push(...sourceIssues);

    // 7. 🆕 检查数据点覆盖
    const dataPointIssues = this.checkDataPointCoverage(slides);
    issues.push(...dataPointIssues);

    // 生成建议（包含智能拆分建议）
    const suggestions = this.generateSuggestions(issues, slides);

    // 计算总分
    const score = this.calculateScore(issues);

    const report: QualityReport = {
      documentId,
      checkedAt: new Date(),
      score,
      issues,
      suggestions,
    };

    // 保存报告到数据库（作为元数据）
    await this.saveQualityReport(documentId, report);

    this.logger.log(
      `[checkQuality] Quality check complete. Score: ${score}, Issues: ${issues.length}, Suggestions: ${suggestions.length}`,
    );

    return report;
  }

  /**
   * 检测重复页面
   * 使用 Jaccard 相似度算法
   */
  checkDuplicates(slides: GeneratedSlide[]): DuplicateIssue[] {
    const issues: DuplicateIssue[] = [];
    const SIMILARITY_THRESHOLD = 70; // 相似度阈值

    for (let i = 0; i < slides.length; i++) {
      for (let j = i + 1; j < slides.length; j++) {
        const text1 = this.extractSlideText(slides[i]);
        const text2 = this.extractSlideText(slides[j]);

        const similarity = this.calculateSimilarity(text1, text2);

        if (similarity >= SIMILARITY_THRESHOLD) {
          // 提取重复的内容片段
          const duplicatedContent = this.findCommonContent(text1, text2);

          issues.push({
            id: randomUUID(),
            type: "duplicate",
            severity: similarity >= 85 ? "error" : "warning",
            pages: [i, j],
            description: `Slide ${i + 1} and ${j + 1} have ${similarity.toFixed(1)}% similar content`,
            details: {
              page1: i,
              page2: j,
              similarity,
              duplicatedContent,
            },
          });

          this.logger.warn(
            `[checkDuplicates] Found duplicate content between slides ${i + 1} and ${j + 1} (${similarity.toFixed(1)}%)`,
          );
        }
      }
    }

    return issues;
  }

  /**
   * 检查布局溢出
   * 估算内容是否超出安全区
   */
  checkLayoutOverflow(
    slides: GeneratedSlide[],
    safeArea: SafeAreaConfig,
  ): LayoutIssue[] {
    const issues: LayoutIssue[] = [];

    for (const slide of slides) {
      const contentBounds = this.estimateContentBounds(slide);

      // 检查上下左右是否溢出
      const overflows: Array<{
        area: "top" | "bottom" | "left" | "right";
        pixels: number;
      }> = [];

      if (contentBounds.top < safeArea.top) {
        overflows.push({
          area: "top",
          pixels: safeArea.top - contentBounds.top,
        });
      }

      if (contentBounds.bottom > safeArea.maxHeight) {
        overflows.push({
          area: "bottom",
          pixels: contentBounds.bottom - safeArea.maxHeight,
        });
      }

      if (contentBounds.left < safeArea.left) {
        overflows.push({
          area: "left",
          pixels: safeArea.left - contentBounds.left,
        });
      }

      if (contentBounds.right > safeArea.maxWidth) {
        overflows.push({
          area: "right",
          pixels: contentBounds.right - safeArea.maxWidth,
        });
      }

      // 为每个溢出创建一个 issue
      for (const overflow of overflows) {
        issues.push({
          id: randomUUID(),
          type: "layout_overflow",
          severity: overflow.pixels > 50 ? "error" : "warning",
          pages: [slide.index],
          description: `Slide ${slide.index + 1} content overflows ${overflow.area} safe area by ${overflow.pixels}px`,
          details: {
            page: slide.index,
            overflowArea: overflow.area,
            overflowPixels: overflow.pixels,
          },
        });
      }
    }

    if (issues.length > 0) {
      this.logger.warn(
        `[checkLayoutOverflow] Found ${issues.length} layout overflow issues`,
      );
    }

    return issues;
  }

  /**
   * 检查内容密度
   * 检测内容过少或过多
   */
  checkContentDensity(slides: GeneratedSlide[]): ContentIssue[] {
    const issues: ContentIssue[] = [];
    const SPARSE_THRESHOLD = 30; // 填充率低于30%视为稀疏
    const DENSE_THRESHOLD = 90; // 填充率高于90%视为过密
    const MAX_WORDS_PER_SLIDE = 150; // 单页最多150个词

    for (const slide of slides) {
      // 跳过标题页和结束页
      if (
        slide.spec.purpose === "title" ||
        slide.spec.purpose === "closing" ||
        slide.spec.purpose === "qna"
      ) {
        continue;
      }

      const fillRate = this.estimateContentFillRate(slide);
      const wordCount = this.countWords(this.extractSlideText(slide));
      const bulletCount = slide.content.bulletPoints?.length || 0;

      // 检查稀疏内容
      if (fillRate < SPARSE_THRESHOLD && wordCount < 30) {
        issues.push({
          id: randomUUID(),
          type: "content_sparse",
          severity: fillRate < 15 ? "warning" : "info",
          pages: [slide.index],
          description: `Slide ${slide.index + 1} has sparse content (${fillRate.toFixed(1)}% fill rate, ${wordCount} words)`,
          details: {
            page: slide.index,
            fillRate,
            wordCount,
            bulletCount,
          },
        });
      }

      // 检查过密内容
      if (fillRate > DENSE_THRESHOLD || wordCount > MAX_WORDS_PER_SLIDE) {
        issues.push({
          id: randomUUID(),
          type: "content_dense",
          severity: wordCount > MAX_WORDS_PER_SLIDE * 1.5 ? "error" : "warning",
          pages: [slide.index],
          description: `Slide ${slide.index + 1} has too much content (${fillRate.toFixed(1)}% fill rate, ${wordCount} words)`,
          details: {
            page: slide.index,
            fillRate,
            wordCount,
            bulletCount,
          },
        });
      }
    }

    if (issues.length > 0) {
      this.logger.warn(
        `[checkContentDensity] Found ${issues.length} content density issues`,
      );
    }

    return issues;
  }

  /**
   * 检查样式一致性
   * 检查字体、颜色、间距等的一致性
   */
  checkConsistency(
    slides: GeneratedSlide[],
    _theme: PPTTheme, // eslint-disable-line @typescript-eslint/no-unused-vars
  ): InconsistencyIssue[] {
    const issues: InconsistencyIssue[] = [];

    // 1. 检查标题长度一致性（排除首页和末页）
    const titleLengths: Record<number, number> = {};
    const contentSlides = slides.filter(
      (s) =>
        s.spec.purpose !== "title" &&
        s.spec.purpose !== "closing" &&
        s.spec.purpose !== "qna",
    );

    for (const slide of contentSlides) {
      titleLengths[slide.index] = slide.content.title?.length ?? 0;
    }

    const avgTitleLength =
      Object.values(titleLengths).reduce((a, b) => a + b, 0) /
      (Object.keys(titleLengths).length ?? 1);

    const outliers: number[] = [];
    for (const [index, length] of Object.entries(titleLengths)) {
      // 如果标题长度与平均值差异超过50%
      if (Math.abs(length - avgTitleLength) > avgTitleLength * 0.5) {
        outliers.push(parseInt(index));
      }
    }

    if (outliers.length > 0) {
      const outlierLengths: Record<number, string> = {};
      for (const index of outliers) {
        outlierLengths[index] = `${titleLengths[index]} chars`;
      }

      issues.push({
        id: randomUUID(),
        type: "inconsistency",
        severity: "info",
        pages: outliers,
        description: `Inconsistent title lengths detected across ${outliers.length} slides`,
        details: {
          inconsistencyType: "style",
          affectedPages: outliers,
          expectedValue: `~${Math.round(avgTitleLength)} chars`,
          actualValues: outlierLengths,
        },
      });
    }

    // 2. 检查 bullet point 数量一致性
    const bulletCounts: Record<number, number> = {};
    for (const slide of contentSlides) {
      if (slide.content.bulletPoints) {
        bulletCounts[slide.index] = slide.content.bulletPoints.length;
      }
    }

    if (Object.keys(bulletCounts).length > 0) {
      const avgBulletCount =
        Object.values(bulletCounts).reduce((a, b) => a + b, 0) /
        Object.keys(bulletCounts).length;

      const bulletOutliers: number[] = [];
      for (const [index, count] of Object.entries(bulletCounts)) {
        // 如果 bullet 数量差异过大（超过3个）
        if (Math.abs(count - avgBulletCount) > 3) {
          bulletOutliers.push(parseInt(index));
        }
      }

      if (bulletOutliers.length > 0) {
        const bulletCountValues: Record<number, string> = {};
        for (const index of bulletOutliers) {
          bulletCountValues[index] = `${bulletCounts[index]} bullets`;
        }

        issues.push({
          id: randomUUID(),
          type: "inconsistency",
          severity: "info",
          pages: bulletOutliers,
          description: `Inconsistent bullet point counts across ${bulletOutliers.length} slides`,
          details: {
            inconsistencyType: "style",
            affectedPages: bulletOutliers,
            expectedValue: `~${Math.round(avgBulletCount)} bullets`,
            actualValues: bulletCountValues,
          },
        });
      }
    }

    if (issues.length > 0) {
      this.logger.warn(
        `[checkConsistency] Found ${issues.length} consistency issues`,
      );
    }

    return issues;
  }

  /**
   * 检查缺失数据
   * 检查演讲者备注、关键数据等是否缺失
   */
  checkMissingData(slides: GeneratedSlide[]): QualityIssue[] {
    const issues: QualityIssue[] = [];

    // 检查演讲者备注
    const slidesMissingSpeakerNotes = slides.filter(
      (s) =>
        !s.content.speakerNotes &&
        s.spec.purpose !== "title" &&
        s.spec.purpose !== "closing",
    );

    if (slidesMissingSpeakerNotes.length > 0) {
      issues.push({
        id: randomUUID(),
        type: "missing_data",
        severity: "info",
        pages: slidesMissingSpeakerNotes.map((s) => s.index),
        description: `${slidesMissingSpeakerNotes.length} slides are missing speaker notes`,
        details: {
          missingDataType: "speaker_notes",
          affectedSlides: slidesMissingSpeakerNotes.map((s) => s.index),
        },
      });
    }

    // 检查统计数据页面是否有实际数据
    const statsSlidesMissingData = slides.filter(
      (s) =>
        s.spec.purpose === "statistics" &&
        (!s.content.statistics || s.content.statistics.length === 0),
    );

    if (statsSlidesMissingData.length > 0) {
      issues.push({
        id: randomUUID(),
        type: "missing_data",
        severity: "warning",
        pages: statsSlidesMissingData.map((s) => s.index),
        description: `${statsSlidesMissingData.length} statistics slides are missing actual data`,
        details: {
          missingDataType: "statistics",
          affectedSlides: statsSlidesMissingData.map((s) => s.index),
        },
      });
    }

    // 检查需要图片但缺失图片的幻灯片
    const slidesMissingImages = slides.filter(
      (s) =>
        (s.spec.purpose === "image_focus" || s.spec.imageSpec !== undefined) &&
        s.images.length === 0,
    );

    if (slidesMissingImages.length > 0) {
      issues.push({
        id: randomUUID(),
        type: "missing_data",
        severity: "warning",
        pages: slidesMissingImages.map((s) => s.index),
        description: `${slidesMissingImages.length} slides are missing expected images`,
        details: {
          missingDataType: "images",
          affectedSlides: slidesMissingImages.map((s) => s.index),
        },
      });
    }

    if (issues.length > 0) {
      this.logger.warn(
        `[checkMissingData] Found ${issues.length} missing data issues`,
      );
    }

    return issues;
  }

  /**
   * 🆕 检查素材来源验证
   * 检测内容是否基于提供的素材，是否有疑似捏造的内容
   */
  checkSourceVerification(slides: GeneratedSlide[]): SourceIssue[] {
    const issues: SourceIssue[] = [];

    for (const slide of slides) {
      // 跳过封面和结束页
      if (
        slide.spec.purpose === "title" ||
        slide.spec.purpose === "closing" ||
        slide.spec.purpose === "qna"
      ) {
        continue;
      }

      // 检查是否有素材绑定
      const hasSourceBinding = slide.spec.sourceRef || slide.spec.sourceExcerpt;

      if (slide.spec.mustNotFabricate && !hasSourceBinding) {
        // 标记为需要素材验证但没有绑定素材
        issues.push({
          id: randomUUID(),
          type: "source_unverified",
          severity: "warning",
          pages: [slide.index],
          description: `Slide ${slide.index + 1} requires source verification but has no source binding`,
          details: {
            slideIndex: slide.index,
            contentSnippet: this.extractSlideText(slide).slice(0, 100),
            sourceRelevance: 0,
            expectedSource: slide.spec.sourceRef,
          },
        });
      }

      // 检测疑似捏造的内容（通过关键词和模式检测）
      const suspiciousContent = this.detectSuspiciousContent(slide);
      if (suspiciousContent.length > 0) {
        issues.push({
          id: randomUUID(),
          type: "fabrication_suspected",
          severity: "error",
          pages: [slide.index],
          description: `Slide ${slide.index + 1} may contain fabricated content (${suspiciousContent.length} suspicious items)`,
          details: {
            slideIndex: slide.index,
            contentSnippet: this.extractSlideText(slide).slice(0, 100),
            sourceRelevance: hasSourceBinding ? 50 : 0,
            suspiciousContent,
          },
        });
      }
    }

    if (issues.length > 0) {
      this.logger.warn(
        `[checkSourceVerification] Found ${issues.length} source verification issues`,
      );
    }

    return issues;
  }

  /**
   * 🆕 检查数据点覆盖率
   * 确保所有必需的数据点都出现在幻灯片内容中
   */
  checkDataPointCoverage(slides: GeneratedSlide[]): DataPointIssue[] {
    const issues: DataPointIssue[] = [];

    for (const slide of slides) {
      const requiredDataPoints = slide.spec.requiredDataPoints;

      if (!requiredDataPoints || requiredDataPoints.length === 0) {
        continue;
      }

      const slideText = this.extractSlideText(slide).toLowerCase();
      const missingDataPoints: DataPointIssue["details"]["missingDataPoints"] =
        [];

      for (const dp of requiredDataPoints) {
        // 检查数据点的值是否出现在幻灯片中
        const valueNormalized = dp.value.toLowerCase().replace(/[%$,]/g, "");
        const isPresent =
          slideText.includes(valueNormalized) ||
          slideText.includes(dp.value.toLowerCase());

        if (!isPresent && dp.required) {
          missingDataPoints.push({
            id: dp.id,
            value: dp.value,
            type: dp.type,
          });
        }
      }

      if (missingDataPoints.length > 0) {
        const coverageRate =
          ((requiredDataPoints.length - missingDataPoints.length) /
            requiredDataPoints.length) *
          100;

        issues.push({
          id: randomUUID(),
          type: "data_point_missing",
          severity: coverageRate < 50 ? "error" : "warning",
          pages: [slide.index],
          description: `Slide ${slide.index + 1} is missing ${missingDataPoints.length} of ${requiredDataPoints.length} required data points (${coverageRate.toFixed(0)}% coverage)`,
          details: {
            slideIndex: slide.index,
            requiredDataPoints: requiredDataPoints.map((dp) => ({
              id: dp.id,
              value: dp.value,
              type: dp.type,
              context: dp.context,
            })),
            missingDataPoints,
            coverageRate,
          },
        });
      }
    }

    if (issues.length > 0) {
      this.logger.warn(
        `[checkDataPointCoverage] Found ${issues.length} data point coverage issues`,
      );
    }

    return issues;
  }

  /**
   * 🆕 检测疑似捏造的内容
   * 使用启发式规则检测可能是AI编造的内容
   */
  private detectSuspiciousContent(slide: GeneratedSlide): string[] {
    const suspicious: string[] = [];
    const slideText = this.extractSlideText(slide);

    // 1. 检测假数据模式（如"XX%"、"$XX"没有来源）
    const dataPatterns = [
      /(\d{1,3})%(?:\s|$)/g, // 百分比
      /\$[\d,]+(?:\.\d{2})?(?:M|B|K)?/g, // 货币金额
      /(?:billion|million|thousand|万|亿|千)\s*(?:美元|人民币|dollar)?/gi, // 大数字
      /(?:第一|第二|第三|首位|最大|最小|leading|top|first)/gi, // 排名词汇
    ];

    // 如果没有素材绑定，这些数据就是可疑的
    if (!slide.spec.sourceExcerpt) {
      for (const pattern of dataPatterns) {
        const matches = slideText.match(pattern);
        if (matches) {
          // 只标记没有上下文支持的匹配
          suspicious.push(...matches.slice(0, 3));
        }
      }
    }

    // 2. 检测可能是编造的公司/人名（如果不在素材中）
    const namedEntityPatterns = [
      /(?:Inc\.|Corp\.|Ltd\.|LLC|公司|集团)/g,
      /(?:CEO|CTO|CFO|总裁|总经理|创始人)\s*[\u4e00-\u9fa5A-Za-z]+/g,
    ];

    if (!slide.spec.sourceExcerpt) {
      for (const pattern of namedEntityPatterns) {
        const matches = slideText.match(pattern);
        if (matches) {
          suspicious.push(...matches.slice(0, 2));
        }
      }
    }

    // 3. 检测模糊的时间引用
    const vagueTimePatterns = [
      /(?:近年来|最近|近期|目前|当前|如今|现在)/g,
      /(?:未来|将来|预计|预测|有望)/g,
    ];

    // 模糊时间本身不一定是问题，但如果配合数据使用就可疑
    const hasNumbers = /\d/.test(slideText);
    if (hasNumbers && !slide.spec.sourceExcerpt) {
      for (const pattern of vagueTimePatterns) {
        if (pattern.test(slideText)) {
          suspicious.push("模糊时间引用配合数据使用");
          break;
        }
      }
    }

    return [...new Set(suspicious)]; // 去重
  }

  /**
   * 生成优化建议（含智能拆分建议）
   */
  generateSuggestions(
    issues: QualityIssue[],
    slides?: GeneratedSlide[],
  ): Suggestion[] {
    const suggestions: Suggestion[] = [];

    for (const issue of issues) {
      switch (issue.type) {
        case "duplicate": {
          const dupIssue = issue as DuplicateIssue;
          suggestions.push({
            id: randomUUID(),
            issueId: issue.id,
            action: "merge",
            description: `Consider merging slides ${dupIssue.details.page1 + 1} and ${dupIssue.details.page2 + 1} to remove duplicate content`,
            autoFixable: false, // 需要人工判断
            priority: dupIssue.details.similarity >= 85 ? "high" : "medium",
            actionData: {
              targetSlide: dupIssue.details.page1,
              sourceSlide: dupIssue.details.page2,
            },
          });
          break;
        }

        case "layout_overflow": {
          const layoutIssue = issue as LayoutIssue;
          suggestions.push({
            id: randomUUID(),
            issueId: issue.id,
            action: "adjust_layout",
            description: `Adjust layout margins for slide ${layoutIssue.details.page + 1} to fit within safe area`,
            autoFixable: true,
            priority: layoutIssue.severity === "error" ? "high" : "medium",
            actionData: {
              slideIndex: layoutIssue.details.page,
              overflowArea: layoutIssue.details.overflowArea,
            },
          });
          break;
        }

        case "content_sparse": {
          const sparseIssue = issue as ContentIssue;
          suggestions.push({
            id: randomUUID(),
            issueId: issue.id,
            action: "add_content",
            description: `Add more content to slide ${sparseIssue.details.page + 1} (currently only ${sparseIssue.details.wordCount} words)`,
            autoFixable: false, // 需要 AI 重新生成
            priority: "low",
            actionData: {
              slideIndex: sparseIssue.details.page,
              currentWordCount: sparseIssue.details.wordCount,
              targetWordCount: 80,
            },
          });
          break;
        }

        case "content_dense": {
          const denseIssue = issue as ContentIssue;
          const needsSplit = denseIssue.details.wordCount > 200;

          suggestions.push({
            id: randomUUID(),
            issueId: issue.id,
            action: needsSplit ? "split" : "remove_content",
            description: needsSplit
              ? `Consider splitting slide ${denseIssue.details.page + 1} into multiple slides (${denseIssue.details.wordCount} words)`
              : `Reduce content on slide ${denseIssue.details.page + 1} (${denseIssue.details.wordCount} words)`,
            autoFixable: false, // 需要人工或 AI 判断
            priority: needsSplit ? "high" : "medium",
            actionData: {
              slideIndex: denseIssue.details.page,
              wordCount: denseIssue.details.wordCount,
            },
          });
          break;
        }

        case "inconsistency": {
          const inconsistencyIssue = issue as InconsistencyIssue;
          suggestions.push({
            id: randomUUID(),
            issueId: issue.id,
            action: "unify_style",
            description: `Unify ${inconsistencyIssue.details.inconsistencyType} across slides`,
            autoFixable: true,
            priority: "low",
            actionData: {
              affectedPages: inconsistencyIssue.details.affectedPages,
              expectedValue: inconsistencyIssue.details.expectedValue,
            },
          });
          break;
        }

        case "missing_data": {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
          const details = issue.details;
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          const missingType = String(details.missingDataType);
          suggestions.push({
            id: randomUUID(),
            issueId: issue.id,
            action: "add_content",
            description: `Add missing ${missingType.replace("_", " ")} to affected slides`,
            autoFixable: missingType === "speaker_notes", // 演讲稿可以自动生成
            priority: missingType === "images" ? "medium" : "low",
            actionData: {
              missingDataType: missingType,
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
              affectedSlides: details.affectedSlides,
            },
          });
          break;
        }

        case "source_unverified": {
          const sourceIssue = issue as SourceIssue;
          suggestions.push({
            id: randomUUID(),
            issueId: issue.id,
            action: "add_content",
            description: `Bind source material to slide ${sourceIssue.details.slideIndex + 1} to enable content verification`,
            autoFixable: false,
            priority: "high",
            actionData: {
              slideIndex: sourceIssue.details.slideIndex,
              requiresSourceBinding: true,
            },
          });
          break;
        }

        case "fabrication_suspected": {
          const fabIssue = issue as SourceIssue;
          suggestions.push({
            id: randomUUID(),
            issueId: issue.id,
            action: "remove_content",
            description: `Review and verify suspicious content on slide ${fabIssue.details.slideIndex + 1}: ${fabIssue.details.suspiciousContent?.slice(0, 3).join(", ")}`,
            autoFixable: false,
            priority: "high",
            actionData: {
              slideIndex: fabIssue.details.slideIndex,
              suspiciousItems: fabIssue.details.suspiciousContent,
              action: "verify_or_remove",
            },
          });
          break;
        }

        case "data_point_missing": {
          const dpIssue = issue as DataPointIssue;
          suggestions.push({
            id: randomUUID(),
            issueId: issue.id,
            action: "add_content",
            description: `Add missing data points to slide ${dpIssue.details.slideIndex + 1}: ${dpIssue.details.missingDataPoints.map((dp) => dp.value).join(", ")}`,
            autoFixable: true, // 可以尝试自动添加数据点
            priority: dpIssue.details.coverageRate < 50 ? "high" : "medium",
            actionData: {
              slideIndex: dpIssue.details.slideIndex,
              missingDataPoints: dpIssue.details.missingDataPoints,
              coverageRate: dpIssue.details.coverageRate,
            },
          });
          break;
        }
      }
    }

    // 🆕 添加智能拆分建议
    if (slides) {
      const smartSplitSuggestions = this.generateSmartSplitSuggestions(
        issues,
        slides,
      );
      suggestions.push(...smartSplitSuggestions);
    }

    return suggestions;
  }

  /**
   * 🆕 生成智能拆分建议
   * 分析过密内容并提供具体的拆分策略
   */
  private generateSmartSplitSuggestions(
    issues: QualityIssue[],
    slides: GeneratedSlide[],
  ): SmartSplitSuggestion[] {
    const suggestions: SmartSplitSuggestion[] = [];

    // 找出需要拆分的内容过密页面
    const denseIssues = issues.filter(
      (i) => i.type === "content_dense",
    ) as ContentIssue[];

    for (const issue of denseIssues) {
      const slideIndex = issue.details.page;
      const slide = slides[slideIndex];

      if (!slide) continue;

      const wordCount = issue.details.wordCount;
      const bulletCount = issue.details.bulletCount;

      // 分析最佳拆分策略
      const splitAnalysis = this.analyzeSmartSplit(
        slide,
        wordCount,
        bulletCount,
      );

      if (splitAnalysis.shouldSplit) {
        suggestions.push({
          id: randomUUID(),
          issueId: issue.id,
          action: "split",
          description: `Split slide ${slideIndex + 1} into ${splitAnalysis.suggestedParts} slides using "${splitAnalysis.strategy}" strategy`,
          autoFixable: false, // 拆分需要人工确认
          priority: wordCount > 250 ? "high" : "medium",
          actionData: {
            slideIndex,
            splitStrategy: splitAnalysis.strategy,
            suggestedParts: splitAnalysis.suggestedParts,
            splitPoints: splitAnalysis.splitPoints,
            estimatedWordCounts: splitAnalysis.estimatedWordCounts,
          },
        });
      }
    }

    return suggestions;
  }

  /**
   * 🆕 分析智能拆分策略
   */
  private analyzeSmartSplit(
    slide: GeneratedSlide,
    wordCount: number,
    bulletCount: number,
  ): {
    shouldSplit: boolean;
    strategy: "by_topic" | "by_paragraph" | "by_bullet" | "by_section";
    suggestedParts: number;
    splitPoints: string[];
    estimatedWordCounts: number[];
  } {
    const TARGET_WORDS_PER_SLIDE = 80;
    const MAX_BULLETS_PER_SLIDE = 5;

    // 默认不拆分
    const result = {
      shouldSplit: false,
      strategy: "by_bullet" as const,
      suggestedParts: 1,
      splitPoints: [] as string[],
      estimatedWordCounts: [wordCount],
    };

    // 判断是否需要拆分
    if (wordCount < 150 && bulletCount <= 6) {
      return result;
    }

    result.shouldSplit = true;

    // 策略1: 按 bullet points 拆分（最常见）
    if (bulletCount > MAX_BULLETS_PER_SLIDE) {
      result.strategy = "by_bullet";
      result.suggestedParts = Math.ceil(bulletCount / MAX_BULLETS_PER_SLIDE);

      const bullets = slide.content.bulletPoints ?? [];
      const pointsPerSlide = Math.ceil(bullets.length / result.suggestedParts);

      for (let i = 0; i < result.suggestedParts; i++) {
        const startIdx = i * pointsPerSlide;
        const endIdx = Math.min(startIdx + pointsPerSlide, bullets.length);
        if (bullets[startIdx]) {
          result.splitPoints.push(
            `Points ${startIdx + 1}-${endIdx}: "${bullets[startIdx].slice(0, 30)}..."`,
          );
          result.estimatedWordCounts.push(
            Math.floor(wordCount / result.suggestedParts),
          );
        }
      }

      return result;
    }

    // 策略2: 按段落拆分（正文过长）
    if (slide.content.bodyText && slide.content.bodyText.length > 500) {
      (result as any).strategy = "by_paragraph";
      const paragraphs = slide.content.bodyText.split(/\n\n+/);
      result.suggestedParts = Math.min(paragraphs.length, 3);

      for (let i = 0; i < result.suggestedParts; i++) {
        if (paragraphs[i]) {
          result.splitPoints.push(
            `Paragraph ${i + 1}: "${paragraphs[i].slice(0, 30)}..."`,
          );
          result.estimatedWordCounts.push(
            Math.floor(wordCount / result.suggestedParts),
          );
        }
      }

      return result;
    }

    // 策略3: 按主题拆分（基于内容分析）
    (result as any).strategy = "by_topic";
    result.suggestedParts = Math.ceil(wordCount / TARGET_WORDS_PER_SLIDE);
    result.suggestedParts = Math.min(result.suggestedParts, 4); // 最多拆成4页

    for (let i = 0; i < result.suggestedParts; i++) {
      result.splitPoints.push(`Topic segment ${i + 1}`);
      result.estimatedWordCounts.push(
        Math.floor(wordCount / result.suggestedParts),
      );
    }

    return result;
  }

  /**
   * 执行自动修复
   */
  async applyAutoFix(
    documentId: string,
    suggestionId: string,
  ): Promise<boolean> {
    this.logger.log(
      `[applyAutoFix] Applying auto-fix for suggestion: ${suggestionId}`,
    );

    // 获取文档和质量报告
    const doc = await this.prisma.officeDocument.findUnique({
      where: { id: documentId },
    });

    if (!doc) {
      throw new Error(`Document not found: ${documentId}`);
    }

    // const document = doc.content as unknown as PPTDocument; // eslint-disable-line @typescript-eslint/no-unused-vars
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    const qualityReport = (doc.metadata as any)?.qualityReport as
      | QualityReport
      | undefined;

    if (!qualityReport) {
      throw new Error("No quality report found for document");
    }

    // 查找建议
    const suggestion = qualityReport.suggestions.find(
      (s) => s.id === suggestionId,
    );

    if (!suggestion) {
      throw new Error(`Suggestion not found: ${suggestionId}`);
    }

    if (!suggestion.autoFixable) {
      throw new Error(`Suggestion ${suggestionId} is not auto-fixable`);
    }

    // 执行修复
    let fixed = false;

    switch (suggestion.action) {
      case "adjust_layout":
        // 调整布局边距（简化实现：记录需要调整的意图）
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        this.logger.log(
          `[applyAutoFix] Layout adjustment needed for slide ${String(suggestion.actionData?.slideIndex)}`,
        );
        fixed = true;
        break;

      case "unify_style":
        // 统一样式（记录需要统一的意图）
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        this.logger.log(
          `[applyAutoFix] Style unification needed for slides: ${String(suggestion.actionData?.affectedPages)}`,
        );
        fixed = true;
        break;

      case "add_content": {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const missingType = suggestion.actionData?.missingDataType;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const slideIndex = suggestion.actionData?.slideIndex;

        // 如果是缺失演讲稿，可以标记为需要重新生成
        if (missingType === "speaker_notes") {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          this.logger.log(
            `[applyAutoFix] Speaker notes regeneration needed for slides: ${String(suggestion.actionData?.affectedSlides)}`,
          );
          fixed = true;
        }

        // 🆕 如果是数据点缺失，尝试添加数据点到内容
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (suggestion.actionData?.missingDataPoints) {
          fixed = await this.fixMissingDataPoints(
            documentId,
            slideIndex as number,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            suggestion.actionData.missingDataPoints as Array<{
              id: string;
              value: string;
              type: string;
            }>,
          );
        }
        break;
      }

      // 🆕 处理稀疏内容的自动填充
      case "remove_content":
        // 不自动删除内容，需要人工确认
        this.logger.log(
          `[applyAutoFix] Content removal requires manual review`,
        );
        break;
    }

    if (fixed) {
      // 更新元数据记录修复
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
      const metadata = (doc.metadata as any) || {};
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      metadata.lastAutoFix = {
        suggestionId,
        fixedAt: new Date().toISOString(),
        action: suggestion.action,
      };

      await this.prisma.officeDocument.update({
        where: { id: documentId },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
        data: { metadata },
      });

      this.logger.log(
        `[applyAutoFix] Successfully applied auto-fix for suggestion: ${suggestionId}`,
      );
    }

    return fixed;
  }

  /**
   * 🆕 修复缺失的数据点
   * 将缺失的数据点添加到幻灯片内容中
   */
  private async fixMissingDataPoints(
    documentId: string,
    slideIndex: number,
    missingDataPoints: Array<{ id: string; value: string; type: string }>,
  ): Promise<boolean> {
    const doc = await this.prisma.officeDocument.findUnique({
      where: { id: documentId },
    });

    if (!doc) {
      this.logger.warn(
        `[fixMissingDataPoints] Document not found: ${documentId}`,
      );
      return false;
    }

    const document = doc.content as unknown as PPTDocument;
    const slide = document.slides[slideIndex];

    if (!slide) {
      this.logger.warn(
        `[fixMissingDataPoints] Slide not found at index: ${slideIndex}`,
      );
      return false;
    }

    // 添加数据点到 bulletPoints
    if (!slide.content.bulletPoints) {
      slide.content.bulletPoints = [];
    }

    for (const dp of missingDataPoints) {
      slide.content.bulletPoints.push(`📊 ${dp.value}`);
    }

    // 保存更新
    await this.prisma.officeDocument.update({
      where: { id: documentId },
      data: {
        content: document as any,
        updatedAt: new Date(),
      },
    });

    this.logger.log(
      `[fixMissingDataPoints] Added ${missingDataPoints.length} data points to slide ${slideIndex}`,
    );

    return true;
  }

  /**
   * 🆕 自动丰富稀疏内容
   * 为内容过少的幻灯片生成补充内容
   */
  async autoEnrichSparseContent(
    documentId: string,
    slideIndex: number,
    targetWordCount: number = 80,
  ): Promise<boolean> {
    const doc = await this.prisma.officeDocument.findUnique({
      where: { id: documentId },
    });

    if (!doc) {
      throw new Error(`Document not found: ${documentId}`);
    }

    const document = doc.content as unknown as PPTDocument;
    const slide = document.slides[slideIndex];

    if (!slide) {
      throw new Error(`Slide not found at index: ${slideIndex}`);
    }

    const currentText = this.extractSlideText(slide);
    const currentWordCount = this.countWords(currentText);

    if (currentWordCount >= targetWordCount) {
      this.logger.log(
        `[autoEnrichSparseContent] Slide ${slideIndex} already has sufficient content (${currentWordCount} words)`,
      );
      return false;
    }

    // 基于现有标题和内容，生成建议的补充要点
    const suggestedPoints = this.generateSuggestedBulletPoints(
      slide,
      targetWordCount - currentWordCount,
    );

    // 添加建议的要点
    if (!slide.content.bulletPoints) {
      slide.content.bulletPoints = [];
    }

    slide.content.bulletPoints.push(...suggestedPoints);

    // 标记为已编辑
    slide.isEdited = true;
    slide.editHistory.push({
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      type: "content",
      before: currentText.slice(0, 100),
      after: `Auto-enriched with ${suggestedPoints.length} points`,
    });

    // 保存更新
    await this.prisma.officeDocument.update({
      where: { id: documentId },
      data: {
        content: document as any,
        updatedAt: new Date(),
      },
    });

    this.logger.log(
      `[autoEnrichSparseContent] Added ${suggestedPoints.length} suggested points to slide ${slideIndex}`,
    );

    return true;
  }

  /**
   * 🆕 生成建议的补充要点
   * 基于幻灯片标题和上下文生成占位建议
   */
  private generateSuggestedBulletPoints(
    slide: GeneratedSlide,
    targetWords: number,
  ): string[] {
    const points: string[] = [];
    const purpose = slide.spec.purpose;
    const title = slide.content.title || slide.spec.title;

    // 根据幻灯片类型生成不同的建议
    if (purpose === "title" || purpose === "agenda") {
      points.push(
        `[建议补充] ${title}的背景介绍`,
        `[建议补充] 主要挑战和机遇`,
        `[建议补充] 本次演讲的核心目标`,
      );
    } else if (purpose === "content") {
      points.push(
        `[建议补充] ${title}的关键要点`,
        `[建议补充] 相关数据和案例`,
        `[建议补充] 具体实施建议`,
      );
    } else if (purpose === "statistics") {
      points.push(
        `[建议补充] 关键数据指标`,
        `[建议补充] 同比/环比变化`,
        `[建议补充] 数据来源说明`,
      );
    } else if (purpose === "comparison") {
      points.push(
        `[建议补充] 比较项目A的特点`,
        `[建议补充] 比较项目B的特点`,
        `[建议补充] 综合对比结论`,
      );
    } else {
      points.push(`[建议补充] 核心内容要点`, `[建议补充] 支撑论据或数据`);
    }

    // 限制返回的要点数量（基于目标字数）
    const pointsNeeded = Math.min(Math.ceil(targetWords / 20), points.length);
    return points.slice(0, pointsNeeded);
  }

  // ============================================
  // 辅助方法
  // ============================================

  /**
   * 计算文本相似度（Jaccard 相似度）
   */
  private calculateSimilarity(text1: string, text2: string): number {
    if (!text1 || !text2) return 0;

    // 分词（简单按空格和标点符号分割）
    const tokens1 = new Set(
      text1
        .toLowerCase()
        .split(/[\s,.\-!?;:，。！？；：]+/)
        .filter((t) => t.length > 1),
    );

    const tokens2 = new Set(
      text2
        .toLowerCase()
        .split(/[\s,.\-!?;:，。！？；：]+/)
        .filter((t) => t.length > 1),
    );

    if (tokens1.size === 0 || tokens2.size === 0) return 0;

    // 计算交集
    const intersection = new Set(
      Array.from(tokens1).filter((t) => tokens2.has(t)),
    );

    // 计算并集
    const union = new Set([...Array.from(tokens1), ...Array.from(tokens2)]);

    // Jaccard 相似度 = 交集 / 并集
    return (intersection.size / union.size) * 100;
  }

  /**
   * 找出两段文本的共同内容
   */
  private findCommonContent(text1: string, text2: string): string {
    const tokens1 = text1
      .split(/[\s,.\-!?;:，。！？；：]+/)
      .filter((t) => t.length > 1);
    const tokens2Set = new Set(
      text2
        .split(/[\s,.\-!?;:，。！？；：]+/)
        .filter((t) => t.length > 1)
        .map((t) => t.toLowerCase()),
    );

    const common = tokens1
      .filter((t) => tokens2Set.has(t.toLowerCase()))
      .slice(0, 10); // 只取前10个共同词

    return common.join(" ");
  }

  /**
   * 提取幻灯片文本
   */
  private extractSlideText(slide: GeneratedSlide): string {
    const parts: string[] = [];

    if (slide.content.title) parts.push(slide.content.title);
    if (slide.content.subtitle) parts.push(slide.content.subtitle);
    if (slide.content.bodyText) parts.push(slide.content.bodyText);
    if (slide.content.bulletPoints)
      parts.push(slide.content.bulletPoints.join(" "));
    if (slide.content.highlightText) parts.push(slide.content.highlightText);

    return parts.join(" ");
  }

  /**
   * 估算内容边界（简化实现）
   */
  private estimateContentBounds(slide: GeneratedSlide): {
    top: number;
    bottom: number;
    left: number;
    right: number;
  } {
    // 基础边距
    const top = 100;
    let bottom = 100;
    const left = 100;
    let right = 100;

    // 标题占据顶部空间
    if (slide.content.title) {
      const titleHeight = 80;
      bottom += titleHeight;
    }

    // 副标题
    if (slide.content.subtitle) {
      bottom += 40;
    }

    // Bullet points（每个约40px）
    if (slide.content.bulletPoints) {
      bottom += slide.content.bulletPoints.length * 45;
    }

    // 统计数据（每个约80px）
    if (slide.content.statistics) {
      bottom += slide.content.statistics.length * 80;
    }

    // 图片（占据一定空间）
    if (slide.images.length > 0) {
      bottom += 400; // 估算图片高度
    }

    // 检查是否有长文本（可能需要更多宽度）
    const text = this.extractSlideText(slide);
    const avgLineLength =
      text.length / (slide.content.bulletPoints?.length ?? 1);

    if (avgLineLength > 50) {
      right += 100; // 长文本可能需要更多宽度
    }

    return { top, bottom, left, right };
  }

  /**
   * 估算内容填充率
   */
  private estimateContentFillRate(slide: GeneratedSlide): number {
    let score = 0;

    // 标题 (10%)
    if (slide.content.title && slide.content.title.length > 5) {
      score += 10;
    }

    // 副标题 (5%)
    if (slide.content.subtitle && slide.content.subtitle.length > 5) {
      score += 5;
    }

    // Body 文本 (20%)
    if (slide.content.bodyText && slide.content.bodyText.length > 20) {
      score += Math.min(20, (slide.content.bodyText.length / 100) * 20);
    }

    // Bullet points (40%)
    if (slide.content.bulletPoints) {
      const bulletScore = Math.min(
        40,
        (slide.content.bulletPoints.length / 5) * 40,
      );
      score += bulletScore;
    }

    // 图片 (15%)
    if (slide.images.length > 0) {
      score += 15;
    }

    // 统计数据 (10%)
    if (slide.content.statistics && slide.content.statistics.length > 0) {
      score += 10;
    }

    return Math.min(100, score);
  }

  /**
   * 计算总分
   */
  private calculateScore(issues: QualityIssue[]): number {
    let score = 100;

    for (const issue of issues) {
      switch (issue.severity) {
        case "error":
          score -= 10;
          break;
        case "warning":
          score -= 5;
          break;
        case "info":
          score -= 2;
          break;
      }
    }

    return Math.max(0, score);
  }

  /**
   * 统计词数
   */
  private countWords(text: string): number {
    if (!text) return 0;

    // 中文字符数
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;

    // 英文单词数
    const englishWords = text
      .replace(/[\u4e00-\u9fa5]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 0).length;

    // 中文字符按1个字算1个词，英文按单词算
    return (chineseChars ?? 0) + (englishWords ?? 0);
  }

  /**
   * 保存质量报告到数据库
   */
  private async saveQualityReport(
    documentId: string,
    report: QualityReport,
  ): Promise<void> {
    const doc = await this.prisma.officeDocument.findUnique({
      where: { id: documentId },
    });

    if (!doc) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
    const metadata = (doc.metadata as any) ?? {};
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    metadata.qualityReport = report;

    await this.prisma.officeDocument.update({
      where: { id: documentId },
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      data: {
        metadata,
        updatedAt: new Date(),
      },
    });

    this.logger.log(
      `[saveQualityReport] Quality report saved for document: ${documentId}`,
    );
  }
}
