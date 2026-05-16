import { Injectable, Logger } from "@nestjs/common";
import { RadarSource, RadarSourceType } from "@prisma/client";
import { CollectContext, ICollector, RawCollectedItem } from "./icollector";
import { RssCollector } from "./rss-collector.service";
import { YoutubeCollector } from "./youtube-collector.service";
import { XCollector } from "./x-collector.service";
import { CustomCollector } from "./custom-collector.service";

export interface CollectResult {
  sourceId: string;
  type: RadarSourceType;
  items: RawCollectedItem[];
  error: string | null;
  /** 单 source 耗时 ms */
  durationMs: number;
}

/**
 * CollectorRouter —— 按 RadarSourceType 路由到具体 collector。
 *
 * fanOut: Promise.allSettled 并发，单 source 失败不阻塞其他。
 * 单 source 失败由 caller 标记 source health（SourceHealthService）。
 */
@Injectable()
export class CollectorRouter {
  private readonly log = new Logger(CollectorRouter.name);
  private readonly registry: Map<RadarSourceType, ICollector>;

  constructor(
    rss: RssCollector,
    yt: YoutubeCollector,
    x: XCollector,
    custom: CustomCollector,
  ) {
    this.registry = new Map<RadarSourceType, ICollector>([
      ["RSS", rss],
      ["YOUTUBE", yt],
      ["X", x],
      ["CUSTOM", custom],
    ]);
  }

  async fanOut(
    sources: RadarSource[],
    ctx: CollectContext,
  ): Promise<CollectResult[]> {
    if (sources.length === 0) return [];
    const tasks = sources.map((s) => this.fetchOne(s, ctx));
    return Promise.all(tasks);
  }

  private async fetchOne(
    source: RadarSource,
    ctx: CollectContext,
  ): Promise<CollectResult> {
    const collector = this.registry.get(source.type);
    if (!collector) {
      return {
        sourceId: source.id,
        type: source.type,
        items: [],
        error: `Unsupported source type: ${source.type}`,
        durationMs: 0,
      };
    }
    const start = Date.now();
    try {
      const items = await collector.fetch(source, ctx);
      return {
        sourceId: source.id,
        type: source.type,
        items,
        error: null,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      const msg = (err as Error).message || String(err);
      this.log.warn(`Collector ${source.type}#${source.id} failed: ${msg}`);
      return {
        sourceId: source.id,
        type: source.type,
        items: [],
        error: msg,
        durationMs: Date.now() - start,
      };
    }
  }
}
