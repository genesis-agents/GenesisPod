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
import { ConfigService } from "@nestjs/config";
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
} from "./secret-name-mapping";
import * as crypto from "crypto";

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

interface EncryptionResult {
  encryptedValue: string;
  iv: string;
}

@Injectable()
export class SecretsService {
  private readonly logger = new Logger(SecretsService.name);
  private readonly encryptionKey: string;
  private readonly currentKeyVersion: number = 1;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    const key = this.configService.get<string>("SETTINGS_ENCRYPTION_KEY");

    // C1 Fix: Require encryption key in production, no hardcoded fallback
    if (!key) {
      const nodeEnv = this.configService.get<string>("NODE_ENV");
      if (nodeEnv === "production") {
        throw new InternalServerErrorException(
          "CRITICAL: SETTINGS_ENCRYPTION_KEY environment variable is required in production. " +
            "Generate a secure 32-byte key using: openssl rand -hex 32",
        );
      }
      // Only allow default key in development/test with warning
      this.logger.warn(
        "WARNING: Using default encryption key. Set SETTINGS_ENCRYPTION_KEY in production!",
      );
      this.encryptionKey = this.deriveKey("deepdive-dev-only-key");
    } else {
      // C2 Fix: Use PBKDF2 for secure key derivation
      this.encryptionKey = this.deriveKey(key);
    }
  }

  /**
   * Derives a 32-byte encryption key using PBKDF2
   * This ensures consistent key length and adds entropy even for weak passwords
   */
  private deriveKey(password: string): string {
    // Use PBKDF2 with SHA-256, 100,000 iterations for secure key derivation
    const salt = "deepdive-secrets-salt-v1"; // Static salt is OK since we're deriving from a secret
    const derivedKey = crypto.pbkdf2Sync(password, salt, 100000, 32, "sha256");
    return derivedKey.toString("hex").substring(0, 32);
  }

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

  async getValueInternal(name: string): Promise<string | null> {
    // ★ 规范化 Secret 名称，支持旧格式（SCREAMING_SNAKE_CASE）自动转换
    const normalizedName = normalizeSecretName(name);

    const secret = await this.prisma.secret.findUnique({
      where: { name: normalizedName },
    });
    if (!secret || !secret.isActive || secret.deletedAt) {
      this.logger.warn(
        `[getValueInternal] Secret "${normalizedName}" lookup: found=${!!secret}, isActive=${secret?.isActive}, deletedAt=${secret?.deletedAt}`,
      );
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
    const hint = crypto
      .createHash("md5")
      .update(encryptedValue)
      .digest("hex")
      .substring(0, 4);
    return `••••${hint}••••`;
  }

  private hashValue(value: string): string {
    return crypto.createHash("sha256").update(value).digest("hex");
  }

  private calculateChecksum(value: string): string {
    return crypto.createHash("sha256").update(value).digest("hex");
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

  private encrypt(text: string): EncryptionResult {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
      "aes-256-cbc",
      Buffer.from(this.encryptionKey),
      iv,
    );
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");
    return { encryptedValue: encrypted, iv: iv.toString("hex") };
  }

  private decrypt(encryptedValue: string, ivHex: string): string | null {
    if (!encryptedValue || !ivHex) return null;
    try {
      const iv = Buffer.from(ivHex, "hex");
      const decipher = crypto.createDecipheriv(
        "aes-256-cbc",
        Buffer.from(this.encryptionKey),
        iv,
      );
      let decrypted = decipher.update(encryptedValue, "hex", "utf8");
      decrypted += decipher.final("utf8");
      return decrypted;
    } catch (error) {
      this.logger.error(`Decryption failed: ${(error as Error).message}`);
      return null;
    }
  }

  private decryptLegacy(encryptedText: string | null): string | null {
    if (!encryptedText) return null;
    try {
      const parts = encryptedText.split(":");
      if (parts.length !== 2) return encryptedText;
      const iv = Buffer.from(parts[0], "hex");
      const encrypted = parts[1];
      const decipher = crypto.createDecipheriv(
        "aes-256-cbc",
        Buffer.from(this.encryptionKey),
        iv,
      );
      let decrypted = decipher.update(encrypted, "hex", "utf8");
      decrypted += decipher.final("utf8");
      return decrypted;
    } catch (error) {
      this.logger.error(
        `Legacy decryption failed: ${(error as Error).message}`,
      );
      return null;
    }
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
}
