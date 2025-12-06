import {
  Controller,
  Get,
  Post,
  Body,
  Res,
  Param,
  BadRequestException,
  HttpException,
  Logger,
} from "@nestjs/common";
import { Response } from "express";
import { AiService } from "./ai.service";
import { AiChatService } from "./ai-chat.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AIModelType } from "@prisma/client";

interface TranslateSingleRequest {
  text: string;
  targetLang?: string;
  sourceLang?: string;
}

interface SimpleChatRequest {
  message: string;
  messages?: { role: "user" | "assistant" | "system"; content: string }[]; // Multi-turn context
  context?: string;
  model?: string;
  stream?: boolean;
}

interface QuickActionRequest {
  content: string;
  action: "summary" | "insights" | "methodology";
  model?: string;
}

interface SummaryRequest {
  content: string;
  max_length?: number;
  language?: string;
}

interface InsightsRequest {
  content: string;
  language?: string;
}

@Controller("ai")
export class AiController {
  private readonly logger = new Logger(AiController.name);

  constructor(
    private readonly aiService: AiService,
    private readonly aiChatService: AiChatService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 获取已启用的 AI 模型列表（公共 API，无需认证）
   * GET /api/v1/ai/models
   */
  @Get("models")
  async getEnabledModels() {
    this.logger.log("Fetching enabled AI models");
    return this.aiService.getEnabledModels();
  }

  /**
   * 诊断 AI 模型配置（公共 API，用于调试）
   * GET /api/v1/ai/diagnose
   */
  @Get("diagnose")
  async diagnoseModels() {
    this.logger.log("Diagnosing AI model configuration");

    // Get all models from database
    const allModels = await this.prisma.aIModel.findMany({
      select: {
        id: true,
        name: true,
        modelId: true,
        provider: true,
        isEnabled: true,
        isDefault: true,
        apiKey: true,
        apiEndpoint: true,
      },
    });

    // Check environment variables
    const envVars = {
      GOOGLE_AI_API_KEY: !!process.env.GOOGLE_AI_API_KEY,
      OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
      ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
      DEEPSEEK_API_KEY: !!process.env.DEEPSEEK_API_KEY,
    };

    // Build diagnosis report
    const modelsReport = allModels.map((m) => ({
      id: m.id,
      name: m.name,
      modelId: m.modelId,
      provider: m.provider,
      isEnabled: m.isEnabled,
      isDefault: m.isDefault,
      hasApiKey: !!m.apiKey,
      apiKeyLength: m.apiKey?.length || 0,
      apiKeyPrefix: m.apiKey ? m.apiKey.substring(0, 10) + "..." : null,
      hasApiEndpoint: !!m.apiEndpoint,
    }));

    return {
      timestamp: new Date().toISOString(),
      totalModels: allModels.length,
      enabledModels: allModels.filter((m) => m.isEnabled).length,
      modelsWithApiKey: allModels.filter((m) => !!m.apiKey).length,
      environmentVariables: envVars,
      models: modelsReport,
      recommendation:
        modelsReport.filter((m) => m.isEnabled && m.hasApiKey).length === 0
          ? "No enabled models have API keys configured. Please add API keys to your models in the admin panel."
          : "Configuration looks OK. Check if the modelId matches exactly.",
    };
  }

  /**
   * 测试 Gemini 模型图片生成能力（公共 API）
   * GET /api/v1/ai/test-gemini-image
   */
  @Get("test-gemini-image")
  async testGeminiImageGeneration() {
    this.logger.log("Testing Gemini image generation models");

    // Get all Google/Gemini models
    const geminiModels = await this.prisma.aIModel.findMany({
      where: {
        OR: [
          { provider: { contains: "google", mode: "insensitive" } },
          { provider: { contains: "gemini", mode: "insensitive" } },
          { modelId: { contains: "gemini", mode: "insensitive" } },
        ],
      },
    });

    if (geminiModels.length === 0) {
      return {
        error: "No Gemini models found in database",
        suggestion:
          "Add a Gemini model in the admin panel with provider=google",
      };
    }

    const results: any[] = [];

    for (const model of geminiModels) {
      const apiKey = model.apiKey || process.env.GOOGLE_AI_API_KEY;

      if (!apiKey) {
        results.push({
          modelId: model.modelId,
          name: model.name,
          status: "NO_API_KEY",
          error: "No API key configured for this model",
        });
        continue;
      }

      try {
        // Test with image generation request
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model.modelId}:generateContent?key=${apiKey}`;

        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [{ text: "Generate a simple red circle image" }],
              },
            ],
            generationConfig: {
              responseModalities: ["TEXT", "IMAGE"],
              maxOutputTokens: 256,
            },
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          results.push({
            modelId: model.modelId,
            name: model.name,
            status: "API_ERROR",
            error: data.error?.message || `HTTP ${response.status}`,
            supportsImage: false,
          });
          continue;
        }

        // Check if response contains image
        const parts = data.candidates?.[0]?.content?.parts || [];
        const hasImage = parts.some((p: any) =>
          p.inlineData?.mimeType?.startsWith("image/"),
        );
        const hasText = parts.some((p: any) => p.text);

        results.push({
          modelId: model.modelId,
          name: model.name,
          status: "SUCCESS",
          supportsImage: hasImage,
          responseType: hasImage ? "image" : hasText ? "text-only" : "empty",
          textPreview: hasText
            ? parts.find((p: any) => p.text)?.text?.substring(0, 100)
            : null,
        });
      } catch (error: any) {
        results.push({
          modelId: model.modelId,
          name: model.name,
          status: "FETCH_ERROR",
          error: error.message,
          supportsImage: false,
        });
      }
    }

    const imageModels = results.filter((r) => r.supportsImage);

    return {
      timestamp: new Date().toISOString(),
      totalTested: results.length,
      modelsWithImageSupport: imageModels.length,
      results,
      recommendation:
        imageModels.length > 0
          ? `Use one of these models for image generation: ${imageModels.map((r) => r.modelId).join(", ")}`
          : "No models support image generation. Try using gemini-2.0-flash-exp or imagen-3 models.",
    };
  }

  /**
   * 列出 Google AI 可用模型（公共 API）
   * GET /api/v1/ai/list-google-models
   */
  @Get("list-google-models")
  async listGoogleModels() {
    this.logger.log("Listing available Google AI models");

    // Try to get API key from database or environment
    const googleModel = await this.prisma.aIModel.findFirst({
      where: {
        OR: [
          { provider: { contains: "google", mode: "insensitive" } },
          { provider: { contains: "gemini", mode: "insensitive" } },
        ],
        apiKey: { not: null },
      },
    });

    const apiKey = googleModel?.apiKey || process.env.GOOGLE_AI_API_KEY;

    if (!apiKey) {
      return {
        error: "No Google AI API key found",
        suggestion:
          "Configure GOOGLE_AI_API_KEY environment variable or add a Google model with API key in admin panel",
      };
    }

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      );

      if (!response.ok) {
        const error = await response.json();
        return {
          error: error.error?.message || `HTTP ${response.status}`,
          apiKeyPrefix: apiKey.substring(0, 10) + "...",
        };
      }

      const data = await response.json();
      const models = data.models || [];

      // Filter and categorize models
      const imageModels = models.filter(
        (m: any) =>
          m.name?.includes("imagen") ||
          m.supportedGenerationMethods?.includes("generateImage"),
      );

      const geminiModels = models.filter((m: any) =>
        m.name?.includes("gemini"),
      );

      const modelsWithImageGen = models.filter((m: any) =>
        m.supportedGenerationMethods?.includes("generateContent"),
      );

      return {
        timestamp: new Date().toISOString(),
        totalModels: models.length,
        apiKeyPrefix: apiKey.substring(0, 10) + "...",
        imageModels: imageModels.map((m: any) => ({
          name: m.name,
          displayName: m.displayName,
          methods: m.supportedGenerationMethods,
        })),
        geminiModels: geminiModels.map((m: any) => ({
          name: m.name?.replace("models/", ""),
          displayName: m.displayName,
          methods: m.supportedGenerationMethods,
        })),
        modelsWithImageGeneration: modelsWithImageGen
          .filter(
            (m: any) =>
              m.name?.includes("2.0") ||
              m.name?.includes("2.5") ||
              m.name?.includes("imagen"),
          )
          .map((m: any) => ({
            name: m.name?.replace("models/", ""),
            displayName: m.displayName,
          })),
        recommendation:
          "For image generation, use gemini-2.0-flash-exp or imagen-3.0-generate-001",
      };
    } catch (error: any) {
      return {
        error: error.message,
        apiKeyPrefix: apiKey.substring(0, 10) + "...",
      };
    }
  }

  /**
   * 检查 Topic 的 AI 成员配置（公共 API，用于调试）
   * GET /api/v1/ai/check-topic-ai/:topicId
   */
  @Get("check-topic-ai/:topicId")
  async checkTopicAI(@Param("topicId") topicId: string) {
    this.logger.log(`Checking AI members for topic ${topicId}`);

    const topic = await this.prisma.topic.findUnique({
      where: { id: topicId },
      include: {
        aiMembers: true,
      },
    });

    if (!topic) {
      return { error: "Topic not found" };
    }

    // Check each AI member's model lookup
    const results: any[] = [];
    for (const ai of topic.aiMembers) {
      // Try to find by modelId
      const byModelId = await this.prisma.aIModel.findFirst({
        where: {
          modelId: { equals: ai.aiModel, mode: "insensitive" },
          isEnabled: true,
        },
      });

      // Try to find by name
      const byName = await this.prisma.aIModel.findFirst({
        where: {
          name: { equals: ai.aiModel, mode: "insensitive" },
          isEnabled: true,
        },
      });

      results.push({
        aiMemberId: ai.id,
        displayName: ai.displayName,
        storedAiModel: ai.aiModel,
        foundByModelId: byModelId
          ? {
              id: byModelId.id,
              name: byModelId.name,
              modelId: byModelId.modelId,
              hasApiKey: !!byModelId.apiKey,
            }
          : null,
        foundByName: byName
          ? {
              id: byName.id,
              name: byName.name,
              modelId: byName.modelId,
              hasApiKey: !!byName.apiKey,
            }
          : null,
        willWork: !!(byModelId?.apiKey || byName?.apiKey),
        problem:
          !byModelId && !byName
            ? "Model not found in database"
            : !(byModelId?.apiKey || byName?.apiKey)
              ? "Model found but no API key"
              : null,
      });
    }

    return {
      topicId,
      topicName: topic.name,
      aiMemberCount: topic.aiMembers.length,
      results,
      recommendation: results.some((r) => !r.willWork)
        ? "Some AI members won't work. Re-add them from the settings to use the correct modelId."
        : "All AI members configured correctly.",
    };
  }

  /**
   * 简单聊天接口（支持流式响应）
   * POST /api/v1/ai/simple-chat
   */
  @Post("simple-chat")
  async simpleChat(@Body() body: SimpleChatRequest, @Res() res: Response) {
    const {
      message,
      messages: contextMessages,
      context,
      model = "gemini",
      stream = true,
    } = body;

    this.logger.log(
      `Simple chat request: model=${model}, stream=${stream}, message_len=${message?.length || 0}, context_messages=${contextMessages?.length || 0}`,
    );

    if (!message || message.trim().length === 0) {
      throw new BadRequestException("Message is required");
    }

    try {
      // Get model config from database
      const modelConfig = await this.prisma.aIModel.findFirst({
        where: {
          OR: [
            { name: { equals: model, mode: "insensitive" } },
            { modelId: { equals: model, mode: "insensitive" } },
          ],
          isEnabled: true,
        },
      });

      if (!modelConfig) {
        this.logger.warn(`Model ${model} not found or not enabled`);
        throw new BadRequestException(`Model ${model} is not available`);
      }

      // Build messages array - support multi-turn context
      let chatMessages: {
        role: "user" | "assistant" | "system";
        content: string;
      }[];

      if (contextMessages && contextMessages.length > 0) {
        // Use provided messages array (already includes current message)
        chatMessages = contextMessages;
      } else if (context) {
        // Legacy context string support
        chatMessages = [
          {
            role: "user",
            content: `Context:\n${context}\n\nUser Question:\n${message}`,
          },
        ];
      } else {
        // Single message
        chatMessages = [{ role: "user", content: message }];
      }

      if (stream) {
        // Set up SSE headers
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.flushHeaders();

        // For streaming, we need to use the chat service and simulate SSE
        // Since ai-chat.service doesn't have native streaming, we'll return the full response as a single chunk
        try {
          const result = await this.aiChatService.generateChatCompletionWithKey(
            {
              provider: modelConfig.provider,
              modelId: modelConfig.modelId,
              apiKey: modelConfig.apiKey ?? "",
              apiEndpoint: modelConfig.apiEndpoint ?? undefined,
              messages: chatMessages,
              maxTokens: 4000,
              temperature: 0.7,
            },
          );

          // Send as SSE chunks
          const chunkSize = 50;
          const content = result.content;
          for (let i = 0; i < content.length; i += chunkSize) {
            const chunk = content.slice(i, i + chunkSize);
            res.write(
              `data: ${JSON.stringify({ content: chunk, model: result.model })}\n\n`,
            );
          }
          res.write("data: [DONE]\n\n");
          res.end();
        } catch (error) {
          this.logger.error(`Stream chat error: ${error}`);
          res.write(`data: ${JSON.stringify({ error: String(error) })}\n\n`);
          res.end();
        }
      } else {
        // Non-streaming response
        const result = await this.aiChatService.generateChatCompletionWithKey({
          provider: modelConfig.provider,
          modelId: modelConfig.modelId,
          apiKey: modelConfig.apiKey ?? "",
          apiEndpoint: modelConfig.apiEndpoint ?? undefined,
          messages: chatMessages,
          maxTokens: 4000,
          temperature: 0.7,
        });

        res.json({
          content: result.content,
          model: result.model,
        });
      }
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.error(`Simple chat error: ${errorMessage}`);
      throw new BadRequestException(`Chat failed: ${errorMessage}`);
    }
  }

  /**
   * 快捷操作接口（摘要、洞察、方法论）
   * POST /api/v1/ai/quick-action
   */
  @Post("quick-action")
  async quickAction(@Body() body: QuickActionRequest) {
    const { content, action, model = "gemini" } = body;

    this.logger.log(`Quick action: ${action}, model=${model}`);

    if (!content || content.trim().length === 0) {
      throw new BadRequestException("Content is required");
    }

    try {
      const modelConfig = await this.getModelConfig(model);
      let prompt: string;

      if (action === "methodology") {
        prompt = `You are a JSON-only API. Analyze the research methodology or technical methods in the following content.

Content:
${content}

Requirements:
1. Extract 3-5 main methods or techniques
2. Each method must have exactly these fields: title, description, importance
3. importance must be one of: high, medium, low
4. All titles and descriptions must be written in Simplified Chinese
5. Output ONLY a valid JSON array, nothing else

Output format:
[{"title":"方法名称","description":"方法的关键步骤与核心要点","importance":"high"}]

JSON output:`;
      } else if (action === "summary") {
        prompt = `请为以下内容生成一个结构化的摘要：

${content}

要求：
- 核心观点（2-3个要点）
- 主要发现或结论
- 实际应用价值
- 使用清晰的标题和列表格式`;
      } else {
        // insights
        prompt = `You are a JSON-only API. Extract key insights from the following content.

Content:
${content}

Requirements:
1. Extract 3-5 key insights
2. Each insight must have exactly these fields: title, description, importance
3. importance must be one of: high, medium, low
4. Output ONLY a valid JSON array, nothing else

Output format:
[{"title":"Core Finding","description":"Research reveals significant breakthrough","importance":"high"}]

JSON output:`;
      }

      const result = await this.aiChatService.generateChatCompletionWithKey({
        provider: modelConfig.provider,
        modelId: modelConfig.modelId,
        apiKey: modelConfig.apiKey ?? "",
        apiEndpoint: modelConfig.apiEndpoint ?? undefined,
        messages: [{ role: "user", content: prompt }],
        maxTokens: 1500,
        temperature: 0.7,
      });

      // Try to parse JSON for methodology and insights
      let finalContent: string | any[] = result.content;
      if (action === "methodology" || action === "insights") {
        finalContent = this.extractJsonArray(result.content);
      }

      return {
        content: finalContent,
        action,
        model: result.model,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.error(`Quick action error: ${errorMessage}`);
      throw new BadRequestException(`Quick action failed: ${errorMessage}`);
    }
  }

  /**
   * 摘要接口
   * POST /api/v1/ai/summary
   * 使用 CHAT_FAST tier 进行快速摘要生成
   */
  @Post("summary")
  async summary(@Body() body: SummaryRequest) {
    const { content, language = "zh" } = body;

    if (!content || content.trim().length === 0) {
      throw new BadRequestException("Content is required");
    }

    try {
      // 使用 CHAT_FAST tier（低成本快速模型）
      const modelConfig = await this.getFastModelConfig();
      this.logger.log(
        `[Summary] Using model: ${modelConfig.name} (${modelConfig.modelId}) - Tier: CHAT_FAST`,
      );

      const prompt =
        language === "zh"
          ? `请为以下内容生成简洁的摘要：\n\n${content}\n\n要求：简明扼要，突出重点。`
          : `Please generate a concise summary of the following content:\n\n${content}`;

      const result = await this.aiChatService.generateChatCompletionWithKey({
        provider: modelConfig.provider,
        modelId: modelConfig.modelId,
        apiKey: modelConfig.apiKey ?? "",
        apiEndpoint: modelConfig.apiEndpoint ?? undefined,
        messages: [{ role: "user", content: prompt }],
        maxTokens: 1000,
        temperature: 0.5,
      });

      return {
        summary: result.content,
        model: result.model,
        model_used: modelConfig.modelId,
        tier: "CHAT_FAST",
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.error(`Summary error: ${errorMessage}`);
      throw new BadRequestException(`Summary failed: ${errorMessage}`);
    }
  }

  /**
   * 洞察接口
   * POST /api/v1/ai/insights
   * 使用 CHAT_FAST tier 进行结构化信息提取
   */
  @Post("insights")
  async insights(@Body() body: InsightsRequest) {
    const { content, language = "zh" } = body;

    if (!content || content.trim().length === 0) {
      throw new BadRequestException("Content is required");
    }

    try {
      // 使用 CHAT_FAST tier（低成本快速模型）
      const modelConfig = await this.getFastModelConfig();
      this.logger.log(
        `[Insights] Using model: ${modelConfig.name} (${modelConfig.modelId}) - Tier: CHAT_FAST`,
      );

      const prompt = `You are a JSON-only API. Extract key insights from the following content.

Content:
${content}

Requirements:
1. Extract 3-5 key insights
2. Each insight must have exactly these fields: title, description, importance
3. importance must be one of: high, medium, low
4. ${language === "zh" ? "All output must be in Simplified Chinese" : "Output in English"}
5. Output ONLY a valid JSON array, nothing else

JSON output:`;

      const result = await this.aiChatService.generateChatCompletionWithKey({
        provider: modelConfig.provider,
        modelId: modelConfig.modelId,
        apiKey: modelConfig.apiKey ?? "",
        apiEndpoint: modelConfig.apiEndpoint ?? undefined,
        messages: [{ role: "user", content: prompt }],
        maxTokens: 1500,
        temperature: 0.7,
      });

      const jsonContent = this.extractJsonArray(result.content);

      return {
        insights: jsonContent,
        model: result.model,
        model_used: modelConfig.modelId,
        tier: "CHAT_FAST",
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.error(`Insights error: ${errorMessage}`);
      throw new BadRequestException(`Insights failed: ${errorMessage}`);
    }
  }

  @Post("translate-single")
  async translateSingle(@Body() body: TranslateSingleRequest) {
    this.logger.log(
      `Received translation request for text: ${body.text?.substring(0, 50)}...`,
    );

    if (!body.text || body.text.trim().length === 0) {
      throw new BadRequestException("Text is required for translation");
    }

    const targetLang = body.targetLang || "zh-CN";
    const sourceLang = body.sourceLang || "en";

    try {
      const translation = await this.aiService.translateText(
        body.text,
        sourceLang,
        targetLang,
      );

      return {
        success: true,
        original: body.text,
        translation,
        sourceLang,
        targetLang,
      };
    } catch (error) {
      // 保留原始HTTP异常的状态码
      if (error instanceof HttpException) {
        this.logger.error(`Translation failed: ${error.message}`);
        throw error; // 直接抛出，保留状态码（429, 503等）
      }

      // 其他未知错误作为500处理
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.error(`Unexpected translation error: ${errorMessage}`);
      throw new BadRequestException(`Translation failed: ${errorMessage}`);
    }
  }

  /**
   * Helper: Get model config by name
   */
  private async getModelConfig(model: string) {
    const modelConfig = await this.prisma.aIModel.findFirst({
      where: {
        OR: [
          { name: { equals: model, mode: "insensitive" } },
          { modelId: { equals: model, mode: "insensitive" } },
        ],
        isEnabled: true,
      },
    });

    if (!modelConfig) {
      throw new BadRequestException(`Model ${model} is not available`);
    }

    return modelConfig;
  }

  /**
   * Helper: Get model config by type with fallback support
   * 支持 Tier 分级，如果指定类型没有模型，会自动降级到 CHAT
   * @param modelType - 模型类型
   * @param allowFallback - 是否允许降级到 CHAT（默认 true）
   */
  private async getModelByType(
    modelType: AIModelType,
    allowFallback: boolean = true,
  ): Promise<{
    id: string;
    name: string;
    provider: string;
    modelId: string;
    apiKey: string | null;
    apiEndpoint: string;
    maxTokens: number;
    temperature: number;
  }> {
    // 首先尝试获取指定类型的默认模型
    const defaultModel = await this.prisma.aIModel.findFirst({
      where: {
        isEnabled: true,
        isDefault: true,
        modelType: modelType,
      },
    });

    if (defaultModel) {
      return defaultModel;
    }

    // 如果没有默认模型，查找任意该类型的可用模型
    const anyModelOfType = await this.prisma.aIModel.findFirst({
      where: {
        isEnabled: true,
        modelType: modelType,
      },
      orderBy: { createdAt: "desc" },
    });

    if (anyModelOfType) {
      return anyModelOfType;
    }

    // 如果允许降级且不是 CHAT 类型，降级到 CHAT
    if (allowFallback && modelType !== AIModelType.CHAT) {
      this.logger.warn(`No ${modelType} model available, falling back to CHAT`);
      return this.getModelByType(AIModelType.CHAT, false);
    }

    throw new BadRequestException(`No ${modelType} AI model is available`);
  }

  /**
   * Helper: Get fast/cheap model for simple tasks
   * 用于分类、翻译、摘要提取等简单任务
   * 如果没有配置 CHAT_FAST，会自动降级到 CHAT
   */
  private async getFastModelConfig() {
    return this.getModelByType(AIModelType.CHAT_FAST);
  }

  /**
   * Helper: Extract JSON array from AI response and parse it
   */
  private extractJsonArray(content: string): any[] {
    try {
      let jsonContent = content.trim();

      // Remove markdown code blocks
      if (jsonContent.includes("```json")) {
        jsonContent = jsonContent.split("```json")[1].split("```")[0].trim();
      } else if (jsonContent.includes("```")) {
        jsonContent = jsonContent.split("```")[1].split("```")[0].trim();
      }

      // Find JSON array boundaries
      const startIdx = jsonContent.indexOf("[");
      const endIdx = jsonContent.lastIndexOf("]");

      if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        jsonContent = jsonContent.slice(startIdx, endIdx + 1);
        // Parse and return JSON array
        const parsed = JSON.parse(jsonContent);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch (e) {
      this.logger.warn(`Failed to extract JSON: ${e}`);
    }
    // Return empty array on failure
    return [];
  }
}
