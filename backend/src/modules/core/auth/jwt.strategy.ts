import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../../common/prisma/prisma.service";

/**
 * JWT 认证策略
 *
 * SECURITY: JWT_SECRET environment variable is REQUIRED
 * Never use a default secret in production - it would allow token forgery
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
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
  }

  async validate(payload: any) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        username: true,
        avatarUrl: true,
        bio: true,
        interests: {
          select: {
            tag: true,
          },
        },
        createdAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException("User not found");
    }

    // 转换interests为string数组
    return {
      ...user,
      interests: user.interests.map((i) => i.tag),
    };
  }
}
