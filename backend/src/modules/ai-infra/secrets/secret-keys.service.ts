/**
 * SecretKeysService（多 KEY 管理 P1）
 *
 * 职责：1 个 secret name 下 N 个 KEY 并存的 CRUD + 业务侧 fallback chain。
 * 与 SecretsService 边界：本服务只动 secret_keys 表 + 兼容字段读取；
 * 不动 Secret 元信息（name/displayName/category/provider/...）。
 *
 * dual-track：业务侧 getSecretKey 在 secret_keys 为空时降级到 Secret.encryptedValue
 *（保证 P3 业务层切换前不破坏）。
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { EncryptionService } from "../encryption/encryption.service";
import { Secret, SecretKey } from "@prisma/client";
import {
  AddSecretKeyDto,
  UpdateSecretKeyMetaDto,
  ReplaceSecretKeyValueDto,
} from "./dto/secret-key.dto";
import { normalizeSecretName } from "./secret-name.catalog";
import { ProviderProbeService } from "../credentials/health/provider-probe.service";

export interface SecretKeyListItem {
  id: string;
  secretId: string;
  label: string;
  keyHint: string | null;
  isActive: boolean;
  priority: number;
  testStatus: string | null;
  lastTestedAt: Date | null;
  /** ★ 2026-05-06: 归一化错误码（AUTH_FAILED / RATE_LIMIT_KEY / 等），UI 据此出语义 badge */
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  accessCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ResolvedSecretKey {
  /// 解密后的明文（业务侧调用 provider 用）
  value: string;
  /// SecretKey.id（业务侧 markSuccess/markFailure 回写用）；
  /// 兼容降级到 Secret.encryptedValue 时为 null
  keyId: string | null;
  /// 命中 KEY 的 label（用于审计和日志，不含敏感数据）
  label: string;
}

export interface AuditContext {
  userId?: string;
  userEmail?: string;
  ipAddress?: string;
  userAgent?: string;
}

/// failed 状态后多久内仍熔断（避免持续打废 KEY，单位 ms）
const FAILED_CIRCUIT_BREAK_MS = 5 * 60 * 1000;

@Injectable()
export class SecretKeysService {
  private readonly logger = new Logger(SecretKeysService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly providerProbe: ProviderProbeService,
  ) {}

  // ========== Admin CRUD ==========

  async listKeys(secretId: string): Promise<SecretKeyListItem[]> {
    await this.requireSecret(secretId);
    const rows = await this.prisma.secretKey.findMany({
      where: { secretId },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    });
    return rows.map((row) => this.toListItem(row));
  }

  async addKey(
    secretId: string,
    dto: AddSecretKeyDto,
    context?: AuditContext,
  ): Promise<SecretKeyListItem> {
    await this.requireSecret(secretId);

    const dup = await this.prisma.secretKey.findUnique({
      where: { secretId_label: { secretId, label: dto.label } },
      select: { id: true },
    });
    if (dup) {
      throw new ConflictException(
        `Key with label '${dto.label}' already exists for this secret`,
      );
    }

    const { encryptedValue, iv } = this.encryption.encrypt(dto.value);
    const created = await this.prisma.secretKey.create({
      data: {
        secretId,
        label: dto.label,
        encryptedValue,
        iv,
        keyVersion: this.encryption.currentKeyVersion,
        keyHint: this.makeHint(dto.value),
        isActive: dto.isActive ?? true,
        priority: dto.priority ?? 0,
        createdBy: context?.userEmail || context?.userId,
        updatedBy: context?.userEmail || context?.userId,
      },
    });
    this.logger.log(`SecretKey added: secretId=${secretId} label=${dto.label}`);
    return this.toListItem(created);
  }

  async updateKeyMeta(
    keyId: string,
    dto: UpdateSecretKeyMetaDto,
    context?: AuditContext,
  ): Promise<SecretKeyListItem> {
    const existing = await this.requireKey(keyId);

    if (dto.label && dto.label !== existing.label) {
      const dup = await this.prisma.secretKey.findUnique({
        where: {
          secretId_label: { secretId: existing.secretId, label: dto.label },
        },
        select: { id: true },
      });
      if (dup) {
        throw new ConflictException(
          `Key with label '${dto.label}' already exists for this secret`,
        );
      }
    }

    const updated = await this.prisma.secretKey.update({
      where: { id: keyId },
      data: {
        ...(dto.label !== undefined ? { label: dto.label } : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        updatedBy: context?.userEmail || context?.userId,
      },
    });
    return this.toListItem(updated);
  }

  async replaceKeyValue(
    keyId: string,
    dto: ReplaceSecretKeyValueDto,
    context?: AuditContext,
  ): Promise<SecretKeyListItem> {
    await this.requireKey(keyId);
    const { encryptedValue, iv } = this.encryption.encrypt(dto.value);
    const updated = await this.prisma.secretKey.update({
      where: { id: keyId },
      data: {
        encryptedValue,
        iv,
        keyVersion: this.encryption.currentKeyVersion,
        keyHint: this.makeHint(dto.value),
        // 替换 value 后健康状态置回 unknown，等下次 test/调用回写
        // ★ 2026-05-06: lastErrorCode 也要清，否则旧错误码残留 → UI 误判失败
        testStatus: null,
        lastTestedAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        // ★ 2026-05-07: accessCount 是"当前物理 KEY 值的命中数"。Replace 后是
        // 全新物理 value，旧 hits 不属于它 → 重置为 0（与 testStatus reset 同语义）。
        accessCount: 0,
        updatedBy: context?.userEmail || context?.userId,
      },
    });
    return this.toListItem(updated);
  }

  async deleteKey(keyId: string, context?: AuditContext): Promise<void> {
    const existing = await this.requireKey(keyId);
    const secret = await this.prisma.secret.findUnique({
      where: { id: existing.secretId },
      select: { name: true },
    });

    // ★ 事务：删 KEY + 写审计日志（单 KEY 删除可追溯）
    await this.prisma.$transaction(async (tx) => {
      await tx.secretKey.delete({ where: { id: keyId } });
      await tx.secretAccessLog
        .create({
          data: {
            secretId: existing.secretId,
            action: "DELETE",
            actionStatus: "success",
            secretName: secret
              ? `${secret.name}#${existing.label}`
              : `?#${existing.label}`,
            userId: context?.userId,
            userEmail: context?.userEmail,
            ipAddress: context?.ipAddress,
            userAgent: context?.userAgent,
          },
        })
        .catch(() => undefined); // 审计失败不阻塞主流程（与既有 logAccess 一致）
    });

    this.logger.log(
      `SecretKey deleted: secretId=${existing.secretId} label=${existing.label} by=${context?.userEmail ?? "?"}`,
    );
  }

  /**
   * ★ 2026-05-06 重写：手动 Test 按钮做真上游探测（不再只看 AES 解密）。
   *
   * 流程：
   *   1. 解密 KEY；失败 → markFailure('DECRYPTION_FAILED')
   *   2. 拿 Secret.provider 调 ProviderProbeService.probeByProvider 真发 HTTP
   *   3. 结果走 markSuccess / markFailure 同一写库路径；UI 看到的 testStatus /
   *      lastTestedAt / lastErrorCode / lastErrorMessage 永远是"最近一次真实活动"
   *
   * 业务流量也调 markSuccess / markFailure，所以"OK / Failed 的时间"自动是
   * 上一次实际命中的时间，不会被手动按钮的伪绿章覆盖。
   *
   * 单写库原则：所有分支只调用一次 prisma.secretKey.update（直接写或经
   * markSuccess/markFailure），避免双写覆盖混乱 + 减少 race。
   */
  async testKey(
    keyId: string,
    context?: AuditContext,
  ): Promise<{ ok: boolean; errorCode?: string; errorMessage?: string }> {
    const existing = await this.requireKey(keyId);
    const updatedBy = context?.userEmail || context?.userId;
    const now = new Date();
    const decrypted = this.encryption.decrypt(
      existing.encryptedValue,
      existing.iv,
    );

    if (!decrypted || decrypted.length === 0) {
      await this.prisma.secretKey.update({
        where: { id: keyId },
        data: {
          testStatus: "failed",
          lastTestedAt: now,
          lastErrorCode: "DECRYPTION_FAILED",
          lastErrorMessage:
            "decryption failed (encryptedValue or iv corrupted)",
          updatedBy,
        },
      });
      return {
        ok: false,
        errorCode: "DECRYPTION_FAILED",
        errorMessage: "decryption failed",
      };
    }

    // 拉 Secret.provider 找 endpoint / apiFormat
    const secret = await this.prisma.secret.findUnique({
      where: { id: existing.secretId },
      select: { provider: true, name: true },
    });
    const providerSlug = secret?.provider ?? null;

    if (!providerSlug) {
      // Secret 没绑定 provider（SkillsMP / Tools 类）→ 暂无上游可调，
      // 退化为"解密 OK"。仍标 success 是因为 KEY 本身可用；errorMessage 提示
      // 真上游探测被跳过，让运维知道这条路径是降级状态。
      await this.prisma.secretKey.update({
        where: { id: keyId },
        data: {
          testStatus: "success",
          lastTestedAt: now,
          lastErrorCode: null,
          lastErrorMessage: "decrypted (no provider bound, real probe skipped)",
          updatedBy,
        },
      });
      return { ok: true };
    }

    const probeResult = await this.providerProbe.probeByProvider({
      provider: providerSlug,
      apiKey: decrypted,
    });

    // 注意：手动 probe 不算业务调用次数，markSuccess 走 incrementAccessCount=false
    if (probeResult.ok) {
      await this.prisma.secretKey.update({
        where: { id: keyId },
        data: {
          testStatus: "success",
          lastTestedAt: now,
          lastErrorCode: null,
          lastErrorMessage: null,
          updatedBy,
        },
      });
    } else {
      await this.prisma.secretKey.update({
        where: { id: keyId },
        data: {
          testStatus: "failed",
          lastTestedAt: now,
          lastErrorCode: (probeResult.errorCode ?? "UNKNOWN").slice(0, 40),
          lastErrorMessage: (probeResult.errorMessage ?? "probe failed").slice(
            0,
            500,
          ),
          updatedBy,
        },
      });
    }
    return {
      ok: probeResult.ok,
      errorCode: probeResult.errorCode,
      errorMessage: probeResult.errorMessage,
    };
  }

  // ========== Business-side fallback chain ==========

  /**
   * 业务侧 resolver 入口。按 priority asc + 健康熔断挑一个 KEY 解密返回。
   * 找不到 SecretKey 行（dual-track 还没回填）时降级读 Secret.encryptedValue。
   */
  async getSecretKey(
    secretName: string,
    _context?: AuditContext,
  ): Promise<ResolvedSecretKey | null> {
    const normalizedName = normalizeSecretName(secretName);

    const secret = await this.prisma.secret.findUnique({
      where: { name: normalizedName },
    });
    if (!secret || !secret.isActive || secret.deletedAt) return null;
    if (secret.expiresAt && secret.expiresAt < new Date()) return null;

    const candidate = await this.pickActiveKey(secret.id);
    if (candidate) {
      const decrypted = this.encryption.decrypt(
        candidate.encryptedValue,
        candidate.iv,
      );
      if (!decrypted) {
        this.logger.warn(
          `getSecretKey: decrypt failed for secretKey id=${candidate.id} label=${candidate.label}`,
        );
        return null;
      }
      return {
        value: decrypted,
        keyId: candidate.id,
        label: candidate.label,
      };
    }

    // dual-track 降级：SecretKey 表为空 → 读 Secret.encryptedValue
    const decrypted = this.encryption.decrypt(secret.encryptedValue, secret.iv);
    if (!decrypted) return null;
    return { value: decrypted, keyId: null, label: "(legacy)" };
  }

  /**
   * ★ 2026-05-06: 业务流量成功调用上游 + 手动 probe 通过都走它。
   * 写入：testStatus='success'、lastTestedAt=now、清错误码/消息、可选 accessCount++。
   * incrementAccessCount=true 仅在真实业务流量成功时；手动 probe 不算"业务调用次数"。
   */
  async markSuccess(
    keyId: string,
    options: { incrementAccessCount?: boolean } = {
      incrementAccessCount: true,
    },
  ): Promise<void> {
    await this.prisma.secretKey.update({
      where: { id: keyId },
      data: {
        testStatus: "success",
        lastTestedAt: new Date(),
        lastErrorCode: null,
        lastErrorMessage: null,
        ...(options.incrementAccessCount !== false
          ? { accessCount: { increment: 1 } }
          : {}),
      },
    });
  }

  /**
   * ★ 2026-05-06: 业务流量失败 + 手动 probe 失败统一入口。
   * errorCode 用 ProbeErrorCode 同款命名（AUTH_FAILED / RATE_LIMIT_KEY / 等），
   * UI 据此出语义化 badge（"未授权" / "限流" / 等）。
   */
  async markFailure(
    keyId: string,
    errorCode: string,
    errorMessage: string,
  ): Promise<void> {
    const trimmedMessage = errorMessage.slice(0, 500);
    const trimmedCode = errorCode.slice(0, 40);
    await this.prisma.secretKey.update({
      where: { id: keyId },
      data: {
        testStatus: "failed",
        lastTestedAt: new Date(),
        lastErrorCode: trimmedCode,
        lastErrorMessage: trimmedMessage,
      },
    });
  }

  // ========== Internals ==========

  private async pickActiveKey(secretId: string): Promise<SecretKey | null> {
    const candidates = await this.prisma.secretKey.findMany({
      where: { secretId, isActive: true },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    });
    if (candidates.length === 0) return null;

    const now = Date.now();
    for (const k of candidates) {
      if (k.testStatus === "failed" && k.lastTestedAt) {
        const since = now - k.lastTestedAt.getTime();
        if (since < FAILED_CIRCUIT_BREAK_MS) continue; // 仍在熔断窗口内，跳过
      }
      return k;
    }
    // 全部熔断中 → 兜底返回第一个（让业务再试一次自然恢复 markSuccess）
    return candidates[0];
  }

  private async requireSecret(secretId: string): Promise<Secret> {
    const secret = await this.prisma.secret.findUnique({
      where: { id: secretId },
    });
    if (!secret || secret.deletedAt) {
      throw new NotFoundException(`Secret '${secretId}' not found`);
    }
    return secret;
  }

  private async requireKey(keyId: string): Promise<SecretKey> {
    const key = await this.prisma.secretKey.findUnique({
      where: { id: keyId },
    });
    if (!key) {
      throw new NotFoundException(`SecretKey '${keyId}' not found`);
    }
    return key;
  }

  private makeHint(value: string): string {
    if (!value || value.length < 8) return "••••••••";
    const head = value.slice(0, 3);
    const tail = value.slice(-4);
    return `${head}…${tail}`;
  }

  private toListItem(row: SecretKey): SecretKeyListItem {
    return {
      id: row.id,
      secretId: row.secretId,
      label: row.label,
      keyHint: row.keyHint,
      isActive: row.isActive,
      priority: row.priority,
      testStatus: row.testStatus,
      lastTestedAt: row.lastTestedAt,
      lastErrorCode: row.lastErrorCode,
      lastErrorMessage: row.lastErrorMessage,
      accessCount: row.accessCount,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
