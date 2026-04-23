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
  Req,
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
import {
  TopicInsightsCapabilityReconciler,
  type TopicInsightsCapabilitySnapshot,
} from "../capability";
import type { ResearchDepth } from "../pipeline/types";

interface DispatchBody {
  userPrompt?: unknown;
  hasExistingReport?: unknown;
  lastReportSummary?: unknown;
}

interface JwtRequest {
  user?: { id?: string; userId?: string };
}

function isValidDepth(d: string): d is ResearchDepth {
  return d === "quick" || d === "standard" || d === "thorough" || d === "deep";
}

@Controller("harness")
export class HarnessHealthController {
  constructor(
    private readonly rollout: HarnessRolloutService,
    private readonly dispatcher: HarnessDispatcherService,
    private readonly capabilityReconciler: TopicInsightsCapabilityReconciler,
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
   * ★ 目标架构 v2（2026-04-23）：Topic Insights 能力快照。
   * 给前端 / 运维 / 自动化脚本在触发 mission 前查"这个环境现在实际支持什么"。
   * Query: ?depth=quick|standard|thorough|deep（默认 standard）
   */
  @Get("capabilities")
  @UseGuards(JwtAuthGuard)
  async getCapabilities(
    @Req() req: JwtRequest,
    @Query("depth") depth?: string,
  ): Promise<TopicInsightsCapabilitySnapshot> {
    const userId = req.user?.id ?? req.user?.userId ?? "anonymous";
    const requestedDepth: ResearchDepth =
      depth && isValidDepth(depth) ? depth : "standard";
    return this.capabilityReconciler.reconcile({ userId, requestedDepth });
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
