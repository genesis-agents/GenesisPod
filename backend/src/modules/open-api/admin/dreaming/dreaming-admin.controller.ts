/**
 * DreamingAdminController — PR-I 骨架 2026-05-15
 *
 * Admin 入口，让运维 / 产品看到 Dreaming（主动反思）的持续成果：
 *   - 历史：每轮反思 mission 的 timeline（trigger / sample / 产出 / token）
 *   - 详情：单条 RuleBase 条目的 pattern / mitigation / 来源 missions / 效用统计
 *   - 配置：cron / 抽样窗口 / token budget / 启用开关
 *
 * 路径：/api/v1/admin/dreaming/*
 * 前端：/admin/ai/dreaming（与 eval/skills/knowledge 并列，AI 元学习资产）
 *
 * 实现状态：endpoint stub + DTO 定义，PR-I.2-I.4 逐步填实现。
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../../../common/guards/jwt-auth.guard";
import { AdminGuard } from "../../../../common/guards/admin.guard";
import {
  ReflectionMissionScheduler,
  type DreamingRule,
  type DreamingRunResult,
  type DreamingSchedulerConfig,
} from "../../../ai-harness/facade";
import { UpdateDreamingConfigDto } from "./dto/update-dreaming-config.dto";

/** 历史 run 列表项 */
export interface DreamingRunListItem {
  id: string;
  triggeredAt: string;
  triggerKind: "cron" | "failure_threshold" | "manual";
  sampleSize: number;
  newRulesCount: number;
  rejectedCandidates: number;
  tokensUsed: number;
  durationMs: number;
  status: "success" | "failed";
}

/** 详情：单条 rule 的完整 view */
export interface DreamingRuleDetail extends DreamingRule {
  /** 衰减后的有效置信度（confidence × successRate） */
  effectiveConfidence: number;
  /** 平均 success rate */
  successRate: number;
  /** 来源 mission 详情（topic / failureCode / 摘要）*/
  derivedMissions: Array<{
    id: string;
    topic: string;
    failureCode: string;
  }>;
}

/** dashboard 顶部统计 */
export interface DreamingOverview {
  totalRules: number;
  activeRules: number;
  recentRunsCount: number; // 近 7d
  totalTokensSpent: number;
  averageSuccessRate: number;
  lastRunAt: string | null;
}

@ApiTags("admin/dreaming")
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller("admin/dreaming")
export class DreamingAdminController {
  constructor(private readonly scheduler: ReflectionMissionScheduler) {}

  // ─── Overview ─────────────────────────────────────────────────────────────

  @Get("overview")
  @ApiOperation({
    summary: "Dreaming dashboard overview (前端 admin 进入页顶部 stat 卡)",
  })
  @ApiResponse({ status: 200 })
  async getOverview(): Promise<DreamingOverview> {
    // PR-I.4 实现：聚合 DreamingRule + DreamingRun 统计
    return {
      totalRules: 0,
      activeRules: 0,
      recentRunsCount: 0,
      totalTokensSpent: 0,
      averageSuccessRate: 0,
      lastRunAt: null,
    };
  }

  // ─── History（持续反思成果时间线）─────────────────────────────────────────

  @Get("runs")
  @ApiOperation({
    summary: "List reflection mission runs (Dreaming 历史 timeline)",
  })
  @ApiQuery({ name: "limit", required: false })
  @ApiQuery({ name: "since", required: false, description: "ISO timestamp" })
  async listRuns(
    @Query("limit") _limit?: string,
    @Query("since") _since?: string,
  ): Promise<DreamingRunListItem[]> {
    // PR-I.2 实现：查 DreamingRun 表 ORDER BY triggeredAt DESC
    return [];
  }

  @Get("runs/:runId")
  @ApiOperation({ summary: "Single run detail" })
  async getRunDetail(
    @Param("runId") _runId: string,
  ): Promise<DreamingRunResult | null> {
    // PR-I.2 实现：含 sample 详情 + 产出的 rule ids
    return null;
  }

  // ─── Rules（持续反思产出的规则详情）────────────────────────────────────────

  @Get("rules")
  @ApiOperation({ summary: "List all rules sorted by effective confidence" })
  @ApiQuery({ name: "includeDisabled", required: false })
  async listRules(
    @Query("includeDisabled") _includeDisabled?: string,
  ): Promise<DreamingRuleDetail[]> {
    // PR-I.3 实现：query + 衰减计算
    return [];
  }

  @Get("rules/:ruleId")
  @ApiOperation({
    summary: "Single rule detail (含来源 mission / 效用历史 / 衰减曲线)",
  })
  async getRuleDetail(
    @Param("ruleId") _ruleId: string,
  ): Promise<DreamingRuleDetail | null> {
    // PR-I.3 实现
    return null;
  }

  @Patch("rules/:ruleId/disable")
  @ApiOperation({ summary: "Admin 禁用某条 rule（保留历史不删）" })
  async disableRule(@Param("ruleId") ruleId: string): Promise<{ ok: true }> {
    await this.scheduler.disableRule(ruleId);
    return { ok: true };
  }

  @Patch("rules/:ruleId/enable")
  @ApiOperation({ summary: "重新启用 rule" })
  async enableRule(@Param("ruleId") _ruleId: string): Promise<{ ok: true }> {
    // 2026-05-15 Round 1 安全评审 Low 修复：stub 抛 501 避免假成功误导 admin
    throw new HttpException(
      "enableRule is not implemented yet (PR-I.4 scope)",
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  @Delete("rules/:ruleId")
  @ApiOperation({
    summary: "硬删除 rule（仅 admin 手动确认；通常用 disable 即可）",
  })
  async deleteRule(@Param("ruleId") _ruleId: string): Promise<{ ok: true }> {
    // 2026-05-15 Round 1 安全评审 Low 修复：破坏性操作 stub 必须抛 501，
    // 否则 admin 误以为已删，rule 仍存活继续被 Dreaming 引擎消费
    throw new HttpException(
      "deleteRule is not implemented yet (PR-I.4 scope)",
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  // ─── Config ───────────────────────────────────────────────────────────────

  @Get("config")
  @ApiOperation({ summary: "Get Dreaming scheduler config" })
  getConfig(): DreamingSchedulerConfig {
    return this.scheduler.getConfig();
  }

  @Patch("config")
  @ApiOperation({
    summary: "Update scheduler config (cron / sampleSize / etc.)",
  })
  // 2026-05-15 Round 2 安全评审 Medium 修复：DTO + ValidationPipe(whitelist) 强制
  // 校验 + 剔除多余字段，防止 admin token 泄漏后任意值灌进 scheduler config。
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  updateConfig(
    @Body() updates: UpdateDreamingConfigDto,
  ): DreamingSchedulerConfig {
    this.scheduler.setConfig(updates);
    return this.scheduler.getConfig();
  }

  // ─── Manual trigger ───────────────────────────────────────────────────────

  @Post("runs/trigger")
  @ApiOperation({
    summary: "手动触发一次 Dreaming run（admin 调试 / 紧急反思）",
  })
  async triggerRun(): Promise<DreamingRunResult> {
    return this.scheduler.runOnce({
      kind: "manual",
      detail: "admin-triggered",
      triggeredAt: new Date(),
    });
  }
}
