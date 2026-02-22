/**
 * AI Engine - AiChatService LLM Adapter
 * 将 AiChatService 封装为 ISimpleLLMAdapter 接口
 *
 * 用途：
 * - 为 Skills 提供 LLM 调用能力
 * - 复用 AiChatService 已有的 API 调用逻辑
 * - 从数据库获取配置的默认 AI 模型
 */

import { Injectable, Logger, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AiChatService } from "../services/ai-chat.service";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { AIModelType } from "@prisma/client";
import { TaskProfile } from "../types";

/**
 * 简化版 LLM 适配器接口（用于 BaseSkill）
 * 这是 Skills 实际使用的接口，比 ILLMAdapter 更简单
 */
export interface ISimpleLLMAdapter {
  chat(options: {
    messages: Array<{ role: string; content: string }>;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    taskProfile?: TaskProfile;
    responseFormat?: string;
  }): Promise<{ content: string; tokensUsed?: number }>;
}

/**
 * AiChatService LLM 适配器
 *
 * 将 AiChatService 包装成 ISimpleLLMAdapter 接口，
 * 使 Skills 可以通过标准接口调用 LLM。
 *
 * 模型选择优先级：
 * 1. 调用时指定的 model 参数
 * 2. 数据库中配置的默认 CHAT 模型
 * 3. 环境变量 DEFAULT_AI_MODEL
 * 4. 硬编码 fallback: "gemini"
 */
@Injectable()
export class AiChatLLMAdapter implements ISimpleLLMAdapter {
  private readonly logger = new Logger(AiChatLLMAdapter.name);

  readonly id = "ai-chat";
  readonly name = "AiChatService Adapter";

  // 缓存从数据库获取的默认模型
  private cachedDefaultModel: string | null = null;
  private cacheTime: number = 0;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 分钟缓存

  constructor(
    private readonly aiChatService: AiChatService,
    private readonly configService: ConfigService,
    @Optional() private readonly prisma?: PrismaService,
  ) {
    void this.initializeDefaultModel();
  }

  /**
   * 初始化时获取默认模型
   */
  private async initializeDefaultModel(): Promise<void> {
    try {
      const model = await this.getDefaultModelFromDb();
      if (model) {
        this.logger.log(`AiChatLLMAdapter initialized with DB model: ${model}`);
      } else {
        this.logger.log(
          `AiChatLLMAdapter initialized with fallback model: ${this.getFallbackModel()}`,
        );
      }
    } catch (error) {
      this.logger.warn(`Failed to initialize default model: ${error}`);
    }
  }

  /**
   * 从数据库获取默认 CHAT 模型
   */
  private async getDefaultModelFromDb(): Promise<string | null> {
    if (!this.prisma) {
      return null;
    }

    // 检查缓存是否有效
    const now = Date.now();
    if (this.cachedDefaultModel && now - this.cacheTime < this.CACHE_TTL_MS) {
      return this.cachedDefaultModel;
    }

    try {
      // 查找系统默认的 CHAT 模型
      const defaultModel = await this.prisma.aIModel.findFirst({
        where: {
          modelType: AIModelType.CHAT,
          isDefault: true,
          isEnabled: true,
        },
        select: {
          modelId: true,
          displayName: true,
        },
      });

      if (defaultModel) {
        this.cachedDefaultModel = defaultModel.modelId;
        this.cacheTime = now;
        this.logger.debug(
          `[getDefaultModelFromDb] Using model: ${defaultModel.displayName} (${defaultModel.modelId})`,
        );
        return defaultModel.modelId;
      }

      // Fallback: 任意启用的 CHAT 模型
      const anyModel = await this.prisma.aIModel.findFirst({
        where: {
          modelType: AIModelType.CHAT,
          isEnabled: true,
        },
        select: {
          modelId: true,
          displayName: true,
        },
      });

      if (anyModel) {
        this.cachedDefaultModel = anyModel.modelId;
        this.cacheTime = now;
        this.logger.debug(
          `[getDefaultModelFromDb] Using fallback model: ${anyModel.displayName} (${anyModel.modelId})`,
        );
        return anyModel.modelId;
      }
    } catch (error) {
      this.logger.warn(`Failed to query default model: ${error}`);
    }

    return null;
  }

  /**
   * 获取 fallback 模型（环境变量或硬编码）
   */
  private getFallbackModel(): string {
    return this.configService.get<string>("DEFAULT_AI_MODEL", "gemini");
  }

  /**
   * 获取默认模型
   * 优先级：数据库配置 > 环境变量 > 硬编码
   */
  async getDefaultModel(): Promise<string> {
    const dbModel = await this.getDefaultModelFromDb();
    return dbModel || this.getFallbackModel();
  }

  /**
   * 简化版 chat 方法（实现 ISimpleLLMAdapter）
   * 这是 Skills 通过 callLLM() 实际调用的方法
   */
  async chat(options: {
    messages: Array<{ role: string; content: string }>;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    taskProfile?: TaskProfile;
    responseFormat?: string;
  }): Promise<{ content: string; tokensUsed?: number }> {
    // 模型选择优先级：参数 > 数据库配置 > 环境变量 > 硬编码
    const model = options.model || (await this.getDefaultModel());
    const messages = options.messages.map((m) => ({
      role: m.role as "system" | "user" | "assistant",
      content: m.content,
    }));

    this.logger.debug(`[chat] Using model: ${model}`);

    try {
      const result = await this.aiChatService.generateChatCompletion({
        model,
        messages,
        maxTokens: options.maxTokens,
        temperature: options.temperature,
        taskProfile: options.taskProfile,
        responseFormat: options.responseFormat,
      });

      return {
        content: result.content,
        tokensUsed: result.tokensUsed,
      };
    } catch (error) {
      this.logger.error(`LLM call failed: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * 估算 token 数
   */
  countTokens(text: string): number {
    // 简单估算：平均每4个字符一个token
    return Math.ceil(text.length / 4);
  }

  /**
   * 清除模型缓存（用于配置更新后）
   */
  clearCache(): void {
    this.cachedDefaultModel = null;
    this.cacheTime = 0;
    this.logger.debug("Model cache cleared");
  }
}
