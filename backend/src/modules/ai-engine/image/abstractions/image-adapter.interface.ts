/**
 * AI Engine - Image Adapter Interface
 * 图像生成适配器接口定义
 */

/**
 * 图像生成请求选项
 */
export interface ImageGenerationOptions {
  /**
   * 生成提示词
   */
  prompt: string;

  /**
   * 负面提示词
   */
  negativePrompt?: string;

  /**
   * 图像宽度
   */
  width?: number;

  /**
   * 图像高度
   */
  height?: number;

  /**
   * 生成数量
   */
  count?: number;

  /**
   * 生成质量 (部分提供商支持)
   */
  quality?: "standard" | "hd";

  /**
   * 风格 (部分提供商支持)
   */
  style?: string;

  /**
   * 参考图像 (Image-to-Image)
   */
  referenceImage?: string;

  /**
   * 模型 ID (覆盖适配器默认模型)
   */
  model?: string;

  /**
   * 请求超时 (ms)
   */
  timeout?: number;

  /**
   * 元数据
   */
  metadata?: Record<string, unknown>;
}

/**
 * 图像生成结果
 */
export interface ImageGenerationResult {
  /**
   * 生成的图像列表
   */
  images: GeneratedImage[];

  /**
   * 使用的模型
   */
  model: string;

  /**
   * 提供商
   */
  provider: string;

  /**
   * 生成耗时 (ms)
   */
  duration?: number;

  /**
   * 元数据
   */
  metadata?: Record<string, unknown>;
}

/**
 * 生成的图像
 */
export interface GeneratedImage {
  /**
   * 图像 URL 或 Base64 数据
   */
  url: string;

  /**
   * 是否为 Base64 格式
   */
  isBase64?: boolean;

  /**
   * MIME 类型
   */
  mimeType?: string;

  /**
   * 图像宽度
   */
  width?: number;

  /**
   * 图像高度
   */
  height?: number;

  /**
   * 修订后的提示词 (部分提供商返回)
   */
  revisedPrompt?: string;
}

/**
 * 图像适配器接口
 */
export interface IImageAdapter {
  /**
   * 适配器 ID
   */
  readonly id: string;

  /**
   * 适配器名称
   */
  readonly name: string;

  /**
   * 提供商标识
   */
  readonly provider: ImageProvider;

  /**
   * 支持的模型
   */
  readonly supportedModels: string[];

  /**
   * 默认模型
   */
  readonly defaultModel: string;

  /**
   * 生成图像
   */
  generate(options: ImageGenerationOptions): Promise<ImageGenerationResult>;

  /**
   * 图像到图像转换 (可选)
   */
  imageToImage?(
    options: ImageGenerationOptions & { referenceImage: string },
  ): Promise<ImageGenerationResult>;

  /**
   * 检查模型是否支持
   */
  supportsModel(model: string): boolean;

  /**
   * 获取模型配置
   */
  getModelConfig(model: string): ImageModelConfig | undefined;
}

/**
 * 图像模型配置
 */
export interface ImageModelConfig {
  id: string;
  name: string;
  maxWidth: number;
  maxHeight: number;
  supportedAspectRatios: string[];
  supportsNegativePrompt: boolean;
  supportsImageToImage: boolean;
  pricePerImage?: number;
}

/**
 * 内置图像提供商
 */
export const IMAGE_PROVIDERS = {
  GEMINI: "gemini",
  OPENAI: "openai",
  STABILITY: "stability",
  REPLICATE: "replicate",
  TOGETHER: "together",
} as const;

export type ImageProvider =
  (typeof IMAGE_PROVIDERS)[keyof typeof IMAGE_PROVIDERS];

/**
 * 内置图像模型
 */
export const IMAGE_MODELS = {
  // Gemini/Google
  GEMINI_2_FLASH: "gemini-2.0-flash-exp",
  IMAGEN_3: "imagen-3.0-generate-001",
  IMAGEN_3_FAST: "imagen-3.0-fast-generate-001",

  // OpenAI
  DALLE_3: "dall-e-3",
  DALLE_2: "dall-e-2",

  // Stability
  SDXL: "stable-diffusion-xl-1024-v1-0",
  SD3: "sd3-large",

  // Together/FLUX
  FLUX_SCHNELL: "black-forest-labs/FLUX.1-schnell-Free",
  FLUX_PRO: "black-forest-labs/FLUX.1.1-pro",
} as const;

export type ImageModel = (typeof IMAGE_MODELS)[keyof typeof IMAGE_MODELS] | string;
