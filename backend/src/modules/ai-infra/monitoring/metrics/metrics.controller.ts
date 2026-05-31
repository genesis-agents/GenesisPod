import { Controller, Get, Header } from "@nestjs/common";
import { Public } from "../../../../common/decorators/public.decorator";
import { MetricsService } from "./metrics.service";

/**
 * Prometheus 抓取端点
 *
 * GET /metrics —— 返回 text/plain (version=0.0.4) 格式的全部指标，供 Prometheus 抓取。
 * @Public 因为这是基础设施探针，不需要业务鉴权。
 */
@Controller()
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Public()
  @Get("metrics")
  @Header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
  async getMetrics(): Promise<string> {
    return this.metricsService.metrics();
  }
}
