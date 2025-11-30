import { Injectable, Logger, HttpException, HttpStatus } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AiChatService } from "./ai-chat.service";

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
   */
  private getIconUrl(name: string): string {
    const iconMap: Record<string, string> = {
      grok: "/icons/ai/grok.svg",
      "gpt-4": "/icons/ai/openai.svg",
      claude: "/icons/ai/claude.svg",
      gemini: "/icons/ai/gemini.svg",
    };
    return iconMap[name.toLowerCase()] || "/icons/ai/default.svg";
  }

  async translateText(
    text: string,
    sourceLang: string,
    targetLang: string,
  ): Promise<string> {
    this.logger.log(`Translating text from ${sourceLang} to ${targetLang}`);

    try {
      // 使用系统默认的 AI 模型进行翻译
      const defaultModel = await this.prisma.aIModel.findFirst({
        where: { isEnabled: true },
        orderBy: { isDefault: "desc" },
      });

      if (!defaultModel) {
        throw new Error("No AI model available for translation");
      }

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
