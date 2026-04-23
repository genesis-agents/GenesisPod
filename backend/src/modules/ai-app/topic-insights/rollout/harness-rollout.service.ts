/**
 * HarnessRolloutService — 灰度控制 + auto-rollback
 *
 * 职责：
 * 1. 决定给定用户是否走 harness 路径（基于 userId hash + rollout 百分比）
 * 2. 跟踪 harness run 成败 + 质量分
 * 3. 失败率 / 低分率超阈值时自动熄灯（ephemeral rollback，不改 env）
 *
 * 环境变量：
 * - TOPIC_INSIGHTS_USE_HARNESS=1       主开关
 * - TOPIC_INSIGHTS_HARNESS_ROLLOUT_PCT=10   百分比（0-100，默认 100）
 *
 * 内部指标窗口：最近 50 次 run，失败率 >= 0.3 触发 auto-rollback（返回 false）。
 */

import { Injectable, Logger, Optional } from "@nestjs/common";
import { createHash } from "crypto";
import { Decimal } from "@prisma/client/runtime/library";
import { PrismaService } from "@/common/prisma/prisma.service";

export interface HarnessRunMetric {
  readonly missionId: string;
  readonly userId: string;
  readonly success: boolean;
  readonly durationMs: number;
  readonly qualityScore?: number; // 0-100（来自 QGATE / EVAL）
  readonly tokensUsed: number;
  readonly costUsd: number;
  readonly errorMessage?: string;
  readonly recordedAt: Date;
}

export interface HarnessHealthSnapshot {
  readonly totalRuns: number;
  readonly successRate: number; // 0-1
  readonly avgQualityScore: number; // 0-100
  readonly avgDurationMs: number;
  readonly avgTokens: number;
  readonly totalCostUsd: number;
  readonly autoRolledBack: boolean;
  readonly rolloutPct: number;
  readonly rolloutActive: boolean;
}

const WINDOW_SIZE = 50;
const AUTO_ROLLBACK_FAILURE_RATE = 0.3;
const AUTO_ROLLBACK_MIN_SAMPLES = 10;
const AUTO_ROLLBACK_LOW_QUALITY_SCORE = 50;

@Injectable()
export class HarnessRolloutService {
  private readonly logger = new Logger(HarnessRolloutService.name);
  private readonly window: HarnessRunMetric[] = [];
  private autoRolledBack = false;

  constructor(@Optional() private readonly prisma?: PrismaService) {}

  /**
   * 是否走 harness 路径。
   * 规则：
   * - env flag 关闭 → false
   * - autoRolledBack → false
   * - userId hash % 100 < rolloutPct → true
   */
  shouldUseHarness(userId: string): boolean {
    if (process.env.TOPIC_INSIGHTS_USE_HARNESS !== "1") return false;
    if (this.autoRolledBack) return false;

    const pct = this.getRolloutPercentage();
    if (pct <= 0) return false;
    if (pct >= 100) return true;

    // 取 userId md5 前 4 byte 做 0-99 哈希
    const hash = createHash("md5").update(userId).digest();
    const bucket = hash.readUInt32BE(0) % 100;
    return bucket < pct;
  }

  /** 记录一次 harness run 的指标，触发窗口滚动 + auto-rollback 判定 */
  recordRun(metric: HarnessRunMetric): void {
    this.window.push(metric);
    if (this.window.length > WINDOW_SIZE) this.window.shift();

    this.evaluateAutoRollback();

    // 持久化到 DB（fire-and-forget，失败不影响主流程）
    if (this.prisma) {
      void this.persistToDb(metric);
    }
  }

  private async persistToDb(metric: HarnessRunMetric): Promise<void> {
    try {
      // 防御：NaN / Infinity / 负数可能来自上游 budget 计算异常
      // Prisma 会把 "NaN" 写入 DB 再失败；或污染聚合统计。此处统一落到 0。
      const safeNum = (n: number, min = 0): number =>
        Number.isFinite(n) && n >= min ? n : min;
      const safeInt = (n: number): number =>
        Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
      const safeQuality =
        metric.qualityScore != null &&
        Number.isFinite(metric.qualityScore) &&
        metric.qualityScore >= 0 &&
        metric.qualityScore <= 100
          ? Math.round(metric.qualityScore)
          : null;

      await this.prisma!.harnessRunMetric.create({
        data: {
          missionId: metric.missionId.slice(0, 100),
          userId: metric.userId.slice(0, 100),
          success: metric.success,
          durationMs: safeInt(metric.durationMs),
          qualityScore: safeQuality,
          tokensUsed: safeInt(metric.tokensUsed),
          costUsd: new Decimal(safeNum(metric.costUsd).toFixed(4)),
          errorMessage: metric.errorMessage?.slice(0, 500) ?? null,
          createdAt: metric.recordedAt,
        },
      });
    } catch (err) {
      this.logger.warn(
        `persistToDb failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * 从 DB 聚合最近 N 小时的指标（用于 /harness/health/history）
   */
  async getHistorySnapshot(hours = 24): Promise<HarnessHealthSnapshot> {
    if (!this.prisma) return this.getHealthSnapshot();

    const since = new Date(Date.now() - hours * 3600_000);
    try {
      const rows = await this.prisma.harnessRunMetric.findMany({
        where: { createdAt: { gte: since } },
        select: {
          success: true,
          durationMs: true,
          qualityScore: true,
          tokensUsed: true,
          costUsd: true,
        },
      });
      if (rows.length === 0) return this.getHealthSnapshot();
      const success = rows.filter((r) => r.success).length;
      const withQ = rows.filter((r) => r.qualityScore != null);
      const avgQ =
        withQ.length > 0
          ? withQ.reduce((s, r) => s + (r.qualityScore ?? 0), 0) / withQ.length
          : 0;
      const avgDur = rows.reduce((s, r) => s + r.durationMs, 0) / rows.length;
      const avgTok = rows.reduce((s, r) => s + r.tokensUsed, 0) / rows.length;
      const totalCost = rows.reduce((s, r) => s + Number(r.costUsd), 0);
      return {
        totalRuns: rows.length,
        successRate: success / rows.length,
        avgQualityScore: Math.round(avgQ * 10) / 10,
        avgDurationMs: Math.round(avgDur),
        avgTokens: Math.round(avgTok),
        totalCostUsd: Math.round(totalCost * 10000) / 10000,
        autoRolledBack: this.autoRolledBack,
        rolloutPct: this.getRolloutPercentage(),
        rolloutActive: process.env.TOPIC_INSIGHTS_USE_HARNESS === "1",
      };
    } catch (err) {
      this.logger.warn(
        `getHistorySnapshot failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return this.getHealthSnapshot();
    }
  }

  getHealthSnapshot(): HarnessHealthSnapshot {
    if (this.window.length === 0) {
      return {
        totalRuns: 0,
        successRate: 1,
        avgQualityScore: 0,
        avgDurationMs: 0,
        avgTokens: 0,
        totalCostUsd: 0,
        autoRolledBack: this.autoRolledBack,
        rolloutPct: this.getRolloutPercentage(),
        rolloutActive: process.env.TOPIC_INSIGHTS_USE_HARNESS === "1",
      };
    }

    const total = this.window.length;
    const success = this.window.filter((m) => m.success).length;
    const withQuality = this.window.filter((m) => m.qualityScore != null);
    const avgQuality =
      withQuality.length > 0
        ? withQuality.reduce((s, m) => s + (m.qualityScore ?? 0), 0) /
          withQuality.length
        : 0;
    const avgDuration =
      this.window.reduce((s, m) => s + m.durationMs, 0) / total;
    const avgTokens = this.window.reduce((s, m) => s + m.tokensUsed, 0) / total;
    const totalCost = this.window.reduce((s, m) => s + m.costUsd, 0);

    return {
      totalRuns: total,
      successRate: success / total,
      avgQualityScore: Math.round(avgQuality * 10) / 10,
      avgDurationMs: Math.round(avgDuration),
      avgTokens: Math.round(avgTokens),
      totalCostUsd: Math.round(totalCost * 10000) / 10000,
      autoRolledBack: this.autoRolledBack,
      rolloutPct: this.getRolloutPercentage(),
      rolloutActive: process.env.TOPIC_INSIGHTS_USE_HARNESS === "1",
    };
  }

  /** 手动清除 auto-rollback 状态（prod 修复后需调用） */
  resetAutoRollback(): void {
    if (this.autoRolledBack) {
      this.logger.log("Manual reset: clearing auto-rollback state");
      this.autoRolledBack = false;
    }
  }

  /** 手动清窗口（测试用） */
  resetMetrics(): void {
    this.window.length = 0;
    this.autoRolledBack = false;
  }

  private getRolloutPercentage(): number {
    const raw = process.env.TOPIC_INSIGHTS_HARNESS_ROLLOUT_PCT;
    if (!raw) return 100;
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) return 100;
    return Math.max(0, Math.min(100, n));
  }

  private evaluateAutoRollback(): void {
    if (this.autoRolledBack) return;
    if (this.window.length < AUTO_ROLLBACK_MIN_SAMPLES) return;

    const failures = this.window.filter((m) => !m.success).length;
    const failureRate = failures / this.window.length;
    if (failureRate >= AUTO_ROLLBACK_FAILURE_RATE) {
      this.autoRolledBack = true;
      this.logger.error(
        `AUTO-ROLLBACK triggered: failure rate ${(failureRate * 100).toFixed(1)}% over last ${this.window.length} runs`,
      );
      return;
    }

    const withQuality = this.window.filter((m) => m.qualityScore != null);
    if (withQuality.length >= AUTO_ROLLBACK_MIN_SAMPLES) {
      const avgQuality =
        withQuality.reduce((s, m) => s + (m.qualityScore ?? 0), 0) /
        withQuality.length;
      if (avgQuality < AUTO_ROLLBACK_LOW_QUALITY_SCORE) {
        this.autoRolledBack = true;
        this.logger.error(
          `AUTO-ROLLBACK triggered: avg quality ${avgQuality.toFixed(1)} < ${AUTO_ROLLBACK_LOW_QUALITY_SCORE} over last ${withQuality.length} runs`,
        );
      }
    }
  }
}
