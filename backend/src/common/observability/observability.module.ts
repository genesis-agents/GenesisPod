/**
 * Observability Module
 *
 * 提供可观测性能力：指标、日志、追踪
 * 设计为全局单例模块
 */

import { Module, Global } from "@nestjs/common";
import { MetricsService } from "./metrics.service";
import { MetricsController } from "./metrics.controller";
import { UserEventListener } from "./user-event.listener";

@Global()
@Module({
  controllers: [MetricsController],
  // UserEventListener：模块已 @Global 全局加载，加进 providers 后 listener 被
  // EventEmitter 自动注册，无需改 app.module.ts（运营看板 W1, PRD §4.6 零侵入）。
  providers: [MetricsService, UserEventListener],
  exports: [MetricsService],
})
export class ObservabilityModule {}
