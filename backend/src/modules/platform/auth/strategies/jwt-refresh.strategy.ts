import { Injectable, UnauthorizedException, Logger } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { ConfigService } from "@nestjs/config";
import { CacheService } from "../../../../common/cache/cache.service";
import { BLOCKLIST_PREFIX } from "./jwt.strategy";

/**
 * JWT Refresh 认证策略（passport 名称 "jwt-refresh"）
 *
 * SECURITY — 双令牌隔离：
 *   refresh token 用 REFRESH_TOKEN_SECRET 签名（见 AuthService.generateTokens），
 *   与 access token 的 JWT_SECRET 隔离。`/auth/refresh` 端点必须用本策略校验，
 *   而不是复用 access 的 AuthGuard("jwt") —— 否则用 access token 也能换新令牌对，
 *   短时 access token 泄露即可无限续命（双令牌模型坍塌）。本策略只接受用
 *   refresh 密钥签名的 token，access token 会因签名不符被拒。
 *
 * 密钥解析与签发端严格一致：
 *   REFRESH_TOKEN_SECRET，未配置时回落到 `${JWT_SECRET}-refresh`。
 */
@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  "jwt-refresh",
) {
  private readonly logger: Logger;

  constructor(
    configService: ConfigService,
    private readonly cacheService: CacheService,
  ) {
    const jwtSecret = configService.get<string>("JWT_SECRET");
    const refreshSecret =
      configService.get<string>("REFRESH_TOKEN_SECRET") ||
      (jwtSecret ? `${jwtSecret}-refresh` : undefined);

    // SECURITY: fail fast if no refresh secret can be resolved.
    if (!refreshSecret) {
      throw new Error(
        "CRITICAL SECURITY ERROR: neither REFRESH_TOKEN_SECRET nor JWT_SECRET " +
          "is set. A dedicated refresh-token secret is required to validate " +
          "refresh tokens independently of access tokens.",
      );
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: refreshSecret,
    });

    this.logger = new Logger(JwtRefreshStrategy.name);

    if (refreshSecret.length < 32) {
      this.logger.warn(
        "WARNING: refresh-token secret is less than 32 characters. " +
          "For production security, use a longer secret (64+ characters recommended).",
      );
    }
  }

  /**
   * 校验 refresh token。签名由 passport-jwt 用 refresh 密钥验证（access token
   * 到这里会因签名不符被拒）；本方法额外复用 access 侧的 Redis 黑名单，确保被
   * 禁用/删除的用户无法靠 refresh token 续命。
   */
  async validate(payload: { sub: string; email: string; username: string }) {
    const userId = payload.sub;

    // 复用 access 侧黑名单语义（含 cache 故障时 fail-open，避免 Redis 抖动锁死刷新）。
    let isBlocked: string | null | undefined = null;
    try {
      isBlocked = await this.cacheService.get<string>(
        `${BLOCKLIST_PREFIX}${userId}`,
      );
    } catch (err) {
      this.logger.warn(
        `[jwt-refresh-validate] blocklist check failed for user=${userId} — fail-open: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    if (isBlocked) {
      throw new UnauthorizedException("User account is disabled");
    }

    return {
      id: userId,
      email: payload.email,
      username: payload.username,
    };
  }
}
