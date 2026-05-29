import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { SecretCategory } from "@prisma/client";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { EncryptionService } from "../../encryption/encryption.service";
import { UserApiKeysService } from "../user-api-keys/user-api-keys.service";
import { UserCredentialsService } from "../user-credentials/user-credentials.service";
import { SecretsService } from "../../secrets/secrets.service";
import { ApiKeyMode } from "../user-api-keys/dto";
import {
  CreateUserSecretDto,
  UpdateUserSecretDto,
  UserSecretListItem,
  UserSecretSource,
} from "./dto/user-secret.dto";

/**
 * 2026-05-27 BYOK 全量化：用户私有 Secret 的统一 CRUD。
 *
 * 方案：docs/architecture/ai-app/byok/byok-tool-coverage-extension-2026-05-27.md（v0.3 共识）
 *
 * 落地铁律（§18.1，投票产生，MUST）：
 *  1. 写回按 category 分流：category=AI_MODEL → user_api_keys（复用 v1.0 KeyResolver/多key）；
 *     其余 category → secrets 表（userId 非空 + per-user HKDF 加密）。
 *  2. 不给 user_api_keys 加 category 列：LLM 行在本层映射 category=AI_MODEL。
 *  （2026-05-29 W4b/W4c：捐赠池退役，USER_DONATED/DONATED 已移除，UNION 读无需再排除。）
 *
 * 安全：用户私有 secrets 用 EncryptionService.encryptForUser（per-user HKDF 子密钥，D7）。
 * 所有读写强制 userId 过滤（owner 隔离，防 IDOR / 越权，D19 + 安全关键-2）。
 */
export interface TestKeyResult {
  success: boolean;
  message: string;
  testedAt: string;
}

@Injectable()
export class UserSecretsService {
  private readonly logger = new Logger(UserSecretsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly userApiKeys: UserApiKeysService,
    private readonly userCredentials: UserCredentialsService,
    // ★ 2026-05-29 P4：非 AI_MODEL（工具）收敛到 user-scoped secrets/secret_keys，
    //   走 admin 同款多 Key（envelope v2，与 getSecretKey/drawer 解密一致）。
    private readonly secrets: SecretsService,
  ) {}

  /**
   * 统一列出用户所有私有 Key（LLM + 工具 + 其他类），归一成一个表的行。
   * 2026-05-28 PR-3：工具/其它类来源切到 user_credentials；过渡期仍读 legacy secrets
   * 用户行（按 name 去重，优先 user_credentials），待 PR-4 backfill 后下线 legacy 读。
   */
  async list(userId: string): Promise<UserSecretListItem[]> {
    const [llmKeys, credItems, legacySecretRows] = await Promise.all([
      // H6: 捐赠池退役后 user_api_keys 恒为 PERSONAL，无需再排除捐赠。
      this.prisma.userApiKey.findMany({
        where: { userId },
        orderBy: [{ provider: "asc" }, { label: "asc" }],
      }),
      this.userCredentials.list(userId),
      // 过渡期：legacy 用户工具行仍在 secrets（PR-4 backfill 后移除此读）。
      this.prisma.secret.findMany({
        where: {
          userId,
          deletedAt: null,
        },
        orderBy: [{ category: "asc" }, { name: "asc" }],
      }),
    ]);

    const llmItems: UserSecretListItem[] = llmKeys.map((k) => ({
      source: "llm",
      id: k.id,
      name: `${k.provider}${k.label && k.label !== "default" ? `:${k.label}` : ""}`,
      displayName: `${k.provider} API Key${k.label && k.label !== "default" ? ` (${k.label})` : ""}`,
      category: SecretCategory.AI_MODEL, // 铁律 3：本层映射，不下沉 schema
      provider: k.provider,
      maskedValue: k.keyHint || "••••••••",
      isActive: k.isActive,
      usageCount: k.usageCount,
      testStatus: k.testStatus,
      createdAt: k.createdAt,
      updatedAt: k.updatedAt,
    }));

    const credSecretItems: UserSecretListItem[] = credItems.map((c) => ({
      source: "secret",
      id: c.id,
      name: c.name,
      displayName: c.displayName,
      category: c.category,
      provider: c.provider,
      maskedValue: c.maskedValue,
      isActive: c.isActive,
      usageCount: c.usageCount,
      testStatus: c.testStatus,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));

    // 去重：legacy secrets 中 name 已存在于 user_credentials 的不再展示（优先新表）。
    const credNames = new Set(credItems.map((c) => c.name));
    const legacySecretItems: UserSecretListItem[] = legacySecretRows
      .filter((s) => !credNames.has(s.name))
      .map((s) => ({
        source: "secret",
        id: s.id,
        name: s.name,
        displayName: s.displayName,
        category: s.category,
        provider: s.provider,
        maskedValue:
          s.keyHint ?? this.maskUserSecret(s.encryptedValue, s.iv, userId),
        isActive: s.isActive,
        usageCount: s.accessCount,
        testStatus: null,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      }));

    return [...llmItems, ...credSecretItems, ...legacySecretItems];
  }

  /** 创建用户私有 Secret，按 category 分流到对应表（铁律 1）。 */
  async create(
    userId: string,
    dto: CreateUserSecretDto,
  ): Promise<UserSecretListItem> {
    // 解析明文值：直接传值 OR 从已有密钥复制（sourceSecretId，owner 强制校验）
    let resolvedValue = dto.value;
    if (!resolvedValue && dto.sourceSecretId) {
      const copied = await this.userCredentials.getCredentialValueById(
        dto.sourceSecretId,
        userId,
      );
      if (!copied) {
        throw new BadRequestException(
          "sourceSecretId 对应的密钥不存在或无权限",
        );
      }
      resolvedValue = copied;
    }
    if (!resolvedValue) {
      throw new BadRequestException("value 或 sourceSecretId 必须提供一个");
    }

    if (dto.category === SecretCategory.AI_MODEL) {
      const provider = dto.provider?.trim();
      if (!provider) {
        throw new BadRequestException(
          "AI_MODEL 类 Key 必须指定 provider（如 openai / anthropic）",
        );
      }
      await this.userApiKeys.saveKey(
        userId,
        provider,
        resolvedValue,
        ApiKeyMode.PERSONAL,
      );
      // saveKey 返回 { success, mode }，不含 id；用复合唯一键精确回读刚写入的行
      // （复审 Bug 2：findFirst+orderBy 在多 label 并发下可能拿错行，改 findUnique）
      const saved = await this.prisma.userApiKey.findUnique({
        where: {
          userId_provider_label: {
            userId,
            provider: provider.toLowerCase(),
            label: "default",
          },
        },
      });
      return {
        source: "llm",
        id: saved?.id ?? "",
        name: provider,
        displayName: dto.displayName || `${provider} API Key`,
        category: SecretCategory.AI_MODEL,
        provider,
        maskedValue:
          saved?.keyHint || this.encryption.createKeyHint(resolvedValue),
        isActive: saved?.isActive ?? true,
        usageCount: saved?.usageCount ?? 0,
        testStatus: saved?.testStatus ?? null,
        createdAt: saved?.createdAt ?? new Date(),
        updatedAt: saved?.updatedAt ?? new Date(),
      };
    }

    // ★ 2026-05-29 P4：非 AI_MODEL（工具/其它）收敛到 user-scoped secrets/secret_keys
    //   （envelope v2 + 自动建 primary secret_key），从此可走 admin 同款多 Key 抽屉
    //   （/user/secrets/:id/keys）+ getSecretKey failover。取代旧 user_credentials 路径
    //   （user_credentials=0，零迁移）。
    const created = await this.secrets.create(
      {
        name: dto.name,
        displayName: dto.displayName ?? dto.name,
        category: dto.category,
        provider: dto.provider,
        value: resolvedValue,
        description: dto.description,
        isActive: dto.isActive,
      },
      { userId },
      userId,
    );
    return {
      source: "secret",
      id: created.id,
      name: created.name,
      displayName: created.displayName,
      category: created.category,
      provider: created.provider,
      maskedValue: created.maskedValue,
      isActive: created.isActive,
      usageCount: created.accessCount,
      testStatus: null,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };
  }

  /** 更新用户私有 Secret（owner 强制校验）。 */
  async update(
    userId: string,
    source: UserSecretSource,
    id: string,
    dto: UpdateUserSecretDto,
  ): Promise<{ success: true }> {
    if (source === "llm") {
      const key = await this.prisma.userApiKey.findFirst({
        where: { id, userId },
      });
      if (!key) throw new NotFoundException("Key 不存在或无权限");
      if (dto.value) {
        // 复用 saveKey 走完整加密 + 健康状态重置
        await this.userApiKeys.saveKey(
          userId,
          key.provider,
          dto.value,
          ApiKeyMode.PERSONAL,
          key.preferredModelId ?? undefined,
          key.apiEndpoint ?? undefined,
          key.label,
        );
      }
      if (dto.isActive !== undefined) {
        await this.prisma.userApiKey.update({
          where: { id },
          data: { isActive: dto.isActive },
        });
      }
      return { success: true };
    }

    // 过渡兼容：仍命中 legacy user_credentials 行则走旧表（user_credentials=0，基本不触发）。
    if (await this.isUserCredential(id, userId)) {
      return this.userCredentials.update(userId, id, dto);
    }

    // ★ 2026-05-29 P4：工具/其它类已收敛到 user-scoped secrets → 走 SecretsService.update
    //   （值变更走 envelope v2 双写到 primary secret_key，与多 Key 抽屉/runtime 一致）。
    const owned = await this.secrets.getByIdForUser(id, userId);
    if (!owned) throw new NotFoundException("Key 不存在或无权限");
    await this.secrets.update(
      owned.name,
      {
        displayName: dto.displayName,
        description: dto.description,
        isActive: dto.isActive,
        value: dto.value,
      },
      { userId },
      userId,
    );
    return { success: true };
  }

  /** 删除用户私有 Secret（owner 强制校验，防 IDOR）。 */
  async remove(
    userId: string,
    source: UserSecretSource,
    id: string,
  ): Promise<{ success: true }> {
    if (source === "llm") {
      const key = await this.prisma.userApiKey.findFirst({
        where: { id, userId },
      });
      if (!key) throw new NotFoundException("Key 不存在或无权限");
      await this.userApiKeys.deleteKey(userId, key.provider, key.label);
      return { success: true };
    }

    // 过渡兼容：仍命中 legacy user_credentials 行则走旧表（user_credentials=0，基本不触发）。
    if (await this.isUserCredential(id, userId)) {
      return this.userCredentials.remove(userId, id);
    }

    // ★ 2026-05-29 P4：收敛到 user-scoped secrets → SecretsService.delete（软删 + 级联禁用子 key）。
    const owned = await this.secrets.getByIdForUser(id, userId);
    if (!owned) throw new NotFoundException("Key 不存在或无权限");
    await this.secrets.delete(owned.name, { userId }, userId);
    return { success: true };
  }

  /**
   * C8 Key 测试：存在性 + 基本格式校验（不调付费 API，仅验证 Key 存在）。
   * owner 强制校验（防 IDOR），响应不回传明文。
   */
  async testKey(
    userId: string,
    source: UserSecretSource,
    id: string,
  ): Promise<TestKeyResult> {
    const testedAt = new Date().toISOString();

    if (source === "llm") {
      const key = await this.prisma.userApiKey.findFirst({
        where: { id, userId },
        select: { id: true, provider: true, keyHint: true },
      });
      if (!key) {
        this.logger.log(
          `testKey: user=${userId} source=llm id=${id} result=not_found`,
        );
        return { success: false, message: "Key 未找到或无权限", testedAt };
      }
      this.logger.log(
        `testKey: user=${userId} source=llm id=${id} provider=${key.provider} result=ok`,
      );
      return { success: true, message: "Key 存在，格式校验通过", testedAt };
    }

    // PR-3：id 命中 user_credentials 则走新表测试，否则回退 legacy secrets。
    if (await this.isUserCredential(id, userId)) {
      return this.userCredentials.testKey(userId, id);
    }

    const secret = await this.prisma.secret.findFirst({
      where: { id, userId, deletedAt: null },
      select: { id: true, name: true, isActive: true },
    });
    if (!secret) {
      this.logger.log(
        `testKey: user=${userId} source=secret id=${id} result=not_found`,
      );
      return { success: false, message: "Key 未找到或无权限", testedAt };
    }
    if (!secret.isActive) {
      this.logger.log(
        `testKey: user=${userId} source=secret id=${id} result=inactive`,
      );
      return { success: false, message: "Key 已禁用", testedAt };
    }
    this.logger.log(
      `testKey: user=${userId} source=secret id=${id} name=${secret.name} result=ok`,
    );
    return { success: true, message: "Key 存在，格式校验通过", testedAt };
  }

  /**
   * 运行时取用户私有工具 Key 明文（不含 LLM）。供 ToolKeyResolverService 做「用户 Key 优先」。
   * 强制 userId（缺失即抛错，D6）。
   * 2026-05-28 PR-3：优先读 user_credentials（信封 v2）；过渡期回退 legacy secrets。
   */
  async getUserSecretValue(
    name: string,
    userId: string,
  ): Promise<string | null> {
    if (!userId) {
      throw new BadRequestException(
        "getUserSecretValue: userId is required (BYOK isolation)",
      );
    }
    const fromCred = await this.userCredentials.getCredentialValue(
      name,
      userId,
    );
    if (fromCred !== null) return fromCred;

    // 回退读 user-scoped secrets 行。★ 2026-05-29 评审修复：用 decryptAny（按 encVersion 分派），
    //   既能解 P4 新建的 envelope v2 行，也能解 legacy per-user HKDF 行；不能再写死 decryptForUser
    //   （否则 envelope v2 行被 HKDF 路径误解、静默返回垃圾/null）。
    const secret = await this.prisma.secret.findFirst({
      where: { name, userId, isActive: true, deletedAt: null },
    });
    if (!secret) return null;
    if (secret.expiresAt && secret.expiresAt < new Date()) return null;
    return this.encryption.decryptAny(secret, { userId });
  }

  /** id 是否为当前用户的一条 user_credentials 行（用于 secret-source 路由分派）。 */
  private async isUserCredential(id: string, userId: string): Promise<boolean> {
    const row = await this.prisma.userCredential.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    return row !== null;
  }

  private maskUserSecret(
    encryptedValue: string,
    iv: string,
    userId: string,
  ): string {
    const plain = this.encryption.decryptForUser(encryptedValue, iv, userId);
    return plain ? this.encryption.createKeyHint(plain) : "••••••••";
  }
}
