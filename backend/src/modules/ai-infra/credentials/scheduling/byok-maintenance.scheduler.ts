import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { KeyAssignmentStatus } from "@prisma/client";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { DistributableKeysService } from "../distributable-keys/distributable-keys.service";

/**
 * BYOK 自动维护：定时重置分发池月度配额、标过期分配。
 *
 * 设计原则（防呆）：
 * - 任务幂等：重置只动 quotaResetAt <= NOW() 的 Key；过期只动 ACTIVE+已过期的分配
 * - 失败自恢复：单次失败不阻塞下一个周期；catch 包裹避免 Nest 进程崩溃
 * - 与管理员手动端点并存：`POST /admin/byok-dashboard/maintenance/*` 保留作为
 *   紧急手动触发入口，两者逻辑共用同一 Service，不会产生二次状态
 */
@Injectable()
export class ByokMaintenanceScheduler {
  private readonly logger = new Logger(ByokMaintenanceScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly distributableKeys: DistributableKeysService,
  ) {}

  /**
   * 每天 UTC 00:10 重置分发池月度配额。
   * - UTC 对齐：quotaResetAt 本就按 UTC 推进到下月 1 日，选 00:10 留 10 分钟缓冲
   * - 实际只重置 quotaResetAt 到期的 Key（见 DistributableKeysService.resetMonthlyQuotas）
   */
  @Cron("10 0 * * *", {
    name: "byok.reset-monthly-quotas",
    timeZone: "UTC",
  })
  async resetMonthlyQuotas(): Promise<void> {
    try {
      const count = await this.distributableKeys.resetMonthlyQuotas();
      if (count > 0) {
        this.logger.log(
          `[cron:reset-quotas] Reset monthly quota for ${count} distributable keys`,
        );
      }
    } catch (error) {
      this.logger.error(
        `[cron:reset-quotas] Failed: ${(error as Error).message}`,
      );
    }
  }

  /**
   * 每天 UTC 00:20 把过期的 ACTIVE 分配标为 EXPIRED。
   * resolveActive 调用时也会懒标记，但定时批处理让 Admin UI 的统计更准。
   */
  @Cron("20 0 * * *", {
    name: "byok.expire-assignments",
    timeZone: "UTC",
  })
  async expireAssignments(): Promise<void> {
    try {
      const result = await this.prisma.keyAssignment.updateMany({
        where: {
          status: KeyAssignmentStatus.ACTIVE,
          expiresAt: { lt: new Date() },
        },
        data: { status: KeyAssignmentStatus.EXPIRED },
      });
      if (result.count > 0) {
        this.logger.log(
          `[cron:expire-assignments] Marked ${result.count} assignments as EXPIRED`,
        );
      }
    } catch (error) {
      this.logger.error(
        `[cron:expire-assignments] Failed: ${(error as Error).message}`,
      );
    }
  }

  /**
   * 每小时 5 分：健康自检，仅记录日志。
   * 作用：在 Railway 日志里能看到 BYOK 任务调度器活着，便于排查「没跑」的假象。
   */
  @Cron(CronExpression.EVERY_HOUR, { name: "byok.heartbeat" })
  async heartbeat(): Promise<void> {
    this.logger.debug("[cron:heartbeat] BYOK scheduler alive");
  }
}
