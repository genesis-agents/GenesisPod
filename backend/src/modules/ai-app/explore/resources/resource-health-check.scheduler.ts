import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../../../common/prisma/prisma.service";

import { LINK_HEALTH } from "./link-health.constants";

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
]);

function isYoutubeUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    return YOUTUBE_HOSTS.has(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

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
  // YouTube 删除/私有信号确定（oEmbed 401/404），单次失败即可定性，无需 3 次冗余确认
  private readonly YOUTUBE_FAIL_THRESHOLD = 1;
  private readonly ARCHIVE_AFTER_DAYS = 30;
  private readonly RECHECK_AFTER_DAYS = 7;
  // 新入库 YouTube 资源在 24h 内强制回查一次，捕获"刚发不久就被删/审核下架"
  private readonly YOUTUBE_RECHECK_NEW_HOURS = 24;
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

      // 0. 新入库 24h 内未检查的 YouTube（最高优先级 — 捕获"刚发不久就被删"）
      const youtubeRecheckThreshold = new Date(
        now.getTime() - this.YOUTUBE_RECHECK_NEW_HOURS * 60 * 60 * 1000,
      );
      const newYoutubeResources = await this.prisma.resource.findMany({
        where: {
          createdAt: { gt: youtubeRecheckThreshold },
          lastHealthCheckAt: null,
          sourceUrl: {
            contains: "youtube.com",
          },
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

      // 1. UNKNOWN 优先
      const unknownResources = await this.prisma.resource.findMany({
        where: {
          linkHealth: LINK_HEALTH.UNKNOWN,
          sourceUrl: { not: "" },
          // 排除上面已选取的新 YouTube，避免重复检查
          NOT: { id: { in: newYoutubeResources.map((r) => r.id) } },
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
        ...newYoutubeResources,
        ...unknownResources,
        ...staleResources,
        ...brokenResources,
      ];

      if (allResources.length === 0) {
        this.logger.log("No resources to check at this time");
        return;
      }

      this.logger.log(
        `Checking ${allResources.length} resources (newYoutube: ${newYoutubeResources.length}, unknown: ${unknownResources.length}, stale: ${staleResources.length}, broken: ${brokenResources.length})`,
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
      const ok = await this.checkUrlSmart(url);
      if (ok) {
        isHealthy = true;
        break;
      }
    }

    await this.updateResourceHealth(resource, isHealthy);
  }

  /**
   * 智能 URL 检查：按 host 选择策略。
   * - YouTube 视频（youtube.com/watch?v= / youtu.be）：页面 200 不代表视频活，
   *   走 oEmbed API（https://www.youtube.com/oembed?url=...）— 视频删除返回 404
   * - 其他：走原有的 HTTP HEAD/GET Range 检查
   */
  private async checkUrlSmart(url: string): Promise<boolean> {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      if (
        host === "youtube.com" ||
        host === "www.youtube.com" ||
        host === "m.youtube.com" ||
        host === "youtu.be"
      ) {
        return await this.checkYoutubeUrl(url);
      }
    } catch {
      // 非法 URL 交给 HEAD 检查
    }
    return this.checkUrl(url);
  }

  /**
   * 走 YouTube oEmbed 判断视频是否还存在
   * https://www.youtube.com/oembed?url={}&format=json
   *
   * 状态码解读：
   * - 200 → 视频还在，HEALTHY
   * - 401 → 视频被设为私有，BROKEN
   * - 404 → 视频已删除，BROKEN
   * - 429 / 503 / 网络超时 → 临时故障，保守返回 true（不递增失败计数），
   *   避免 YouTube 限流 / 出口 IP 被封导致批量误标 BROKEN
   */
  private async checkYoutubeUrl(url: string): Promise<boolean> {
    try {
      const axios = (await import("axios")).default;
      const res = await axios.get(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
        {
          timeout: this.HEAD_TIMEOUT_MS,
          validateStatus: () => true,
        },
      );
      if (res.status === 200) return true;
      if (res.status === 401 || res.status === 404) {
        this.logger.debug(
          `[youtube oembed] ${res.status} for ${url} → deleted/private`,
        );
        return false;
      }
      // 其他状态码（429 限流 / 5xx 服务端 / 403 地域限制）保守视为临时故障
      this.logger.warn(
        `[youtube oembed] ambiguous status ${res.status} for ${url}, treating as healthy`,
      );
      return true;
    } catch (error) {
      // 网络超时 / DNS 等也保守返回 true
      this.logger.warn(
        `[youtube oembed] network error for ${url}: ${(error as Error).message}, treating as healthy`,
      );
      return true;
    }
  }

  /**
   * 更新资源健康状态到数据库
   */
  private async updateResourceHealth(
    resource: {
      id: string;
      sourceUrl: string | null;
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
      // YouTube 删除/私有信号确定（401/404），用单独阈值快速定性
      const threshold = isYoutubeUrl(resource.sourceUrl)
        ? this.YOUTUBE_FAIL_THRESHOLD
        : this.FAIL_THRESHOLD;
      const newFailCount = resource.linkCheckFailCount + 1;
      const newHealth =
        newFailCount >= threshold
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
          `Resource ${resource.id} marked BROKEN after ${newFailCount} failures (threshold=${threshold})`,
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
