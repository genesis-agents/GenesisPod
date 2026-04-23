/**
 * Harness health / rollout 控制接口
 *
 * GET  /harness/health          → HarnessHealthSnapshot
 * POST /harness/reset-rollback  → 手动清除 auto-rollback 状态
 *
 * 注意：本接口没有自己的 guard，只挂在 topic-insights module 上，
 * 部署层面应通过外部反代限 admin 访问。
 */

import { Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "@/common/guards/jwt-auth.guard";
import {
  HarnessRolloutService,
  type HarnessHealthSnapshot,
} from "./harness-rollout.service";

@Controller("harness")
export class HarnessHealthController {
  constructor(private readonly rollout: HarnessRolloutService) {}

  @Get("health")
  @UseGuards(JwtAuthGuard)
  getHealth(): HarnessHealthSnapshot {
    return this.rollout.getHealthSnapshot();
  }

  /**
   * 聚合最近 N 小时的 harness run 指标（从 DB）
   * ?hours=24 默认；合法范围 1-168（7 天）
   */
  @Get("health/history")
  @UseGuards(JwtAuthGuard)
  async getHistory(
    @Query("hours") hours?: string,
  ): Promise<HarnessHealthSnapshot> {
    const n = hours ? parseInt(hours, 10) : 24;
    const safe = Number.isFinite(n) ? Math.max(1, Math.min(168, n)) : 24;
    return this.rollout.getHistorySnapshot(safe);
  }

  @Post("reset-rollback")
  @UseGuards(JwtAuthGuard)
  resetRollback(): { ok: true; timestamp: string } {
    this.rollout.resetAutoRollback();
    return { ok: true, timestamp: new Date().toISOString() };
  }
}
