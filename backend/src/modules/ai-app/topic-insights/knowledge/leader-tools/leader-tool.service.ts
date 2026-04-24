/**
 * Leader Tool Service
 *
 * F-7 · Baseline (`aaff7b15e`) services/data/leader-tool.service.ts 的核心能力重构。
 *
 * Scope for this reintroduction（故意收敛）：
 *   1. `searchLatestData(topicName)` — Leader 规划**前**跑一次轻量 WEB 搜索，
 *      抓最近 N 条数据标题+snippet 作为"最新数据速览"
 *   2. `generateEnhancedPlanningContext(topicName, userPrompt?)` — 把结果
 *      拼成 markdown 片段，注入 AG-01-LD 的 userPrompt，让 Leader 看到
 *      最新数据再规划维度（取代单纯凭训练数据规划）
 *
 * 不包含（下一轮再接）：
 *   - `leaderAgenticSearch` 迭代式 agentic search（AG-19-LAS 已承担）
 *   - dimension CRUD（`createDimension/deleteDimension/mergeDimensions`）
 *   - `cancelTask`（MissionCancellationService 已有被动取消）
 *
 * baseline 调用链是 Leader → Tool → SearchService → 报告。harness 这里
 * 改造为 Leader Planning stage 在 prepare() 里 *显式*调用本 service，
 * 让规划上下文更贴近现实，避免"用 2024 年的训练数据规划 2026 年的话题"。
 */

import { Injectable, Logger, Optional } from "@nestjs/common";
import type { DataSourceResult } from "@/modules/ai-app/topic-insights/shared/types/data-source.types";
import { DataSourceType } from "@/modules/ai-app/topic-insights/shared/types/data-source.types";
import { SearchExecutorService } from "../search/executor.service";
import { ResultFusionService } from "../search/fusion/result-fusion.service";
import { ContentFetcherService } from "../search/fusion/content-fetcher.service";
import type { SourceAwareQueries } from "../search/types";

export interface SearchLatestDataOptions {
  readonly maxResults?: number;
  readonly since?: Date;
  readonly language?: "en" | "zh" | "mixed";
  readonly signal?: AbortSignal;
  /** 可选：抓 Top N 条的 full content 用作更丰富的上下文 */
  readonly enrichContent?: boolean;
}

export interface LatestDataSummary {
  readonly topicName: string;
  readonly itemCount: number;
  readonly items: ReadonlyArray<{
    readonly title: string;
    readonly url: string;
    readonly snippet: string;
    readonly domain?: string;
    readonly publishedAt?: Date;
    readonly fullContent?: string | null;
  }>;
  /** 已经格式化好的 markdown 片段，直接塞进 userPrompt */
  readonly markdown: string;
  readonly durationMs: number;
}

@Injectable()
export class LeaderToolService {
  private readonly logger = new Logger(LeaderToolService.name);

  constructor(
    private readonly executor: SearchExecutorService,
    private readonly fusion: ResultFusionService,
    @Optional() private readonly contentFetcher?: ContentFetcherService,
  ) {}

  /**
   * 在 Leader 规划**前**快速跑一次 WEB 搜索，返回 "最新数据速览"。
   *
   * 设计原则：
   * - 只用 WEB（最快、最通用），不做多源融合 — 目的是 *提示* 最新情况，
   *   不是替代正式 ST-02-RESEARCH
   * - 默认抓 5-8 条，有 ContentFetcher 时仅抓 topN=3 的 full content
   *   以免拖慢规划（budget 几秒内）
   * - 失败降级：任何错误回落到空 summary，规划继续
   */
  async searchLatestData(
    topicName: string,
    options: SearchLatestDataOptions = {},
  ): Promise<LatestDataSummary> {
    const started = Date.now();
    const maxResults = options.maxResults ?? 8;
    const language = options.language ?? "mixed";

    const queries: SourceAwareQueries = {
      baseQueries: [topicName],
      sourceSpecific: new Map(),
      language,
    };

    try {
      const rawResults = await this.executor.searchAllSources(
        [DataSourceType.WEB],
        queries,
        {
          maxResults,
          since: options.since,
          signal: options.signal,
        },
      );

      const fused = this.fusion.fuse(rawResults, topicName);
      let items: DataSourceResult[] = fused.items.slice(0, maxResults);

      // 可选 full content 抓取 — 只抓 top3，避免规划阶段拖太久
      if (options.enrichContent && this.contentFetcher && items.length > 0) {
        try {
          const enriched = await this.contentFetcher.enrichResults(items, {
            topN: 3,
            maxContentLength: 1500,
          });
          // Mutate items to carry fullContent on the first 3
          items = enriched;
        } catch (err) {
          this.logger.warn(
            `[searchLatestData] content-fetcher failed: ${(err as Error).message}`,
          );
        }
      }

      const summary: LatestDataSummary = {
        topicName,
        itemCount: items.length,
        items: items.map((r) => ({
          title: r.title,
          url: r.url,
          snippet: r.snippet,
          domain: r.domain,
          publishedAt: r.publishedAt,
          fullContent: (r as DataSourceResult & { fullContent?: string | null })
            .fullContent,
        })),
        markdown: this.formatAsMarkdown(topicName, items),
        durationMs: Date.now() - started,
      };

      this.logger.log(
        `[searchLatestData] topic="${topicName}" items=${summary.itemCount} in ${summary.durationMs}ms`,
      );
      return summary;
    } catch (err) {
      this.logger.warn(
        `[searchLatestData] failed: ${(err as Error).message} — returning empty summary`,
      );
      return {
        topicName,
        itemCount: 0,
        items: [],
        markdown: "",
        durationMs: Date.now() - started,
      };
    }
  }

  /**
   * 把 searchLatestData 结果包装成一段 markdown 注入到 Leader 的
   * userPrompt。空结果返回 "" — 调用方 concat 前检查即可。
   */
  async generateEnhancedPlanningContext(
    topicName: string,
    options: SearchLatestDataOptions = {},
  ): Promise<string> {
    const summary = await this.searchLatestData(topicName, options);
    if (summary.itemCount === 0) return "";
    return summary.markdown;
  }

  // ─── private ───────────────────────────────────────────────────────────

  private formatAsMarkdown(
    topicName: string,
    items: DataSourceResult[],
  ): string {
    if (items.length === 0) return "";
    const header = `## 最新数据速览（规划辅助参考，非最终证据）\n\n`;
    const intro = `以下 ${items.length} 条来自公网的最新资料。请基于它们判断维度是否覆盖现状，以及需要强化哪些方向：\n\n`;
    const body = items
      .slice(0, 8)
      .map((r, i) => {
        const date = r.publishedAt
          ? ` · ${r.publishedAt.toISOString().slice(0, 10)}`
          : "";
        const domain = r.domain ? ` · ${r.domain}` : "";
        const snippet = (r.snippet ?? "").slice(0, 220).replace(/\s+/g, " ");
        return `${i + 1}. **${r.title}**${domain}${date}\n   ${snippet}\n   <${r.url}>`;
      })
      .join("\n\n");
    const footer = `\n\n> *注：本速览只用于让 Leader 了解 topic="${topicName}" 的近期公开讨论点，不构成章节引用来源。*\n`;
    return header + intro + body + footer;
  }
}
