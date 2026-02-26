/**
 * 图文匹配服务
 * 为内容智能推荐合适的图片类型和位置
 */

import { Injectable } from "@nestjs/common";
import {
  ContentFeatures,
  ContentCategory,
  SectionFeatures,
} from "../../analysis/content-analysis.types";
import {
  ImageType,
  ImagePlacement,
  ImageRequirement,
  ImageMatchingRule,
  IMAGE_MATCHING_RULES,
} from "./image-matching.types";

/**
 * 图片生成提示词
 */
export interface ImagePrompt {
  prompt: string;
  promptZh: string;
  negativePrompt: string;
  style: string;
  aspectRatio: "16:9" | "4:3" | "1:1" | "3:2" | "2:1";
  suggestedModel: "flux" | "dalle3" | "midjourney";
}

/**
 * 图片匹配结果
 */
export interface ImageMatchingResult {
  sectionId: string;
  sectionTitle: string;
  requirements: ImageRequirement[];
  prompts: ImagePrompt[];
  textToImageRatio: string;
  placementSuggestions: Array<{
    position: string;
    type: ImageType;
    description: string;
  }>;
}

@Injectable()
export class ImageMatchingService {
  // Note: AIModelService and AiChatService can be added later for AI-powered image matching

  /**
   * 为整个文档匹配图片
   */
  async matchImagesForDocument(
    sections: SectionFeatures[],
    documentFeatures: ContentFeatures,
  ): Promise<ImageMatchingResult[]> {
    const results: ImageMatchingResult[] = [];

    for (const section of sections) {
      const result = await this.matchImagesForSection(
        section,
        documentFeatures,
      );
      results.push(result);
    }

    return this.balanceImageDistribution(results, documentFeatures);
  }

  /**
   * 为单个章节匹配图片
   */
  async matchImagesForSection(
    section: SectionFeatures,
    documentFeatures: ContentFeatures,
  ): Promise<ImageMatchingResult> {
    // 1. 规则引擎匹配
    const ruleBasedRequirements = this.applyMatchingRules(
      section,
      documentFeatures,
    );

    // 2. 生成图片提示词
    const prompts = await this.generateImagePrompts(
      section,
      ruleBasedRequirements,
    );

    // 3. 计算图文比例
    const textToImageRatio = this.calculateTextToImageRatio(
      section,
      ruleBasedRequirements,
    );

    // 4. 生成位置建议
    const placementSuggestions = this.generatePlacementSuggestions(
      section,
      ruleBasedRequirements,
    );

    return {
      sectionId: section.id,
      sectionTitle: section.title,
      requirements: ruleBasedRequirements,
      prompts,
      textToImageRatio,
      placementSuggestions,
    };
  }

  /**
   * 应用匹配规则
   */
  private applyMatchingRules(
    section: SectionFeatures,
    documentFeatures: ContentFeatures,
  ): ImageRequirement[] {
    const requirements: ImageRequirement[] = [];
    const matchedRules: ImageMatchingRule[] = [];

    // 按优先级排序规则
    const sortedRules = [...IMAGE_MATCHING_RULES].sort(
      (a, b) => b.priority - a.priority,
    );

    for (const rule of sortedRules) {
      if (this.evaluateMatchingRule(rule, section, documentFeatures)) {
        matchedRules.push(rule);
      }
    }

    // 取优先级最高的3个规则
    matchedRules.slice(0, 3).forEach((rule) => {
      rule.recommendedImageTypes.forEach((type) => {
        requirements.push({
          type,
          placement: rule.recommendedPlacement,
          description: rule.description,
          keywords: this.extractKeywords(section),
          priority: rule.priority >= 80 ? "required" : "recommended",
        });
      });
    });

    // 如果没有匹配规则，使用默认建议
    if (requirements.length === 0) {
      requirements.push({
        type: ImageType.ILLUSTRATION_FLAT,
        placement: ImagePlacement.SIDE,
        description: "主题相关插画",
        keywords: this.extractKeywords(section),
        priority: "optional",
      });
    }

    return requirements;
  }

  /**
   * 评估单个匹配规则
   */
  private evaluateMatchingRule(
    rule: ImageMatchingRule,
    section: SectionFeatures,
    documentFeatures: ContentFeatures,
  ): boolean {
    const { conditions } = rule;

    // 检查内容类型
    if (conditions.contentCategory) {
      if (!conditions.contentCategory.includes(section.overallCategory)) {
        return false;
      }
    }

    // 检查是否有数据
    if (conditions.hasData !== undefined) {
      const hasData = section.paragraphs.some((p) => p.hasData);
      if (conditions.hasData !== hasData) {
        return false;
      }
    }

    // 检查是否有时间线
    if (conditions.hasTimeline !== undefined) {
      if (conditions.hasTimeline !== documentFeatures.hasTimeline) {
        return false;
      }
    }

    // 检查是否有对比
    if (conditions.hasComparison !== undefined) {
      if (conditions.hasComparison !== documentFeatures.hasComparison) {
        return false;
      }
    }

    // 检查是否有案例
    if (conditions.hasCaseStudy !== undefined) {
      if (conditions.hasCaseStudy !== documentFeatures.hasCaseStudy) {
        return false;
      }
    }

    // 检查关键词
    if (conditions.keywords && conditions.keywords.length > 0) {
      const sectionText = section.paragraphs.map((p) => p.text).join(" ");
      const hasKeyword = conditions.keywords.some((kw) =>
        sectionText.toLowerCase().includes(kw.toLowerCase()),
      );
      if (!hasKeyword) {
        return false;
      }
    }

    return true;
  }

  /**
   * 提取关键词
   */
  private extractKeywords(section: SectionFeatures): string[] {
    const keywords: string[] = [];

    // 从章节标题提取
    keywords.push(...section.title.split(/\s+/).filter((w) => w.length > 1));

    // 从关键信息提取
    keywords.push(...section.keyMessages.slice(0, 3));

    // 从段落关键点提取
    section.paragraphs.forEach((p) => {
      keywords.push(...p.keyPoints.slice(0, 2));
    });

    // 去重并限制数量
    return [...new Set(keywords)].slice(0, 10);
  }

  /**
   * 生成图片提示词
   */
  private async generateImagePrompts(
    section: SectionFeatures,
    requirements: ImageRequirement[],
  ): Promise<ImagePrompt[]> {
    const prompts: ImagePrompt[] = [];

    for (const req of requirements) {
      const prompt = this.buildImagePrompt(req, section);
      prompts.push(prompt);
    }

    return prompts;
  }

  /**
   * 构建单个图片提示词
   */
  private buildImagePrompt(
    requirement: ImageRequirement,
    _section: SectionFeatures,
  ): ImagePrompt {
    const styleMap: Record<ImageType, { style: string; promptPrefix: string }> =
      {
        [ImageType.INFOGRAPHIC]: {
          style: "infographic",
          promptPrefix: "Professional business infographic showing",
        },
        [ImageType.DIAGRAM]: {
          style: "diagram",
          promptPrefix: "Clean technical diagram illustrating",
        },
        [ImageType.CHART]: {
          style: "chart",
          promptPrefix: "Modern data visualization chart displaying",
        },
        [ImageType.ICON]: {
          style: "icon",
          promptPrefix: "Minimalist icon representing",
        },
        [ImageType.PHOTO_BUSINESS]: {
          style: "photo",
          promptPrefix: "Professional business photography showing",
        },
        [ImageType.PHOTO_TECHNOLOGY]: {
          style: "photo",
          promptPrefix: "Modern technology photograph featuring",
        },
        [ImageType.PHOTO_PEOPLE]: {
          style: "photo",
          promptPrefix: "Professional portrait or team photo of",
        },
        [ImageType.PHOTO_ABSTRACT]: {
          style: "photo",
          promptPrefix: "Abstract conceptual photograph representing",
        },
        [ImageType.ILLUSTRATION_FLAT]: {
          style: "illustration",
          promptPrefix: "Modern flat design illustration of",
        },
        [ImageType.ILLUSTRATION_3D]: {
          style: "3d",
          promptPrefix: "3D rendered illustration showing",
        },
        [ImageType.ILLUSTRATION_ISOMETRIC]: {
          style: "isometric",
          promptPrefix: "Isometric illustration depicting",
        },
        [ImageType.BACKGROUND]: {
          style: "background",
          promptPrefix: "Abstract professional background with",
        },
        [ImageType.PATTERN]: {
          style: "pattern",
          promptPrefix: "Seamless geometric pattern with",
        },
        [ImageType.DECORATION]: {
          style: "decoration",
          promptPrefix: "Decorative graphic element featuring",
        },
      };

    const typeConfig =
      styleMap[requirement.type] || styleMap[ImageType.ILLUSTRATION_FLAT];
    const keywords = requirement.keywords.join(", ");
    const description = requirement.description;

    // 构建英文提示词
    const prompt = `${typeConfig.promptPrefix} ${description}, ${keywords}, clean design, professional style, high quality, 4K resolution`;

    // 构建中文提示词
    const promptZh = `${this.translateToZh(typeConfig.promptPrefix)} ${description}，${keywords}，简洁设计，专业风格，高质量`;

    // 根据位置确定比例
    const aspectRatioMap: Record<ImagePlacement, ImagePrompt["aspectRatio"]> = {
      [ImagePlacement.HERO]: "16:9",
      [ImagePlacement.INLINE]: "4:3",
      [ImagePlacement.SIDE]: "1:1",
      [ImagePlacement.BACKGROUND]: "16:9",
      [ImagePlacement.ICON]: "1:1",
      [ImagePlacement.THUMBNAIL]: "1:1",
    };

    return {
      prompt,
      promptZh,
      negativePrompt: "blurry, low quality, text, watermark, distorted, ugly",
      style: typeConfig.style,
      aspectRatio: aspectRatioMap[requirement.placement] || "16:9",
      suggestedModel: this.selectBestModel(requirement.type),
    };
  }

  /**
   * 翻译前缀
   */
  private translateToZh(prefix: string): string {
    const translations: Record<string, string> = {
      "Professional business infographic showing": "专业商务信息图展示",
      "Clean technical diagram illustrating": "清晰技术图表说明",
      "Modern data visualization chart displaying": "现代数据可视化图表展示",
      "Minimalist icon representing": "简约图标代表",
      "Professional business photography showing": "专业商务照片展示",
      "Modern technology photograph featuring": "现代科技照片呈现",
      "Professional portrait or team photo of": "专业人像或团队照片",
      "Abstract conceptual photograph representing": "抽象概念照片代表",
      "Modern flat design illustration of": "现代扁平设计插画展示",
      "3D rendered illustration showing": "3D渲染插画展示",
      "Isometric illustration depicting": "等距插画描绘",
      "Abstract professional background with": "抽象专业背景",
      "Seamless geometric pattern with": "无缝几何图案",
      "Decorative graphic element featuring": "装饰性图形元素",
    };
    return translations[prefix] || prefix;
  }

  /**
   * 选择最佳模型
   */
  private selectBestModel(imageType: ImageType): ImagePrompt["suggestedModel"] {
    const modelMap: Record<ImageType, ImagePrompt["suggestedModel"]> = {
      [ImageType.INFOGRAPHIC]: "dalle3",
      [ImageType.DIAGRAM]: "dalle3",
      [ImageType.CHART]: "dalle3",
      [ImageType.ICON]: "dalle3",
      [ImageType.PHOTO_BUSINESS]: "flux",
      [ImageType.PHOTO_TECHNOLOGY]: "flux",
      [ImageType.PHOTO_PEOPLE]: "flux",
      [ImageType.PHOTO_ABSTRACT]: "midjourney",
      [ImageType.ILLUSTRATION_FLAT]: "dalle3",
      [ImageType.ILLUSTRATION_3D]: "midjourney",
      [ImageType.ILLUSTRATION_ISOMETRIC]: "midjourney",
      [ImageType.BACKGROUND]: "midjourney",
      [ImageType.PATTERN]: "dalle3",
      [ImageType.DECORATION]: "dalle3",
    };
    return modelMap[imageType] || "dalle3";
  }

  /**
   * 计算图文比例
   */
  private calculateTextToImageRatio(
    section: SectionFeatures,
    requirements: ImageRequirement[],
  ): string {
    const imageCount = requirements.length;

    // 基础比例
    let textRatio = 70;
    let imageRatio = 30;

    // 根据图片数量调整
    if (imageCount >= 3) {
      textRatio = 50;
      imageRatio = 50;
    } else if (imageCount === 2) {
      textRatio = 60;
      imageRatio = 40;
    } else if (imageCount === 0) {
      textRatio = 90;
      imageRatio = 10;
    }

    // 根据内容类型调整
    if (section.overallCategory === ContentCategory.ANALYTICAL) {
      // 分析型内容需要更多图表
      imageRatio += 10;
      textRatio -= 10;
    }

    return `${textRatio}:${imageRatio}`;
  }

  /**
   * 生成位置建议
   */
  private generatePlacementSuggestions(
    section: SectionFeatures,
    requirements: ImageRequirement[],
  ): Array<{ position: string; type: ImageType; description: string }> {
    const suggestions: Array<{
      position: string;
      type: ImageType;
      description: string;
    }> = [];

    requirements.forEach((req, index) => {
      let position: string;

      switch (req.placement) {
        case ImagePlacement.HERO:
          position = "章节开头，作为主图";
          break;
        case ImagePlacement.SIDE:
          position = `第${index + 1}段旁边，左右分布`;
          break;
        case ImagePlacement.INLINE:
          position = `第${Math.min(index * 2 + 1, section.paragraphs.length)}段后`;
          break;
        case ImagePlacement.BACKGROUND:
          position = "整个章节背景";
          break;
        default:
          position = "章节中适当位置";
      }

      suggestions.push({
        position,
        type: req.type,
        description: req.description,
      });
    });

    return suggestions;
  }

  /**
   * 平衡整个文档的图片分布
   */
  private balanceImageDistribution(
    results: ImageMatchingResult[],
    documentFeatures: ContentFeatures,
  ): ImageMatchingResult[] {
    // 计算总图片数
    const totalImages = results.reduce(
      (sum, r) => sum + r.requirements.length,
      0,
    );

    // 目标图片数量
    const targetImages =
      documentFeatures.complexity === "low"
        ? 5
        : documentFeatures.complexity === "high"
          ? 15
          : 10;

    // 如果图片过多，减少可选图片
    if (totalImages > targetImages * 1.5) {
      results.forEach((result) => {
        result.requirements = result.requirements.filter(
          (r) => r.priority !== "optional",
        );
      });
    }

    // 如果图片过少，为没有图片的章节添加建议
    if (totalImages < targetImages * 0.5) {
      results.forEach((result) => {
        if (result.requirements.length === 0) {
          result.requirements.push({
            type: ImageType.ILLUSTRATION_FLAT,
            placement: ImagePlacement.SIDE,
            description: "主题相关插画",
            keywords: [result.sectionTitle],
            priority: "recommended",
          });
        }
      });
    }

    return results;
  }

  /**
   * 快速获取章节的图片需求
   */
  getQuickImageRequirements(
    category: ContentCategory,
    hasData: boolean,
  ): ImageRequirement[] {
    const requirements: ImageRequirement[] = [];

    if (hasData) {
      requirements.push({
        type: ImageType.CHART,
        placement: ImagePlacement.INLINE,
        description: "数据可视化",
        keywords: ["data", "chart"],
        priority: "required",
      });
    }

    switch (category) {
      case ContentCategory.ANALYTICAL:
        requirements.push({
          type: ImageType.INFOGRAPHIC,
          placement: ImagePlacement.HERO,
          description: "分析信息图",
          keywords: ["analysis", "insights"],
          priority: "recommended",
        });
        break;
      case ContentCategory.COMPARATIVE:
        requirements.push({
          type: ImageType.INFOGRAPHIC,
          placement: ImagePlacement.HERO,
          description: "对比图表",
          keywords: ["comparison", "versus"],
          priority: "required",
        });
        break;
      case ContentCategory.NARRATIVE:
        requirements.push({
          type: ImageType.PHOTO_ABSTRACT,
          placement: ImagePlacement.HERO,
          description: "叙事配图",
          keywords: ["story", "journey"],
          priority: "recommended",
        });
        break;
      default:
        requirements.push({
          type: ImageType.ILLUSTRATION_FLAT,
          placement: ImagePlacement.SIDE,
          description: "主题插画",
          keywords: [],
          priority: "optional",
        });
    }

    return requirements;
  }
}
