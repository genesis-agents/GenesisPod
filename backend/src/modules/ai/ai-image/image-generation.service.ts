/**
 * Image Generation Service
 *
 * This service handles all image generation APIs and provider integrations
 */

import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { firstValueFrom } from "rxjs";
import { AIModelType, Prisma } from "@prisma/client";
import { GEMINI_IMAGE_MODELS } from "./ai-image.constants";

@Injectable()
export class ImageGenerationService {
  private readonly logger = new Logger(ImageGenerationService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Get default text model (for prompt enhancement)
   */
  async getDefaultTextModel() {
    const googleConditions: Prisma.AIModelWhereInput = {
      OR: [
        {
          provider: {
            contains: "google",
            mode: Prisma.QueryMode.insensitive,
          },
        },
        {
          provider: {
            contains: "gemini",
            mode: Prisma.QueryMode.insensitive,
          },
        },
        {
          modelId: {
            contains: "gemini",
            mode: Prisma.QueryMode.insensitive,
          },
        },
      ],
    };

    // 1) Find default CHAT model
    const defaultModel = await this.prisma.aIModel.findFirst({
      where: {
        isEnabled: true,
        isDefault: true,
        modelType: AIModelType.CHAT,
      },
      orderBy: { createdAt: "desc" },
    });

    if (defaultModel) {
      this.logger.log(
        `[getDefaultTextModel] Found default CHAT model: ${defaultModel.displayName || defaultModel.name} (${defaultModel.modelId})`,
      );
      return defaultModel;
    }

    // 2) If no default, prefer Google/Gemini
    const googleModel = await this.prisma.aIModel.findFirst({
      where: {
        isEnabled: true,
        modelType: AIModelType.CHAT,
        ...googleConditions,
      },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
    if (googleModel) {
      this.logger.log(
        `[getDefaultTextModel] Found Google/Gemini CHAT model: ${googleModel.displayName || googleModel.name} (${googleModel.modelId})`,
      );
      return googleModel;
    }

    // 3) Fallback to any available chat model
    const anyModel = await this.prisma.aIModel.findFirst({
      where: {
        isEnabled: true,
        modelType: AIModelType.CHAT,
      },
      orderBy: { createdAt: "desc" },
    });
    if (anyModel) {
      this.logger.log(
        `[getDefaultTextModel] Found fallback CHAT model: ${anyModel.displayName || anyModel.name} (${anyModel.modelId})`,
      );
    }

    return anyModel;
  }

  /**
   * Get default image generation model
   */
  async getDefaultImageModel() {
    // Find default IMAGE_GENERATION model
    const defaultModel = await this.prisma.aIModel.findFirst({
      where: {
        isEnabled: true,
        isDefault: true,
        modelType: AIModelType.IMAGE_GENERATION,
      },
    });

    if (defaultModel) {
      this.logger.log(
        `[getDefaultImageModel] Found default IMAGE_GENERATION model: ${defaultModel.name} (${defaultModel.provider})`,
      );
      return defaultModel;
    }

    // Find any available IMAGE_GENERATION model
    const anyImageModel = await this.prisma.aIModel.findFirst({
      where: {
        isEnabled: true,
        modelType: AIModelType.IMAGE_GENERATION,
      },
      orderBy: { createdAt: "desc" },
    });

    if (anyImageModel) {
      this.logger.log(
        `[getDefaultImageModel] Found fallback IMAGE_GENERATION model: ${anyImageModel.name} (${anyImageModel.provider})`,
      );
      return anyImageModel;
    }

    // Fallback to MULTIMODAL model
    const multimodalModel = await this.prisma.aIModel.findFirst({
      where: {
        isEnabled: true,
        modelType: AIModelType.MULTIMODAL,
      },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });

    if (multimodalModel) {
      this.logger.log(
        `[getDefaultImageModel] Found MULTIMODAL fallback model: ${multimodalModel.name} (${multimodalModel.provider})`,
      );
    }

    return multimodalModel;
  }

  /**
   * Get model by ID
   */
  async getModelById(id: string) {
    return this.prisma.aIModel.findFirst({
      where: { id, isEnabled: true },
    });
  }

  /**
   * Call image generation API based on provider
   */
  async callImageGenerationAPI(
    modelConfig: any,
    prompt: string,
    dimensions: { width: number; height: number },
    negativePrompt?: string,
    referenceImageBase64?: string,
  ): Promise<string> {
    const provider = modelConfig.provider.toLowerCase();
    const modelId = modelConfig.modelId.toLowerCase();

    this.logger.log(
      `Calling image generation API: provider=${provider}, model=${modelConfig.modelId}`,
    );

    // If reference image is provided, use image-to-image API
    if (referenceImageBase64) {
      return this.callImageToImageAPI(
        modelConfig,
        referenceImageBase64,
        prompt,
        dimensions,
      );
    }

    // Route to appropriate provider
    if (
      provider.includes("google") ||
      provider.includes("gemini") ||
      modelId.includes("gemini") ||
      modelId.includes("imagen")
    ) {
      return this.generateWithGemini(
        modelConfig.apiKey,
        modelConfig.modelId,
        prompt,
        dimensions,
      );
    } else if (provider.includes("openai")) {
      return this.generateWithOpenAI(
        modelConfig.apiKey,
        modelConfig.apiEndpoint,
        prompt,
        dimensions,
      );
    } else if (provider.includes("stability")) {
      return this.generateWithStability(
        modelConfig.apiKey,
        modelConfig.apiEndpoint,
        prompt,
        dimensions,
        negativePrompt,
      );
    } else if (provider.includes("replicate")) {
      return this.generateWithReplicate(
        modelConfig.apiKey,
        modelConfig.modelId,
        prompt,
        dimensions,
        negativePrompt,
      );
    } else if (provider.includes("together")) {
      return this.generateWithTogether(
        modelConfig.apiKey,
        modelConfig.modelId,
        prompt,
        dimensions,
      );
    } else {
      // Default to OpenAI-compatible API
      return this.generateWithOpenAICompatible(
        modelConfig.apiKey,
        modelConfig.apiEndpoint,
        modelConfig.modelId,
        prompt,
        dimensions,
      );
    }
  }

  /**
   * Image-to-Image API call
   */
  private async callImageToImageAPI(
    modelConfig: any,
    referenceImageBase64: string,
    modificationPrompt: string,
    _dimensions: { width: number; height: number },
  ): Promise<string> {
    const provider = modelConfig.provider.toLowerCase();

    this.logger.log(
      `Calling Image-to-Image API: provider=${provider}, model=${modelConfig.modelId}`,
    );

    if (
      provider.includes("google") ||
      provider.includes("gemini") ||
      modelConfig.modelId.toLowerCase().includes("gemini")
    ) {
      return this.imageToImageWithGemini(
        modelConfig.apiKey,
        modelConfig.modelId,
        referenceImageBase64,
        modificationPrompt,
      );
    }

    throw new Error(
      `Image-to-Image not yet supported for provider: ${provider}`,
    );
  }

  /**
   * Gemini Image-to-Image API
   */
  private async imageToImageWithGemini(
    apiKey: string,
    modelId: string,
    referenceImageBase64: string,
    modificationPrompt: string,
  ): Promise<string> {
    const model = modelId.includes("gemini") ? modelId : "gemini-2.0-flash-exp";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const base64Data = referenceImageBase64.replace(
      /^data:image\/[a-z]+;base64,/,
      "",
    );
    const mimeType =
      referenceImageBase64.match(/^data:(image\/[a-z]+);base64,/)?.[1] ||
      "image/jpeg";

    this.logger.log(
      `Calling Gemini Image-to-Image: ${model}, prompt="${modificationPrompt.slice(0, 100)}..."`,
    );

    const response = await firstValueFrom(
      this.httpService.post(
        url,
        {
          contents: [
            {
              parts: [
                {
                  inlineData: {
                    mimeType,
                    data: base64Data,
                  },
                },
                { text: modificationPrompt },
              ],
            },
          ],
          generationConfig: {
            responseModalities: ["IMAGE"],
          },
        },
        {
          headers: { "Content-Type": "application/json" },
          timeout: 120000,
        },
      ),
    );

    const candidates = response.data.candidates;
    if (!candidates || candidates.length === 0) {
      throw new Error("No candidates in Gemini response");
    }

    const parts = candidates[0].content?.parts;
    if (parts) {
      for (const part of parts) {
        if (part.inlineData && part.inlineData.data) {
          const responseMimeType = part.inlineData.mimeType || "image/png";
          return `data:${responseMimeType};base64,${part.inlineData.data}`;
        }
      }
    }

    throw new Error("No image data in Gemini response");
  }

  /**
   * Gemini/Imagen image generation
   */
  private async generateWithGemini(
    apiKey: string,
    modelId: string,
    prompt: string,
    dimensions: { width: number; height: number },
  ): Promise<string> {
    const modelLower = modelId.toLowerCase();

    // Check if Imagen model
    if (modelLower.includes("imagen")) {
      return this.generateWithImagen(apiKey, modelId, prompt, dimensions);
    }

    // Check if supported Gemini image model
    const isGeminiImageCapable = GEMINI_IMAGE_MODELS.some((m) =>
      modelLower.includes(m.toLowerCase()),
    );

    const model = isGeminiImageCapable ? modelId : "gemini-2.0-flash-exp";

    this.logger.log(
      `Using Gemini model for image generation: ${model} (original: ${modelId})`,
    );

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

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

    const candidates = response.data.candidates;
    if (!candidates || candidates.length === 0) {
      throw new Error("No candidates in Gemini response");
    }

    const parts = candidates[0].content?.parts;
    if (parts) {
      for (const part of parts) {
        if (part.inlineData && part.inlineData.data) {
          const mimeType = part.inlineData.mimeType || "image/png";
          return `data:${mimeType};base64,${part.inlineData.data}`;
        }
      }
    }

    throw new Error("No image data in Gemini response");
  }

  /**
   * Imagen API (newer generateImages endpoint)
   */
  private async generateWithImagen(
    apiKey: string,
    modelId: string,
    prompt: string,
    dimensions: { width: number; height: number },
  ): Promise<string> {
    this.logger.log(`Using Imagen model for image generation: ${modelId}`);

    const aspectRatio =
      dimensions.width === dimensions.height
        ? "1:1"
        : dimensions.width > dimensions.height
          ? "16:9"
          : "9:16";

    const generateImagesUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateImages?key=${apiKey}`;

    this.logger.log(`Calling Imagen API: ${generateImagesUrl}`);

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          generateImagesUrl,
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

      const images = response.data?.generatedImages;
      if (!images || images.length === 0) {
        throw new Error("No images in Imagen response");
      }

      const imageData = images[0]?.image;
      if (!imageData) {
        throw new Error("No image data in Imagen response");
      }

      const mimeType = imageData.imageType || "image/png";
      return `data:${mimeType};base64,${imageData.bytesBase64Encoded}`;
    } catch (error: any) {
      const errorStatus = error.response?.status;
      const errorData = error.response?.data;

      // If 404, try predict endpoint
      if (errorStatus === 404) {
        this.logger.warn(
          `Imagen generateImages endpoint not found, trying predict...`,
        );
        return this.generateWithImagenPredict(
          apiKey,
          modelId,
          prompt,
          aspectRatio,
        );
      }

      this.logger.error(
        `Imagen generateImages error: status=${errorStatus}, data=${JSON.stringify(errorData).slice(0, 500)}`,
      );
      throw error;
    }
  }

  /**
   * Imagen predict endpoint (fallback)
   */
  private async generateWithImagenPredict(
    apiKey: string,
    modelId: string,
    prompt: string,
    aspectRatio: string,
  ): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:predict?key=${apiKey}`;

    this.logger.log(`Calling Imagen predict API: ${url}`);

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          url,
          {
            instances: [{ prompt }],
            parameters: {
              sampleCount: 1,
              aspectRatio: aspectRatio,
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

      return `data:image/png;base64,${imageData}`;
    } catch (error: any) {
      this.logger.error(
        `Imagen predict error: ${error.response?.status} - ${JSON.stringify(error.response?.data).slice(0, 300)}`,
      );
      // Fallback to Gemini 2.0 Flash
      this.logger.warn(
        `Imagen predict failed, falling back to Gemini 2.0 Flash`,
      );
      return this.generateWithGeminiFlash(apiKey, prompt);
    }
  }

  /**
   * Gemini 2.0 Flash fallback
   */
  private async generateWithGeminiFlash(
    apiKey: string,
    prompt: string,
  ): Promise<string> {
    const model = "gemini-2.0-flash-exp";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    this.logger.log(`Falling back to Gemini 2.0 Flash for image generation`);

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

    const candidates = response.data.candidates;
    if (!candidates || candidates.length === 0) {
      throw new Error("No candidates in Gemini response");
    }

    const parts = candidates[0].content?.parts;
    if (parts) {
      for (const part of parts) {
        if (part.inlineData && part.inlineData.data) {
          const mimeType = part.inlineData.mimeType || "image/png";
          this.logger.log(`Gemini 2.0 Flash image generated successfully`);
          return `data:${mimeType};base64,${part.inlineData.data}`;
        }
      }
    }

    throw new Error("No image data in Gemini 2.0 Flash response");
  }

  /**
   * OpenAI DALL-E API
   */
  private async generateWithOpenAI(
    apiKey: string,
    apiEndpoint: string | null,
    prompt: string,
    dimensions: { width: number; height: number },
  ): Promise<string> {
    const baseUrl = apiEndpoint || "https://api.openai.com/v1";
    const url = `${baseUrl}/images/generations`;

    const size =
      dimensions.width === dimensions.height
        ? "1024x1024"
        : dimensions.width > dimensions.height
          ? "1792x1024"
          : "1024x1792";

    const response = await firstValueFrom(
      this.httpService.post(
        url,
        {
          model: "dall-e-3",
          prompt,
          n: 1,
          size,
          quality: "hd",
          response_format: "url",
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
        },
      ),
    );

    return response.data.data[0].url;
  }

  /**
   * Stability AI API
   */
  private async generateWithStability(
    apiKey: string,
    apiEndpoint: string | null,
    prompt: string,
    dimensions: { width: number; height: number },
    negativePrompt?: string,
  ): Promise<string> {
    const url =
      apiEndpoint ||
      "https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image";

    const response = await firstValueFrom(
      this.httpService.post(
        url,
        {
          text_prompts: [
            { text: prompt, weight: 1 },
            ...(negativePrompt ? [{ text: negativePrompt, weight: -1 }] : []),
          ],
          cfg_scale: 7,
          width: dimensions.width,
          height: dimensions.height,
          samples: 1,
          steps: 30,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
        },
      ),
    );

    const base64Image = response.data.artifacts[0].base64;
    return `data:image/png;base64,${base64Image}`;
  }

  /**
   * Replicate API
   */
  private async generateWithReplicate(
    apiKey: string,
    modelId: string,
    prompt: string,
    dimensions: { width: number; height: number },
    negativePrompt?: string,
  ): Promise<string> {
    const createResponse = await firstValueFrom(
      this.httpService.post(
        "https://api.replicate.com/v1/predictions",
        {
          version: modelId.includes(":")
            ? modelId.split(":")[1]
            : "39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
          input: {
            prompt,
            negative_prompt: negativePrompt || "",
            width: dimensions.width,
            height: dimensions.height,
            num_outputs: 1,
          },
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Token ${apiKey}`,
          },
        },
      ),
    );

    const predictionId = createResponse.data.id;
    let result = createResponse.data;
    let attempts = 0;
    const maxAttempts = 60;

    while (
      result.status !== "succeeded" &&
      result.status !== "failed" &&
      attempts < maxAttempts
    ) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const pollResponse = await firstValueFrom(
        this.httpService.get(
          `https://api.replicate.com/v1/predictions/${predictionId}`,
          {
            headers: { Authorization: `Token ${apiKey}` },
          },
        ),
      );
      result = pollResponse.data;
      attempts++;
    }

    if (result.status === "failed" || attempts >= maxAttempts) {
      throw new Error("Replicate generation failed or timed out");
    }

    return result.output[0];
  }

  /**
   * Together AI API
   */
  private async generateWithTogether(
    apiKey: string,
    modelId: string,
    prompt: string,
    dimensions: { width: number; height: number },
  ): Promise<string> {
    const response = await firstValueFrom(
      this.httpService.post(
        "https://api.together.xyz/v1/images/generations",
        {
          model: modelId || "black-forest-labs/FLUX.1-schnell-Free",
          prompt,
          width: dimensions.width,
          height: dimensions.height,
          n: 1,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
        },
      ),
    );

    return response.data.data[0].url || response.data.data[0].b64_json
      ? `data:image/png;base64,${response.data.data[0].b64_json}`
      : response.data.data[0].url;
  }

  /**
   * OpenAI-compatible API
   */
  private async generateWithOpenAICompatible(
    apiKey: string,
    apiEndpoint: string | null,
    modelId: string,
    prompt: string,
    dimensions: { width: number; height: number },
  ): Promise<string> {
    const baseUrl = apiEndpoint || "https://api.openai.com/v1";
    const url = `${baseUrl}/images/generations`;

    const response = await firstValueFrom(
      this.httpService.post(
        url,
        {
          model: modelId,
          prompt,
          n: 1,
          size: `${dimensions.width}x${dimensions.height}`,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
        },
      ),
    );

    return (
      response.data.data[0].url ||
      (response.data.data[0].b64_json
        ? `data:image/png;base64,${response.data.data[0].b64_json}`
        : null)
    );
  }
}
