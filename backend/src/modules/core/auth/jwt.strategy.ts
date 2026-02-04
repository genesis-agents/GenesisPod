import { Injectable, UnauthorizedException, Logger } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../../common/prisma/prisma.service";

/**
 * JWT 认证策略
 *
 * SECURITY: JWT_SECRET environment variable is REQUIRED
 * Never use a default secret in production - it would allow token forgery
 *
 * PERFORMANCE: 使用内存缓存避免每次请求都查询数据库
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  // ★ 用户缓存：避免每次请求都查数据库
  private userCache = new Map<
    string,
    { user: any; cachedAt: number; interests: string[] }
  >();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 分钟缓存

  constructor(
    configService: ConfigService,
    private prisma: PrismaService,
  ) {
    const jwtSecret = configService.get<string>("JWT_SECRET");

    // SECURITY: Fail fast if JWT_SECRET is not configured
    if (!jwtSecret) {
      const errorMessage =
        "CRITICAL SECURITY ERROR: JWT_SECRET environment variable is not set. " +
        "This is required for secure token generation and validation. " +
        "Set JWT_SECRET to a cryptographically secure random string (min 32 characters).";
      throw new Error(errorMessage);
    }

    // Warn if secret is too short (should be at least 32 characters)
    if (jwtSecret.length < 32) {
      console.warn(
        "⚠️ WARNING: JWT_SECRET is less than 32 characters. " +
          "For production security, use a longer secret (64+ characters recommended).",
      );
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });

    // 定期清理过期缓存
    setInterval(() => this.cleanupCache(), 60 * 1000);
  }

  async validate(payload: any) {
    const userId = payload.sub;

    // ★ 检查缓存
    const cached = this.userCache.get(userId);
    if (cached && Date.now() - cached.cachedAt < this.CACHE_TTL_MS) {
      return { ...cached.user, interests: cached.interests };
    }

    // ★ 缓存未命中，查询数据库（简化查询，不包含 interests）
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        avatarUrl: true,
        bio: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException("User not found");
    }

    // ★ interests 单独查询并缓存（大多数请求不需要）
    const interests = await this.prisma.userInterest
      .findMany({
        where: { userId },
        select: { tag: true },
      })
      .then((results) => results.map((i) => i.tag));

    // 存入缓存
    this.userCache.set(userId, {
      user,
      interests,
      cachedAt: Date.now(),
    });

    return { ...user, interests };
  }

  /**
   * 清除用户缓存（登出或用户信息变更时调用）
   */
  clearUserCache(userId: string) {
    this.userCache.delete(userId);
  }

  /**
   * 清理过期缓存
   */
  private cleanupCache() {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, value] of this.userCache.entries()) {
      if (now - value.cachedAt > this.CACHE_TTL_MS) {
        this.userCache.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      this.logger.debug(
        `[Cache] Cleaned ${cleaned} expired user cache entries`,
      );
    }
  }
}
