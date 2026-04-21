import { Injectable, Logger } from "@nestjs/common";
import { AIModelType } from "@prisma/client";
import { UserApiKeysService } from "../../ai-infra/user-api-keys/user-api-keys.service";
import { UserModelConfigsService } from "../../ai-infra/user-model-configs/user-model-configs.service";
import { AiModelDiscoveryService } from "./services/ai-model-discovery.service";
import { ModelRecommendationsService } from "./recommendations/model-recommendations.service";
import {
  EXCLUDED_MODEL_SUBSTRINGS,
  PROVIDER_PREFERENCE_BY_TYPE,
} from "./recommendations/default-recommendations";

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
 * 用户版一键 AI 配置（重构版）：
 * - 遍历 modelType 维度，不再遍历 provider
 * - 每个 modelType 按 `PROVIDER_PREFERENCE_BY_TYPE` 顺序找"用户有 Key + /v1/models 命中"的首个 provider
 * - 命中即停，**每个 modelType 只建一个默认行**——避免中等 provider 污染列表
 * - 已有同 (provider, modelId, modelType) 的行跳过
 * - 已有 default 的 modelType 不再创建第二条（尊重用户手工设置）
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

    // provider → apiKey 映射（用户保存的 Personal Key），用于按偏好顺序查找
    const providerKeyMap = new Map<string, string>();
    for (const key of activePersonal) {
      const provider = key.provider.toLowerCase();
      if (providerKeyMap.has(provider)) continue;
      const personal = await this.userApiKeys.getPersonalKey(userId, provider);
      if (personal?.apiKey) providerKeyMap.set(provider, personal.apiKey);
    }

    // 已有配置（用于去重 + 尊重用户现有默认）
    const existing = await this.userModelConfigs.listByUser(userId);
    const existingKeys = new Set(
      existing.map(
        (c) => `${c.provider}:${c.modelId.toLowerCase()}:${c.modelType}`,
      ),
    );
    const defaultedTypes = new Set<AIModelType>();
    existing
      .filter((c) => c.isEnabled && c.isDefault)
      .forEach((c) => defaultedTypes.add(c.modelType));

    // 一个 provider 一个 modelType 只调一次 /v1/models，缓存复用
    const discoveryCache = new Map<string, string[] | null>();

    // ★ 核心循环：modelType 维度
    for (const [modelTypeStr, preferredProviders] of Object.entries(
      PROVIDER_PREFERENCE_BY_TYPE,
    )) {
      const modelType = modelTypeStr as AIModelType;

      // 已有默认就跳过（不污染，不强抢）
      if (defaultedTypes.has(modelType)) continue;

      let created = false;

      for (const provider of preferredProviders) {
        if (created) break;

        const apiKey = providerKeyMap.get(provider);
        if (!apiKey) continue; // 用户没配这个 provider 的 Key

        // 拉可用模型（per-type 过滤，如 EMBEDDING 只返回 embedding 模型）
        const availableIds = await this.getAvailableIds(
          provider,
          apiKey,
          modelType,
          discoveryCache,
        );
        if (!availableIds || availableIds.length === 0) continue;

        // 取 recommendation（DB 优先、默认 fallback、别名兜底）
        const providerRecs =
          await this.recommendations.getForProvider(provider);
        const rec = providerRecs.find((r) => r.modelType === modelType);
        if (!rec || rec.patterns.length === 0) continue;

        const matchedId = this.firstMatch(availableIds, rec.patterns);
        if (!matchedId) continue;

        const dedupKey = `${provider}:${matchedId.toLowerCase()}:${modelType}`;
        if (existingKeys.has(dedupKey)) {
          // 已有但没 default——提升为 default
          const existingRow = existing.find(
            (c) =>
              c.provider === provider &&
              c.modelId.toLowerCase() === matchedId.toLowerCase() &&
              c.modelType === modelType,
          );
          if (existingRow && !existingRow.isDefault) {
            try {
              await this.userModelConfigs.update(userId, existingRow.id, {
                isDefault: true,
              });
              defaultedTypes.add(modelType);
              result.items.push({
                provider,
                modelType,
                modelId: matchedId,
                action: "skipped",
                reason: "Already exists — promoted to default",
              });
              created = true;
              continue;
            } catch (error) {
              this.logger.warn(
                `[user-auto-configure] Failed to promote ${provider}/${matchedId}/${modelType} to default: ${(error as Error).message}`,
              );
            }
          }
          result.skippedCount++;
          result.items.push({
            provider,
            modelType,
            modelId: matchedId,
            action: "skipped",
            reason: "Already configured",
          });
          // 即使已存在，也算 modelType 已覆盖，不要再尝试其他 provider
          created = true;
          continue;
        }

        try {
          await this.userModelConfigs.create(userId, {
            provider,
            modelId: matchedId,
            displayName: this.buildDisplayName(provider, matchedId, modelType),
            modelType,
            isDefault: true, // 每个 modelType 只建一个，直接设为默认
            ...this.inferCapabilities(matchedId, modelType),
          });
          existingKeys.add(dedupKey);
          defaultedTypes.add(modelType);
          result.createdCount++;
          result.items.push({
            provider,
            modelType,
            modelId: matchedId,
            action: "created",
          });
          created = true;
        } catch (error) {
          this.logger.warn(
            `[user-auto-configure] Failed to create ${provider}/${matchedId}/${modelType}: ${(error as Error).message}`,
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

    const requiredTypes: AIModelType[] = [
      AIModelType.CHAT,
      AIModelType.EMBEDDING,
    ];
    result.missingTypes = requiredTypes.filter((t) => !defaultedTypes.has(t));

    return result;
  }

  /**
   * 拉 provider 某个 modelType 的可用模型列表（缓存 + specialty 黑名单过滤）。
   */
  private async getAvailableIds(
    provider: string,
    apiKey: string,
    modelType: AIModelType,
    cache: Map<string, string[] | null>,
  ): Promise<string[] | null> {
    const cacheKey = `${provider}:${modelType}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey)!;

    const discovery = await this.modelDiscovery
      .fetchAvailableModels(provider, apiKey, undefined, modelType)
      .catch((error) => {
        this.logger.warn(
          `[user-auto-configure] fetchAvailableModels(${provider}, ${modelType}) failed: ${(error as Error).message}`,
        );
        return { success: false, error: (error as Error).message };
      });

    if (!discovery.success || !("models" in discovery) || !discovery.models) {
      cache.set(cacheKey, null);
      return null;
    }

    // Image 类型保留所有（gpt-image-1 合法但 includes("-image-")）
    const isImageType =
      modelType === AIModelType.IMAGE_GENERATION ||
      modelType === AIModelType.IMAGE_EDITING;

    const filtered = discovery.models
      .map((m) => m.id)
      .filter((id) => {
        if (isImageType) return true;
        const lower = id.toLowerCase();
        return !EXCLUDED_MODEL_SUBSTRINGS.some((s) => lower.includes(s));
      });

    cache.set(cacheKey, filtered);
    return filtered;
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

    // ★ 区分两个概念：
    //   (A) API 协议层：OpenAI 的 o1/o3/gpt-5 真推理系列走 max_completion_tokens 且不支持 temperature。
    //   (B) 能力层：LeaderPlanning 选"推理模型"时看的是"能不能做推理任务"（范围更宽）。
    // 两者都满足时才是 o1 那种特殊协议；只满足 (B) 的（如 gpt-4o、Claude 3.5 Sonnet）
    // 走普通 chat 协议但被允许承担 Leader 角色。
    const usesReasoningTokenProtocol =
      /^o[1-5]/i.test(lower) || lower.includes("gpt-5");

    const isReasoningCapable =
      usesReasoningTokenProtocol ||
      /^gpt-4o(?!-mini)/i.test(lower) ||
      /^gpt-4-turbo/i.test(lower) ||
      lower.includes("claude-3-5-sonnet") ||
      lower.includes("claude-sonnet-4") ||
      lower.includes("claude-3-opus") ||
      lower.includes("claude-opus") ||
      lower.includes("gemini-1.5-pro") ||
      lower.includes("gemini-2.0-pro") ||
      lower.includes("gemini-2.5-pro") ||
      /^grok-3(?!-mini)/i.test(lower) ||
      /^grok-4/i.test(lower) ||
      lower.includes("reasoner") ||
      lower.includes("deepseek-r");

    const supportsVision =
      modelType === AIModelType.MULTIMODAL ||
      /4o|vision|gemini|claude-3/i.test(lower);
    return {
      isReasoning: isReasoningCapable,
      supportsTemperature: !usesReasoningTokenProtocol,
      tokenParamName: usesReasoningTokenProtocol
        ? "max_completion_tokens"
        : "max_tokens",
      supportsVision,
    };
  }
}
