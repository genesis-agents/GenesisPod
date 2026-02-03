import { Injectable, NestMiddleware, Logger } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import { ConfigService } from "@nestjs/config";
import { RequestContext } from "./request-context";
import * as jwt from "jsonwebtoken";

/**
 * RequestContext 中间件
 *
 * 对所有请求尝试从 Authorization header 验证 JWT 并提取 userId，
 * 用 RequestContext.run({ userId }) 包裹后续处理，供 BYOK Key 优先级解析使用。
 *
 * 失败时 userId 为 undefined，不影响请求（Guards 负责认证拦截）。
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RequestContextMiddleware.name);
  private jwtSecret: string | undefined;

  constructor(private readonly configService: ConfigService) {
    this.jwtSecret = this.configService.get<string>("JWT_SECRET");
    if (!this.jwtSecret) {
      this.logger.warn(
        "JWT_SECRET not configured, RequestContext userId will always be undefined",
      );
    }
  }

  use(req: Request, _res: Response, next: NextFunction): void {
    let userId: string | undefined;

    try {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith("Bearer ") && this.jwtSecret) {
        const token = authHeader.slice(7);
        const payload = jwt.verify(token, this.jwtSecret) as any;
        userId = payload?.sub;
      }
    } catch {
      // Token invalid/expired - userId stays undefined, no error
    }

    RequestContext.run({ userId }, () => next());
  }
}
