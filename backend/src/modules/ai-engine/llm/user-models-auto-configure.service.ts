import { Injectable, Logger } from "@nestjs/common";
import { AIModelType } from "@prisma/client";
import { UserApiKeysService } from "../../ai-infra/user-api-keys/user-api-keys.service";
import { UserModelConfigsService } from "../../ai-infra/user-model-configs/user-model-configs.service";
import { AiModelDiscoveryService } from "./services/ai-model-discovery.service";

/**
 * 每个 (provider, modelType) 的"优先候选 modelId 模式"。
 * 从拉取到的 /v1/models 列表里按这个顺序找第一个命中的。
 *
 * 规则：字段值是**正则列表**，按序匹配 modelId。用法：
 *   const pattern = RECOMMENDED[provider]?.[modelType];
 *   const match = pattern.find(re => models.some(m => re.test(m)));
 */
const RECOMMENDED: Record<string, Partial<Record<AIModelType, RegExp[]>>> = {
  openai: {
    CHAT: [/^gpt-4o(?!-mini)/i, /^gpt-4-turbo/i, /^gpt-4(?!o)/i, /^gpt-5/i],
    CHAT_FAST: [/^gpt-4o-mini/i, /^gpt-3\.5-turbo/i, /^gpt-5-mini/i],
    CODE: [/^gpt-4o(?!-mini)/i],
    MULTIMODAL: [/^gpt-4o(?!-mini)/i],
    EMBEDDING: [
      /^text-embedding-3-small/i,
      /^text-embedding-3-large/i,
      /^text-embedding-ada-002/i,
    ],
    IMAGE_GENERATION: [/^dall-e-3/i, /^gpt-image-1/i],
    IMAGE_EDITING: [/^dall-e-2/i],
  },
  anthropic: {
    CHAT: [
      /claude-3-5-sonnet/i,
      /claude-sonnet-4/i,
      /claude-3-opus/i,
      /claude-opus-4/i,
    ],
    CHAT_FAST: [/claude-3-5-haiku/i, /claude-3-haiku/i],
    CODE: [/claude-3-5-sonnet/i, /claude-sonnet-4/i],
    MULTIMODAL: [/claude-3-5-sonnet/i],
  },
  google: {
    CHAT: [/^gemini-2\.0-pro/i, /^gemini-1\.5-pro/i, /^gemini-2\.0-flash$/i],
    CHAT_FAST: [/^gemini-2\.0-flash-lite/i, /^gemini-1\.5-flash/i],
    MULTIMODAL: [/^gemini-2\.0-flash$/i, /^gemini-1\.5-pro/i],
    EMBEDDING: [/^text-embedding-004/i, /embedding/i],
  },
  xai: {
    CHAT: [/^grok-3(?!-mini)/i, /^grok-2(?!-mini)/i],
    CHAT_FAST: [/^grok-3-mini/i, /^grok-2-mini/i],
  },
  deepseek: {
    CHAT: [/^deepseek-chat$/i, /^deepseek-v3/i],
    CHAT_FAST: [/^deepseek-chat$/i],
  },
  cohere: {
    CHAT: [/^command-r-plus/i],
    CHAT_FAST: [/^command-r(?!-plus)/i],
    RERANK: [/^rerank-v3\.5/i, /^rerank/i],
  },
  groq: {
    CHAT: [/^llama-3\.3-70b/i, /^mixtral-8x7b/i],
    CHAT_FAST: [/^llama-3\.3-70b/i, /^mixtral-8x7b/i, /^llama-3\.1-8b/i],
  },
  qwen: {
    CHAT: [/^qwen-max/i, /^qwen-plus/i],
    CHAT_FAST: [/^qwen-turbo/i, /^qwen-plus/i],
  },
  openrouter: {
    CHAT: [/auto$/i],
  },
  minimax: {
    CHAT: [/^MiniMax-Text-01/i],
  },
};

export interface AutoConfigureResult {
  createdCount: number;
  skippedCount: number;
  items: Array<{
    provider: string;
    modelType: AIModelType;
    modelId: string;
    action: "created" | "skipped" | "skipped-provider-no-match";
    reason?: string;
  }>;
  missingTypes: AIModelType[];
}

@Injectable()
export class AutoConfigureService {
  private readonly logger = new Logger(AutoConfigureService.name);

  constructor(
    private readonly userApiKeys: UserApiKeysService,
    private readonly modelDiscovery: AiModelDiscoveryService,
    private readonly userModelConfigs: UserModelConfigsService,
  ) {}

  /**
   * 一键 AI 配置：为用户已配的每个 Personal Key，按推荐矩阵自动创建 UserModelConfig。
   *
   * 策略：
   * 1. 遍历用户所有 active Personal Keys
   * 2. 对每个 provider 调 fetchAvailableModels 取真实可用列表
   * 3. 对每个 modelType（CHAT/CHAT_FAST/EMBEDDING/...）按 RECOMMENDED 模式匹配候选
   * 4. 找到第一个命中的 → 创建 UserModelConfig（如果 (userId, provider, modelId) 不存在）
   * 5. 每个 modelType 下的第一个命中自动设为 isDefault
   */
  async runForUser(userId: string): Promise<AutoConfigureResult> {
    const personalKeys = await this.userApiKeys.listUserApiKeys(userId);
    const activePersonal = personalKeys.filter(
      (k) => k.isActive && k.mode === "personal",
    );

    if (activePersonal.length === 0) {
      return {
        createdCount: 0,
        skippedCount: 0,
        items: [],
        missingTypes: [AIModelType.CHAT, AIModelType.EMBEDDING],
      };
    }

    const result: AutoConfigureResult = {
      createdCount: 0,
      skippedCount: 0,
      items: [],
      missingTypes: [],
    };

    // 已创建过什么 modelType 的 default，避免重复设默认
    const defaultedTypes = new Set<AIModelType>();
    // 已存在的配置（避免重复创建）
    const existing = await this.userModelConfigs.listByUser(userId);
    const existingKeys = new Set(
      existing.map((c) => `${c.provider}:${c.modelId.toLowerCase()}`),
    );
    existing
      .filter((c) => c.isEnabled && c.isDefault)
      .forEach((c) => defaultedTypes.add(c.modelType));

    for (const key of activePersonal) {
      const provider = key.provider.toLowerCase();
      const personal = await this.userApiKeys.getPersonalKey(userId, provider);
      if (!personal?.apiKey) continue;

      // 拉 provider 可用模型列表
      const discovery = await this.modelDiscovery
        .fetchAvailableModels(provider, personal.apiKey)
        .catch((error) => {
          this.logger.warn(
            `[auto-configure] fetchAvailableModels failed for ${provider}: ${(error as Error).message}`,
          );
          return { success: false, error: (error as Error).message };
        });

      if (!discovery.success || !("models" in discovery) || !discovery.models) {
        result.items.push({
          provider,
          modelType: AIModelType.CHAT,
          modelId: "(fetch failed)",
          action: "skipped-provider-no-match",
          reason:
            ("error" in discovery && discovery.error) ||
            "Provider /v1/models call failed",
        });
        continue;
      }

      const availableIds = discovery.models.map((m) => m.id);
      const providerRecs = RECOMMENDED[provider];
      if (!providerRecs) {
        result.items.push({
          provider,
          modelType: AIModelType.CHAT,
          modelId: "(provider not in matrix)",
          action: "skipped-provider-no-match",
          reason: "No recommendation patterns defined for this provider",
        });
        continue;
      }

      // 对每个支持的 modelType 找第一个命中
      for (const [typeStr, patterns] of Object.entries(providerRecs)) {
        const modelType = typeStr as AIModelType;
        if (!patterns || patterns.length === 0) continue;

        let matchedId: string | undefined;
        for (const re of patterns) {
          matchedId = availableIds.find((id) => re.test(id));
          if (matchedId) break;
        }
        if (!matchedId) continue;

        const dedupKey = `${provider}:${matchedId.toLowerCase()}`;
        if (existingKeys.has(dedupKey)) {
          result.skippedCount++;
          result.items.push({
            provider,
            modelType,
            modelId: matchedId,
            action: "skipped",
            reason: "Already configured",
          });
          continue;
        }

        const shouldSetDefault = !defaultedTypes.has(modelType);
        try {
          await this.userModelConfigs.create(userId, {
            provider,
            modelId: matchedId,
            displayName: this.buildDisplayName(provider, matchedId, modelType),
            modelType,
            isDefault: shouldSetDefault,
            // 推理系列自动调能力
            ...this.inferCapabilities(matchedId, modelType),
          });
          existingKeys.add(dedupKey);
          if (shouldSetDefault) defaultedTypes.add(modelType);
          result.createdCount++;
          result.items.push({
            provider,
            modelType,
            modelId: matchedId,
            action: "created",
          });
        } catch (error) {
          this.logger.warn(
            `[auto-configure] Failed to create ${provider}/${matchedId}: ${(error as Error).message}`,
          );
          result.skippedCount++;
          result.items.push({
            provider,
            modelType,
            modelId: matchedId,
            action: "skipped",
            reason: (error as Error).message,
          });
        }
      }
    }

    // 最终检查：关键的 CHAT 和 EMBEDDING 是否还缺
    const requiredTypes: AIModelType[] = [
      AIModelType.CHAT,
      AIModelType.EMBEDDING,
    ];
    result.missingTypes = requiredTypes.filter((t) => !defaultedTypes.has(t));

    return result;
  }

  private buildDisplayName(
    provider: string,
    modelId: string,
    modelType: AIModelType,
  ): string {
    const typeShort = {
      CHAT: "",
      CHAT_FAST: " Fast",
      CODE: " Code",
      MULTIMODAL: " Vision",
      IMAGE_GENERATION: " Image",
      IMAGE_EDITING: " Image Edit",
      EMBEDDING: " Embed",
      RERANK: " Rerank",
      EVALUATOR: " Eval",
    }[modelType];
    const providerShort =
      {
        openai: "OpenAI",
        anthropic: "Claude",
        google: "Gemini",
        xai: "Grok",
        deepseek: "DeepSeek",
        cohere: "Cohere",
        groq: "Groq",
        qwen: "Qwen",
        openrouter: "OpenRouter",
        minimax: "MiniMax",
      }[provider] ?? provider;
    return `${providerShort}${typeShort} (${modelId})`;
  }

  private inferCapabilities(
    modelId: string,
    modelType: AIModelType,
  ): {
    isReasoning?: boolean;
    supportsTemperature?: boolean;
    tokenParamName?: string;
    supportsVision?: boolean;
    apiFormat?: string;
  } {
    const lower = modelId.toLowerCase();
    const isReasoning =
      /^o[1-5]/i.test(lower) ||
      lower.includes("gpt-5") ||
      lower.includes("reasoner");
    const supportsVision =
      modelType === AIModelType.MULTIMODAL ||
      /4o|vision|gemini|claude-3/i.test(lower);
    return {
      isReasoning,
      supportsTemperature: !isReasoning,
      tokenParamName: isReasoning ? "max_completion_tokens" : "max_tokens",
      supportsVision,
    };
  }
}
