/**
 * AI Provider Factory
 *
 * 符合工厂模式和开闭原则：
 * - 新增 Provider 只需注册，无需修改工厂代码
 * - 通过 provider ID 或 model ID 自动选择合适的 Provider
 */

import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import {
  IAIProvider,
  ITextProvider,
  IImageProvider,
} from "./ai-provider.interface";
import { AiModelConfig, AiTaskType } from "../types";

// 导入具体 Provider
import { OpenAITextProvider, DallEProvider } from "./openai.provider";
import { AnthropicProvider } from "./anthropic.provider";
import { GeminiProvider, ImagenProvider } from "./google.provider";
import { XAIProvider, XAIImageProvider } from "./xai.provider";

/**
 * Provider 注册项
 */
interface ProviderRegistration {
  providerId: string;
  providerAliases: string[];
  instance: IAIProvider;
  supportedTaskTypes: AiTaskType[];
}

@Injectable()
export class AIProviderFactory {
  private readonly logger = new Logger(AIProviderFactory.name);
  private readonly providers: Map<string, ProviderRegistration> = new Map();

  constructor(private readonly httpService: HttpService) {
    this.registerBuiltInProviders();
  }

  /**
   * 注册内置 Provider
   */
  private registerBuiltInProviders(): void {
    // OpenAI GPT
    this.registerProvider({
      providerId: "openai",
      providerAliases: ["gpt", "openai-gpt"],
      instance: new OpenAITextProvider(this.httpService),
      supportedTaskTypes: [
        AiTaskType.CHAT,
        AiTaskType.COMPLETION,
        AiTaskType.SUMMARIZATION,
        AiTaskType.TRANSLATION,
        AiTaskType.EXTRACTION,
      ],
    });

    // DALL-E
    this.registerProvider({
      providerId: "openai-dalle",
      providerAliases: ["dalle", "dall-e"],
      instance: new DallEProvider(this.httpService),
      supportedTaskTypes: [
        AiTaskType.IMAGE_GENERATION,
        AiTaskType.IMAGE_EDITING,
      ],
    });

    // Anthropic Claude
    this.registerProvider({
      providerId: "anthropic",
      providerAliases: ["claude"],
      instance: new AnthropicProvider(this.httpService),
      supportedTaskTypes: [
        AiTaskType.CHAT,
        AiTaskType.COMPLETION,
        AiTaskType.SUMMARIZATION,
        AiTaskType.TRANSLATION,
        AiTaskType.EXTRACTION,
      ],
    });

    // Google Gemini
    this.registerProvider({
      providerId: "google-gemini",
      providerAliases: ["gemini", "google"],
      instance: new GeminiProvider(this.httpService),
      supportedTaskTypes: [
        AiTaskType.CHAT,
        AiTaskType.COMPLETION,
        AiTaskType.SUMMARIZATION,
        AiTaskType.TRANSLATION,
        AiTaskType.EXTRACTION,
        AiTaskType.MULTIMODAL,
      ],
    });

    // Google Imagen
    this.registerProvider({
      providerId: "google-imagen",
      providerAliases: ["imagen"],
      instance: new ImagenProvider(this.httpService),
      supportedTaskTypes: [AiTaskType.IMAGE_GENERATION],
    });

    // xAI Grok
    this.registerProvider({
      providerId: "xai",
      providerAliases: ["grok", "x"],
      instance: new XAIProvider(this.httpService),
      supportedTaskTypes: [
        AiTaskType.CHAT,
        AiTaskType.COMPLETION,
        AiTaskType.SUMMARIZATION,
        AiTaskType.TRANSLATION,
        AiTaskType.EXTRACTION,
      ],
    });

    // xAI Grok Image
    this.registerProvider({
      providerId: "xai-image",
      providerAliases: ["grok-image", "aurora"],
      instance: new XAIImageProvider(this.httpService),
      supportedTaskTypes: [AiTaskType.IMAGE_GENERATION],
    });

    this.logger.log(
      `Registered ${this.providers.size} AI providers: ${Array.from(this.providers.keys()).join(", ")}`,
    );
  }

  /**
   * 注册新的 Provider
   */
  registerProvider(registration: ProviderRegistration): void {
    this.providers.set(registration.providerId, registration);

    // 注册别名
    for (const alias of registration.providerAliases) {
      if (!this.providers.has(alias)) {
        this.providers.set(alias, registration);
      }
    }
  }

  /**
   * 根据 provider ID 获取 Provider
   */
  getProvider(providerId: string): IAIProvider | undefined {
    const normalizedId = providerId.toLowerCase();
    return this.providers.get(normalizedId)?.instance;
  }

  /**
   * 根据模型配置获取合适的 Provider
   */
  getProviderForModel(model: AiModelConfig): IAIProvider | undefined {
    // 首先尝试通过 provider 字段匹配
    const byProvider = this.getProvider(model.provider);
    if (byProvider && byProvider.supportsModel(model.modelId)) {
      return byProvider;
    }

    // 其次通过模型 ID 自动匹配
    for (const [, registration] of this.providers) {
      if (registration.instance.supportsModel(model.modelId)) {
        return registration.instance;
      }
    }

    return undefined;
  }

  /**
   * 获取支持指定任务类型的所有 Provider
   */
  getProvidersForTaskType(taskType: AiTaskType): IAIProvider[] {
    const result: IAIProvider[] = [];
    const seen = new Set<string>();

    for (const [, registration] of this.providers) {
      if (
        registration.supportedTaskTypes.includes(taskType) &&
        !seen.has(registration.providerId)
      ) {
        result.push(registration.instance);
        seen.add(registration.providerId);
      }
    }

    return result;
  }

  /**
   * 获取所有文本生成 Provider
   */
  getTextProviders(): ITextProvider[] {
    return this.getProvidersForTaskType(AiTaskType.CHAT) as ITextProvider[];
  }

  /**
   * 获取所有图像生成 Provider
   */
  getImageProviders(): IImageProvider[] {
    return this.getProvidersForTaskType(
      AiTaskType.IMAGE_GENERATION,
    ) as IImageProvider[];
  }

  /**
   * 获取所有已注册的 Provider ID
   */
  getAllProviderIds(): string[] {
    const ids = new Set<string>();
    for (const [, registration] of this.providers) {
      ids.add(registration.providerId);
    }
    return Array.from(ids);
  }
}
