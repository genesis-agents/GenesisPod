import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { MongoDBService } from "../../common/mongodb/mongodb.service.postgres";
import { DeduplicationService } from "./deduplication.service";
import * as Parser from "rss-parser";

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
   * 从RSS源获取最新文章
   * @param rssUrl RSS订阅地址
   * @param maxItems 最大获取数量
   * @param category 资源类型（BLOG/NEWS等）
   * @returns 成功采集的数量
   */
  async fetchRssFeed(
    rssUrl: string,
    maxItems: number = 10,
    category: string = "BLOG",
  ): Promise<number> {
    try {
      this.logger.log(`Fetching RSS feed from ${rssUrl}`);

      // 解析RSS feed
      const feed = await this.parser.parseURL(rssUrl);

      if (!feed || !feed.items || feed.items.length === 0) {
        this.logger.warn(`No items found in RSS feed: ${rssUrl}`);
        return 0;
      }

      this.logger.log(
        `Found ${feed.items.length} items in RSS feed, processing top ${maxItems}`,
      );

      let successCount = 0;
      let duplicateCount = 0;
      let failedCount = 0;

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

          // URL去重检查（使用MongoDB）
          const normalizedUrl = this.deduplication.normalizeUrl(item.link);
          const urlDuplicate =
            await this.mongodb.findRawDataByUrlAcrossAllSources(normalizedUrl);

          if (urlDuplicate) {
            this.logger.debug(
              `RSS item already exists: ${item.title} (source: ${urlDuplicate.source})`,
            );
            duplicateCount++;
            continue;
          }

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

      this.logger.log(
        `RSS collection completed: ${successCount} success, ${duplicateCount} duplicates, ${failedCount} failed`,
      );

      return successCount;
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
  ): Promise<{ total: number; successful: number; failed: number }> {
    let total = 0;
    let successful = 0;
    let failed = 0;

    for (const feed of feeds) {
      try {
        const count = await this.fetchRssFeed(
          feed.url,
          maxItemsPerFeed,
          feed.category,
        );
        total += count;
        if (count > 0) successful++;
      } catch (error) {
        this.logger.error(`Failed to fetch feed ${feed.url}`, error);
        failed++;
      }
    }

    return { total, successful, failed };
  }
}
