import { Injectable, Logger } from "@nestjs/common";
import {
  SearchService,
  SearchResult,
} from "../../../ai-engine/search/search.service";
// TODO: 后续添加其他数据源服务导入
// import { ArxivService } from '../../../ingestion/crawlers/arxiv.service';
// import { GithubService } from '../../../ingestion/crawlers/github.service';
// import { HackernewsService } from '../../../ingestion/crawlers/hackernews.service';
import {
  DataSourceType,
  DataSourceResult,
  AggregatedSearchResult,
  SearchOptions,
} from "../types/data-source.types";
import { ResearchTopic, TopicDimension } from "@prisma/client";

/**
 * Data Source Router Service
 *
 * 根据维度配置路由到不同的数据源,并聚合搜索结果
 *
 * 核心功能:
 * 1. 根据 dimension.searchSources 确定使用哪些数据源
 * 2. 并行调用多个数据源
 * 3. 聚合和去重搜索结果
 * 4. 按可信度评分排序
 */
@Injectable()
export class DataSourceRouterService {
  private readonly logger = new Logger(DataSourceRouterService.name);

  constructor(
    private readonly searchService: SearchService, // AI Engine Search (Web)
    // TODO: 后续添加其他数据源服务
    // private readonly arxivService: ArxivService,          // Ingestion Crawlers (Academic) - TODO: implement searchOnly mode
    // private readonly githubService: GithubService,        // Ingestion Crawlers (GitHub) - TODO: implement searchOnly mode
    // private readonly hackernewsService: HackernewsService, // Ingestion Crawlers (HackerNews) - TODO: implement search API
    // private readonly rssService: RssService,
    // private readonly ragService: RagService,
  ) {}

  /**
   * 为指定维度获取数据
   *
   * @param dimension 研究维度
   * @param topic 研究主题
   * @returns 聚合的搜索结果
   */
  async fetchDataForDimension(
    dimension: TopicDimension,
    topic: ResearchTopic,
  ): Promise<AggregatedSearchResult> {
    const startTime = Date.now();

    this.logger.log(
      `Fetching data for dimension: ${dimension.name} (topic: ${topic.name})`,
    );

    // 1. 确定要使用的数据源
    const sources = this.getDataSourcesForDimension(dimension);

    if (sources.length === 0) {
      this.logger.warn(
        `No data sources configured for dimension: ${dimension.name}`,
      );
      return {
        items: [],
        totalCount: 0,
        sources: [],
        metadata: {
          searchQuery: "",
          executionTimeMs: Date.now() - startTime,
          sourceResults: {
            [DataSourceType.WEB]: 0,
            [DataSourceType.ACADEMIC]: 0,
            [DataSourceType.GITHUB]: 0,
            [DataSourceType.HACKERNEWS]: 0,
            [DataSourceType.RSS]: 0,
            [DataSourceType.LOCAL]: 0,
          },
        },
      };
    }

    // 2. 构建搜索查询
    const searchQuery = this.buildSearchQuery(topic, dimension);

    this.logger.debug(`Search query: "${searchQuery}"`);

    // 3. 并行调用所有数据源
    const searchPromises = sources.map((source) =>
      this.searchSource(source, searchQuery, {
        maxResults: 10, // 每个数据源最多返回10个结果
      }),
    );

    const results = await Promise.allSettled(searchPromises);

    // 4. 聚合结果
    const aggregated = this.aggregateResults(results, sources);

    const executionTime = Date.now() - startTime;

    this.logger.log(
      `Fetched ${aggregated.totalCount} results from ${sources.length} sources in ${executionTime}ms`,
    );

    return {
      ...aggregated,
      metadata: {
        searchQuery,
        executionTimeMs: executionTime,
        sourceResults: this.countResultsBySource(results, sources),
      },
    };
  }

  /**
   * 从维度配置中提取数据源列表
   */
  private getDataSourcesForDimension(
    dimension: TopicDimension,
  ): DataSourceType[] {
    // 从 dimension.searchSources 解析数据源
    // searchSources 是 JSON 数组,例如: ["web", "academic", "github"]
    const searchSources = dimension.searchSources as any;

    if (!searchSources || !Array.isArray(searchSources)) {
      this.logger.warn(
        `Invalid searchSources for dimension ${dimension.name}, using default: [web]`,
      );
      return [DataSourceType.WEB];
    }

    // 转换为 DataSourceType 枚举
    const validSources = searchSources
      .filter((source: string) =>
        Object.values(DataSourceType).includes(source as DataSourceType),
      )
      .map((source: string) => source as DataSourceType);

    if (validSources.length === 0) {
      this.logger.warn(
        `No valid sources in searchSources for dimension ${dimension.name}, using default: [web]`,
      );
      return [DataSourceType.WEB];
    }

    return validSources;
  }

  /**
   * 构建搜索查询
   */
  private buildSearchQuery(
    topic: ResearchTopic,
    dimension: TopicDimension,
  ): string {
    const topicName = topic.name;
    const dimensionName = dimension.name;

    // 从 dimension.searchQueries 获取额外的查询关键词
    const searchQueries = dimension.searchQueries as any;

    if (
      searchQueries &&
      Array.isArray(searchQueries) &&
      searchQueries.length > 0
    ) {
      // 使用预定义的查询关键词
      return searchQueries[0]; // 使用第一个查询作为主查询
    }

    // 默认查询: "主题名 + 维度名"
    return `${topicName} ${dimensionName}`;
  }

  /**
   * 搜索指定数据源
   */
  private async searchSource(
    source: DataSourceType,
    query: string,
    options: SearchOptions,
  ): Promise<DataSourceResult[]> {
    const timeout = options.timeout || 30000; // 默认30秒超时
    const maxResults = options.maxResults || 10;

    this.logger.debug(`Searching ${source} with query: "${query}"`);

    try {
      // 使用 Promise.race 实现超时控制
      const searchPromise = this.executeSearch(source, query, maxResults);
      const timeoutPromise = new Promise<DataSourceResult[]>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Search timeout: ${source}`)),
          timeout,
        ),
      );

      const results = await Promise.race([searchPromise, timeoutPromise]);

      this.logger.debug(`${source} returned ${results.length} results`);

      return results;
    } catch (error) {
      this.logger.error(
        `Failed to search ${source}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  /**
   * 执行具体的搜索操作
   */
  private async executeSearch(
    source: DataSourceType,
    query: string,
    maxResults: number,
  ): Promise<DataSourceResult[]> {
    switch (source) {
      case DataSourceType.WEB:
        return this.searchWeb(query, maxResults);

      case DataSourceType.ACADEMIC:
        return this.searchAcademic(query, maxResults);

      case DataSourceType.GITHUB:
        return this.searchGithub(query, maxResults);

      case DataSourceType.HACKERNEWS:
        return this.searchHackerNews(query, maxResults);

      case DataSourceType.RSS:
        // TODO: 实现 RSS 搜索
        this.logger.warn("RSS search not implemented yet");
        return [];

      case DataSourceType.LOCAL:
        // TODO: 实现本地 RAG 搜索
        this.logger.warn("Local RAG search not implemented yet");
        return [];

      default:
        this.logger.warn(`Unknown data source type: ${source}`);
        return [];
    }
  }

  /**
   * Web 搜索 (使用 SearchService)
   */
  private async searchWeb(
    query: string,
    maxResults: number,
  ): Promise<DataSourceResult[]> {
    const response = await this.searchService.search(query, maxResults);

    if (!response.success || !response.results) {
      return [];
    }

    return response.results.map((result: SearchResult) => ({
      sourceType: DataSourceType.WEB,
      title: result.title,
      url: result.url,
      snippet: result.content,
      domain: result.domain,
      publishedAt: result.publishedDate
        ? new Date(result.publishedDate)
        : undefined,
      metadata: {
        score: result.score,
        rawScore: result.rawScore,
      },
    }));
  }

  /**
   * 学术搜索 (使用 ArxivService)
   *
   * 注意: ArxivService.searchPapers 会直接将结果存入数据库
   * 这里我们需要临时存储结果用于聚合,但不影响其正常的数据采集流程
   */
  private async searchAcademic(
    _query: string,
    _maxResults: number,
  ): Promise<DataSourceResult[]> {
    try {
      // TODO: ArxivService 当前会直接存储到数据库
      // 未来可能需要添加一个 searchOnly 模式,只返回结果不存储
      // 现在先返回空数组,标记为 Not Implemented
      this.logger.warn(
        "Academic search integration pending (ArxivService stores directly to DB)",
      );
      return [];
    } catch (error) {
      this.logger.error(
        `Academic search failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  /**
   * GitHub 搜索 (使用 GithubService)
   */
  private async searchGithub(
    _query: string,
    _maxResults: number,
  ): Promise<DataSourceResult[]> {
    try {
      // TODO: GithubService 当前会直接存储到数据库
      // 未来可能需要添加一个 searchOnly 模式,只返回结果不存储
      this.logger.warn(
        "GitHub search integration pending (GithubService stores directly to DB)",
      );
      return [];
    } catch (error) {
      this.logger.error(
        `GitHub search failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  /**
   * HackerNews 搜索
   *
   * 注意: HackerNews 没有官方搜索 API
   * 可以使用 Algolia HN Search API: https://hn.algolia.com/api
   */
  private async searchHackerNews(
    _query: string,
    _maxResults: number,
  ): Promise<DataSourceResult[]> {
    try {
      // TODO: 实现 HackerNews 搜索
      // 可以使用 Algolia HN Search API
      this.logger.warn("HackerNews search not implemented yet");
      return [];
    } catch (error) {
      this.logger.error(
        `HackerNews search failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  /**
   * 聚合搜索结果
   */
  private aggregateResults(
    results: PromiseSettledResult<DataSourceResult[]>[],
    sources: DataSourceType[],
  ): AggregatedSearchResult {
    const allResults: DataSourceResult[] = [];
    const seenUrls = new Set<string>();
    const seenTitles = new Map<string, number>();

    for (const result of results) {
      if (result.status === "fulfilled") {
        for (const item of result.value) {
          // URL 去重
          const normalizedUrl = this.normalizeUrl(item.url);
          if (seenUrls.has(normalizedUrl)) {
            continue;
          }

          // 标题相似度去重
          if (this.isTitleSimilar(item.title, seenTitles)) {
            continue;
          }

          seenUrls.add(normalizedUrl);
          seenTitles.set(item.title.toLowerCase(), 0.9);
          allResults.push(item);
        }
      }
    }

    // 按可信度评分排序
    const sortedResults = allResults.sort(
      (a, b) =>
        this.calculateCredibilityScore(b) - this.calculateCredibilityScore(a),
    );

    return {
      items: sortedResults,
      totalCount: sortedResults.length,
      sources: sources,
    };
  }

  /**
   * URL 标准化
   */
  private normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      // 移除 tracking 参数
      parsed.searchParams.delete("utm_source");
      parsed.searchParams.delete("utm_medium");
      parsed.searchParams.delete("utm_campaign");
      parsed.searchParams.delete("ref");
      // 标准化协议和移除尾部斜杠
      return parsed.toString().replace(/\/$/, "").toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  }

  /**
   * 检查标题是否与已有标题相似
   */
  private isTitleSimilar(
    title: string,
    seenTitles: Map<string, number>,
  ): boolean {
    const titleLower = title.toLowerCase();

    for (const [seenTitle, threshold] of seenTitles.entries()) {
      const similarity = this.calculateTitleSimilarity(titleLower, seenTitle);
      if (similarity >= threshold) {
        return true;
      }
    }

    return false;
  }

  /**
   * 计算标题相似度 (简单的 Jaccard 相似度)
   */
  private calculateTitleSimilarity(title1: string, title2: string): number {
    const words1 = new Set(title1.toLowerCase().split(/\s+/));
    const words2 = new Set(title2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter((w) => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  /**
   * 计算可信度评分
   *
   * 基于:
   * - 数据源类型 (学术 > 官方 > 新闻 > 博客)
   * - 域名权威性
   * - 发布时间新鲜度
   * - 元数据质量
   */
  private calculateCredibilityScore(item: DataSourceResult): number {
    let score = 0;

    // 1. 数据源类型评分 (40%)
    score += this.getSourceTypeScore(item.sourceType) * 0.4;

    // 2. 域名权威性评分 (30%)
    score += this.getDomainAuthorityScore(item.domain) * 0.3;

    // 3. 发布时间新鲜度评分 (20%)
    score += this.getRecencyScore(item.publishedAt) * 0.2;

    // 4. 内容深度评分 (10%)
    score += this.getContentDepthScore(item.snippet?.length || 0) * 0.1;

    return score;
  }

  /**
   * 数据源类型评分
   */
  private getSourceTypeScore(sourceType: DataSourceType): number {
    const scores: Record<DataSourceType, number> = {
      [DataSourceType.ACADEMIC]: 100, // 学术来源最高
      [DataSourceType.GITHUB]: 85, // 开源项目次之
      [DataSourceType.WEB]: 70, // 一般网页搜索
      [DataSourceType.HACKERNEWS]: 75, // 技术新闻
      [DataSourceType.RSS]: 65, // RSS 订阅
      [DataSourceType.LOCAL]: 80, // 本地库 (已验证)
    };

    return scores[sourceType] || 50;
  }

  /**
   * 域名权威性评分
   */
  private getDomainAuthorityScore(domain?: string): number {
    if (!domain) return 50;

    // 高权威域名
    const highAuthority = [
      "arxiv.org",
      "nature.com",
      "science.org",
      "ieee.org",
      "github.com",
      "stackoverflow.com",
      "nytimes.com",
      "wsj.com",
      "bloomberg.com",
      "reuters.com",
    ];

    // 中等权威域名
    const mediumAuthority = [
      "medium.com",
      "dev.to",
      "wikipedia.org",
      "techcrunch.com",
      "wired.com",
      "arstechnica.com",
    ];

    if (highAuthority.some((d) => domain.includes(d))) {
      return 100;
    }

    if (mediumAuthority.some((d) => domain.includes(d))) {
      return 70;
    }

    // .edu, .gov 域名加权
    if (domain.endsWith(".edu") || domain.endsWith(".gov")) {
      return 90;
    }

    return 50;
  }

  /**
   * 发布时间新鲜度评分
   */
  private getRecencyScore(publishedAt?: Date): number {
    if (!publishedAt) return 50;

    const daysSincePublished =
      (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSincePublished <= 7) return 100; // 一周内
    if (daysSincePublished <= 30) return 85; // 一个月内
    if (daysSincePublished <= 90) return 70; // 三个月内
    if (daysSincePublished <= 180) return 55; // 半年内
    if (daysSincePublished <= 365) return 40; // 一年内

    return 25; // 一年以上
  }

  /**
   * 内容深度评分
   */
  private getContentDepthScore(contentLength: number): number {
    if (contentLength >= 500) return 100;
    if (contentLength >= 300) return 80;
    if (contentLength >= 200) return 60;
    if (contentLength >= 100) return 40;

    return 20;
  }

  /**
   * 统计每个数据源的结果数
   */
  private countResultsBySource(
    results: PromiseSettledResult<DataSourceResult[]>[],
    sources: DataSourceType[],
  ): Record<DataSourceType, number> {
    const counts: Record<string, number> = {};

    results.forEach((result, index) => {
      const source = sources[index];
      if (result.status === "fulfilled") {
        counts[source] = result.value.length;
      } else {
        counts[source] = 0;
      }
    });

    return counts as Record<DataSourceType, number>;
  }
}
