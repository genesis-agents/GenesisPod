import { Injectable, Logger } from "@nestjs/common";
import { RadarSource } from "@prisma/client";
import Parser from "rss-parser";
import { CollectContext, ICollector, RawCollectedItem } from "./icollector";
import { computeContentHash } from "./hash.util";

interface CustomRssItem {
  guid?: string;
  id?: string;
  link?: string;
  title?: string;
  contentSnippet?: string;
  content?: string;
  creator?: string;
  author?: string;
  pubDate?: string;
  isoDate?: string;
  [k: string]: unknown;
}

/**
 * RssCollector —— 直接解析 identifier (URL) 拿 feed。
 *
 * 用 rss-parser npm 包（项目已装），不依赖 management/ingestion/RssService
 * 以保持 ai-app/radar 内的边界单一。
 */
@Injectable()
export class RssCollector implements ICollector {
  readonly type = "RSS";
  private readonly log = new Logger(RssCollector.name);
  private readonly parser: Parser<unknown, CustomRssItem>;

  constructor() {
    this.parser = new Parser({
      timeout: 25_000,
      requestOptions: {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; GenesisRadar/1.0; +https://genesis.ai/bot)",
          Accept:
            "application/rss+xml, application/xml, application/atom+xml, text/xml, */*",
        },
      },
      customFields: {
        item: [
          ["dc:creator", "creator"],
          ["content:encoded", "content"],
        ],
      },
    });
  }

  async fetch(
    source: RadarSource,
    ctx: CollectContext,
  ): Promise<RawCollectedItem[]> {
    const feed = await this.parser.parseURL(source.identifier);
    const items = feed.items ?? [];
    const out: RawCollectedItem[] = [];
    for (const item of items) {
      if (out.length >= ctx.perSourceLimit) break;
      const publishedAt = this.parseDate(item.isoDate ?? item.pubDate);
      if (!publishedAt) continue;
      if (publishedAt <= ctx.since) continue;
      const link = (item.link ?? "").trim();
      const externalId = (item.guid ?? item.id ?? link).trim();
      if (!externalId) continue;
      const title = (item.title ?? "").trim() || null;
      const content =
        (item.content ?? item.contentSnippet ?? "").trim() || null;
      out.push({
        externalId,
        contentHash: computeContentHash(title, content),
        title,
        content,
        author: (item.creator ?? item.author ?? null) || null,
        authorAvatar: null,
        url: link || null,
        publishedAt,
        metrics: null,
        raw: item as unknown as Record<string, unknown>,
      });
    }
    this.log.debug(
      `RSS ${source.identifier} → ${out.length} new items (since ${ctx.since.toISOString()})`,
    );
    return out;
  }

  private parseDate(s?: string | null): Date | null {
    if (!s) return null;
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
}
