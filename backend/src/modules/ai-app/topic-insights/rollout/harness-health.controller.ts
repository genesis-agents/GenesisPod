/**
 * Harness health / rollout 控制接口
 *
 * GET  /harness/health          → HarnessHealthSnapshot
 * POST /harness/reset-rollback  → 手动清除 auto-rollback 状态
 *
 * 注意：本接口没有自己的 guard，只挂在 topic-insights module 上，
 * 部署层面应通过外部反代限 admin 访问。
 */

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "@/common/guards/jwt-auth.guard";
import {
  HarnessRolloutService,
  type HarnessHealthSnapshot,
} from "./harness-rollout.service";
import {
  HarnessDispatcherService,
  type DispatchResponse,
} from "./harness-dispatcher.service";

interface DispatchBody {
  userPrompt?: unknown;
  hasExistingReport?: unknown;
  lastReportSummary?: unknown;
}

@Controller("harness")
export class HarnessHealthController {
  constructor(
    private readonly rollout: HarnessRolloutService,
    private readonly dispatcher: HarnessDispatcherService,
  ) {}

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

  /**
   * AG-17-LDP dispatch — 意图分类端点。
   * Body: { userPrompt: string, hasExistingReport: boolean, lastReportSummary?: string }
   * Response: DispatchResponse
   *
   * 给 L5 intent-gateway 或其它 consumer 调用。不可用时返回 deterministic fallback，
   * 不会抛错。
   */
  @Post("dispatch")
  @UseGuards(JwtAuthGuard)
  async dispatch(@Body() body: DispatchBody): Promise<DispatchResponse> {
    const prompt =
      typeof body?.userPrompt === "string" ? body.userPrompt.trim() : "";
    if (!prompt) {
      throw new BadRequestException("userPrompt is required (string)");
    }
    if (prompt.length > 4000) {
      throw new BadRequestException("userPrompt exceeds 4000 chars");
    }
    const hasExistingReport =
      typeof body?.hasExistingReport === "boolean"
        ? body.hasExistingReport
        : false;
    const lastReportSummary =
      typeof body?.lastReportSummary === "string"
        ? body.lastReportSummary.slice(0, 2000)
        : undefined;

    return this.dispatcher.dispatch({
      userPrompt: prompt,
      hasExistingReport,
      lastReportSummary,
    });
  }
}
