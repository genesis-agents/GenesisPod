import { Injectable, UnauthorizedException, Logger } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { ConfigService } from "@nestjs/config";

/**
 * JWT 认证策略
 *
 * SECURITY: JWT_SECRET environment variable is REQUIRED
 * Never use a default secret in production - it would allow token forgery
 *
 * PERFORMANCE: 不查询数据库，直接返回 JWT payload
 * - 用户信息由业务层按需获取（通过 UserService）
 * - 用户禁用/删除通过黑名单机制处理
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger: Logger;

  // ★ 被禁用/删除用户黑名单（O(1) 查询）
  private readonly blockedUsers = new Set<string>();

  constructor(configService: ConfigService) {
    const jwtSecret = configService.get<string>("JWT_SECRET");

    // SECURITY: Fail fast if JWT_SECRET is not configured
    if (!jwtSecret) {
      const errorMessage =
        "CRITICAL SECURITY ERROR: JWT_SECRET environment variable is not set. " +
        "This is required for secure token generation and validation. " +
        "Set JWT_SECRET to a cryptographically secure random string (min 32 characters).";
      throw new Error(errorMessage);
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });

    // Initialize logger after super()
    this.logger = new Logger(JwtStrategy.name);

    // Warn if secret is too short (should be at least 32 characters)
    if (jwtSecret.length < 32) {
      this.logger.warn(
        "⚠️ WARNING: JWT_SECRET is less than 32 characters. " +
          "For production security, use a longer secret (64+ characters recommended).",
      );
    }
  }

  /**
   * JWT 验证 - 只返回 payload，不查数据库
   *
   * @performance O(1) - 只检查黑名单，无数据库查询
   * @security 通过黑名单机制处理被禁用/删除的用户
   */
  async validate(payload: any) {
    const userId = payload.sub;

    // ★ 检查黑名单（被禁用/删除的用户）
    if (this.blockedUsers.has(userId)) {
      throw new UnauthorizedException("User account is disabled");
    }

    // ★ 直接返回 JWT payload 中的信息，不查数据库
    return {
      id: userId,
      email: payload.email,
      username: payload.username,
    };
  }

  /**
   * 将用户加入黑名单（禁用/删除用户时调用）
   */
  blockUser(userId: string) {
    this.blockedUsers.add(userId);
    this.logger.log(`User ${userId} added to blocklist`);
  }

  /**
   * 将用户从黑名单移除（恢复用户时调用）
   */
  unblockUser(userId: string) {
    this.blockedUsers.delete(userId);
    this.logger.log(`User ${userId} removed from blocklist`);
  }

  /**
   * 检查用户是否在黑名单中
   */
  isUserBlocked(userId: string): boolean {
    return this.blockedUsers.has(userId);
  }
}
