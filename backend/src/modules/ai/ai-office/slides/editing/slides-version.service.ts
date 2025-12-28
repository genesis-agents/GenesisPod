/**
 * PPT Version Management Service
 *
 * AI Office 3.0 - 版本管理服务
 *
 * 功能：
 * 1. 自动保存版本（AI生成、用户编辑后）
 * 2. 手动保存版本
 * 3. 版本历史查询
 * 4. 版本回滚
 * 5. 版本对比（diff）
 */

import { Injectable, Logger } from "@nestjs/common";
import {
  PPTDocument,
  PPTVersion,
  GeneratedSlide,
  GeneratedSlideContent,
} from "../types/slides.types";

// ============================================
// 版本相关类型
// ============================================

export interface VersionCreateOptions {
  type: "auto" | "manual";
  trigger: "ai_generation" | "user_edit" | "manual_save" | "layout_change";
  description?: string;
}

export interface VersionInfo {
  id: string;
  timestamp: string;
  type: "auto" | "manual";
  trigger: string;
  description?: string;
  slideCount: number;
  wordCount: number;
  isCurrent: boolean;
}

export interface SlideDiff {
  slideIndex: number;
  slideId: string;
  changes: ContentChange[];
  hasImageChanges: boolean;
  hasLayoutChanges: boolean;
}

export interface ContentChange {
  field: string;
  type: "added" | "removed" | "modified";
  before?: string | string[];
  after?: string | string[];
}

export interface VersionDiff {
  fromVersionId: string;
  toVersionId: string;
  slideDiffs: SlideDiff[];
  addedSlides: number[];
  removedSlides: number[];
  summary: {
    totalChanges: number;
    contentChanges: number;
    imageChanges: number;
    layoutChanges: number;
    slidesAdded: number;
    slidesRemoved: number;
  };
}

export interface RollbackResult {
  success: boolean;
  document?: PPTDocument;
  previousVersionId: string;
  restoredVersionId: string;
  error?: string;
}

// ============================================
// 版本管理服务
// ============================================

@Injectable()
export class SlidesVersionService {
  private readonly logger = new Logger(SlidesVersionService.name);

  // 最大保留版本数
  private readonly MAX_VERSIONS = 50;
  // 自动保存版本间隔（毫秒）
  private readonly AUTO_SAVE_INTERVAL = 60000; // 1分钟

  /**
   * 创建新版本
   */
  createVersion(
    document: PPTDocument,
    options: VersionCreateOptions,
  ): PPTVersion {
    const versionId = `v-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    this.logger.log(
      `[createVersion] Creating ${options.type} version: ${versionId} (${options.trigger})`,
    );

    // 深拷贝当前幻灯片状态
    const slidesCopy: GeneratedSlide[] = JSON.parse(
      JSON.stringify(document.slides),
    );

    // 计算字数
    const wordCount = this.calculateWordCount(slidesCopy);

    const version: PPTVersion = {
      id: versionId,
      timestamp: new Date().toISOString(),
      type: options.type,
      trigger: options.trigger,
      description: options.description,
      slides: slidesCopy,
      metadata: {
        slideCount: slidesCopy.length,
        wordCount,
      },
    };

    return version;
  }

  /**
   * 将版本添加到文档（维护版本历史）
   */
  addVersionToDocument(document: PPTDocument, version: PPTVersion): void {
    // 初始化版本数组（如果需要）
    if (!document.versions) {
      document.versions = [];
    }

    // 添加新版本
    document.versions.push(version);

    // 更新当前版本ID
    document.currentVersionId = version.id;

    // 清理旧版本（保留最近的 MAX_VERSIONS 个）
    if (document.versions.length > this.MAX_VERSIONS) {
      const removeCount = document.versions.length - this.MAX_VERSIONS;
      // 保留手动保存的版本
      const versionsToRemove = document.versions
        .slice(0, removeCount)
        .filter((v) => v.type === "auto");
      document.versions = document.versions.filter(
        (v) => !versionsToRemove.includes(v),
      );
      this.logger.log(
        `[addVersionToDocument] Cleaned up ${versionsToRemove.length} old auto-versions`,
      );
    }

    this.logger.log(
      `[addVersionToDocument] Document now has ${document.versions.length} versions`,
    );
  }

  /**
   * 获取版本列表
   */
  getVersionList(document: PPTDocument): VersionInfo[] {
    if (!document.versions || document.versions.length === 0) {
      return [];
    }

    return document.versions.map((v) => ({
      id: v.id,
      timestamp: v.timestamp,
      type: v.type,
      trigger: v.trigger,
      description: v.description,
      slideCount: v.metadata.slideCount,
      wordCount: v.metadata.wordCount,
      isCurrent: v.id === document.currentVersionId,
    }));
  }

  /**
   * 获取特定版本
   */
  getVersion(document: PPTDocument, versionId: string): PPTVersion | null {
    return document.versions?.find((v) => v.id === versionId) || null;
  }

  /**
   * 回滚到指定版本
   */
  rollbackToVersion(document: PPTDocument, versionId: string): RollbackResult {
    const version = this.getVersion(document, versionId);

    if (!version) {
      return {
        success: false,
        previousVersionId: document.currentVersionId,
        restoredVersionId: versionId,
        error: `版本 ${versionId} 不存在`,
      };
    }

    this.logger.log(
      `[rollbackToVersion] Rolling back from ${document.currentVersionId} to ${versionId}`,
    );

    // 保存当前状态作为新版本（便于撤销回滚）
    const backupVersion = this.createVersion(document, {
      type: "auto",
      trigger: "user_edit",
      description: `回滚前自动备份 (回滚到 ${versionId})`,
    });
    this.addVersionToDocument(document, backupVersion);

    // 恢复目标版本的幻灯片
    const previousVersionId = document.currentVersionId;
    document.slides = JSON.parse(JSON.stringify(version.slides));
    document.currentVersionId = versionId;

    // 更新元数据
    document.metadata.slideCount = document.slides.length;
    document.metadata.updatedAt = new Date().toISOString();

    this.logger.log(
      `[rollbackToVersion] Successfully rolled back to ${versionId}`,
    );

    return {
      success: true,
      document,
      previousVersionId,
      restoredVersionId: versionId,
    };
  }

  /**
   * 比较两个版本
   */
  compareVersions(
    document: PPTDocument,
    fromVersionId: string,
    toVersionId: string,
  ): VersionDiff | null {
    const fromVersion = this.getVersion(document, fromVersionId);
    const toVersion = this.getVersion(document, toVersionId);

    if (!fromVersion || !toVersion) {
      this.logger.warn(
        `[compareVersions] Version not found: from=${fromVersionId}, to=${toVersionId}`,
      );
      return null;
    }

    const slideDiffs: SlideDiff[] = [];
    const addedSlides: number[] = [];
    const removedSlides: number[] = [];

    // 创建幻灯片ID映射
    const fromSlidesById = new Map(
      fromVersion.slides.map((s, i) => [s.id, { slide: s, index: i }]),
    );
    const toSlidesById = new Map(
      toVersion.slides.map((s, i) => [s.id, { slide: s, index: i }]),
    );

    // 查找删除的幻灯片
    fromVersion.slides.forEach((slide, index) => {
      if (!toSlidesById.has(slide.id)) {
        removedSlides.push(index);
      }
    });

    // 查找添加的幻灯片
    toVersion.slides.forEach((slide, index) => {
      if (!fromSlidesById.has(slide.id)) {
        addedSlides.push(index);
      }
    });

    // 比较共同存在的幻灯片
    toVersion.slides.forEach((toSlide, toIndex) => {
      const fromData = fromSlidesById.get(toSlide.id);
      if (fromData) {
        const diff = this.compareSlides(fromData.slide, toSlide, toIndex);
        if (
          diff.changes.length > 0 ||
          diff.hasImageChanges ||
          diff.hasLayoutChanges
        ) {
          slideDiffs.push(diff);
        }
      }
    });

    // 计算摘要
    const contentChanges = slideDiffs.reduce(
      (sum, d) => sum + d.changes.length,
      0,
    );
    const imageChanges = slideDiffs.filter((d) => d.hasImageChanges).length;
    const layoutChanges = slideDiffs.filter((d) => d.hasLayoutChanges).length;

    return {
      fromVersionId,
      toVersionId,
      slideDiffs,
      addedSlides,
      removedSlides,
      summary: {
        totalChanges:
          contentChanges +
          imageChanges +
          layoutChanges +
          addedSlides.length +
          removedSlides.length,
        contentChanges,
        imageChanges,
        layoutChanges,
        slidesAdded: addedSlides.length,
        slidesRemoved: removedSlides.length,
      },
    };
  }

  /**
   * 比较两个幻灯片
   */
  private compareSlides(
    fromSlide: GeneratedSlide,
    toSlide: GeneratedSlide,
    slideIndex: number,
  ): SlideDiff {
    const changes: ContentChange[] = [];

    // 比较内容
    this.compareContent(fromSlide.content, toSlide.content, changes);

    // 检查图片变化
    const hasImageChanges =
      JSON.stringify(fromSlide.images) !== JSON.stringify(toSlide.images);

    // 检查布局变化
    const hasLayoutChanges =
      fromSlide.spec.layoutType !== toSlide.spec.layoutType;

    return {
      slideIndex,
      slideId: toSlide.id,
      changes,
      hasImageChanges,
      hasLayoutChanges,
    };
  }

  /**
   * 比较幻灯片内容
   */
  private compareContent(
    fromContent: GeneratedSlideContent,
    toContent: GeneratedSlideContent,
    changes: ContentChange[],
  ): void {
    // 比较标题
    if (fromContent.title !== toContent.title) {
      changes.push({
        field: "title",
        type: "modified",
        before: fromContent.title,
        after: toContent.title,
      });
    }

    // 比较副标题
    if (fromContent.subtitle !== toContent.subtitle) {
      if (!fromContent.subtitle && toContent.subtitle) {
        changes.push({
          field: "subtitle",
          type: "added",
          after: toContent.subtitle,
        });
      } else if (fromContent.subtitle && !toContent.subtitle) {
        changes.push({
          field: "subtitle",
          type: "removed",
          before: fromContent.subtitle,
        });
      } else {
        changes.push({
          field: "subtitle",
          type: "modified",
          before: fromContent.subtitle,
          after: toContent.subtitle,
        });
      }
    }

    // 比较正文
    if (fromContent.bodyText !== toContent.bodyText) {
      if (!fromContent.bodyText && toContent.bodyText) {
        changes.push({
          field: "bodyText",
          type: "added",
          after: toContent.bodyText,
        });
      } else if (fromContent.bodyText && !toContent.bodyText) {
        changes.push({
          field: "bodyText",
          type: "removed",
          before: fromContent.bodyText,
        });
      } else {
        changes.push({
          field: "bodyText",
          type: "modified",
          before: fromContent.bodyText,
          after: toContent.bodyText,
        });
      }
    }

    // 比较要点列表
    const fromBullets = fromContent.bulletPoints || [];
    const toBullets = toContent.bulletPoints || [];
    if (JSON.stringify(fromBullets) !== JSON.stringify(toBullets)) {
      changes.push({
        field: "bulletPoints",
        type: "modified",
        before: fromBullets,
        after: toBullets,
      });
    }

    // 比较演讲者备注
    if (fromContent.speakerNotes !== toContent.speakerNotes) {
      if (!fromContent.speakerNotes && toContent.speakerNotes) {
        changes.push({
          field: "speakerNotes",
          type: "added",
          after: toContent.speakerNotes,
        });
      } else if (fromContent.speakerNotes && !toContent.speakerNotes) {
        changes.push({
          field: "speakerNotes",
          type: "removed",
          before: fromContent.speakerNotes,
        });
      } else {
        changes.push({
          field: "speakerNotes",
          type: "modified",
          before: fromContent.speakerNotes,
          after: toContent.speakerNotes,
        });
      }
    }
  }

  /**
   * 检查是否需要自动保存
   */
  shouldAutoSave(document: PPTDocument): boolean {
    if (!document.versions || document.versions.length === 0) {
      return true;
    }

    const lastVersion = document.versions[document.versions.length - 1];
    const lastSaveTime = new Date(lastVersion.timestamp).getTime();
    const now = Date.now();

    return now - lastSaveTime >= this.AUTO_SAVE_INTERVAL;
  }

  /**
   * 计算字数
   */
  private calculateWordCount(slides: GeneratedSlide[]): number {
    let count = 0;

    for (const slide of slides) {
      const content = slide.content;

      // 标题
      if (content.title) {
        count += this.countWords(content.title);
      }

      // 副标题
      if (content.subtitle) {
        count += this.countWords(content.subtitle);
      }

      // 正文
      if (content.bodyText) {
        count += this.countWords(content.bodyText);
      }

      // 要点
      if (content.bulletPoints) {
        for (const bullet of content.bulletPoints) {
          count += this.countWords(bullet);
        }
      }

      // 统计数据
      if (content.statistics) {
        for (const stat of content.statistics) {
          count += this.countWords(stat.label);
          count += this.countWords(stat.value);
          if (stat.comparison) {
            count += this.countWords(stat.comparison);
          }
        }
      }
    }

    return count;
  }

  /**
   * 计算单个字符串的字数
   */
  private countWords(text: string): number {
    if (!text) return 0;

    // 中文按字符计数，英文按空格分词
    const chineseMatch = text.match(/[\u4e00-\u9fa5]/g);
    const chineseCount = chineseMatch ? chineseMatch.length : 0;

    const englishWords = text
      .replace(/[\u4e00-\u9fa5]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 0);
    const englishCount = englishWords.length;

    return chineseCount + englishCount;
  }
}
