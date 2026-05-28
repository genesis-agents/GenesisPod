import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { SecretCategory } from "@prisma/client";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { EncryptionService } from "../../encryption/encryption.service";
import {
  CreateUserCredentialDto,
  UpdateUserCredentialDto,
  UserCredentialListItem,
} from "./dto/user-credential.dto";

/**
 * 2026-05-28 BYOK 加固 PR-3（Sep-A / H1）：用户私有「工具/其它类」Key 的统一 CRUD +
 * 运行时取值。与 admin 系统 secrets 结构性分离 —— 全部落 user_credentials，信封加密 v2。
 *
 * 安全铁律：
 *  - 所有读写强制 userId 过滤（owner 隔离，防 IDOR / 越权，D19）。
 *  - 全部走 encryptEnvelope / decryptEnvelope（per-row 随机 DEK，爆炸半径最小）。
 *  - AI_MODEL 类不收（应走 user_api_keys / UserApiKeysService）。
 */
export interface TestCredentialResult {
  success: boolean;
  message: string;
  testedAt: string;
}

@Injectable()
export class UserCredentialsService {
  private readonly logger = new Logger(UserCredentialsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  /** 列出用户所有工具/其它类私有 Key（不含明文）。 */
  async list(userId: string): Promise<UserCredentialListItem[]> {
    const rows = await this.prisma.userCredential.findMany({
      where: { userId, deletedAt: null },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      displayName: r.displayName,
      category: r.category,
      provider: r.provider,
      maskedValue: r.keyHint ?? "••••••••",
      isActive: r.isActive,
      usageCount: r.accessCount,
      testStatus: r.testStatus,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  /** 创建用户私有工具 Key（信封加密 v2）。AI_MODEL 类拒收。 */
  async create(
    userId: string,
    dto: CreateUserCredentialDto,
  ): Promise<UserCredentialListItem> {
    if (dto.category === SecretCategory.AI_MODEL) {
      throw new BadRequestException(
        "AI_MODEL 类 Key 请走 LLM API Key（user_api_keys），不在工具凭据范围",
      );
    }
    const name = dto.name.trim();
    const existing = await this.prisma.userCredential.findFirst({
      where: { userId, name },
      select: { id: true, deletedAt: true },
    });
    if (existing && !existing.deletedAt) {
      throw new ConflictException(`你已配置过同名 Key「${name}」`);
    }

    const env = await this.encryption.encryptEnvelope(dto.value);
    const keyHint = this.encryption.createKeyHint(dto.value);
    const data = {
      displayName: dto.displayName || name,
      category: dto.category,
      provider: dto.provider ?? null,
      description: dto.description ?? null,
      encryptedValue: env.encryptedValue,
      iv: env.iv,
      authTag: env.authTag,
      wrappedDek: env.wrappedDek,
      encVersion: env.encVersion,
      kekVersion: env.kekVersion,
      keyHint,
      isActive: dto.isActive ?? true,
    };

    // 软删除过的同名行：复活并覆盖；否则新建。
    const row = existing
      ? await this.prisma.userCredential.update({
          where: { id: existing.id },
          data: { ...data, deletedAt: null, deletedBy: null },
        })
      : await this.prisma.userCredential.create({
          data: { ...data, userId, name },
        });

    return this.toListItem(row);
  }

  /** 更新用户私有 Key（owner 强制校验）。 */
  async update(
    userId: string,
    id: string,
    dto: UpdateUserCredentialDto,
  ): Promise<{ success: true }> {
    const row = await this.prisma.userCredential.findFirst({
      where: { id, userId, deletedAt: null },
      select: { id: true },
    });
    if (!row) throw new NotFoundException("Key 不存在或无权限");

    const data: Record<string, unknown> = {};
    if (dto.value) {
      const env = await this.encryption.encryptEnvelope(dto.value);
      data.encryptedValue = env.encryptedValue;
      data.iv = env.iv;
      data.authTag = env.authTag;
      data.wrappedDek = env.wrappedDek;
      data.encVersion = env.encVersion;
      data.kekVersion = env.kekVersion;
      data.keyHint = this.encryption.createKeyHint(dto.value);
    }
    if (dto.displayName !== undefined) data.displayName = dto.displayName;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    await this.prisma.userCredential.update({ where: { id: row.id }, data });
    return { success: true };
  }

  /** 软删除用户私有 Key（owner 强制校验，防 IDOR）。 */
  async remove(userId: string, id: string): Promise<{ success: true }> {
    const row = await this.prisma.userCredential.findFirst({
      where: { id, userId, deletedAt: null },
      select: { id: true },
    });
    if (!row) throw new NotFoundException("Key 不存在或无权限");
    await this.prisma.userCredential.update({
      where: { id: row.id },
      data: { deletedAt: new Date(), deletedBy: userId, isActive: false },
    });
    return { success: true };
  }

  /**
   * Key 测试：存在性 + 启用校验（不调付费 API）。owner 强制校验，响应不回明文。
   */
  async testKey(userId: string, id: string): Promise<TestCredentialResult> {
    const testedAt = new Date().toISOString();
    const row = await this.prisma.userCredential.findFirst({
      where: { id, userId, deletedAt: null },
      select: { id: true, name: true, isActive: true },
    });
    if (!row) {
      return { success: false, message: "Key 未找到或无权限", testedAt };
    }
    if (!row.isActive) {
      return { success: false, message: "Key 已禁用", testedAt };
    }
    return { success: true, message: "Key 存在，格式校验通过", testedAt };
  }

  /**
   * 运行时取用户私有工具 Key 明文（供 ToolKeyResolver）。强制 userId（缺失即抛错，D6）。
   * 命中后异步累加 accessCount（fire-and-forget）。
   */
  async getCredentialValue(
    name: string,
    userId: string,
  ): Promise<string | null> {
    if (!userId) {
      throw new BadRequestException(
        "getCredentialValue: userId is required (BYOK isolation)",
      );
    }
    const row = await this.prisma.userCredential.findFirst({
      where: { name, userId, isActive: true, deletedAt: null },
    });
    if (!row) return null;
    if (row.expiresAt && row.expiresAt < new Date()) return null;

    const plain = await this.encryption.decryptEnvelope(row);
    if (plain === null) {
      this.logger.warn(
        `getCredentialValue: decrypt failed for credential ${row.id}`,
      );
      return null;
    }
    void this.prisma.userCredential
      .update({
        where: { id: row.id },
        data: { accessCount: { increment: 1 } },
      })
      .catch(() => undefined);
    return plain;
  }

  private toListItem(row: {
    id: string;
    name: string;
    displayName: string;
    category: SecretCategory;
    provider: string | null;
    keyHint: string | null;
    isActive: boolean;
    accessCount: number;
    testStatus: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): UserCredentialListItem {
    return {
      id: row.id,
      name: row.name,
      displayName: row.displayName,
      category: row.category,
      provider: row.provider,
      maskedValue: row.keyHint ?? "••••••••",
      isActive: row.isActive,
      usageCount: row.accessCount,
      testStatus: row.testStatus,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
