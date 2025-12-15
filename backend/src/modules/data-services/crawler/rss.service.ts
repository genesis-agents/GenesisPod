import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { MongoDBService } from "../../../common/mongodb/mongodb.service.postgres";
import { DeduplicationService } from "./deduplication.service";
import * as Parser from "rss-parser";

/**
 * 采集结果接口
 */
export interface CollectionResult {
  success: number;
  duplicates: number;
  failed: number;
  skipped?: number; // 因时长过滤等原因跳过的数量
}

/**
 * RSS采集过滤选项
 */
export interface RssFeedFilterOptions {
  /** 最小视频时长（秒），仅对YouTube有效 */
  minDurationSeconds?: number;
}

interface RssFeedItem {
  title?: string;
  link?: string;
  pubDate?: string;
  creator?: string;
  content?: string;
  contentSnippet?: string;
  guid?: string;
  categories?: string[];
  isoDate?: string;
  description?: string;
}

@Injectable()
export class RssService {
  private readonly logger = new Logger(RssService.name);
  private parser: Parser;

  constructor(
    private prisma: PrismaService,
    private mongodb: MongoDBService,
    private deduplication: DeduplicationService,
  ) {
    this.parser = new Parser({
      customFields: {
        item: [
          ["dc:creator", "creator"],
          ["content:encoded", "content"],
        ],
      },
    });
  }

  /**
   * 从YouTube视频URL获取视频时长（秒）
   * 通过解析YouTube视频页面获取时长信息
   * @param videoUrl YouTube视频URL
   * @returns 视频时长（秒），获取失败返回null
   */
  private async getYouTubeVideoDuration(
    videoUrl: string,
  ): Promise<number | null> {
    try {
      // 从URL提取视频ID
      const videoIdMatch = videoUrl.match(
        /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
      );
      if (!videoIdMatch) {
        this.logger.debug(`Cannot extract video ID from URL: ${videoUrl}`);
        return null;
      }
      const videoId = videoIdMatch[1];

      // 使用oEmbed API获取视频信息（不需要API密钥）
      // 注意：oEmbed不返回时长，需要解析视频页面
      const response = await fetch(
        `https://www.youtube.com/watch?v=${videoId}`,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
          },
        },
      );

      if (!response.ok) {
        this.logger.debug(
          `Failed to fetch YouTube page for ${videoId}: ${response.status}`,
        );
        return null;
      }

      const html = await response.text();

      // 从ytInitialPlayerResponse中提取时长
      // 格式: "lengthSeconds":"123"
      const durationMatch = html.match(/"lengthSeconds":\s*"(\d+)"/);
      if (durationMatch) {
        const durationSeconds = parseInt(durationMatch[1], 10);
        this.logger.debug(
          `Video ${videoId} duration: ${durationSeconds}s (${Math.floor(durationSeconds / 60)}m ${durationSeconds % 60}s)`,
        );
        return durationSeconds;
      }

      // 备用方案：从approxDurationMs提取
      const approxDurationMatch = html.match(/"approxDurationMs":\s*"(\d+)"/);
      if (approxDurationMatch) {
        const durationSeconds = Math.floor(
          parseInt(approxDurationMatch[1], 10) / 1000,
        );
        this.logger.debug(
          `Video ${videoId} duration (approx): ${durationSeconds}s`,
        );
        return durationSeconds;
      }

      this.logger.debug(`Could not extract duration for video ${videoId}`);
      return null;
    } catch (error) {
      this.logger.warn(`Error fetching YouTube video duration: ${error}`);
      return null;
    }
  }

  /**
   * 检查URL是否为YouTube视频链接
   */
  private isYouTubeVideoUrl(url: string): boolean {
    return url.includes("youtube.com/watch") || url.includes("youtu.be/");
  }

  /**
   * 从RSS源获取最新文章
   * @param rssUrl RSS订阅地址
   * @param maxItems 最大获取数量
   * @param category 资源类型（BLOG/NEWS等）
   * @param filterOptions 过滤选项（如最小视频时长）
   * @returns 成功采集的数量
   */
  async fetchRssFeed(
    rssUrl: string,
    maxItems: number = 10,
    category: string = "BLOG",
    filterOptions?: RssFeedFilterOptions,
  ): Promise<CollectionResult> {
    try {
      this.logger.log(`Fetching RSS feed from ${rssUrl}`);

      // 解析RSS feed
      const feed = await this.parser.parseURL(rssUrl);

      if (!feed || !feed.items || feed.items.length === 0) {
        this.logger.warn(`No items found in RSS feed: ${rssUrl}`);
        return { success: 0, duplicates: 0, failed: 0 };
      }

      this.logger.log(
        `Found ${feed.items.length} items in RSS feed, processing top ${maxItems}`,
      );

      let successCount = 0;
      let duplicateCount = 0;
      let failedCount = 0;
      let skippedCount = 0;

      // 检查是否为YouTube RSS源（需要时长过滤）
      const isYouTubeFeed = rssUrl.includes("youtube.com/feeds/videos.xml");
      const minDuration = filterOptions?.minDurationSeconds;

      if (isYouTubeFeed && minDuration) {
        this.logger.log(
          `YouTube feed detected, will filter videos shorter than ${minDuration}s (${Math.floor(minDuration / 60)}m)`,
        );
      }

      // 处理每个feed项目
      const itemsToProcess = feed.items.slice(0, maxItems);

      for (const item of itemsToProcess) {
        try {
          // 检查必要字段
          if (!item.title || !item.link) {
            this.logger.warn(`Skipping item without title or link`);
            failedCount++;
            continue;
          }

          // YouTube视频时长过滤（在去重检查之前进行，节省API调用）
          if (
            isYouTubeFeed &&
            minDuration &&
            this.isYouTubeVideoUrl(item.link)
          ) {
            const videoDuration = await this.getYouTubeVideoDuration(item.link);
            if (videoDuration !== null && videoDuration < minDuration) {
              this.logger.log(
                `⏭️ Skipping short video: "${item.title?.substring(0, 50)}..." (${Math.floor(videoDuration / 60)}m ${videoDuration % 60}s < ${Math.floor(minDuration / 60)}m minimum)`,
              );
              skippedCount++;
              continue;
            }
            // 如果无法获取时长，继续处理（不跳过）
            if (videoDuration === null) {
              this.logger.debug(
                `Could not determine duration for "${item.title?.substring(0, 50)}...", processing anyway`,
              );
            }
          }

          // URL去重检查 - 双重检查确保无重复
          const normalizedUrl = this.deduplication.normalizeUrl(item.link);
          this.logger.log(
            `Checking deduplication for: ${item.title?.substring(0, 50)}... URL: ${normalizedUrl}`,
          );

          // 1. 首先检查 Resource 表 URL 精确匹配
          const existingByUrl = await this.prisma.resource.findFirst({
            where: { sourceUrl: normalizedUrl },
            select: { id: true, title: true },
          });

          if (existingByUrl) {
            this.logger.log(
              `⚠️ URL duplicate in Resource table: ${item.title?.substring(0, 50)}... (resourceId: ${existingByUrl.id})`,
            );
            duplicateCount++;
            continue;
          }

          // 2. 检查标题相似度（防止不同URL但相同内容的重复）
          // 只检查最近7天内的资源，避免性能问题
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

          const recentResources = await this.prisma.resource.findMany({
            where: {
              type: category as any,
              createdAt: { gte: sevenDaysAgo },
            },
            select: { id: true, title: true },
            take: 500,
          });

          let titleDuplicate = false;
          for (const existing of recentResources) {
            if (
              this.deduplication.areTitlesSimilar(
                item.title!,
                existing.title,
                0.9,
              )
            ) {
              this.logger.log(
                `⚠️ Title similarity duplicate: "${item.title?.substring(0, 50)}..." similar to existing "${existing.title.substring(0, 50)}..." (resourceId: ${existing.id})`,
              );
              titleDuplicate = true;
              break;
            }
          }

          if (titleDuplicate) {
            duplicateCount++;
            continue;
          }

          // 3. 同时检查 raw_data 表（备份检查）
          const urlDuplicate =
            await this.mongodb.findRawDataByUrlAcrossAllSources(normalizedUrl);

          if (urlDuplicate) {
            this.logger.log(
              `⚠️ Duplicate found in raw_data: ${item.title?.substring(0, 50)}... (source: ${urlDuplicate.source})`,
            );
            duplicateCount++;
            continue;
          }

          this.logger.log(
            `✅ New item, proceeding to save: ${item.title?.substring(0, 50)}...`,
          );

          // 准备完整原始数据（存储到 MongoDB）
          const rawData = {
            // 外部 ID (RSS GUID 用于去重)
            externalId: item.guid || item.link,

            // 完整的原始数据
            ...item,
            feedTitle: feed.title,
            feedLink: feed.link,
            feedDescription: feed.description,
            fetchedAt: new Date().toISOString(),

            // 保存完整URL信息（用于去重）
            url: item.link,
          };

          // 1. 存储完整原始数据到 MongoDB
          const rawDataId = await this.mongodb.insertRawData("rss", rawData);

          this.logger.log(
            `Stored raw data in MongoDB: ${item.title} -> ${rawDataId}`,
          );

          // 2. 提取结构化数据并存储到 PostgreSQL
          const resourceData = this.extractResourceData(
            item,
            feed,
            category,
            rawDataId,
          );

          const resource = await this.prisma.resource.create({
            data: resourceData,
          });

          this.logger.log(
            `Created resource in PostgreSQL: ${resource.id} with rawDataId: ${rawDataId}`,
          );

          // 3. ⚠️ 关键：建立双向引用 MongoDB → PostgreSQL
          await this.mongodb.linkResourceToRawData(rawDataId, resource.id);

          // 4. 验证引用同步成功
          const linkedRawData = await this.mongodb.findRawDataById(rawDataId);
          if (linkedRawData?.resourceId !== resource.id) {
            this.logger.error(
              `Reference sync failed for RSS item ${item.title}: MongoDB resourceId=${linkedRawData?.resourceId}, expected ${resource.id}`,
            );
            throw new Error(
              `Failed to establish bi-directional reference for resource ${resource.id}`,
            );
          }

          this.logger.log(
            `✅ Reference sync completed: MongoDB(${rawDataId}) ↔ PostgreSQL(${resource.id})`,
          );

          successCount++;
        } catch (error) {
          this.logger.error(
            `Failed to process RSS item: ${item.title}`,
            error instanceof Error ? error.stack : String(error),
          );
          failedCount++;
        }
      }

      const skippedInfo =
        skippedCount > 0 ? `, ${skippedCount} filtered by duration` : "";
      this.logger.log(
        `📊 RSS collection completed: ${successCount} new items, ${duplicateCount} duplicates skipped, ${failedCount} failed${skippedInfo}`,
      );

      // 如果全是重复的，记录更详细的信息
      if (successCount === 0 && duplicateCount > 0) {
        this.logger.warn(
          `All ${duplicateCount} items were duplicates. This is expected if you've recently collected from this feed.`,
        );
      }

      // 如果有视频因时长被过滤，记录详细信息
      if (skippedCount > 0) {
        this.logger.log(
          `⏭️ ${skippedCount} videos were filtered out due to minimum duration requirement`,
        );
      }

      return {
        success: successCount,
        duplicates: duplicateCount,
        failed: failedCount,
        skipped: skippedCount,
      };
    } catch (error) {
      // 提供更友好的错误信息
      let errorMessage = `Failed to fetch RSS feed from ${rssUrl}`;

      if (error instanceof Error) {
        // 检查是否是 HTTP 错误
        if (error.message.includes("Status code 404")) {
          errorMessage = `RSS feed not found (404): ${rssUrl}. Please check the URL or contact the site administrator.`;
        } else if (error.message.includes("Status code 403")) {
          errorMessage = `Access forbidden (403) to RSS feed: ${rssUrl}. The site may be blocking automated requests.`;
        } else if (error.message.includes("Status code 500")) {
          errorMessage = `Server error (500) at RSS feed: ${rssUrl}. The site may be experiencing issues.`;
        } else if (
          error.message.includes("ENOTFOUND") ||
          error.message.includes("ECONNREFUSED")
        ) {
          errorMessage = `Cannot connect to RSS feed: ${rssUrl}. Please check your internet connection or the URL.`;
        } else {
          errorMessage = `${errorMessage}: ${error.message}`;
        }
      }

      this.logger.error(
        errorMessage,
        error instanceof Error ? error.stack : String(error),
      );
      throw new Error(errorMessage);
    }
  }

  /**
   * 从RSS item提取资源数据（存储到 PostgreSQL）
   *
   * ⚠️ 关键：建立 rawDataId 引用关系！
   */
  private extractResourceData(
    item: RssFeedItem,
    feed: Parser.Output<any>,
    category: string,
    rawDataId: string,
  ): any {
    // 提取摘要（优先使用content，其次description）
    let summary = item.contentSnippet || item.description || item.content || "";
    if (summary.length > 500) {
      summary = summary.substring(0, 497) + "...";
    }

    // 提取作者
    const author = item.creator || feed.title || "Unknown";

    // 提取发布日期
    const publishedAt = item.isoDate
      ? new Date(item.isoDate)
      : item.pubDate
        ? new Date(item.pubDate)
        : new Date();

    // 提取标签（从categories）
    const tags = item.categories?.slice(0, 10) || [];

    // 检测是否为 arXiv 论文并提取 PDF URL
    // arXiv URL 格式: https://arxiv.org/abs/2512.02080 -> PDF: https://arxiv.org/pdf/2512.02080
    let pdfUrl: string | null = null;
    const sourceUrl = item.link!;

    if (sourceUrl.includes("arxiv.org/abs/")) {
      pdfUrl = sourceUrl.replace("/abs/", "/pdf/");
      this.logger.log(`Extracted arXiv PDF URL: ${pdfUrl}`);
    }

    return {
      type: category as any,

      // 基础信息
      title: item.title!,
      abstract: summary,
      sourceUrl: sourceUrl,

      // PDF URL（arXiv 论文专用）
      pdfUrl: pdfUrl,

      // 作者信息
      authors: [{ name: author }],

      // 发布时间
      publishedAt: publishedAt,

      // 分类和标签
      tags: tags,

      // 元数据
      metadata: {
        feedTitle: feed.title,
        feedLink: feed.link,
        feedDescription: feed.description,
        categories: item.categories || [],
        guid: item.guid,
        // 标记为 arXiv 论文
        isArxiv: sourceUrl.includes("arxiv.org"),
        arxivId: this.extractArxivId(sourceUrl),
      },

      // ⚠️ 关键！MongoDB 原始数据引用
      rawDataId: rawDataId,

      // 初始评分
      qualityScore: 8.0, // RSS源通常质量较高
      trendingScore: 0,
    };
  }

  /**
   * 从 arXiv URL 提取论文 ID
   * 例如: https://arxiv.org/abs/2512.02080 -> 2512.02080
   */
  private extractArxivId(url: string): string | null {
    const match = url.match(/arxiv\.org\/abs\/(\d+\.\d+)/);
    return match ? match[1] : null;
  }

  /**
   * 批量获取多个RSS源
   */
  async fetchMultipleFeeds(
    feeds: Array<{ url: string; category: string }>,
    maxItemsPerFeed: number = 10,
  ): Promise<{
    total: number;
    successful: number;
    failed: number;
    duplicates: number;
  }> {
    let total = 0;
    let successful = 0;
    let failed = 0;
    let duplicates = 0;

    for (const feed of feeds) {
      try {
        const result = await this.fetchRssFeed(
          feed.url,
          maxItemsPerFeed,
          feed.category,
        );
        total += result.success;
        duplicates += result.duplicates;
        if (result.success > 0) successful++;
      } catch (error) {
        this.logger.error(`Failed to fetch feed ${feed.url}`, error);
        failed++;
      }
    }

    return { total, successful, failed, duplicates };
  }
}
