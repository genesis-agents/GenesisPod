/**
 * Harness health / rollout 控制接口
 *
 * GET  /harness/health          → HarnessHealthSnapshot
 * POST /harness/reset-rollback  → 手动清除 auto-rollback 状态
 *
 * 注意：本接口没有自己的 guard，只挂在 topic-insights module 上，
 * 部署层面应通过外部反代限 admin 访问。
 */

import { Controller, Get, Post, UseGuards } from "@nestjs/common";
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

  @Post("reset-rollback")
  @UseGuards(JwtAuthGuard)
  resetRollback(): { ok: true; timestamp: string } {
    this.rollout.resetAutoRollback();
    return { ok: true, timestamp: new Date().toISOString() };
  }
}
