/**
 * AI Engine - OpenAI Image Adapter
 * OpenAI DALL-E 图像生成适配器
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
export class OpenAIImageAdapter extends BaseImageAdapter {
  readonly id = "openai";
  readonly name = "OpenAI DALL-E";
  readonly provider: ImageProvider = IMAGE_PROVIDERS.OPENAI;

  readonly supportedModels = [
    IMAGE_MODELS.DALLE_3,
    IMAGE_MODELS.DALLE_2,
    "dall-e-3",
    "dall-e-2",
  ];

  readonly defaultModel = IMAGE_MODELS.DALLE_3;

  private apiKey: string = "";
  private baseUrl: string = "https://api.openai.com/v1";

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
      id: IMAGE_MODELS.DALLE_3,
      name: "DALL-E 3",
      maxWidth: 1792,
      maxHeight: 1792,
      supportedAspectRatios: ["1:1", "16:9", "9:16"],
      supportsNegativePrompt: false,
      supportsImageToImage: false,
    });

    this.registerModelConfig({
      id: IMAGE_MODELS.DALLE_2,
      name: "DALL-E 2",
      maxWidth: 1024,
      maxHeight: 1024,
      supportedAspectRatios: ["1:1"],
      supportsNegativePrompt: false,
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
      throw new Error("OpenAI API key not configured");
    }

    const { width, height } = this.getDimensions(options);
    const size = this.getSizeString(width, height, model);

    const url = `${this.baseUrl}/images/generations`;

    this.logger.log(`OpenAI generate: ${model}, size=${size}`);

    const response = await firstValueFrom(
      this.httpService.post(
        url,
        {
          model,
          prompt: options.prompt,
          n: options.count || 1,
          size,
          quality: options.quality || "hd",
          response_format: "url",
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          timeout: options.timeout || 120000,
        },
      ),
    );

    return this.parseResponse(response.data, model);
  }

  /**
   * 获取尺寸字符串
   */
  private getSizeString(width: number, height: number, model: string): string {
    if (model === IMAGE_MODELS.DALLE_2) {
      return "1024x1024";
    }

    // DALL-E 3 支持的尺寸
    if (width === height) {
      return "1024x1024";
    }
    if (width > height) {
      return "1792x1024";
    }
    return "1024x1792";
  }

  /**
   * 解析响应
   */
  private parseResponse(
    data: Record<string, unknown>,
    model: string,
  ): ImageGenerationResult {
    type OpenAIImageData = {
      data?: Array<{ url?: string; revised_prompt?: string }>;
    };
    const images = (data as OpenAIImageData).data;
    if (!images || images.length === 0) {
      throw new Error("No images in OpenAI response");
    }

    return {
      images: images.map((img) => ({
        url: img.url ?? "",
        isBase64: false,
        revisedPrompt: img.revised_prompt,
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
    return {
      width: options.width || 1024,
      height: options.height || 1024,
    };
  }
}

