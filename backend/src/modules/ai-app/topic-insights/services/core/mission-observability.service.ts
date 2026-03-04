/**
 * Mission Observability Service
 *
 * 合并观测性关注点 — 错误追踪、AI 指标、成本归因、内核事件总线
 * 从 ResearchMissionService 拆分，降低 God Service 复杂度
 */

import { Injectable, Logger, Optional } from "@nestjs/common";
import {
  ErrorTrackingService,
  AIMetricsService,
} from "@/modules/ai-infra/facade";
import {
  CostAttributionService,
  EventBusService,
} from "@/modules/ai-kernel/facade";
import type { EngineEvent } from "@/modules/ai-engine/facade";

@Injectable()
export class MissionObservabilityService {
  private readonly logger = new Logger(MissionObservabilityService.name);

  constructor(
    @Optional() private readonly errorTracking?: ErrorTrackingService,
    @Optional() private readonly aiMetrics?: AIMetricsService,
    @Optional() private readonly costAttribution?: CostAttributionService,
    @Optional() private readonly kernelEventBus?: EventBusService,
  ) {}

  /**
   * 记录研究任务成本（fire-and-forget）
   */
  recordResearchCost(
    userId: string,
    dimensionName: string,
    model: string,
    provider: string,
    inputTokens: number,
    outputTokens: number,
    estimatedCost: number,
  ): void {
    if (!this.costAttribution) {
      this.logger.debug(
        "[Degraded] CostAttributionService unavailable, skipping cost recording",
      );
      return;
    }
    try {
      this.costAttribution.recordCost({
        userId,
        moduleType: `research:${dimensionName}`,
        model,
        provider,
        inputTokens,
        outputTokens,
        estimatedCost,
      });
    } catch (err) {
      this.logger.warn(
        `[CostAttribution] Failed to record cost: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * 发送 Kernel 级研究生命周期事件（fire-and-forget）
   * 补充 kernel 级事件，不替换现有 EventEmitter2
   */
  emitKernelEvent(
    type: string,
    payload: Record<string, unknown>,
    correlationId?: string,
  ): void {
    if (!this.kernelEventBus) {
      this.logger.debug(
        `[Degraded] EventBusService unavailable, skipping kernel event: ${type}`,
      );
      return;
    }
    const event: EngineEvent<Record<string, unknown>> = {
      type,
      payload,
      metadata: {
        timestamp: new Date(),
        source: "topic-insights",
        correlationId,
      },
    };
    try {
      this.kernelEventBus.emit(event);
    } catch (err) {
      this.logger.warn(
        `[KernelEventBus] Failed to emit ${type}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * 记录错误到 ErrorTracking（fire-and-forget）
   */
  logError(params: {
    errorCode: string;
    errorType: string;
    message: string;
    severity: "warning" | "error" | "critical";
    component: string;
    metadata?: Record<string, unknown>;
  }): void {
    if (!this.errorTracking) {
      this.logger.debug(
        `[Degraded] ErrorTrackingService unavailable, skipping error: ${params.errorCode}`,
      );
      return;
    }
    void this.errorTracking
      .logError(params)
      .catch((e) => this.logger.debug(`ErrorTracking failed: ${e}`));
  }

  /**
   * 记录 Mission 执行指标（fire-and-forget）
   */
  recordMissionMetrics(params: {
    missionId: string;
    topicId: string;
    success: boolean;
    completedTasks: number;
    failedTasks: number;
    totalTasks: number;
  }): void {
    if (!this.aiMetrics) {
      this.logger.debug(
        `[Degraded] AIMetricsService unavailable, skipping mission metrics: ${params.missionId}`,
      );
      return;
    }
    void this.aiMetrics
      .recordMetric({
        metricType: "mission_execution",
        operationId: params.missionId,
        success: params.success,
        metadata: {
          module: "topic-insights",
          topicId: params.topicId,
          completedTasks: params.completedTasks,
          failedTasks: params.failedTasks,
          totalTasks: params.totalTasks,
        },
      })
      .catch((e) => this.logger.debug(`AIMetrics failed: ${e}`));
  }
}
