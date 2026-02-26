/**
 * AI Engine - Image Factory
 * 图像生成适配器工厂
 */

import { Injectable, Logger } from "@nestjs/common";
import {
  IImageAdapter,
  ImageProvider,
  IMAGE_PROVIDERS,
  IMAGE_MODELS,
  ImageGenerationOptions,
  ImageGenerationResult,
  ImageModel,
} from "../abstractions/image-adapter.interface";

/**
 * Image Factory 配置
 */
export interface ImageFactoryConfig {
  /**
   * 默认提供商
   */
  defaultProvider?: ImageProvider;

  /**
   * 默认模型
   */
  defaultModel?: ImageModel;

  /**
   * 提供商配置
   */
  providers?: Record<ImageProvider, ImageProviderConfig>;
}

/**
 * 提供商配置
 */
export interface ImageProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  enabled?: boolean;
  models?: string[];
}

/**
 * 图像生成适配器工厂
 * 管理和创建图像生成适配器实例
 */
@Injectable()
export class ImageFactory {
  private readonly logger = new Logger(ImageFactory.name);
  private readonly adapters = new Map<string, IImageAdapter>();
  private readonly providerConfigs = new Map<
    ImageProvider,
    ImageProviderConfig
  >();
  private defaultProvider: ImageProvider = IMAGE_PROVIDERS.GEMINI;
  private defaultModel: ImageModel = IMAGE_MODELS.GEMINI_2_FLASH;

  constructor() {}

  /**
   * 初始化工厂
   */
  initialize(config: ImageFactoryConfig): void {
    if (config.defaultProvider) {
      this.defaultProvider = config.defaultProvider;
    }
    if (config.defaultModel) {
      this.defaultModel = config.defaultModel;
    }
    if (config.providers) {
      for (const [provider, providerConfig] of Object.entries(
        config.providers,
      )) {
        this.providerConfigs.set(provider as ImageProvider, providerConfig);
      }
    }
    this.logger.log(
      `ImageFactory initialized with default provider: ${this.defaultProvider}, model: ${this.defaultModel}`,
    );
  }

  /**
   * 注册适配器
   */
  registerAdapter(adapter: IImageAdapter): void {
    this.adapters.set(adapter.id, adapter);
    this.logger.log(
      `Registered image adapter: ${adapter.id} (${adapter.provider})`,
    );
  }

  /**
   * 获取适配器
   */
  getAdapter(providerId?: string): IImageAdapter | undefined {
    const id = providerId || this.defaultProvider;
    return this.adapters.get(id);
  }

  /**
   * 获取支持特定模型的适配器
   */
  getAdapterForModel(model: string): IImageAdapter | undefined {
    for (const adapter of this.adapters.values()) {
      if (adapter.supportsModel(model)) {
        return adapter;
      }
    }
    return undefined;
  }

  /**
   * 生成图像 - 统一入口
   */
  async generate(
    options: ImageGenerationOptions,
  ): Promise<ImageGenerationResult> {
    const adapter = options.model
      ? this.getAdapterForModel(options.model)
      : this.getAdapter();

    if (!adapter) {
      throw new Error(
        `No image adapter available for model: ${options.model || this.defaultModel}`,
      );
    }

    this.logger.log(
      `Generating image with adapter: ${adapter.id}, model: ${options.model || adapter.defaultModel}`,
    );

    const startTime = Date.now();
    const result = await adapter.generate(options);
    result.duration = Date.now() - startTime;

    this.logger.log(
      `Image generated in ${result.duration}ms, count: ${result.images.length}`,
    );

    return result;
  }

  /**
   * 图像到图像转换 - 统一入口
   */
  async imageToImage(
    options: ImageGenerationOptions & { referenceImage: string },
  ): Promise<ImageGenerationResult> {
    const adapter = options.model
      ? this.getAdapterForModel(options.model)
      : this.getAdapter();

    if (!adapter) {
      throw new Error(
        `No image adapter available for model: ${options.model || this.defaultModel}`,
      );
    }

    if (!adapter.imageToImage) {
      throw new Error(`Image-to-image not supported by adapter: ${adapter.id}`);
    }

    this.logger.log(
      `Image-to-image with adapter: ${adapter.id}, model: ${options.model || adapter.defaultModel}`,
    );

    const startTime = Date.now();
    const result = await adapter.imageToImage(options);
    result.duration = Date.now() - startTime;

    return result;
  }

  /**
   * 获取所有已注册的适配器
   */
  getAllAdapters(): IImageAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * 获取所有支持的模型
   */
  getSupportedModels(): string[] {
    const models: string[] = [];
    for (const adapter of this.adapters.values()) {
      models.push(...adapter.supportedModels);
    }
    return [...new Set(models)];
  }

  /**
   * 获取默认模型
   */
  getDefaultModel(): ImageModel {
    return this.defaultModel;
  }

  /**
   * 设置默认模型
   */
  setDefaultModel(model: ImageModel): void {
    this.defaultModel = model;
  }

  /**
   * 获取提供商配置
   */
  getProviderConfig(provider: ImageProvider): ImageProviderConfig | undefined {
    return this.providerConfigs.get(provider);
  }

  /**
   * 检查提供商是否可用
   */
  isProviderAvailable(provider: ImageProvider): boolean {
    const config = this.providerConfigs.get(provider);
    if (!config) return false;
    return config.enabled !== false && !!config.apiKey;
  }

  /**
   * 获取可用提供商列表
   */
  getAvailableProviders(): ImageProvider[] {
    const available: ImageProvider[] = [];
    for (const provider of Object.values(IMAGE_PROVIDERS)) {
      if (this.isProviderAvailable(provider)) {
        available.push(provider);
      }
    }
    return available;
  }
}
