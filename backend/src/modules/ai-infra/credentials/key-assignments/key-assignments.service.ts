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
      const existing = await tx.keyAssignment.findUnique({
        where: {
          userId_provider: { userId: input.userId, provider: key.provider },
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
  ): Promise<ResolvedAssignment | null> {
    const normalized = provider.toLowerCase();
    const assignment = await this.prisma.keyAssignment.findUnique({
      where: { userId_provider: { userId, provider: normalized } },
    });
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
