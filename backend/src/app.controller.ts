import { Controller, Get } from "@nestjs/common";
import { AppService } from "./app.service";
import { Public } from "./common/decorators/public.decorator";
import { PrismaService } from "./common/prisma/prisma.service";
import { CacheService } from "./common/cache/cache.service";
import { APP_CONFIG } from "./common/config/app.config";

@Public()
@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

  @Get()
  getHello() {
    return this.appService.getHello();
  }

  @Get("health")
  async getHealth() {
    const checks: Record<
      string,
      { status: "healthy" | "unhealthy"; latency?: number; message?: string }
    > = {};

    // Database check
    checks.database = await this.prisma.healthCheck();

    // Cache check
    const cacheStart = Date.now();
    try {
      const testKey = "__health_check__";
      await this.cacheService.set(testKey, "ok", 10);
      const val = await this.cacheService.get<string>(testKey);
      checks.cache = {
        status: val === "ok" ? "healthy" : "unhealthy",
        latency: Date.now() - cacheStart,
      };
    } catch {
      checks.cache = {
        status: "unhealthy",
        latency: Date.now() - cacheStart,
        message: "Cache unavailable",
      };
    }

    const allHealthy = Object.values(checks).every(
      (c) => c.status === "healthy",
    );

    return {
      status: allHealthy ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      service: `${APP_CONFIG.brand.fullName} Backend`,
      version: "1.0.0",
      // Build marker — Railway 部署完成后这两个值会变，用来快速验证生产线是否拉到了某个 commit
      buildSha:
        process.env.RAILWAY_GIT_COMMIT_SHA ??
        process.env.GIT_COMMIT_SHA ??
        process.env.SOURCE_COMMIT ??
        "unknown",
      buildTime: process.env.RAILWAY_DEPLOYMENT_ID ?? "unknown",
      // Marker tag — 改这个值就能在生产侧确认"这一份代码到了"
      buildMarker: "20260426-byok-modelconfig-fix",
      checks,
    };
  }
}
