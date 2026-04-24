/**
 * AI Engine - Gemini Image Adapter
 * Google Gemini/Imagen 图像生成适配器
 */

import { Injectable } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { BaseImageAdapter } from "./base-image-adapter";
import {
  ImageProvider,
  IMAGE_PROVIDERS,
  IMAGE_MODELS,
  ImageGenerationOptions,
  ImageGenerationResult,
} from "../abstractions/image-adapter.interface";

@Injectable()
export class GeminiImageAdapter extends BaseImageAdapter {
  readonly id = "gemini";
  readonly name = "Google Gemini/Imagen";
  readonly provider: ImageProvider = IMAGE_PROVIDERS.GEMINI;

  readonly supportedModels = [
    IMAGE_MODELS.GEMINI_2_FLASH,
    IMAGE_MODELS.IMAGEN_3,
    IMAGE_MODELS.IMAGEN_3_FAST,
    "gemini-2.0-flash-exp",
    "gemini-1.5-flash",
    "imagen-3.0-generate-001",
    "imagen-3.0-fast-generate-001",
  ];

  readonly defaultModel = IMAGE_MODELS.GEMINI_2_FLASH;

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
      id: IMAGE_MODELS.GEMINI_2_FLASH,
      name: "Gemini 2.0 Flash",
      maxWidth: 2048,
      maxHeight: 2048,
      supportedAspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
      supportsNegativePrompt: false,
      supportsImageToImage: true,
    });

    this.registerModelConfig({
      id: IMAGE_MODELS.IMAGEN_3,
      name: "Imagen 3",
      maxWidth: 2048,
      maxHeight: 2048,
      supportedAspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
      supportsNegativePrompt: true,
      supportsImageToImage: false,
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
      throw new Error("Gemini API key not configured");
    }

    const { width, height } = this.getDimensions(options);

    // Route to appropriate method based on model
    if (model.includes("imagen")) {
      return this.generateWithImagen(apiKey, model, options.prompt, {
        width,
        height,
      });
    }

    return this.generateWithGemini(apiKey, model, options.prompt, {
      width,
      height,
    });
  }

  /**
   * 图像到图像转换
   */
  async imageToImage(
    options: ImageGenerationOptions & { referenceImage: string },
  ): Promise<ImageGenerationResult> {
    const model = this.getEffectiveModel(options.model);
    const apiKey = this.apiKey;

    if (!apiKey) {
      throw new Error("Gemini API key not configured");
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const base64Data = options.referenceImage.replace(
      /^data:image\/[a-z]+;base64,/,
      "",
    );
    const mimeType =
      options.referenceImage.match(/^data:(image\/[a-z]+);base64,/)?.[1] ||
      "image/jpeg";

    this.logger.log(`Gemini Image-to-Image: ${model}`);

    const response = await firstValueFrom(
      this.httpService.post(
        url,
        {
          contents: [
            {
              parts: [
                { inlineData: { mimeType, data: base64Data } },
                { text: options.prompt },
              ],
            },
          ],
          generationConfig: {
            responseModalities: ["IMAGE"],
          },
        },
        {
          headers: { "Content-Type": "application/json" },
          timeout: options.timeout || 120000,
        },
      ),
    );

    return this.parseGeminiResponse(response.data, model);
  }

  /**
   * Gemini 生成
   */
  private async generateWithGemini(
    apiKey: string,
    model: string,
    prompt: string,
    _dimensions: { width: number; height: number },
  ): Promise<ImageGenerationResult> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    this.logger.log(
      `Gemini generate: ${model}, prompt="${prompt.slice(0, 50)}..."`,
    );

    const response = await firstValueFrom(
      this.httpService.post(
        url,
        {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseModalities: ["TEXT", "IMAGE"],
          },
        },
        {
          headers: { "Content-Type": "application/json" },
          timeout: 120000,
        },
      ),
    );

    return this.parseGeminiResponse(response.data, model);
  }

  /**
   * Imagen 生成
   */
  private async generateWithImagen(
    apiKey: string,
    model: string,
    prompt: string,
    dimensions: { width: number; height: number },
  ): Promise<ImageGenerationResult> {
    const aspectRatio = this.calculateAspectRatio(
      dimensions.width,
      dimensions.height,
    );

    // Try generateImages endpoint first
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateImages?key=${apiKey}`;

      this.logger.log(`Imagen generate: ${model}, aspectRatio=${aspectRatio}`);

      const response = await firstValueFrom(
        this.httpService.post(
          url,
          {
            prompt,
            config: {
              aspectRatio,
              numberOfImages: 1,
            },
          },
          {
            headers: { "Content-Type": "application/json" },
            timeout: 120000,
          },
        ),
      );

      return this.parseImagenResponse(response.data, model);
    } catch (error: unknown) {
      // Fallback to predict endpoint or Gemini Flash
      if (
        (error as { response?: { status?: number } }).response?.status === 404
      ) {
        this.logger.warn(`Imagen generateImages not found, trying predict...`);
        return this.generateWithImagenPredict(
          apiKey,
          model,
          prompt,
          aspectRatio,
        );
      }
      throw error;
    }
  }

  /**
   * Imagen predict endpoint (fallback)
   */
  private async generateWithImagenPredict(
    apiKey: string,
    model: string,
    prompt: string,
    aspectRatio: string,
  ): Promise<ImageGenerationResult> {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${apiKey}`;

      const response = await firstValueFrom(
        this.httpService.post(
          url,
          {
            instances: [{ prompt }],
            parameters: {
              sampleCount: 1,
              aspectRatio,
            },
          },
          {
            headers: { "Content-Type": "application/json" },
            timeout: 120000,
          },
        ),
      );

      const predictions = response.data?.predictions;
      if (!predictions || predictions.length === 0) {
        throw new Error("No predictions in Imagen response");
      }

      const imageData = predictions[0]?.bytesBase64Encoded;
      if (!imageData) {
        throw new Error("No image data in Imagen predict response");
      }

      return {
        images: [
          {
            url: `data:image/png;base64,${imageData}`,
            isBase64: true,
            mimeType: "image/png",
          },
        ],
        model,
        provider: this.provider,
      };
    } catch (error) {
      // 之前此处静默 fallback 到硬编码 "gemini-2.0-flash-exp"，
      // 违反 CLAUDE.md 规则（任何 fallback 不得用具体模型字面量）。
      // 正确做法：直接把 Imagen 调用失败抛出，由上层 ImageGenerationService
      // 根据 DB 中 IMAGE_GENERATION 的配置选择可用模型，或让用户/运维看到
      // 真实错误——不要偷偷路由到某个可能未配置的模型上。
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Imagen predict failed for model ${model}: ${msg}. No silent fallback.`,
      );
      throw error instanceof Error
        ? error
        : new Error(`Imagen predict failed: ${msg}`);
    }
  }

  /**
   * 解析 Gemini 响应
   */
  private parseGeminiResponse(
    data: Record<string, unknown>,
    model: string,
  ): ImageGenerationResult {
    type GeminiData = {
      candidates?: Array<{
        content?: {
          parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }>;
        };
      }>;
    };
    const d = data as GeminiData;
    const candidates = d.candidates;
    if (!candidates || candidates.length === 0) {
      throw new Error("No candidates in Gemini response");
    }

    const parts = candidates[0].content?.parts;
    if (parts) {
      for (const part of parts) {
        if (part.inlineData?.data) {
          const mimeType = part.inlineData.mimeType ?? "image/png";
          return {
            images: [
              {
                url: `data:${mimeType};base64,${part.inlineData.data}`,
                isBase64: true,
                mimeType,
              },
            ],
            model,
            provider: this.provider,
          };
        }
      }
    }

    throw new Error("No image data in Gemini response");
  }

  /**
   * 解析 Imagen 响应
   */
  private parseImagenResponse(
    data: Record<string, unknown>,
    model: string,
  ): ImageGenerationResult {
    type ImagenData = {
      generatedImages?: Array<{
        image?: { imageType?: string; bytesBase64Encoded?: string };
      }>;
    };
    const d = data as ImagenData;
    const images = d.generatedImages;
    if (!images || images.length === 0) {
      throw new Error("No images in Imagen response");
    }

    const imageData = images[0]?.image;
    if (!imageData) {
      throw new Error("No image data in Imagen response");
    }

    const mimeType = imageData.imageType ?? "image/png";
    return {
      images: [
        {
          url: `data:${mimeType};base64,${imageData.bytesBase64Encoded}`,
          isBase64: true,
          mimeType,
        },
      ],
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
