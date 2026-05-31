import { Module, Global } from "@nestjs/common";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { HealthCheckService } from "./health/health-check.service";
import { AIMetricsService } from "./metrics/ai-metrics.service";
import { ErrorTrackingService } from "./tracking/error-tracking.service";
import { AuditLogService } from "./audit/audit-log.service";

/**
 * 监控模块 - 提供全局可用的监控服务
 *
 * 包含:
 * - AIMetricsService: AI 指标收集（LLM 调用、Token 使用、成本估算）
 * - ErrorTrackingService: 错误跟踪和聚合
 * - HealthCheckService: 统一健康检查（DB/Cache/AI Engine）
 * - AuditLogService: append-only 高敏操作审计
 * 此模块是 @Global() 的，因此只需在 AppModule 中导入一次
 *
 * 注：Prometheus /metrics 端点由 common/observability/MetricsController 提供（canonical，
 * 单一来源）。本模块不再注册重复的 /metrics 控制器。
 */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    AIMetricsService,
    ErrorTrackingService,
    HealthCheckService,
    AuditLogService,
  ],
  exports: [
    AIMetricsService,
    ErrorTrackingService,
    HealthCheckService,
    AuditLogService,
  ],
})
export class MonitoringModule {}
