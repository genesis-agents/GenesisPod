/**
 * AI Engine - Together AI Image Adapter
 * Together AI (FLUX) 图像生成适配器
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
export class TogetherImageAdapter extends BaseImageAdapter {
  readonly id = "together";
  readonly name = "Together AI";
  readonly provider: ImageProvider = IMAGE_PROVIDERS.TOGETHER;

  readonly supportedModels = [
    IMAGE_MODELS.FLUX_SCHNELL,
    IMAGE_MODELS.FLUX_PRO,
    "black-forest-labs/FLUX.1-schnell-Free",
    "black-forest-labs/FLUX.1.1-pro",
    "black-forest-labs/FLUX.1-schnell",
  ];

  readonly defaultModel = IMAGE_MODELS.FLUX_SCHNELL;

  private apiKey: string = "";

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

  private initializeModelConfigs(): void {
    this.registerModelConfig({
      id: IMAGE_MODELS.FLUX_SCHNELL,
      name: "FLUX.1 Schnell (Free)",
      maxWidth: 1440,
      maxHeight: 1440,
      supportedAspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
      supportsNegativePrompt: false,
      supportsImageToImage: false,
    });

    this.registerModelConfig({
      id: IMAGE_MODELS.FLUX_PRO,
      name: "FLUX 1.1 Pro",
      maxWidth: 1440,
      maxHeight: 1440,
      supportedAspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
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
      throw new Error("Together API key not configured");
    }

    const { width, height } = this.getDimensions(options);

    this.logger.log(`Together generate: ${model}, ${width}x${height}`);

    const response = await firstValueFrom(
      this.httpService.post(
        "https://api.together.xyz/v1/images/generations",
        {
          model,
          prompt: options.prompt,
          width,
          height,
          n: options.count || 1,
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
   * 解析响应
   */
  private parseResponse(
    data: Record<string, unknown>,
    model: string,
  ): ImageGenerationResult {
    type TogetherData = { data?: Array<{ b64_json?: string; url?: string }> };
    const images = (data as TogetherData).data;
    if (!images || images.length === 0) {
      throw new Error("No images in Together response");
    }

    return {
      images: images.map((img) => {
        if (img.b64_json) {
          return {
            url: `data:image/png;base64,${img.b64_json}`,
            isBase64: true,
            mimeType: "image/png",
          };
        }
        return {
          url: img.url ?? "",
          isBase64: false,
        };
      }),
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

