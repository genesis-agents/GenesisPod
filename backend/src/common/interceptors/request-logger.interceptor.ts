import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Inject,
  Optional,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import { Request, Response } from "express";
import { StructuredLogger, logRequest } from "../utils/structured-logger";
import { MetricsService } from "../observability/metrics.service";

/**
 * 请求日志拦截器
 *
 * 自动记录所有 HTTP 请求的结构化日志，包括:
 * - 请求方法和路径
 * - 响应状态码
 * - 请求耗时
 * - 用户 ID (如果已认证)
 * - 请求 ID (如果存在)
 *
 * 使用方式:
 * ```typescript
 * // 全局启用
 * app.useGlobalInterceptors(new RequestLoggerInterceptor());
 *
 * // 或在模块中注册
 * @Module({
 *   providers: [
 *     { provide: APP_INTERCEPTOR, useClass: RequestLoggerInterceptor }
 *   ]
 * })
 * ```
 */
@Injectable()
export class RequestLoggerInterceptor implements NestInterceptor {
  private readonly logger = new StructuredLogger("HTTP");

  constructor(
    @Optional()
    @Inject(MetricsService)
    private readonly metricsService?: MetricsService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const startTime = Date.now();
    const { method, path, url } = request;
    const requestId = request.headers["x-request-id"] as string | undefined;
    const userId = (request as any).user?.id;

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          const statusCode = response.statusCode;

          // 记录 HTTP 指标（始终记录）
          this.recordHttpMetrics(method, path, statusCode, duration);

          // 跳过健康检查等高频低价值日志
          if (this.shouldSkipLog(path)) {
            return;
          }

          logRequest(this.logger, method, path || url, statusCode, duration, {
            requestId,
            userId,
          });
        },
        error: (error) => {
          const duration = Date.now() - startTime;
          const statusCode = error.status || 500;

          // 记录 HTTP 指标
          this.recordHttpMetrics(method, path, statusCode, duration);

          this.logger.error(`${method} ${path || url} ${statusCode}`, error, {
            requestId,
            userId,
            duration,
            method,
            path: path || url,
            statusCode,
          });
        },
      }),
    );
  }

  /**
   * 记录 HTTP 请求指标
   */
  private recordHttpMetrics(
    method: string,
    path: string,
    statusCode: number,
    duration: number,
  ): void {
    if (!this.metricsService) return;

    // 提取路由模式（移除动态参数）
    const routePattern = this.extractRoutePattern(path);

    // 记录请求延迟
    this.metricsService.recordHistogram("http_request_duration_ms", duration, {
      method,
      route: routePattern,
      status: String(statusCode),
    });

    // 记录请求计数
    this.metricsService.incrementCounter("http_requests_total", {
      method,
      route: routePattern,
      status: String(statusCode),
    });

    // 记录错误（4xx, 5xx）
    if (statusCode >= 400) {
      this.metricsService.incrementCounter("http_errors_total", {
        method,
        route: routePattern,
        status: String(statusCode),
        error_class: statusCode >= 500 ? "5xx" : "4xx",
      });
    }
  }

  /**
   * 提取路由模式（将动态参数替换为占位符）
   */
  private extractRoutePattern(path: string): string {
    // 移除查询参数
    const cleanPath = path.split("?")[0];

    // 替换 UUID 格式的 ID
    let pattern = cleanPath.replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      ":id",
    );

    // 替换纯数字 ID
    pattern = pattern.replace(/\/\d+(?=\/|$)/g, "/:id");

    // 替换 cuid 格式 (c开头的25位字符)
    pattern = pattern.replace(/\/c[a-z0-9]{24,25}(?=\/|$)/gi, "/:id");

    return pattern || "/";
  }

  /**
   * 判断是否跳过日志记录
   */
  private shouldSkipLog(path: string): boolean {
    const skipPaths = ["/health", "/api/v1/health", "/favicon.ico"];
    return skipPaths.some((p) => path.startsWith(p));
  }
}
