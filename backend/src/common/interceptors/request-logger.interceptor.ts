import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import { Request, Response } from "express";
import { StructuredLogger, logRequest } from "../utils/structured-logger";

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

          this.logger.error(
            `${method} ${path || url} ${statusCode}`,
            error,
            {
              requestId,
              userId,
              duration,
              method,
              path: path || url,
              statusCode,
            },
          );
        },
      }),
    );
  }

  /**
   * 判断是否跳过日志记录
   */
  private shouldSkipLog(path: string): boolean {
    const skipPaths = [
      "/health",
      "/api/v1/health",
      "/favicon.ico",
    ];
    return skipPaths.some((p) => path.startsWith(p));
  }
}
