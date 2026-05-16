import { Injectable, Logger } from "@nestjs/common";
import { RadarSource } from "@prisma/client";
import Parser from "rss-parser";
import { CollectContext, ICollector, RawCollectedItem } from "./icollector";
import { computeContentHash } from "./hash.util";

interface NitterItem {
  guid?: string;
  link?: string;
  title?: string;
  content?: string;
  contentSnippet?: string;
  isoDate?: string;
  pubDate?: string;
  creator?: string;
  [k: string]: unknown;
}

/**
 * XCollector —— X / Twitter 数据采集器。
 *
 * 策略（API 优先 + 抓取兜底）：
 * 1. 用户配 X API Bearer (Secret SOCIAL_X) → PR-R4 接入官方 API v2
 *    GET /2/users/by/username/:handle/tweets?since_id=...
 * 2. 无 BYOK（PR-R2 默认走这条）→ 走公共 Nitter 实例的 RSS feed:
 *      https://nitter.net/{handle}/rss
 *    Nitter 是 X 镜像服务，提供匿名 RSS。免费但可能不稳定（多 instance fallback）。
 * 3. 失败 → throw（CollectorRouter 标记 source health=DEGRADED 进 cooldown）
 *
 * NITTER_INSTANCES 顺序失败重试。
 */
const NITTER_INSTANCES = [
  "https://nitter.net",
  "https://nitter.poast.org",
  "https://nitter.privacydev.net",
] as const;

@Injectable()
export class XCollector implements ICollector {
  readonly type = "X";
  private readonly log = new Logger(XCollector.name);
  private readonly parser: Parser<unknown, NitterItem>;

  constructor() {
    this.parser = new Parser({
      timeout: 20_000,
      requestOptions: {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; GenesisRadar/1.0; +https://genesis.ai/bot)",
        },
      },
    });
  }

  async fetch(
    source: RadarSource,
    ctx: CollectContext,
  ): Promise<RawCollectedItem[]> {
    const handle = source.identifier.replace(/^@/, "").trim();
    if (!handle) throw new Error("X handle 不能为空");

    let lastErr: Error | null = null;
    for (const instance of NITTER_INSTANCES) {
      const url = `${instance}/${handle}/rss`;
      try {
        const feed = await this.parser.parseURL(url);
        return this.parseFeed(feed.items ?? [], ctx, handle, instance);
      } catch (err) {
        lastErr = err as Error;
        this.log.warn(
          `Nitter ${instance} failed for @${handle}: ${lastErr.message}`,
        );
      }
    }
    throw new Error(
      `所有 Nitter 实例均失败 (${NITTER_INSTANCES.length} tried); last=${lastErr?.message}`,
    );
  }

  private parseFeed(
    items: NitterItem[],
    ctx: CollectContext,
    handle: string,
    instance: string,
  ): RawCollectedItem[] {
    const out: RawCollectedItem[] = [];
    for (const item of items) {
      if (out.length >= ctx.perSourceLimit) break;
      const publishedAt = this.parseDate(item.isoDate ?? item.pubDate);
      if (!publishedAt) continue;
      if (publishedAt <= ctx.since) continue;
      const link = (item.link ?? "").trim();
      // Nitter link 用 nitter 域名，转回 x.com
      const xUrl = link.replace(/https?:\/\/nitter[^/]+\//, "https://x.com/");
      const externalId = this.extractTweetId(link) || item.guid || link;
      if (!externalId) continue;
      const raw = (item.contentSnippet ?? item.content ?? "").trim();
      const title = (item.title ?? raw.slice(0, 200)).trim() || null;
      out.push({
        externalId,
        contentHash: computeContentHash(title, raw),
        title,
        content: raw || null,
        author: (item.creator ?? `@${handle}`).trim() || null,
        authorAvatar: null,
        url: xUrl || null,
        publishedAt,
        metrics: null,
        raw: { handle, instance, originalLink: link },
      });
    }
    return out;
  }

  private extractTweetId(link: string): string | null {
    const m = link.match(/\/status(?:es)?\/(\d+)/);
    return m ? m[1] : null;
  }

  private parseDate(s?: string | null): Date | null {
    if (!s) return null;
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
}
