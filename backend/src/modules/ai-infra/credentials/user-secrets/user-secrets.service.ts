import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { SecretCategory, UserApiKeyMode } from "@prisma/client";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { EncryptionService } from "../../encryption/encryption.service";
import { UserApiKeysService } from "../user-api-keys/user-api-keys.service";
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
 *  1. 写回按 category 分流：category=AI_MODEL → user_api_keys（复用 v1.0 KeyResolver/捐赠池/多key）；
 *     其余 category → secrets 表（userId 非空 + per-user HKDF 加密）。
 *  2. UNION 读排除捐赠 key：secrets 侧 category != USER_DONATED；user_api_keys 侧 mode != DONATED。
 *  3. 不给 user_api_keys 加 category 列：LLM 行在本层映射 category=AI_MODEL。
 *
 * 安全：用户私有 secrets 用 EncryptionService.encryptForUser（per-user HKDF 子密钥，D7）。
 * 所有读写强制 userId 过滤（owner 隔离，防 IDOR / 越权，D19 + 安全关键-2）。
 */
@Injectable()
export class UserSecretsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly userApiKeys: UserApiKeysService,
  ) {}

  /** 统一列出用户所有私有 Key（LLM + 工具 + 其他类），归一成一个表的行。 */
  async list(userId: string): Promise<UserSecretListItem[]> {
    const [llmKeys, secretRows] = await Promise.all([
      // 铁律 2：排除捐赠（mode != DONATED）
      this.prisma.userApiKey.findMany({
        where: { userId, mode: { not: UserApiKeyMode.DONATED } },
        orderBy: [{ provider: "asc" }, { label: "asc" }],
      }),
      // 铁律 2：排除捐赠 category
      this.prisma.secret.findMany({
        where: {
          userId,
          deletedAt: null,
          category: { not: SecretCategory.USER_DONATED },
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

    const secretItems: UserSecretListItem[] = secretRows.map((s) => ({
      source: "secret",
      id: s.id,
      name: s.name,
      displayName: s.displayName,
      category: s.category,
      provider: s.provider,
      maskedValue: this.maskUserSecret(s.encryptedValue, s.iv, userId),
      isActive: s.isActive,
      usageCount: s.accessCount,
      testStatus: null,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));

    return [...llmItems, ...secretItems];
  }

  /** 创建用户私有 Secret，按 category 分流到对应表（铁律 1）。 */
  async create(
    userId: string,
    dto: CreateUserSecretDto,
  ): Promise<UserSecretListItem> {
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
        dto.value,
        ApiKeyMode.PERSONAL,
      );
      // saveKey 返回 { success, mode }，不含 id；回读刚写入的行拿 id
      const saved = await this.prisma.userApiKey.findFirst({
        where: { userId, provider: provider.toLowerCase(), label: "default" },
        orderBy: { updatedAt: "desc" },
      });
      return {
        source: "llm",
        id: saved?.id ?? "",
        name: provider,
        displayName: dto.displayName || `${provider} API Key`,
        category: SecretCategory.AI_MODEL,
        provider,
        maskedValue: saved?.keyHint || this.encryption.createKeyHint(dto.value),
        isActive: saved?.isActive ?? true,
        usageCount: saved?.usageCount ?? 0,
        testStatus: saved?.testStatus ?? null,
        createdAt: saved?.createdAt ?? new Date(),
        updatedAt: saved?.updatedAt ?? new Date(),
      };
    }

    // 非 AI_MODEL → secrets 表（userId 非空）
    const name = dto.name.trim();
    const existing = await this.prisma.secret.findFirst({
      where: { name, userId },
      select: { id: true, deletedAt: true },
    });
    if (existing && !existing.deletedAt) {
      throw new ConflictException(`你已配置过同名 Key「${name}」`);
    }

    const { encryptedValue, iv } = this.encryption.encryptForUser(
      dto.value,
      userId,
    );

    // 软删除过的同名行：复活并覆盖；否则新建
    const row = existing
      ? await this.prisma.secret.update({
          where: { id: existing.id },
          data: {
            displayName: dto.displayName || name,
            category: dto.category,
            provider: dto.provider ?? null,
            description: dto.description ?? null,
            encryptedValue,
            iv,
            isActive: dto.isActive ?? true,
            deletedAt: null,
            deletedBy: null,
          },
        })
      : await this.prisma.secret.create({
          data: {
            name,
            userId,
            displayName: dto.displayName || name,
            category: dto.category,
            provider: dto.provider ?? null,
            description: dto.description ?? null,
            encryptedValue,
            iv,
            isActive: dto.isActive ?? true,
            createdBy: userId,
          },
        });

    return {
      source: "secret",
      id: row.id,
      name: row.name,
      displayName: row.displayName,
      category: row.category,
      provider: row.provider,
      maskedValue: this.encryption.createKeyHint(dto.value),
      isActive: row.isActive,
      usageCount: row.accessCount,
      testStatus: null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
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
          key.mode === UserApiKeyMode.DONATED
            ? ApiKeyMode.DONATED
            : ApiKeyMode.PERSONAL,
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

    const secret = await this.prisma.secret.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!secret) throw new NotFoundException("Key 不存在或无权限");

    const data: Record<string, unknown> = {};
    if (dto.value) {
      const { encryptedValue, iv } = this.encryption.encryptForUser(
        dto.value,
        userId,
      );
      data.encryptedValue = encryptedValue;
      data.iv = iv;
    }
    if (dto.displayName !== undefined) data.displayName = dto.displayName;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    await this.prisma.secret.update({ where: { id: secret.id }, data });
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

    const secret = await this.prisma.secret.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!secret) throw new NotFoundException("Key 不存在或无权限");
    // 软删除（D10：保留审计期）
    await this.prisma.secret.update({
      where: { id: secret.id },
      data: { deletedAt: new Date(), deletedBy: userId, isActive: false },
    });
    return { success: true };
  }

  /**
   * 运行时取用户私有工具 Key 明文（仅 secrets 表，不含 LLM）。
   * 供 ToolKeyResolverService 调用做「用户 Key 优先」。强制 userId（缺失即抛错，D6）。
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
    const secret = await this.prisma.secret.findFirst({
      where: { name, userId, isActive: true, deletedAt: null },
    });
    if (!secret) return null;
    if (secret.expiresAt && secret.expiresAt < new Date()) return null;
    return this.encryption.decryptForUser(
      secret.encryptedValue,
      secret.iv,
      userId,
    );
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
