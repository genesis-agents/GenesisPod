import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  Logger,
  Req,
  Optional,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from "@nestjs/swagger";
import { Request } from "express";
import { JwtAuthGuard } from "../../../common/guards/jwt-auth.guard";
import { AdminGuard } from "../../../common/guards/admin.guard";
import { ErrorTrackingService, AIMetricsService } from "../monitoring";
import { AIAdminService } from "./ai-admin.service";
import { PrismaService } from "../../../common/prisma/prisma.service";
import {
  RateLimitGuard,
  DistributedRateLimitGuard,
} from "../../../common/guards";
import { runSecurityChecks } from "../../../common/config/security.config";
import { MetricsService } from "../../../common/observability/metrics.service";

interface AuthenticatedRequest extends Request {
  user?: { id: string; email?: string };
}

/**
 * 系统监控管理控制器
 * 提供错误跟踪、AI 指标、系统健康等监控功能
 * 统一路由前缀: /admin/monitoring
 */
@ApiTags("Admin - Monitoring")
@Controller("admin/monitoring")
@UseGuards(JwtAuthGuard, AdminGuard)
export class MonitoringAdminController {
  private readonly logger = new Logger(MonitoringAdminController.name);

  constructor(
    private readonly errorTrackingService: ErrorTrackingService,
    private readonly aiMetricsService: AIMetricsService,
    private readonly aiAdminService: AIAdminService,
    private readonly prismaService: PrismaService,
    @Optional() private readonly rateLimitGuard?: RateLimitGuard,
    @Optional()
    private readonly distributedRateLimitGuard?: DistributedRateLimitGuard,
    @Optional() private readonly metricsService?: MetricsService,
  ) {}

  // ==================== Error Tracking ====================

  @Get("errors/stats")
  @ApiOperation({ summary: "获取错误统计摘要" })
  @ApiQuery({ name: "startDate", required: false, type: String })
  @ApiQuery({ name: "endDate", required: false, type: String })
  @ApiQuery({ name: "component", required: false, type: String })
  @ApiResponse({ status: 200, description: "返回错误统计摘要" })
  async getErrorStats(
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("component") component?: string,
  ) {
    this.logger.log("Admin: Fetching error stats");
    return this.errorTrackingService.getErrorStats({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      component,
    });
  }

  @Get("errors/aggregated")
  @ApiOperation({ summary: "获取聚合错误列表" })
  @ApiQuery({ name: "startDate", required: false, type: String })
  @ApiQuery({ name: "endDate", required: false, type: String })
  @ApiQuery({ name: "severity", required: false, type: String })
  @ApiQuery({ name: "component", required: false, type: String })
  @ApiQuery({ name: "resolved", required: false, type: Boolean })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiResponse({ status: 200, description: "返回聚合错误列表" })
  async getAggregatedErrors(
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("severity") severity?: string,
    @Query("component") component?: string,
    @Query("resolved") resolved?: string,
    @Query("limit") limit?: string,
  ) {
    this.logger.log("Admin: Fetching aggregated errors");
    return this.errorTrackingService.getAggregatedErrors({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      severity,
      component,
      resolved: resolved !== undefined ? resolved === "true" : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get("errors")
  @ApiOperation({ summary: "获取错误列表" })
  @ApiQuery({ name: "startDate", required: false, type: String })
  @ApiQuery({ name: "endDate", required: false, type: String })
  @ApiQuery({ name: "errorCode", required: false, type: String })
  @ApiQuery({ name: "severity", required: false, type: String })
  @ApiQuery({ name: "component", required: false, type: String })
  @ApiQuery({ name: "resolved", required: false, type: Boolean })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "offset", required: false, type: Number })
  @ApiResponse({ status: 200, description: "返回错误列表" })
  async getErrorList(
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("errorCode") errorCode?: string,
    @Query("severity") severity?: string,
    @Query("component") component?: string,
    @Query("resolved") resolved?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    this.logger.log("Admin: Fetching error list");
    return this.errorTrackingService.getErrorList({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      errorCode,
      severity,
      component,
      resolved: resolved !== undefined ? resolved === "true" : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get("errors/:id")
  @ApiOperation({ summary: "获取错误详情" })
  @ApiResponse({ status: 200, description: "返回错误详情" })
  async getErrorDetail(@Param("id") id: string) {
    this.logger.log(`Admin: Fetching error detail: ${id}`);
    return this.errorTrackingService.getErrorDetail(id);
  }

  @Post("errors/:id/resolve")
  @ApiOperation({ summary: "标记错误为已解决" })
  @ApiResponse({ status: 200, description: "错误已标记为已解决" })
  async resolveError(
    @Param("id") id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user?.id || "admin";
    this.logger.log(`Admin: Resolving error: ${id}`);
    return this.errorTrackingService.resolveError(id, userId);
  }

  @Post("errors/resolve-by-code")
  @ApiOperation({ summary: "按错误码批量标记为已解决" })
  @ApiResponse({ status: 200, description: "返回已解决的错误数量" })
  async resolveErrorsByCode(
    @Body() body: { errorCode: string },
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user?.id || "admin";
    this.logger.log(`Admin: Resolving errors by code: ${body.errorCode}`);
    return this.errorTrackingService.resolveErrorsByCode(
      body.errorCode,
      userId,
    );
  }

  // ==================== AI Metrics ====================

  @Get("ai-metrics/summary")
  @ApiOperation({ summary: "获取 AI 指标摘要" })
  @ApiQuery({ name: "startDate", required: false, type: String })
  @ApiQuery({ name: "endDate", required: false, type: String })
  @ApiQuery({ name: "userId", required: false, type: String })
  @ApiResponse({ status: 200, description: "返回 AI 指标摘要" })
  async getAIMetricsSummary(
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("userId") userId?: string,
  ) {
    this.logger.log("Admin: Fetching AI metrics summary");
    return this.aiMetricsService.getMetricsSummary({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      userId,
    });
  }

  @Get("ai-metrics/models")
  @ApiOperation({ summary: "获取模型使用统计" })
  @ApiQuery({ name: "startDate", required: false, type: String })
  @ApiQuery({ name: "endDate", required: false, type: String })
  @ApiResponse({ status: 200, description: "返回模型使用统计" })
  async getModelUsageStats(
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    this.logger.log("Admin: Fetching model usage stats");
    return this.aiMetricsService.getModelUsageStats({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
  }

  @Get("ai-metrics/realtime")
  @ApiOperation({ summary: "获取实时 AI 指标" })
  @ApiResponse({ status: 200, description: "返回实时 AI 指标" })
  async getRealtimeMetrics() {
    this.logger.log("Admin: Fetching realtime AI metrics");
    return this.aiMetricsService.getRealtimeMetrics();
  }

  @Get("ai-metrics/errors")
  @ApiOperation({ summary: "获取 AI 错误分析" })
  @ApiQuery({ name: "startDate", required: false, type: String })
  @ApiQuery({ name: "endDate", required: false, type: String })
  @ApiResponse({ status: 200, description: "返回 AI 错误分析" })
  async getAIErrorAnalysis(
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    this.logger.log("Admin: Fetching AI error analysis");
    return this.aiMetricsService.getErrorAnalysis({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
  }

  // ==================== Database Monitoring ====================

  @Get("database/health")
  @ApiOperation({ summary: "获取数据库健康状态" })
  @ApiResponse({ status: 200, description: "返回数据库健康状态" })
  async getDatabaseHealth() {
    this.logger.log("Admin: Fetching database health");
    return this.prismaService.healthCheck();
  }

  @Get("database/pool")
  @ApiOperation({ summary: "获取数据库连接池状态" })
  @ApiResponse({ status: 200, description: "返回数据库连接池状态" })
  async getDatabasePoolStats() {
    this.logger.log("Admin: Fetching database pool stats");
    return this.prismaService.getPoolStats();
  }

  // ==================== System Health ====================

  @Get("health")
  @ApiOperation({ summary: "获取系统健康状态" })
  @ApiResponse({ status: 200, description: "返回系统健康状态" })
  async getSystemHealth() {
    this.logger.log("Admin: Fetching system health");

    // 获取 AI 能力诊断
    const aiDiagnosis = await this.aiAdminService.diagnoseAllCapabilities();

    // 获取错误统计（最近 24 小时）
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const errorStats = await this.errorTrackingService.getErrorStats({
      startDate: oneDayAgo,
    });

    // 获取 AI 指标（最近 24 小时）
    const aiMetrics = await this.aiMetricsService.getMetricsSummary({
      startDate: oneDayAgo,
    });

    // 计算健康分数
    const healthScore = this.calculateHealthScore(
      aiDiagnosis,
      errorStats,
      aiMetrics,
    );

    return {
      timestamp: new Date().toISOString(),
      healthScore,
      status:
        healthScore >= 80
          ? "healthy"
          : healthScore >= 50
            ? "degraded"
            : "unhealthy",
      components: {
        aiEngine: {
          status: aiDiagnosis.breakpoints.length === 0 ? "healthy" : "degraded",
          issues: aiDiagnosis.breakpoints.length,
          tools: aiDiagnosis.builtinTools.summary,
          skills: aiDiagnosis.skills.summary,
          mcpServers: aiDiagnosis.mcpServers.summary,
        },
        errorTracking: {
          status: errorStats.critical === 0 ? "healthy" : "degraded",
          total24h: errorStats.total,
          critical24h: errorStats.critical,
          unresolved: errorStats.unresolved,
        },
        aiMetrics: {
          status: aiMetrics.successRate >= 95 ? "healthy" : "degraded",
          totalCalls24h: aiMetrics.totalCalls,
          successRate: aiMetrics.successRate,
          avgDuration: aiMetrics.avgDuration,
          totalTokens24h: aiMetrics.totalTokens,
        },
      },
      breakpoints: aiDiagnosis.breakpoints,
    };
  }

  @Get("dashboard")
  @ApiOperation({ summary: "获取监控仪表盘数据" })
  @ApiResponse({ status: 200, description: "返回监控仪表盘数据" })
  async getDashboard() {
    this.logger.log("Admin: Fetching monitoring dashboard");

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      errorStats,
      aggregatedErrors,
      aiMetrics,
      realtimeMetrics,
      modelStats,
      aiDiagnosis,
    ] = await Promise.all([
      this.errorTrackingService.getErrorStats({ startDate: oneWeekAgo }),
      this.errorTrackingService.getAggregatedErrors({
        startDate: oneDayAgo,
        resolved: false,
        limit: 10,
      }),
      this.aiMetricsService.getMetricsSummary({ startDate: oneWeekAgo }),
      this.aiMetricsService.getRealtimeMetrics(),
      this.aiMetricsService.getModelUsageStats({ startDate: oneWeekAgo }),
      this.aiAdminService.diagnoseAllCapabilities(),
    ]);

    return {
      timestamp: new Date().toISOString(),
      errors: {
        stats: errorStats,
        topErrors: aggregatedErrors,
      },
      aiMetrics: {
        summary: aiMetrics,
        realtime: realtimeMetrics,
        modelUsage: modelStats,
      },
      aiDiagnosis: {
        tools: aiDiagnosis.builtinTools.summary,
        skills: aiDiagnosis.skills.summary,
        mcpServers: aiDiagnosis.mcpServers.summary,
        externalTools: aiDiagnosis.externalTools.summary,
        breakpoints: aiDiagnosis.breakpoints,
      },
    };
  }

  // ==================== APM (Application Performance Monitoring) ====================

  @Get("apm/summary")
  @ApiOperation({ summary: "获取 APM 性能摘要" })
  @ApiResponse({ status: 200, description: "返回 APM 性能摘要" })
  async getAPMSummary() {
    this.logger.log("Admin: Fetching APM summary");

    const metrics = this.metricsService?.getMetricsSnapshot() || [];

    // 提取 HTTP 相关指标
    const httpDuration = metrics.find(
      (m) => m.name === "http_request_duration_ms",
    );
    const httpRequests = metrics.find((m) => m.name === "http_requests_total");
    const httpErrors = metrics.find((m) => m.name === "http_errors_total");

    // 计算 HTTP 统计
    let totalRequests = 0;
    let totalErrors = 0;
    const routeStats: Record<
      string,
      { count: number; avgDuration: number; errorRate: number }
    > = {};

    if (httpRequests) {
      for (const v of httpRequests.values) {
        if (typeof v.value === "number") {
          totalRequests += v.value;
          const route = v.labels.route || "unknown";
          if (!routeStats[route]) {
            routeStats[route] = { count: 0, avgDuration: 0, errorRate: 0 };
          }
          routeStats[route].count += v.value;
        }
      }
    }

    if (httpErrors) {
      for (const v of httpErrors.values) {
        if (typeof v.value === "number") {
          totalErrors += v.value;
        }
      }
    }

    if (httpDuration) {
      for (const v of httpDuration.values) {
        if (
          typeof v.value === "object" &&
          "sum" in v.value &&
          "count" in v.value
        ) {
          const route = v.labels.route || "unknown";
          if (routeStats[route] && v.value.count > 0) {
            routeStats[route].avgDuration = Math.round(
              v.value.sum / v.value.count,
            );
          }
        }
      }
    }

    // 计算错误率
    for (const route of Object.keys(routeStats)) {
      if (routeStats[route].count > 0) {
        // 这里简化处理，实际需要按路由统计错误
        routeStats[route].errorRate =
          totalRequests > 0
            ? Math.round((totalErrors / totalRequests) * 100 * 100) / 100
            : 0;
      }
    }

    // 获取 AI 指标
    const aiLatency = metrics.find((m) => m.name === "ai_response_latency_ms");
    const aiSuccess = metrics.find(
      (m) => m.name === "ai_response_success_total",
    );
    const aiErrors = metrics.find((m) => m.name === "ai_response_errors_total");

    let aiTotalCalls = 0;
    let aiTotalErrors = 0;
    if (aiSuccess) {
      for (const v of aiSuccess.values) {
        if (typeof v.value === "number") aiTotalCalls += v.value;
      }
    }
    if (aiErrors) {
      for (const v of aiErrors.values) {
        if (typeof v.value === "number") aiTotalErrors += v.value;
      }
    }

    return {
      timestamp: new Date().toISOString(),
      http: {
        totalRequests,
        totalErrors,
        errorRate:
          totalRequests > 0
            ? Math.round((totalErrors / totalRequests) * 100 * 100) / 100
            : 0,
        topRoutes: Object.entries(routeStats)
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, 10)
          .map(([route, stats]) => ({ route, ...stats })),
      },
      ai: {
        totalCalls: aiTotalCalls + aiTotalErrors,
        successRate:
          aiTotalCalls + aiTotalErrors > 0
            ? Math.round(
                (aiTotalCalls / (aiTotalCalls + aiTotalErrors)) * 100 * 100,
              ) / 100
            : 100,
        latencyHistogram: aiLatency?.values || [],
      },
      allMetrics: metrics,
    };
  }

  // ==================== Security ====================

  @Get("security/check")
  @ApiOperation({ summary: "运行安全检查" })
  @ApiResponse({ status: 200, description: "返回安全检查结果" })
  async runSecurityCheck() {
    this.logger.log("Admin: Running security checks");
    const checks = runSecurityChecks();
    const passCount = checks.filter((c) => c.status === "pass").length;
    const warnCount = checks.filter((c) => c.status === "warn").length;
    const failCount = checks.filter((c) => c.status === "fail").length;

    return {
      timestamp: new Date().toISOString(),
      summary: {
        total: checks.length,
        pass: passCount,
        warn: warnCount,
        fail: failCount,
        score: Math.round(
          ((passCount + warnCount * 0.5) / checks.length) * 100,
        ),
      },
      checks,
    };
  }

  // ==================== Rate Limiting ====================

  @Get("rate-limit/stats")
  @ApiOperation({ summary: "获取限流统计信息" })
  @ApiResponse({ status: 200, description: "返回限流统计信息" })
  async getRateLimitStats() {
    this.logger.log("Admin: Fetching rate limit stats");
    return {
      memoryGuard: this.rateLimitGuard
        ? {
            recordCount: this.rateLimitGuard.getRecordCount(),
            lastGlobalCleanup: new Date(
              this.rateLimitGuard.getLastGlobalCleanup(),
            ).toISOString(),
          }
        : null,
      distributedGuard: this.distributedRateLimitGuard
        ? this.distributedRateLimitGuard.getStats()
        : null,
    };
  }

  // ==================== Private Methods ====================

  private calculateHealthScore(
    aiDiagnosis: { breakpoints: unknown[] },
    errorStats: { critical: number; error: number; warning: number },
    aiMetrics: { successRate: number },
  ): number {
    let score = 100;

    // 扣分：AI 断点
    score -= aiDiagnosis.breakpoints.length * 5;

    // 扣分：错误
    score -= errorStats.critical * 10;
    score -= errorStats.error * 2;
    score -= Math.floor(errorStats.warning / 5);

    // 扣分：AI 成功率
    if (aiMetrics.successRate < 99) {
      score -= (99 - aiMetrics.successRate) * 2;
    }

    return Math.max(0, Math.min(100, Math.round(score)));
  }
}
