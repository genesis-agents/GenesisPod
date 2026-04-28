import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { DistributableKey, Prisma } from "@prisma/client";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { EncryptionService } from "../../../ai-infra/encryption/encryption.service";

/** Valid provider name pattern (复用 UserApiKeysService 的约束) */
const PROVIDER_NAME_PATTERN = /^[a-z0-9-]+$/;

export interface DistributableKeyView {
  id: string;
  provider: string;
  label: string;
  keyHint: string | null;
  apiEndpoint: string | null;
  monthlyQuotaCents: number | null;
  currentSpendCents: number;
  quotaResetAt: Date;
  isActive: boolean;
  expiresAt: Date | null;
  activeAssignmentCount: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
}

export interface CreateDistributableKeyInput {
  provider: string;
  label: string;
  apiKey: string;
  apiEndpoint?: string;
  monthlyQuotaCents?: number;
  expiresAt?: Date;
  createdBy?: string;
}

export interface UpdateDistributableKeyInput {
  label?: string;
  apiKey?: string;
  apiEndpoint?: string | null;
  monthlyQuotaCents?: number | null;
  expiresAt?: Date | null;
  isActive?: boolean;
  updatedBy?: string;
}

@Injectable()
export class DistributableKeysService {
  private readonly logger = new Logger(DistributableKeysService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  private validateProvider(provider: string): string {
    const normalized = provider.toLowerCase();
    if (!PROVIDER_NAME_PATTERN.test(normalized) || normalized.length > 50) {
      throw new BadRequestException("Invalid provider name");
    }
    return normalized;
  }

  async create(input: CreateDistributableKeyInput): Promise<DistributableKey> {
    const provider = this.validateProvider(input.provider);
    const trimmedKey = input.apiKey.trim();
    if (!trimmedKey) throw new BadRequestException("API key is required");
    if (!input.label?.trim())
      throw new BadRequestException("Label is required");

    const { encryptedValue, iv } = this.encryption.encrypt(trimmedKey);
    const keyHint = this.encryption.createKeyHint(trimmedKey);

    return this.prisma.distributableKey.create({
      data: {
        provider,
        label: input.label.trim(),
        encryptedValue,
        iv,
        keyHint,
        apiEndpoint: input.apiEndpoint?.trim() || null,
        monthlyQuotaCents: input.monthlyQuotaCents ?? null,
        expiresAt: input.expiresAt ?? null,
        createdBy: input.createdBy,
        updatedBy: input.createdBy,
      },
    });
  }

  async update(
    id: string,
    input: UpdateDistributableKeyInput,
  ): Promise<DistributableKey> {
    const existing = await this.prisma.distributableKey.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException("Distributable key not found");

    const data: Prisma.DistributableKeyUpdateInput = {
      updatedBy: input.updatedBy,
    };
    if (input.label !== undefined) data.label = input.label.trim();
    if (input.apiKey !== undefined) {
      const trimmedKey = input.apiKey.trim();
      if (!trimmedKey) throw new BadRequestException("API key cannot be empty");
      const { encryptedValue, iv } = this.encryption.encrypt(trimmedKey);
      data.encryptedValue = encryptedValue;
      data.iv = iv;
      data.keyHint = this.encryption.createKeyHint(trimmedKey);
      data.keyVersion = { increment: 1 };
    }
    if (input.apiEndpoint !== undefined) {
      data.apiEndpoint = input.apiEndpoint?.trim() || null;
    }
    if (input.monthlyQuotaCents !== undefined) {
      data.monthlyQuotaCents = input.monthlyQuotaCents;
    }
    if (input.expiresAt !== undefined) data.expiresAt = input.expiresAt;
    if (input.isActive !== undefined) data.isActive = input.isActive;

    return this.prisma.distributableKey.update({ where: { id }, data });
  }

  async deactivate(id: string, by?: string): Promise<void> {
    await this.update(id, { isActive: false, updatedBy: by });
  }

  async list(filters?: {
    provider?: string;
    isActive?: boolean;
  }): Promise<DistributableKeyView[]> {
    const where: Prisma.DistributableKeyWhereInput = {};
    if (filters?.provider) where.provider = filters.provider.toLowerCase();
    if (filters?.isActive !== undefined) where.isActive = filters.isActive;

    const keys = await this.prisma.distributableKey.findMany({
      where,
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      include: {
        _count: { select: { assignments: { where: { status: "ACTIVE" } } } },
      },
    });
    return keys.map((k) => this.toView(k));
  }

  async getView(id: string): Promise<DistributableKeyView> {
    const key = await this.prisma.distributableKey.findUnique({
      where: { id },
      include: {
        _count: { select: { assignments: { where: { status: "ACTIVE" } } } },
      },
    });
    if (!key) throw new NotFoundException("Distributable key not found");
    return this.toView(key);
  }

  /**
   * 返回可分发 Key 的解密值。仅供 KeyAssignmentsService/KeyResolverService 在已校验用户有 ACTIVE Assignment 时调用。
   */
  async getDecryptedValue(
    keyId: string,
  ): Promise<{ apiKey: string; apiEndpoint: string | null } | null> {
    const key = await this.prisma.distributableKey.findUnique({
      where: { id: keyId },
    });
    if (!key) return null;
    if (!key.isActive) return null;
    if (key.expiresAt && key.expiresAt < new Date()) return null;

    const apiKey = this.encryption.decrypt(key.encryptedValue, key.iv);
    if (!apiKey) {
      this.logger.error(
        `Failed to decrypt DistributableKey ${keyId} (provider=${key.provider})`,
      );
      return null;
    }
    return { apiKey: apiKey.trim(), apiEndpoint: key.apiEndpoint };
  }

  /**
   * 已存在活跃分配的 provider 列表（用于避免重复分配）
   */
  async hasAvailableCapacity(keyId: string): Promise<boolean> {
    const key = await this.prisma.distributableKey.findUnique({
      where: { id: keyId },
      select: {
        isActive: true,
        expiresAt: true,
        monthlyQuotaCents: true,
        currentSpendCents: true,
      },
    });
    if (!key || !key.isActive) return false;
    if (key.expiresAt && key.expiresAt < new Date()) return false;
    if (key.monthlyQuotaCents !== null) {
      return key.currentSpendCents < key.monthlyQuotaCents;
    }
    return true;
  }

  /**
   * 池级消费记账（同时递增 currentSpendCents）
   */
  async incrementPoolSpend(keyId: string, costCents: number): Promise<void> {
    if (costCents <= 0) return;
    await this.prisma.distributableKey.update({
      where: { id: keyId },
      data: { currentSpendCents: { increment: costCents } },
    });
  }

  /**
   * 月度配额重置：将 quotaResetAt 已过期的 Key 重置为 0，并把 quotaResetAt 推到下月 1 日 UTC。
   * 由定时任务调用。
   */
  async resetMonthlyQuotas(now: Date = new Date()): Promise<number> {
    const next = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );
    const result = await this.prisma.distributableKey.updateMany({
      where: { quotaResetAt: { lte: now } },
      data: { currentSpendCents: 0, quotaResetAt: next },
    });
    if (result.count > 0) {
      this.logger.log(
        `Reset monthly quota for ${result.count} distributable keys (next=${next.toISOString()})`,
      );
    }
    return result.count;
  }

  /**
   * 为某 provider 挑选最合适的可分发 Key（池级配额剩余最多的）
   */
  async pickBestForProvider(
    provider: string,
  ): Promise<DistributableKey | null> {
    const normalized = provider.toLowerCase();
    const candidates = await this.prisma.distributableKey.findMany({
      where: {
        provider: normalized,
        isActive: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: [{ createdAt: "desc" }],
      take: 20,
    });
    for (const k of candidates) {
      if (
        k.monthlyQuotaCents === null ||
        k.currentSpendCents < k.monthlyQuotaCents
      ) {
        return k;
      }
    }
    return null;
  }

  private toView(
    k: DistributableKey & { _count?: { assignments: number } },
  ): DistributableKeyView {
    return {
      id: k.id,
      provider: k.provider,
      label: k.label,
      keyHint: k.keyHint,
      apiEndpoint: k.apiEndpoint,
      monthlyQuotaCents: k.monthlyQuotaCents,
      currentSpendCents: k.currentSpendCents,
      quotaResetAt: k.quotaResetAt,
      isActive: k.isActive,
      expiresAt: k.expiresAt,
      activeAssignmentCount: k._count?.assignments ?? 0,
      createdAt: k.createdAt,
      updatedAt: k.updatedAt,
      createdBy: k.createdBy,
    };
  }
}
