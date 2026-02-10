import { Controller, Get } from "@nestjs/common";
import { AppService } from "./app.service";
import { Public } from "./common/decorators/public.decorator";
import { PrismaService } from "./common/prisma/prisma.service";
import { CacheService } from "./common/cache/cache.service";

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
      service: "Raven AI Engine Backend",
      version: "1.0.0",
      checks,
    };
  }
}
