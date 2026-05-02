import { Module, Global } from "@nestjs/common";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { AIMetricsService } from "./ai-metrics.service";
import { ErrorTrackingService } from "./error-tracking.service";
import { HealthCheckService } from "./health-check.service";

/**
 * 监控模块 - 提供全局可用的监控服务
 *
 * 包含:
 * - AIMetricsService: AI 指标收集（LLM 调用、Token 使用、成本估算）
 * - ErrorTrackingService: 错误跟踪和聚合
 * - HealthCheckService: 统一健康检查（DB/Cache/AI Engine）
 * 此模块是 @Global() 的，因此只需在 AppModule 中导入一次
 */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [AIMetricsService, ErrorTrackingService, HealthCheckService],
  exports: [AIMetricsService, ErrorTrackingService, HealthCheckService],
})
export class MonitoringModule {}
