/**
 * Slide Image Generation Service
 *
 * 幻灯片图像生成服务
 *
 * 职责：
 * 1. 调用图像模型生成幻灯片配图
 * 2. 生成背景图像
 * 3. 处理不同图像模型的 API 差异
 *
 * 复用 AI-Image 模块的图像生成能力
 */

import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { R2StorageService } from "../../storage/r2-storage.service";

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
    private readonly httpService: HttpService,
    private readonly r2Storage: R2StorageService,
  ) {}

  /**
   * 生成图像
   */
  async generateImage(
    prompt: string,
    options: ImageGenerationOptions,
  ): Promise<GeneratedImage | null> {
    const { model, aspectRatio = "16:9", purpose = "content" } = options;

    this.logger.log(
      `[generateImage] Generating ${purpose} image with ${model.name}: ${prompt.slice(0, 100)}...`,
    );

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
      // 根据 provider 调用不同的 API
      const provider = model.provider?.toLowerCase() || "";

      let imageBase64: string;

      if (provider.includes("google") || model.modelId.includes("imagen")) {
        imageBase64 = await this.callGoogleImagenAPI(
          model,
          enhancedPrompt,
          dimensions,
          negativePrompt,
        );
      } else if (provider.includes("flux") || model.modelId.includes("flux")) {
        imageBase64 = await this.callFluxAPI(
          model,
          enhancedPrompt,
          dimensions,
          negativePrompt,
        );
      } else if (
        provider.includes("stability") ||
        model.modelId.includes("stable")
      ) {
        imageBase64 = await this.callStabilityAPI(
          model,
          enhancedPrompt,
          dimensions,
          negativePrompt,
        );
      } else {
        // 默认使用 OpenAI 兼容 API
        imageBase64 = await this.callOpenAIImageAPI(
          model,
          enhancedPrompt,
          dimensions,
        );
      }

      if (!imageBase64) {
        this.logger.warn("[generateImage] No image data returned");
        return null;
      }

      // 上传到 R2 存储
      const imageUrl = await this.uploadImage(imageBase64, purpose);

      this.logger.log(
        `[generateImage] Image generated and uploaded: ${imageUrl}`,
      );

      return {
        url: imageUrl,
        width: dimensions.width,
        height: dimensions.height,
        prompt: enhancedPrompt,
      };
    } catch (error) {
      this.logger.error("[generateImage] Error generating image:", error);
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

  /**
   * 调用 Google Imagen API
   */
  private async callGoogleImagenAPI(
    model: { apiKey: string; modelId: string },
    prompt: string,
    dimensions: { width: number; height: number },
    negativePrompt: string,
  ): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model.modelId}:generateImages`;

    const response = await firstValueFrom(
      this.httpService.post(
        url,
        {
          prompt,
          negativePrompt,
          numberOfImages: 1,
          aspectRatio: this.getGoogleAspectRatio(dimensions),
          safetyFilterLevel: "block_only_high",
        },
        {
          headers: {
            "x-goog-api-key": model.apiKey,
            "Content-Type": "application/json",
          },
          timeout: 60000,
        },
      ),
    );

    const images = response.data?.images || response.data?.predictions;
    if (!images || images.length === 0) {
      throw new Error("No images returned from Imagen API");
    }

    // 返回 base64 数据
    return images[0].bytesBase64Encoded || images[0].image?.bytesBase64Encoded;
  }

  /**
   * 调用 Flux API (Black Forest Labs)
   */
  private async callFluxAPI(
    model: { apiKey: string; apiEndpoint?: string; modelId: string },
    prompt: string,
    dimensions: { width: number; height: number },
    _negativePrompt: string,
  ): Promise<string> {
    const endpoint = model.apiEndpoint || "https://api.bfl.ml/v1";
    const url = `${endpoint}/flux-pro-1.1`;

    const response = await firstValueFrom(
      this.httpService.post(
        url,
        {
          prompt,
          width: dimensions.width,
          height: dimensions.height,
          prompt_upsampling: true,
          safety_tolerance: 2,
        },
        {
          headers: {
            "X-Key": model.apiKey,
            "Content-Type": "application/json",
          },
          timeout: 120000,
        },
      ),
    );

    // Flux 返回任务 ID，需要轮询获取结果
    const taskId = response.data?.id;
    if (!taskId) {
      throw new Error("No task ID returned from Flux API");
    }

    // 轮询获取结果
    return await this.pollFluxResult(endpoint, model.apiKey, taskId);
  }

  /**
   * 轮询 Flux 任务结果
   */
  private async pollFluxResult(
    endpoint: string,
    apiKey: string,
    taskId: string,
  ): Promise<string> {
    const maxAttempts = 30;
    const pollInterval = 2000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));

      const response = await firstValueFrom(
        this.httpService.get(`${endpoint}/get_result?id=${taskId}`, {
          headers: { "X-Key": apiKey },
          timeout: 30000,
        }),
      );

      const status = response.data?.status;

      if (status === "Ready") {
        const imageUrl = response.data?.result?.sample;
        if (imageUrl) {
          // 下载图片并转换为 base64
          return await this.downloadImageAsBase64(imageUrl);
        }
      }

      if (status === "Error" || status === "Failed") {
        throw new Error(
          `Flux task failed: ${response.data?.error || "Unknown error"}`,
        );
      }
    }

    throw new Error("Flux task timeout");
  }

  /**
   * 调用 Stability AI API
   */
  private async callStabilityAPI(
    model: { apiKey: string; apiEndpoint?: string; modelId: string },
    prompt: string,
    dimensions: { width: number; height: number },
    negativePrompt: string,
  ): Promise<string> {
    const endpoint = model.apiEndpoint || "https://api.stability.ai";
    const url = `${endpoint}/v2beta/stable-image/generate/core`;

    const formData = new FormData();
    formData.append("prompt", prompt);
    formData.append("negative_prompt", negativePrompt);
    formData.append("aspect_ratio", this.getStabilityAspectRatio(dimensions));
    formData.append("output_format", "png");

    const response = await firstValueFrom(
      this.httpService.post(url, formData, {
        headers: {
          Authorization: `Bearer ${model.apiKey}`,
          Accept: "application/json",
        },
        timeout: 60000,
      }),
    );

    return response.data?.image;
  }

  /**
   * 调用 OpenAI 图像 API (DALL-E)
   */
  private async callOpenAIImageAPI(
    model: { apiKey: string; apiEndpoint?: string; modelId: string },
    prompt: string,
    dimensions: { width: number; height: number },
  ): Promise<string> {
    const endpoint = model.apiEndpoint || "https://api.openai.com/v1";
    const url = `${endpoint}/images/generations`;

    // DALL-E 只支持特定尺寸
    const size = this.getOpenAISize(dimensions);

    const response = await firstValueFrom(
      this.httpService.post(
        url,
        {
          model: model.modelId || "dall-e-3",
          prompt,
          n: 1,
          size,
          response_format: "b64_json",
          quality: "hd",
        },
        {
          headers: {
            Authorization: `Bearer ${model.apiKey}`,
            "Content-Type": "application/json",
          },
          timeout: 60000,
        },
      ),
    );

    return response.data?.data?.[0]?.b64_json;
  }

  /**
   * 上传图像到 R2 存储
   */
  private async uploadImage(
    base64Data: string,
    purpose: string,
  ): Promise<string> {
    try {
      // 如果已经是完整的 data URL，提取 base64 部分
      const pureBase64 = base64Data.includes("base64,")
        ? base64Data.split("base64,")[1]
        : base64Data;

      const buffer = Buffer.from(pureBase64, "base64");
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.png`;

      const result = await this.r2Storage.uploadBuffer(
        buffer,
        `ppt/${purpose}`,
        filename,
        "image/png",
      );

      if (result.success && result.url) {
        return result.url;
      }

      throw new Error(result.error || "Upload failed");
    } catch (error) {
      this.logger.warn(
        "[uploadImage] R2 upload failed, using data URL:",
        error,
      );
      // 回退到 data URL
      return `data:image/png;base64,${base64Data}`;
    }
  }

  /**
   * 下载图片并转换为 base64
   */
  private async downloadImageAsBase64(url: string): Promise<string> {
    const response = await firstValueFrom(
      this.httpService.get(url, {
        responseType: "arraybuffer",
        timeout: 30000,
      }),
    );

    return Buffer.from(response.data).toString("base64");
  }

  /**
   * 获取 Google Imagen 的宽高比格式
   */
  private getGoogleAspectRatio(dimensions: {
    width: number;
    height: number;
  }): string {
    const ratio = dimensions.width / dimensions.height;

    if (Math.abs(ratio - 16 / 9) < 0.1) return "16:9";
    if (Math.abs(ratio - 4 / 3) < 0.1) return "4:3";
    if (Math.abs(ratio - 9 / 16) < 0.1) return "9:16";
    if (Math.abs(ratio - 3 / 4) < 0.1) return "3:4";
    return "1:1";
  }

  /**
   * 获取 Stability AI 的宽高比格式
   */
  private getStabilityAspectRatio(dimensions: {
    width: number;
    height: number;
  }): string {
    const ratio = dimensions.width / dimensions.height;

    if (Math.abs(ratio - 16 / 9) < 0.1) return "16:9";
    if (Math.abs(ratio - 4 / 3) < 0.1) return "4:3";
    if (Math.abs(ratio - 9 / 16) < 0.1) return "9:16";
    if (Math.abs(ratio - 3 / 4) < 0.1) return "3:4";
    if (Math.abs(ratio - 21 / 9) < 0.1) return "21:9";
    return "1:1";
  }

  /**
   * 获取 OpenAI DALL-E 的尺寸格式
   */
  private getOpenAISize(dimensions: { width: number; height: number }): string {
    const ratio = dimensions.width / dimensions.height;

    // DALL-E 3 支持的尺寸
    if (ratio > 1.5) return "1792x1024"; // 接近 16:9
    if (ratio < 0.7) return "1024x1792"; // 接近 9:16
    return "1024x1024"; // 1:1
  }
}
