/**
 * Metrics Controller
 *
 * 暴露 /metrics 端点用于 Prometheus 抓取
 */

import { Controller, Get, Header, UseGuards } from "@nestjs/common";
import { MetricsService } from "@/modules/platform/monitoring/metrics/metrics.service";
import { Public } from "@/common/decorators/public.decorator";
import { SkipTransform } from "@/common/interceptors/decorators/skip-transform.decorator";
import { MetricsAuthGuard } from "./metrics-auth.guard";

// @Public() skips the global JwtAuthGuard (scrapers can't send a JWT);
// MetricsAuthGuard enforces an optional METRICS_TOKEN instead.
@Public()
@UseGuards(MetricsAuthGuard)
@Controller("metrics")
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  /**
   * GET /metrics
   * 返回 Prometheus 格式的指标
   */
  @Get()
  @SkipTransform()
  @Header("Content-Type", "text/plain; version=0.0.4")
  getMetrics(): string {
    return this.metricsService.exportPrometheus();
  }

  /**
   * GET /metrics/json
   * 返回 JSON 格式的指标快照
   */
  @Get("json")
  getMetricsJson() {
    return {
      timestamp: new Date().toISOString(),
      metrics: this.metricsService.getMetricsSnapshot(),
    };
  }
}
