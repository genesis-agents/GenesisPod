/**
 * PPT Batch Operation Service
 *
 * 批量样式操作服务 - AI Office 3.0
 *
 * 职责：
 * 1. 批量更新页脚、页眉、背景、主题等样式
 * 2. 管理全局样式配置（safeArea、brand、typography）
 * 3. 支持格式化字符串（{page}、{icon}、{brand}）
 * 4. 保存和读取全局样式配置
 */

import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { PPTDocument } from "./ppt.types";

// ============================================
// 批量操作类型定义
// ============================================

export type BatchOperation =
  | "update_footer"
  | "update_header"
  | "update_background"
  | "update_theme"
  | "update_font"
  | "update_safe_area"
  | "update_logo";

export interface BatchUpdateRequest {
  operation: BatchOperation;
  config: BatchConfig;
  pageRange: "all" | number[]; // 应用范围：'all' 或页码数组
}

export type BatchConfig =
  | FooterConfig
  | HeaderConfig
  | BackgroundConfig
  | SafeAreaConfig
  | GlobalStyleConfig;

// ============================================
// 配置类型定义
// ============================================

export interface FooterConfig {
  format: string; // "第{page}页 | {icon} {brand}"
  position: "bottom-left" | "bottom-center" | "bottom-right";
  style: TextStyle;
  icon?: string;
  brand?: string;
}

export interface HeaderConfig {
  content: string;
  position: "top-left" | "top-center" | "top-right";
  style: TextStyle;
}

export interface TextStyle {
  fontSize: number;
  fontFamily: string;
  color: string;
  fontWeight?: "normal" | "bold" | "lighter";
  fontStyle?: "normal" | "italic";
}

export interface SafeAreaConfig {
  top: number; // 顶部安全距离（px）
  bottom: number; // 底部安全距离（px）
  left: number; // 左侧安全距离（px）
  right: number; // 右侧安全距离（px）
}

export interface BackgroundConfig {
  type: "solid" | "gradient" | "image";
  color?: string;
  gradient?: {
    from: string;
    to: string;
    direction: "to-top" | "to-right" | "to-bottom" | "to-left" | "to-top-right";
  };
  imageUrl?: string;
}

export interface GlobalStyleConfig {
  header?: HeaderConfig;
  footer?: FooterConfig;
  pageNumber?: {
    show: boolean;
    format: string; // "{page}/{total}"
    position: "bottom-left" | "bottom-center" | "bottom-right";
  };
  safeArea?: SafeAreaConfig;
  brand?: {
    logo?: string; // Logo URL
    name: string;
    primaryColor: string;
  };
  typography?: {
    headingFont: string;
    bodyFont: string;
  };
}

/** 🆕 字体配置 */
export interface FontConfig {
  headingFont: string; // 标题字体
  bodyFont: string; // 正文字体
  headingSize?: number; // 标题字号
  bodySize?: number; // 正文字号
  lineHeight?: number; // 行高
  letterSpacing?: number; // 字间距
}

/** 🆕 Logo 配置 */
export interface LogoConfig {
  url: string; // Logo URL
  position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  width?: number; // Logo 宽度
  height?: number; // Logo 高度
  opacity?: number; // 透明度 0-1
}

export interface BatchUpdateResult {
  success: boolean;
  updatedPages: number;
  totalPages: number;
  errors?: Array<{
    page: number;
    error: string;
  }>;
}

// ============================================
// Service
// ============================================

@Injectable()
export class BatchOperationService {
  private readonly logger = new Logger(BatchOperationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 批量更新幻灯片样式
   */
  async batchUpdate(
    documentId: string,
    request: BatchUpdateRequest,
  ): Promise<BatchUpdateResult> {
    this.logger.log(
      `[batchUpdate] Starting ${request.operation} for document ${documentId}, pageRange: ${JSON.stringify(request.pageRange)}`,
    );

    // 获取文档
    const document = await this.getPPTDocument(documentId);

    // 获取页码索引
    const pageIndices = this.getPageIndices(document, request.pageRange);

    this.logger.log(
      `[batchUpdate] Processing ${pageIndices.length} pages: ${pageIndices.join(", ")}`,
    );

    const errors: Array<{ page: number; error: string }> = [];

    // 根据操作类型调用对应方法
    try {
      switch (request.operation) {
        case "update_footer":
          this.updateFooter(
            document,
            request.config as FooterConfig,
            pageIndices,
          );
          break;

        case "update_header":
          this.updateHeader(
            document,
            request.config as HeaderConfig,
            pageIndices,
          );
          break;

        case "update_background":
          this.updateBackground(
            document,
            request.config as BackgroundConfig,
            pageIndices,
          );
          break;

        case "update_safe_area":
          await this.updateSafeArea(
            document,
            request.config as SafeAreaConfig,
            pageIndices,
          );
          break;

        case "update_font":
          this.updateFont(
            document,
            request.config as FontConfig,
            pageIndices,
          );
          break;

        case "update_logo":
          this.updateLogo(
            document,
            request.config as LogoConfig,
            pageIndices,
          );
          break;

        default:
          throw new Error(`Unsupported operation: ${request.operation}`);
      }

      // 保存更新后的文档
      await this.savePPTDocument(document);

      this.logger.log(
        `[batchUpdate] Successfully updated ${pageIndices.length} pages`,
      );

      return {
        success: true,
        updatedPages: pageIndices.length,
        totalPages: document.slides.length,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`[batchUpdate] Failed: ${errorMessage}`, errorStack);
      throw error;
    }
  }

  /**
   * 批量更新页脚
   */
  private updateFooter(
    document: PPTDocument,
    config: FooterConfig,
    pageIndices: number[],
  ): void {
    this.logger.log(
      `[updateFooter] Applying footer to ${pageIndices.length} pages`,
    );

    for (const pageIndex of pageIndices) {
      const slide = document.slides[pageIndex];
      if (!slide) {
        this.logger.warn(`[updateFooter] Slide ${pageIndex} not found`);
        continue;
      }

      // 格式化页脚文本
      const footerText = this.formatFooterText(
        config.format,
        pageIndex + 1,
        config,
      );

      // 更新幻灯片内容（在 content 中添加 footer 字段）
      (slide.content as any).footer = {
        text: footerText,
        position: config.position,
        style: config.style,
      };

      this.logger.debug(
        `[updateFooter] Slide ${pageIndex}: "${footerText.slice(0, 50)}..."`,
      );
    }
  }

  /**
   * 批量更新页眉
   */
  private updateHeader(
    document: PPTDocument,
    config: HeaderConfig,
    pageIndices: number[],
  ): void {
    this.logger.log(
      `[updateHeader] Applying header to ${pageIndices.length} pages`,
    );

    for (const pageIndex of pageIndices) {
      const slide = document.slides[pageIndex];
      if (!slide) {
        this.logger.warn(`[updateHeader] Slide ${pageIndex} not found`);
        continue;
      }

      // 更新幻灯片内容
      (slide.content as any).header = {
        text: config.content,
        position: config.position,
        style: config.style,
      };

      this.logger.debug(
        `[updateHeader] Slide ${pageIndex}: "${config.content.slice(0, 50)}..."`,
      );
    }
  }

  /**
   * 批量更新背景
   */
  private updateBackground(
    document: PPTDocument,
    config: BackgroundConfig,
    pageIndices: number[],
  ): void {
    this.logger.log(
      `[updateBackground] Applying ${config.type} background to ${pageIndices.length} pages`,
    );

    for (const pageIndex of pageIndices) {
      const slide = document.slides[pageIndex];
      if (!slide) {
        this.logger.warn(`[updateBackground] Slide ${pageIndex} not found`);
        continue;
      }

      // 更新背景决策
      if (config.type === "solid") {
        slide.spec.backgroundDecision = {
          type: "solid",
          colors: {
            primary: config.color ?? document.theme.colors.background,
          },
          reasoning: "Batch update: solid color background",
        };
      } else if (config.type === "gradient") {
        slide.spec.backgroundDecision = {
          type: "gradient",
          colors: {
            primary: config.gradient?.from ?? document.theme.colors.primary,
            secondary: config.gradient?.to ?? document.theme.colors.secondary,
            direction: this.mapGradientDirection(config.gradient?.direction),
          },
          reasoning: "Batch update: gradient background",
        };
      } else if (config.type === "image" && config.imageUrl) {
        slide.spec.backgroundDecision = {
          type: "ai_generated",
          aiConfig: {
            prompt: `Background image from ${config.imageUrl}`,
            style: document.theme.style,
            colorTone: "vibrant",
            complexity: "moderate",
          },
          reasoning: "Batch update: custom image background",
        };

        // 添加背景图像到 images 数组
        const existingBgIndex = slide.images.findIndex(
          (img) => img.position === "background",
        );
        if (existingBgIndex >= 0) {
          slide.images[existingBgIndex].url = config.imageUrl;
        } else {
          slide.images.push({
            url: config.imageUrl,
            prompt: "Custom background",
            modelUsed: "manual",
            position: "background",
            width: 1920,
            height: 1080,
            generatedAt: new Date().toISOString(),
          });
        }
      }

      this.logger.debug(
        `[updateBackground] Slide ${pageIndex}: ${config.type}`,
      );
    }
  }

  /**
   * 批量更新安全区域
   */
  private async updateSafeArea(
    document: PPTDocument,
    config: SafeAreaConfig,
    pageIndices: number[],
  ): Promise<void> {
    this.logger.log(
      `[updateSafeArea] Applying safe area (top: ${config.top}, bottom: ${config.bottom}, left: ${config.left}, right: ${config.right}) to ${pageIndices.length} pages`,
    );

    for (const pageIndex of pageIndices) {
      const slide = document.slides[pageIndex];
      if (!slide) {
        this.logger.warn(`[updateSafeArea] Slide ${pageIndex} not found`);
        continue;
      }

      // 在 slide 内容中记录安全区域配置
      slide.content = {
        ...slide.content,
        safeArea: config,
      };

      this.logger.debug(
        `[updateSafeArea] Slide ${pageIndex}: safeArea applied`,
      );
    }

    // 同时保存到全局样式配置
    const globalStyle = await this.getGlobalStyle(document.id);
    await this.saveGlobalStyle(document.id, {
      ...globalStyle,
      safeArea: config,
    });
  }

  /**
   * 批量更新字体配置
   */
  private updateFont(
    document: PPTDocument,
    config: FontConfig,
    pageIndices: number[],
  ): void {
    this.logger.log(
      `[updateFont] Applying font config to ${pageIndices.length} pages`,
    );

    for (const pageIndex of pageIndices) {
      const slide = document.slides[pageIndex];
      if (!slide) {
        this.logger.warn(`[updateFont] Slide ${pageIndex} not found`);
        continue;
      }

      // 在 slide 内容中记录字体配置
      (slide.content as any).typography = {
        headingFont: config.headingFont,
        bodyFont: config.bodyFont,
        headingSize: config.headingSize,
        bodySize: config.bodySize,
        lineHeight: config.lineHeight,
        letterSpacing: config.letterSpacing,
      };

      this.logger.debug(
        `[updateFont] Slide ${pageIndex}: headingFont=${config.headingFont}, bodyFont=${config.bodyFont}`,
      );
    }

    // 同时更新文档级别的主题
    document.theme = {
      ...document.theme,
      fonts: {
        ...document.theme.fonts,
        heading: config.headingFont,
        body: config.bodyFont,
      },
    };
  }

  /**
   * 批量更新 Logo 配置
   */
  private updateLogo(
    document: PPTDocument,
    config: LogoConfig,
    pageIndices: number[],
  ): void {
    this.logger.log(
      `[updateLogo] Applying logo to ${pageIndices.length} pages at position ${config.position}`,
    );

    for (const pageIndex of pageIndices) {
      const slide = document.slides[pageIndex];
      if (!slide) {
        this.logger.warn(`[updateLogo] Slide ${pageIndex} not found`);
        continue;
      }

      // 在 slide 内容中记录 logo 配置
      (slide.content as any).logo = {
        url: config.url,
        position: config.position,
        width: config.width ?? 120,
        height: config.height ?? 40,
        opacity: config.opacity ?? 1,
      };

      this.logger.debug(
        `[updateLogo] Slide ${pageIndex}: logo at ${config.position}`,
      );
    }

    // 同时更新文档级别的品牌配置
    (document.theme as any).brand = {
      ...((document.theme as any).brand || {}),
      logo: config.url,
    };
  }

  /**
   * 保存全局样式配置
   */
  async saveGlobalStyle(
    documentId: string,
    config: GlobalStyleConfig,
  ): Promise<void> {
    this.logger.log(`[saveGlobalStyle] Saving global style for ${documentId}`);

    await this.prisma.officeDocument.update({
      where: { id: documentId },
      data: {
        globalStyle: config as any,
      },
    });

    this.logger.log(
      `[saveGlobalStyle] Global style saved: ${Object.keys(config).join(", ")}`,
    );
  }

  /**
   * 获取全局样式配置
   */
  async getGlobalStyle(documentId: string): Promise<GlobalStyleConfig | null> {
    const doc = await this.prisma.officeDocument.findUnique({
      where: { id: documentId },
      select: { globalStyle: true },
    });

    if (!doc || !doc.globalStyle) {
      return null;
    }

    return doc.globalStyle as unknown as GlobalStyleConfig;
  }

  // ============================================
  // Helper Methods
  // ============================================

  /**
   * 获取页码索引数组
   */
  private getPageIndices(
    document: PPTDocument,
    pageRange: "all" | number[],
  ): number[] {
    if (pageRange === "all") {
      // 返回所有页码（从 0 开始的索引）
      return document.slides.map((_, index) => index);
    }

    // 验证页码范围
    const maxPage = document.slides.length;
    const validIndices = pageRange
      .filter((page) => page >= 1 && page <= maxPage)
      .map((page) => page - 1); // 转换为 0-based index

    if (validIndices.length === 0) {
      throw new Error(
        `Invalid page range: ${pageRange.join(", ")}. Document has ${maxPage} pages.`,
      );
    }

    return validIndices;
  }

  /**
   * 格式化页脚文本
   * 支持占位符：{page}、{total}、{icon}、{brand}
   */
  private formatFooterText(
    format: string,
    pageNumber: number,
    config: FooterConfig,
  ): string {
    return format
      .replace(/\{page\}/g, pageNumber.toString())
      .replace(/\{icon\}/g, config.icon ?? "")
      .replace(/\{brand\}/g, config.brand ?? "");
  }

  /**
   * 映射渐变方向
   */
  private mapGradientDirection(
    direction?:
      | "to-top"
      | "to-right"
      | "to-bottom"
      | "to-left"
      | "to-top-right",
  ): "horizontal" | "vertical" | "diagonal" | "radial" {
    switch (direction) {
      case "to-right":
      case "to-left":
        return "horizontal";
      case "to-top":
      case "to-bottom":
        return "vertical";
      case "to-top-right":
        return "diagonal";
      default:
        return "vertical";
    }
  }

  /**
   * 获取 PPT 文档
   */
  private async getPPTDocument(documentId: string): Promise<PPTDocument> {
    const doc = await this.prisma.officeDocument.findUnique({
      where: { id: documentId },
    });

    if (!doc) {
      throw new NotFoundException(`PPT document not found: ${documentId}`);
    }

    if (doc.type !== "PPT") {
      throw new Error(`Document ${documentId} is not a PPT document`);
    }

    return doc.content as unknown as PPTDocument;
  }

  /**
   * 保存 PPT 文档
   */
  private async savePPTDocument(document: PPTDocument): Promise<void> {
    await this.prisma.officeDocument.update({
      where: { id: document.id },
      data: {
        content: document as any,
        updatedAt: new Date(),
      },
    });

    this.logger.log(`[savePPTDocument] Document saved: ${document.id}`);
  }
}
