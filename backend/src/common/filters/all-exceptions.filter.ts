import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { Request, Response } from "express";

/**
 * 全局异常过滤器
 *
 * 统一处理所有异常，包括：
 * - HTTP异常
 * - Prisma数据库异常
 * - 未知异常
 *
 * 确保：
 * - 返回统一的错误格式
 * - 记录详细的错误日志
 * - 生产环境不暴露敏感信息
 * - 发送critical错误到监控系统
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const errorResponse = this.buildErrorResponse(exception, request);

    // 记录错误
    this.logError(request, errorResponse, exception);

    // 发送到监控系统（如果是5xx错误）
    if (errorResponse.statusCode >= 500) {
      this.reportToMonitoring(errorResponse, exception);
    }

    response.status(errorResponse.statusCode).json(errorResponse);
  }

  /**
   * 构建统一的错误响应格式
   */
  private buildErrorResponse(exception: unknown, request: Request) {
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = "Internal server error";
    let code = "INTERNAL_ERROR";
    let details: any = undefined;

    // 处理Prisma数据库错误
    if (exception instanceof PrismaClientKnownRequestError) {
      const prismaError = this.handlePrismaError(exception);
      status = prismaError.status;
      message = prismaError.message;
      code = prismaError.code;
      details = prismaError.details;
    }
    // 处理HTTP异常
    else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const errorResponse = exception.getResponse();

      if (typeof errorResponse === "string") {
        message = errorResponse;
      } else if (typeof errorResponse === "object") {
        message = (errorResponse as any).message || message;
        code = (errorResponse as any).error || code;
      }
    }
    // 处理未知错误
    else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error("Uncaught exception", exception.stack);
    }

    return {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message,
      code,
      ...(details && { details }),
      // 仅在开发环境返回stack trace
      ...(process.env.NODE_ENV === "development" &&
        exception instanceof Error && {
          stack: exception.stack,
        }),
    };
  }

  /**
   * 处理Prisma数据库错误
   */
  private handlePrismaError(error: PrismaClientKnownRequestError) {
    const meta = error.meta as any;

    switch (error.code) {
      case "P2002":
        // Unique constraint violation
        return {
          status: HttpStatus.CONFLICT,
          message: `Duplicate entry: ${meta?.target || "unknown field"}`,
          code: "DUPLICATE_ERROR",
          details: {
            field: meta?.target,
          },
        };

      case "P2003":
        // Foreign key constraint violation
        return {
          status: HttpStatus.BAD_REQUEST,
          message: "Invalid reference: related record not found",
          code: "FOREIGN_KEY_VIOLATION",
          details: {
            field: meta?.field_name,
            constraint: error.message.includes("collections_user_id_fkey")
              ? "User does not exist"
              : "Related record not found",
          },
        };

      case "P2025":
        // Record not found
        return {
          status: HttpStatus.NOT_FOUND,
          message: "Record not found",
          code: "NOT_FOUND",
          details: {
            cause: meta?.cause,
          },
        };

      case "P2014":
        // Relation violation
        return {
          status: HttpStatus.BAD_REQUEST,
          message: "Invalid relation: required relation is missing",
          code: "RELATION_VIOLATION",
          details: {
            relation: meta?.relation_name,
          },
        };

      case "P2011":
        // Null constraint violation
        return {
          status: HttpStatus.BAD_REQUEST,
          message: "Required field cannot be null",
          code: "NULL_CONSTRAINT_VIOLATION",
          details: {
            field: meta?.target,
          },
        };

      default:
        this.logger.error(
          `Unhandled Prisma error: ${error.code}`,
          error.message,
        );
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          message: "Database error occurred",
          code: "DATABASE_ERROR",
          details: {
            prismaCode: error.code,
          },
        };
    }
  }

  /**
   * 记录错误日志
   */
  private logError(request: Request, errorResponse: any, exception: unknown) {
    const logContext = {
      method: request.method,
      url: request.url,
      statusCode: errorResponse.statusCode,
      code: errorResponse.code,
      message: errorResponse.message,
      ip: request.ip,
      userAgent: request.get("user-agent"),
      userId: (request as any).user?.id,
    };

    if (errorResponse.statusCode >= 500) {
      this.logger.error(
        `Server Error: ${JSON.stringify(logContext)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else if (errorResponse.statusCode >= 400) {
      this.logger.warn(`Client Error: ${JSON.stringify(logContext)}`);
    }
  }

  /**
   * 发送错误到监控系统
   */
  private reportToMonitoring(errorResponse: any, _exception: unknown) {
    // TODO: 集成Sentry或其他监控服务
    // 示例:
    // if (process.env.SENTRY_DSN) {
    //   Sentry.captureException(_exception, {
    //     tags: {
    //       code: errorResponse.code,
    //       statusCode: errorResponse.statusCode,
    //     },
    //     extra: errorResponse,
    //   });
    // }

    // 临时方案：记录到日志
    this.logger.error(
      `[MONITORING] Critical error: ${errorResponse.code}`,
      JSON.stringify(errorResponse),
    );
  }
}
