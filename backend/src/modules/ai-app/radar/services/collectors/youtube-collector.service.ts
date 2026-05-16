import { Injectable, Logger } from "@nestjs/common";
import { RadarSource } from "@prisma/client";
// CJS 互操作：rss-parser `module.exports = Parser`（无 default），TS `import Parser from`
// 在 CJS target 编译成 `rss_parser_1.default()`，prod 立即 `not a constructor` 崩溃。
// 用 namespace import 拿运行时对象 + type-only import 拿泛型签名。
import type ParserType from "rss-parser";
import * as RssParserModule from "rss-parser";
import { CollectContext, ICollector, RawCollectedItem } from "./icollector";
import { computeContentHash } from "./hash.util";
import { assertSafeHttpUrl } from "./ssrf-util";

interface YouTubeRssItem {
  id?: string;
  link?: string;
  title?: string;
  author?: string;
  isoDate?: string;
  pubDate?: string;
  /** rss-parser 解析后的 enclosure 等字段 */
  "media:group"?: {
    "media:description"?: string[];
    "media:thumbnail"?: Array<{ $: { url: string } }>;
    "media:community"?: Array<{
      "media:statistics"?: Array<{ $: { views: string } }>;
      "media:starRating"?: Array<{ $: { count: string; average: string } }>;
    }>;
  };
  "yt:videoId"?: string;
  "yt:channelId"?: string;
  [k: string]: unknown;
}

const VIDEO_ID_RE = /[A-Za-z0-9_-]{11}/;
const CHANNEL_ID_RE = /UC[A-Za-z0-9_-]{22}/;

type ParserCtor = new (
  ...args: ConstructorParameters<typeof ParserType>
) => ParserType<unknown, YouTubeRssItem>;
const ParserCtor: ParserCtor = ((
  RssParserModule as unknown as { default?: unknown }
).default ?? RssParserModule) as ParserCtor;

/**
 * YouTubeCollector —— 通过 YouTube channel RSS feed 拉最新视频。
 *
 *   https://www.youtube.com/feeds/videos.xml?channel_id={CHANNEL_ID}
 *
 * 兜底策略（PR-R2 仅启用 RSS 路径）：
 * - 用户配 YT Data API key (Secret SOCIAL_YOUTUBE) → PR-R4 接入 channel.search?order=date
 * - 字幕：仅当 source.config.fetchTranscript === true 时调 YoutubeService（PR-R3 启用）
 *
 * identifier 接受：
 * - 24 位 channelId (UC...)
 * - https://www.youtube.com/channel/UC... URL
 * - https://www.youtube.com/@handle URL（暂不支持，需要先 resolve channelId，PR-R4 补）
 */
@Injectable()
export class YoutubeCollector implements ICollector {
  readonly type = "YOUTUBE";
  private readonly log = new Logger(YoutubeCollector.name);
  private readonly parser: ParserType<unknown, YouTubeRssItem>;

  constructor() {
    this.parser = new ParserCtor({
      timeout: 25_000,
      requestOptions: {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; GenesisRadar/1.0; +https://genesis.ai/bot)",
        },
      },
      customFields: {
        // tuple [xmlTag, fieldName] form 兼容 rss-parser 严格类型
        item: [
          ["yt:videoId", "yt:videoId"],
          ["yt:channelId", "yt:channelId"],
          ["media:group", "media:group"],
        ],
      },
    });
  }

  async fetch(
    source: RadarSource,
    ctx: CollectContext,
  ): Promise<RawCollectedItem[]> {
    const channelId = this.extractChannelId(source.identifier);
    if (!channelId) {
      throw new Error(
        `无法从 identifier 提取 channelId: ${source.identifier}（@handle 待 PR-R4 支持）`,
      );
    }
    const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
    assertSafeHttpUrl(feedUrl);
    const feed = await this.parser.parseURL(feedUrl);
    const out: RawCollectedItem[] = [];
    for (const item of feed.items ?? []) {
      if (out.length >= ctx.perSourceLimit) break;
      const publishedAt = this.parseDate(item.isoDate ?? item.pubDate);
      if (!publishedAt) continue;
      if (publishedAt <= ctx.since) continue;
      const videoId = this.extractVideoId(item);
      if (!videoId) continue;
      const title = (item.title ?? "").trim() || null;
      const description = this.extractDescription(item);
      const metrics = this.extractMetrics(item);
      const thumbnail = this.extractThumbnail(item);
      out.push({
        externalId: videoId,
        contentHash: computeContentHash(title, description),
        title,
        content: description,
        author: item.author ?? null,
        authorAvatar: null,
        url: item.link ?? `https://www.youtube.com/watch?v=${videoId}`,
        publishedAt,
        metrics,
        raw: {
          videoId,
          thumbnail,
          channelId: item["yt:channelId"] ?? channelId,
        },
      });
    }
    this.log.debug(`YT channel=${channelId} → ${out.length} new videos`);
    return out;
  }

  private extractChannelId(identifier: string): string | null {
    const trimmed = identifier.trim();
    if (CHANNEL_ID_RE.test(trimmed) && trimmed.length === 24) return trimmed;
    const match = trimmed.match(/channel\/(UC[A-Za-z0-9_-]{22})/);
    if (match) return match[1];
    return null;
  }

  private extractVideoId(item: YouTubeRssItem): string | null {
    if (item["yt:videoId"] && typeof item["yt:videoId"] === "string") {
      return item["yt:videoId"];
    }
    if (item.id && typeof item.id === "string") {
      const m = item.id.match(VIDEO_ID_RE);
      if (m) return m[0];
    }
    if (item.link) {
      const m = item.link.match(/[?&]v=([A-Za-z0-9_-]{11})/);
      if (m) return m[1];
    }
    return null;
  }

  private extractDescription(item: YouTubeRssItem): string | null {
    const group = item["media:group"];
    const desc = group?.["media:description"]?.[0];
    if (typeof desc === "string") return desc.trim() || null;
    return null;
  }

  private extractMetrics(
    item: YouTubeRssItem,
  ): Record<string, number | string> | null {
    const community = item["media:group"]?.["media:community"]?.[0];
    if (!community) return null;
    const metrics: Record<string, number | string> = {};
    const stats = community["media:statistics"]?.[0];
    if (stats?.$.views) metrics.views = Number(stats.$.views);
    const rating = community["media:starRating"]?.[0];
    if (rating?.$.count) metrics.ratings = Number(rating.$.count);
    if (rating?.$.average) metrics.starAverage = rating.$.average;
    return Object.keys(metrics).length > 0 ? metrics : null;
  }

  private extractThumbnail(item: YouTubeRssItem): string | null {
    const arr = item["media:group"]?.["media:thumbnail"];
    if (!Array.isArray(arr) || arr.length === 0) return null;
    return arr[0]?.$?.url ?? null;
  }

  private parseDate(s?: string | null): Date | null {
    if (!s) return null;
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
}
