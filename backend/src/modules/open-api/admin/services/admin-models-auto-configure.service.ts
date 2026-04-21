import { Injectable, Logger } from "@nestjs/common";
import { AIModelType } from "@prisma/client";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { AiModelDiscoveryService } from "../../../ai-engine/llm/services/ai-model-discovery.service";
import { ModelRecommendationsService } from "../../../ai-engine/llm/recommendations/model-recommendations.service";
import { SecretsService } from "../../../ai-infra/secrets/secrets.service";

export interface AdminAutoConfigureResult {
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
  /** 哪些 provider 被扫描过（便于 UI 回显） */
  providersScanned: string[];
}

/**
 * 管理员版一键 AI 配置：
 *
 * 1. 从现有 AIModel 表取所有 provider；每个 provider 取一条记录作为 key 来源
 *    （优先 secretKey → Secret Manager；退化到 apiKey 字段）
 * 2. 调 /v1/models 拉可用模型
 * 3. ModelRecommendationsService 按 (provider, modelType) 取 patterns
 * 4. 按顺序匹配 modelId；首个命中 → 创建 AIModel（同 (modelId, name) 已存在则跳过）
 * 5. 该 modelType 如果当前还没 isDefault，首个命中自动设为 isSystemDefault（即 isDefault=true）
 *
 * 不同于用户版：
 *   - 写入的表是全局 AIModel，isDefault 语义为"系统默认 fallback tier"
 *   - 不复用已保存的 UserApiKey；发现源来自既有 AIModel 的 key
 *   - 重复策略：已有同 modelId 的 AIModel 直接跳过（避免覆盖 apiKey / secretKey）
 */
@Injectable()
export class AdminModelsAutoConfigureService {
  private readonly logger = new Logger(AdminModelsAutoConfigureService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly modelDiscovery: AiModelDiscoveryService,
    private readonly recommendations: ModelRecommendationsService,
    private readonly secrets: SecretsService,
  ) {}

  async run(): Promise<AdminAutoConfigureResult> {
    // 按 provider 聚合 AIModel，每个 provider 取一条作 key 种子
    const allModels = await this.prisma.aIModel.findMany({
      select: {
        id: true,
        provider: true,
        modelId: true,
        apiEndpoint: true,
        apiKey: true,
        secretKey: true,
      },
    });

    const providerSeed = new Map<
      string,
      { apiKey: string | null; secretKey: string | null; apiEndpoint: string }
    >();
    for (const m of allModels) {
      const key = m.provider.toLowerCase();
      // 优先有 secretKey 的（更安全）；否则用 apiKey 的
      const existing = providerSeed.get(key);
      if (!existing || (m.secretKey && !existing.secretKey)) {
        providerSeed.set(key, {
          apiKey: m.apiKey,
          secretKey: m.secretKey,
          apiEndpoint: m.apiEndpoint,
        });
      }
    }

    const result: AdminAutoConfigureResult = {
      createdCount: 0,
      skippedCount: 0,
      items: [],
      missingTypes: [],
      providersScanned: [],
    };

    if (providerSeed.size === 0) {
      return {
        ...result,
        missingTypes: [AIModelType.CHAT, AIModelType.EMBEDDING],
      };
    }

    const existingModelIds = new Set(
      allModels.map(
        (m) => `${m.provider.toLowerCase()}:${m.modelId.toLowerCase()}`,
      ),
    );

    // 已有 isDefault=true 的 modelType set（避免强抢默认）
    const defaultedTypes = new Set<AIModelType>();
    const existingDefaults = await this.prisma.aIModel.findMany({
      where: { isDefault: true, isEnabled: true },
      select: { modelType: true },
    });
    for (const d of existingDefaults) defaultedTypes.add(d.modelType);

    for (const [provider, seed] of providerSeed.entries()) {
      result.providersScanned.push(provider);

      const apiKey = await this.resolveApiKey(seed);
      if (!apiKey) {
        result.items.push({
          provider,
          modelType: AIModelType.CHAT,
          modelId: "(no usable key)",
          action: "skipped-provider-no-match",
          reason:
            "API key could not be resolved (empty secretKey + empty apiKey)",
        });
        continue;
      }

      const discovery = await this.modelDiscovery
        .fetchAvailableModels(provider, apiKey, seed.apiEndpoint)
        .catch((error) => {
          this.logger.warn(
            `[admin-auto-configure] fetchAvailableModels failed for ${provider}: ${(error as Error).message}`,
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
        if (existingModelIds.has(dedupKey)) {
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
          await this.createAIModel({
            provider,
            modelId: matchedId,
            modelType: rec.modelType,
            apiEndpoint: seed.apiEndpoint,
            apiKey: seed.secretKey ? null : apiKey, // 优先走 secretKey 引用
            secretKey: seed.secretKey,
            isDefault: shouldSetDefault,
          });
          existingModelIds.add(dedupKey);
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
            `[admin-auto-configure] Failed to create ${provider}/${matchedId}: ${(error as Error).message}`,
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

  private async resolveApiKey(seed: {
    apiKey: string | null;
    secretKey: string | null;
  }): Promise<string | null> {
    if (seed.secretKey) {
      const v = await this.secrets.getValueInternal(seed.secretKey);
      if (v) return v.trim();
    }
    return seed.apiKey?.trim() || null;
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

  private async createAIModel(input: {
    provider: string;
    modelId: string;
    modelType: AIModelType;
    apiEndpoint: string;
    apiKey: string | null;
    secretKey: string | null;
    isDefault: boolean;
  }): Promise<void> {
    const caps = this.inferCapabilities(input.modelId, input.modelType);
    const displayName = this.buildDisplayName(
      input.provider,
      input.modelId,
      input.modelType,
    );
    const { icon, color } = this.providerDisplay(input.provider);

    // 如果要设 isDefault，先把该 type 的其他默认置假（保持"一 type 一默认"）
    if (input.isDefault) {
      await this.prisma.aIModel.updateMany({
        where: { modelType: input.modelType, isDefault: true },
        data: { isDefault: false },
      });
    }

    await this.prisma.aIModel.create({
      data: {
        name: input.modelId, // 使用 modelId 作为 name（后续可在 UI 改）
        displayName,
        provider: input.provider,
        modelId: input.modelId,
        modelType: input.modelType,
        icon,
        color,
        apiEndpoint: input.apiEndpoint,
        apiKey: input.apiKey,
        secretKey: input.secretKey,
        maxTokens: caps.isReasoning ? 16000 : 4096,
        temperature: caps.isReasoning ? 1.0 : 0.7,
        isReasoning: caps.isReasoning,
        apiFormat: "openai",
        supportsTemperature: !caps.isReasoning,
        supportsStreaming: true,
        supportsFunctionCalling: true,
        supportsVision: caps.supportsVision,
        tokenParamName: caps.isReasoning
          ? "max_completion_tokens"
          : "max_tokens",
        defaultTimeoutMs: 120000,
        priority: 50,
        isEnabled: true,
        isDefault: input.isDefault,
      },
    });
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
      }[provider.toLowerCase()] ?? provider;
    return `${providerShort}${typeShort} (${modelId})`;
  }

  private inferCapabilities(
    modelId: string,
    modelType: AIModelType,
  ): { isReasoning: boolean; supportsVision: boolean } {
    const lower = modelId.toLowerCase();
    const isReasoning =
      /^o[1-5]/i.test(lower) ||
      lower.includes("gpt-5") ||
      lower.includes("reasoner");
    const supportsVision =
      modelType === AIModelType.MULTIMODAL ||
      /4o|vision|gemini|claude-3/i.test(lower);
    return { isReasoning, supportsVision };
  }

  private providerDisplay(provider: string): { icon: string; color: string } {
    const p = provider.toLowerCase();
    const defaults: Record<string, { icon: string; color: string }> = {
      openai: { icon: "O", color: "from-emerald-500 to-teal-500" },
      anthropic: { icon: "C", color: "from-orange-500 to-amber-500" },
      google: { icon: "G", color: "from-blue-500 to-cyan-500" },
      xai: { icon: "X", color: "from-neutral-800 to-neutral-900" },
      deepseek: { icon: "D", color: "from-indigo-500 to-blue-500" },
      cohere: { icon: "C", color: "from-pink-500 to-rose-500" },
      groq: { icon: "G", color: "from-orange-400 to-red-500" },
      qwen: { icon: "Q", color: "from-purple-500 to-indigo-500" },
      openrouter: { icon: "R", color: "from-gray-700 to-gray-900" },
      minimax: { icon: "M", color: "from-fuchsia-500 to-purple-500" },
    };
    return (
      defaults[p] ?? {
        icon: p.slice(0, 1).toUpperCase(),
        color: "from-gray-500 to-gray-700",
      }
    );
  }
}
