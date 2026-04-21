import { Injectable, Logger } from "@nestjs/common";
import { AIModelType } from "@prisma/client";
import { UserApiKeysService } from "../../ai-infra/user-api-keys/user-api-keys.service";
import { UserModelConfigsService } from "../../ai-infra/user-model-configs/user-model-configs.service";
import { AiModelDiscoveryService } from "./services/ai-model-discovery.service";
import { ModelRecommendationsService } from "./recommendations/model-recommendations.service";
import { EXCLUDED_MODEL_SUBSTRINGS } from "./recommendations/default-recommendations";

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

/**
 * 用户版一键 AI 配置：
 * 1. 遍历用户所有 active Personal Keys
 * 2. 每个 provider 调 fetchAvailableModels 取真实可用列表
 * 3. 从 ModelRecommendationsService 读 (provider, modelType) → patterns
 * 4. 按顺序匹配 modelId，首个命中 → 创建 UserModelConfig
 * 5. 每个 modelType 下首个命中自动设为 isDefault
 */
@Injectable()
export class AutoConfigureService {
  private readonly logger = new Logger(AutoConfigureService.name);

  constructor(
    private readonly userApiKeys: UserApiKeysService,
    private readonly modelDiscovery: AiModelDiscoveryService,
    private readonly userModelConfigs: UserModelConfigsService,
    private readonly recommendations: ModelRecommendationsService,
  ) {}

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

    const defaultedTypes = new Set<AIModelType>();
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

      const discovery = await this.modelDiscovery
        .fetchAvailableModels(provider, personal.apiKey)
        .catch((error) => {
          this.logger.warn(
            `[user-auto-configure] fetchAvailableModels failed for ${provider}: ${(error as Error).message}`,
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

      // 过滤 specialty 变体（-search / -tts / -audio / -realtime / -preview 等），
      // 避免通用 regex 误中语音/搜索/实时等非通用模型。
      const availableIds = discovery.models
        .map((m) => m.id)
        .filter((id) => {
          const lower = id.toLowerCase();
          return !EXCLUDED_MODEL_SUBSTRINGS.some((s) => lower.includes(s));
        });
      const providerRecs = await this.recommendations.getForProvider(provider);
      if (providerRecs.length === 0) {
        result.items.push({
          provider,
          modelType: AIModelType.CHAT,
          modelId: "(provider not in matrix)",
          action: "skipped-provider-no-match",
          reason: "No recommendation patterns defined for this provider",
        });
        continue;
      }

      for (const rec of providerRecs) {
        const matchedId = this.firstMatch(availableIds, rec.patterns);
        if (!matchedId) continue;

        const dedupKey = `${provider}:${matchedId.toLowerCase()}`;
        if (existingKeys.has(dedupKey)) {
          result.skippedCount++;
          result.items.push({
            provider,
            modelType: rec.modelType,
            modelId: matchedId,
            action: "skipped",
            reason: "Already configured",
          });
          continue;
        }

        const shouldSetDefault = !defaultedTypes.has(rec.modelType);
        try {
          await this.userModelConfigs.create(userId, {
            provider,
            modelId: matchedId,
            displayName: this.buildDisplayName(
              provider,
              matchedId,
              rec.modelType,
            ),
            modelType: rec.modelType,
            isDefault: shouldSetDefault,
            ...this.inferCapabilities(matchedId, rec.modelType),
          });
          existingKeys.add(dedupKey);
          if (shouldSetDefault) defaultedTypes.add(rec.modelType);
          result.createdCount++;
          result.items.push({
            provider,
            modelType: rec.modelType,
            modelId: matchedId,
            action: "created",
          });
        } catch (error) {
          this.logger.warn(
            `[user-auto-configure] Failed to create ${provider}/${matchedId}: ${(error as Error).message}`,
          );
          result.skippedCount++;
          result.items.push({
            provider,
            modelType: rec.modelType,
            modelId: matchedId,
            action: "skipped",
            reason: (error as Error).message,
          });
        }
      }
    }

    const requiredTypes: AIModelType[] = [
      AIModelType.CHAT,
      AIModelType.EMBEDDING,
    ];
    result.missingTypes = requiredTypes.filter((t) => !defaultedTypes.has(t));

    return result;
  }

  private firstMatch(
    availableIds: string[],
    patterns: string[],
  ): string | undefined {
    for (const p of patterns) {
      let re: RegExp;
      try {
        re = new RegExp(p, "i");
      } catch {
        continue;
      }
      const match = availableIds.find((id) => re.test(id));
      if (match) return match;
    }
    return undefined;
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
