/**
 * AI Engine - Stability AI Image Adapter
 * Stability AI (Stable Diffusion) 图像生成适配器
 */

import { Injectable } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { BaseImageAdapter } from "./base-image.adapter";
import {
  ImageProvider,
  IMAGE_PROVIDERS,
  IMAGE_MODELS,
  ImageGenerationOptions,
  ImageGenerationResult,
} from "../abstractions/image-adapter.interface";

@Injectable()
export class StabilityImageAdapter extends BaseImageAdapter {
  readonly id = "stability";
  readonly name = "Stability AI";
  readonly provider: ImageProvider = IMAGE_PROVIDERS.STABILITY;

  readonly supportedModels = [
    IMAGE_MODELS.SDXL,
    IMAGE_MODELS.SD3,
    "stable-diffusion-xl-1024-v1-0",
    "sd3-large",
    "sd3-medium",
  ];

  readonly defaultModel = IMAGE_MODELS.SDXL;

  private apiKey: string = "";
  private baseUrl: string = "https://api.stability.ai/v1";

  constructor(private readonly httpService: HttpService) {
    super();
    this.initializeModelConfigs();
  }

  /**
   * 设置 API Key
   */
  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  /**
   * 设置 Base URL
   */
  setBaseUrl(baseUrl: string): void {
    this.baseUrl = baseUrl;
  }

  private initializeModelConfigs(): void {
    this.registerModelConfig({
      id: IMAGE_MODELS.SDXL,
      name: "Stable Diffusion XL",
      maxWidth: 1024,
      maxHeight: 1024,
      supportedAspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
      supportsNegativePrompt: true,
      supportsImageToImage: true,
    });

    this.registerModelConfig({
      id: IMAGE_MODELS.SD3,
      name: "Stable Diffusion 3",
      maxWidth: 1536,
      maxHeight: 1536,
      supportedAspectRatios: ["1:1", "16:9", "9:16"],
      supportsNegativePrompt: true,
      supportsImageToImage: true,
    });
  }

  /**
   * 生成图像
   */
  async generate(
    options: ImageGenerationOptions,
  ): Promise<ImageGenerationResult> {
    const model = this.getEffectiveModel(options.model);
    const apiKey = this.apiKey;

    if (!apiKey) {
      throw new Error("Stability API key not configured");
    }

    const { width, height } = this.getDimensions(options);
    const url = `${this.baseUrl}/generation/${model}/text-to-image`;

    this.logger.log(`Stability generate: ${model}, ${width}x${height}`);

    const textPrompts = [{ text: options.prompt, weight: 1 }];
    if (options.negativePrompt) {
      textPrompts.push({ text: options.negativePrompt, weight: -1 });
    }

    const response = await firstValueFrom(
      this.httpService.post(
        url,
        {
          text_prompts: textPrompts,
          cfg_scale: 7,
          width,
          height,
          samples: options.count || 1,
          steps: 30,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          timeout: options.timeout || 120000,
        },
      ),
    );

    return this.parseResponse(response.data, model);
  }

  /**
   * 解析响应
   */
  private parseResponse(
    data: Record<string, unknown>,
    model: string,
  ): ImageGenerationResult {
    type StabilityData = { artifacts?: Array<{ base64?: string }> };
    const artifacts = (data as StabilityData).artifacts;
    if (!artifacts || artifacts.length === 0) {
      throw new Error("No artifacts in Stability response");
    }

    return {
      images: artifacts.map((artifact) => ({
        url: `data:image/png;base64,${artifact.base64}`,
        isBase64: true,
        mimeType: "image/png",
      })),
      model,
      provider: this.provider,
    };
  }

  /**
   * 获取尺寸
   */
  private getDimensions(options: ImageGenerationOptions): {
    width: number;
    height: number;
  } {
    // Stability 要求尺寸是 64 的倍数
    const width = Math.round((options.width || 1024) / 64) * 64;
    const height = Math.round((options.height || 1024) / 64) * 64;
    return { width, height };
  }
}

