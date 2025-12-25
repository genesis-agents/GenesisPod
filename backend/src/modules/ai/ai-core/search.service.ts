import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { PrismaService } from "../../../common/prisma/prisma.service";

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
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Search for real-time information using configured search API
   */
  async search(query: string, maxResults: number = 5): Promise<SearchResponse> {
    // Get search API configuration from system settings
    const searchConfig = await this.getSearchConfig();

    if (!searchConfig.apiKey) {
      this.logger.warn("Search API key not configured");
      return {
        success: false,
        results: [],
        error: "Search API not configured",
      };
    }

    try {
      switch (searchConfig.provider) {
        case "tavily":
          return await this.searchWithTavily(
            query,
            searchConfig.apiKey,
            maxResults,
          );
        case "serper":
          return await this.searchWithSerper(
            query,
            searchConfig.apiKey,
            maxResults,
          );
        default:
          return await this.searchWithTavily(
            query,
            searchConfig.apiKey,
            maxResults,
          );
      }
    } catch (error: any) {
      this.logger.error(`Search failed: ${error.message}`);
      return {
        success: false,
        results: [],
        error: error.response?.data?.message || error.message,
      };
    }
  }

  /**
   * Get search API configuration from database, fallback to environment variables
   */
  private async getSearchConfig(): Promise<{
    provider: string;
    apiKey: string | null;
    enabled: boolean;
  }> {
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
        return { provider: "tavily", apiKey: null, enabled: false };
      }

      const provider = settingsMap["search.provider"] || "tavily";

      // Get API key based on provider
      let apiKey: string | null = null;
      if (provider === "tavily") {
        apiKey = settingsMap["search.tavily.apiKey"] || null;
      } else if (provider === "serper") {
        apiKey = settingsMap["search.serper.apiKey"] || null;
      }

      // If database has config, use it
      if (apiKey) {
        return { provider, apiKey, enabled: true };
      }
    } catch (error) {
      this.logger.warn(
        "Failed to get search config from database, using env vars",
      );
    }

    // Fallback to environment variables
    const tavilyKey = process.env.TAVILY_API_KEY;
    const serperKey = process.env.SERPER_API_KEY;

    if (tavilyKey) {
      return { provider: "tavily", apiKey: tavilyKey, enabled: true };
    }
    if (serperKey) {
      return { provider: "serper", apiKey: serperKey, enabled: true };
    }

    return { provider: "tavily", apiKey: null, enabled: true };
  }

  /**
   * Search using Tavily API with advanced options
   * https://tavily.com/
   */
  private async searchWithTavily(
    query: string,
    apiKey: string,
    maxResults: number,
  ): Promise<SearchResponse> {
    this.logger.debug(`Searching with Tavily: "${query}"`);

    // Request more results for better ranking/filtering
    const requestedResults = Math.min(maxResults * 2, 20);

    const response = await firstValueFrom(
      this.httpService.post(
        "https://api.tavily.com/search",
        {
          api_key: apiKey,
          query,
          max_results: requestedResults,
          search_depth: "advanced", // Use advanced for better quality
          include_answer: false,
          include_raw_content: false,
          include_domains: [], // Allow all domains for diversity
          exclude_domains: [], // No exclusions
        },
        {
          headers: { "Content-Type": "application/json" },
          timeout: 30000,
        },
      ),
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
  ): Promise<SearchResponse> {
    this.logger.debug(`Searching with Serper: "${query}"`);

    const response = await firstValueFrom(
      this.httpService.post(
        "https://google.serper.dev/search",
        {
          q: query,
          num: maxResults,
        },
        {
          headers: {
            "X-API-KEY": apiKey,
            "Content-Type": "application/json",
          },
          timeout: 30000,
        },
      ),
    );

    const results: SearchResult[] = (response.data.organic || []).map(
      (r: any) => ({
        title: r.title,
        url: r.link,
        content: r.snippet,
      }),
    );

    this.logger.debug(`Serper returned ${results.length} results`);
    return { success: true, results };
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
