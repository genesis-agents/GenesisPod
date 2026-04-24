/**
 * HackerNews Search Adapter
 *
 * Searches HackerNews stories via the "hackernews-search" tool (Algolia API).
 */

import { Injectable, Logger, Optional } from "@nestjs/common";
import { CircuitBreakerService } from "@/modules/ai-engine/facade";
import { SessionLatencyTrackerService } from "@/modules/ai-engine/facade";
import { ToolRegistry } from "@/modules/ai-engine/facade";
import { DataSourceType } from "@/modules/ai-app/topic-insights/shared/types/data-source.types";
import type { DataSourceResult } from "@/modules/ai-app/topic-insights/shared/types/data-source.types";
import type { AdapterSearchRequest } from "../types";
import { SearchAdapterBase } from "./base.adapter";

@Injectable()
export class HackernewsSearchAdapter extends SearchAdapterBase {
  protected readonly logger = new Logger(HackernewsSearchAdapter.name);

  readonly sourceId = "hackernews-search";
  readonly sourceType = DataSourceType.HACKERNEWS;
  readonly concurrency = 3;
  readonly defaultTimeoutMs = 10000;

  constructor(
    private readonly toolRegistry: ToolRegistry,
    @Optional() circuitBreaker?: CircuitBreakerService,
    @Optional() latencyTracker?: SessionLatencyTrackerService,
  ) {
    super(circuitBreaker, latencyTracker);
  }

  protected async doSearch(
    request: AdapterSearchRequest,
  ): Promise<DataSourceResult[]> {
    return this.executeToolSearch(
      this.toolRegistry,
      "hackernews-search",
      {
        query: request.query,
        maxResults: request.maxResults,
      },
      (toolResult) => {
        const stories = toolResult["stories"] as
          | Array<{
              title: string;
              url?: string;
              objectID?: string;
              points: number;
              author?: string;
              createdAt?: string;
              commentCount?: number;
            }>
          | undefined;

        if (!stories || !Array.isArray(stories)) return [];

        return stories.map((r) => ({
          sourceType: DataSourceType.HACKERNEWS,
          title: r.title ?? "",
          url:
            r.url ??
            `https://news.ycombinator.com/item?id=${r.objectID ?? r.title?.replace(/\s/g, "-") ?? "unknown"}`,
          snippet: `${r.points ?? 0} points by ${r.author ?? "unknown"} | ${r.commentCount ?? 0} comments`,
          publishedAt: r.createdAt ? new Date(r.createdAt) : undefined,
          domain: "news.ycombinator.com",
          metadata: {
            points: r.points,
            author: r.author,
            commentCount: r.commentCount,
          },
        }));
      },
    );
  }
}
