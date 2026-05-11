import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Optional,
} from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import {
  SecretsService,
  AuditContext,
} from "../../../ai-infra/secrets/secrets.service";
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
import {
  KeyHealthStore,
  buildPersonalKeyId,
  ProviderProbeService,
} from "../health";

/** Valid provider name pattern */
const PROVIDER_NAME_PATTERN = /^[a-z0-9-]+$/;

// 2026-05-11 P2: PROVIDER_DEFAULTS hardcoded 表删除。Provider 配置完全
// 数据驱动 —— resolveProviderDefaults 只读 DB ai_providers 表，找不到
// 返回 null + 友好报错，让 admin 在 UI 配置（不再硬编码 fallback）。

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
    private readonly providerProbe: ProviderProbeService,
    @Optional() private readonly cacheService?: CacheService,
    @Optional() private readonly keyHealthStore?: KeyHealthStore,
    @Optional() private readonly eventEmitter?: EventEmitter2,
  ) {}

  /**
   * 通知所有订阅方 BYOK 配置变更（EmbeddingService 会清 per-user embedding cache）。
   * 2026-05-12: 修"用户配了 BYOK 但下次 embedding 还在用 60s 前的旧 cache"
   */
  private emitUserApiKeyChanged(userId: string): void {
    if (!this.eventEmitter) return;
    this.eventEmitter.emit("user-api-key.changed", { userId });
  }

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
        label: true,
        mode: true,
        keyHint: true,
        apiEndpoint: true,
        preferredModelId: true,
        isActive: true,
        lastUsedAt: true,
        testStatus: true,
        usageCount: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ provider: "asc" }, { label: "asc" }],
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
    /** PR-2: 多 key 标签（"default" / "personal-org-a" / "backup"） */
    label: string = "default",
  ) {
    const normalizedProvider = this.validateProvider(provider);
    const normalizedLabel = (label || "default").trim().toLowerCase();
    if (apiEndpoint) {
      this.validateEndpointUrl(apiEndpoint);
    }
    const prismaMode = this.toPrismaMode(mode);
    const { encryptedValue, iv } = this.encrypt(apiKey);

    // 检查是否已有该 provider + label 的 Key
    const existing = await this.prisma.userApiKey.findUnique({
      where: {
        userId_provider_label: {
          userId,
          provider: normalizedProvider,
          label: normalizedLabel,
        },
      },
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
            label: normalizedLabel,
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
    this.emitUserApiKeyChanged(userId);

    // PR-1 (2026-05-05) failover: rotate / 新增 / endpoint 改时清 LastGood + 旧 KeyHealth
    //   - rotate（同 label 改 apiKey）：旧 KeyHealth 状态对新 apiKey 不再适用，必须清
    //   - 新增 label：LastGood 可能还指向 stale key，强制重选
    if (this.keyHealthStore) {
      const keyId = buildPersonalKeyId(
        userId,
        normalizedProvider,
        normalizedLabel,
      );
      await this.keyHealthStore.delete(keyId);
      await this.keyHealthStore.clearLastGood(userId, normalizedProvider);
    }

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
  async deleteKey(userId: string, provider: string, label: string = "default") {
    const normalizedProvider = this.validateProvider(provider);
    const normalizedLabel = (label || "default").trim().toLowerCase();
    const existing = await this.prisma.userApiKey.findUnique({
      where: {
        userId_provider_label: {
          userId,
          provider: normalizedProvider,
          label: normalizedLabel,
        },
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
    this.emitUserApiKeyChanged(userId);

    // PR-1 (2026-05-05) failover: 清理 KeyHealth 记录 + LastGood
    if (this.keyHealthStore) {
      const keyId = buildPersonalKeyId(
        userId,
        normalizedProvider,
        normalizedLabel,
      );
      await this.keyHealthStore.delete(keyId);
      await this.keyHealthStore.clearLastGood(userId, normalizedProvider);
    }

    return { success: true };
  }

  /**
   * 撤回捐赠（保留 Key 为自用模式）
   */
  async withdrawDonation(
    userId: string,
    provider: string,
    label: string = "default",
  ) {
    const normalizedProvider = this.validateProvider(provider);
    const normalizedLabel = (label || "default").trim().toLowerCase();
    const existing = await this.prisma.userApiKey.findUnique({
      where: {
        userId_provider_label: {
          userId,
          provider: normalizedProvider,
          label: normalizedLabel,
        },
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
    this.emitUserApiKeyChanged(userId);

    return { success: true };
  }

  /**
   * 测试 API Key 是否有效（pre-save 表单验证用）。
   *
   * ★ 2026-05-06: BYOK 场景下 testKey 接收的是用户在表单输入的明文 apiKey
   *   （未必对应已保存行）。即便 user 已存有同 provider 的 key，也不能用
   *   updateMany 把状态写到所有 label —— 用户测的是这条新值，不是已存行。
   *   所以 BYOK testKey 只返回结果，不写 DB；保存后的健康状态由业务流量调用
   *   时的 markSuccess/markFailure 写入（它们知道具体 keyId）。
   */
  async testKey(
    provider: string,
    apiKey: string,
    apiEndpoint?: string,
    userId?: string,
  ): Promise<{ success: boolean; message: string; errorCode?: string }> {
    const normalizedProvider = this.validateProvider(provider);
    if (apiEndpoint) {
      this.validateEndpointUrl(apiEndpoint);
    }
    const defaults = await this.resolveProviderDefaults(
      normalizedProvider,
      userId,
    );
    const endpoint = apiEndpoint || defaults?.endpoint;

    if (!endpoint) {
      return {
        success: false,
        message:
          `Provider "${normalizedProvider}" 未在 ai_providers 表配置，` +
          `请填写完整 API Endpoint，或让 admin 在 /admin/ai-providers 维护页添加。`,
        errorCode: "UNKNOWN",
      };
    }

    const apiFormat = defaults?.apiFormat || "openai";
    const result = await this.providerProbe.probe({
      apiFormat,
      apiKey,
      endpoint,
      providerLabel: normalizedProvider,
    });

    if (result.ok) {
      return { success: true, message: "Connection successful" };
    }
    return {
      success: false,
      message: result.errorMessage ?? "API Key validation failed",
      errorCode: result.errorCode,
    };
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

    // PR-2: 多 key 支持 — label="default" 优先；其次按 lastUsedAt desc + label asc。
    //   后续若加 key health probing 可改为按 testStatus/score 排序。
    const key = await this.prisma.userApiKey.findFirst({
      where: {
        userId,
        provider: normalizedProvider,
        mode: UserApiKeyMode.PERSONAL,
        isActive: true,
      },
      orderBy: [
        { label: "asc" }, // "default" 字典序最小，优先命中
        { lastUsedAt: { sort: "desc", nulls: "last" } },
      ],
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
   * PR-1 (2026-05-05) failover: 列出该 user/provider 下所有可用 PERSONAL key（解密后）。
   *
   * 排序：label asc（"default" 字典序最小，自然第一），同 label 内 lastUsedAt desc。
   * 仅返回 isActive=true & PERSONAL mode；DONATED key 不进个人调用链路。
   *
   * 调用方（KeyResolver.resolveKeyChain）拿到列表后再叠加 KeyHealthStore.filterUsable
   * 过滤 DEAD/COOLDOWN，并把 LastGood 提到队首。
   */
  async listPersonalKeys(
    userId: string,
    provider: string,
  ): Promise<
    Array<{
      keyRowId: string;
      label: string;
      apiKey: string;
      apiEndpoint: string | null;
      preferredModelId: string | null;
    }>
  > {
    const normalizedProvider = provider.toLowerCase();
    const keys = await this.prisma.userApiKey.findMany({
      where: {
        userId,
        provider: normalizedProvider,
        mode: UserApiKeyMode.PERSONAL,
        isActive: true,
      },
      orderBy: [
        { label: "asc" },
        { lastUsedAt: { sort: "desc", nulls: "last" } },
      ],
    });
    const result: Array<{
      keyRowId: string;
      label: string;
      apiKey: string;
      apiEndpoint: string | null;
      preferredModelId: string | null;
    }> = [];
    for (const k of keys) {
      const decrypted = this.decrypt(k.encryptedValue, k.iv);
      if (!decrypted) continue;
      result.push({
        keyRowId: k.id,
        label: k.label,
        apiKey: decrypted,
        apiEndpoint: k.apiEndpoint,
        preferredModelId: k.preferredModelId,
      });
    }
    return result;
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
   * 获取支持的 Provider 列表 —— 数据驱动单一真源（DB ai_providers）。
   *
   * 2026-05-11 P2: 删除 PROVIDER_DEFAULTS 硬编码 fallback。DB 未 seed 时
   * 返回空数组，前端展示空态引导 admin 去 /admin/ai-providers 维护页配置。
   * 包含：scope=system 的全局 provider + 该 user 自定义的 scope=user provider。
   */
  async getSupportedProviders(userId?: string) {
    try {
      const dbProviders = await this.prisma.aIProvider.findMany({
        where: {
          isEnabled: true,
          OR: [
            { scope: "system" },
            ...(userId ? [{ scope: "user", ownerUserId: userId }] : []),
          ],
        },
        orderBy: [{ scope: "asc" }, { displayOrder: "asc" }],
      });
      return dbProviders.map((p) => ({
        id: p.slug,
        name: p.name,
        endpoint: p.endpoint,
        iconUrl: p.iconUrl,
        freeTierNote: p.freeTierNote,
        docUrl: p.docUrl,
        capabilities: p.capabilities,
        scope: p.scope,
        isCustom: p.scope === "user",
      }));
    } catch (err) {
      this.logger.warn(
        `[getSupportedProviders] DB query failed (${(err as Error).message}); returning empty list`,
      );
      return [];
    }
  }

  /**
   * 解析 provider 默认配置 —— DB ai_providers 唯一真源。
   *
   * 2026-05-11 P2: 删除 PROVIDER_DEFAULTS 硬编码 fallback。DB 找不到该 slug
   * 时返回 null，调用方负责出友好报错（"请在 /admin/ai-providers 维护该 provider"
   * 或者 "请显式填写 apiEndpoint"）。
   *
   * 用于 testKey / saveKey / connection-test 时拿 endpoint / apiFormat / testModel
   * 兜底（AIModel.apiEndpoint 优先）。
   */
  async resolveProviderDefaults(
    slug: string,
    userId?: string,
  ): Promise<{
    endpoint: string;
    apiFormat: string;
    testModel: string;
  } | null> {
    try {
      const dbProvider = await this.prisma.aIProvider.findFirst({
        where: {
          slug,
          isEnabled: true,
          OR: [
            { scope: "system" },
            ...(userId ? [{ scope: "user", ownerUserId: userId }] : []),
          ],
        },
      });
      if (dbProvider) {
        return {
          endpoint: dbProvider.endpoint,
          apiFormat: dbProvider.apiFormat,
          testModel: dbProvider.testModel,
        };
      }
    } catch (err) {
      this.logger.warn(
        `[resolveProviderDefaults] DB query failed for "${slug}": ${(err as Error).message}`,
      );
    }
    return null;
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
      voyage: "Voyage AI",
    };
    return names[provider] || provider;
  }
}
