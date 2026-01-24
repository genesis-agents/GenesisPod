import {
  Controller,
  Post,
  Body,
  Get,
  Patch,
  UseGuards,
  Request,
  Response,
  Logger,
  HttpCode,
} from "@nestjs/common";
import {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from "express";
import { AuthGuard } from "@nestjs/passport";
import { ConfigService } from "@nestjs/config";
import { Throttle } from "@nestjs/throttler";
import { AuthService } from "./auth.service";
import { UpdateProfileDto } from "./dto/update-profile.dto";

/**
 * Auth rate limit configuration
 * Protects against brute force attacks on login/register endpoints
 */
const AUTH_RATE_LIMIT = { default: { limit: 5, ttl: 60000 } }; // 5 requests per minute
const REFRESH_RATE_LIMIT = { default: { limit: 10, ttl: 60000 } }; // 10 requests per minute

/**
 * 认证控制器
 */
@Controller("auth")
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  private readonly adminEmails: string[];

  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) {
    const emails = this.configService.get<string>("ADMIN_EMAILS", "");
    this.adminEmails = emails
      .split(",")
      .map((e) => e.trim())
      .filter((e) => e.length > 0);
  }

  /**
   * 用户注册
   * POST /api/v1/auth/register
   * Rate limited: 5 requests per minute to prevent abuse
   */
  @Post("register")
  @HttpCode(201)
  @Throttle(AUTH_RATE_LIMIT)
  async register(
    @Body("email") email: string,
    @Body("username") username: string,
    @Body("password") password: string,
  ) {
    this.logger.log(`Registration attempt: ${email}`);
    return this.authService.register(email, username, password);
  }

  /**
   * 用户登录
   * POST /api/v1/auth/login
   * Rate limited: 5 requests per minute to prevent brute force attacks
   */
  @Post("login")
  @HttpCode(200)
  @Throttle(AUTH_RATE_LIMIT)
  async login(
    @Request() req: ExpressRequest,
    @Body("email") email: string,
    @Body("password") password: string,
  ) {
    this.logger.log(`Login attempt: ${email}`);

    // 获取请求信息用于记录登录历史
    const requestInfo = {
      ipAddress:
        req.headers["x-forwarded-for"]?.toString().split(",")[0] ||
        req.ip ||
        (req as any).connection?.remoteAddress,
      userAgent: req.headers["user-agent"],
    };

    return this.authService.login(email, password, requestInfo);
  }

  /**
   * 刷新 token
   * POST /api/v1/auth/refresh
   * Rate limited: 10 requests per minute
   */
  @Post("refresh")
  @HttpCode(200)
  @Throttle(REFRESH_RATE_LIMIT)
  @UseGuards(AuthGuard("jwt"))
  async refresh(@Request() req: { user: { id: string } }) {
    return this.authService.refreshToken(req.user.id);
  }

  /**
   * 获取当前用户信息
   * GET /api/v1/auth/me
   */
  @Get("me")
  @UseGuards(AuthGuard("jwt"))
  getProfile(@Request() req: { user: { email?: string; role?: string } }) {
    const user = req.user;
    // Check admin status: role === 'ADMIN' OR email in ADMIN_EMAILS
    const isAdmin =
      user.role === "ADMIN" ||
      (user.email &&
        this.adminEmails.some(
          (email) => email.toLowerCase() === user.email?.toLowerCase(),
        ));
    return { ...user, isAdmin };
  }

  /**
   * Google OAuth 登录
   * GET /api/v1/auth/google
   */
  @Get("google")
  @UseGuards(AuthGuard("google"))
  async googleAuth() {
    // Guard redirects to Google
  }

  /**
   * Google OAuth 回调
   * GET /api/v1/auth/google/callback
   */
  @Get("google/callback")
  @UseGuards(AuthGuard("google"))
  async googleAuthCallback(
    @Request() req: ExpressRequest & { user: any },
    @Response() res: ExpressResponse,
  ) {
    // 成功认证后，返回用户信息和tokens
    const { user, accessToken, refreshToken } = req.user;

    this.logger.log(`Google OAuth callback for user: ${user.email}`);

    // 生成短期授权码
    const authCode = this.authService.generateAuthCode(
      accessToken,
      refreshToken,
      user.id,
    );

    // 重定向到前端，只携带授权码
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const redirectUrl = `${frontendUrl}/auth/callback?code=${authCode}`;

    return res.redirect(redirectUrl);
  }

  /**
   * 用授权码换取 token
   * POST /api/v1/auth/exchange
   * Rate limited: 5 requests per minute
   */
  @Post("exchange")
  @HttpCode(200)
  @Throttle(AUTH_RATE_LIMIT)
  async exchangeAuthCode(@Body("code") code: string) {
    this.logger.log(
      `Token exchange request with code: ${code.substring(0, 8)}...`,
    );
    return this.authService.exchangeAuthCode(code);
  }

  /**
   * 更新用户个人信息
   * PATCH /api/v1/auth/profile
   */
  @Patch("profile")
  @UseGuards(AuthGuard("jwt"))
  async updateProfile(
    @Request() req: { user: { id: string } },
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    this.logger.log(`Profile update request for user: ${req.user.id}`);
    return this.authService.updateProfile(req.user.id, updateProfileDto);
  }

  /**
   * 获取用户统计数据
   * GET /api/v1/auth/stats
   */
  @Get("stats")
  @UseGuards(AuthGuard("jwt"))
  async getUserStats(@Request() req: { user: { id: string } }) {
    this.logger.log(`Stats request for user: ${req.user.id}`);
    return this.authService.getUserStats(req.user.id);
  }
}
