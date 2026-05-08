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
  /** 2026-05-08 v5（drop_distributable_keys）：审批时选具体 AIModel.id，不再选密钥池 */
  modelDbId: string;
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
   * 2026-05-08 v5: 用 grantBatch 单 model 调用替代旧 assign（assign 已删）。
   * 失败时补偿 revoke 刚创建的 assignment 保持一致性。
   */
  async approve(
    requestId: string,
    input: ApproveKeyRequestInput,
  ): Promise<{ request: KeyRequest; assignment: KeyAssignment }> {
    const request = await this.prisma.keyRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) throw new NotFoundException("Request not found");
    if (request.status !== KeyRequestStatus.PENDING) {
      throw new ConflictException("Request already handled");
    }

    // 用 grantBatch 单 model 创建（单 ONE_TIME 授权）
    const result = await this.keyAssignments.grantBatch({
      userId: request.userId,
      models: [
        {
          modelDbId: input.modelDbId,
          userQuotaCents: input.userQuotaCents ?? null,
        },
      ],
      validityType: "ONE_TIME",
      expiresAt: input.expiresAt ?? null,
      assignedBy: input.approvedBy,
      note:
        input.note?.trim() || `Approved from request #${requestId.slice(0, 8)}`,
    });

    if (result.failed.length > 0 || result.succeeded.length === 0) {
      const reason =
        result.failed[0]?.reason ?? "Unknown error creating assignment";
      throw new BadRequestException(`Approval failed: ${reason}`);
    }
    const assignment = result.succeeded[0];

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
