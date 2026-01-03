/**
 * AI Engine - Base Image Adapter
 * 图像生成适配器基类
 */

import { Logger } from "@nestjs/common";
import {
  IImageAdapter,
  ImageProvider,
  ImageGenerationOptions,
  ImageGenerationResult,
  ImageModelConfig,
} from "../abstractions/image-adapter.interface";

/**
 * 图像适配器基类
 */
export abstract class BaseImageAdapter implements IImageAdapter {
  protected readonly logger: Logger;

  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly provider: ImageProvider;
  abstract readonly supportedModels: string[];
  abstract readonly defaultModel: string;

  protected modelConfigs: Map<string, ImageModelConfig> = new Map();

  constructor() {
    this.logger = new Logger(this.constructor.name);
  }

  /**
   * 生成图像 - 子类实现
   */
  abstract generate(
    options: ImageGenerationOptions,
  ): Promise<ImageGenerationResult>;

  /**
   * 图像到图像转换 - 可选实现
   */
  imageToImage?(
    options: ImageGenerationOptions & { referenceImage: string },
  ): Promise<ImageGenerationResult>;

  /**
   * 检查模型是否支持
   */
  supportsModel(model: string): boolean {
    const modelLower = model.toLowerCase();
    return this.supportedModels.some(
      (m) =>
        m.toLowerCase() === modelLower ||
        modelLower.includes(m.toLowerCase()) ||
        m.toLowerCase().includes(modelLower),
    );
  }

  /**
   * 获取模型配置
   */
  getModelConfig(model: string): ImageModelConfig | undefined {
    return this.modelConfigs.get(model);
  }

  /**
   * 注册模型配置
   */
  protected registerModelConfig(config: ImageModelConfig): void {
    this.modelConfigs.set(config.id, config);
  }

  /**
   * 获取有效模型 ID
   */
  protected getEffectiveModel(requestedModel?: string): string {
    if (requestedModel && this.supportsModel(requestedModel)) {
      return requestedModel;
    }
    return this.defaultModel;
  }

  /**
   * 计算宽高比
   */
  protected calculateAspectRatio(width: number, height: number): string {
    if (width === height) return "1:1";
    if (width > height) {
      const ratio = width / height;
      if (ratio >= 1.7) return "16:9";
      if (ratio >= 1.3) return "4:3";
      return "3:2";
    } else {
      const ratio = height / width;
      if (ratio >= 1.7) return "9:16";
      if (ratio >= 1.3) return "3:4";
      return "2:3";
    }
  }

  /**
   * 获取默认尺寸
   */
  protected getDefaultDimensions(): { width: number; height: number } {
    return { width: 1024, height: 1024 };
  }
}
