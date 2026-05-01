import { Controller, Get, Logger, Post, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { KeyAssignmentStatus, KeyRequestStatus } from "@prisma/client";
import { JwtAuthGuard } from "../../../common/guards/jwt-auth.guard";
import { AdminGuard } from "../../../common/guards/admin.guard";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { DistributableKeysService } from "../../ai-infra/credentials/distributable-keys/distributable-keys.service";

/**
 * 管理员 BYOK 仪表盘：分发池规模、活跃分配、待处理申请、本月消耗。
 */
@ApiTags("Admin - BYOK Dashboard")
@Controller("admin/byok-dashboard")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminByokDashboardController {
  private readonly logger = new Logger(AdminByokDashboardController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly distributableKeys: DistributableKeysService,
  ) {}

  @Get()
  async getMetrics() {
    const [
      totalKeys,
      activeKeys,
      activeAssignments,
      pendingRequests,
      poolAggregate,
    ] = await Promise.all([
      this.prisma.distributableKey.count(),
      this.prisma.distributableKey.count({ where: { isActive: true } }),
      this.prisma.keyAssignment.count({
        where: { status: KeyAssignmentStatus.ACTIVE },
      }),
      this.prisma.keyRequest.count({
        where: { status: KeyRequestStatus.PENDING },
      }),
      this.prisma.distributableKey.aggregate({
        _sum: { currentSpendCents: true, monthlyQuotaCents: true },
      }),
    ]);

    const monthlySpendCents = poolAggregate._sum.currentSpendCents ?? 0;
    const monthlyQuotaCents = poolAggregate._sum.monthlyQuotaCents ?? null;

    return {
      totalKeys,
      activeKeys,
      activeAssignments,
      pendingRequests,
      monthlySpendCents,
      monthlyQuotaCents,
      utilizationPercent:
        monthlyQuotaCents && monthlyQuotaCents > 0
          ? Math.round((monthlySpendCents / monthlyQuotaCents) * 100)
          : null,
    };
  }

  /**
   * 维护：重置 quotaResetAt 已过期的分发 Key 的月度池配额。
   *
   * 无定时基建，由外部 cron / Railway scheduler / 管理员手动触发。
   * 推荐每天 UTC 00:10 调用一次（幂等；只会重置 quotaResetAt < NOW() 的 Key）。
   */
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post("maintenance/reset-quotas")
  async resetQuotas() {
    const count = await this.distributableKeys.resetMonthlyQuotas();
    this.logger.log(
      `[reset-quotas] Reset monthly quota for ${count} distributable keys`,
    );
    return { resetCount: count };
  }

  /**
   * 维护：把过期分配标记为 EXPIRED。
   * 调用 resolveActive 时本身会懒标记，但管理员也可主动批量清理，便于统计。
   */
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post("maintenance/expire-assignments")
  async expireAssignments() {
    const result = await this.prisma.keyAssignment.updateMany({
      where: {
        status: KeyAssignmentStatus.ACTIVE,
        expiresAt: { lt: new Date() },
      },
      data: { status: KeyAssignmentStatus.EXPIRED },
    });
    this.logger.log(
      `[expire-assignments] Marked ${result.count} assignments as EXPIRED`,
    );
    return { expiredCount: result.count };
  }

  /**
   * 维护：查询即将到期（7 天内）的活跃分配。前端可据此提醒用户。
   * 不发通知（一期 UX 决策：仅 UI 展示剩余天数，不推送）。
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
