/**
 * Slides Engine v3.0 - Image Generator Service
 *
 * 图像生成器角色：负责生成幻灯片所需的图像
 * 使用 IMAGE_GENERATION 模型 + DEFAULT 策略
 */

import { Injectable, Logger } from "@nestjs/common";
import {
  MultiModelService,
  ImageGenerationInput,
} from "../orchestrator/multi-model.service";
import {
  GeneratedImage,
  ImageRequirement,
  PageOutline,
  GlobalStyles,
} from "../checkpoint/checkpoint.types";
import { v4 as uuidv4 } from "uuid";

/**
 * 页面图像生成输入
 */
export interface PageImageGenerationInput {
  pageOutline: PageOutline;
  globalStyles?: GlobalStyles;
  sessionId?: string;
}

/**
 * 批量图像生成输入
 */
export interface BatchImageGenerationInput {
  pages: PageOutline[];
  globalStyles?: GlobalStyles;
  sessionId?: string;
  concurrency?: number;
}

/**
 * 图像生成结果
 */
export interface PageImageGenerationResult {
  pageNumber: number;
  images: GeneratedImage[];
  errors: string[];
}

@Injectable()
export class ImageGeneratorService {
  private readonly logger = new Logger(ImageGeneratorService.name);

  constructor(private readonly multiModel: MultiModelService) {}

  /**
   * 为单页生成图像
   */
  async generateForPage(
    input: PageImageGenerationInput,
  ): Promise<PageImageGenerationResult> {
    const { pageOutline, globalStyles, sessionId } = input;

    // 如果没有定义图像需求，自动生成默认需求
    let requirements = pageOutline.imageRequirements || [];
    if (requirements.length === 0) {
      requirements = this.generateDefaultImageRequirements(pageOutline);
      this.logger.log(
        `[generateForPage] Auto-generated ${requirements.length} image requirements for page ${pageOutline.pageNumber} (type: ${pageOutline.templateType})`,
      );
    }

    this.logger.log(
      `[generateForPage] Generating ${requirements.length} images for page ${pageOutline.pageNumber} (type: ${pageOutline.templateType})`,
    );

    // 详细日志：显示需求详情
    for (const req of requirements) {
      this.logger.debug(
        `[generateForPage] Requirement: position=${req.position}, context=${req.semanticContext?.substring(0, 50)}..., optional=${req.optional}`,
      );
    }

    if (requirements.length === 0) {
      return {
        pageNumber: pageOutline.pageNumber,
        images: [],
        errors: [],
      };
    }

    const images: GeneratedImage[] = [];
    const errors: string[] = [];

    for (const requirement of requirements) {
      try {
        const image = await this.generateImage(
          requirement,
          pageOutline,
          globalStyles,
          sessionId,
        );

        if (image) {
          images.push(image);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `[generateForPage] Failed to generate image for page ${pageOutline.pageNumber}:`,
          error,
        );
        errors.push(errorMsg);
      }
    }

    return {
      pageNumber: pageOutline.pageNumber,
      images,
      errors,
    };
  }

  /**
   * 批量生成图像
   */
  async generateBatch(
    input: BatchImageGenerationInput,
  ): Promise<Map<number, PageImageGenerationResult>> {
    const { pages, globalStyles, sessionId, concurrency = 2 } = input;

    this.logger.log(`[generateBatch] Processing ${pages.length} pages`);

    const results = new Map<number, PageImageGenerationResult>();

    // 过滤出有图像需求的页面
    const pagesWithImages = pages.filter(
      (page) => page.imageRequirements && page.imageRequirements.length > 0,
    );

    if (pagesWithImages.length === 0) {
      this.logger.log("[generateBatch] No pages require images");
      return results;
    }

    // 分批处理
    const batches: PageOutline[][] = [];
    for (let i = 0; i < pagesWithImages.length; i += concurrency) {
      batches.push(pagesWithImages.slice(i, i + concurrency));
    }

    for (const batch of batches) {
      const batchResults = await Promise.all(
        batch.map((page) =>
          this.generateForPage({ pageOutline: page, globalStyles, sessionId }),
        ),
      );

      for (const result of batchResults) {
        results.set(result.pageNumber, result);
      }
    }

    return results;
  }

  /**
   * 生成单张图像
   */
  private async generateImage(
    requirement: ImageRequirement,
    pageOutline: PageOutline,
    globalStyles?: GlobalStyles,
    sessionId?: string,
  ): Promise<GeneratedImage | null> {
    // 如果是可选图像且语义上下文不明确，跳过
    if (requirement.optional && !requirement.semanticContext) {
      this.logger.debug(
        "[generateImage] Skipping optional image without context",
      );
      return null;
    }

    // 构建提示词
    const prompt = this.buildImagePrompt(
      requirement,
      pageOutline,
      globalStyles,
    );

    this.logger.log(
      `[generateImage] Calling multiModel.generateImage for page ${pageOutline.pageNumber}, position=${requirement.position}`,
    );
    this.logger.debug(`[generateImage] Prompt: ${prompt.substring(0, 100)}...`);

    const generationInput: ImageGenerationInput = {
      prompt,
      semanticContext: requirement.semanticContext,
      style: requirement.style || this.getDefaultStyle(requirement.position),
      aspectRatio: this.getAspectRatio(requirement.position),
      metadata: {
        sessionId,
        pageNumber: pageOutline.pageNumber,
      },
    };

    const result = await this.multiModel.generateImage(generationInput);

    this.logger.log(
      `[generateImage] Result: success=${result.success}, url=${result.url ? "yes" : "no"}, model=${result.modelUsed}, provider=${result.provider}`,
    );

    if (!result.success || !result.url) {
      this.logger.error(
        `[generateImage] Image generation FAILED for page ${pageOutline.pageNumber}: ${result.error}`,
      );

      // 回退：使用 Unsplash 作为后备图片源
      const fallbackUrl = this.getFallbackImageUrl(requirement, pageOutline);
      if (fallbackUrl) {
        this.logger.log(
          `[generateImage] Using Unsplash fallback for page ${pageOutline.pageNumber}: ${fallbackUrl}`,
        );
        return {
          id: uuidv4(),
          url: fallbackUrl,
          prompt: `Unsplash fallback: ${requirement.semanticContext || pageOutline.title}`,
          semanticContext: requirement.semanticContext,
          position: requirement.position,
          width: 1280,
          height: 720,
          generatedAt: new Date(),
        };
      }

      return null;
    }

    return {
      id: uuidv4(),
      url: result.url,
      prompt,
      semanticContext: requirement.semanticContext,
      position: requirement.position,
      width: result.width,
      height: result.height,
      generatedAt: new Date(),
    };
  }

  /**
   * 获取回退图片 URL (使用 Unsplash)
   */
  private getFallbackImageUrl(
    requirement: ImageRequirement,
    pageOutline: PageOutline,
  ): string | null {
    // 只为背景图提供回退
    if (requirement.position !== "background") {
      return null;
    }

    // 根据页面类型和标题选择合适的 Unsplash 搜索词
    const searchTerms = this.getUnsplashSearchTerms(pageOutline);

    // Unsplash Source API (免费，无需 API Key)
    // 格式: https://source.unsplash.com/1280x720/?{keywords}
    const keywords = encodeURIComponent(searchTerms.join(","));
    return `https://source.unsplash.com/1280x720/?${keywords}`;
  }

  /**
   * 根据页面类型获取 Unsplash 搜索词
   */
  private getUnsplashSearchTerms(pageOutline: PageOutline): string[] {
    const templateType = pageOutline.templateType;
    const title = pageOutline.title.toLowerCase();

    // 基础搜索词：深色、科技感
    const baseTerms = ["dark", "technology"];

    // 根据模板类型添加特定词
    const typeTerms: Record<string, string[]> = {
      cover: ["abstract", "gradient", "minimal"],
      dashboard: ["data", "analytics", "digital"],
      framework: ["network", "structure", "connection"],
      pillars: ["architecture", "building", "foundation"],
      timeline: ["time", "evolution", "progress"],
      evolutionRoadmap: ["road", "path", "journey"],
      comparison: ["contrast", "balance", "symmetry"],
      caseStudy: ["business", "office", "professional"],
      recommendations: ["direction", "arrow", "future"],
      multiColumn: ["grid", "pattern", "geometric"],
      splitLayout: ["divided", "contrast", "modern"],
    };

    // 根据标题关键词添加额外搜索词
    const titleKeywords: string[] = [];
    if (title.includes("城市") || title.includes("city"))
      titleKeywords.push("city", "urban");
    if (title.includes("科技") || title.includes("tech"))
      titleKeywords.push("tech", "innovation");
    if (title.includes("经济") || title.includes("econom"))
      titleKeywords.push("finance", "economy");
    if (title.includes("教育") || title.includes("education"))
      titleKeywords.push("education", "learning");
    if (title.includes("医疗") || title.includes("health"))
      titleKeywords.push("healthcare", "medical");
    if (title.includes("环境") || title.includes("environment"))
      titleKeywords.push("nature", "green");

    return [
      ...baseTerms,
      ...(typeTerms[templateType] || ["abstract"]),
      ...titleKeywords.slice(0, 2), // 只取前2个
    ];
  }

  /**
   * 构建图像提示词
   */
  private buildImagePrompt(
    requirement: ImageRequirement,
    pageOutline: PageOutline,
    globalStyles?: GlobalStyles,
  ): string {
    const parts: string[] = [];

    // 位置特定的样式前缀
    const positionStyles: Record<string, string> = {
      background:
        "Abstract, subtle, dark themed background suitable for business presentation",
      inline:
        "Clean, professional illustration or icon suitable for presentation slide",
      card: "Minimalist, professional image for card element",
      icon: "Simple, flat design icon in monochrome or accent color",
    };

    parts.push(positionStyles[requirement.position] || "Professional image");

    // 添加语义上下文
    if (requirement.semanticContext) {
      parts.push(`representing: ${requirement.semanticContext}`);
    }

    // 添加页面上下文
    parts.push(`for slide about: ${pageOutline.title}`);

    // 添加风格要求
    if (requirement.style) {
      parts.push(`style: ${requirement.style}`);
    }

    // 添加颜色主题
    if (globalStyles) {
      parts.push(
        `color scheme: dark background (${globalStyles.backgroundColor}), accent color (${globalStyles.accentColor})`,
      );
    }

    // 通用质量要求
    parts.push(
      "high quality, professional, suitable for corporate presentation, clean design",
    );

    return parts.join(". ");
  }

  /**
   * 获取默认样式
   */
  private getDefaultStyle(position: ImageRequirement["position"]): string {
    const styles: Record<string, string> = {
      background: "abstract, subtle, dark",
      inline: "professional, clean, modern",
      card: "minimalist, professional",
      icon: "flat, simple, monochrome",
    };

    return styles[position] || "professional";
  }

  /**
   * 获取宽高比
   */
  private getAspectRatio(
    position: ImageRequirement["position"],
  ): "16:9" | "4:3" | "1:1" | "9:16" {
    const ratios: Record<string, "16:9" | "4:3" | "1:1" | "9:16"> = {
      background: "16:9",
      inline: "4:3",
      card: "4:3",
      icon: "1:1",
    };

    return ratios[position] || "16:9";
  }

  /**
   * 根据页面类型生成默认图像需求
   */
  private generateDefaultImageRequirements(
    pageOutline: PageOutline,
  ): ImageRequirement[] {
    const templateType = pageOutline.templateType;
    const title = pageOutline.title;

    // 根据模板类型生成适当的图像需求
    const defaultRequirements: Record<string, ImageRequirement[]> = {
      cover: [
        {
          position: "background",
          semanticContext: `${title} - 科技创新深色背景，抽象几何图案，专业商务风格`,
          style: "abstract dark tech gradient",
          optional: false,
        },
      ],
      dashboard: [
        {
          position: "background",
          semanticContext: `数据可视化背景，数据流动效果，与${title}相关`,
          style: "data visualization abstract dark",
          optional: false,
        },
      ],
      framework: [
        {
          position: "background",
          semanticContext: `框架概念背景，网络连接效果，与${title}相关`,
          style: "network abstract dark professional",
          optional: false,
        },
      ],
      pillars: [
        {
          position: "background",
          semanticContext: `支柱概念背景，结构化元素，与${title}相关`,
          style: "structured abstract dark minimal",
          optional: false,
        },
      ],
      timeline: [
        {
          position: "background",
          semanticContext: `时间线背景，进化演进效果，与${title}相关`,
          style: "timeline evolution abstract dark",
          optional: false,
        },
      ],
      evolutionRoadmap: [
        {
          position: "background",
          semanticContext: `演进路线图背景，发展轨迹，与${title}相关`,
          style: "roadmap progression abstract dark",
          optional: false,
        },
      ],
      comparison: [
        {
          position: "background",
          semanticContext: `对比分析背景，双向效果，与${title}相关`,
          style: "comparison abstract dark professional",
          optional: false,
        },
      ],
      caseStudy: [
        {
          position: "background",
          semanticContext: `案例研究背景，专业分析风格，与${title}相关`,
          style: "case study professional dark",
          optional: false,
        },
      ],
      recommendations: [
        {
          position: "background",
          semanticContext: `建议行动背景，前进方向感，与${title}相关`,
          style: "forward momentum abstract dark",
          optional: false,
        },
      ],
    };

    // 获取默认需求，如果没有则使用通用背景
    const requirements = defaultRequirements[templateType];

    if (requirements) {
      return requirements;
    }

    // toc 页面不需要图像
    if (templateType === "toc") {
      return [];
    }

    // 其他类型使用通用背景
    return [
      {
        position: "background",
        semanticContext: `${title} - 专业深色背景，抽象几何元素`,
        style: "abstract dark professional gradient",
        optional: false,
      },
    ];
  }

  /**
   * 获取占位图 URL
   */
  getPlaceholderUrl(
    position: ImageRequirement["position"],
    width?: number,
    height?: number,
  ): string {
    const w = width || (position === "icon" ? 64 : 400);
    const h = height || (position === "icon" ? 64 : 300);

    // 使用 placeholder.com 或类似服务
    return `https://via.placeholder.com/${w}x${h}/1E293B/94A3B8?text=Image`;
  }

  /**
   * 验证图像 URL
   */
  async validateImageUrl(url: string): Promise<boolean> {
    try {
      // 简单验证 URL 格式
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
}
