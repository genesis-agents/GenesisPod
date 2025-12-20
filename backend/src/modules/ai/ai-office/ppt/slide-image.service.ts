/**
 * Slide Image Generation Service
 *
 * 幻灯片图像生成服务
 *
 * 职责：
 * 1. 调用图像模型生成幻灯片配图
 * 2. 生成背景图像
 *
 * 重要：复用 AIImageService 的图像生成能力，不重复实现
 */

import { Injectable, Logger } from "@nestjs/common";
import { AiImageService } from "../../ai-image/generation/generation.service";
import { R2StorageService } from "../../../core/storage/r2-storage.service";

export interface GeneratedImage {
  url: string;
  width: number;
  height: number;
  prompt: string;
}

export interface ImageGenerationOptions {
  model: {
    id: string;
    name: string;
    provider: string;
    modelId: string;
    apiKey: string;
    apiEndpoint?: string;
  };
  style?: string;
  aspectRatio?: "16:9" | "4:3" | "1:1" | "9:16";
  purpose?: "background" | "content" | "icon";
  negativePrompt?: string;
}

// 尺寸映射
const ASPECT_RATIO_DIMENSIONS: Record<
  string,
  { width: number; height: number }
> = {
  "16:9": { width: 1920, height: 1080 },
  "4:3": { width: 1600, height: 1200 },
  "1:1": { width: 1024, height: 1024 },
  "9:16": { width: 1080, height: 1920 },
};

@Injectable()
export class SlideImageService {
  private readonly logger = new Logger(SlideImageService.name);

  constructor(
    private readonly aiImageService: AiImageService,
    private readonly r2Storage: R2StorageService,
  ) {}

  /**
   * 生成图像
   * 复用 AIImageService 的图像生成能力
   */
  async generateImage(
    prompt: string,
    options: ImageGenerationOptions,
  ): Promise<GeneratedImage | null> {
    const { model, aspectRatio = "16:9", purpose = "content" } = options;

    this.logger.log(
      `[generateImage] Generating ${purpose} image with ${model.name} (provider: ${model.provider}, modelId: ${model.modelId})`,
    );
    this.logger.debug(`[generateImage] Prompt: ${prompt.slice(0, 100)}...`);

    const dimensions = ASPECT_RATIO_DIMENSIONS[aspectRatio];

    // 增强提示词
    const enhancedPrompt = this.enhancePrompt(prompt, purpose, options.style);

    // 默认负面提示词
    const negativePrompt =
      options.negativePrompt ||
      (purpose === "background"
        ? "text, typography, letters, words, numbers, faces, people, cluttered, busy"
        : "blurry, low quality, distorted, watermark, text overlay");

    try {
      // 直接调用 AIImageService 的 generateImage 方法
      const result = await this.aiImageService.generateImage({
        prompt: enhancedPrompt,
        imageModelId: model.id,
        style: options.style || "professional",
        aspectRatio: aspectRatio,
        negativePrompt: negativePrompt,
        skipEnhancement: true, // PPT 已经增强过提示词了
      });

      if (result.error || !result.imageUrl) {
        this.logger.warn(
          `[generateImage] AIImageService returned error: ${result.error}`,
        );
        return null;
      }

      // 强制上传到 B2/R2，禁止存储 base64
      let finalUrl = result.imageUrl;
      if (finalUrl.startsWith("data:image")) {
        if (!this.r2Storage.isEnabled()) {
          this.logger.error(
            "[generateImage] B2/R2 storage not configured! Cannot store base64 in database.",
          );
          throw new Error(
            "Object storage (B2/R2) not configured. PPT images must be stored in cloud storage.",
          );
        }

        this.logger.log("[generateImage] Uploading image to B2/R2...");
        const uploadResult = await this.r2Storage.uploadBase64Image(
          finalUrl,
          "ppt/slides",
        );

        if (!uploadResult.success || !uploadResult.url) {
          this.logger.error(
            `[generateImage] B2/R2 upload failed: ${uploadResult.error}`,
          );
          throw new Error(
            `Failed to upload image to storage: ${uploadResult.error}`,
          );
        }

        finalUrl = uploadResult.url;
        this.logger.log(`[generateImage] Uploaded to B2/R2: ${finalUrl}`);
      }

      this.logger.log(
        `[generateImage] Image generated successfully: ${finalUrl.slice(0, 100)}...`,
      );

      return {
        url: finalUrl,
        width: result.width || dimensions.width,
        height: result.height || dimensions.height,
        prompt: enhancedPrompt,
      };
    } catch (error: any) {
      this.logger.error(
        `[generateImage] Error generating image: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * 增强提示词
   */
  private enhancePrompt(
    prompt: string,
    purpose: string,
    style?: string,
  ): string {
    const styleModifiers = {
      professional: "professional, corporate, clean, modern",
      creative: "creative, colorful, artistic, dynamic",
      minimal: "minimalist, simple, clean, elegant",
      tech: "futuristic, technology, digital, sleek",
      academic: "scholarly, formal, educational, informative",
    };

    const baseStyle =
      styleModifiers[style as keyof typeof styleModifiers] ||
      styleModifiers.professional;

    if (purpose === "background") {
      return `${prompt}. Style: ${baseStyle}, abstract background, subtle patterns, no text, no icons, high resolution, 8K quality`;
    }

    return `${prompt}. Style: ${baseStyle}, high quality illustration, clear subject, well-composed, professional presentation visual`;
  }
}
