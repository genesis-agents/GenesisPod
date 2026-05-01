import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Optional,
} from "@nestjs/common";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { SecretsService, AuditContext } from "../../../ai-infra/secrets/secrets.service";
import { CreditsService } from "../../../ai-infra/credits/credits.service";
import { EncryptionService } from "../../../ai-infra/encryption/encryption.service";
import { CacheService, CachePrefix, CacheTTL } from "../../../../common/cache";
import {
  SecretCategory,
  CreditTransactionType,
  UserApiKeyMode,
  Prisma,
} from "@prisma/client";
import { ApiKeyMode } from "./dto";

/** Valid provider name pattern */
const PROVIDER_NAME_PATTERN = /^[a-z0-9-]+$/;

/** Minimal model for Anthropic API key validation (cheapest available) */
const ANTHROPIC_VALIDATION_MODEL = "claude-3-haiku-20240307";

/** Provider 默认 API 端点和测试模型映射 */
const PROVIDER_DEFAULTS: Record<
  string,
  { endpoint: string; testModel: string; apiFormat: string }
> = {
  openai: {
    endpoint: "https://api.openai.com/v1",
    testModel: "gpt-4o-mini",
    apiFormat: "openai",
  },
  anthropic: {
    endpoint: "https://api.anthropic.com/v1",
    testModel: "claude-3-haiku-20240307",
    apiFormat: "anthropic",
  },
  deepseek: {
    endpoint: "https://api.deepseek.com/v1",
    testModel: "deepseek-chat",
    apiFormat: "openai",
  },
  google: {
    endpoint: "https://generativelanguage.googleapis.com/v1beta",
    testModel: "gemini-2.0-flash-lite",
    apiFormat: "google",
  },
  xai: {
    endpoint: "https://api.x.ai/v1",
    testModel: "grok-3-mini-fast",
    apiFormat: "openai",
  },
  qwen: {
    endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    testModel: "qwen-turbo",
    apiFormat: "openai",
  },
  cohere: {
    endpoint: "https://api.cohere.com/v2",
    testModel: "command-r",
    apiFormat: "openai",
  },
  groq: {
    endpoint: "https://api.groq.com/openai/v1",
    testModel: "llama-3.3-70b-versatile",
    apiFormat: "openai",
  },
  openrouter: {
    endpoint: "https://openrouter.ai/api/v1",
    testModel: "openrouter/auto",
    apiFormat: "openai",
  },
  minimax: {
    endpoint: "https://api.minimax.chat/v1",
    testModel: "MiniMax-Text-01",
    apiFormat: "openai",
  },
};

/** 捐赠奖励积分 */
const DONATION_REWARD_CREDITS = 5000;
/** 捐赠 Key 被使用时，捐赠者获得的积分 */
const DONATION_USAGE_REWARD_CREDITS = 2;

@Injectable()
export class UserApiKeysService {
  private readonly logger = new Logger(UserApiKeysService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly secretsService: SecretsService,
    private readonly creditsService: CreditsService,
    private readonly encryption: EncryptionService,
    @Optional() private readonly cacheService?: CacheService,
  ) {}

  private encrypt(text: string) {
    return this.encryption.encrypt(text);
  }

  private decrypt(encryptedValue: string, ivHex: string): string | null {
    return this.encryption.decrypt(encryptedValue, ivHex);
  }

  private validateProvider(provider: string): string {
    const normalized = provider.toLowerCase();
    if (!PROVIDER_NAME_PATTERN.test(normalized) || normalized.length > 50) {
      throw new BadRequestException("Invalid provider name");
    }
    return normalized;
  }

  private toPrismaMode(mode: ApiKeyMode): UserApiKeyMode {
    return mode === ApiKeyMode.DONATED
      ? UserApiKeyMode.DONATED
      : UserApiKeyMode.PERSONAL;
  }

  /**
   * SSRF protection: block private/internal IPs.
   *
   * For self-hosted local LLMs (e.g. vLLM/Ollama on the same host),
   * set BYOK_ALLOWED_INTERNAL_HOSTS to a comma-separated allowlist
   * of hostnames, e.g. "localhost,127.0.0.1,host.docker.internal".
   */
  private validateEndpointUrl(url: string): void {
    try {
      const parsed = new URL(url);
      if (!["https:", "http:"].includes(parsed.protocol)) {
        throw new BadRequestException("Endpoint must use HTTP or HTTPS");
      }
      const hostname = parsed.hostname;
      const allowlist = (process.env.BYOK_ALLOWED_INTERNAL_HOSTS || "")
        .split(",")
        .map((h) => h.trim())
        .filter(Boolean);
      if (allowlist.includes(hostname)) {
        return;
      }
      if (this.isPrivateHost(hostname)) {
        throw new BadRequestException("Internal endpoints are not allowed");
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException("Invalid endpoint URL");
    }
  }

  /**
   * 列出用户的所有 API Key 配置（不返回明文 Key）
   */
  async listUserApiKeys(userId: string) {
    const keys = await this.prisma.userApiKey.findMany({
      where: { userId },
      select: {
        id: true,
        provider: true,
        mode: true,
        keyHint: true,
        apiEndpoint: true,
        preferredModelId: true,
        isActive: true,
        lastTestedAt: true,
        testStatus: true,
        usageCount: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return keys.map((key) => ({
      ...key,
      mode: key.mode.toLowerCase() as "personal" | "donated",
      keyHint: key.keyHint || "****",
    }));
  }

  /**
   * BYOK 状态快照 — onboarding banner 用
   * 返回：是否配置、活跃 provider 列表、是否已有至少一条 UserModelConfig。
   */
  async getByokStatus(userId: string): Promise<{
    configured: boolean;
    activeProviders: string[];
    hasModelConfig: boolean;
  }> {
    const [activeKeys, modelConfigCount] = await Promise.all([
      this.prisma.userApiKey.findMany({
        where: { userId, isActive: true, mode: UserApiKeyMode.PERSONAL },
        select: { provider: true },
      }),
      this.prisma.userModelConfig.count({
        where: { userId, isEnabled: true },
      }),
    ]);
    const activeProviders = Array.from(
      new Set(activeKeys.map((k) => k.provider.toLowerCase())),
    );
    return {
      configured: activeProviders.length > 0,
      activeProviders,
      hasModelConfig: modelConfigCount > 0,
    };
  }

  /**
   * 保存或更新用户 API Key
   */
  async saveKey(
    userId: string,
    provider: string,
    apiKey: string,
    mode: ApiKeyMode,
    preferredModelId?: string,
    apiEndpoint?: string,
  ) {
    const normalizedProvider = this.validateProvider(provider);
    if (apiEndpoint) {
      this.validateEndpointUrl(apiEndpoint);
    }
    const prismaMode = this.toPrismaMode(mode);
    const { encryptedValue, iv } = this.encrypt(apiKey);

    // 检查是否已有该 provider 的 Key
    const existing = await this.prisma.userApiKey.findUnique({
      where: { userId_provider: { userId, provider: normalizedProvider } },
    });

    // 如果从捐赠切换到自用，需要先清理捐赠
    if (
      existing &&
      existing.mode === UserApiKeyMode.DONATED &&
      prismaMode === UserApiKeyMode.PERSONAL
    ) {
      await this.cleanupDonation(existing);
    }

    let donatedSecretId: string | null = null;

    // ★ 捐赠模式：Secret 创建 → DB 写入 → 积分授予（有序、可追溯）
    if (prismaMode === UserApiKeyMode.DONATED) {
      // Step 1: 创建/更新 Secret（如果失败，整个操作中止）
      donatedSecretId = await this.createDonatedSecret(
        userId,
        normalizedProvider,
        apiKey,
        apiEndpoint,
      );
    }

    const isFirstDonation =
      prismaMode === UserApiKeyMode.DONATED && !existing?.donationRewardedAt;

    // Step 2: DB 写入（UserApiKey 记录）
    const keyHint = this.generateKeyHint(apiKey);
    const writeData: Prisma.UserApiKeyUpdateInput = {
      encryptedValue,
      iv,
      keyHint,
      mode: prismaMode,
      apiEndpoint: apiEndpoint || null,
      preferredModelId: preferredModelId || null,
      donatedSecretId,
      isActive: true,
      ...(isFirstDonation ? { donationRewardedAt: new Date() } : {}),
    };

    try {
      if (existing) {
        await this.prisma.userApiKey.update({
          where: { id: existing.id },
          data: writeData,
        });
      } else {
        await this.prisma.userApiKey.create({
          data: {
            user: { connect: { id: userId } },
            provider: normalizedProvider,
            encryptedValue,
            iv,
            keyHint,
            mode: prismaMode,
            apiEndpoint: apiEndpoint || null,
            preferredModelId: preferredModelId || null,
            donatedSecretId,
            isActive: true,
            ...(isFirstDonation ? { donationRewardedAt: new Date() } : {}),
          },
        });
      }
    } catch (error) {
      // DB 写入失败 → 回滚 Secret（如果刚创建了）
      if (donatedSecretId && prismaMode === UserApiKeyMode.DONATED) {
        await this.cleanupDonation({
          donatedSecretId,
          userId,
          provider: normalizedProvider,
        });
      }
      throw error;
    }

    // Step 3: 授予积分（DB 已写入成功，即使积分失败也不影响核心功能）
    if (isFirstDonation) {
      try {
        await this.creditsService.grantCredits(
          userId,
          DONATION_REWARD_CREDITS,
          CreditTransactionType.DONATION_REWARD,
          `API Key 捐赠奖励 (${normalizedProvider})`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to grant donation reward for ${normalizedProvider}: ${(error as Error).message}`,
        );
        // 积分失败不回滚 Key 和 Secret，但记录错误以便后续补偿
      }
    }

    // Step 4: 使缓存失效
    await this.invalidateUserKeyCache(userId);

    // Step 5 (BYOK v2)：如果这是该用户首次配置 Personal Key，标记引导完成
    if (prismaMode === UserApiKeyMode.PERSONAL) {
      await this.markOnboardedIfNeeded(userId);
    }

    return { success: true, mode };
  }

  /**
   * 将 User.byokOnboardedAt 从 null 标记为当前时间。
   * 如已设置则不覆盖（避免覆盖老用户的迁移值）。
   */
  async markOnboardedIfNeeded(userId: string): Promise<void> {
    try {
      await this.prisma.user.updateMany({
        where: { id: userId, byokOnboardedAt: null },
        data: { byokOnboardedAt: new Date() },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to mark user ${userId} BYOK onboarded: ${(error as Error).message}`,
      );
    }
  }

  /**
   * 用户已配置过 Personal Key 的全部 provider 集合（供模型路由的
   * availableProviders 过滤使用）。
   */
  async getAvailableProviders(userId: string): Promise<string[]> {
    const rows = await this.prisma.userApiKey.findMany({
      where: {
        userId,
        isActive: true,
        mode: UserApiKeyMode.PERSONAL,
      },
      select: { provider: true },
      distinct: ["provider"],
    });
    return rows.map((r) => r.provider.toLowerCase());
  }

  /**
   * 删除用户 API Key
   */
  async deleteKey(userId: string, provider: string) {
    const normalizedProvider = this.validateProvider(provider);
    const existing = await this.prisma.userApiKey.findUnique({
      where: {
        userId_provider: { userId, provider: normalizedProvider },
      },
    });

    if (!existing) {
      throw new NotFoundException("No API Key found for this provider");
    }

    if (existing.mode === UserApiKeyMode.DONATED) {
      await this.cleanupDonation(existing);
    }

    await this.prisma.userApiKey.delete({ where: { id: existing.id } });

    // 使缓存失效
    await this.invalidateUserKeyCache(userId);

    return { success: true };
  }

  /**
   * 撤回捐赠（保留 Key 为自用模式）
   */
  async withdrawDonation(userId: string, provider: string) {
    const normalizedProvider = this.validateProvider(provider);
    const existing = await this.prisma.userApiKey.findUnique({
      where: {
        userId_provider: { userId, provider: normalizedProvider },
      },
    });

    if (!existing || existing.mode !== UserApiKeyMode.DONATED) {
      throw new BadRequestException("No donated Key found for this provider");
    }

    await this.cleanupDonation(existing);

    await this.prisma.userApiKey.update({
      where: { id: existing.id },
      data: { mode: UserApiKeyMode.PERSONAL, donatedSecretId: null },
    });

    // 使缓存失效
    await this.invalidateUserKeyCache(userId);

    return { success: true };
  }

  /**
   * 测试 API Key 是否有效
   */
  async testKey(
    provider: string,
    apiKey: string,
    apiEndpoint?: string,
  ): Promise<{ success: boolean; message: string }> {
    const normalizedProvider = this.validateProvider(provider);
    if (apiEndpoint) {
      this.validateEndpointUrl(apiEndpoint);
    }
    const defaults = PROVIDER_DEFAULTS[normalizedProvider];
    const endpoint = apiEndpoint || defaults?.endpoint;

    if (!endpoint) {
      return {
        success: false,
        message: "Unknown provider. Please provide a custom API endpoint.",
      };
    }

    try {
      const apiFormat = defaults?.apiFormat || "openai";
      const isValid = await this.testProviderKey(
        apiFormat,
        apiKey,
        endpoint,
        normalizedProvider,
      );
      return isValid
        ? { success: true, message: "Connection successful" }
        : { success: false, message: "API Key validation failed" };
    } catch (error) {
      this.logger.warn(
        `Test key failed for ${normalizedProvider}: ${(error as Error).message}`,
      );
      return {
        success: false,
        message: "Connection failed. Please check your API key and endpoint.",
      };
    }
  }

  /**
   * 获取用户的个人 Key（用于 AI 调用优先级判断）
   * 结果缓存 5 分钟以减少数据库查询
   */
  async getPersonalKey(
    userId: string,
    provider: string,
  ): Promise<{
    apiKey: string;
    apiEndpoint?: string | null;
    preferredModelId?: string | null;
  } | null> {
    const normalizedProvider = provider.toLowerCase();
    const cacheKey = `${CachePrefix.USER_API_KEY}${userId}:${normalizedProvider}`;

    // 尝试从缓存获取
    if (this.cacheService) {
      const cached = await this.cacheService.get<{
        apiKey: string;
        apiEndpoint?: string | null;
        preferredModelId?: string | null;
      }>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const key = await this.prisma.userApiKey.findFirst({
      where: {
        userId,
        provider: normalizedProvider,
        mode: UserApiKeyMode.PERSONAL,
        isActive: true,
      },
    });

    if (!key) {
      // 缓存空结果以避免重复查询（较短 TTL）
      if (this.cacheService) {
        await this.cacheService.set(cacheKey, null, CacheTTL.SHORT);
      }
      return null;
    }

    const decrypted = this.decrypt(key.encryptedValue, key.iv);
    if (!decrypted) return null;

    const result = {
      apiKey: decrypted,
      apiEndpoint: key.apiEndpoint,
      preferredModelId: key.preferredModelId,
    };

    // 缓存结果
    if (this.cacheService) {
      await this.cacheService.set(cacheKey, result, CacheTTL.DEFAULT);
    }

    return result;
  }

  /**
   * 使用户 API Key 缓存失效
   * 当用户更新、删除 Key 时调用
   */
  async invalidateUserKeyCache(userId: string): Promise<void> {
    if (this.cacheService) {
      await this.cacheService.invalidateUserCache(userId);
    }
  }

  /**
   * 从共享池获取捐赠 Key（轮询选一个）
   */
  async getDonatedKey(provider: string): Promise<{
    apiKey: string;
    apiEndpoint?: string | null;
    donorUserId: string;
  } | null> {
    // 使用原始 SQL 原子性地选择并递增使用计数，避免并发竞争
    // 选择 usageCount 最小的一条，并原子递增
    const normalizedProvider = provider.toLowerCase();

    const candidates = await this.prisma.userApiKey.findMany({
      where: {
        provider: normalizedProvider,
        mode: UserApiKeyMode.DONATED,
        isActive: true,
      },
      orderBy: { usageCount: "asc" },
      take: 3, // 取多条候选，防止单条解密失败
    });

    for (const key of candidates) {
      const decrypted = this.decrypt(key.encryptedValue, key.iv);
      if (!decrypted) {
        this.logger.warn(`Failed to decrypt donated key ${key.id}, skipping`);
        continue;
      }

      // 原子递增：使用乐观并发——只更新 usageCount 匹配的行
      const updated = await this.prisma.userApiKey.updateMany({
        where: {
          id: key.id,
          usageCount: key.usageCount, // 乐观锁
        },
        data: { usageCount: { increment: 1 } },
      });

      if (updated.count === 0) {
        // 被其他并发请求抢先，尝试下一个候选
        continue;
      }

      // 给捐赠者发放持续奖励积分（异步，不阻塞主流程）
      this.creditsService
        .grantCredits(
          key.userId,
          DONATION_USAGE_REWARD_CREDITS,
          CreditTransactionType.DONATION_USAGE_REWARD,
          `API Key 共享使用奖励 (${normalizedProvider})`,
        )
        .catch((error) => {
          this.logger.warn(
            `Failed to grant usage reward to donor ${key.userId}: ${(error as Error).message}`,
          );
        });

      return {
        apiKey: decrypted,
        apiEndpoint: key.apiEndpoint,
        donorUserId: key.userId,
      };
    }

    return null;
  }

  /**
   * 获取支持的 Provider 列表
   */
  getSupportedProviders() {
    return Object.entries(PROVIDER_DEFAULTS).map(([id, config]) => ({
      id,
      name: this.getProviderDisplayName(id),
      endpoint: config.endpoint,
    }));
  }

  // ==================== Private Helpers ====================

  private async createDonatedSecret(
    userId: string,
    provider: string,
    apiKey: string,
    apiEndpoint?: string,
  ): Promise<string> {
    const shortId = userId.substring(0, 8);
    const secretName = `donated-${provider}-${shortId}`;
    const auditCtx: AuditContext = { userId };

    // 检查是否已存在
    const existing = await this.secretsService.findByName(secretName);
    if (existing) {
      await this.secretsService.update(
        secretName,
        { value: apiKey, isActive: true },
        auditCtx,
      );
      return existing.id;
    }

    const secret = await this.secretsService.create(
      {
        name: secretName,
        displayName: `User Donated - ${this.getProviderDisplayName(provider)}`,
        value: apiKey,
        category: SecretCategory.USER_DONATED,
        provider,
        description: `Donated by user ${shortId}. Endpoint: ${apiEndpoint || "default"}`,
      },
      auditCtx,
    );

    return secret.id;
  }

  private async cleanupDonation(key: {
    donatedSecretId: string | null;
    userId: string;
    provider: string;
  }) {
    if (key.donatedSecretId) {
      try {
        const shortId = key.userId.substring(0, 8);
        const secretName = `donated-${key.provider}-${shortId}`;
        await this.secretsService.delete(secretName, { userId: key.userId });
      } catch (error) {
        const msg = (error as Error).message;
        // 如果 Secret 被引用无法删除，至少将其禁用
        if (msg.includes("still referenced")) {
          this.logger.warn(
            `Cannot delete donated secret (referenced): deactivating instead`,
          );
          try {
            const shortId = key.userId.substring(0, 8);
            const secretName = `donated-${key.provider}-${shortId}`;
            await this.secretsService.update(
              secretName,
              { isActive: false },
              { userId: key.userId },
            );
          } catch (updateError) {
            this.logger.error(
              `Failed to deactivate donated secret: ${(updateError as Error).message}`,
            );
          }
        } else {
          this.logger.warn(`Failed to delete donated secret: ${msg}`);
        }
      }
    }
  }

  private async testProviderKey(
    apiFormat: string,
    apiKey: string,
    endpoint: string,
    provider: string,
  ): Promise<boolean> {
    const timeout = 15000; // 15s timeout
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      try {
        if (apiFormat === "anthropic") {
          // Use a minimal request with max_tokens=1 to validate the key
          // without generating meaningful output
          const response = await fetch(`${endpoint}/messages`, {
            method: "POST",
            headers: {
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: ANTHROPIC_VALIDATION_MODEL,
              max_tokens: 1,
              messages: [{ role: "user", content: "." }],
            }),
            signal: controller.signal,
          });
          return response.status !== 401 && response.status !== 403;
        }

        if (apiFormat === "google") {
          const response = await fetch(
            `${endpoint}/models?key=${apiKey}&pageSize=1`,
            { signal: controller.signal },
          );
          return response.status !== 401 && response.status !== 403;
        }

        // Default: OpenAI-compatible — list models
        const response = await fetch(`${endpoint}/models`, {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: controller.signal,
        });
        return response.status !== 401 && response.status !== 403;
      } finally {
        clearTimeout(timer);
      }
    } catch (error) {
      this.logger.warn(
        `API Key test failed for ${provider}: ${(error as Error).message}`,
      );
      return false;
    }
  }

  private generateKeyHint(apiKey: string): string {
    if (apiKey.length <= 8) return "****";
    const prefix = apiKey.substring(0, 4);
    const suffix = apiKey.substring(apiKey.length - 4);
    return `${prefix}...${suffix}`;
  }

  private isPrivateHost(hostname: string): boolean {
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname === "::1" ||
      hostname === "[::1]"
    ) {
      return true;
    }
    // 10.0.0.0/8
    if (hostname.startsWith("10.")) return true;
    // 192.168.0.0/16
    if (hostname.startsWith("192.168.")) return true;
    // 169.254.0.0/16 (link-local)
    if (hostname.startsWith("169.254.")) return true;
    // 172.16.0.0/12 (172.16.* - 172.31.*)
    if (hostname.startsWith("172.")) {
      const second = parseInt(hostname.split(".")[1], 10);
      if (second >= 16 && second <= 31) return true;
    }
    return false;
  }

  private getProviderDisplayName(provider: string): string {
    const names: Record<string, string> = {
      openai: "OpenAI",
      anthropic: "Anthropic",
      deepseek: "DeepSeek",
      google: "Google Gemini",
      xai: "xAI (Grok)",
      qwen: "Qwen",
      cohere: "Cohere",
      groq: "Groq",
      openrouter: "OpenRouter",
      minimax: "MiniMax",
    };
    return names[provider] || provider;
  }
}
