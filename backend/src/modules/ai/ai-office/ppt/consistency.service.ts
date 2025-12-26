/**
 * PPT Consistency Service
 *
 * 一致性控制服务 - 确保 PPT 文档的全局样式一致性
 *
 * 职责：
 * 1. 应用全局样式配置到所有幻灯片
 * 2. 统一页眉、页脚、页码格式
 * 3. 检查并修复样式不一致
 * 4. 管理安全区约束
 * 5. 品牌一致性控制
 */

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import {
  PPTDocument,
  GeneratedSlide,
  PPTGlobalStyleConfig,
  DEFAULT_GLOBAL_STYLE,
  GeneratedSlideContent,
} from "./ppt.types";

// ============================================
// 类型定义
// ============================================

export interface ConsistencyCheckResult {
  isConsistent: boolean;
  issues: ConsistencyIssue[];
  fixedCount: number;
}

export interface ConsistencyIssue {
  slideIndex: number;
  type: "header" | "footer" | "pageNumber" | "safeArea" | "typography" | "brand";
  description: string;
  autoFixable: boolean;
}

export interface ApplyStyleOptions {
  /** 应用到的页码范围（默认全部） */
  pageRange?: "all" | number[];
  /** 是否跳过封面和结尾 */
  skipTitleAndClosing?: boolean;
  /** 是否强制覆盖已有样式 */
  forceOverwrite?: boolean;
}

// ============================================
// Service
// ============================================

@Injectable()
export class ConsistencyService {
  private readonly logger = new Logger(ConsistencyService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 应用全局样式到文档
   *
   * 这是核心方法，将 PPTGlobalStyleConfig 应用到所有幻灯片
   */
  async applyGlobalStyle(
    documentId: string,
    config: Partial<PPTGlobalStyleConfig>,
    options: ApplyStyleOptions = {},
  ): Promise<ConsistencyCheckResult> {
    this.logger.log(
      `[applyGlobalStyle] Applying global style to document: ${documentId}`,
    );

    // 获取文档
    const doc = await this.prisma.officeDocument.findUnique({
      where: { id: documentId },
    });

    if (!doc) {
      throw new Error(`Document not found: ${documentId}`);
    }

    const document = doc.content as unknown as PPTDocument;

    // 合并配置
    const fullConfig: PPTGlobalStyleConfig = {
      ...DEFAULT_GLOBAL_STYLE,
      ...config,
    };

    // 获取要应用的页码
    const pageIndices = this.getPageIndices(document, options);

    const issues: ConsistencyIssue[] = [];
    let fixedCount = 0;

    // 应用到每一页
    for (const index of pageIndices) {
      const slide = document.slides[index];
      if (!slide) continue;

      // 应用页眉
      if (fullConfig.header?.show) {
        this.applyHeader(slide, fullConfig, index);
        fixedCount++;
      }

      // 应用页脚
      if (fullConfig.footer.show) {
        this.applyFooter(slide, fullConfig, index, document.slides.length);
        fixedCount++;
      }

      // 应用安全区
      this.applySafeArea(slide, fullConfig);

      // 应用字体配置
      this.applyTypography(slide, fullConfig);
    }

    // 保存更新后的文档和全局样式
    await this.prisma.officeDocument.update({
      where: { id: documentId },
      data: {
        content: document as any,
        globalStyle: fullConfig as any,
        updatedAt: new Date(),
      },
    });

    this.logger.log(
      `[applyGlobalStyle] Applied style to ${pageIndices.length} slides, fixed ${fixedCount} items`,
    );

    return {
      isConsistent: issues.length === 0,
      issues,
      fixedCount,
    };
  }

  /**
   * 检查文档一致性
   */
  async checkConsistency(documentId: string): Promise<ConsistencyCheckResult> {
    this.logger.log(
      `[checkConsistency] Checking consistency for document: ${documentId}`,
    );

    const doc = await this.prisma.officeDocument.findUnique({
      where: { id: documentId },
    });

    if (!doc) {
      throw new Error(`Document not found: ${documentId}`);
    }

    const document = doc.content as unknown as PPTDocument;
    const globalStyle = (doc.globalStyle as unknown as PPTGlobalStyleConfig) || DEFAULT_GLOBAL_STYLE;

    const issues: ConsistencyIssue[] = [];

    // 检查每一页的一致性
    for (let i = 0; i < document.slides.length; i++) {
      const slide = document.slides[i];

      // 检查页脚
      if (globalStyle.footer.show) {
        if (!slide.content.footer) {
          issues.push({
            slideIndex: i,
            type: "footer",
            description: `Slide ${i + 1} missing footer`,
            autoFixable: true,
          });
        }
      }

      // 检查页眉
      if (globalStyle.header?.show) {
        if (!slide.content.header) {
          issues.push({
            slideIndex: i,
            type: "header",
            description: `Slide ${i + 1} missing header`,
            autoFixable: true,
          });
        }
      }

      // 检查安全区
      if (!slide.content.safeArea) {
        issues.push({
          slideIndex: i,
          type: "safeArea",
          description: `Slide ${i + 1} missing safe area configuration`,
          autoFixable: true,
        });
      }
    }

    this.logger.log(
      `[checkConsistency] Found ${issues.length} consistency issues`,
    );

    return {
      isConsistent: issues.length === 0,
      issues,
      fixedCount: 0,
    };
  }

  /**
   * 自动修复一致性问题
   */
  async autoFixConsistency(documentId: string): Promise<ConsistencyCheckResult> {
    this.logger.log(
      `[autoFixConsistency] Auto-fixing consistency for document: ${documentId}`,
    );

    // 先检查
    const checkResult = await this.checkConsistency(documentId);

    if (checkResult.isConsistent) {
      return checkResult;
    }

    // 获取全局样式
    const doc = await this.prisma.officeDocument.findUnique({
      where: { id: documentId },
    });

    if (!doc) {
      throw new Error(`Document not found: ${documentId}`);
    }

    const globalStyle = (doc.globalStyle as unknown as PPTGlobalStyleConfig) || DEFAULT_GLOBAL_STYLE;

    // 应用全局样式来修复问题
    return this.applyGlobalStyle(documentId, globalStyle, {
      forceOverwrite: true,
    });
  }

  /**
   * 获取文档的全局样式配置
   */
  async getGlobalStyle(documentId: string): Promise<PPTGlobalStyleConfig> {
    const doc = await this.prisma.officeDocument.findUnique({
      where: { id: documentId },
      select: { globalStyle: true },
    });

    if (!doc || !doc.globalStyle) {
      return DEFAULT_GLOBAL_STYLE;
    }

    return {
      ...DEFAULT_GLOBAL_STYLE,
      ...(doc.globalStyle as unknown as Partial<PPTGlobalStyleConfig>),
    };
  }

  /**
   * 更新全局样式配置（不立即应用）
   */
  async updateGlobalStyle(
    documentId: string,
    config: Partial<PPTGlobalStyleConfig>,
  ): Promise<PPTGlobalStyleConfig> {
    const currentStyle = await this.getGlobalStyle(documentId);
    const newStyle: PPTGlobalStyleConfig = {
      ...currentStyle,
      ...config,
    };

    await this.prisma.officeDocument.update({
      where: { id: documentId },
      data: {
        globalStyle: newStyle as any,
        updatedAt: new Date(),
      },
    });

    this.logger.log(
      `[updateGlobalStyle] Updated global style for document: ${documentId}`,
    );

    return newStyle;
  }

  // ============================================
  // 私有方法 - 样式应用
  // ============================================

  /**
   * 应用页眉
   */
  private applyHeader(
    slide: GeneratedSlide,
    config: PPTGlobalStyleConfig,
    _slideIndex: number,
  ): void {
    if (!config.header?.show) return;

    const content = slide.content as GeneratedSlideContent & {
      header?: {
        text: string;
        position: string;
        style?: any;
      };
    };

    content.header = {
      text: config.header.content,
      position: config.header.position,
      style: config.header.style,
    };
  }

  /**
   * 应用页脚
   */
  private applyFooter(
    slide: GeneratedSlide,
    config: PPTGlobalStyleConfig,
    slideIndex: number,
    totalSlides: number,
  ): void {
    if (!config.footer.show) return;

    // 格式化页脚文本
    let footerText = config.footer.format;

    // 替换页码
    if (config.pageNumber.format === "chinese") {
      footerText = footerText.replace("{page}", `第${slideIndex + 1}页`);
    } else if (config.pageNumber.format === "roman") {
      footerText = footerText.replace("{page}", this.toRoman(slideIndex + 1));
    } else {
      footerText = footerText.replace("{page}", String(slideIndex + 1));
    }

    // 替换总页数
    footerText = footerText.replace("{total}", String(totalSlides));

    // 替换图标
    footerText = footerText.replace("{icon}", config.footer.icon || "");

    // 替换品牌
    footerText = footerText.replace("{brand}", config.footer.brand || config.brand?.name || "");

    const content = slide.content as GeneratedSlideContent & {
      footer?: {
        text: string;
        position: string;
        style?: any;
      };
    };

    content.footer = {
      text: footerText.trim(),
      position: config.footer.position,
      style: config.footer.style,
    };
  }

  /**
   * 应用安全区配置
   */
  private applySafeArea(
    slide: GeneratedSlide,
    config: PPTGlobalStyleConfig,
  ): void {
    const content = slide.content as GeneratedSlideContent & {
      safeArea?: {
        top: number;
        bottom: number;
        left: number;
        right: number;
      };
    };

    content.safeArea = {
      top: config.safeArea.top,
      bottom: config.safeArea.bottom,
      left: config.safeArea.left,
      right: config.safeArea.right,
    };
  }

  /**
   * 应用字体配置（记录到内容中，供渲染使用）
   */
  private applyTypography(
    slide: GeneratedSlide,
    config: PPTGlobalStyleConfig,
  ): void {
    const content = slide.content as GeneratedSlideContent & {
      typography?: {
        headingFont: string;
        bodyFont: string;
        monoFont?: string;
      };
    };

    content.typography = {
      headingFont: config.typography.headingFont,
      bodyFont: config.typography.bodyFont,
      monoFont: config.typography.monoFont,
    };
  }

  // ============================================
  // 辅助方法
  // ============================================

  /**
   * 获取要应用样式的页码索引
   */
  private getPageIndices(
    document: PPTDocument,
    options: ApplyStyleOptions,
  ): number[] {
    let indices: number[];

    if (options.pageRange === "all" || !options.pageRange) {
      indices = document.slides.map((_, i) => i);
    } else {
      indices = options.pageRange
        .filter((p) => p >= 1 && p <= document.slides.length)
        .map((p) => p - 1);
    }

    // 跳过封面和结尾
    if (options.skipTitleAndClosing) {
      indices = indices.filter((i) => {
        const slide = document.slides[i];
        return (
          slide.spec.purpose !== "title" &&
          slide.spec.purpose !== "closing" &&
          slide.spec.purpose !== "qna"
        );
      });
    }

    return indices;
  }

  /**
   * 数字转罗马数字
   */
  private toRoman(num: number): string {
    const romanNumerals: [number, string][] = [
      [1000, "M"],
      [900, "CM"],
      [500, "D"],
      [400, "CD"],
      [100, "C"],
      [90, "XC"],
      [50, "L"],
      [40, "XL"],
      [10, "X"],
      [9, "IX"],
      [5, "V"],
      [4, "IV"],
      [1, "I"],
    ];

    let result = "";
    for (const [value, symbol] of romanNumerals) {
      while (num >= value) {
        result += symbol;
        num -= value;
      }
    }
    return result;
  }
}
