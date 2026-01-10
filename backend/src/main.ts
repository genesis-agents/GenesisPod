import { NestFactory } from "@nestjs/core";
import { ValidationPipe, LogLevel } from "@nestjs/common";
import helmet from "helmet";
import { Request, Response, NextFunction } from "express";
import * as express from "express";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { isWorkspaceAiV2Enabled } from "./common/utils/feature-flags";
import { setupSwagger } from "./common/config/swagger.config";
import { RequestLoggerInterceptor } from "./common/interceptors/request-logger.interceptor";

/**
 * 验证必需的环境变量
 * 启动时检查，缺失则拒绝启动
 */
function validateEnvConfig(): void {
  const required: string[] = ["DATABASE_URL", "JWT_SECRET"];
  const recommended: string[] = [
    "ADMIN_EMAILS",
    "STORAGE_ADMIN_KEY",
    "FRONTEND_URL",
  ];

  const missing = required.filter((key) => !process.env[key]);
  const missingRecommended = recommended.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error("❌ Missing required environment variables:");
    missing.forEach((key) => console.error(`   - ${key}`));
    console.error(
      "\nPlease set these variables before starting the application.",
    );
    process.exit(1);
  }

  if (missingRecommended.length > 0) {
    console.warn("⚠️  Missing recommended environment variables:");
    missingRecommended.forEach((key) => console.warn(`   - ${key}`));
    console.warn("   These should be set in production.\n");
  }

  // JWT_SECRET 指纹验证 (帮助调试跨部署的一致性问题)
  const jwtSecret = process.env.JWT_SECRET || "";
  const secretFingerprint = require("crypto")
    .createHash("sha256")
    .update(jwtSecret)
    .digest("hex")
    .substring(0, 8);
  console.log(`🔐 JWT_SECRET fingerprint: ${secretFingerprint}`);
  console.log(
    `🌐 FRONTEND_URL: ${process.env.FRONTEND_URL || "(not set - using default)"}`,
  );

  console.log("✅ Environment configuration validated");
}

async function bootstrap() {
  // 验证环境配置
  validateEnvConfig();
  // 根据环境配置日志级别 - 生产环境只输出警告和错误
  const isProduction = process.env.NODE_ENV === "production";
  const logLevels: LogLevel[] = isProduction
    ? ["error", "warn"]
    : ["error", "warn", "log", "debug", "verbose"];

  const app = await NestFactory.create(AppModule, {
    logger: logLevels,
  });

  // 为企业微信回调配置 raw body 解析（必须在 json 解析之前）
  app.use(
    "/api/v1/wechat-work/callback",
    express.text({ type: "text/xml", limit: "1mb" }),
  );

  // 增加请求体大小限制，支持大型字幕数据
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // 启用安全头 (Helmet) - 但对代理路由禁用CSP
  app.use((req: Request, res: Response, next: NextFunction) => {
    // 对代理路由禁用CSP和X-Frame-Options
    if (req.path.startsWith("/api/v1/proxy/")) {
      helmet({
        contentSecurityPolicy: false, // 完全禁用CSP
        frameguard: false, // 禁用X-Frame-Options
        crossOriginEmbedderPolicy: false,
      })(req, res, next);
    } else {
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
            frameSrc: ["'self'", "http://localhost:*"], // 允许localhost的iframe
            frameAncestors: ["'self'", "http://localhost:*"], // 允许被localhost的页面嵌入
            upgradeInsecureRequests: null, // 开发环境禁用HTTPS升级
          },
        },
        crossOriginEmbedderPolicy: false, // 允许跨域资源嵌入
        frameguard: false, // 禁用X-Frame-Options
      })(req, res, next);
    }
  });

  // 启用CORS - 支持开发和生产环境
  const allowedOrigins = process.env.CORS_ORIGINS?.split(",") || [];
  app.enableCors({
    origin: (origin, callback) => {
      // 允许所有localhost端口（开发环境）
      const isLocalhost =
        !origin ||
        origin.match(/^http:\/\/localhost:\d+$/) ||
        origin.match(/^http:\/\/127\.0\.0\.1:\d+$/) ||
        origin.match(/^http:\/\/\[::1\]:\d+$/);

      // 允许Railway域名（生产环境）
      const isRailway = origin?.includes(".railway.app");

      // 允许配置的域名
      const isAllowed = allowedOrigins.some((allowed) =>
        origin?.includes(allowed),
      );

      if (isLocalhost || isRailway || isAllowed) {
        callback(null, true);
      } else {
        console.error("CORS rejected origin:", origin);
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  });

  // 启用全局验证管道
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // 启用全局异常过滤器（统一处理所有异常，包括Prisma错误）
  app.useGlobalFilters(new AllExceptionsFilter());

  // 启用请求日志拦截器（生产环境使用结构化日志）
  if (isProduction) {
    app.useGlobalInterceptors(new RequestLoggerInterceptor());
  }

  // 添加根路径健康检查（供Railway healthcheck使用，不受全局前缀影响）
  const httpAdapter = app.getHttpAdapter();
  httpAdapter.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      service: "DeepDive Backend",
      version: "1.0.0",
    });
  });

  // API前缀
  app.setGlobalPrefix("api/v1");

  // 设置 Swagger API 文档（仅开发环境）
  if (!isProduction) {
    await setupSwagger(app);
  }

  // Railway uses PORT, fallback to BACKEND_PORT for local dev
  const port = process.env.PORT || process.env.BACKEND_PORT || 4000;
  await app.listen(port);

  // 根据环境显示正确的 URL
  const baseUrl = isProduction
    ? process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : process.env.FRONTEND_URL || `http://0.0.0.0:${port}`
    : `http://localhost:${port}`;

  // 生产环境精简启动日志，开发环境详细输出
  if (isProduction) {
    console.log(`🚀 DeepDive Backend started | ${baseUrl} | Port: ${port}`);
  } else {
    console.log(`🚀 DeepDive Backend running on ${baseUrl}`);
    console.log(`📚 API Docs: ${baseUrl}/api/docs`);
    console.log(`🧩 Workspace AI v2 enabled: ${isWorkspaceAiV2Enabled()}`);
    console.log(`📋 Log level: all (development)`);
  }
}

void bootstrap();
