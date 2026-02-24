import { Injectable, Logger, Optional } from "@nestjs/common";
// ★ 架构重构：移除 SearchService 直接导入，通过 ToolRegistry 调用
// TODO: 后续添加其他数据源服务导入
// import { ArxivService } from '../../../ingestion/crawlers/arxiv.service';
// import { GithubService } from '../../../ingestion/crawlers/github.service';
// import { HackernewsService } from '../../../ingestion/crawlers/hackernews.service';

// ★ P0: 数据源连接器注册中心
import { DataSourceConnectorRegistry } from "./connectors/data-source-connector.registry";

// ★ AI Engine Facade 导入 - 用于 Social X 搜索
import { AIEngineFacade } from "@/modules/ai-engine/facade";

// ★ 政策研究工具导入
import {
  FederalRegisterTool,
  CongressGovTool,
  WhiteHouseNewsTool,
} from "@/modules/ai-engine/tools/categories/information/policy";

// ★ 架构重构：通过 ToolRegistry 调用工具
import { ToolRegistry } from "@/modules/ai-engine/tools/registry/tool-registry";

import {
  DataSourceType,
  DataSourceResult,
  AggregatedSearchResult,
  SearchOptions,
  DataSourcePlan,
} from "../../types/data-source.types";
import { ResearchTopic, TopicDimension } from "@prisma/client";
import { DataSourcePlannerService } from "./data-source-planner.service";
import {
  dataSourceToToolId,
  convertToolsToDataSources,
} from "../../config/data-source-mapping.config";

/**
 * 数据获取选项
 */
export interface FetchDataOptions {
  /** 是否使用 AI 规划数据源（默认 false，使用维度配置） */
  useAIPlanning?: boolean;
  /** 覆盖默认的 maxResults */
  maxResults?: number;
  /** 覆盖默认的时间范围 */
  since?: Date;
  /** Leader 分配的工具（可用于过滤数据源） */
  assignedTools?: string[];
  /** Leader 分配的技能（可用于定制搜索策略） */
  assignedSkills?: string[];
}

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
    // ★ 架构重构：通过 ToolRegistry 调用工具，不再直接依赖 SearchService
    private readonly toolRegistry: ToolRegistry,
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
    // ★ AI 数据源规划器
    private readonly dataSourcePlanner: DataSourcePlannerService,
    // ★ AI Facade - 用于 Social X 搜索（Grok Live Search）、RAG 搜索、能力解析
    private readonly aiFacade: AIEngineFacade,
    // ★ P0: 数据源连接器注册中心（可选，向后兼容）
    @Optional()
    private readonly connectorRegistry?: DataSourceConnectorRegistry,
  ) {}

  /**
   * ★ Major Fix: 使用 LRU-style 缓存，防止内存泄漏
   * 缓存 AI 规划结果，避免同一维度重复规划
   * 最多缓存 100 条，超出时删除最早的条目
   */
  private static readonly PLAN_CACHE_MAX_SIZE = 100;
  private planCache = new Map<string, DataSourcePlan>();
  private planCacheOrder: string[] = [];

  /**
   * 为指定维度获取数据
   *
   * @param dimension 研究维度
   * @param topic 研究主题
   * @param options 可选配置（AI 规划、maxResults 等）
   * @returns 聚合的搜索结果
   */
  async fetchDataForDimension(
    dimension: TopicDimension,
    topic: ResearchTopic,
    options?: FetchDataOptions,
  ): Promise<AggregatedSearchResult> {
    const startTime = Date.now();
    const useAIPlanning = options?.useAIPlanning ?? false;

    // ★ 提取 Leader 分配的工具
    const assignedTools = options?.assignedTools || [];

    this.logger.log(
      `Fetching data for dimension: ${dimension.name} (topic: ${topic.name}, AI planning: ${useAIPlanning}, assignedTools: [${assignedTools.join(", ")}])`,
    );

    // 1. 确定要使用的数据源
    let sources: DataSourceType[];
    let aiPlan: DataSourcePlan | undefined;

    // ★ 优先使用 Leader 分配的工具
    if (assignedTools.length > 0) {
      sources = this.convertToolsToDataSources(assignedTools);
      this.logger.log(
        `[Assigned Tools] Using Leader-assigned tools: [${assignedTools.join(", ")}] → DataSources: [${sources.join(", ")}]`,
      );
      // 如果转换后没有有效的数据源，回退到其他方式
      if (sources.length === 0) {
        this.logger.warn(
          `[Assigned Tools] No valid data sources from assigned tools, falling back to dimension config`,
        );
        sources = this.getDataSourcesForDimension(dimension);
      }
    } else if (useAIPlanning) {
      // ★ 使用 AI 规划数据源
      aiPlan = await this.getAIPlanForDimension(dimension, topic);
      sources = aiPlan.recommendedSources;
      this.logger.log(
        `[AI Planning] Recommended sources: ${sources.join(", ")} (confidence: ${aiPlan.confidence}%)`,
      );
    } else {
      // 使用维度配置的数据源
      sources = this.getDataSourcesForDimension(dimension);
    }

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
            [DataSourceType.FEDERAL_REGISTER]: 0,
            [DataSourceType.CONGRESS]: 0,
            [DataSourceType.WHITEHOUSE]: 0,
            [DataSourceType.SOCIAL_X]: 0,
            [DataSourceType.SEMANTIC_SCHOLAR]: 0,
            [DataSourceType.PUBMED]: 0,
            [DataSourceType.FINANCE_API]: 0,
            [DataSourceType.WEATHER_API]: 0,
          },
        },
      };
    }

    // 2. 构建搜索查询
    const searchQueries = this.buildSearchQueries(topic, dimension);
    const searchQuery = searchQueries[0]; // primary query for metadata

    this.logger.debug(
      `Search queries: ${searchQueries.map((q) => `"${q}"`).join(", ")}`,
    );

    // ★ 从 topicConfig 中获取时间范围，默认最近 6 个月
    const userConfiguredSince = this.getSearchTimeRange(topic);
    // 如果用户没有配置时间范围，默认使用最近 6 个月
    const defaultSince = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
    const since = userConfiguredSince || defaultSince;

    this.logger.debug(
      `Using time range filter: since ${since.toISOString()}${!userConfiguredSince ? " (default 6 months)" : ""}`,
    );

    // 3. 并行调用所有数据源
    // ★ 对每个查询 × 每个数据源执行搜索，按查询分配配额
    const maxResultsPerQuery = Math.max(
      5,
      Math.ceil(25 / searchQueries.length),
    );
    const searchPromises: Promise<DataSourceResult[]>[] = [];
    const searchSources: DataSourceType[] = [];

    for (const source of sources) {
      for (const query of searchQueries) {
        searchPromises.push(
          this.searchSource(
            source,
            query,
            {
              maxResults: maxResultsPerQuery,
              since,
            },
            topic,
          ),
        );
        searchSources.push(source);
      }
    }

    const results = await Promise.allSettled(searchPromises);

    // 4. 聚合结果
    let aggregated = this.aggregateResults(results, searchSources);

    // ★ H4: 所有数据源都失败或无结果时，兜底使用 WEB 源
    if (aggregated.totalCount === 0 && !sources.includes(DataSourceType.WEB)) {
      this.logger.warn(
        `[fetchDataForDimension] All ${sources.length} sources returned 0 results, falling back to WEB`,
      );
      try {
        const webResult = await this.searchSource(
          DataSourceType.WEB,
          searchQuery,
          { maxResults: 25, since },
        );
        if (webResult.length > 0) {
          aggregated = {
            items: webResult,
            totalCount: webResult.length,
            sources: [DataSourceType.WEB],
          };
        }
      } catch (webErr) {
        this.logger.error(
          `[fetchDataForDimension] WEB fallback also failed: ${(webErr as Error).message}`,
        );
      }
    }

    const executionTime = Date.now() - startTime;

    this.logger.log(
      `Fetched ${aggregated.totalCount} results from ${sources.length} sources in ${executionTime}ms`,
    );

    return {
      ...aggregated,
      metadata: {
        searchQuery,
        executionTimeMs: executionTime,
        sourceResults: this.countResultsBySource(results, searchSources),
      },
    };
  }

  /**
   * V5 L2: 文献基线扫描
   * 构造学术导向查询，复用现有搜索基础设施
   * 仅 standard/thorough 模式启用
   */
  async scanLiteratureBaseline(
    topic: ResearchTopic,
    dimension: TopicDimension,
  ): Promise<DataSourceResult[]> {
    this.logger.log(
      `[scanLiteratureBaseline] Scanning literature baseline for dimension: ${dimension.name}`,
    );

    // Construct academic-oriented queries
    const academicQueries = this.buildAcademicQueries(
      topic.name,
      dimension.name,
      dimension.description || "",
    );

    const allResults: DataSourceResult[] = [];

    for (const query of academicQueries) {
      try {
        const results = await this.executeSearch(DataSourceType.WEB, query, 5);
        allResults.push(...results);
      } catch (error) {
        this.logger.warn(
          `[scanLiteratureBaseline] Query failed: "${query.substring(0, 50)}...": ${error}`,
        );
      }
    }

    // Deduplicate by URL
    const seen = new Set<string>();
    const deduped = allResults.filter((r) => {
      if (seen.has(r.url)) return false;
      seen.add(r.url);
      return true;
    });

    this.logger.log(
      `[scanLiteratureBaseline] Found ${deduped.length} unique academic sources`,
    );

    return deduped;
  }

  /**
   * V5: 构造学术导向搜索查询
   */
  private buildAcademicQueries(
    topicName: string,
    dimensionName: string,
    dimensionDescription: string,
  ): string[] {
    // Extract key terms from topic and dimension
    const keywords = `${topicName} ${dimensionName}`.trim();

    return [
      `${keywords} research report 2024 2025 site:mckinsey.com OR site:bcg.com OR site:hbr.org`,
      `${keywords} analysis whitepaper site:gartner.com OR site:forrester.com OR site:deloitte.com`,
      `${keywords} ${dimensionDescription.split(/\s+/).slice(0, 5).join(" ")} academic paper`,
    ];
  }

  /**
   * V5: 基于假设生成正反方向搜索查询并执行搜索
   * 用于假设驱动的知识构建
   */
  async searchForHypothesis(hypothesisStatement: string): Promise<{
    supportResults: DataSourceResult[];
    counterResults: DataSourceResult[];
  }> {
    this.logger.log(
      `[searchForHypothesis] Generating queries for hypothesis: ${hypothesisStatement.substring(0, 80)}...`,
    );

    // Generate support and counter queries from hypothesis
    const keywords = hypothesisStatement
      .replace(/["""'']/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .slice(0, 6)
      .join(" ");

    const supportQueries = [
      `${keywords} evidence support`,
      `${keywords} research findings`,
    ];
    const counterQueries = [
      `${keywords} criticism challenges limitations`,
      `${keywords} counter evidence against`,
    ];

    const executeQueries = async (
      queries: string[],
    ): Promise<DataSourceResult[]> => {
      const results: DataSourceResult[] = [];
      for (const query of queries) {
        try {
          const r = await this.executeSearch(DataSourceType.WEB, query, 3);
          results.push(...r);
        } catch (error) {
          this.logger.warn(`[searchForHypothesis] Query failed: ${error}`);
        }
      }
      return results;
    };

    const [supportResults, counterResults] = await Promise.all([
      executeQueries(supportQueries),
      executeQueries(counterQueries),
    ]);

    this.logger.log(
      `[searchForHypothesis] Found ${supportResults.length} support, ${counterResults.length} counter results`,
    );

    return { supportResults, counterResults };
  }

  /**
   * 从维度配置中提取数据源列表
   */
  private getDataSourcesForDimension(
    dimension: TopicDimension,
  ): DataSourceType[] {
    // 从 dimension.searchSources 解析数据源
    // searchSources 是 JSON 数组,例如: ["web", "academic", "github"]
    const searchSources = dimension.searchSources as string[] | null;

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
   * 构建搜索查询列表
   * ★ 增强：使用所有 searchQueries（最多 3 个），而非仅第一个
   */
  private buildSearchQueries(
    topic: ResearchTopic,
    dimension: TopicDimension,
  ): string[] {
    const topicName = topic.name;
    const dimensionName = dimension.name;

    const searchQueries = dimension.searchQueries as string[] | null;

    const baseQueries: string[] = [];
    if (
      searchQueries &&
      Array.isArray(searchQueries) &&
      searchQueries.length > 0
    ) {
      // 使用所有预定义查询（最多 3 个）
      baseQueries.push(...searchQueries.slice(0, 3));
    }

    // 始终添加默认查询作为兜底
    const defaultQuery = `${topicName} ${dimensionName}`;
    if (!baseQueries.some((q) => q === defaultQuery)) {
      baseQueries.push(defaultQuery);
    }

    // 去重并增强时间戳
    const enhanced = baseQueries
      .filter((q, i, arr) => arr.indexOf(q) === i)
      .slice(0, 3)
      .map((q) => this.enhanceQueryWithTimestamp(q, dimension));

    this.logger.debug(
      `[buildSearchQueries] Generated ${enhanced.length} queries: ${enhanced.map((q) => `"${q}"`).join(", ")}`,
    );

    return enhanced;
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
    if (!dimension?.name) return "";
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
   * ★ Critical Fix: topic 作为参数传递，避免实例变量的并发竞态
   */
  private async searchSource(
    source: DataSourceType,
    query: string,
    options: SearchOptions,
    topic?: ResearchTopic,
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
        topic,
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
   * ★ Critical Fix: topic 作为参数传递，避免实例变量的并发竞态
   */
  private async executeSearch(
    source: DataSourceType,
    query: string,
    maxResults: number,
    since?: Date,
    topic?: ResearchTopic,
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
        return this.searchLocal(query, maxResults, topic);

      // ★ 政策研究数据源
      case DataSourceType.FEDERAL_REGISTER:
        return this.searchFederalRegister(query, maxResults);

      case DataSourceType.CONGRESS:
        return this.searchCongress(query, maxResults);

      case DataSourceType.WHITEHOUSE:
        return this.searchWhiteHouse(query, maxResults);

      // ★ 社媒数据源
      case DataSourceType.SOCIAL_X:
        return this.searchSocialX(query, maxResults);

      // ★ P0: 新增实时数据源（通过 ConnectorRegistry 路由）
      case DataSourceType.SEMANTIC_SCHOLAR:
      case DataSourceType.PUBMED:
      case DataSourceType.FINANCE_API:
      case DataSourceType.WEATHER_API:
        return this.searchViaConnector(source, query, maxResults);

      default:
        this.logger.warn(`Unknown data source type: ${source}`);
        return [];
    }
  }

  /**
   * ★ P0: 通过 ConnectorRegistry 执行搜索
   * 统一路由到已注册的数据源连接器
   */
  private async searchViaConnector(
    source: DataSourceType,
    query: string,
    maxResults: number,
  ): Promise<DataSourceResult[]> {
    if (!this.connectorRegistry) {
      this.logger.warn(
        `[searchViaConnector] ConnectorRegistry not available, skipping ${source}`,
      );
      return [];
    }

    return this.connectorRegistry.searchViaConnector(source, query, maxResults);
  }

  /**
   * Web 搜索
   * ★ 架构重构：通过 ToolRegistry 调用 web-search 工具，不再直接调用 SearchService
   */
  private async searchWeb(
    query: string,
    maxResults: number,
    since?: Date,
  ): Promise<DataSourceResult[]> {
    this.logger.log(
      `[searchWeb] Calling web-search tool via ToolRegistry with query="${query}", maxResults=${maxResults}, since=${since?.toISOString() || "none"}`,
    );

    // ★ 通过 ToolRegistry 获取 web-search 工具
    const webSearchTool = this.toolRegistry.tryGet("web-search");
    if (!webSearchTool) {
      this.logger.error(
        "[searchWeb] web-search tool not registered in ToolRegistry",
      );
      return [];
    }

    try {
      // ★ 通过工具系统执行搜索
      const toolResult = await webSearchTool.execute(
        {
          query,
          numResults: maxResults,
          // since 参数由工具内部处理（如果支持的话）
        },
        this.createToolContext("web-search"),
      );

      if (!toolResult.success || !toolResult.data) {
        this.logger.warn(
          `[searchWeb] Search failed or no results: ${toolResult.error?.message || "unknown error"}`,
        );
        return [];
      }

      const searchData = toolResult.data as {
        results: Array<{
          title: string;
          url: string;
          content: string;
          publishedDate?: string;
          domain?: string;
          score?: number;
          rawScore?: number;
        }>;
        success: boolean;
        provider?: string;
      };

      this.logger.log(
        `[searchWeb] Tool response: success=${searchData.success}, provider=${searchData.provider || "unknown"}, results=${searchData.results?.length || 0}`,
      );

      if (!searchData.success || !searchData.results) {
        this.logger.warn("[searchWeb] Tool returned unsuccessful result");
        return [];
      }

      return searchData.results.map((result) => ({
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
    } catch (error) {
      this.logger.error(
        `[searchWeb] Tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  /**
   * 学术搜索 (使用 ArxivSearchTool)
   * 搜索 arXiv 上的学术论文（预印本）
   */
  private async searchAcademic(
    query: string,
    maxResults: number,
  ): Promise<DataSourceResult[]> {
    try {
      this.logger.log(`[searchAcademic] Searching arXiv: "${query}"`);

      // 通过 ToolRegistry 获取 arxiv-search 工具
      const arxivTool = this.toolRegistry.tryGet("arxiv-search");
      if (!arxivTool) {
        this.logger.error(
          "[searchAcademic] arxiv-search tool not registered in ToolRegistry",
        );
        return [];
      }

      const result = await arxivTool.execute(
        {
          query,
          maxResults,
          sortBy: "relevance",
        },
        this.createToolContext("arxiv-search"),
      );

      if (!result.success || !result.data) {
        this.logger.warn(
          `[searchAcademic] No results or error: ${result.error?.message}`,
        );
        return [];
      }

      const arxivData = result.data as {
        success: boolean;
        papers: Array<{
          id: string;
          title: string;
          summary: string;
          authors: string[];
          published: string;
          updated: string;
          categories: string[];
          pdfUrl: string;
          absUrl: string;
        }>;
        totalResults: number;
        query: string;
      };

      if (!arxivData.papers || arxivData.papers.length === 0) {
        this.logger.warn("[searchAcademic] No papers in response");
        return [];
      }

      return arxivData.papers.map((paper) => ({
        sourceType: DataSourceType.ACADEMIC,
        title: paper.title,
        url: paper.absUrl, // 使用摘要页 URL 作为主链接
        snippet: paper.summary?.slice(0, 500) || "", // 截取摘要前 500 字符
        publishedAt: paper.published ? new Date(paper.published) : undefined,
        domain: "arxiv.org",
        metadata: {
          arxivId: paper.id,
          authors: paper.authors,
          categories: paper.categories,
          pdfUrl: paper.pdfUrl,
          updated: paper.updated,
        },
      }));
    } catch (error) {
      this.logger.error(
        `[searchAcademic] Failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  /**
   * GitHub 搜索 (使用 GithubSearchTool)
   * 搜索 GitHub 上的开源仓库
   */
  private async searchGithub(
    query: string,
    maxResults: number,
  ): Promise<DataSourceResult[]> {
    try {
      this.logger.log(`[searchGithub] Searching GitHub: "${query}"`);

      // 通过 ToolRegistry 获取 github-search 工具
      const githubTool = this.toolRegistry.tryGet("github-search");
      if (!githubTool) {
        this.logger.error(
          "[searchGithub] github-search tool not registered in ToolRegistry",
        );
        return [];
      }

      const result = await githubTool.execute(
        {
          query,
          maxResults,
          sort: "stars", // 按星标数排序，获取高质量仓库
        },
        this.createToolContext("github-search"),
      );

      if (!result.success || !result.data) {
        this.logger.warn(
          `[searchGithub] No results or error: ${result.error?.message}`,
        );
        return [];
      }

      const githubData = result.data as {
        success: boolean;
        repositories: Array<{
          fullName: string;
          description: string | null;
          htmlUrl: string;
          language: string | null;
          stargazersCount: number;
          forksCount: number;
          openIssuesCount: number;
          topics: string[];
          createdAt: string;
          updatedAt: string;
          pushedAt: string;
          owner: {
            login: string;
            avatarUrl: string;
            type: string;
          };
        }>;
        totalCount: number;
        query: string;
      };

      if (!githubData.repositories || githubData.repositories.length === 0) {
        this.logger.warn("[searchGithub] No repositories in response");
        return [];
      }

      return githubData.repositories.map((repo) => ({
        sourceType: DataSourceType.GITHUB,
        title: repo.fullName,
        url: repo.htmlUrl,
        snippet:
          repo.description ||
          `${repo.language || "Unknown language"} repository with ${repo.stargazersCount} stars`,
        publishedAt: repo.createdAt ? new Date(repo.createdAt) : undefined,
        domain: "github.com",
        metadata: {
          language: repo.language,
          stars: repo.stargazersCount,
          forks: repo.forksCount,
          openIssues: repo.openIssuesCount,
          topics: repo.topics,
          owner: repo.owner.login,
          ownerType: repo.owner.type,
          updatedAt: repo.updatedAt,
          pushedAt: repo.pushedAt,
        },
      }));
    } catch (error) {
      this.logger.error(
        `[searchGithub] Failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  /**
   * HackerNews 搜索
   * 使用 Algolia HN Search API 搜索技术社区讨论和新闻
   */
  private async searchHackerNews(
    query: string,
    maxResults: number,
  ): Promise<DataSourceResult[]> {
    try {
      this.logger.log(`[searchHackerNews] Searching: "${query}"`);

      // 通过 ToolRegistry 获取 hackernews-search 工具
      const hackerNewsTool = this.toolRegistry.tryGet("hackernews-search");
      if (!hackerNewsTool) {
        this.logger.error(
          "[searchHackerNews] hackernews-search tool not registered in ToolRegistry",
        );
        return [];
      }

      const result = await hackerNewsTool.execute(
        {
          query,
          maxResults,
          tags: "story", // 只搜索 story 类型，排除评论
        },
        this.createToolContext("hackernews-search"),
      );

      if (!result.success || !result.data) {
        this.logger.warn(
          `[searchHackerNews] No results or error: ${result.error?.message}`,
        );
        return [];
      }

      const hnData = result.data as {
        success: boolean;
        hits: Array<{
          title: string;
          url: string | null;
          hnUrl: string;
          author: string;
          points: number;
          numComments: number;
          createdAt: string;
          storyText: string | null;
        }>;
        totalHits: number;
        query: string;
      };

      if (!hnData.hits || hnData.hits.length === 0) {
        this.logger.warn("[searchHackerNews] No hits in response");
        return [];
      }

      return hnData.hits.map((hit) => ({
        sourceType: DataSourceType.HACKERNEWS,
        title: hit.title,
        // 优先使用原始 URL，如果是文本帖则使用 HN 讨论链接
        url: hit.url || hit.hnUrl,
        snippet:
          hit.storyText ||
          `${hit.points} points | ${hit.numComments} comments by ${hit.author}`,
        publishedAt: hit.createdAt ? new Date(hit.createdAt) : undefined,
        domain: "news.ycombinator.com",
        metadata: {
          author: hit.author,
          points: hit.points,
          comments: hit.numComments,
          hnUrl: hit.hnUrl,
        },
      }));
    } catch (error) {
      this.logger.error(
        `[searchHackerNews] Failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  // ============================================================================
  // ★ 本地知识库（RAG）搜索方法
  // ============================================================================

  /**
   * 本地知识库搜索 (使用 RAG 向量检索)
   * 搜索用户配置的知识库中的相关内容
   *
   * ★ Critical Fix: topic 作为参数传递，避免实例变量的并发竞态
   *
   * @param query 搜索查询
   * @param maxResults 最大结果数
   * @param topic 研究主题（用于获取 knowledgeBaseIds）
   * @returns 数据源结果数组
   */
  private async searchLocal(
    query: string,
    maxResults: number,
    topic?: ResearchTopic,
  ): Promise<DataSourceResult[]> {
    try {
      // 1. 从 topic 配置获取知识库 ID 列表
      const topicConfig = topic?.topicConfig as Record<string, unknown> | null;
      const knowledgeBaseIds = topicConfig?.knowledgeBaseIds as
        | string[]
        | undefined;

      if (!knowledgeBaseIds || knowledgeBaseIds.length === 0) {
        this.logger.debug(
          "[searchLocal] No knowledge bases configured for this topic",
        );
        return [];
      }

      this.logger.log(
        `[searchLocal] Searching ${knowledgeBaseIds.length} knowledge bases: "${query}"`,
      );

      // 2. 生成查询嵌入向量
      const queryEmbedding = await this.aiFacade.embeddingGenerate(query);

      if (!queryEmbedding) {
        this.logger.warn("[searchLocal] Failed to generate query embedding");
        return [];
      }

      // 3. 在指定知识库中进行相似度搜索
      const searchResults = await this.aiFacade.vectorSimilaritySearch(
        queryEmbedding.embedding,
        {
          limit: maxResults,
          threshold: 0.3, // 最小相似度阈值
          knowledgeBaseIds,
        },
      );

      this.logger.log(
        `[searchLocal] Found ${searchResults.length} results from knowledge bases`,
      );

      // ★ 记录知识库匹配日志（用于溯源）
      if (searchResults.length > 0) {
        this.logger.log(
          `[searchLocal] ★ Knowledge base matched! Topic: ${topic?.name}, ` +
            `Query: "${query}", Results: ${searchResults.length}, ` +
            `KBs: [${knowledgeBaseIds.join(", ")}]`,
        );
      }

      // 4. 转换为统一的 DataSourceResult 格式
      return searchResults.map((result) => ({
        sourceType: DataSourceType.LOCAL,
        title: this.extractTitle(result.parentContent || result.content),
        url: `kb://${result.documentId}#${result.childChunkId}`, // 内部链接格式
        snippet: result.content?.slice(0, 500) || "", // 截取前 500 字符
        domain: "knowledge-base",
        metadata: {
          similarity: result.similarity,
          documentId: result.documentId,
          chunkId: result.childChunkId,
          parentChunkId: result.parentChunkId,
          // ★ 标记知识库来源，用于前端展示和溯源
          knowledgeBaseSource: true,
        },
      }));
    } catch (error) {
      this.logger.error(
        `[searchLocal] Failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  /**
   * 从内容中提取标题
   * 尝试从 Markdown 标题或首行提取
   */
  private extractTitle(content: string): string {
    if (!content) return "Knowledge Base Entry";

    // 尝试匹配 Markdown 标题
    const markdownTitleMatch = content.match(/^#+\s+(.+)$/m);
    if (markdownTitleMatch) {
      return markdownTitleMatch[1].slice(0, 100);
    }

    // 使用首行作为标题（截取前 100 字符）
    const firstLine = content.split("\n")[0].trim();
    return firstLine.slice(0, 100) || "Knowledge Base Entry";
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
          congress: this.getCurrentCongress(),
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

  // ==================== Social Media Data Source ====================

  /**
   * ★ X/Twitter 社媒搜索
   * 主方案：使用 Grok Live Search 获取实时社媒热点
   * 降级方案：使用 Web Search + site:x.com
   */
  private async searchSocialX(
    query: string,
    maxResults: number,
  ): Promise<DataSourceResult[]> {
    this.logger.log(`[searchSocialX] Searching: "${query}"`);

    // 主方案：Grok Live Search
    try {
      const results = await this.searchSocialXViaGrok(query, maxResults);
      if (results.length > 0) {
        this.logger.log(
          `[searchSocialX] Grok Live Search returned ${results.length} results`,
        );
        return results;
      }
    } catch (error) {
      this.logger.warn(
        `[searchSocialX] Grok Live Search failed, falling back to web search: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    // 降级方案：Web Search + site:x.com
    return this.searchSocialXViaWebSearch(query, maxResults);
  }

  /**
   * 通过 Grok Live Search 获取 X/Twitter 内容
   */
  private async searchSocialXViaGrok(
    query: string,
    maxResults: number,
    retries = 2,
  ): Promise<DataSourceResult[]> {
    // 检查是否有可用的 Grok 模型
    const aiModels = await this.aiFacade.getAvailableModels();
    const grokModel = aiModels.find(
      (m: { id: string; provider: string }) => m.provider === "xai",
    );

    if (!grokModel) {
      this.logger.warn(
        "[searchSocialXViaGrok] No xAI/Grok model available, skipping",
      );
      return [];
    }

    const systemPrompt = `You are a social media analyst. Search X/Twitter for recent discussions about the given topic.
Return results in JSON format:
{
  "trends": [
    {
      "title": "Brief title describing the discussion point",
      "url": "https://x.com/username/status/xxx",
      "author": "@username",
      "content": "Key quote or summary of the post",
      "engagement": { "likes": 0, "retweets": 0, "replies": 0 },
      "sentiment": "positive|negative|neutral",
      "publishedAt": "2026-01-26"
    }
  ],
  "summary": "Brief overview of the social media discourse",
  "dominantSentiment": "positive|negative|neutral|mixed"
}
Focus on high-engagement posts from credible accounts. Provide ${maxResults} most relevant posts.`;

    const userPrompt = `Search X/Twitter for recent discussions about: "${query}"

Return the ${maxResults} most relevant and high-engagement posts in the specified JSON format.`;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await this.aiFacade.chat({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          model: grokModel.id,
          taskProfile: { creativity: "low", outputLength: "long" },
        });

        const results = this.parseSocialSearchResponse(response.content, query);
        if (results.length > 0) {
          return results;
        }

        this.logger.warn(
          `[searchSocialXViaGrok] Attempt ${attempt + 1}: No results parsed`,
        );
      } catch (error) {
        this.logger.warn(
          `[searchSocialXViaGrok] Attempt ${attempt + 1} failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        if (attempt === retries) throw error;
      }
    }
    return [];
  }

  /**
   * 解析 Grok 社媒搜索响应
   */
  private parseSocialSearchResponse(
    content: string,
    originalQuery: string,
  ): DataSourceResult[] {
    // 尝试多种 JSON 提取模式
    const extractJson = (text: string): string | null => {
      // 模式1：```json ... ```
      const jsonBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonBlockMatch) return jsonBlockMatch[1];

      // 模式2：``` ... ```（无 json 标记）
      const codeBlockMatch = text.match(/```\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch) return codeBlockMatch[1];

      // 模式3：直接 JSON 对象
      const jsonObjectMatch = text.match(/\{[\s\S]*"trends"[\s\S]*\}/);
      if (jsonObjectMatch) return jsonObjectMatch[0];

      return null;
    };

    try {
      const jsonStr = extractJson(content);
      if (!jsonStr) {
        this.logger.warn(
          "[parseSocialSearchResponse] No JSON found in response",
        );
        return this.extractFallbackSocialResults(content, originalQuery);
      }

      const parsed = JSON.parse(jsonStr) as {
        trends?: Array<{
          title?: string;
          url?: string;
          author?: string;
          content?: string;
          engagement?: { likes?: number; retweets?: number; replies?: number };
          sentiment?: string;
          publishedAt?: string;
        }>;
      };

      if (!parsed.trends || !Array.isArray(parsed.trends)) {
        this.logger.warn(
          "[parseSocialSearchResponse] Invalid trends structure",
        );
        return this.extractFallbackSocialResults(content, originalQuery);
      }

      return parsed.trends.map((trend) => ({
        sourceType: DataSourceType.SOCIAL_X,
        title: trend.title || `X 讨论: ${originalQuery}`,
        url: trend.url || "https://x.com",
        snippet: trend.content || "",
        publishedAt: trend.publishedAt
          ? new Date(trend.publishedAt)
          : undefined,
        domain: "x.com",
        metadata: {
          author: trend.author,
          engagement: trend.engagement,
          sentiment: trend.sentiment,
          fetchedVia: "grok-live-search",
        },
      }));
    } catch (error) {
      this.logger.error(
        `[parseSocialSearchResponse] Parse failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return this.extractFallbackSocialResults(content, originalQuery);
    }
  }

  /**
   * JSON 解析失败时的降级提取
   */
  private extractFallbackSocialResults(
    content: string,
    originalQuery: string,
  ): DataSourceResult[] {
    // 尝试从纯文本中提取 URL
    const urlMatches =
      content.match(/https?:\/\/(?:x\.com|twitter\.com)\/\S+/g) || [];

    return urlMatches.slice(0, 5).map((url, index) => ({
      sourceType: DataSourceType.SOCIAL_X,
      title: `X/Twitter 讨论 #${index + 1}`,
      url,
      snippet: `关于「${originalQuery}」的社媒讨论`,
      domain: "x.com",
      metadata: {
        fetchedVia: "grok-live-search-fallback",
        parseMethod: "url-extraction",
      },
    }));
  }

  /**
   * 降级方案：通过 Web Search 获取 X 内容
   */
  private async searchSocialXViaWebSearch(
    query: string,
    maxResults: number,
  ): Promise<DataSourceResult[]> {
    this.logger.log(
      `[searchSocialXViaWebSearch] Fallback searching: "${query}"`,
    );

    try {
      // 使用 web search 工具搜索 X/Twitter 内容
      const socialQuery = `${query} site:x.com OR site:twitter.com`;
      const webResults = await this.searchWeb(socialQuery, maxResults);

      // 转换为 SOCIAL_X 类型
      return webResults.map((result) => ({
        ...result,
        sourceType: DataSourceType.SOCIAL_X,
        domain: "x.com",
        metadata: {
          ...result.metadata,
          fetchedVia: "web-search-fallback",
          sentiment: null, // 降级方案无情感分析
        },
      }));
    } catch (error) {
      this.logger.error(
        `[searchSocialXViaWebSearch] Failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
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
          // 跳过没有 URL 的结果
          if (!item.url) continue;

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
          if (item.title) {
            seenTitles.set(item.title.toLowerCase(), 0.9);
          }
          allResults.push(item);
        }
      }
    }

    // 按可信度评分排序
    const sortedResults = allResults.sort(
      (a, b) =>
        this.calculateCredibilityScore(b) - this.calculateCredibilityScore(a),
    );

    // ★ 域名多样性强制：任何单一域名不超过阈值（默认 30%，学术/官方类话题放宽到 50%）
    const diverseResults = this.enforceDomainDiversity(sortedResults);

    return {
      items: diverseResults,
      totalCount: diverseResults.length,
      sources: sources,
    };
  }

  /**
   * ★ 域名多样性强制
   *
   * 确保搜索结果不被单一域名主导。
   * 如果某域名占比超过阈值，截断多余结果，保留其他域名的结果在前面。
   *
   * @param results 已排序的搜索结果
   * @param maxRatio 单一域名最大占比（默认 0.3 = 30%）
   * @returns 经过多样性调整的结果
   */
  private enforceDomainDiversity(
    results: DataSourceResult[],
    maxRatio: number = 0.3,
  ): DataSourceResult[] {
    if (results.length <= 3) return results;

    // 如果结果主要来自权威来源（.gov, .edu, arxiv, 官方文档），放宽阈值
    const authoritativeDomains = [
      ".gov",
      ".edu",
      "arxiv.org",
      "nature.com",
      "science.org",
      "ieee.org",
      "acm.org",
    ];
    const authoritativeCount = results.filter((r) => {
      const domain = this.extractDomain(r.url);
      return domain && authoritativeDomains.some((ad) => domain.endsWith(ad));
    }).length;
    if (authoritativeCount > results.length * 0.4) {
      maxRatio = Math.max(maxRatio, 0.5);
    }

    // 统计域名分布
    const domainCounts = new Map<string, number>();
    for (const item of results) {
      const domain = this.extractDomain(item.url);
      if (domain) {
        domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
      }
    }

    const maxPerDomain = Math.max(
      2, // 至少保留 2 条
      Math.ceil(results.length * maxRatio),
    );

    // 检查是否有域名超标
    const overRepresented = Array.from(domainCounts.entries()).filter(
      ([, count]) => count > maxPerDomain,
    );

    if (overRepresented.length === 0) return results;

    // 记录超标域名
    for (const [domain, count] of overRepresented) {
      this.logger.warn(
        `[enforceDomainDiversity] Domain "${domain}" has ${count}/${results.length} results (${Math.round((count / results.length) * 100)}%), capping at ${maxPerDomain}`,
      );
    }

    // 按域名计数过滤
    const domainSeen = new Map<string, number>();
    return results.filter((item) => {
      const domain = this.extractDomain(item.url);
      if (!domain) return true;
      const seen = domainSeen.get(domain) || 0;
      if (seen >= maxPerDomain) return false;
      domainSeen.set(domain, seen + 1);
      return true;
    });
  }

  /**
   * 从 URL 提取域名
   */
  private extractDomain(url: string): string | null {
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.replace(/^www\./, "");
      // 排除 localhost 和 IP 地址，不参与域名多样性计算
      if (hostname === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
        return null;
      }
      return hostname;
    } catch (error) {
      this.logger.debug(`[extractDomain] Invalid URL: ${error}`);
      return null;
    }
  }

  /**
   * URL 标准化
   */
  private normalizeUrl(url: string): string {
    if (!url) return "";
    try {
      const parsed = new URL(url);
      // 移除 tracking 参数
      parsed.searchParams.delete("utm_source");
      parsed.searchParams.delete("utm_medium");
      parsed.searchParams.delete("utm_campaign");
      parsed.searchParams.delete("ref");
      // 标准化协议和移除尾部斜杠
      return parsed.toString().replace(/\/$/, "").toLowerCase();
    } catch (error) {
      this.logger.debug(`[normalizeUrl] Failed to normalize URL: ${error}`);
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
    if (!title) return false;
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
    if (!title1 || !title2) return 0;
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
      [DataSourceType.ACADEMIC]: 100,
      [DataSourceType.GITHUB]: 85,
      [DataSourceType.WEB]: 70,
      [DataSourceType.HACKERNEWS]: 75,
      [DataSourceType.RSS]: 65,
      [DataSourceType.LOCAL]: 80,
      [DataSourceType.FEDERAL_REGISTER]: 95,
      [DataSourceType.CONGRESS]: 95,
      [DataSourceType.WHITEHOUSE]: 90,
      [DataSourceType.SOCIAL_X]: 60,
      [DataSourceType.SEMANTIC_SCHOLAR]: 100,
      [DataSourceType.PUBMED]: 95,
      [DataSourceType.FINANCE_API]: 85,
      [DataSourceType.WEATHER_API]: 75,
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
   * 将 DataSourceType 映射到 Tool ID（委托到集中配置）
   */
  private dataSourceToToolId(source: DataSourceType): string | null {
    return dataSourceToToolId(source);
  }

  /**
   * 将 Leader 分配的工具列表转换为数据源类型列表（委托到集中配置）
   */
  private convertToolsToDataSources(tools: string[]): DataSourceType[] {
    return convertToolsToDataSources(tools);
  }

  /**
   * 检查工具是否被 Admin 启用
   */
  private async isToolEnabled(toolId: string): Promise<boolean> {
    try {
      // 使用空上下文，只检查全局配置
      const availableTools = await this.aiFacade.capabilityResolveTools({});
      return availableTools.includes(toolId);
    } catch (error) {
      this.logger.error(
        `[isToolEnabled] Failed to check tool ${toolId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      // ★ 安全优先：发生错误时默认禁用，避免使用未授权的工具
      return false;
    }
  }

  // ==================== AI Planning Integration ====================

  /**
   * 获取维度的 AI 数据源规划
   * ★ Major Fix: 使用 LRU-style 缓存避免重复规划，防止内存泄漏
   */
  private async getAIPlanForDimension(
    dimension: TopicDimension,
    topic: ResearchTopic,
  ): Promise<DataSourcePlan> {
    const cacheKey = `${topic.id}:${dimension.id}`;

    // 检查缓存
    if (this.planCache.has(cacheKey)) {
      this.logger.debug(
        `[getAIPlanForDimension] Using cached plan for ${cacheKey}`,
      );
      // LRU: 移动到队列末尾
      const idx = this.planCacheOrder.indexOf(cacheKey);
      if (idx > -1) {
        this.planCacheOrder.splice(idx, 1);
        this.planCacheOrder.push(cacheKey);
      }
      return this.planCache.get(cacheKey)!;
    }

    // 获取可用的数据源类型
    const availableDataSources = Object.values(DataSourceType);

    // 调用 AI 规划器
    const plan = await this.dataSourcePlanner.planDataSources({
      topicName: topic.name,
      topicType: topic.type,
      dimensionName: dimension.name,
      dimensionDescription: dimension.description || dimension.name,
      searchQueries: dimension.searchQueries as string[] | undefined,
      availableDataSources,
    });

    // ★ LRU 缓存: 超出容量时删除最早的条目
    if (this.planCache.size >= DataSourceRouterService.PLAN_CACHE_MAX_SIZE) {
      const oldestKey = this.planCacheOrder.shift();
      if (oldestKey) {
        this.planCache.delete(oldestKey);
        this.logger.debug(
          `[getAIPlanForDimension] Cache evicted: ${oldestKey}`,
        );
      }
    }

    // 缓存结果
    this.planCache.set(cacheKey, plan);
    this.planCacheOrder.push(cacheKey);

    return plan;
  }

  /**
   * 清除 AI 规划缓存
   * 在研究任务完成或取消时调用
   */
  clearPlanCache(topicId?: string): void {
    if (topicId) {
      // 清除指定主题的缓存
      for (const key of this.planCache.keys()) {
        if (key.startsWith(`${topicId}:`)) {
          this.planCache.delete(key);
        }
      }
    } else {
      // 清除所有缓存
      this.planCache.clear();
    }
  }

  /**
   * 计算当前国会届次
   */
  private getCurrentCongress(): number {
    const year = new Date().getFullYear();
    return Math.floor((year - 1789) / 2) + 1;
  }

  /**
   * 获取 AI 规划的数据源能力描述
   * 用于前端展示
   */
  getDataSourceCapabilities() {
    return this.dataSourcePlanner.getDataSourceCapabilities();
  }
}
