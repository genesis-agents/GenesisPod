import { Controller, Get, Logger, Post, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { KeyAssignmentStatus, KeyRequestStatus } from "@prisma/client";
import { JwtAuthGuard } from "../../../../common/guards/jwt-auth.guard";
import { AdminGuard } from "../../../../common/guards/admin.guard";
import { PrismaService } from "../../../../common/prisma/prisma.service";

/**
 * 管理员 BYOK 仪表盘
 *
 * 2026-05-08 v5（drop_distributable_keys）:
 *   - 删除"分发池规模"指标（池抽象已废）
 *   - 改为"启用模型数 / 活跃授权数 / 待审申请 / 用户总消耗"
 *   - 删除 reset-quotas 维护端点（池级配额已废）
 */
@ApiTags("Admin - BYOK Dashboard")
@Controller("admin/byok-dashboard")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminByokDashboardController {
  private readonly logger = new Logger(AdminByokDashboardController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async getMetrics() {
    const [
      totalModels,
      enabledModels,
      activeAssignments,
      pendingRequests,
      userSpendAggregate,
    ] = await Promise.all([
      this.prisma.aIModel.count(),
      this.prisma.aIModel.count({ where: { isEnabled: true } }),
      this.prisma.keyAssignment.count({
        where: { status: KeyAssignmentStatus.ACTIVE },
      }),
      this.prisma.keyRequest.count({
        where: { status: KeyRequestStatus.PENDING },
      }),
      this.prisma.keyAssignment.aggregate({
        where: { status: KeyAssignmentStatus.ACTIVE },
        _sum: { userSpendCents: true, userQuotaCents: true },
      }),
    ]);

    const totalSpendCents = userSpendAggregate._sum.userSpendCents ?? 0;
    const totalQuotaCents = userSpendAggregate._sum.userQuotaCents ?? null;

    return {
      totalModels,
      enabledModels,
      activeAssignments,
      pendingRequests,
      totalSpendCents,
      totalQuotaCents,
      utilizationPercent:
        totalQuotaCents && totalQuotaCents > 0
          ? Math.round((totalSpendCents / totalQuotaCents) * 100)
          : null,
    };
  }

  /**
   * 维护：把过期分配标记为 EXPIRED。
   * resolveActive 也会懒标记，但管理员可主动批量清理便于统计。
   */
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post("maintenance/expire-assignments")
  async expireAssignments() {
    const result = await this.prisma.keyAssignment.updateMany({
      where: {
        status: KeyAssignmentStatus.ACTIVE,
        validityType: "ONE_TIME",
        expiresAt: { lt: new Date() },
      },
      data: { status: KeyAssignmentStatus.EXPIRED },
    });
    this.logger.log(
      `[expire-assignments] Marked ${result.count} ONE_TIME assignments as EXPIRED`,
    );
    return { expiredCount: result.count };
  }

  /**
   * 维护：查询即将到期（7 天内）的活跃分配。前端可据此提醒用户。
   */
  @Get("expiring-soon")
  async expiringSoon() {
    const sevenDaysLater = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const items = await this.prisma.keyAssignment.findMany({
      where: {
        status: KeyAssignmentStatus.ACTIVE,
        expiresAt: { gt: new Date(), lt: sevenDaysLater },
      },
      select: {
        id: true,
        userId: true,
        provider: true,
        modelId: true,
        expiresAt: true,
        userQuotaCents: true,
        userSpendCents: true,
      },
      orderBy: { expiresAt: "asc" },
      take: 100,
    });
    return { items };
  }
}
