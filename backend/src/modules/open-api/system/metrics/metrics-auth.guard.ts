import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { timingSafeEqual } from "crypto";
import { Request } from "express";

/**
 * Guards the Prometheus /metrics endpoints, which are @Public() (no JWT) so
 * scrapers can reach them. Without this, model usage / request counts /
 * latency / error rates were exposed to anyone.
 *
 * Behaviour:
 * - METRICS_TOKEN set  -> require it via `Authorization: Bearer <token>` or
 *   `?token=<token>` (constant-time compare); otherwise 401.
 * - METRICS_TOKEN unset -> ALLOW but warn once. This keeps existing Prometheus
 *   setups working on deploy; set METRICS_TOKEN (and have scrapers send it) to
 *   actually restrict access. Network-level restriction at the ingress is the
 *   other recommended layer.
 */
@Injectable()
export class MetricsAuthGuard implements CanActivate {
  private readonly logger = new Logger(MetricsAuthGuard.name);
  private warnedUnconfigured = false;

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.configService.get<string>("METRICS_TOKEN");

    if (!expected) {
      if (!this.warnedUnconfigured) {
        this.logger.warn(
          "METRICS_TOKEN is not set — /metrics endpoints are publicly accessible. " +
            "Set METRICS_TOKEN (and have scrapers send it) to restrict access.",
        );
        this.warnedUnconfigured = true;
      }
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const provided = this.extractToken(request);
    if (provided && this.safeEqual(provided, expected)) {
      return true;
    }
    throw new UnauthorizedException("Invalid or missing metrics token");
  }

  private extractToken(request: Request): string | undefined {
    const authHeader = request.headers["authorization"];
    if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
      return authHeader.slice("Bearer ".length).trim();
    }
    const queryToken = request.query?.token;
    return typeof queryToken === "string" ? queryToken : undefined;
  }

  private safeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
      return false;
    }
    return timingSafeEqual(bufA, bufB);
  }
}
