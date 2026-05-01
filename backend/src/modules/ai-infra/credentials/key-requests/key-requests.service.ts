import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  KeyAssignment,
  KeyRequest,
  KeyRequestStatus,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { KeyAssignmentsService } from "../key-assignments/key-assignments.service";

export type EstimatedUsage = "LIGHT" | "MEDIUM" | "HEAVY";

export interface CreateKeyRequestInput {
  provider: string;
  reason?: string;
  estimatedUsage?: EstimatedUsage;
  note?: string;
}

export interface ApproveKeyRequestInput {
  keyId: string;
  userQuotaCents?: number | null;
  expiresAt?: Date | null;
  approvedBy: string;
  note?: string;
}

const ESTIMATED_USAGE_VALUES: readonly EstimatedUsage[] = [
  "LIGHT",
  "MEDIUM",
  "HEAVY",
];

@Injectable()
export class KeyRequestsService {
  private readonly logger = new Logger(KeyRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly keyAssignments: KeyAssignmentsService,
  ) {}

  async create(
    userId: string,
    input: CreateKeyRequestInput,
  ): Promise<KeyRequest> {
    const provider = input.provider.toLowerCase().trim();
    if (!provider) throw new BadRequestException("Provider is required");

    if (
      input.estimatedUsage &&
      !ESTIMATED_USAGE_VALUES.includes(input.estimatedUsage)
    ) {
      throw new BadRequestException("Invalid estimatedUsage value");
    }

    const existing = await this.prisma.keyRequest.findFirst({
      where: { userId, provider, status: KeyRequestStatus.PENDING },
    });
    if (existing) {
      throw new ConflictException(
        `A pending request for "${provider}" already exists`,
      );
    }

    return this.prisma.keyRequest.create({
      data: {
        userId,
        provider,
        reason: input.reason?.trim() || null,
        estimatedUsage: input.estimatedUsage ?? null,
        note: input.note?.trim() || null,
      },
    });
  }

  async cancel(id: string, userId: string): Promise<KeyRequest> {
    const request = await this.prisma.keyRequest.findUnique({ where: { id } });
    if (!request || request.userId !== userId) {
      throw new NotFoundException("Request not found");
    }
    if (request.status !== KeyRequestStatus.PENDING) {
      throw new ConflictException("Only PENDING requests can be cancelled");
    }
    return this.prisma.keyRequest.update({
      where: { id },
      data: { status: KeyRequestStatus.CANCELLED },
    });
  }

  /**
   * 管理员批准：先校验 request 状态 → 再创建 Assignment → 再更新 Request。
   *
   * 不使用外层 $transaction：KeyAssignmentsService.assign 内部已有独立事务，
   * 外层包裹会构成嵌套事务，外层回滚不会撤销已提交的 assignment，造成数据
   * 不一致。改为顺序执行 + 末尾更新失败时的补偿撤销。
   */
  async approve(
    requestId: string,
    input: ApproveKeyRequestInput,
  ): Promise<{ request: KeyRequest; assignment: KeyAssignment }> {
    // Step 1：预检查（非事务，仅快速失败）
    const request = await this.prisma.keyRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) throw new NotFoundException("Request not found");
    if (request.status !== KeyRequestStatus.PENDING) {
      throw new ConflictException("Request already handled");
    }

    // Step 2：创建 Assignment（自身事务内原子）
    const assignment = await this.keyAssignments.assign({
      keyId: input.keyId,
      userId: request.userId,
      userQuotaCents: input.userQuotaCents ?? null,
      expiresAt: input.expiresAt ?? null,
      assignedBy: input.approvedBy,
      note:
        input.note?.trim() || `Approved from request #${requestId.slice(0, 8)}`,
    });

    // Step 3：更新 KeyRequest 状态。若失败，回滚刚创建的 assignment 以保持一致
    try {
      const updated = await this.prisma.keyRequest.update({
        where: { id: requestId, status: KeyRequestStatus.PENDING },
        data: {
          status: KeyRequestStatus.APPROVED,
          handledBy: input.approvedBy,
          handledAt: new Date(),
          resultingAssignmentId: assignment.id,
        },
      });
      return { request: updated, assignment };
    } catch (error) {
      this.logger.error(
        `[approve] Failed to mark request ${requestId} APPROVED after ` +
          `assignment ${assignment.id} was created. Compensating by ` +
          `revoking assignment. Original error: ${(error as Error).message}`,
      );
      await this.keyAssignments
        .revoke(
          assignment.id,
          input.approvedBy,
          "Auto-rollback: approve failed to update request status",
        )
        .catch((rollbackErr) =>
          this.logger.error(
            `[approve] Rollback failed for assignment ${assignment.id}: ` +
              `${(rollbackErr as Error).message}. Manual cleanup required.`,
          ),
        );
      throw error;
    }
  }

  async reject(
    requestId: string,
    rejectedBy: string,
    reason: string,
  ): Promise<KeyRequest> {
    if (!reason?.trim()) {
      throw new BadRequestException("Rejection reason is required");
    }
    const request = await this.prisma.keyRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) throw new NotFoundException("Request not found");
    if (request.status !== KeyRequestStatus.PENDING) {
      throw new ConflictException("Request already handled");
    }
    return this.prisma.keyRequest.update({
      where: { id: requestId },
      data: {
        status: KeyRequestStatus.REJECTED,
        handledBy: rejectedBy,
        handledAt: new Date(),
        rejectionReason: reason.trim(),
      },
    });
  }

  async listMine(userId: string): Promise<KeyRequest[]> {
    return this.prisma.keyRequest.findMany({
      where: { userId },
      orderBy: [{ createdAt: "desc" }],
      take: 50,
    });
  }

  async listPending(filters?: {
    take?: number;
    skip?: number;
  }): Promise<KeyRequest[]> {
    return this.prisma.keyRequest.findMany({
      where: { status: KeyRequestStatus.PENDING },
      orderBy: [{ createdAt: "asc" }],
      take: filters?.take ?? 50,
      skip: filters?.skip ?? 0,
    });
  }

  async listAll(filters?: {
    status?: KeyRequestStatus;
    userId?: string;
    provider?: string;
    take?: number;
    skip?: number;
  }): Promise<KeyRequest[]> {
    const where: Prisma.KeyRequestWhereInput = {};
    if (filters?.status) where.status = filters.status;
    if (filters?.userId) where.userId = filters.userId;
    if (filters?.provider) where.provider = filters.provider.toLowerCase();
    return this.prisma.keyRequest.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      take: filters?.take ?? 50,
      skip: filters?.skip ?? 0,
    });
  }

  async hasPendingForProvider(
    userId: string,
    provider: string,
  ): Promise<boolean> {
    const count = await this.prisma.keyRequest.count({
      where: {
        userId,
        provider: provider.toLowerCase(),
        status: KeyRequestStatus.PENDING,
      },
    });
    return count > 0;
  }
}
