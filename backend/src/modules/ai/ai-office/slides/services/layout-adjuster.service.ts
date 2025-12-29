/**
 * Layout Adjuster Service
 *
 * Phase 5 - 布局调整服务
 *
 * 职责：
 * 1. 在生成后微调布局以确保视觉平衡
 * 2. 调整间距、字体大小、元素位置
 * 3. 确保整体一致性
 */

import { Injectable, Logger } from "@nestjs/common";
import {
  GeneratedSlide,
  GeneratedSlideContent,
  SlideSpec,
} from "../types/slides.types";

/**
 * 布局调整结果
 */
export interface LayoutAdjustment {
  /** 调整后的内容 */
  adjustedContent: GeneratedSlideContent;

  /** 调整说明 */
  adjustments: string[];

  /** 是否进行了调整 */
  hasAdjustments: boolean;
}

@Injectable()
export class LayoutAdjusterService {
  private readonly logger = new Logger(LayoutAdjusterService.name);

  /**
   * 调整单页布局
   */
  async adjustSlide(
    slide: GeneratedSlide,
    context: {
      previousSlides: GeneratedSlide[];
      totalSlides: number;
    },
  ): Promise<LayoutAdjustment> {
    const adjustments: string[] = [];
    const content = { ...slide.content };

    // 1. 调整标题长度
    const titleAdj = this.adjustTitleLength(content, slide.spec);
    if (titleAdj) {
      adjustments.push(titleAdj);
    }

    // 2. 调整要点数量
    const bulletAdj = this.adjustBulletPoints(content, slide.spec);
    if (bulletAdj) {
      adjustments.push(bulletAdj);
    }

    // 3. 调整内容密度
    const densityAdj = this.adjustContentDensity(content, slide.spec);
    if (densityAdj) {
      adjustments.push(densityAdj);
    }

    // 4. 确保一致性
    const consistencyAdj = this.ensureConsistency(
      content,
      context.previousSlides,
    );
    if (consistencyAdj) {
      adjustments.push(consistencyAdj);
    }

    return {
      adjustedContent: content,
      adjustments,
      hasAdjustments: adjustments.length > 0,
    };
  }

  /**
   * 批量调整所有幻灯片
   */
  async adjustAllSlides(slides: GeneratedSlide[]): Promise<LayoutAdjustment[]> {
    const startTime = Date.now();
    this.logger.log(`[adjustAllSlides] Adjusting ${slides.length} slides`);

    const results: LayoutAdjustment[] = [];

    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      const adjustment = await this.adjustSlide(slide, {
        previousSlides: slides.slice(0, i),
        totalSlides: slides.length,
      });

      results.push(adjustment);

      // 如果有调整，更新原始幻灯片
      if (adjustment.hasAdjustments) {
        slide.content = adjustment.adjustedContent;
        this.logger.debug(
          `[adjustAllSlides] Slide ${i}: ${adjustment.adjustments.join(", ")}`,
        );
      }
    }

    const elapsed = Date.now() - startTime;
    const totalAdjustments = results.reduce(
      (sum, r) => sum + r.adjustments.length,
      0,
    );

    this.logger.log(
      `[adjustAllSlides] Completed in ${elapsed}ms, made ${totalAdjustments} adjustments`,
    );

    return results;
  }

  // ============================================
  // 私有方法 - 调整逻辑
  // ============================================

  /**
   * 调整标题长度
   */
  private adjustTitleLength(
    content: GeneratedSlideContent,
    spec: SlideSpec,
  ): string | null {
    const maxLength = this.getMaxTitleLength(spec.layoutType);

    if (content.title.length > maxLength) {
      // 截断标题并添加省略号
      content.title = content.title.slice(0, maxLength - 3) + "...";
      return `Truncated title to ${maxLength} characters`;
    }

    return null;
  }

  /**
   * 获取最大标题长度
   */
  private getMaxTitleLength(layoutType: string): number {
    const lengthMap: Record<string, number> = {
      title_center: 80,
      title_subtitle: 60,
      text_only: 100,
      text_image_left: 50,
      text_image_right: 50,
      bullet_points: 60,
      cards_grid: 50,
    };

    return lengthMap[layoutType] || 70;
  }

  /**
   * 调整要点数量
   */
  private adjustBulletPoints(
    content: GeneratedSlideContent,
    spec: SlideSpec,
  ): string | null {
    const maxBullets = this.getMaxBullets(spec.layoutType);

    if (content.bulletPoints && content.bulletPoints.length > maxBullets) {
      const originalCount = content.bulletPoints.length;
      content.bulletPoints = content.bulletPoints.slice(0, maxBullets);
      return `Reduced bullet points from ${originalCount} to ${maxBullets}`;
    }

    return null;
  }

  /**
   * 获取最大要点数量
   */
  private getMaxBullets(layoutType: string): number {
    const bulletMap: Record<string, number> = {
      bullet_points: 6,
      two_columns: 8,
      three_columns: 9,
      cards_grid: 6,
      text_image_left: 4,
      text_image_right: 4,
    };

    return bulletMap[layoutType] || 5;
  }

  /**
   * 调整内容密度
   */
  private adjustContentDensity(
    content: GeneratedSlideContent,
    spec: SlideSpec,
  ): string | null {
    const maxWords = this.getMaxWords(spec.layoutType);
    let totalWords = 0;
    let adjusted = false;

    // 计算总字数
    if (content.bodyText) {
      totalWords += this.countWords(content.bodyText);
    }
    if (content.bulletPoints) {
      totalWords += content.bulletPoints.reduce(
        (sum, bullet) => sum + this.countWords(bullet),
        0,
      );
    }

    // 如果超过限制，缩短内容
    if (totalWords > maxWords) {
      if (content.bodyText) {
        const ratio = maxWords / totalWords;
        const targetLength = Math.floor(content.bodyText.length * ratio);
        content.bodyText = content.bodyText.slice(0, targetLength) + "...";
        adjusted = true;
      }
    }

    return adjusted ? `Reduced content density to fit ${maxWords} words` : null;
  }

  /**
   * 获取最大字数
   */
  private getMaxWords(layoutType: string): number {
    const wordMap: Record<string, number> = {
      text_only: 200,
      bullet_points: 150,
      text_image_left: 100,
      text_image_right: 100,
      two_columns: 120,
      quote_highlight: 50,
    };

    return wordMap[layoutType] || 150;
  }

  /**
   * 统计字数
   */
  private countWords(text: string): number {
    // 中英文混合计数
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishWords = text
      .replace(/[\u4e00-\u9fa5]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 0).length;

    return chineseChars + englishWords;
  }

  /**
   * 确保一致性
   */
  private ensureConsistency(
    _content: GeneratedSlideContent,
    previousSlides: GeneratedSlide[],
  ): string | null {
    if (previousSlides.length === 0) {
      return null;
    }

    // 检查语气一致性（简化版）
    // 在实际实现中，可以检查标点符号、格式等

    return null; // 暂不实现详细的一致性检查
  }
}
