import { Injectable, Logger } from "@nestjs/common";
import {
  SearchService,
  SearchResult,
} from "@/modules/ai-engine/search/search.service";
// TODO: 后续添加其他数据源服务导入
// import { ArxivService } from '../../../ingestion/crawlers/arxiv.service';
// import { GithubService } from '../../../ingestion/crawlers/github.service';
// import { HackernewsService } from '../../../ingestion/crawlers/hackernews.service';

// ★ 政策研究工具导入
import {
  FederalRegisterTool,
  CongressGovTool,
  WhiteHouseNewsTool,
} from "@/modules/ai-engine/tools/categories/information/policy";

import {
  DataSourceType,
  DataSourceResult,
  AggregatedSearchResult,
  SearchOptions,
} from "../types/data-source.types";
import { ResearchTopic, TopicDimension } from "@prisma/client";
import { AICapabilityResolver } from "@/modules/ai-engine/capabilities/ai-capability-resolver.service";

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

    // ★ 政策研究工具（通过 AI Engine 模块注入）
    private readonly federalRegisterTool: FederalRegisterTool,
    private readonly congressGovTool: CongressGovTool,
    private readonly whiteHouseNewsTool: WhiteHouseNewsTool,
    // ★ AI 能力解析器（用于检查工具是否被 Admin 启用）
    private readonly capabilityResolver: AICapabilityResolver,
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
            // ★ 政策数据源
            [DataSourceType.FEDERAL_REGISTER]: 0,
            [DataSourceType.CONGRESS]: 0,
            [DataSourceType.WHITEHOUSE]: 0,
          },
        },
      };
    }

    // 2. 构建搜索查询
    const searchQuery = this.buildSearchQuery(topic, dimension);

    this.logger.debug(`Search query: "${searchQuery}"`);

    // ★ 从 topicConfig 中获取时间范围，默认最近 6 个月
    const userConfiguredSince = this.getSearchTimeRange(topic);
    // 如果用户没有配置时间范围，默认使用最近 6 个月
    const defaultSince = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
    const since = userConfiguredSince || defaultSince;

    this.logger.debug(
      `Using time range filter: since ${since.toISOString()}${!userConfiguredSince ? " (default 6 months)" : ""}`,
    );

    // 3. 并行调用所有数据源
    const searchPromises = sources.map((source) =>
      this.searchSource(source, searchQuery, {
        maxResults: 15, // ★ 增加到 15 个结果，获取更多数据
        since, // ★ 传递时间范围参数
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
   * 从 topic 配置中获取时间范围
   * @param topic 研究主题
   * @returns 时间范围的起始日期，如果没有限制则返回 undefined
   */
  private getSearchTimeRange(topic: ResearchTopic): Date | undefined {
    const config = topic.topicConfig as Record<string, unknown> | null;
    if (!config?.searchTimeRange || config.searchTimeRange === "all") {
      return undefined;
    }

    const now = new Date();
    const timeRange = config.searchTimeRange as string;

    switch (timeRange) {
      case "6months":
        return new Date(now.getTime() - 6 * 30 * 24 * 60 * 60 * 1000);
      case "1year":
        return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      case "2years":
        return new Date(now.getTime() - 2 * 365 * 24 * 60 * 60 * 1000);
      case "3years":
        return new Date(now.getTime() - 3 * 365 * 24 * 60 * 60 * 1000);
      case "5years":
        return new Date(now.getTime() - 5 * 365 * 24 * 60 * 60 * 1000);
      default:
        this.logger.warn(`Unknown time range: ${timeRange}, ignoring`);
        return undefined;
    }
  }

  /**
   * 构建搜索查询
   * ★ 增强：添加时间戳关键词确保搜索最新数据
   */
  private buildSearchQuery(
    topic: ResearchTopic,
    dimension: TopicDimension,
  ): string {
    const topicName = topic.name;
    const dimensionName = dimension.name;

    // 从 dimension.searchQueries 获取额外的查询关键词
    const searchQueries = dimension.searchQueries as string[] | null;

    let baseQuery: string;
    if (
      searchQueries &&
      Array.isArray(searchQueries) &&
      searchQueries.length > 0
    ) {
      // 使用预定义的查询关键词
      baseQuery = searchQueries[0];
    } else {
      // 默认查询: "主题名 + 维度名"
      baseQuery = `${topicName} ${dimensionName}`;
    }

    // ★ 时间戳增强：添加当前年份和时效性关键词
    const enhancedQuery = this.enhanceQueryWithTimestamp(baseQuery, dimension);

    this.logger.debug(
      `[buildSearchQuery] Original: "${baseQuery}" -> Enhanced: "${enhancedQuery}"`,
    );

    return enhancedQuery;
  }

  /**
   * 增强搜索查询，添加时间戳关键词
   * ★ 确保搜索结果的时效性
   */
  private enhanceQueryWithTimestamp(
    query: string,
    dimension: TopicDimension,
  ): string {
    const currentYear = new Date().getFullYear();

    // 检查查询是否已包含年份或时效性关键词
    const hasTimestampKeyword =
      /20\d{2}|latest|recent|最新|最近|current|今年|本年/i.test(query);

    if (hasTimestampKeyword) {
      return query;
    }

    // 根据维度类型选择合适的时效性关键词
    const freshnessKeywords = this.getFreshnessKeywords(dimension);

    return `${query} ${currentYear} ${freshnessKeywords}`.trim();
  }

  /**
   * 根据维度类型获取时效性关键词
   */
  private getFreshnessKeywords(dimension: TopicDimension): string {
    const dimensionLower = dimension.name.toLowerCase();

    // 政策法规类
    if (
      dimensionLower.includes("政策") ||
      dimensionLower.includes("法规") ||
      dimensionLower.includes("regulation") ||
      dimensionLower.includes("policy")
    ) {
      return "latest policy regulation";
    }

    // 市场投资类
    if (
      dimensionLower.includes("市场") ||
      dimensionLower.includes("投资") ||
      dimensionLower.includes("market") ||
      dimensionLower.includes("investment")
    ) {
      return "market report forecast";
    }

    // 技术趋势类
    if (
      dimensionLower.includes("技术") ||
      dimensionLower.includes("趋势") ||
      dimensionLower.includes("technology") ||
      dimensionLower.includes("trend")
    ) {
      return "emerging breakthrough latest";
    }

    // 竞争格局类
    if (
      dimensionLower.includes("竞争") ||
      dimensionLower.includes("玩家") ||
      dimensionLower.includes("competitor") ||
      dimensionLower.includes("player")
    ) {
      return "landscape analysis";
    }

    // 默认：通用时效性关键词
    return "latest recent";
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
      const searchPromise = this.executeSearch(
        source,
        query,
        maxResults,
        options.since,
      );
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
   * ★ 增强：在调用工具前检查 Admin 是否启用该工具
   */
  private async executeSearch(
    source: DataSourceType,
    query: string,
    maxResults: number,
    since?: Date,
  ): Promise<DataSourceResult[]> {
    // ★ 检查特殊工具是否被 Admin 启用
    const toolId = this.dataSourceToToolId(source);
    if (toolId) {
      const isEnabled = await this.isToolEnabled(toolId);
      if (!isEnabled) {
        this.logger.warn(
          `[executeSearch] Tool ${toolId} for data source ${source} is disabled by Admin, skipping`,
        );
        return [];
      }
    }

    switch (source) {
      case DataSourceType.WEB:
        return this.searchWeb(query, maxResults, since);

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

      // ★ 政策研究数据源
      case DataSourceType.FEDERAL_REGISTER:
        return this.searchFederalRegister(query, maxResults);

      case DataSourceType.CONGRESS:
        return this.searchCongress(query, maxResults);

      case DataSourceType.WHITEHOUSE:
        return this.searchWhiteHouse(query, maxResults);

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
    since?: Date,
  ): Promise<DataSourceResult[]> {
    const response = await this.searchService.search(query, maxResults, since);

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

  // ============================================================================
  // ★ 政策研究数据源搜索方法
  // ============================================================================

  /**
   * 创建工具执行上下文
   */
  private createToolContext(
    toolId: string,
  ): import("@/modules/ai-engine/tools/abstractions/tool.interface").ToolContext {
    return {
      executionId: `${toolId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      toolId,
      createdAt: new Date(),
      callerType: "orchestrator",
    };
  }

  /**
   * 联邦公报搜索 (Federal Register)
   * 搜索行政命令、法规、拟议规则、机构通知
   */
  private async searchFederalRegister(
    query: string,
    maxResults: number,
  ): Promise<DataSourceResult[]> {
    try {
      this.logger.log(`[searchFederalRegister] Searching: "${query}"`);

      const result = await this.federalRegisterTool.execute(
        {
          query,
          maxResults,
        },
        this.createToolContext("federal-register"),
      );

      if (!result.success || !result.data?.documents) {
        this.logger.warn(
          `[searchFederalRegister] No results or error: ${result.error?.message}`,
        );
        return [];
      }

      return result.data.documents.map((doc) => ({
        sourceType: DataSourceType.FEDERAL_REGISTER,
        title: doc.title,
        url: doc.htmlUrl,
        snippet: doc.abstract || doc.title,
        publishedAt: doc.publicationDate
          ? new Date(doc.publicationDate)
          : undefined,
        domain: "federalregister.gov",
        metadata: {
          documentType: doc.type,
          agencies: doc.agencies,
          documentNumber: doc.documentNumber,
        },
      }));
    } catch (error) {
      this.logger.error(
        `[searchFederalRegister] Failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  /**
   * 国会立法搜索 (Congress.gov)
   * 搜索法案、决议、投票记录
   */
  private async searchCongress(
    query: string,
    maxResults: number,
  ): Promise<DataSourceResult[]> {
    try {
      this.logger.log(`[searchCongress] Searching: "${query}"`);

      const result = await this.congressGovTool.execute(
        {
          query,
          limit: maxResults,
        },
        this.createToolContext("congress-gov"),
      );

      if (!result.success || !result.data?.bills) {
        this.logger.warn(
          `[searchCongress] No results or error: ${result.error?.message}`,
        );
        return [];
      }

      return result.data.bills.map((bill) => ({
        sourceType: DataSourceType.CONGRESS,
        title: bill.shortTitle || bill.title,
        url: bill.url,
        snippet: `${bill.number} - ${bill.title}${bill.latestAction ? ` | Latest: ${bill.latestAction.text}` : ""}`,
        publishedAt: bill.introducedDate
          ? new Date(bill.introducedDate)
          : undefined,
        domain: "congress.gov",
        metadata: {
          billNumber: bill.number,
          billType: bill.type,
          congress: bill.congress,
          sponsors: bill.sponsors,
          policyArea: bill.policyArea,
          latestAction: bill.latestAction,
        },
      }));
    } catch (error) {
      this.logger.error(
        `[searchCongress] Failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  /**
   * 白宫新闻搜索 (White House)
   * 搜索声明、新闻发布、行政命令
   */
  private async searchWhiteHouse(
    query: string,
    maxResults: number,
  ): Promise<DataSourceResult[]> {
    try {
      this.logger.log(`[searchWhiteHouse] Searching: "${query}"`);

      const result = await this.whiteHouseNewsTool.execute(
        {
          query,
          limit: maxResults,
        },
        this.createToolContext("whitehouse-news"),
      );

      if (!result.success || !result.data?.items) {
        this.logger.warn(
          `[searchWhiteHouse] No results or error: ${result.error?.message}`,
        );
        return [];
      }

      return result.data.items.map((item) => ({
        sourceType: DataSourceType.WHITEHOUSE,
        title: item.title,
        url: item.url,
        snippet: item.summary || item.title,
        publishedAt: item.date ? new Date(item.date) : undefined,
        domain: "whitehouse.gov",
        metadata: {
          contentType: item.type,
        },
      }));
    } catch (error) {
      this.logger.error(
        `[searchWhiteHouse] Failed: ${error instanceof Error ? error.message : String(error)}`,
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
      // ★ 政策数据源（官方来源，可信度高）
      [DataSourceType.FEDERAL_REGISTER]: 95, // 联邦公报（官方）
      [DataSourceType.CONGRESS]: 95, // 国会立法（官方）
      [DataSourceType.WHITEHOUSE]: 90, // 白宫新闻（官方）
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

  // ==================== Tool Capability Integration ====================

  /**
   * 将 DataSourceType 映射到 Tool ID
   * 某些数据源对应特定的工具，需要检查 Admin 配置
   */
  private dataSourceToToolId(source: DataSourceType): string | null {
    const mapping: Partial<Record<DataSourceType, string>> = {
      [DataSourceType.WEB]: "web-search",
      [DataSourceType.FEDERAL_REGISTER]: "federal-register",
      [DataSourceType.CONGRESS]: "congress-gov",
      [DataSourceType.WHITEHOUSE]: "whitehouse-news",
      // ACADEMIC, GITHUB, HACKERNEWS 暂时不映射，因为它们使用的是 Ingestion Crawlers 而非 AI Engine Tools
    };

    return mapping[source] || null;
  }

  /**
   * 检查工具是否被 Admin 启用
   */
  private async isToolEnabled(toolId: string): Promise<boolean> {
    try {
      // 使用空上下文，只检查全局配置
      const availableTools = await this.capabilityResolver.resolveToolsForAgent(
        {},
      );
      return availableTools.includes(toolId);
    } catch (error) {
      this.logger.error(
        `[isToolEnabled] Failed to check tool ${toolId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      // ★ 安全优先：发生错误时默认禁用，避免使用未授权的工具
      return false;
    }
  }
}
