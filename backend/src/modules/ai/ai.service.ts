import { Injectable, Logger, HttpException, HttpStatus } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AiChatService } from "./ai-chat.service";
import { AIModelType } from "@prisma/client";

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiChatService: AiChatService,
  ) {}

  /**
   * 获取已启用的 AI 模型列表（公共 API）
   * 返回前端需要的模型信息（不包含 API Key）
   */
  async getEnabledModels() {
    const models = await this.prisma.aIModel.findMany({
      where: {
        isEnabled: true,
      },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        displayName: true,
        provider: true,
        modelId: true,
        modelType: true,
        icon: true,
        color: true,
        description: true,
        isDefault: true,
      },
    });

    return models.map((model) => ({
      id: model.id, // 使用数据库唯一 ID 作为前端 id（避免重复）
      dbId: model.id, // 数据库实际 ID（保持兼容）
      name: model.displayName,
      modelName: model.name, // 模型标识名（如 gemini, gemini-image）
      provider: model.provider,
      modelId: model.modelId,
      modelType: model.modelType, // 模型类型：CHAT, IMAGE_GENERATION, IMAGE_EDITING, MULTIMODAL
      icon: model.icon,
      iconUrl: this.getIconUrl(model.name),
      color: model.color,
      description:
        model.description || `${model.provider} ${model.displayName}`,
      isDefault: model.isDefault,
    }));
  }

  /**
   * 根据模型名称获取图标 URL
   * 使用模糊匹配来支持各种命名格式（如 "ChatGPT (OpenAI) #1", "Grok (xAI)"）
   */
  private getIconUrl(name: string): string {
    const lowerName = name.toLowerCase();

    // 模糊匹配规则
    if (
      lowerName.includes("grok") ||
      lowerName.includes("xai") ||
      lowerName.includes("x.ai")
    ) {
      return "/icons/ai/grok.svg";
    }
    if (
      lowerName.includes("gpt") ||
      lowerName.includes("openai") ||
      lowerName.includes("chatgpt")
    ) {
      return "/icons/ai/openai.svg";
    }
    if (lowerName.includes("claude") || lowerName.includes("anthropic")) {
      return "/icons/ai/claude.svg";
    }
    if (lowerName.includes("gemini") || lowerName.includes("google")) {
      return "/icons/ai/gemini.svg";
    }

    // 默认返回 OpenAI 图标（最通用的）
    return "/icons/ai/openai.svg";
  }

  async translateText(
    text: string,
    sourceLang: string,
    targetLang: string,
  ): Promise<string> {
    this.logger.log(`Translating text from ${sourceLang} to ${targetLang}`);

    try {
      // 优先使用 CHAT_FAST tier（低成本快速模型）
      let defaultModel = await this.prisma.aIModel.findFirst({
        where: {
          isEnabled: true,
          isDefault: true,
          modelType: AIModelType.CHAT_FAST,
        },
      });

      // 如果没有默认的 CHAT_FAST 模型，查找任意可用的 CHAT_FAST 模型
      if (!defaultModel) {
        defaultModel = await this.prisma.aIModel.findFirst({
          where: {
            isEnabled: true,
            modelType: AIModelType.CHAT_FAST,
          },
          orderBy: { createdAt: "desc" },
        });
      }

      // Fallback: 如果没有 CHAT_FAST 模型，使用标准 CHAT 模型
      if (!defaultModel) {
        this.logger.warn("No CHAT_FAST model available, falling back to CHAT");
        defaultModel = await this.prisma.aIModel.findFirst({
          where: {
            isEnabled: true,
            isDefault: true,
            modelType: AIModelType.CHAT,
          },
        });

        if (!defaultModel) {
          defaultModel = await this.prisma.aIModel.findFirst({
            where: {
              isEnabled: true,
              modelType: AIModelType.CHAT,
            },
            orderBy: { createdAt: "desc" },
          });
        }
      }

      if (!defaultModel) {
        throw new Error("No AI model available for translation");
      }

      this.logger.log(
        `[Translation] Using model: ${defaultModel.name} (${defaultModel.modelId}) - Tier: CHAT_FAST`,
      );

      const targetLangName = this.getLanguageName(targetLang);
      const prompt = `Translate the following text to ${targetLangName}. Only output the translated text, nothing else:\n\n${text}`;

      const result = await this.aiChatService.generateChatCompletionWithKey({
        provider: defaultModel.provider,
        modelId: defaultModel.modelId,
        apiKey: defaultModel.apiKey ?? "",
        apiEndpoint: defaultModel.apiEndpoint ?? undefined,
        messages: [{ role: "user", content: prompt }],
        maxTokens: 1000,
        temperature: 0.3,
      });

      return result.content;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.error(`Translation error: ${errorMessage}`);

      throw new HttpException(
        {
          statusCode: HttpStatus.SERVICE_UNAVAILABLE,
          message: "Translation service is currently unavailable",
          error: "SERVICE_UNAVAILABLE",
          originalText: text,
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  private getLanguageName(code: string): string {
    const langMap: Record<string, string> = {
      en: "English",
      "zh-CN": "Simplified Chinese",
      zh: "Chinese",
      ja: "Japanese",
      ko: "Korean",
      fr: "French",
      de: "German",
      es: "Spanish",
      it: "Italian",
      pt: "Portuguese",
      ru: "Russian",
    };
    return langMap[code] || code;
  }
}
