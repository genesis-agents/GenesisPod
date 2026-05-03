import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { GoogleStrategy } from "./strategies/google.strategy";
import { PrismaModule } from "../../../common/prisma/prisma.module";

/**
 * 认证模块
 */
@Module({
  imports: [
    PrismaModule,
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const jwtSecret = configService.get<string>("JWT_SECRET");
        if (!jwtSecret) {
          throw new Error(
            "JWT_SECRET environment variable is required but not set. " +
              "Set it in your .env file or environment configuration.",
          );
        }
        return {
          secret: jwtSecret,
          signOptions: {
            expiresIn: configService.get<string>("JWT_EXPIRES_IN", "7d"),
          },
        };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, GoogleStrategy],
  exports: [AuthService, PassportModule, JwtModule],
})
export class AuthModule {}
