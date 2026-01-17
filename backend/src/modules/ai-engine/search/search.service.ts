import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { PrismaService } from "../../../common/prisma/prisma.service";
import * as duckDuckScrape from "duck-duck-scrape";

export interface SearchResult {
  title: string;
  url: string;
  content: string;
  score?: number;
  publishedDate?: string;
  domain?: string;
  rawScore?: number;
}

export interface SearchResponse {
  success: boolean;
  results: SearchResult[];
  error?: string;
  /** 实际使用的搜索提供商 */
  provider?: string;
}

/** 需要触发自动降级的 HTTP 状态码 */
const FAILOVER_STATUS_CODES = [401, 429, 432, 500, 502, 503, 504];

/** 搜索提供商优先级顺序 */
type SearchProvider = "tavily" | "serper" | "duckduckgo";

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 判断错误是否需要触发降级
   */
  private shouldFailover(error: any): boolean {
    const statusCode = error.response?.status;
    // 网络超时、连接失败、或特定状态码都应该降级
    if (!statusCode) return true; // 网络错误
    return FAILOVER_STATUS_CODES.includes(statusCode);
  }

  /**
   * Search for real-time information using configured search API
   * ★ 支持自动降级：主 Provider 失败时自动切换到备用 Provider
   *
   * @param query - Search query string
   * @param maxResults - Maximum number of results to return
   * @param since - Optional date to filter results (only return results newer than this date)
   */
  async search(
    query: string,
    maxResults: number = 5,
    since?: Date,
  ): Promise<SearchResponse> {
    // Get search API configuration from system settings
    const searchConfig = await this.getSearchConfig();

    // 构建降级链：配置的 Provider → 备用 Provider → DuckDuckGo
    const failoverChain = this.buildFailoverChain(searchConfig);

    let lastError: any = null;

    for (const provider of failoverChain) {
      try {
        const result = await this.executeSearch(
          provider,
          query,
          maxResults,
          since,
          searchConfig,
        );

        if (result.success) {
          return { ...result, provider };
        }

        // 搜索返回失败但没有抛出异常（如无结果），继续尝试下一个
        this.logger.warn(
          `[Search] ${provider} returned unsuccessful: ${result.error}`,
        );
        lastError = new Error(result.error);
      } catch (error: any) {
        lastError = error;
        const statusCode = error.response?.status;
        const errorMessage =
          error.response?.data?.message ||
          error.response?.data?.error ||
          error.message;

        this.logger.warn(
          `[Search] ${provider} failed (HTTP ${statusCode || "network"}): ${errorMessage}`,
        );

        // 判断是否需要降级
        if (this.shouldFailover(error)) {
          this.logger.log(
            `[Search] Failing over from ${provider} to next provider...`,
          );
          continue; // 尝试下一个 Provider
        }

        // 非降级错误（如 400 Bad Request），直接返回错误
        return {
          success: false,
          results: [],
          error: errorMessage,
          provider,
        };
      }
    }

    // 所有 Provider 都失败了
    const finalError =
      lastError?.response?.data?.message ||
      lastError?.message ||
      "All search providers failed";
    this.logger.error(
      `[Search] All providers exhausted. Final error: ${finalError}`,
    );

    return {
      success: false,
      results: [],
      error: finalError,
    };
  }

  /**
   * 构建降级链
   * 优先级：用户配置的 Provider → 备用付费 Provider → DuckDuckGo（免费兜底）
   */
  private buildFailoverChain(searchConfig: {
    provider: string;
    apiKey: string | null;
    tavilyKey?: string | null;
    serperKey?: string | null;
  }): SearchProvider[] {
    const chain: SearchProvider[] = [];
    const tavilyKey =
      searchConfig.tavilyKey ||
      (searchConfig.provider === "tavily" ? searchConfig.apiKey : null);
    const serperKey =
      searchConfig.serperKey ||
      (searchConfig.provider === "serper" ? searchConfig.apiKey : null);

    // 1. 用户配置的首选 Provider
    if (searchConfig.provider === "tavily" && tavilyKey) {
      chain.push("tavily");
    } else if (searchConfig.provider === "serper" && serperKey) {
      chain.push("serper");
    } else if (searchConfig.provider === "duckduckgo") {
      chain.push("duckduckgo");
    }

    // 2. 备用付费 Provider
    if (!chain.includes("tavily") && tavilyKey) {
      chain.push("tavily");
    }
    if (!chain.includes("serper") && serperKey) {
      chain.push("serper");
    }

    // 3. DuckDuckGo 作为最终兜底（免费，无需 API Key）
    if (!chain.includes("duckduckgo")) {
      chain.push("duckduckgo");
    }

    this.logger.debug(`[Search] Failover chain: ${chain.join(" → ")}`);
    return chain;
  }

  /**
   * 执行搜索
   */
  private async executeSearch(
    provider: SearchProvider,
    query: string,
    maxResults: number,
    since: Date | undefined,
    searchConfig: {
      apiKey: string | null;
      tavilyKey?: string | null;
      serperKey?: string | null;
    },
  ): Promise<SearchResponse> {
    switch (provider) {
      case "tavily": {
        const apiKey = searchConfig.tavilyKey || searchConfig.apiKey;
        if (!apiKey) {
          throw new Error("Tavily API key not configured");
        }
        return await this.searchWithTavily(query, apiKey, maxResults, since);
      }
      case "serper": {
        const apiKey = searchConfig.serperKey || searchConfig.apiKey;
        if (!apiKey) {
          throw new Error("Serper API key not configured");
        }
        return await this.searchWithSerper(query, apiKey, maxResults, since);
      }
      case "duckduckgo":
        return await this.searchWithDuckduckgo(query, maxResults, since);
      default:
        throw new Error(`Unknown search provider: ${provider}`);
    }
  }

  /**
   * Get search API configuration from database, fallback to environment variables
   * ★ 返回所有可用的 API Key 以支持自动降级
   */
  private async getSearchConfig(): Promise<{
    provider: string;
    apiKey: string | null;
    enabled: boolean;
    tavilyKey: string | null;
    serperKey: string | null;
  }> {
    // Environment variable keys
    const tavilyEnvKey = process.env.TAVILY_API_KEY;
    const serperEnvKey = process.env.SERPER_API_KEY;

    try {
      // Try to get from database first
      const settings = await this.prisma.systemSetting.findMany({
        where: {
          key: {
            in: [
              "search.provider",
              "search.enabled",
              "search.tavily.apiKey",
              "search.serper.apiKey",
            ],
          },
        },
      });

      const settingsMap: Record<string, any> = {};
      for (const s of settings) {
        try {
          if (s.value) settingsMap[s.key] = JSON.parse(s.value);
        } catch {
          settingsMap[s.key] = s.value;
        }
      }

      // Check if search is disabled in database
      if (
        settingsMap["search.enabled"] === false ||
        settingsMap["search.enabled"] === "false"
      ) {
        return {
          provider: "tavily",
          apiKey: null,
          enabled: false,
          tavilyKey: null,
          serperKey: null,
        };
      }

      // Get provider from database (user's configured default)
      const provider = settingsMap["search.provider"] || "tavily";

      // ★ 获取所有可用的 API Key（用于降级链）
      const tavilyKey =
        settingsMap["search.tavily.apiKey"] || tavilyEnvKey || null;
      const serperKey =
        settingsMap["search.serper.apiKey"] || serperEnvKey || null;

      // Get API key based on configured provider
      let apiKey: string | null = null;
      if (provider === "tavily") {
        apiKey = tavilyKey;
      } else if (provider === "serper") {
        apiKey = serperKey;
      }

      this.logger.debug(
        `[Search] Config: provider=${provider}, tavily=${tavilyKey ? "configured" : "none"}, serper=${serperKey ? "configured" : "none"}`,
      );

      return {
        provider,
        apiKey,
        enabled: true,
        tavilyKey,
        serperKey,
      };
    } catch (error) {
      this.logger.warn(
        "Failed to get search config from database, using env vars",
      );
    }

    // Fallback to environment variables when DB access fails
    return {
      provider: tavilyEnvKey
        ? "tavily"
        : serperEnvKey
          ? "serper"
          : "duckduckgo",
      apiKey: tavilyEnvKey || serperEnvKey || null,
      enabled: true,
      tavilyKey: tavilyEnvKey || null,
      serperKey: serperEnvKey || null,
    };
  }

  /**
   * Search using Tavily API with advanced options
   * https://tavily.com/
   */
  private async searchWithTavily(
    query: string,
    apiKey: string,
    maxResults: number,
    since?: Date,
  ): Promise<SearchResponse> {
    this.logger.debug(`Searching with Tavily: "${query}"`);

    // Request more results for better ranking/filtering
    const requestedResults = Math.min(maxResults * 2, 20);

    // ★ Calculate days parameter for time range filtering
    let days: number | undefined;
    if (since) {
      const now = new Date();
      const diffMs = now.getTime() - since.getTime();
      days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      this.logger.debug(`Tavily: filtering results to last ${days} days`);
    }

    const requestBody: Record<string, unknown> = {
      api_key: apiKey,
      query,
      max_results: requestedResults,
      search_depth: "advanced", // Use advanced for better quality
      include_answer: false,
      include_raw_content: false,
      include_domains: [], // Allow all domains for diversity
      exclude_domains: [], // No exclusions
    };

    // ★ Add days parameter if time range is specified
    if (days && days > 0) {
      requestBody.days = days;
    }

    const response = await firstValueFrom(
      this.httpService.post("https://api.tavily.com/search", requestBody, {
        headers: { "Content-Type": "application/json" },
        timeout: 30000,
      }),
    );

    const rawResults: SearchResult[] = (response.data.results || []).map(
      (r: any) => ({
        title: r.title,
        url: r.url,
        content: r.content,
        rawScore: r.score,
        domain: this.extractDomain(r.url),
        publishedDate: r.published_date,
      }),
    );

    // Apply comprehensive ranking algorithm
    const rankedResults = this.rankSearchResults(rawResults, query, maxResults);

    this.logger.debug(
      `Tavily returned ${rawResults.length} results, ranked to ${rankedResults.length}`,
    );
    return { success: true, results: rankedResults };
  }

  /**
   * Extract domain from URL
   */
  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  }

  /**
   * Comprehensive ranking algorithm based on industry best practices
   * Factors: Relevance, Freshness, Quality, Diversity
   */
  private rankSearchResults(
    results: SearchResult[],
    query: string,
    maxResults: number,
  ): SearchResult[] {
    const queryTerms = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2);

    // Score each result
    const scoredResults = results.map((result) => {
      let finalScore = 0;

      // 1. Relevance Score (40% weight) - Based on Tavily score + keyword matching
      const relevanceScore = this.calculateRelevanceScore(result, queryTerms);
      finalScore += relevanceScore * 0.4;

      // 2. Quality Score (30% weight) - Domain authority, content length
      const qualityScore = this.calculateQualityScore(result);
      finalScore += qualityScore * 0.3;

      // 3. Freshness Score (20% weight) - Recent content preferred
      const freshnessScore = this.calculateFreshnessScore(result);
      finalScore += freshnessScore * 0.2;

      // 4. Content Depth Score (10% weight) - Longer, more detailed content
      const depthScore = this.calculateDepthScore(result);
      finalScore += depthScore * 0.1;

      return {
        ...result,
        score: finalScore,
      };
    });

    // Sort by score descending
    scoredResults.sort((a, b) => (b.score || 0) - (a.score || 0));

    // Apply diversity filter - ensure variety across domains
    const diverseResults = this.applyDiversityFilter(scoredResults, maxResults);

    return diverseResults;
  }

  /**
   * Calculate relevance score based on query matching
   */
  private calculateRelevanceScore(
    result: SearchResult,
    queryTerms: string[],
  ): number {
    let score = 0;

    // Start with Tavily's raw score if available
    if (result.rawScore) {
      score = result.rawScore * 50; // Tavily scores are typically 0-1
    }

    const titleLower = (result.title || "").toLowerCase();
    const contentLower = (result.content || "").toLowerCase();

    for (const term of queryTerms) {
      // Title match (high weight)
      if (titleLower.includes(term)) {
        score += 20;
        // Exact word match bonus
        if (new RegExp(`\\b${term}\\b`).test(titleLower)) {
          score += 10;
        }
      }

      // Content match
      if (contentLower.includes(term)) {
        score += 10;
      }
    }

    // All terms match bonus
    if (queryTerms.every((term) => titleLower.includes(term))) {
      score += 25;
    }

    return Math.min(score, 100);
  }

  /**
   * Calculate quality score based on domain authority
   */
  private calculateQualityScore(result: SearchResult): number {
    let score = 50; // Base score
    const domain = result.domain || "";

    // High-authority domains (research, major news, official sources)
    const highAuthorityDomains = [
      // Academic & Research
      "arxiv.org",
      "nature.com",
      "science.org",
      "ieee.org",
      "acm.org",
      "researchgate.net",
      "scholar.google.com",
      "pubmed.ncbi.nlm.nih.gov",
      "journals.plos.org",
      "springer.com",
      "wiley.com",
      "elsevier.com",
      // Tech & Industry
      "techcrunch.com",
      "wired.com",
      "arstechnica.com",
      "theverge.com",
      "venturebeat.com",
      "zdnet.com",
      "cnet.com",
      "engadget.com",
      // Major News (Global)
      "reuters.com",
      "bloomberg.com",
      "ft.com",
      "wsj.com",
      "nytimes.com",
      "theguardian.com",
      "bbc.com",
      "economist.com",
      "forbes.com",
      // Analysis & Reports
      "mckinsey.com",
      "bcg.com",
      "hbr.org",
      "gartner.com",
      "forrester.com",
      "statista.com",
      "idc.com",
      "cb-insights.com",
      // Official
      "github.com",
      "stackoverflow.com",
      "medium.com",
      "dev.to",
    ];

    // Medium authority domains
    const mediumAuthorityDomains = [
      "wikipedia.org",
      "linkedin.com",
      "twitter.com",
      "reddit.com",
      "quora.com",
      "hackernews.com",
      "slashdot.org",
    ];

    // Low quality domains to deprioritize
    const lowQualityPatterns = [
      "pinterest",
      "facebook.com/",
      "instagram.com",
      "tiktok.com",
      "yelp.com",
      "tripadvisor",
    ];

    if (highAuthorityDomains.some((d) => domain.includes(d))) {
      score += 40;
    } else if (mediumAuthorityDomains.some((d) => domain.includes(d))) {
      score += 20;
    }

    // Penalize low-quality sources
    if (lowQualityPatterns.some((p) => domain.includes(p))) {
      score -= 30;
    }

    // Bonus for .edu, .gov, .org domains
    if (domain.endsWith(".edu") || domain.endsWith(".gov")) {
      score += 25;
    } else if (domain.endsWith(".org")) {
      score += 10;
    }

    return Math.max(0, Math.min(score, 100));
  }

  /**
   * Calculate freshness score (prefer recent content)
   */
  private calculateFreshnessScore(result: SearchResult): number {
    if (!result.publishedDate) {
      return 50; // Unknown date gets neutral score
    }

    try {
      const pubDate = new Date(result.publishedDate);
      const now = new Date();
      const daysDiff =
        (now.getTime() - pubDate.getTime()) / (1000 * 60 * 60 * 24);

      if (daysDiff <= 7) return 100; // Last week
      if (daysDiff <= 30) return 85; // Last month
      if (daysDiff <= 90) return 70; // Last quarter
      if (daysDiff <= 180) return 55; // Last 6 months
      if (daysDiff <= 365) return 40; // Last year
      return 25; // Older content
    } catch {
      return 50;
    }
  }

  /**
   * Calculate content depth score
   */
  private calculateDepthScore(result: SearchResult): number {
    const contentLength = (result.content || "").length;

    if (contentLength >= 400) return 100;
    if (contentLength >= 300) return 80;
    if (contentLength >= 200) return 60;
    if (contentLength >= 100) return 40;
    return 20;
  }

  /**
   * Apply diversity filter to ensure variety across domains
   * Limits results from same domain while maintaining top results
   */
  private applyDiversityFilter(
    results: SearchResult[],
    maxResults: number,
  ): SearchResult[] {
    const domainCounts = new Map<string, number>();
    const maxPerDomain = 2; // Maximum results from same domain
    const diverseResults: SearchResult[] = [];

    for (const result of results) {
      if (diverseResults.length >= maxResults) break;

      const domain = result.domain || "unknown";
      const currentCount = domainCounts.get(domain) || 0;

      if (currentCount < maxPerDomain) {
        diverseResults.push(result);
        domainCounts.set(domain, currentCount + 1);
      }
    }

    // If we don't have enough results, add more (allow duplicates)
    if (diverseResults.length < maxResults) {
      for (const result of results) {
        if (diverseResults.length >= maxResults) break;
        if (!diverseResults.includes(result)) {
          diverseResults.push(result);
        }
      }
    }

    return diverseResults;
  }

  /**
   * Search using Serper API (Google Search)
   * https://serper.dev/
   */
  private async searchWithSerper(
    query: string,
    apiKey: string,
    maxResults: number,
    since?: Date,
  ): Promise<SearchResponse> {
    this.logger.debug(`Searching with Serper: "${query}"`);

    // ★ Calculate time range for Google search (tbs parameter)
    let tbs: string | undefined;
    if (since) {
      const now = new Date();
      const diffMs = now.getTime() - since.getTime();
      const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      // Google tbs parameter: qdr:d (day), qdr:w (week), qdr:m (month), qdr:y (year)
      if (days <= 1) {
        tbs = "qdr:d";
      } else if (days <= 7) {
        tbs = "qdr:w";
      } else if (days <= 30) {
        tbs = "qdr:m";
      } else if (days <= 365) {
        tbs = "qdr:y";
      }
      // For longer periods, no tbs parameter (all time)
      this.logger.debug(`Serper: using time filter tbs=${tbs || "all time"}`);
    }

    const requestBody: Record<string, unknown> = {
      q: query,
      num: maxResults,
    };

    // ★ Add time range parameter if specified
    if (tbs) {
      requestBody.tbs = tbs;
    }

    const response = await firstValueFrom(
      this.httpService.post("https://google.serper.dev/search", requestBody, {
        headers: {
          "X-API-KEY": apiKey,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }),
    );

    const results: SearchResult[] = (response.data.organic || []).map(
      (r: any) => ({
        title: r.title,
        url: r.link,
        content: r.snippet,
        domain: this.extractDomain(r.link),
        // ★ Serper returns date in organic results
        publishedDate: r.date || undefined,
      }),
    );

    // ★ Apply ranking for consistency with other providers
    const rankedResults = this.rankSearchResults(results, query, maxResults);

    this.logger.debug(
      `Serper returned ${results.length} results, ranked to ${rankedResults.length}`,
    );
    return { success: true, results: rankedResults };
  }

  /**
   * Search using DuckDuckGo (no API key required)
   * Uses duck-duck-scrape library
   */
  private async searchWithDuckduckgo(
    query: string,
    maxResults: number,
    since?: Date,
  ): Promise<SearchResponse> {
    this.logger.debug(`Searching with DuckDuckGo: "${query}"`);

    try {
      // ★ Calculate time filter for DuckDuckGo
      let timeFilter: duckDuckScrape.SearchTimeType | undefined;
      if (since) {
        const now = new Date();
        const diffMs = now.getTime() - since.getTime();
        const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        if (days <= 1) {
          timeFilter = duckDuckScrape.SearchTimeType.DAY;
        } else if (days <= 7) {
          timeFilter = duckDuckScrape.SearchTimeType.WEEK;
        } else if (days <= 30) {
          timeFilter = duckDuckScrape.SearchTimeType.MONTH;
        } else if (days <= 365) {
          timeFilter = duckDuckScrape.SearchTimeType.YEAR;
        }
        this.logger.debug(
          `DuckDuckGo: using time filter ${timeFilter || "all time"}`,
        );
      }

      const searchOptions: duckDuckScrape.SearchOptions = {
        safeSearch: duckDuckScrape.SafeSearchType.MODERATE,
      };

      // ★ Add time filter if specified
      if (timeFilter) {
        searchOptions.time = timeFilter;
      }

      const searchResults = await duckDuckScrape.search(query, searchOptions);

      if (searchResults.noResults) {
        this.logger.debug("DuckDuckGo returned no results");
        return { success: true, results: [] };
      }

      const rawResults: SearchResult[] = searchResults.results
        .slice(0, maxResults * 2) // Get more for ranking
        .map((r) => ({
          title: r.title,
          url: r.url,
          content: r.description || r.rawDescription || "",
          domain: r.hostname,
        }));

      // Apply ranking algorithm
      const rankedResults = this.rankSearchResults(
        rawResults,
        query,
        maxResults,
      );

      this.logger.debug(
        `DuckDuckGo returned ${searchResults.results.length} results, ranked to ${rankedResults.length}`,
      );
      return { success: true, results: rankedResults };
    } catch (error: any) {
      this.logger.error(`DuckDuckGo search failed: ${error.message}`);
      return {
        success: false,
        results: [],
        error: `DuckDuckGo search failed: ${error.message}`,
      };
    }
  }

  /**
   * Format search results for AI context injection
   */
  formatResultsForContext(results: SearchResult[]): string {
    if (results.length === 0) return "";

    const formatted = results
      .map(
        (r, i) => `${i + 1}. **${r.title}**\n   URL: ${r.url}\n   ${r.content}`,
      )
      .join("\n\n");

    return `## Web Search Results\nRecent information from the web:\n\n${formatted}`;
  }

  /**
   * Extract URLs from text content
   */
  extractUrls(text: string): string[] {
    const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
    const matches = text.match(urlRegex) || [];
    // Remove trailing punctuation that might be captured
    return matches.map((url) => url.replace(/[.,;:!?)]+$/, ""));
  }

  /**
   * Fetch content from a URL and extract main text
   */
  async fetchUrlContent(url: string): Promise<{
    success: boolean;
    title?: string;
    content?: string;
    error?: string;
  }> {
    try {
      this.logger.debug(`Fetching URL content: ${url}`);

      const response = await firstValueFrom(
        this.httpService.get(url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
          },
          timeout: 15000,
          maxRedirects: 5,
        }),
      );

      const html = response.data;
      if (!html || typeof html !== "string") {
        return { success: false, error: "No HTML content received" };
      }

      // Extract title
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : url;

      // Extract main content - remove scripts, styles, and HTML tags
      let content = html
        // Remove script tags and content
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
        // Remove style tags and content
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
        // Remove HTML comments
        .replace(/<!--[\s\S]*?-->/g, "")
        // Remove all HTML tags
        .replace(/<[^>]+>/g, " ")
        // Decode HTML entities
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        // Normalize whitespace
        .replace(/\s+/g, " ")
        .trim();

      // Limit content length for AI context
      // CRITICAL FIX: Reduced from 8000 to 3000 to prevent context overflow
      if (content.length > 3000) {
        content = content.substring(0, 3000) + "...";
      }

      this.logger.debug(
        `Fetched URL content: ${title} (${content.length} chars)`,
      );

      return { success: true, title, content };
    } catch (error: any) {
      const errorMessage = error.response?.status
        ? `HTTP ${error.response.status}: ${error.response.statusText}`
        : error.message;
      this.logger.error(`Failed to fetch URL ${url}: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Fetch multiple URLs and format for AI context
   */
  async fetchUrlsForContext(urls: string[]): Promise<string> {
    if (urls.length === 0) return "";

    const results: string[] = [];

    // Limit to 3 URLs to avoid context overflow
    const urlsToFetch = urls.slice(0, 3);

    for (const url of urlsToFetch) {
      const result = await this.fetchUrlContent(url);
      if (result.success && result.content) {
        results.push(
          `### ${result.title || url}\nURL: ${url}\n\n${result.content}`,
        );
      }
    }

    if (results.length === 0) return "";

    return `## Fetched Web Page Content\nThe following content was fetched from URLs mentioned in the conversation:\n\n${results.join("\n\n---\n\n")}`;
  }
}
