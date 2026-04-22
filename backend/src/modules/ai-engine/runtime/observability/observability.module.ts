/**
 * Observability Module
 *
 * 提供 AI Engine 的可观测性能力：
 * - TraceCollectorService: 执行链路追踪（Trace + Span）
 * - AiObservabilityService: LLM 调用指标聚合
 * - CostAttributionService: 成本归因与预算告警
 * - SessionLatencyTrackerService: 会话延迟追踪
 * - ObservabilityController: Admin Trace 查询端点
 *
 * 本模块是 @Global()，所有其他模块无需显式 import 即可注入这些 service。
 * （保持与原 AiKernelModule 等价的全局注入体验。）
 */

import { Global, Module } from "@nestjs/common";
import { PrismaModule } from "../../../../common/prisma/prisma.module";
import { TraceCollectorService } from "./trace-collector.service";
import { AiObservabilityService } from "./ai-observability.service";
import { CostAttributionService } from "./cost-attribution.service";
import { SessionLatencyTrackerService } from "./session-latency-tracker.service";
import { ObservabilityController } from "./observability.controller";

const OBSERVABILITY_PROVIDERS = [
  TraceCollectorService,
  AiObservabilityService,
  CostAttributionService,
  SessionLatencyTrackerService,
];

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [ObservabilityController],
  providers: OBSERVABILITY_PROVIDERS,
  exports: OBSERVABILITY_PROVIDERS,
})
export class ObservabilityModule {}
