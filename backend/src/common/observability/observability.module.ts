/**
 * Observability Module
 *
 * 提供可观测性能力：指标、日志、追踪
 * 设计为全局单例模块
 */

import { Module, Global } from "@nestjs/common";
import { MetricsService } from "./metrics.service";
import { MetricsController } from "./metrics.controller";

@Global()
@Module({
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class ObservabilityModule {}
