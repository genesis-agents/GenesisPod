import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { InputJsonValue } from "@prisma/client/runtime/library";
import { SearchService } from "../../ai-engine/search/search.service";
import { AddSourceDto, SearchSourcesDto } from "./dto";
import { FileParserService } from "./services/file-parser.service";

@Injectable()
export class AiStudioSourceService {
  private readonly logger = new Logger(AiStudioSourceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly searchService: SearchService,
    private readonly fileParserService: FileParserService,
  ) {}

  /**
   * Add a source to a project (with deduplication)
   */
  async addSource(userId: string, projectId: string, dto: AddSourceDto) {
    // Verify project ownership
    const project = await this.prisma.researchProject.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException("Project not found");
    }

    if (project.userId !== userId) {
      throw new ForbiddenException("Access denied");
    }

    // Check for duplicates by title or sourceUrl
    const existingSource = await this.findDuplicateSource(
      projectId,
      dto.title,
      dto.sourceUrl,
      dto.resourceId,
    );

    if (existingSource) {
      this.logger.log(
        `Source already exists in project: ${existingSource.title}`,
      );
      // Return existing source instead of creating duplicate
      return existingSource;
    }

    const source = await this.prisma.researchProjectSource.create({
      data: {
        projectId,
        title: dto.title,
        sourceType: dto.sourceType,
        sourceUrl: dto.sourceUrl,
        abstract: dto.abstract,
        content: dto.content,
        authors: dto.authors,
        publishedAt: dto.publishedAt ? new Date(dto.publishedAt) : null,
        metadata: (dto.metadata || {}) as unknown as InputJsonValue,
        resourceId: dto.resourceId,
        analysisStatus: "PENDING",
      },
    });

    // Update source count
    await this.prisma.researchProject.update({
      where: { id: projectId },
      data: {
        sourceCount: { increment: 1 },
      },
    });

    return source;
  }

  /**
   * Find duplicate source in project by title, URL, or resourceId
   */
  private async findDuplicateSource(
    projectId: string,
    title: string,
    sourceUrl?: string | null,
    resourceId?: string | null,
  ) {
    const conditions: any[] = [];

    // Check by exact title match (case-insensitive)
    if (title) {
      conditions.push({ title: { equals: title, mode: "insensitive" } });
    }

    // Check by sourceUrl if provided
    if (sourceUrl) {
      conditions.push({
        sourceUrl: { equals: sourceUrl, mode: "insensitive" },
      });
    }

    // Check by resourceId if provided
    if (resourceId) {
      conditions.push({ resourceId: resourceId });
    }

    if (conditions.length === 0) {
      return null;
    }

    return this.prisma.researchProjectSource.findFirst({
      where: {
        projectId,
        OR: conditions,
      },
    });
  }

  /**
   * Add multiple sources to a project (with deduplication)
   */
  async addSources(userId: string, projectId: string, sources: AddSourceDto[]) {
    // Verify project ownership
    const project = await this.prisma.researchProject.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException("Project not found");
    }

    if (project.userId !== userId) {
      throw new ForbiddenException("Access denied");
    }

    // Filter out duplicates
    const uniqueSources: AddSourceDto[] = [];
    for (const dto of sources) {
      const existingSource = await this.findDuplicateSource(
        projectId,
        dto.title,
        dto.sourceUrl,
        dto.resourceId,
      );
      if (!existingSource) {
        // Also check for duplicates within the batch
        const isDuplicateInBatch = uniqueSources.some(
          (s) =>
            s.title.toLowerCase() === dto.title.toLowerCase() ||
            (s.sourceUrl && s.sourceUrl === dto.sourceUrl) ||
            (s.resourceId && s.resourceId === dto.resourceId),
        );
        if (!isDuplicateInBatch) {
          uniqueSources.push(dto);
        }
      }
    }

    if (uniqueSources.length === 0) {
      this.logger.log("All sources already exist in project, skipping");
      return [];
    }

    this.logger.log(
      `Adding ${uniqueSources.length} unique sources (${sources.length - uniqueSources.length} duplicates skipped)`,
    );

    const createdSources = await this.prisma.$transaction(
      uniqueSources.map((dto) =>
        this.prisma.researchProjectSource.create({
          data: {
            projectId,
            title: dto.title,
            sourceType: dto.sourceType,
            sourceUrl: dto.sourceUrl,
            abstract: dto.abstract,
            content: dto.content,
            authors: dto.authors,
            publishedAt: dto.publishedAt ? new Date(dto.publishedAt) : null,
            metadata: (dto.metadata || {}) as unknown as InputJsonValue,
            resourceId: dto.resourceId,
            analysisStatus: "PENDING",
          },
        }),
      ),
    );

    // Update source count
    await this.prisma.researchProject.update({
      where: { id: projectId },
      data: {
        sourceCount: { increment: uniqueSources.length },
      },
    });

    return createdSources;
  }

  /**
   * Get all sources for a project
   */
  async getSources(userId: string, projectId: string) {
    // Verify project ownership
    const project = await this.prisma.researchProject.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException("Project not found");
    }

    if (project.userId !== userId) {
      throw new ForbiddenException("Access denied");
    }

    return this.prisma.researchProjectSource.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Get a single source
   */
  async getSource(userId: string, projectId: string, sourceId: string) {
    const project = await this.prisma.researchProject.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException("Project not found");
    }

    if (project.userId !== userId) {
      throw new ForbiddenException("Access denied");
    }

    const source = await this.prisma.researchProjectSource.findUnique({
      where: { id: sourceId },
    });

    if (!source || source.projectId !== projectId) {
      throw new NotFoundException("Source not found");
    }

    return source;
  }

  /**
   * Remove a source from a project
   */
  async removeSource(userId: string, projectId: string, sourceId: string) {
    const project = await this.prisma.researchProject.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException("Project not found");
    }

    if (project.userId !== userId) {
      throw new ForbiddenException("Access denied");
    }

    const source = await this.prisma.researchProjectSource.findUnique({
      where: { id: sourceId },
    });

    if (!source || source.projectId !== projectId) {
      throw new NotFoundException("Source not found");
    }

    await this.prisma.researchProjectSource.delete({
      where: { id: sourceId },
    });

    // Update source count
    await this.prisma.researchProject.update({
      where: { id: projectId },
      data: {
        sourceCount: { decrement: 1 },
      },
    });

    return { success: true };
  }

  /**
   * Search for sources (from local DB or internet)
   * Supports two modes:
   * - quick: Fast parallel search across selected sources
   * - deep: Multi-round iterative search with AI-guided refinement
   */
  async searchSources(_userId: string, dto: SearchSourcesDto) {
    const mode = dto.mode || "quick";
    const sourcesToSearch = dto.sources || ["local", "web", "arxiv", "github"];

    this.logger.log(
      `[${mode.toUpperCase()}] Searching sources: ${sourcesToSearch.join(", ")} for query: ${dto.query}`,
    );

    if (mode === "deep") {
      return this.deepResearch(dto.query, sourcesToSearch);
    }

    return this.quickSearch(dto.query, sourcesToSearch);
  }

  /**
   * Quick Search: Fast parallel search across multiple sources
   * Returns results in seconds with basic relevance sorting
   */
  private async quickSearch(query: string, sourcesToSearch: string[]) {
    const startTime = Date.now();
    const results: any[] = [];
    const searchPromises: Promise<any[]>[] = [];
    const errors: string[] = [];

    // Launch all searches in parallel for speed
    if (sourcesToSearch.includes("local")) {
      searchPromises.push(
        this.searchLocalDB(query, 10).catch((e) => {
          errors.push(`local: ${e.message}`);
          return [];
        }),
      );
    }

    if (sourcesToSearch.includes("web")) {
      searchPromises.push(
        this.searchWeb(query, 10).catch((e) => {
          errors.push(`web: ${e.message}`);
          return [];
        }),
      );
    }

    if (sourcesToSearch.includes("arxiv")) {
      searchPromises.push(
        this.searchArxivDirect(query, 10).catch((e) => {
          errors.push(`arxiv: ${e.message}`);
          return [];
        }),
      );
    }

    if (sourcesToSearch.includes("github")) {
      searchPromises.push(
        this.searchGithubDirect(query, 10).catch((e) => {
          errors.push(`github: ${e.message}`);
          return [];
        }),
      );
    }

    // News search - uses web search with news-focused query
    if (sourcesToSearch.includes("news")) {
      searchPromises.push(
        this.searchNews(query, 10).catch((e) => {
          errors.push(`news: ${e.message}`);
          return [];
        }),
      );
    }

    // Scholar search - uses Semantic Scholar API
    if (sourcesToSearch.includes("scholar")) {
      searchPromises.push(
        this.searchScholar(query, 10).catch((e) => {
          errors.push(`scholar: ${e.message}`);
          return [];
        }),
      );
    }

    // Blogs search - from local DB with BLOG category
    if (sourcesToSearch.includes("blogs")) {
      searchPromises.push(
        this.searchLocalByCategory(query, "BLOG", 10).catch((e) => {
          errors.push(`blogs: ${e.message}`);
          return [];
        }),
      );
    }

    // Reports search - from local DB with REPORT category
    if (sourcesToSearch.includes("reports")) {
      searchPromises.push(
        this.searchLocalByCategory(query, "REPORT", 10).catch((e) => {
          errors.push(`reports: ${e.message}`);
          return [];
        }),
      );
    }

    // Policy search - from local DB with POLICY category
    if (sourcesToSearch.includes("policy")) {
      searchPromises.push(
        this.searchLocalByCategory(query, "POLICY", 10).catch((e) => {
          errors.push(`policy: ${e.message}`);
          return [];
        }),
      );
    }

    // Wait for all searches to complete
    const allResults = await Promise.all(searchPromises);
    allResults.forEach((r) => results.push(...r));

    const duration = Date.now() - startTime;
    this.logger.log(
      `Quick search completed in ${duration}ms with ${results.length} results`,
    );

    return {
      results,
      query,
      mode: "quick" as const,
      sourcesSearched: sourcesToSearch,
      stats: {
        totalResults: results.length,
        durationMs: duration,
        errors: errors.length > 0 ? errors : undefined,
      },
    };
  }

  /**
   * Deep Research: Multi-round iterative search with comprehensive coverage
   *
   * Based on industry best practices (Perplexity, NotebookLM):
   * 1. Initial broad search across all sources
   * 2. Analyze results to identify key themes/subtopics
   * 3. Conduct follow-up searches for each subtopic
   * 4. Deduplicate and rank by relevance
   * 5. Return comprehensive results with metadata
   */
  private async deepResearch(query: string, sourcesToSearch: string[]) {
    const startTime = Date.now();
    const allResults: any[] = [];
    const searchHistory: string[] = [query];
    const errors: string[] = [];

    this.logger.log(`Starting deep research for: ${query}`);

    // Round 1: Initial broad search
    this.logger.log("Deep research round 1: Initial search");
    const round1Results = await this.quickSearch(query, sourcesToSearch);
    allResults.push(...round1Results.results);

    // Round 2: Generate related queries based on initial results
    const relatedQueries = this.generateRelatedQueries(
      query,
      round1Results.results,
    );
    this.logger.log(
      `Deep research round 2: ${relatedQueries.length} related queries`,
    );

    for (const relatedQuery of relatedQueries.slice(0, 3)) {
      if (searchHistory.includes(relatedQuery)) continue;
      searchHistory.push(relatedQuery);

      try {
        const relatedResults = await this.quickSearch(
          relatedQuery,
          sourcesToSearch,
        );
        // Add results that aren't duplicates
        for (const result of relatedResults.results) {
          if (!this.isDuplicate(result, allResults)) {
            allResults.push({ ...result, relatedQuery });
          }
        }
      } catch (error: any) {
        errors.push(`related search "${relatedQuery}": ${error.message}`);
      }
    }

    // Round 3: Academic deep dive (if arxiv is in sources)
    if (sourcesToSearch.includes("arxiv")) {
      this.logger.log("Deep research round 3: Academic deep dive");
      const academicQueries = this.generateAcademicQueries(query);

      for (const academicQuery of academicQueries.slice(0, 2)) {
        if (searchHistory.includes(academicQuery)) continue;
        searchHistory.push(academicQuery);

        try {
          const arxivResults = await this.searchArxivDirect(academicQuery, 15);
          for (const result of arxivResults) {
            if (!this.isDuplicate(result, allResults)) {
              allResults.push({ ...result, relatedQuery: academicQuery });
            }
          }
        } catch (error: any) {
          errors.push(`arxiv deep search: ${error.message}`);
        }
      }
    }

    // Deduplicate and sort by relevance
    const deduplicatedResults = this.deduplicateResults(allResults);
    const rankedResults = this.rankByRelevance(deduplicatedResults, query);

    const duration = Date.now() - startTime;
    this.logger.log(
      `Deep research completed in ${duration}ms with ${rankedResults.length} unique results`,
    );

    return {
      results: rankedResults,
      query,
      mode: "deep" as const,
      sourcesSearched: sourcesToSearch,
      stats: {
        totalResults: rankedResults.length,
        searchRounds: searchHistory.length,
        queriesExecuted: searchHistory,
        durationMs: duration,
        errors: errors.length > 0 ? errors : undefined,
      },
    };
  }

  /**
   * Search local database
   */
  private async searchLocalDB(query: string, limit: number): Promise<any[]> {
    const results = await this.prisma.resource.findMany({
      where: {
        OR: [
          { title: { contains: query, mode: "insensitive" } },
          { abstract: { contains: query, mode: "insensitive" } },
        ],
      },
      take: limit,
      orderBy: { publishedAt: "desc" },
      select: {
        id: true,
        type: true,
        title: true,
        abstract: true,
        sourceUrl: true,
        publishedAt: true,
        authors: true,
        qualityScore: true,
        citationCount: true,
      },
    });

    this.logger.log(`Local search returned ${results.length} results`);
    return results.map((r) => ({
      ...r,
      source: "local",
      sourceType: r.type.toLowerCase(),
    }));
  }

  /**
   * Search web using Tavily/Serper
   */
  private async searchWeb(query: string, limit: number): Promise<any[]> {
    const webResults = await this.searchService.search(query, limit);
    if (!webResults.success || !webResults.results.length) {
      return [];
    }

    this.logger.log(`Web search returned ${webResults.results.length} results`);
    return webResults.results.map((r) => ({
      id: null,
      title: r.title,
      abstract: r.content,
      sourceUrl: r.url,
      source: "web",
      sourceType: "web",
      score: r.score,
    }));
  }

  /**
   * Search local database by specific category (BLOG, REPORT, POLICY, etc.)
   */
  private async searchLocalByCategory(
    query: string,
    category: string,
    limit: number,
  ): Promise<any[]> {
    const results = await this.prisma.resource.findMany({
      where: {
        type: category as any,
        OR: [
          { title: { contains: query, mode: "insensitive" } },
          { abstract: { contains: query, mode: "insensitive" } },
          { content: { contains: query, mode: "insensitive" } },
        ],
      },
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        abstract: true,
        type: true,
        sourceUrl: true,
        authors: true,
        publishedAt: true,
        qualityScore: true,
      },
    });

    this.logger.log(
      `Local ${category} search returned ${results.length} results`,
    );

    return results.map((r) => ({
      ...r,
      source: category.toLowerCase(),
      sourceType: r.type.toLowerCase(),
    }));
  }

  /**
   * Search news sources using web search with news-focused keywords
   */
  private async searchNews(query: string, limit: number): Promise<any[]> {
    // Add news-related terms to improve news results
    const newsQuery = `${query} news latest update announcement`;
    const webResults = await this.searchService.search(newsQuery, limit);
    if (!webResults.success || !webResults.results.length) {
      return [];
    }

    this.logger.log(
      `News search returned ${webResults.results.length} results`,
    );
    return webResults.results.map((r) => ({
      id: null,
      title: r.title,
      abstract: r.content,
      sourceUrl: r.url,
      source: "news",
      sourceType: "news",
      score: r.score,
      publishedDate: r.publishedDate,
    }));
  }

  /**
   * Search academic papers using Semantic Scholar API
   */
  private async searchScholar(query: string, limit: number): Promise<any[]> {
    const axios = await import("axios");

    try {
      const response = await axios.default.get(
        "https://api.semanticscholar.org/graph/v1/paper/search",
        {
          params: {
            query,
            limit,
            fields:
              "paperId,title,abstract,authors,year,citationCount,url,openAccessPdf",
          },
          headers: {
            Accept: "application/json",
          },
          timeout: 15000,
        },
      );

      const papers = response.data.data || [];
      this.logger.log(`Scholar search returned ${papers.length} results`);

      return papers.map((paper: any) => ({
        id: null,
        title: paper.title,
        abstract: paper.abstract || "",
        sourceUrl:
          paper.openAccessPdf?.url ||
          `https://www.semanticscholar.org/paper/${paper.paperId}`,
        authors: paper.authors?.map((a: any) => a.name) || [],
        publishedAt: paper.year ? `${paper.year}-01-01` : null,
        source: "scholar",
        sourceType: "paper",
        metadata: {
          citationCount: paper.citationCount,
          paperId: paper.paperId,
        },
      }));
    } catch (error: any) {
      this.logger.warn(`Scholar search failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Generate related queries based on initial results
   */
  private generateRelatedQueries(query: string, results: any[]): string[] {
    const queries: string[] = [];
    const words = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3);

    // Extract key terms from results
    const termCounts = new Map<string, number>();
    for (const result of results.slice(0, 10)) {
      const text =
        `${result.title || ""} ${result.abstract || ""}`.toLowerCase();
      const resultWords = text.split(/\s+/).filter((w) => w.length > 4);
      for (const word of resultWords) {
        if (!words.includes(word) && /^[a-z]+$/i.test(word)) {
          termCounts.set(word, (termCounts.get(word) || 0) + 1);
        }
      }
    }

    // Get top terms and create queries
    const topTerms = [...termCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([term]) => term);

    for (const term of topTerms) {
      queries.push(`${query} ${term}`);
    }

    // Add variations
    queries.push(`${query} latest research`);
    queries.push(`${query} comparison`);
    queries.push(`${query} implementation`);

    return queries;
  }

  /**
   * Generate academic-focused queries
   */
  private generateAcademicQueries(query: string): string[] {
    return [
      `${query} survey`,
      `${query} benchmark`,
      `${query} state of the art`,
      `${query} novel approach`,
    ];
  }

  /**
   * Check if result is a duplicate
   */
  private isDuplicate(result: any, existingResults: any[]): boolean {
    const url = result.sourceUrl?.toLowerCase();
    const title = result.title?.toLowerCase();

    return existingResults.some((existing) => {
      if (url && existing.sourceUrl?.toLowerCase() === url) return true;
      if (title && existing.title?.toLowerCase() === title) return true;
      return false;
    });
  }

  /**
   * Deduplicate results by URL and title
   */
  private deduplicateResults(results: any[]): any[] {
    const seen = new Set<string>();
    return results.filter((result) => {
      const key =
        result.sourceUrl?.toLowerCase() || result.title?.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Comprehensive ranking algorithm for multi-source results
   * Based on industry best practices (Google, Perplexity, NotebookLM)
   *
   * Factors with weights:
   * - Relevance (35%): Query term matching in title/content
   * - Quality (25%): Source authority, domain reputation
   * - Freshness (20%): Prefer recent content
   * - Diversity (10%): Bonus for unique sources
   * - Depth (10%): Content length and detail
   */
  private rankByRelevance(results: any[], query: string): any[] {
    const queryTerms = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2);
    const seenDomains = new Set<string>();

    return results
      .map((result) => {
        // 1. Relevance Score (35% weight)
        const relevanceScore = this.calculateRelevance(result, queryTerms);

        // 2. Quality Score (25% weight)
        const qualityScore = this.calculateQuality(result);

        // 3. Freshness Score (20% weight)
        const freshnessScore = this.calculateFreshness(result);

        // 4. Diversity Score (10% weight)
        const domain = this.extractDomain(result.sourceUrl);
        const diversityScore = seenDomains.has(domain) ? 30 : 100;
        seenDomains.add(domain);

        // 5. Depth Score (10% weight)
        const depthScore = this.calculateDepth(result);

        // Calculate weighted final score
        const finalScore =
          relevanceScore * 0.35 +
          qualityScore * 0.25 +
          freshnessScore * 0.2 +
          diversityScore * 0.1 +
          depthScore * 0.1;

        return {
          ...result,
          relevanceScore: finalScore,
          _debug: {
            relevance: relevanceScore,
            quality: qualityScore,
            freshness: freshnessScore,
            diversity: diversityScore,
            depth: depthScore,
          },
        };
      })
      .sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  /**
   * Calculate relevance score based on query matching
   */
  private calculateRelevance(result: any, queryTerms: string[]): number {
    let score = 0;
    const titleLower = (result.title || "").toLowerCase();
    const abstractLower = (result.abstract || "").toLowerCase();
    const text = `${titleLower} ${abstractLower}`;

    // Start with existing score if available
    if (result.score) {
      score = result.score * 40;
    }

    for (const term of queryTerms) {
      // Title match (high weight)
      if (titleLower.includes(term)) {
        score += 15;
        // Exact word match bonus
        if (new RegExp(`\\b${term}\\b`).test(titleLower)) {
          score += 10;
        }
      }

      // Abstract/content match
      if (abstractLower.includes(term)) {
        score += 8;
      }
    }

    // All terms in title bonus
    if (queryTerms.every((term) => titleLower.includes(term))) {
      score += 20;
    }

    // All terms anywhere bonus
    if (queryTerms.every((term) => text.includes(term))) {
      score += 10;
    }

    return Math.min(score, 100);
  }

  /**
   * Calculate quality score based on source type and authority
   */
  private calculateQuality(result: any): number {
    let score = 50; // Base score

    // Source type bonuses
    const sourceType = result.source || result.sourceType;
    switch (sourceType) {
      case "arxiv":
      case "paper":
        score += 35; // Academic papers are high quality
        break;
      case "github":
        score += 25; // Technical repos
        if (result.metadata?.stars > 1000) score += 15;
        if (result.metadata?.stars > 10000) score += 10;
        break;
      case "local":
        score += 20; // Already curated in DB
        if (result.qualityScore) score += result.qualityScore * 20;
        break;
      case "web":
      case "news":
        score += 10;
        break;
    }

    // Domain authority check
    const domain = this.extractDomain(result.sourceUrl);
    if (this.isHighAuthorityDomain(domain)) {
      score += 25;
    } else if (this.isMediumAuthorityDomain(domain)) {
      score += 10;
    }

    // Citation count bonus (for papers)
    if (result.citationCount) {
      if (result.citationCount > 100) score += 20;
      else if (result.citationCount > 50) score += 15;
      else if (result.citationCount > 10) score += 10;
    }

    return Math.min(score, 100);
  }

  /**
   * Calculate freshness score (prefer recent content)
   */
  private calculateFreshness(result: any): number {
    const publishedAt = result.publishedAt || result.publishedDate;
    if (!publishedAt) {
      return 50; // Unknown date gets neutral score
    }

    try {
      const pubDate = new Date(publishedAt);
      const now = new Date();
      const daysDiff =
        (now.getTime() - pubDate.getTime()) / (1000 * 60 * 60 * 24);

      if (daysDiff <= 7) return 100; // Last week
      if (daysDiff <= 30) return 90; // Last month
      if (daysDiff <= 90) return 75; // Last quarter
      if (daysDiff <= 180) return 60; // Last 6 months
      if (daysDiff <= 365) return 45; // Last year
      if (daysDiff <= 730) return 30; // Last 2 years
      return 20; // Older content
    } catch {
      return 50;
    }
  }

  /**
   * Calculate content depth score
   */
  private calculateDepth(result: any): number {
    const content = result.abstract || result.content || "";
    const contentLength = content.length;

    if (contentLength >= 1000) return 100;
    if (contentLength >= 500) return 80;
    if (contentLength >= 300) return 60;
    if (contentLength >= 100) return 40;
    return 20;
  }

  /**
   * Extract domain from URL
   */
  private extractDomain(url: string | null | undefined): string {
    if (!url) return "unknown";
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace(/^www\./, "");
    } catch {
      return "unknown";
    }
  }

  /**
   * Check if domain is high authority
   */
  private isHighAuthorityDomain(domain: string): boolean {
    const highAuthority = [
      // Academic & Research
      "arxiv.org",
      "nature.com",
      "science.org",
      "ieee.org",
      "acm.org",
      "researchgate.net",
      "pubmed.ncbi.nlm.nih.gov",
      "springer.com",
      "wiley.com",
      "elsevier.com",
      // Analysis & Reports
      "mckinsey.com",
      "bcg.com",
      "bain.com",
      "hbr.org",
      "gartner.com",
      "forrester.com",
      "statista.com",
      "idc.com",
      "cb-insights.com",
      // Major News (Global)
      "reuters.com",
      "bloomberg.com",
      "ft.com",
      "wsj.com",
      "nytimes.com",
      "theguardian.com",
      "bbc.com",
      "economist.com",
      // Tech
      "techcrunch.com",
      "wired.com",
      "arstechnica.com",
      "theverge.com",
      "venturebeat.com",
      // Official
      "github.com",
      "stackoverflow.com",
    ];
    return highAuthority.some((d) => domain.includes(d));
  }

  /**
   * Check if domain is medium authority
   */
  private isMediumAuthorityDomain(domain: string): boolean {
    const mediumAuthority = [
      "wikipedia.org",
      "medium.com",
      "dev.to",
      "forbes.com",
      "zdnet.com",
      "cnet.com",
      "linkedin.com",
      "reddit.com",
    ];
    return mediumAuthority.some((d) => domain.includes(d));
  }

  /**
   * Search arXiv directly and return formatted results
   */
  private async searchArxivDirect(
    query: string,
    maxResults: number,
  ): Promise<any[]> {
    const axios = await import("axios");
    const xml2js = await import("xml2js");

    const response = await axios.default.get(
      "http://export.arxiv.org/api/query",
      {
        params: {
          search_query: `all:${query}`,
          start: 0,
          max_results: maxResults,
          sortBy: "relevance",
          sortOrder: "descending",
        },
        timeout: 10000,
      },
    );

    const parser = new xml2js.Parser({ explicitArray: false });
    const result = await parser.parseStringPromise(response.data);

    if (!result.feed?.entry) {
      return [];
    }

    const entries = Array.isArray(result.feed.entry)
      ? result.feed.entry
      : [result.feed.entry];

    return entries.map((entry: any) => {
      const authors = entry.author
        ? Array.isArray(entry.author)
          ? entry.author.map((a: any) => a.name)
          : [entry.author.name]
        : [];

      const pdfLink = entry.link
        ? Array.isArray(entry.link)
          ? entry.link.find((l: any) => l.$.title === "pdf")
          : entry.link.$.title === "pdf"
            ? entry.link
            : null
        : null;

      return {
        id: null,
        title: entry.title?.replace(/\s+/g, " ").trim(),
        abstract: entry.summary?.replace(/\s+/g, " ").trim(),
        sourceUrl: pdfLink?.$?.href || entry.id,
        authors,
        publishedAt: entry.published,
        source: "arxiv",
        sourceType: "paper",
        categories: entry.category
          ? Array.isArray(entry.category)
            ? entry.category.map((c: any) => c.$.term)
            : [entry.category.$.term]
          : [],
      };
    });
  }

  /**
   * Search GitHub directly and return formatted results
   */
  private async searchGithubDirect(
    query: string,
    maxResults: number,
  ): Promise<any[]> {
    const axios = await import("axios");

    const response = await axios.default.get(
      "https://api.github.com/search/repositories",
      {
        params: {
          q: query,
          sort: "stars",
          order: "desc",
          per_page: maxResults,
        },
        headers: {
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "DeepDive-Engine",
        },
        timeout: 10000,
      },
    );

    return (response.data.items || []).map((repo: any) => ({
      id: null,
      title: repo.full_name,
      abstract: repo.description,
      sourceUrl: repo.html_url,
      source: "github",
      sourceType: "github",
      metadata: {
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        language: repo.language,
        topics: repo.topics,
      },
    }));
  }

  /**
   * Upload and parse files as sources
   */
  async uploadFiles(
    userId: string,
    projectId: string,
    files: Express.Multer.File[],
  ) {
    // Verify project ownership
    const project = await this.prisma.researchProject.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException("Project not found");
    }

    if (project.userId !== userId) {
      throw new ForbiddenException("Access denied");
    }

    const results: any[] = [];
    const errors: any[] = [];

    for (const file of files) {
      try {
        // Parse file content and upload to BackBlaze
        const parsed = await this.fileParserService.parseFile(file, userId);

        // Check for duplicates
        const existing = await this.findDuplicateSource(
          projectId,
          parsed.title,
          parsed.fileUrl,
          null,
        );

        if (existing) {
          this.logger.log(`File already exists: ${parsed.title}`);
          results.push(existing);
          continue;
        }

        // Create source record
        const source = await this.prisma.researchProjectSource.create({
          data: {
            projectId,
            title: parsed.title,
            sourceType: "file",
            sourceUrl: parsed.fileUrl, // 存储 BackBlaze URL
            abstract: parsed.abstract,
            content: parsed.content,
            metadata: {
              fileName: file.originalname,
              fileUrl: parsed.fileUrl,
              storageKey: parsed.metadata.storageKey,
              ...parsed.metadata,
            } as any,
            analysisStatus: "COMPLETED", // File parsing is complete
          },
        });

        results.push(source);
      } catch (error: any) {
        this.logger.error(
          `Failed to process file ${file.originalname}: ${error.message}`,
        );
        errors.push({
          fileName: file.originalname,
          error: error.message,
        });
      }
    }

    // Update source count
    if (results.length > 0) {
      await this.prisma.researchProject.update({
        where: { id: projectId },
        data: {
          sourceCount: { increment: results.length },
        },
      });
    }

    return { sources: results, errors };
  }

  /**
   * Update source analysis status
   */
  async updateSourceAnalysis(
    sourceId: string,
    status: "PENDING" | "ANALYZING" | "COMPLETED" | "FAILED",
    aiSummary?: string,
    keyInsights?: any,
  ) {
    return this.prisma.researchProjectSource.update({
      where: { id: sourceId },
      data: {
        analysisStatus: status,
        ...(aiSummary && { aiSummary }),
        ...(keyInsights && { keyInsights }),
      },
    });
  }
}
