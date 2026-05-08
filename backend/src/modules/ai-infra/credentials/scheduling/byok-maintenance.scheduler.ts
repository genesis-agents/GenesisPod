import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { KeyAssignmentStatus } from "@prisma/client";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { DistributableKeysService } from "../distributable-keys/distributable-keys.service";
import { KeyAssignmentsService } from "../key-assignments/key-assignments.service";

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
    private readonly keyAssignments: KeyAssignmentsService,
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
      // PR-B 2026-05-08: 限定 validityType='ONE_TIME'，避免误改 RECURRING 周期续期
      const result = await this.prisma.keyAssignment.updateMany({
        where: {
          status: KeyAssignmentStatus.ACTIVE,
          validityType: "ONE_TIME",
          expiresAt: { lt: new Date() },
        },
        data: { status: KeyAssignmentStatus.EXPIRED },
      });
      if (result.count > 0) {
        this.logger.log(
          `[cron:expire-assignments] Marked ${result.count} ONE_TIME assignments as EXPIRED`,
        );
      }
    } catch (error) {
      this.logger.error(
        `[cron:expire-assignments] Failed: ${(error as Error).message}`,
      );
    }
  }

  /**
   * PR-B 2026-05-08: 每小时检查关联 DistributableKey 已停用的 ACTIVE 分配 → STALE
   *
   * 当前 schema 没有 cascade，DistributableKey.isActive=false 时关联 KeyAssignment 仍 ACTIVE。
   * 这导致 admin/UI 看到 alice 的权益是绿色 ACTIVE，但实际 KeyResolver 解析时找不到 active 池。
   * cron 每小时同步 STALE 状态 + admin UI 警告 + 前端用户引导重新申请。
   *
   * 注意：cascade 不撤销 assignment（admin 可能恢复 Key 池），仅打标。
   */
  @Cron(CronExpression.EVERY_HOUR, {
    name: "byok.mark-stale-assignments",
    timeZone: "UTC",
  })
  async markStaleAssignments(): Promise<void> {
    try {
      // 用 raw SQL 一次到位（避免先 query 再 updateMany 的并发漂移）
      const result = await this.prisma.$executeRaw`
        UPDATE key_assignments
        SET status = 'STALE'
        WHERE status = 'ACTIVE'
          AND key_id IN (
            SELECT id FROM distributable_keys WHERE is_active = false
          )
      `;
      if (result > 0) {
        this.logger.warn(
          `[cron:mark-stale] Marked ${result} assignments as STALE (associated pool deactivated)`,
        );
      }
      // ⚠️ 不做反向 STALE→ACTIVE 自动恢复（修 Path B 评审 FAIL）：
      // admin 停用 pool 是有意操作，cron 静默复活会绕过 admin 意图。
      // 池子重启后的恢复路径应在 service 层显式触发（admin 操作 pool.isActive=true 时同步）。
    } catch (error) {
      this.logger.error(
        `[cron:mark-stale] Failed: ${(error as Error).message}`,
      );
    }
  }

  /**
   * PR-B 2026-05-08: 每天 UTC 00:30 RECURRING 周期续期
   *
   * 订阅式周期：到 nextRenewalAt 时 reset userSpendCents=0 + 推下次续期时间。
   * status 不变（保持 ACTIVE），用户体感"额度自动重置"。
   *
   * 容错：单条失败不阻塞其他；过期未处理的下次扫描时仍能补救。
   */
  @Cron("30 0 * * *", {
    name: "byok.renew-recurring",
    timeZone: "UTC",
  })
  async renewRecurringAssignments(): Promise<void> {
    try {
      const now = new Date();
      const due = await this.prisma.keyAssignment.findMany({
        where: {
          status: KeyAssignmentStatus.ACTIVE,
          validityType: "RECURRING",
          nextRenewalAt: { lte: now },
        },
        select: {
          id: true,
          recurrenceUnit: true,
          recurrenceInterval: true,
          nextRenewalAt: true,
        },
      });
      let succeeded = 0;
      for (const a of due) {
        if (!a.recurrenceUnit || !a.recurrenceInterval || !a.nextRenewalAt) {
          this.logger.warn(
            `[cron:renew] Assignment ${a.id} RECURRING but missing fields, skip`,
          );
          continue;
        }
        // 复用 service.computeNextRenewalAt（含跨月 clamp，feedback_no_dual_sources）
        const next = this.keyAssignments.computeNextRenewalAt(
          a.nextRenewalAt,
          a.recurrenceUnit as "WEEK" | "MONTH" | "YEAR",
          a.recurrenceInterval,
        );
        try {
          await this.prisma.keyAssignment.update({
            where: { id: a.id },
            data: {
              userSpendCents: 0, // 用户已选"重置为 0"订阅式
              nextRenewalAt: next,
            },
          });
          succeeded++;
        } catch (err) {
          this.logger.warn(
            `[cron:renew] Failed renew ${a.id}: ${(err as Error).message}`,
          );
        }
      }
      if (succeeded > 0) {
        this.logger.log(
          `[cron:renew-recurring] Renewed ${succeeded}/${due.length} recurring assignments`,
        );
      }
    } catch (error) {
      this.logger.error(
        `[cron:renew-recurring] Failed: ${(error as Error).message}`,
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
