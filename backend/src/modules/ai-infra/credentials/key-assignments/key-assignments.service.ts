import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { KeyAssignment, KeyAssignmentStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { DistributableKeysService } from "../distributable-keys/distributable-keys.service";
import { QuotaExceededError } from "../key-resolver/key-resolver.errors";

export interface AssignmentView {
  id: string;
  keyId: string;
  provider: string;
  userId: string;
  userQuotaCents: number | null;
  userSpendCents: number;
  status: KeyAssignmentStatus;
  assignedAt: Date;
  assignedBy: string | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  revokedBy: string | null;
  revokedReason: string | null;
  note: string | null;
}

export interface UserAssignmentView extends AssignmentView {
  keyLabel: string;
  keyHint: string | null;
  poolRemainingCents: number | null;
}

export interface ResolvedAssignment {
  assignmentId: string;
  keyId: string;
  apiKey: string;
  apiEndpoint: string | null;
  userQuotaCents: number | null;
  userSpendCents: number;
}

export interface AssignInput {
  keyId: string;
  userId: string;
  userQuotaCents?: number | null;
  expiresAt?: Date | null;
  assignedBy?: string;
  note?: string;
}

// PR-B 2026-05-08: 模型粒度批量授权
export interface GrantModelInput {
  modelId: string;
  userQuotaCents?: number | null;
}

export type ValidityType = "ONE_TIME" | "RECURRING";
export type RecurrenceUnit = "WEEK" | "MONTH" | "YEAR";

export interface GrantBatchInput {
  userId: string;
  models: GrantModelInput[];
  validityType: ValidityType;
  expiresAt?: Date | null; // ONE_TIME 用
  recurrenceUnit?: RecurrenceUnit; // RECURRING 用
  recurrenceInterval?: number; // RECURRING 用，1=每月，3=每季度
  assignedBy?: string;
  note?: string;
}

export interface GrantBatchFailure {
  modelId: string;
  reason: string;
}

export interface GrantBatchResult {
  succeeded: KeyAssignment[];
  failed: GrantBatchFailure[];
}

@Injectable()
export class KeyAssignmentsService {
  private readonly logger = new Logger(KeyAssignmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly distributableKeys: DistributableKeysService,
  ) {}

  /**
   * 分配 Key 给用户。同 provider 下若已有 ACTIVE 分配，则拒绝。
   * 返回事务结果，供调用方发送通知。
   */
  async assign(input: AssignInput): Promise<KeyAssignment> {
    const key = await this.prisma.distributableKey.findUnique({
      where: { id: input.keyId },
      select: { id: true, provider: true, isActive: true, expiresAt: true },
    });
    if (!key) throw new NotFoundException("Distributable key not found");
    if (!key.isActive) {
      throw new ConflictException("Cannot assign from an inactive key");
    }
    if (key.expiresAt && key.expiresAt < new Date()) {
      throw new ConflictException("Cannot assign from an expired key");
    }

    return this.prisma.$transaction(async (tx) => {
      // PR-A 2026-05-08: 旧接口（无 modelId 参数）走 modelId='*' 通配兼容
      // PR-B 会扩展接口让 admin 可指定具体 modelId 创建多条 assignment
      const existing = await tx.keyAssignment.findUnique({
        where: {
          userId_provider_modelId: {
            userId: input.userId,
            provider: key.provider,
            modelId: "*",
          },
        },
      });
      if (existing && existing.status === KeyAssignmentStatus.ACTIVE) {
        throw new ConflictException(
          `User already has an active assignment for provider "${key.provider}"`,
        );
      }
      // 如已有非 ACTIVE 记录（REVOKED/EXPIRED），先把旧记录删除以满足 unique 约束
      if (existing) {
        await tx.keyAssignment.delete({ where: { id: existing.id } });
      }
      return tx.keyAssignment.create({
        data: {
          keyId: input.keyId,
          userId: input.userId,
          provider: key.provider,
          modelId: "*", // PR-A 旧接口走通配，PR-B 才允许具体 modelId
          userQuotaCents: input.userQuotaCents ?? null,
          expiresAt: input.expiresAt ?? null,
          assignedBy: input.assignedBy,
          note: input.note,
        },
      });
    });
  }

  /**
   * 调整分配（配额 / 到期 / 备注）。不允许从 Revoked 复活。
   */
  async update(
    id: string,
    patch: {
      userQuotaCents?: number | null;
      expiresAt?: Date | null;
      note?: string | null;
      status?: KeyAssignmentStatus;
    },
  ): Promise<KeyAssignment> {
    const existing = await this.prisma.keyAssignment.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException("Assignment not found");
    if (
      patch.status === KeyAssignmentStatus.ACTIVE &&
      existing.status === KeyAssignmentStatus.REVOKED
    ) {
      throw new ConflictException("Cannot reactivate a revoked assignment");
    }

    const data: Prisma.KeyAssignmentUpdateInput = {};
    if (patch.userQuotaCents !== undefined)
      data.userQuotaCents = patch.userQuotaCents;
    if (patch.expiresAt !== undefined) data.expiresAt = patch.expiresAt;
    if (patch.note !== undefined) data.note = patch.note;
    if (patch.status !== undefined) data.status = patch.status;

    return this.prisma.keyAssignment.update({ where: { id }, data });
  }

  async revoke(
    id: string,
    by?: string,
    reason?: string,
  ): Promise<KeyAssignment> {
    const existing = await this.prisma.keyAssignment.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException("Assignment not found");
    // 幂等：已经是 REVOKED 的分配不再更新，避免覆盖首次撤销的时间和原因
    if (existing.status === KeyAssignmentStatus.REVOKED) return existing;
    return this.prisma.keyAssignment.update({
      where: { id },
      data: {
        status: KeyAssignmentStatus.REVOKED,
        revokedAt: new Date(),
        revokedBy: by,
        revokedReason: reason,
      },
    });
  }

  /**
   * 解析用户当前某 provider 的活跃分配；返回已解密的 Key（供 LLM 直调）。
   * 仅由 KeyResolverService 调用，不暴露给外部。
   *
   * - 不存在活跃分配 → 返回 null
   * - 分配已过期 → 标记 EXPIRED 后返回 null
   * - 用户级配额已耗尽 → 抛 QuotaExceededError
   * - 池级配额耗尽 / 池 Key 失效 → 返回 null
   */
  async resolveActive(
    userId: string,
    provider: string,
    modelId?: string, // PR-B 2026-05-08: 可选 modelId，传时先查具体后 fallback '*'
  ): Promise<ResolvedAssignment | null> {
    const normalized = provider.toLowerCase();
    // PR-B: 先查具体 modelId（若传入），未命中再 fallback 通配 '*'
    let assignment = null;
    if (modelId && modelId !== "*") {
      assignment = await this.prisma.keyAssignment.findUnique({
        where: {
          userId_provider_modelId: { userId, provider: normalized, modelId },
        },
      });
    }
    if (!assignment) {
      assignment = await this.prisma.keyAssignment.findUnique({
        where: {
          userId_provider_modelId: {
            userId,
            provider: normalized,
            modelId: "*",
          },
        },
      });
    }
    if (!assignment) return null;
    if (assignment.status !== KeyAssignmentStatus.ACTIVE) return null;

    // 过期检查
    if (assignment.expiresAt && assignment.expiresAt < new Date()) {
      await this.prisma.keyAssignment
        .update({
          where: { id: assignment.id },
          data: { status: KeyAssignmentStatus.EXPIRED },
        })
        .catch((err) =>
          this.logger.warn(
            `Failed to mark assignment ${assignment.id} as EXPIRED: ${err}`,
          ),
        );
      return null;
    }

    // 用户级配额检查
    if (
      assignment.userQuotaCents !== null &&
      assignment.userSpendCents >= assignment.userQuotaCents
    ) {
      throw new QuotaExceededError(normalized, "ASSIGNED", {
        usedCents: assignment.userSpendCents,
        limitCents: assignment.userQuotaCents,
      });
    }

    const decrypted = await this.distributableKeys.getDecryptedValue(
      assignment.keyId,
    );
    if (!decrypted) {
      this.logger.warn(
        `[resolveActive] Pool key ${assignment.keyId} is unavailable ` +
          `(deactivated/expired/decrypt-failed) but assignment ${assignment.id} ` +
          `is still ACTIVE. Admin should investigate: disable the assignment ` +
          `or re-encrypt the pool key.`,
      );
      return null; // 池级 Key 已停用/过期/解密失败
    }

    return {
      assignmentId: assignment.id,
      keyId: assignment.keyId,
      apiKey: decrypted.apiKey,
      apiEndpoint: decrypted.apiEndpoint,
      userQuotaCents: assignment.userQuotaCents,
      userSpendCents: assignment.userSpendCents,
    };
  }

  /**
   * PR-1 (2026-05-05) failover: 列出该 user/provider 下所有 ACTIVE 的分配（解密后）。
   *
   * 当前 schema `@@unique([userId, provider])` 决定单 user 单 provider 最多 1 个 ACTIVE
   * 分配，因此实际返回 0 或 1 个。PR-8 改 schema 加 label 后此方法天然支持多条。
   *
   * 与 resolveActive 的区别：
   * - resolveActive 单条 + 抛 QuotaExceededError；本方法批量 + 配额耗尽改为不返回（不抛错）
   * - 调用方（KeyResolver.resolveKeyChain）需要"过滤掉不可用"的语义，不需要"哪一个是配额耗尽"
   */
  async listActive(
    userId: string,
    provider: string,
    modelId?: string, // PR-B: 同 resolveActive，可选 modelId
  ): Promise<ResolvedAssignment[]> {
    const normalized = provider.toLowerCase();
    // PR-B: 先具体后 fallback '*'
    let assignment = null;
    if (modelId && modelId !== "*") {
      assignment = await this.prisma.keyAssignment.findUnique({
        where: {
          userId_provider_modelId: { userId, provider: normalized, modelId },
        },
      });
    }
    if (!assignment) {
      assignment = await this.prisma.keyAssignment.findUnique({
        where: {
          userId_provider_modelId: {
            userId,
            provider: normalized,
            modelId: "*",
          },
        },
      });
    }
    if (!assignment) return [];
    if (assignment.status !== KeyAssignmentStatus.ACTIVE) return [];
    if (assignment.expiresAt && assignment.expiresAt < new Date()) return [];
    if (
      assignment.userQuotaCents !== null &&
      assignment.userSpendCents >= assignment.userQuotaCents
    ) {
      return [];
    }
    const decrypted = await this.distributableKeys.getDecryptedValue(
      assignment.keyId,
    );
    if (!decrypted) return [];
    return [
      {
        assignmentId: assignment.id,
        keyId: assignment.keyId,
        apiKey: decrypted.apiKey,
        apiEndpoint: decrypted.apiEndpoint,
        userQuotaCents: assignment.userQuotaCents,
        userSpendCents: assignment.userSpendCents,
      },
    ];
  }

  /**
   * PR-B 2026-05-08: 模型粒度批量授权
   *
   * Admin 在 UI 选 N 个 model（可跨 provider）+ 单次/周期有效期 → 一次调用：
   *   - 每个 model：查 ai_models 表得 provider → 找该 provider 下利用率最低的 active pool
   *     → upsert KeyAssignment(userId, provider, modelId)
   *   - 单 model 失败不阻塞其他（如 "no available pool" / "user already active"）
   *   - 返回 succeeded[] + failed[{ modelId, reason }]
   *
   * RECURRING 自动计算 nextRenewalAt = now + recurrenceInterval × recurrenceUnit
   */
  async grantBatch(input: GrantBatchInput): Promise<GrantBatchResult> {
    const succeeded: KeyAssignment[] = [];
    const failed: GrantBatchFailure[] = [];

    if (!input.models.length) {
      return { succeeded, failed };
    }

    // RECURRING 校验
    if (input.validityType === "RECURRING") {
      if (!input.recurrenceUnit || !input.recurrenceInterval) {
        throw new ConflictException(
          "RECURRING validity requires recurrenceUnit + recurrenceInterval",
        );
      }
      if (input.recurrenceInterval < 1) {
        throw new ConflictException("recurrenceInterval must be >= 1");
      }
    }

    const nextRenewalAt =
      input.validityType === "RECURRING"
        ? this.computeNextRenewalAt(
            new Date(),
            input.recurrenceUnit!,
            input.recurrenceInterval!,
          )
        : null;

    for (const m of input.models) {
      try {
        // 1. 找 model 的 provider
        const model = await this.prisma.aIModel.findFirst({
          where: { modelId: m.modelId, isEnabled: true },
          select: { provider: true, modelId: true },
        });
        if (!model) {
          failed.push({
            modelId: m.modelId,
            reason: `Model not found or inactive: ${m.modelId}`,
          });
          continue;
        }
        const provider = model.provider.toLowerCase();

        // 2. 找该 provider 下利用率最低的 active pool
        const pool = await this.findBestPoolForProvider(provider);
        if (!pool) {
          failed.push({
            modelId: m.modelId,
            reason: `No available pool for provider "${provider}"`,
          });
          continue;
        }

        // 3. upsert（旧 EXPIRED/REVOKED 删了重建；旧 ACTIVE 拒绝）
        const created = await this.prisma.$transaction(async (tx) => {
          const existing = await tx.keyAssignment.findUnique({
            where: {
              userId_provider_modelId: {
                userId: input.userId,
                provider,
                modelId: m.modelId,
              },
            },
          });
          if (existing && existing.status === KeyAssignmentStatus.ACTIVE) {
            throw new ConflictException(
              `User already has active assignment for ${provider}/${m.modelId}`,
            );
          }
          if (existing) {
            await tx.keyAssignment.delete({ where: { id: existing.id } });
          }
          return tx.keyAssignment.create({
            data: {
              keyId: pool.id,
              userId: input.userId,
              provider,
              modelId: m.modelId,
              userQuotaCents: m.userQuotaCents ?? null,
              validityType: input.validityType,
              expiresAt:
                input.validityType === "ONE_TIME"
                  ? (input.expiresAt ?? null)
                  : null,
              recurrenceUnit:
                input.validityType === "RECURRING"
                  ? input.recurrenceUnit!
                  : null,
              recurrenceInterval:
                input.validityType === "RECURRING"
                  ? input.recurrenceInterval!
                  : null,
              nextRenewalAt,
              assignedBy: input.assignedBy,
              note: input.note,
            },
          });
        });
        succeeded.push(created);
      } catch (err) {
        failed.push({
          modelId: m.modelId,
          reason: (err as Error).message ?? "Unknown error",
        });
      }
    }

    this.logger.log(
      `[grantBatch] user=${input.userId} succeeded=${succeeded.length} failed=${failed.length}`,
    );
    return { succeeded, failed };
  }

  /**
   * 选 provider 下利用率最低的 active pool
   * 优先未限额 → 利用率最低 → 最早创建
   */
  private async findBestPoolForProvider(
    provider: string,
  ): Promise<{ id: string } | null> {
    const now = new Date();
    const pools = await this.prisma.distributableKey.findMany({
      where: {
        provider,
        isActive: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: {
        id: true,
        monthlyQuotaCents: true,
        currentSpendCents: true,
        createdAt: true,
      },
    });
    if (!pools.length) return null;
    const usable = pools.filter(
      (p) =>
        p.monthlyQuotaCents === null ||
        p.currentSpendCents < p.monthlyQuotaCents,
    );
    if (!usable.length) return null;
    usable.sort((a, b) => {
      const aRate =
        a.monthlyQuotaCents && a.monthlyQuotaCents > 0
          ? a.currentSpendCents / a.monthlyQuotaCents
          : 0;
      const bRate =
        b.monthlyQuotaCents && b.monthlyQuotaCents > 0
          ? b.currentSpendCents / b.monthlyQuotaCents
          : 0;
      if (aRate !== bRate) return aRate - bRate;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
    return { id: usable[0].id };
  }

  /**
   * RECURRING 推算下次续期时间
   *
   * 跨月边界 clamp（修 Path B 评审 FAIL）：
   * JS `setMonth` 对 1月31日 + 1月 会溢出到 3月3日（2月无31日）。
   * MONTH/YEAR 分支显式 clamp 到目标月最后一天，符合用户"每月续期"直觉。
   *
   * public：cron 续期逻辑也复用此方法，避免双源（feedback_no_dual_sources）。
   */
  computeNextRenewalAt(
    from: Date,
    unit: RecurrenceUnit,
    interval: number,
  ): Date {
    const next = new Date(from);
    if (unit === "WEEK") {
      next.setDate(next.getDate() + 7 * interval);
    } else if (unit === "MONTH") {
      const day = next.getDate();
      next.setDate(1); // 先 reset day=1 防止 setMonth 溢出
      next.setMonth(next.getMonth() + interval);
      const maxDay = new Date(
        next.getFullYear(),
        next.getMonth() + 1,
        0,
      ).getDate();
      next.setDate(Math.min(day, maxDay));
    } else if (unit === "YEAR") {
      const day = next.getDate();
      const month = next.getMonth();
      next.setDate(1);
      next.setFullYear(next.getFullYear() + interval);
      next.setMonth(month);
      const maxDay = new Date(
        next.getFullYear(),
        next.getMonth() + 1,
        0,
      ).getDate();
      next.setDate(Math.min(day, maxDay));
    }
    return next;
  }

  /**
   * 记账：用户级 + 池级双扣，保证两侧累计一致。
   */
  async incrementSpend(assignmentId: string, costCents: number): Promise<void> {
    if (costCents <= 0) return;
    const assignment = await this.prisma.keyAssignment.findUnique({
      where: { id: assignmentId },
      select: { keyId: true },
    });
    if (!assignment) return;
    await this.prisma.$transaction([
      this.prisma.keyAssignment.update({
        where: { id: assignmentId },
        data: { userSpendCents: { increment: costCents } },
      }),
      this.prisma.distributableKey.update({
        where: { id: assignment.keyId },
        data: { currentSpendCents: { increment: costCents } },
      }),
    ]);
  }

  /**
   * 用户可用的 Provider（仅 ACTIVE 分配）
   */
  async getAvailableProviders(userId: string): Promise<string[]> {
    const rows = await this.prisma.keyAssignment.findMany({
      where: { userId, status: KeyAssignmentStatus.ACTIVE },
      select: { provider: true },
      distinct: ["provider"],
    });
    return rows.map((r) => r.provider);
  }

  /**
   * 用户视角：我被分配的 Key 清单（含剩余配额等展示信息，不包含密文）
   */
  async listByUser(userId: string): Promise<UserAssignmentView[]> {
    const rows = await this.prisma.keyAssignment.findMany({
      where: { userId },
      include: {
        key: {
          select: {
            label: true,
            keyHint: true,
            monthlyQuotaCents: true,
            currentSpendCents: true,
          },
        },
      },
      orderBy: [{ status: "asc" }, { assignedAt: "desc" }],
    });
    return rows.map((a) => ({
      id: a.id,
      keyId: a.keyId,
      provider: a.provider,
      userId: a.userId,
      userQuotaCents: a.userQuotaCents,
      userSpendCents: a.userSpendCents,
      status: a.status,
      assignedAt: a.assignedAt,
      assignedBy: a.assignedBy,
      expiresAt: a.expiresAt,
      revokedAt: a.revokedAt,
      revokedBy: a.revokedBy,
      revokedReason: a.revokedReason,
      note: a.note,
      keyLabel: a.key.label,
      keyHint: a.key.keyHint,
      poolRemainingCents:
        a.key.monthlyQuotaCents === null
          ? null
          : Math.max(0, a.key.monthlyQuotaCents - a.key.currentSpendCents),
    }));
  }

  /**
   * 管理员视角：某 Key 的所有分配
   */
  async listByKey(keyId: string): Promise<AssignmentView[]> {
    const rows = await this.prisma.keyAssignment.findMany({
      where: { keyId },
      orderBy: [{ status: "asc" }, { assignedAt: "desc" }],
    });
    return rows.map(this.toView);
  }

  /**
   * 管理员视角：全局分配清单（支持分页）
   */
  async listAll(filters?: {
    status?: KeyAssignmentStatus;
    provider?: string;
    take?: number;
    skip?: number;
  }): Promise<AssignmentView[]> {
    const where: Prisma.KeyAssignmentWhereInput = {};
    if (filters?.status) where.status = filters.status;
    if (filters?.provider) where.provider = filters.provider.toLowerCase();
    const rows = await this.prisma.keyAssignment.findMany({
      where,
      orderBy: [{ assignedAt: "desc" }],
      take: filters?.take ?? 50,
      skip: filters?.skip ?? 0,
    });
    return rows.map(this.toView);
  }

  private toView = (a: KeyAssignment): AssignmentView => ({
    id: a.id,
    keyId: a.keyId,
    provider: a.provider,
    userId: a.userId,
    userQuotaCents: a.userQuotaCents,
    userSpendCents: a.userSpendCents,
    status: a.status,
    assignedAt: a.assignedAt,
    assignedBy: a.assignedBy,
    expiresAt: a.expiresAt,
    revokedAt: a.revokedAt,
    revokedBy: a.revokedBy,
    revokedReason: a.revokedReason,
    note: a.note,
  });
}
