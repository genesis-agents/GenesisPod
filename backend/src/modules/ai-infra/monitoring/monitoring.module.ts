import { Module, Global } from "@nestjs/common";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { HealthCheckService } from "./health/health-check.service";
import { AIMetricsService } from "./metrics/ai-metrics.service";
import { ErrorTrackingService } from "./tracking/error-tracking.service";
import { AuditLogService } from "./audit/audit-log.service";
import { MetricsService } from "./metrics/metrics.service";
import { MetricsController } from "./metrics/metrics.controller";

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
  controllers: [MetricsController],
  providers: [
    AIMetricsService,
    ErrorTrackingService,
    HealthCheckService,
    AuditLogService,
    MetricsService,
  ],
  exports: [
    AIMetricsService,
    ErrorTrackingService,
    HealthCheckService,
    AuditLogService,
    MetricsService,
  ],
})
export class MonitoringModule {}
