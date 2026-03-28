import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../../../common/prisma/prisma.service";

const LINK_HEALTH = {
  HEALTHY: "HEALTHY",
  BROKEN: "BROKEN",
  UNKNOWN: "UNKNOWN",
  ARCHIVED: "ARCHIVED",
} as const;

/**
 * 资源链接健康检查调度器
 * 定期通过 HTTP HEAD 请求检查资源 sourceUrl/pdfUrl 的可访问性
 */
@Injectable()
export class ResourceHealthCheckScheduler
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ResourceHealthCheckScheduler.name);
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;

  private readonly CHECK_INTERVAL_MS: number;
  private readonly BATCH_SIZE = 100;
  private readonly BATCH_DELAY_MS = 500;
  private readonly HEAD_TIMEOUT_MS = 15000;
  private readonly FAIL_THRESHOLD = 3;
  private readonly ARCHIVE_AFTER_DAYS = 30;
  private readonly RECHECK_AFTER_DAYS = 7;
  private readonly INITIAL_DELAY_MS = 10 * 60 * 1000; // 10 minutes

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const intervalHours = this.configService.get<number>(
      "RESOURCE_HEALTH_CHECK_INTERVAL_HOURS",
      6,
    );
    this.CHECK_INTERVAL_MS = intervalHours * 60 * 60 * 1000;
  }

  onModuleInit() {
    const enabled = this.configService.get<boolean>(
      "RESOURCE_HEALTH_CHECK_ENABLED",
      true,
    );

    if (enabled) {
      this.logger.log("Resource health check scheduler initialized");
      this.startScheduler();
    } else {
      this.logger.log(
        "Resource health check scheduler is disabled. Set RESOURCE_HEALTH_CHECK_ENABLED=true to enable.",
      );
    }
  }

  onModuleDestroy() {
    this.stopScheduler();
  }

  /**
   * 启动调度器
   */
  private startScheduler(): void {
    setTimeout(() => {
      void this.runHealthCheck();
    }, this.INITIAL_DELAY_MS).unref();

    this.intervalId = setInterval(() => {
      void this.runHealthCheck();
    }, this.CHECK_INTERVAL_MS).unref();

    this.logger.log(
      `Scheduler started: first check in 10 minutes, then every ${this.CHECK_INTERVAL_MS / 3600000}h`,
    );
  }

  /**
   * 停止调度器
   */
  private stopScheduler(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.logger.log("Scheduler stopped");
    }
  }

  /**
   * 主健康检查循环
   * 优先级：UNKNOWN → 7天未检查 → BROKEN（恢复检查）
   */
  async runHealthCheck(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn("Health check already in progress, skipping...");
      return;
    }

    this.isRunning = true;
    this.logger.log("Starting resource link health check...");

    try {
      // 先处理过期 BROKEN 资源的自动归档
      await this.archiveStaleResources();

      // 按优先级分批查询资源
      const now = new Date();
      const recheckThreshold = new Date(
        now.getTime() - this.RECHECK_AFTER_DAYS * 24 * 60 * 60 * 1000,
      );

      // 1. UNKNOWN 优先
      const unknownResources = await this.prisma.resource.findMany({
        where: {
          linkHealth: LINK_HEALTH.UNKNOWN,
          sourceUrl: { not: "" },
        },
        select: {
          id: true,
          sourceUrl: true,
          pdfUrl: true,
          linkHealth: true,
          linkCheckFailCount: true,
        },
        take: this.BATCH_SIZE,
      });

      // 2. 超过7天未检查的 HEALTHY
      const staleResources = await this.prisma.resource.findMany({
        where: {
          linkHealth: LINK_HEALTH.HEALTHY,
          OR: [
            { lastHealthCheckAt: null },
            { lastHealthCheckAt: { lt: recheckThreshold } },
          ],
          sourceUrl: { not: "" },
        },
        select: {
          id: true,
          sourceUrl: true,
          pdfUrl: true,
          linkHealth: true,
          linkCheckFailCount: true,
        },
        take: this.BATCH_SIZE,
        orderBy: { lastHealthCheckAt: "asc" },
      });

      // 3. BROKEN（恢复检查）
      const brokenResources = await this.prisma.resource.findMany({
        where: {
          linkHealth: LINK_HEALTH.BROKEN,
          sourceUrl: { not: "" },
        },
        select: {
          id: true,
          sourceUrl: true,
          pdfUrl: true,
          linkHealth: true,
          linkCheckFailCount: true,
        },
        take: this.BATCH_SIZE,
        orderBy: { lastHealthCheckAt: "asc" },
      });

      const allResources = [
        ...unknownResources,
        ...staleResources,
        ...brokenResources,
      ];

      if (allResources.length === 0) {
        this.logger.log("No resources to check at this time");
        return;
      }

      this.logger.log(
        `Checking ${allResources.length} resources (unknown: ${unknownResources.length}, stale: ${staleResources.length}, broken: ${brokenResources.length})`,
      );

      await this.checkBatch(allResources);

      this.logger.log("Resource link health check completed");
    } catch (error) {
      this.logger.error(`Health check run failed: ${(error as Error).message}`);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * 批量检查资源链接
   */
  private async checkBatch(
    resources: Array<{
      id: string;
      sourceUrl: string | null;
      pdfUrl: string | null;
      linkHealth: string | null;
      linkCheckFailCount: number;
    }>,
  ): Promise<void> {
    let checkedCount = 0;
    let healthyCount = 0;
    let brokenCount = 0;

    for (const resource of resources) {
      try {
        await this.checkSingleResource(resource);

        checkedCount++;
        if (resource.linkHealth === LINK_HEALTH.HEALTHY) {
          healthyCount++;
        } else if (resource.linkHealth === LINK_HEALTH.BROKEN) {
          brokenCount++;
        }
      } catch (error) {
        this.logger.error(
          `Failed to check resource ${resource.id}: ${(error as Error).message}`,
        );
      }

      await this.sleep(this.BATCH_DELAY_MS);
    }

    this.logger.log(
      `Batch complete: ${checkedCount} checked, ${healthyCount} healthy, ${brokenCount} broken`,
    );
  }

  /**
   * 检查单个资源的链接可访问性
   */
  private async checkSingleResource(resource: {
    id: string;
    sourceUrl: string | null;
    pdfUrl: string | null;
    linkHealth: string | null;
    linkCheckFailCount: number;
  }): Promise<void> {
    const urlsToCheck: string[] = [];

    if (resource.sourceUrl) {
      urlsToCheck.push(resource.sourceUrl);
    }
    if (resource.pdfUrl) {
      urlsToCheck.push(resource.pdfUrl);
    }

    if (urlsToCheck.length === 0) {
      return;
    }

    // 任意一个 URL 可达即认为健康
    let isHealthy = false;
    for (const url of urlsToCheck) {
      const ok = await this.checkUrl(url);
      if (ok) {
        isHealthy = true;
        break;
      }
    }

    await this.updateResourceHealth(resource, isHealthy);
  }

  /**
   * 更新资源健康状态到数据库
   */
  private async updateResourceHealth(
    resource: {
      id: string;
      linkHealth: string | null;
      linkCheckFailCount: number;
    },
    isHealthy: boolean,
  ): Promise<void> {
    const now = new Date();

    if (isHealthy) {
      // 恢复健康：重置失败计数
      const wasRecovered = resource.linkHealth === LINK_HEALTH.BROKEN;
      await this.prisma.resource.update({
        where: { id: resource.id },
        data: {
          linkHealth: LINK_HEALTH.HEALTHY,
          lastHealthCheckAt: now,
          linkCheckFailCount: 0,
        },
      });
      if (wasRecovered) {
        this.logger.log(`Resource ${resource.id} recovered: BROKEN -> HEALTHY`);
      }
    } else {
      // 失败：递增失败计数，超过阈值标记为 BROKEN
      const newFailCount = resource.linkCheckFailCount + 1;
      const newHealth =
        newFailCount >= this.FAIL_THRESHOLD
          ? LINK_HEALTH.BROKEN
          : (resource.linkHealth ?? LINK_HEALTH.UNKNOWN);

      const becameBroken =
        newHealth === LINK_HEALTH.BROKEN &&
        resource.linkHealth !== LINK_HEALTH.BROKEN;

      await this.prisma.resource.update({
        where: { id: resource.id },
        data: {
          linkHealth: newHealth,
          lastHealthCheckAt: now,
          linkCheckFailCount: newFailCount,
        },
      });

      if (becameBroken) {
        this.logger.warn(
          `Resource ${resource.id} marked BROKEN after ${newFailCount} failures`,
        );
      }
    }
  }

  /**
   * 将长时间 BROKEN 且无关联内容的资源自动归档
   */
  private async archiveStaleResources(): Promise<void> {
    const archiveThreshold = new Date(
      Date.now() - this.ARCHIVE_AFTER_DAYS * 24 * 60 * 60 * 1000,
    );

    // 查找 BROKEN 超过30天、且没有 notes/comments 的资源
    const staleResources = await this.prisma.resource.findMany({
      where: {
        linkHealth: LINK_HEALTH.BROKEN,
        lastHealthCheckAt: { lt: archiveThreshold },
        notes: { none: {} },
        comments: { none: {} },
      },
      select: { id: true },
      take: 200,
    });

    if (staleResources.length === 0) {
      return;
    }

    const ids = staleResources.map((r) => r.id);

    await this.prisma.resource.updateMany({
      where: { id: { in: ids } },
      data: { linkHealth: LINK_HEALTH.ARCHIVED },
    });

    this.logger.log(
      `Archived ${staleResources.length} stale broken resources (broken >30d, no notes/comments)`,
    );
  }

  /**
   * 发送 HTTP HEAD 请求检查 URL 可达性
   * 回退策略：HEAD 被拒绝时尝试 GET Range
   */
  private async checkUrl(url: string): Promise<boolean> {
    try {
      const axios = (await import("axios")).default;
      const response = await axios.head(url, {
        timeout: this.HEAD_TIMEOUT_MS,
        maxRedirects: 5,
        validateStatus: (status) => status < 400,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          Accept: "*/*",
        },
      });
      return response.status < 400;
    } catch {
      // 部分服务器拒绝 HEAD，回退到 GET Range
      try {
        const axios = (await import("axios")).default;
        await axios.get(url, {
          timeout: this.HEAD_TIMEOUT_MS,
          maxRedirects: 5,
          validateStatus: (status) => status < 400,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            Range: "bytes=0-0",
          },
        });
        return true;
      } catch {
        return false;
      }
    }
  }

  /**
   * 辅助：延时
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
