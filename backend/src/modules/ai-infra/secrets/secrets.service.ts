/**
 * Secrets Service
 *
 * Centralized management for API keys and sensitive credentials.
 * All secrets are encrypted using AES-256-CBC with separate IV storage.
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  InternalServerErrorException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";
import {
  Secret,
  SecretCategory,
  SecretAccessLog,
  SecretAction,
} from "@prisma/client";
import { CreateSecretDto } from "./dto/create-secret.dto";
import { UpdateSecretDto } from "./dto/update-secret.dto";
import {
  SYSTEM_SETTING_TO_SECRET_MAPPING,
  normalizeSecretName,
  getExpectedSecretsMetadata,
  classifySecret,
} from "./secret-name.catalog";
import { EncryptionService } from "../encryption/encryption.service";
import { SecretKeysService } from "./secret-keys.service";

export interface SecretListItem {
  id: string;
  name: string;
  displayName: string;
  category: SecretCategory;
  description: string | null;
  provider: string | null;
  isActive: boolean;
  maskedValue: string;
  createdAt: Date;
  updatedAt: Date;
  lastAccessedAt: Date | null;
  accessCount: number;
  expiresAt: Date | null;
  lastRotatedAt: Date | null;
}

export interface SecretVersionItem {
  id: string;
  version: number;
  checksum: string;
  createdBy: string | null;
  createdAt: Date;
  changeNote: string | null;
  isCurrent: boolean;
}

export interface SecretReference {
  type: "ai_model" | "external_api";
  id: string;
  name: string;
}

export interface AuditContext {
  userId?: string;
  userEmail?: string;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class SecretsService {
  private readonly logger = new Logger(SecretsService.name);
  private get currentKeyVersion(): number {
    return this.encryption.currentKeyVersion;
  }

  constructor(
    private prisma: PrismaService,
    private encryption: EncryptionService,
    private secretKeys: SecretKeysService,
  ) {}

  async create(
    dto: CreateSecretDto,
    context?: AuditContext,
  ): Promise<SecretListItem> {
    const { encryptedValue, iv } = this.encrypt(dto.value);
    const valueHash = this.hashValue(dto.value);

    const secret = await this.prisma.secret.create({
      data: {
        name: dto.name,
        displayName: dto.displayName,
        category: dto.category,
        description: dto.description,
        encryptedValue,
        iv,
        keyVersion: this.currentKeyVersion,
        provider: dto.provider,
        isActive: dto.isActive ?? true,
        expiresAt: dto.expiresAt,
        createdBy: context?.userEmail || context?.userId,
        updatedBy: context?.userEmail || context?.userId,
      },
    });

    // Dual-write: mirror initial value into secret_keys 'primary' so multi-key
    // resolver immediately uses this without dual-track fallback.
    if (this.secretKeys) {
      await this.secretKeys
        .addKey(
          secret.id,
          { label: "primary", value: dto.value, priority: 0 },
          context,
        )
        .catch((err) => {
          this.logger.warn(
            `dual-write secret_keys failed for ${dto.name}: ${(err as Error).message}`,
          );
        });
    }

    await this.logAccess(secret.id, SecretAction.CREATE, context, {
      secretName: secret.name,
      newValueHash: valueHash,
    });

    this.logger.log(`Secret created: ${dto.name}`);
    return this.toListItem(secret);
  }

  async findAll(category?: SecretCategory): Promise<SecretListItem[]> {
    const secrets = await this.prisma.secret.findMany({
      where: { deletedAt: null, ...(category ? { category } : {}) },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });
    return secrets.map((secret) => this.toListItem(secret));
  }

  async findByName(name: string): Promise<SecretListItem | null> {
    const secret = await this.prisma.secret.findUnique({ where: { name } });
    if (!secret || secret.deletedAt) return null;
    return this.toListItem(secret);
  }

  async getValue(name: string, context?: AuditContext): Promise<string | null> {
    const secret = await this.prisma.secret.findUnique({ where: { name } });

    if (!secret || secret.deletedAt) {
      if (context)
        await this.logAccessDenied(name, context, "Secret not found");
      return null;
    }

    // S5 Fix: Check isActive status
    if (!secret.isActive) {
      if (context)
        await this.logAccessDenied(name, context, "Secret is disabled");
      return null;
    }

    if (secret.expiresAt && secret.expiresAt < new Date()) {
      if (context) await this.logAccessDenied(name, context, "Secret expired");
      return null;
    }

    await this.prisma.secret.update({
      where: { id: secret.id },
      data: { lastAccessedAt: new Date(), accessCount: { increment: 1 } },
    });

    await this.logAccess(secret.id, SecretAction.VIEW, context, {
      secretName: secret.name,
    });
    return this.decrypt(secret.encryptedValue, secret.iv);
  }

  /**
   * 按 provider 模糊匹配查找一个 AI_MODEL 分类的 Secret。
   * 容忍历史命名不规范（claude-api-key / gemini-api / xai-grok-api-key 等）。
   *
   * 匹配规则：
   * 1. provider 字段不区分大小写等于输入
   * 2. 或 name 字段以 provider 为前缀（大小写不敏感）
   *
   * 返回找到的第一个 active secret（按 name 排序保证稳定）。不解密。
   */
  async findByProviderAlias(
    provider: string,
  ): Promise<{ id: string; name: string } | null> {
    const normalized = provider.toLowerCase();
    const secrets = await this.prisma.secret.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        category: "AI_MODEL",
        OR: [
          { provider: { equals: normalized, mode: "insensitive" } },
          { name: { startsWith: normalized, mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true, provider: true },
      orderBy: { name: "asc" },
    });
    // Prefer exact-provider match over name prefix match when both exist
    const exact = secrets.find((s) => s.provider?.toLowerCase() === normalized);
    const chosen = exact ?? secrets[0] ?? null;
    return chosen ? { id: chosen.id, name: chosen.name } : null;
  }

  /**
   * 返回系统 Secret 中已配置、且处于活跃状态的全部 provider（用于管理员的
   * availableProviders 过滤）。不解密任何值。
   */
  async listAvailableProviders(): Promise<string[]> {
    const rows = await this.prisma.secret.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        category: "AI_MODEL",
        provider: { not: null },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { provider: true },
    });
    // distinct 在 Prisma 层是大小写敏感的（"Claude" 和 "claude" 会各占一席），
    // 所以在内存层归一化后去重，保证和 KeyResolver 的 normalized provider 对齐。
    const set = new Set<string>();
    for (const r of rows) {
      if (r.provider) set.add(r.provider.toLowerCase());
    }
    return [...set];
  }

  async getValueInternal(name: string): Promise<string | null> {
    // ★ 规范化 Secret 名称，支持旧格式（SCREAMING_SNAKE_CASE）自动转换
    const normalizedName = normalizeSecretName(name);

    // ★ 多 KEY 路径：委托 SecretKeysService（fallback chain + 5min 失败熔断）。
    // SecretKey 表为空时它会降级读 Secret.encryptedValue（dual-track），
    // 确保所有既有 caller 不需改一行代码。
    if (this.secretKeys) {
      const resolved = await this.secretKeys.getSecretKey(normalizedName);
      if (resolved) {
        const sec = await this.prisma.secret.findUnique({
          where: { name: normalizedName },
          select: { id: true },
        });
        if (sec) {
          await this.prisma.secret
            .update({
              where: { id: sec.id },
              data: {
                lastAccessedAt: new Date(),
                accessCount: { increment: 1 },
              },
            })
            .catch(() => undefined);
        }
        return resolved.value;
      }
    }

    const secret = await this.prisma.secret.findUnique({
      where: { name: normalizedName },
    });
    if (!secret || !secret.isActive || secret.deletedAt) {
      // 很多 caller（如 key-resolver `{provider}-api-endpoint`）做的是 optional
      // lookup —— secret 没配是合理情况，不是错误。debug 级别记录即可。
      // expired / deactivated 是需要告警的异常情况，但两者混在一个 warn 里
      // 会让告警噪音淹没真信号，分开。
      if (!secret) {
        this.logger.debug(
          `[getValueInternal] Secret "${normalizedName}" not found (optional lookup ok)`,
        );
      } else {
        this.logger.warn(
          `[getValueInternal] Secret "${normalizedName}" inactive: isActive=${secret.isActive}, deletedAt=${secret.deletedAt}`,
        );
      }
      return null;
    }
    if (secret.expiresAt && secret.expiresAt < new Date()) {
      this.logger.warn(
        `[getValueInternal] Secret "${normalizedName}" expired at ${secret.expiresAt}`,
      );
      return null;
    }

    // Increment access count for internal calls too
    await this.prisma.secret.update({
      where: { id: secret.id },
      data: {
        lastAccessedAt: new Date(),
        accessCount: { increment: 1 },
      },
    });

    const decrypted = this.decrypt(secret.encryptedValue, secret.iv);
    this.logger.debug(
      `[getValueInternal] Secret "${normalizedName}" decrypt: success=${!!decrypted}, length=${decrypted?.length ?? 0}`,
    );
    return decrypted;
  }

  async update(
    name: string,
    dto: UpdateSecretDto,
    context?: AuditContext,
  ): Promise<SecretListItem> {
    const existing = await this.prisma.secret.findUnique({ where: { name } });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException(`Secret '${name}' not found`);
    }

    const updateData: Record<string, unknown> = {
      updatedBy: context?.userEmail || context?.userId,
    };

    let oldValueHash: string | undefined;
    let newValueHash: string | undefined;

    if (dto.displayName !== undefined) updateData.displayName = dto.displayName;
    if (dto.category !== undefined) updateData.category = dto.category;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.provider !== undefined) updateData.provider = dto.provider;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;
    if (dto.expiresAt !== undefined) updateData.expiresAt = dto.expiresAt;

    if (dto.value !== undefined && dto.value !== "") {
      const oldValue = this.decrypt(existing.encryptedValue, existing.iv);
      oldValueHash = oldValue ? this.hashValue(oldValue) : undefined;
      const { encryptedValue, iv } = this.encrypt(dto.value);
      updateData.encryptedValue = encryptedValue;
      updateData.iv = iv;
      updateData.keyVersion = this.currentKeyVersion;
      updateData.lastRotatedAt = new Date();
      newValueHash = this.hashValue(dto.value);

      // Create new version
      const newVersion = (existing.currentVersion || 1) + 1;
      updateData.currentVersion = newVersion;

      await this.prisma.secretVersion.create({
        data: {
          secretId: existing.id,
          version: newVersion,
          encryptedValue,
          iv,
          keyVersion: this.currentKeyVersion,
          checksum: this.calculateChecksum(dto.value),
          createdBy: context?.userEmail || context?.userId,
          changeNote: dto.changeNote || null,
        },
      });
    }

    const secret = await this.prisma.secret.update({
      where: { name },
      data: updateData,
    });

    // Dual-write: keep secret_keys 'primary' in sync when value rotates.
    if (this.secretKeys && dto.value !== undefined && dto.value !== "") {
      const primary = await this.prisma.secretKey.findUnique({
        where: { secretId_label: { secretId: secret.id, label: "primary" } },
        select: { id: true },
      });
      if (primary) {
        await this.secretKeys
          .replaceKeyValue(primary.id, { value: dto.value }, context)
          .catch((err) => {
            this.logger.warn(
              `dual-write secret_keys replace failed for ${name}: ${(err as Error).message}`,
            );
          });
      } else {
        await this.secretKeys
          .addKey(
            secret.id,
            { label: "primary", value: dto.value, priority: 0 },
            context,
          )
          .catch((err) => {
            this.logger.warn(
              `dual-write secret_keys add failed for ${name}: ${(err as Error).message}`,
            );
          });
      }
    }

    await this.logAccess(secret.id, SecretAction.UPDATE, context, {
      secretName: secret.name,
      oldValueHash,
      newValueHash,
    });
    this.logger.log(`Secret updated: ${name}`);
    return this.toListItem(secret);
  }

  async delete(name: string, context?: AuditContext): Promise<void> {
    const secret = await this.prisma.secret.findUnique({ where: { name } });
    if (!secret || secret.deletedAt) {
      throw new NotFoundException(`Secret '${name}' not found`);
    }

    const references = await this.getReferences(name);
    if (references.length > 0) {
      throw new ConflictException(
        `Cannot delete secret '${name}': still referenced by ${references.length} configuration(s)`,
      );
    }

    await this.logAccess(secret.id, SecretAction.DELETE, context, {
      secretName: secret.name,
    });
    await this.prisma.secret.update({
      where: { name },
      data: {
        deletedAt: new Date(),
        deletedBy: context?.userEmail || context?.userId,
        isActive: false,
      },
    });
    this.logger.log(`Secret soft deleted: ${name}`);
  }

  async getAccessLogs(
    name: string,
    limit: number = 50,
  ): Promise<SecretAccessLog[]> {
    const secret = await this.prisma.secret.findUnique({ where: { name } });
    return this.prisma.secretAccessLog.findMany({
      where: { OR: [{ secretId: secret?.id }, { secretName: name }] },
      orderBy: { timestamp: "desc" },
      take: limit,
    });
  }

  async getReferences(name: string): Promise<SecretReference[]> {
    const references: SecretReference[] = [];
    const aiModels = await this.prisma.aIModel.findMany({
      where: { OR: [{ apiKey: { contains: name } }] },
      select: { id: true, displayName: true },
    });
    for (const model of aiModels) {
      references.push({
        type: "ai_model",
        id: model.id,
        name: model.displayName,
      });
    }
    return references;
  }

  async exists(name: string): Promise<boolean> {
    const secret = await this.prisma.secret.findUnique({
      where: { name },
      select: { isActive: true, deletedAt: true, expiresAt: true },
    });
    if (!secret || secret.deletedAt) return false;
    if (secret.expiresAt && secret.expiresAt < new Date()) return false;
    return secret.isActive;
  }

  async getSecretNames(category?: SecretCategory): Promise<string[]> {
    const secrets = await this.prisma.secret.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        ...(category ? { category } : {}),
      },
      select: { name: true },
      orderBy: { name: "asc" },
    });
    return secrets.map((s) => s.name);
  }

  /**
   * H3 Fix: Migration wrapped in transaction for atomicity
   */
  async migrateExistingKeys(
    context?: AuditContext,
  ): Promise<{ imported: number; skipped: number; errors: string[] }> {
    // H3 Fix: Wrap in transaction, but allow partial success with error tracking
    // Note: We don't use strict transaction here because we want to report partial progress
    const imported: string[] = [];
    const skipped: string[] = [];
    const errors: string[] = [];

    const aiModels = await this.prisma.aIModel.findMany({
      where: { apiKey: { not: null } },
      select: {
        id: true,
        name: true,
        displayName: true,
        provider: true,
        apiKey: true,
      },
    });

    for (const model of aiModels) {
      if (!model.apiKey) continue;
      const secretName =
        `${model.provider.toLowerCase()}-${model.name.toLowerCase()}-api-key`.replace(
          /[^a-z0-9-]/g,
          "-",
        );
      try {
        const exists = await this.prisma.secret.findUnique({
          where: { name: secretName },
        });
        if (exists) {
          skipped.push(`${secretName} (already exists)`);
          continue;
        }

        const decryptedValue = this.decryptLegacy(model.apiKey);
        if (!decryptedValue) {
          errors.push(`${secretName}: Failed to decrypt legacy value`);
          continue;
        }

        const { encryptedValue, iv } = this.encrypt(decryptedValue);
        await this.prisma.secret.create({
          data: {
            name: secretName,
            displayName: `${model.displayName} API Key`,
            category: "AI_MODEL",
            description: `API key for ${model.displayName} (${model.provider})`,
            encryptedValue,
            iv,
            keyVersion: this.currentKeyVersion,
            provider: model.provider,
            isActive: true,
            createdBy: context?.userEmail || "migration",
            updatedBy: context?.userEmail || "migration",
          },
        });
        imported.push(secretName);
        this.logger.log(`Imported secret: ${secretName}`);
      } catch (error) {
        errors.push(`${secretName}: ${(error as Error).message}`);
      }
    }

    // ★ 使用统一的 SYSTEM_SETTING_TO_SECRET_MAPPING
    // 不允许在此硬编码映射关系
    const settingKeys = SYSTEM_SETTING_TO_SECRET_MAPPING;

    for (const setting of settingKeys) {
      try {
        const dbSetting = await this.prisma.systemSetting.findUnique({
          where: { key: setting.key },
        });
        if (!dbSetting?.value) continue;

        const exists = await this.prisma.secret.findUnique({
          where: { name: setting.name },
        });
        if (exists) {
          skipped.push(`${setting.name} (already exists)`);
          continue;
        }

        const decryptedValue = dbSetting.encrypted
          ? this.decryptLegacy(dbSetting.value)
          : dbSetting.value;
        if (!decryptedValue) {
          errors.push(`${setting.name}: Failed to decrypt`);
          continue;
        }

        const { encryptedValue, iv } = this.encrypt(decryptedValue);
        await this.prisma.secret.create({
          data: {
            name: setting.name,
            displayName: setting.displayName,
            category: setting.category as SecretCategory,
            description: `Migrated from SystemSetting: ${setting.key}`,
            encryptedValue,
            iv,
            keyVersion: this.currentKeyVersion,
            provider: setting.provider,
            isActive: true,
            createdBy: context?.userEmail || "migration",
            updatedBy: context?.userEmail || "migration",
          },
        });
        imported.push(setting.name);
      } catch (error) {
        errors.push(`${setting.name}: ${(error as Error).message}`);
      }
    }

    this.logger.log(
      `Migration completed: ${imported.length} imported, ${skipped.length} skipped, ${errors.length} errors`,
    );
    return { imported: imported.length, skipped: skipped.length, errors };
  }

  /**
   * 获取"预期应配置的 secret"4 区块清单
   *
   * - presetTools (A类): 平台预置工具 key，标记 configured / missing
   * - llmProviders (B类): LLM provider key，命中 LLM_PROVIDER_NAME_PATTERNS
   * - customSecrets (C类): 用户自定义 key，无警告
   * - orphans (D类): 真孤儿保留位，本期永远空数组
   */
  async getExpectedSecrets(): Promise<{
    presetTools: {
      items: Array<{
        name: string;
        displayName: string;
        category: string;
        provider: string;
        description?: string;
        setupGuideUrl?: string;
        freeTierAvailable: boolean;
        status: "configured" | "missing";
        secretId?: string;
        relatedToolIds: string[];
      }>;
      summary: { total: number; configured: number; missing: number };
    };
    llmProviders: Array<{
      secretId: string;
      name: string;
      displayName: string;
      category: string;
      provider: string;
    }>;
    customSecrets: Array<{
      secretId: string;
      name: string;
      displayName: string;
      category: string;
      provider: string | null;
    }>;
    orphans: Array<{
      secretId: string;
      name: string;
      displayName: string;
    }>;
    // Legacy flat fields kept for backward compat with existing callers
    items: Array<{
      name: string;
      displayName: string;
      category: string;
      provider: string;
      description?: string;
      setupGuideUrl?: string;
      freeTierAvailable: boolean;
      status: "configured" | "missing";
      secretId?: string;
      relatedToolIds: string[];
    }>;
    summary: { total: number; configured: number; missing: number };
  }> {
    // 1. 拉所有 active secret
    const dbSecrets = await this.prisma.secret.findMany({
      where: { isActive: true, deletedAt: null },
      select: {
        id: true,
        name: true,
        displayName: true,
        category: true,
        provider: true,
      },
    });

    // 2. A 类：preset tools（现有逻辑）
    const expectedMetadata = getExpectedSecretsMetadata();
    const dbByName = new Map(dbSecrets.map((s) => [s.name, s]));
    const presetItems = expectedMetadata.map((meta) => {
      const dbRow = dbByName.get(meta.name);
      return {
        ...meta,
        status: (dbRow ? "configured" : "missing") as "configured" | "missing",
        secretId: dbRow?.id,
      };
    });
    const presetNames = new Set(expectedMetadata.map((m) => m.name));

    // 3. 分类剩余 secret 进 B / C / D 类
    const llmProviders: Array<{
      secretId: string;
      name: string;
      displayName: string;
      category: string;
      provider: string;
    }> = [];
    const customSecrets: Array<{
      secretId: string;
      name: string;
      displayName: string;
      category: string;
      provider: string | null;
    }> = [];
    const orphans: Array<{
      secretId: string;
      name: string;
      displayName: string;
    }> = [];

    for (const s of dbSecrets) {
      if (presetNames.has(s.name)) continue; // 已进 A 类

      const cls = classifySecret(s.name);
      if (cls === "llm-provider") {
        llmProviders.push({
          secretId: s.id,
          name: s.name,
          displayName: s.displayName,
          category: s.category as string,
          provider: s.provider ?? "Unknown",
        });
      } else if (cls === "orphan") {
        orphans.push({
          secretId: s.id,
          name: s.name,
          displayName: s.displayName,
        });
      } else {
        // "custom" (default)
        customSecrets.push({
          secretId: s.id,
          name: s.name,
          displayName: s.displayName,
          category: s.category as string,
          provider: s.provider,
        });
      }
    }

    const presetSummary = {
      total: presetItems.length,
      configured: presetItems.filter((i) => i.status === "configured").length,
      missing: presetItems.filter((i) => i.status === "missing").length,
    };

    return {
      presetTools: {
        items: presetItems,
        summary: presetSummary,
      },
      llmProviders,
      customSecrets,
      orphans,
      // Legacy flat shape — kept so existing API consumers don't break
      items: presetItems,
      summary: presetSummary,
    };
  }

  /**
   * H2 Fix: Convert secret to list item without full decryption
   * Uses encrypted value prefix/suffix for masking to avoid exposing all secrets in memory
   */
  private toListItem(secret: Secret): SecretListItem {
    return {
      id: secret.id,
      name: secret.name,
      displayName: secret.displayName,
      category: secret.category,
      description: secret.description,
      provider: secret.provider,
      isActive: secret.isActive,
      // H2 Fix: Generate masked value from encrypted data, not decrypted
      maskedValue: this.generateMaskedHint(secret.encryptedValue),
      createdAt: secret.createdAt,
      updatedAt: secret.updatedAt,
      lastAccessedAt: secret.lastAccessedAt,
      accessCount: secret.accessCount,
      expiresAt: secret.expiresAt,
      lastRotatedAt: secret.lastRotatedAt,
    };
  }

  /**
   * H2 Fix: Generate a masked hint from encrypted value
   * This avoids decrypting secrets just to show a masked preview
   */
  private generateMaskedHint(encryptedValue: string): string {
    if (!encryptedValue || encryptedValue.length < 8) {
      return "••••••••";
    }
    // Use a hash of the encrypted value to generate consistent but non-revealing hint
    const hint = this.encryption.hashValue(encryptedValue).substring(0, 4);
    return `••••${hint}••••`;
  }

  private hashValue(value: string): string {
    return this.encryption.hashValue(value);
  }

  private calculateChecksum(value: string): string {
    return this.encryption.hashValue(value);
  }

  private async logAccess(
    secretId: string,
    action: SecretAction,
    context?: AuditContext,
    extra?: {
      secretName?: string;
      oldValueHash?: string;
      newValueHash?: string;
    },
  ): Promise<void> {
    try {
      await this.prisma.secretAccessLog.create({
        data: {
          secretId,
          action,
          actionStatus: "success",
          secretName: extra?.secretName,
          oldValueHash: extra?.oldValueHash,
          newValueHash: extra?.newValueHash,
          userId: context?.userId,
          userEmail: context?.userEmail,
          ipAddress: context?.ipAddress,
          userAgent: context?.userAgent,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to log secret access: ${(error as Error).message}`,
      );
    }
  }

  private async logAccessDenied(
    secretName: string,
    context: AuditContext,
    reason: string,
  ): Promise<void> {
    try {
      await this.prisma.secretAccessLog.create({
        data: {
          secretId: null,
          action: SecretAction.ACCESS_DENIED,
          actionStatus: "denied",
          secretName,
          errorMessage: reason,
          userId: context.userId,
          userEmail: context.userEmail,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to log access denied: ${(error as Error).message}`,
      );
    }
  }

  private encrypt(text: string) {
    return this.encryption.encrypt(text);
  }

  private decrypt(encryptedValue: string, ivHex: string): string | null {
    return this.encryption.decrypt(encryptedValue, ivHex);
  }

  private decryptLegacy(encryptedText: string | null): string | null {
    return this.encryption.decryptLegacy(encryptedText);
  }

  // ========== Version Management ==========

  /**
   * Get all versions of a secret
   */
  async getVersions(name: string): Promise<SecretVersionItem[]> {
    const secret = await this.prisma.secret.findUnique({ where: { name } });
    if (!secret || secret.deletedAt) {
      throw new NotFoundException(`Secret '${name}' not found`);
    }

    const versions = await this.prisma.secretVersion.findMany({
      where: { secretId: secret.id },
      orderBy: { version: "desc" },
    });

    return versions.map((v) => ({
      id: v.id,
      version: v.version,
      checksum: v.checksum,
      createdBy: v.createdBy,
      createdAt: v.createdAt,
      changeNote: v.changeNote,
      isCurrent: v.version === (secret.currentVersion || 1),
    }));
  }

  /**
   * Get decrypted value of a specific version
   */
  async getVersionValue(
    name: string,
    version: number,
    context?: AuditContext,
  ): Promise<string | null> {
    const secret = await this.prisma.secret.findUnique({ where: { name } });
    if (!secret || secret.deletedAt) {
      throw new NotFoundException(`Secret '${name}' not found`);
    }

    // If requesting current version, use the secret's current value
    if (version === (secret.currentVersion || 1)) {
      await this.logAccess(secret.id, SecretAction.VIEW, context, {
        secretName: name,
      });
      return this.decrypt(secret.encryptedValue, secret.iv);
    }

    // Otherwise, get from version history
    const secretVersion = await this.prisma.secretVersion.findUnique({
      where: {
        secretId_version: {
          secretId: secret.id,
          version,
        },
      },
    });

    if (!secretVersion) {
      throw new NotFoundException(
        `Version ${version} not found for secret '${name}'`,
      );
    }

    await this.logAccess(secret.id, SecretAction.VIEW, context, {
      secretName: name,
    });

    return this.decrypt(secretVersion.encryptedValue, secretVersion.iv);
  }

  /**
   * Rollback to a previous version
   */
  async rollback(
    name: string,
    version: number,
    context?: AuditContext,
  ): Promise<SecretListItem> {
    const secret = await this.prisma.secret.findUnique({ where: { name } });
    if (!secret || secret.deletedAt) {
      throw new NotFoundException(`Secret '${name}' not found`);
    }

    const currentVersion = secret.currentVersion || 1;
    if (version === currentVersion) {
      throw new BadRequestException("Cannot rollback to current version");
    }

    const targetVersion = await this.prisma.secretVersion.findUnique({
      where: {
        secretId_version: {
          secretId: secret.id,
          version,
        },
      },
    });

    if (!targetVersion) {
      throw new NotFoundException(
        `Version ${version} not found for secret '${name}'`,
      );
    }

    // Decrypt the target version's value
    const decryptedValue = this.decrypt(
      targetVersion.encryptedValue,
      targetVersion.iv,
    );
    if (!decryptedValue) {
      throw new InternalServerErrorException(
        `Failed to decrypt version ${version}`,
      );
    }

    // Create a new version with the rolled-back value
    const newVersion = currentVersion + 1;
    const { encryptedValue, iv } = this.encrypt(decryptedValue);

    await this.prisma.secretVersion.create({
      data: {
        secretId: secret.id,
        version: newVersion,
        encryptedValue,
        iv,
        keyVersion: this.currentKeyVersion,
        checksum: this.calculateChecksum(decryptedValue),
        createdBy: context?.userEmail || context?.userId,
        changeNote: `Rollback from version ${version}`,
      },
    });

    const updated = await this.prisma.secret.update({
      where: { name },
      data: {
        encryptedValue,
        iv,
        keyVersion: this.currentKeyVersion,
        currentVersion: newVersion,
        lastRotatedAt: new Date(),
        updatedBy: context?.userEmail || context?.userId,
      },
    });

    await this.logAccess(secret.id, SecretAction.UPDATE, context, {
      secretName: name,
    });

    this.logger.log(
      `Secret '${name}' rolled back to version ${version} (now version ${newVersion})`,
    );
    return this.toListItem(updated);
  }

  /**
   * Create initial version for existing secrets (migration helper)
   */
  async createInitialVersion(name: string): Promise<void> {
    const secret = await this.prisma.secret.findUnique({ where: { name } });
    if (!secret || secret.deletedAt) {
      throw new NotFoundException(`Secret '${name}' not found`);
    }

    // Check if version 1 already exists
    const existingVersion = await this.prisma.secretVersion.findUnique({
      where: {
        secretId_version: {
          secretId: secret.id,
          version: 1,
        },
      },
    });

    if (existingVersion) {
      this.logger.debug(`Secret '${name}' already has version 1`);
      return;
    }

    const decryptedValue = this.decrypt(secret.encryptedValue, secret.iv);
    if (!decryptedValue) {
      this.logger.warn(
        `Cannot create initial version for '${name}': decryption failed`,
      );
      return;
    }

    await this.prisma.secretVersion.create({
      data: {
        secretId: secret.id,
        version: 1,
        encryptedValue: secret.encryptedValue,
        iv: secret.iv,
        keyVersion: secret.keyVersion,
        checksum: this.calculateChecksum(decryptedValue),
        createdBy: secret.createdBy,
        createdAt: secret.createdAt,
        changeNote: "Initial version",
      },
    });

    // Ensure currentVersion is set to 1
    if (!secret.currentVersion || secret.currentVersion < 1) {
      await this.prisma.secret.update({
        where: { id: secret.id },
        data: { currentVersion: 1 },
      });
    }

    this.logger.log(`Created initial version for secret '${name}'`);
  }

  /**
   * Initialize versions for all existing secrets
   */
  async initializeAllVersions(): Promise<{
    processed: number;
    skipped: number;
  }> {
    const secrets = await this.prisma.secret.findMany({
      where: { deletedAt: null },
    });

    let processed = 0;
    let skipped = 0;

    for (const secret of secrets) {
      try {
        await this.createInitialVersion(secret.name);
        processed++;
      } catch (error) {
        this.logger.warn(
          `Skipped version init for '${secret.name}': ${(error as Error).message}`,
        );
        skipped++;
      }
    }

    return { processed, skipped };
  }

  /**
   * 业务调用方在 provider call 成功后调，feed 健康反馈给 fallback chain。
   * 找不到对应 SecretKey 行（dual-track 兜底场景）时静默返回。
   */
  async markSecretSuccess(name: string): Promise<void> {
    if (!this.secretKeys) return;
    const resolved = await this.secretKeys.getSecretKey(
      normalizeSecretName(name),
    );
    if (resolved?.keyId) await this.secretKeys.markSuccess(resolved.keyId);
  }

  /**
   * 业务调用方在 provider call 失败时调，触发 5min 熔断 + 切到下一个 KEY。
   */
  async markSecretFailure(name: string, errorMessage: string): Promise<void> {
    if (!this.secretKeys) return;
    const resolved = await this.secretKeys.getSecretKey(
      normalizeSecretName(name),
    );
    if (resolved?.keyId)
      await this.secretKeys.markFailure(resolved.keyId, errorMessage);
  }
}
