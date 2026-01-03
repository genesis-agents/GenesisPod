/**
 * AI Engine - Universal LLM Adapter
 * 实现 ILLMAdapter 接口，用于 LLMFactory
 *
 * 这个适配器通过 AiChatService 调用 LLM，支持所有 Provider：
 * - OpenAI (GPT-4o, GPT-4-turbo, etc.)
 * - Google (Gemini Flash, Gemini Pro, etc.)
 * - Anthropic (Claude)
 * - xAI (Grok)
 * - DeepSeek
 *
 * 模型选择从数据库配置读取，支持 Skills 通过 LLMFactory.getAdapter() 获取
 */

import { Injectable, Logger } from "@nestjs/common";
import { AiChatService } from "../services/ai-chat.service";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import {
  ILLMAdapter,
  LLMRequestOptions,
  LLMResponse,
  LLMModelConfig,
  LLMStreamChunk,
} from "../abstractions/llm-adapter.interface";

/**
 * 通用 LLM 适配器
 * 实现完整的 ILLMAdapter 接口，供 Skills 使用
 * 支持所有通过管理员在数据库配置的 AI 模型（完全动态，无硬编码）
 */
@Injectable()
export class UniversalLLMAdapter implements ILLMAdapter {
  private readonly logger = new Logger("UniversalLLMAdapter");

  // 使用 "universal" 作为 ID，支持所有 provider
  readonly id = "universal";
  readonly name = "Universal LLM Adapter (Dynamic from Database)";

  // 从数据库动态加载的支持模型列表（缓存）
  private _supportedModels: string[] = [];
  private _defaultModel: string = "";
  private _cacheTime: number = 0;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 分钟缓存

  // ILLMAdapter 接口要求的只读属性（通过 getter 实现动态读取）
  get supportedModels(): string[] {
    // 返回缓存的模型列表，异步刷新
    this.refreshModelsIfNeeded();
    return this._supportedModels.length > 0 ? this._supportedModels : ["*"]; // 返回 "*" 表示支持所有模型
  }

  get defaultModel(): string {
    // 返回缓存的默认模型，异步刷新
    this.refreshModelsIfNeeded();
    return this._defaultModel || "gemini-3-flash-preview";
  }

  constructor(
    private readonly aiChatService: AiChatService,
    private readonly prisma: PrismaService,
  ) {
    this.initializeFromDatabase();
  }

  /**
   * 从数据库初始化可用模型列表
   */
  private async initializeFromDatabase(): Promise<void> {
    try {
      await this.loadModelsFromDatabase();
      this.logger.log(
        `Universal LLM Adapter initialized with ${this._supportedModels.length} models from database`,
      );
      this.logger.log(`  Default model: ${this._defaultModel}`);
      this.logger.log(
        `  Supported: ${this._supportedModels.slice(0, 5).join(", ")}${this._supportedModels.length > 5 ? "..." : ""}`,
      );
    } catch (error) {
      this.logger.warn(`Failed to initialize from database: ${error}`);
    }
  }

  /**
   * 从数据库加载模型列表
   */
  private async loadModelsFromDatabase(): Promise<void> {
    // 获取所有启用的 CHAT 类型模型
    const chatModels = await this.prisma.aIModel.findMany({
      where: {
        modelType: "CHAT",
        isEnabled: true,
      },
      select: {
        modelId: true,
        displayName: true,
        isDefault: true,
      },
      orderBy: [{ isDefault: "desc" }, { displayName: "asc" }],
    });

    this._supportedModels = chatModels.map((m) => m.modelId);
    this._cacheTime = Date.now();

    // 找到默认模型
    const defaultModel = chatModels.find((m) => m.isDefault);
    this._defaultModel = defaultModel?.modelId || chatModels[0]?.modelId || "";

    this.logger.debug(
      `[loadModelsFromDatabase] Loaded ${chatModels.length} chat models, default: ${this._defaultModel}`,
    );
  }

  /**
   * 如果缓存过期则刷新模型列表
   */
  private refreshModelsIfNeeded(): void {
    const now = Date.now();
    if (now - this._cacheTime > this.CACHE_TTL_MS) {
      // 异步刷新，不阻塞当前调用
      this.loadModelsFromDatabase().catch((err) =>
        this.logger.warn(`Failed to refresh models: ${err}`),
      );
    }
  }

  /**
   * 执行 Chat Completion
   */
  async chat(options: LLMRequestOptions): Promise<LLMResponse> {
    const model = options.model || (await this.getDefaultModelFromDb());

    this.logger.debug(
      `[chat] Calling with model: ${model}, messages: ${options.messages.length}`,
    );

    try {
      // 转换消息格式
      const messages = options.messages.map((m) => ({
        role: m.role as "system" | "user" | "assistant",
        content: m.content,
      }));

      // 调用 AiChatService
      // 注意: ChatCompletionOptions 目前不支持 responseFormat，
      // 如果需要 JSON 输出，应在 system prompt 中明确要求
      const result = await this.aiChatService.generateChatCompletion({
        model,
        messages,
        maxTokens: options.maxTokens,
        temperature: options.temperature,
      });

      // 构建响应
      return {
        id: `chatcmpl-${Date.now()}`,
        content: result.content,
        finishReason: "stop",
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: result.tokensUsed || 0,
        },
        model,
        createdAt: new Date(),
      };
    } catch (error) {
      this.logger.error(`[chat] Failed: ${error}`);
      throw error;
    }
  }

  /**
   * 流式 Chat Completion (可选)
   */
  async *chatStream?(
    options: LLMRequestOptions,
  ): AsyncGenerator<LLMStreamChunk, void> {
    // 暂不实现流式，使用非流式
    const response = await this.chat(options);
    yield {
      id: response.id,
      delta: { content: response.content || "" },
      finishReason: response.finishReason,
      usage: response.usage,
    };
  }

  /**
   * 计算 token 数 (估算)
   */
  countTokens?(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * 检查是否支持指定模型
   * 支持所有主流 AI 模型
   */
  supportsModel(model: string): boolean {
    const lower = model.toLowerCase();
    // 支持所有主流 provider 的模型
    return (
      // OpenAI
      lower.includes("gpt") ||
      lower.startsWith("o1") ||
      lower.startsWith("o3") ||
      // Google Gemini
      lower.includes("gemini") ||
      // Anthropic Claude
      lower.includes("claude") ||
      // xAI Grok
      lower.includes("grok") ||
      // DeepSeek
      lower.includes("deepseek") ||
      // 显式列表中的模型
      this.supportedModels.includes(model)
    );
  }

  /**
   * 获取模型配置
   */
  getModelConfig(model: string): LLMModelConfig | undefined {
    const configs: Record<string, LLMModelConfig> = {
      "gpt-4o": {
        id: "gpt-4o",
        name: "GPT-4o",
        maxTokens: 16384,
        contextWindow: 128000,
        supportsTools: true,
        supportsVision: true,
        supportsStreaming: true,
      },
      "gpt-4o-mini": {
        id: "gpt-4o-mini",
        name: "GPT-4o Mini",
        maxTokens: 16384,
        contextWindow: 128000,
        supportsTools: true,
        supportsVision: true,
        supportsStreaming: true,
      },
    };
    return configs[model];
  }

  /**
   * 从数据库获取默认模型
   */
  private async getDefaultModelFromDb(): Promise<string> {
    try {
      const defaultModel = await this.prisma.aIModel.findFirst({
        where: {
          modelType: "CHAT",
          isDefault: true,
          isEnabled: true,
        },
        select: { modelId: true },
      });

      if (defaultModel) {
        return defaultModel.modelId;
      }

      // Fallback: 任意启用的 CHAT 模型
      const anyModel = await this.prisma.aIModel.findFirst({
        where: {
          modelType: "CHAT",
          isEnabled: true,
        },
        select: { modelId: true },
      });

      return anyModel?.modelId || this.defaultModel;
    } catch (error) {
      this.logger.warn(`Failed to get default model from DB: ${error}`);
      return this.defaultModel;
    }
  }
}
