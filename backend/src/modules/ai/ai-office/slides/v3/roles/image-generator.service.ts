/**
 * Slides Engine v3.0 - Image Generator Service
 *
 * 图像生成器角色：负责生成幻灯片所需的图像
 * 复用 AI Image 模块的 ImageGenerationService
 */

import { Injectable, Logger } from "@nestjs/common";
import { ImageGenerationService } from "../../../../ai-image/generation/image-generation.service";
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

  constructor(
    private readonly imageGenerationService: ImageGenerationService,
  ) {}

  /**
   * 为单页生成图像
   */
  async generateForPage(
    input: PageImageGenerationInput,
  ): Promise<PageImageGenerationResult> {
    const { pageOutline, globalStyles } = input;

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
   * 生成单张图像 - 使用 ImageGenerationService
   */
  private async generateImage(
    requirement: ImageRequirement,
    pageOutline: PageOutline,
    globalStyles?: GlobalStyles,
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
      `[generateImage] Generating image for page ${pageOutline.pageNumber}, position=${requirement.position}`,
    );
    this.logger.debug(`[generateImage] Prompt: ${prompt.substring(0, 100)}...`);

    // 获取图像生成模型配置
    const imageModel = await this.imageGenerationService.getDefaultImageModel();

    if (!imageModel) {
      this.logger.error("[generateImage] No image generation model available");
      return null;
    }

    this.logger.log(
      `[generateImage] Using model: ${imageModel.name} (${imageModel.modelId})`,
    );

    // 根据 position 确定尺寸
    const dimensions = this.getDimensions(requirement.position);

    try {
      // 调用 ImageGenerationService 的 API
      const imageUrl = await this.imageGenerationService.callImageGenerationAPI(
        imageModel,
        prompt,
        dimensions,
      );

      this.logger.log(
        `[generateImage] Image generated successfully for page ${pageOutline.pageNumber}`,
      );

      return {
        id: uuidv4(),
        url: imageUrl,
        prompt,
        semanticContext: requirement.semanticContext,
        position: requirement.position,
        width: dimensions.width,
        height: dimensions.height,
        generatedAt: new Date(),
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[generateImage] Image generation FAILED for page ${pageOutline.pageNumber}: ${errorMsg}`,
      );
      return null;
    }
  }

  /**
   * 根据 position 获取图像尺寸
   */
  private getDimensions(position: ImageRequirement["position"]): {
    width: number;
    height: number;
  } {
    const dimensionsMap: Record<string, { width: number; height: number }> = {
      background: { width: 1280, height: 720 }, // 16:9
      inline: { width: 800, height: 600 }, // 4:3
      card: { width: 800, height: 600 }, // 4:3
      icon: { width: 512, height: 512 }, // 1:1
    };

    return dimensionsMap[position] || { width: 1024, height: 1024 };
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
