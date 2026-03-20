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
      providerAliases: [
        "gpt",
        "openai-gpt",
        "gpt-4",
        "gpt-4o",
        "gpt-3.5",
        "chatgpt",
      ],
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
      providerAliases: [
        "dalle",
        "dall-e",
        "dall-e-3",
        "dall-e-2",
        "openai-image",
      ],
      instance: new DallEProvider(this.httpService),
      supportedTaskTypes: [
        AiTaskType.IMAGE_GENERATION,
        AiTaskType.IMAGE_EDITING,
      ],
    });

    // Anthropic Claude
    this.registerProvider({
      providerId: "anthropic",
      providerAliases: [
        "claude",
        "claude-3",
        "claude-3.5",
        "claude-sonnet",
        "claude-opus",
      ],
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
      providerAliases: [
        "gemini",
        "google",
        "gemini-2",
        "gemini-1.5",
        "gemini-pro",
        "gemini-flash",
      ],
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
      providerAliases: ["imagen", "imagen-4", "imagen-3", "imagen-2"],
      instance: new ImagenProvider(this.httpService),
      supportedTaskTypes: [AiTaskType.IMAGE_GENERATION],
    });

    // OpenRouter (OpenAI-compatible, multi-provider aggregator)
    this.registerProvider({
      providerId: "openrouter",
      providerAliases: ["open-router"],
      instance: new OpenAITextProvider(this.httpService),
      supportedTaskTypes: [
        AiTaskType.CHAT,
        AiTaskType.COMPLETION,
        AiTaskType.SUMMARIZATION,
        AiTaskType.TRANSLATION,
        AiTaskType.EXTRACTION,
      ],
    });

    // MiniMax (OpenAI-compatible)
    this.registerProvider({
      providerId: "minimax",
      providerAliases: ["minimax-text", "abab"],
      instance: new OpenAITextProvider(this.httpService),
      supportedTaskTypes: [
        AiTaskType.CHAT,
        AiTaskType.COMPLETION,
        AiTaskType.SUMMARIZATION,
        AiTaskType.TRANSLATION,
        AiTaskType.EXTRACTION,
      ],
    });

    // Groq (OpenAI-compatible, ultra-fast inference)
    this.registerProvider({
      providerId: "groq",
      providerAliases: ["groq-cloud"],
      instance: new OpenAITextProvider(this.httpService),
      supportedTaskTypes: [
        AiTaskType.CHAT,
        AiTaskType.COMPLETION,
        AiTaskType.SUMMARIZATION,
        AiTaskType.TRANSLATION,
        AiTaskType.EXTRACTION,
      ],
    });

    // xAI Grok
    this.registerProvider({
      providerId: "xai",
      providerAliases: ["grok", "x", "grok-3", "grok-2", "x.ai"],
      instance: new XAIProvider(this.httpService),
      supportedTaskTypes: [
        AiTaskType.CHAT,
        AiTaskType.COMPLETION,
        AiTaskType.SUMMARIZATION,
        AiTaskType.TRANSLATION,
        AiTaskType.EXTRACTION,
      ],
    });

    // DeepSeek
    this.registerProvider({
      providerId: "deepseek",
      providerAliases: ["deepseek-chat", "deepseek-reasoner", "deepseek-v3"],
      instance: new OpenAITextProvider(this.httpService),
      supportedTaskTypes: [
        AiTaskType.CHAT,
        AiTaskType.COMPLETION,
        AiTaskType.SUMMARIZATION,
        AiTaskType.TRANSLATION,
        AiTaskType.EXTRACTION,
      ],
    });

    // Qwen (Alibaba)
    this.registerProvider({
      providerId: "qwen",
      providerAliases: [
        "alibaba",
        "qwen-plus",
        "qwen-turbo",
        "qwen-max",
        "tongyi",
      ],
      instance: new OpenAITextProvider(this.httpService),
      supportedTaskTypes: [
        AiTaskType.CHAT,
        AiTaskType.COMPLETION,
        AiTaskType.SUMMARIZATION,
        AiTaskType.TRANSLATION,
        AiTaskType.EXTRACTION,
      ],
    });

    // Doubao (ByteDance)
    this.registerProvider({
      providerId: "doubao",
      providerAliases: ["bytedance", "volcengine", "doubao-pro", "doubao-lite"],
      instance: new OpenAITextProvider(this.httpService),
      supportedTaskTypes: [
        AiTaskType.CHAT,
        AiTaskType.COMPLETION,
        AiTaskType.SUMMARIZATION,
        AiTaskType.TRANSLATION,
        AiTaskType.EXTRACTION,
      ],
    });

    // Zhipu GLM
    this.registerProvider({
      providerId: "zhipu",
      providerAliases: ["glm", "glm-4", "glm-4-plus", "chatglm", "bigmodel"],
      instance: new OpenAITextProvider(this.httpService),
      supportedTaskTypes: [
        AiTaskType.CHAT,
        AiTaskType.COMPLETION,
        AiTaskType.SUMMARIZATION,
        AiTaskType.TRANSLATION,
        AiTaskType.EXTRACTION,
      ],
    });

    // Kimi (Moonshot)
    this.registerProvider({
      providerId: "kimi",
      providerAliases: [
        "moonshot",
        "moonshot-v1",
        "moonshot-v1-128k",
        "moonshot-v1-32k",
      ],
      instance: new OpenAITextProvider(this.httpService),
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
      providerAliases: ["grok-image", "aurora", "grok-2-image", "x-image"],
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
    this.logger.debug(
      `[getProviderForModel] Looking for provider: name=${model.name}, provider=${model.provider}, modelId=${model.modelId}`,
    );

    // 首先尝试通过 provider 字段匹配
    const byProvider = this.getProvider(model.provider);
    if (byProvider) {
      if (byProvider.supportsModel(model.modelId)) {
        this.logger.debug(
          `[getProviderForModel] Found by provider field: ${model.provider}`,
        );
        return byProvider;
      }
      // 即使 supportsModel 返回 false，如果 provider 精确匹配，也使用它
      // 这处理了用户配置自定义 modelId 的情况
      this.logger.debug(
        `[getProviderForModel] Provider ${model.provider} found but doesn't support modelId=${model.modelId}, still using it`,
      );
      return byProvider;
    }

    // 其次通过模型 ID 自动匹配
    for (const [, registration] of this.providers) {
      if (registration.instance.supportsModel(model.modelId)) {
        this.logger.debug(
          `[getProviderForModel] Found by modelId match: ${registration.providerId}`,
        );
        return registration.instance;
      }
    }

    // 最后尝试通过模型名称匹配
    const modelNameLower = model.name?.toLowerCase() || "";
    for (const [, registration] of this.providers) {
      if (registration.instance.supportsModel(modelNameLower)) {
        this.logger.debug(
          `[getProviderForModel] Found by model name match: ${registration.providerId}`,
        );
        return registration.instance;
      }
    }

    this.logger.warn(
      `[getProviderForModel] No provider found for: name=${model.name}, provider=${model.provider}, modelId=${model.modelId}`,
    );
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
