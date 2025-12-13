import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { MongoDBService } from "../../../common/mongodb/mongodb.service.postgres";
import { ensureError } from "../../../common/utils/error.utils";
import { Prisma } from "@prisma/client";
import { SourceWhitelistService } from "../../data-services/data-management/services/source-whitelist.service";
import { AIEnrichmentService } from "./ai-enrichment.service";

/**
 * 资源管理服务
 */
@Injectable()
export class ResourcesService {
  private readonly logger = new Logger(ResourcesService.name);

  constructor(
    private prisma: PrismaService,
    private mongodb: MongoDBService,
    private whitelistService: SourceWhitelistService,
    private aiEnrichmentService: AIEnrichmentService,
  ) {}

  /**
   * 获取资源列表（分页+过滤）
   */
  async findAll(params: {
    skip?: number;
    take?: number;
    type?: string;
    category?: string;
    search?: string;
    sortBy?: "publishedAt" | "qualityScore" | "trendingScore";
    sortOrder?: "asc" | "desc";
  }) {
    const {
      skip = 0,
      take = 20,
      type,
      category,
      search,
      sortBy = "publishedAt",
      sortOrder = "desc",
    } = params;

    // 构建查询条件 - 始终过滤掉空标题的资源
    const where: Prisma.ResourceWhereInput = {
      NOT: {
        title: "",
      },
    };

    if (type) {
      where.type = type as any;
    }

    if (category) {
      // For JSON array fields in Prisma, we need to use path and array_contains with an array
      where.categories = {
        path: [],
        array_contains: [category],
      } as any;
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { abstract: { contains: search, mode: "insensitive" } },
      ];
    }

    // 执行查询
    const [resources, total] = await Promise.all([
      this.prisma.resource.findMany({
        where,
        skip,
        take,
        orderBy: {
          [sortBy]: sortOrder,
        },
      }),
      this.prisma.resource.count({ where }),
    ]);

    this.logger.log(
      `Found ${resources.length}/${total} resources (skip: ${skip}, take: ${take})`,
    );

    return {
      data: resources,
      pagination: {
        total,
        skip,
        take,
        hasMore: skip + take < total,
      },
    };
  }

  /**
   * 获取单个资源详情
   */
  async findOne(id: string) {
    const resource = await this.prisma.resource.findUnique({
      where: { id },
    });

    if (!resource) {
      throw new NotFoundException(`Resource with ID ${id} not found`);
    }

    // 如果有 rawDataId，获取完整原始数据
    let rawData = null;
    if (resource.rawDataId) {
      rawData = await this.mongodb.findRawDataById(resource.rawDataId);
    }

    this.logger.log(`Retrieved resource ${id}`);

    return {
      ...resource,
      rawData: rawData?.data || null,
    };
  }

  /**
   * 创建资源
   */
  async create(data: Prisma.ResourceCreateInput) {
    const resource = await this.prisma.resource.create({
      data,
    });

    this.logger.log(`Created resource ${resource.id}`);

    return resource;
  }

  /**
   * 更新资源
   */
  async update(id: string, data: Prisma.ResourceUpdateInput) {
    try {
      const resource = await this.prisma.resource.update({
        where: { id },
        data,
      });

      this.logger.log(`Updated resource ${id}`);

      return resource;
    } catch (error) {
      const err = error as { code?: string };
      if (err.code === "P2025") {
        throw new NotFoundException(`Resource with ID ${id} not found`);
      }
      throw ensureError(error);
    }
  }

  /**
   * 删除资源
   */
  async remove(id: string) {
    try {
      const resource = await this.prisma.resource.delete({
        where: { id },
      });

      this.logger.log(`Deleted resource ${id}`);

      return resource;
    } catch (error) {
      const err = error as { code?: string };
      if (err.code === "P2025") {
        throw new NotFoundException(`Resource with ID ${id} not found`);
      }
      throw ensureError(error);
    }
  }

  /**
   * 按类型统计资源数量
   */
  async getStats() {
    const stats = await this.prisma.resource.groupBy({
      by: ["type"],
      _count: {
        id: true,
      },
    });

    const totalCount = await this.prisma.resource.count();

    return {
      total: totalCount,
      byType: stats.map((s) => ({
        type: s.type,
        count: s._count.id,
      })),
    };
  }

  /**
   * 翻译资源
   */
  async translateResource(id: string, targetLanguage = "zh-CN") {
    // 1. 检查是否存在翻译
    const existingTranslation =
      await this.prisma.resourceTranslation.findUnique({
        where: {
          resourceId_language: {
            resourceId: id,
            language: targetLanguage,
          },
        },
      });

    if (existingTranslation) {
      this.logger.log(
        `Found existing translation for resource ${id} in ${targetLanguage}`,
      );
      return existingTranslation;
    }

    // 2. 获取资源内容
    const resource = await this.findOne(id);
    const contentToTranslate = resource.content || resource.abstract || "";

    if (!contentToTranslate) {
      throw new BadRequestException("Resource has no content to translate");
    }

    // 3. 调用 AI 服务翻译
    const translationResult = await this.aiEnrichmentService.translateContent(
      contentToTranslate,
      targetLanguage,
    );

    if (!translationResult) {
      throw new BadRequestException("Translation failed");
    }

    // 4. 保存翻译
    const translation = await this.prisma.resourceTranslation.create({
      data: {
        resourceId: id,
        language: targetLanguage,
        content: translationResult.translatedText,
        modelUsed: translationResult.model,
      },
    });

    this.logger.log(
      `Created translation for resource ${id} in ${targetLanguage}`,
    );

    return translation;
  }

  /**
   * 搜索建议（实时）
   * 混合搜索：全文搜索 + 相关性排序
   */
  async searchSuggestions(query: string, limit: number = 5) {
    const searchQuery = query.trim().toLowerCase();

    // 执行全文搜索
    const results = await this.prisma.resource.findMany({
      where: {
        OR: [
          { title: { contains: searchQuery, mode: "insensitive" } },
          { abstract: { contains: searchQuery, mode: "insensitive" } },
          { content: { contains: searchQuery, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        type: true,
        title: true,
        abstract: true,
        publishedAt: true,
        qualityScore: true,
      },
      take: limit * 2, // 获取更多结果用于排序
      orderBy: {
        qualityScore: "desc", // 按质量分数排序
      },
    });

    // 计算相关性分数并排序
    const scoredResults = results.map((resource) => {
      let score = 0;

      // 标题匹配权重更高
      if (resource.title?.toLowerCase().includes(searchQuery)) {
        score += 10;
        // 精确匹配额外加分
        if (resource.title?.toLowerCase() === searchQuery) {
          score += 20;
        }
        // 开头匹配加分
        if (resource.title?.toLowerCase().startsWith(searchQuery)) {
          score += 5;
        }
      }

      // 摘要匹配
      if (resource.abstract?.toLowerCase().includes(searchQuery)) {
        score += 5;
      }

      // 质量分数加权
      score += (Number(resource.qualityScore) || 0) * 0.1;

      // 新鲜度加权（最近发布的加分）
      if (resource.publishedAt) {
        const daysSincePublished = Math.floor(
          (Date.now() - new Date(resource.publishedAt).getTime()) /
            (1000 * 60 * 60 * 24),
        );
        if (daysSincePublished < 7) score += 3;
        else if (daysSincePublished < 30) score += 2;
        else if (daysSincePublished < 90) score += 1;
      }

      return {
        ...resource,
        searchScore: score,
        highlight: this.generateHighlight(
          resource.title,
          resource.abstract,
          searchQuery,
        ),
      };
    });

    // 按分数排序并返回前N个
    const topResults = scoredResults
      .sort((a, b) => b.searchScore - a.searchScore)
      .slice(0, limit);

    return topResults.map((r) => ({
      id: r.id,
      title: r.title,
      type: r.type,
      abstract: r.abstract?.substring(0, 150) + "...",
      highlight: r.highlight,
    }));
  }

  /**
   * 生成搜索高亮片段
   */
  private generateHighlight(
    title: string | null,
    abstract: string | null,
    query: string,
  ): string {
    const text = title || abstract || "";
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();

    const index = lowerText.indexOf(lowerQuery);
    if (index === -1) return text.substring(0, 100) + "...";

    // 获取匹配周围的文本
    const start = Math.max(0, index - 30);
    const end = Math.min(text.length, index + query.length + 30);

    let snippet = text.substring(start, end);
    if (start > 0) snippet = "..." + snippet;
    if (end < text.length) snippet = snippet + "...";

    return snippet;
  }

  /**
   * 规范化URL - 移除尾部斜杠、统一使用https、移除www前缀、移除无关的查询参数
   */
  private normalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);

      // 统一使用 https
      urlObj.protocol = "https:";

      // 移除 www. 前缀
      urlObj.hostname = urlObj.hostname.replace(/^www\./, "");

      // 移除尾部斜杠（除了根路径）
      if (urlObj.pathname !== "/" && urlObj.pathname.endsWith("/")) {
        urlObj.pathname = urlObj.pathname.slice(0, -1);
      }

      // 对于特定网站，保留必要的查询参数
      const keepParams = new Set<string>();
      if (urlObj.hostname === "youtube.com" || urlObj.hostname === "youtu.be") {
        keepParams.add("v");
      } else if (urlObj.hostname === "openreview.net") {
        keepParams.add("id");
      }

      // 清理查询参数
      if (keepParams.size > 0) {
        const newSearchParams = new URLSearchParams();
        urlObj.searchParams.forEach((value, key) => {
          if (keepParams.has(key)) {
            newSearchParams.set(key, value);
          }
        });
        urlObj.search = newSearchParams.toString();
      } else {
        // 移除所有查询参数（对于大多数网站）
        urlObj.search = "";
      }

      // 移除哈希片段
      urlObj.hash = "";

      return urlObj.toString();
    } catch {
      // 如果URL无效，返回原始URL
      return url;
    }
  }

  /**
   * 从URL导入资源
   */
  async importFromUrl(url: string, type: string) {
    this.logger.log(`Importing resource from URL: ${url} (type: ${type})`);

    try {
      // 第一步：验证URL域名是否在白名单中
      const whitelistValidation = await this.whitelistService.validateUrl(
        type as any,
        url,
      );

      if (!whitelistValidation.isValid) {
        const errorMsg = `Domain validation failed: ${whitelistValidation.reason || "Domain not in whitelist"}`;
        this.logger.warn(errorMsg);
        throw new BadRequestException(errorMsg);
      }

      this.logger.log(
        `Domain validation passed for ${whitelistValidation.matchedDomain}`,
      );

      // 解析URL
      const urlObj = new URL(url);
      let finalUrl = url;

      // 如果是 AlphaXiv URL，转换为对应的 arXiv URL
      if (
        urlObj.hostname === "www.alphaxiv.org" ||
        urlObj.hostname === "alphaxiv.org"
      ) {
        // AlphaXiv: https://www.alphaxiv.org/abs/2511.04676
        // ArXiv:    https://arxiv.org/abs/2511.04676
        finalUrl = `https://arxiv.org${urlObj.pathname}`;
        this.logger.log(`Converting AlphaXiv URL to arXiv: ${finalUrl}`);
      }

      // 规范化URL用于去重检查
      const normalizedUrl = this.normalizeUrl(finalUrl);
      this.logger.log(`Normalized URL for deduplication: ${normalizedUrl}`);

      // 检查URL是否已存在（使用规范化后的URL检查）
      // 同时检查 sourceUrl 精确匹配和 normalizedUrl 匹配
      const existing = await this.prisma.resource.findFirst({
        where: {
          OR: [
            { sourceUrl: finalUrl },
            { sourceUrl: normalizedUrl },
            { normalizedUrl: normalizedUrl },
          ],
        },
      });

      // 获取真实标题和摘要
      let title: string;
      let abstract: string | null = null;

      if (type === "YOUTUBE_VIDEO") {
        // YouTube视频：使用oEmbed API获取标题
        const videoId = this.extractYoutubeVideoId(finalUrl);
        if (videoId) {
          title = await this.fetchYoutubeTitle(videoId);
        } else {
          title = "YouTube Video";
        }
      } else if (type === "PAPER") {
        // 论文：尝试从arXiv、OpenReview等获取真实标题
        const paperInfo = await this.fetchPaperInfo(finalUrl);
        title = paperInfo.title;
        abstract = paperInfo.abstract;
      } else if (type === "PROJECT") {
        // 开源项目：从GitHub获取真实项目信息
        const projectInfo = await this.fetchGithubProjectInfo(finalUrl);
        title = projectInfo.title;
        abstract = projectInfo.abstract;
      } else if (type === "NEWS") {
        // 新闻：从网页获取真实标题
        const newsInfo = await this.fetchWebPageInfo(finalUrl);
        title = newsInfo.title;
        abstract = newsInfo.abstract;
      } else if (type === "BLOG") {
        // 博客：从网页获取真实标题
        const blogInfo = await this.fetchWebPageInfo(finalUrl);
        title = blogInfo.title;
        abstract = blogInfo.abstract;
      } else if (type === "REPORT") {
        // 行业报告：从网页获取真实标题
        const reportInfo = await this.fetchWebPageInfo(finalUrl);
        title = reportInfo.title;
        abstract = reportInfo.abstract;
      } else {
        // 其他类型：从URL的最后部分提取标题
        const pathParts = urlObj.pathname
          .split("/")
          .filter((p) => p.length > 0);
        const lastPart = pathParts[pathParts.length - 1] || urlObj.hostname;
        title = lastPart
          .replace(/[-_]/g, " ")
          .replace(/\.(html|htm|pdf)$/i, "");
      }

      // 提取 PDF URL（如果是论文类型）
      let pdfUrl: string | null = null;
      if (type === "PAPER") {
        pdfUrl = this.extractPdfUrl(finalUrl);
      }

      // 如果URL已存在，更新现有资源（刷新内容和类型）
      if (existing) {
        this.logger.log(
          `URL already exists, refreshing resource: ${existing.id} (type: ${existing.type} -> ${type})`,
        );

        const resource = await this.prisma.resource.update({
          where: { id: existing.id },
          data: {
            type: type as any, // 更新类型（允许用户更改分类）
            title: title,
            abstract: abstract || `从URL导入: ${finalUrl}`,
            pdfUrl: pdfUrl,
            normalizedUrl: normalizedUrl, // 确保规范化URL已保存
            // 保留原有的统计数据
          },
        });

        this.logger.log(
          `Resource refreshed successfully: ${resource.id} (type: ${type})`,
        );
        return resource;
      }

      // 创建新资源
      const resourceData: Prisma.ResourceCreateInput = {
        type: type as any,
        title: title,
        abstract: abstract || `从URL导入: ${finalUrl}`,
        sourceUrl: finalUrl, // 使用转换后的URL
        normalizedUrl: normalizedUrl, // 保存规范化URL用于去重
        pdfUrl: pdfUrl, // 添加 PDF URL
        publishedAt: new Date(),
        // 默认值
        upvoteCount: 0,
        viewCount: 0,
        commentCount: 0,
        qualityScore: "0",
        trendingScore: 0,
      };

      const resource = await this.prisma.resource.create({
        data: resourceData,
      });

      this.logger.log(`Resource imported successfully: ${resource.id}`);

      return resource;
    } catch (error) {
      const err = ensureError(error);
      this.logger.error(`Failed to import URL: ${err.message}`, err.stack);
      throw err;
    }
  }

  /**
   * 从URL中提取PDF URL
   * 支持 arXiv, OpenReview 等常见论文网站
   */
  private extractPdfUrl(url: string): string | null {
    try {
      const urlObj = new URL(url);

      // arXiv: 支持 /abs/, /html/ 格式
      // https://arxiv.org/abs/2311.12345v1 -> https://arxiv.org/pdf/2311.12345v1.pdf
      // https://arxiv.org/html/2311.12345v1 -> https://arxiv.org/pdf/2311.12345v1.pdf
      if (
        urlObj.hostname === "arxiv.org" ||
        urlObj.hostname === "www.arxiv.org"
      ) {
        const arxivIdMatch = url.match(
          /arxiv\.org\/(?:abs|html)\/(.+?)(?:\.pdf)?$/,
        );
        if (arxivIdMatch) {
          return `https://arxiv.org/pdf/${arxivIdMatch[1]}.pdf`;
        }
      }

      // OpenReview: https://openreview.net/forum?id=xxx -> https://openreview.net/pdf?id=xxx
      if (
        urlObj.hostname === "openreview.net" ||
        urlObj.hostname === "www.openreview.net"
      ) {
        return url.replace("/forum?", "/pdf?");
      }

      // 如果URL本身就是PDF链接，直接返回
      if (url.toLowerCase().endsWith(".pdf")) {
        return url;
      }

      return null;
    } catch (error) {
      this.logger.error(`Failed to extract PDF URL from: ${url}`, error);
      return null;
    }
  }

  /**
   * 从YouTube URL中提取视频ID
   */
  private extractYoutubeVideoId(url: string): string | null {
    try {
      const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
        /^([a-zA-Z0-9_-]{11})$/,
      ];

      for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match?.[1]) {
          return match[1];
        }
      }

      return null;
    } catch (error) {
      this.logger.error(`Failed to extract video ID from: ${url}`, error);
      return null;
    }
  }

  /**
   * 获取YouTube视频标题
   */
  private async fetchYoutubeTitle(videoId: string): Promise<string> {
    try {
      const response = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      );

      if (!response.ok) {
        this.logger.warn(
          `Failed to fetch YouTube title for ${videoId}: ${response.status}`,
        );
        return `YouTube Video ${videoId}`;
      }

      const data = (await response.json()) as { title?: string };
      return data.title || `YouTube Video ${videoId}`;
    } catch (error) {
      this.logger.warn(
        `Failed to fetch video title via oEmbed: ${String(error)}`,
      );
      return `YouTube Video ${videoId}`;
    }
  }

  /**
   * 获取论文信息（支持arXiv）
   */
  private async fetchPaperInfo(
    url: string,
  ): Promise<{ title: string; abstract: string | null }> {
    try {
      const urlObj = new URL(url);

      // arXiv论文（支持 /abs/, /html/, /pdf/ 格式）
      if (
        urlObj.hostname === "arxiv.org" ||
        urlObj.hostname === "www.arxiv.org"
      ) {
        // 匹配 /abs/, /html/, /pdf/ 格式的arXiv ID
        const arxivIdMatch = url.match(
          /arxiv\.org\/(?:abs|html|pdf)\/(.+?)(?:\.pdf)?$/,
        );
        if (arxivIdMatch) {
          const arxivId = arxivIdMatch[1];
          this.logger.log(`Extracting arXiv paper info for ID: ${arxivId}`);

          const response = await fetch(
            `http://export.arxiv.org/api/query?id_list=${arxivId}`,
          );

          if (response.ok) {
            const xml = await response.text();
            // 解析XML，提取<entry>标签内的<title>和<summary>
            // 跳过第一个<title>（feed title），匹配<entry>内的<title>
            const entryMatch = xml.match(/<entry>([\s\S]*?)<\/entry>/);
            if (entryMatch) {
              const entryContent = entryMatch[1];
              const titleMatch = entryContent.match(/<title>([^<]+)<\/title>/);
              const summaryMatch = entryContent.match(
                /<summary>([^<]+)<\/summary>/,
              );

              if (titleMatch && titleMatch[1]) {
                const title = titleMatch[1]
                  .replace(/\s+/g, " ")
                  .trim()
                  .replace(/^arXiv:\d+\.\d+v?\d*\s*/, ""); // 移除arXiv ID前缀
                const abstract = summaryMatch
                  ? summaryMatch[1].replace(/\s+/g, " ").trim()
                  : null;

                this.logger.log(`Fetched arXiv paper title: ${title}`);
                return { title, abstract };
              }
            }
          }
        }
      }

      // 如果无法获取，返回从URL提取的标题
      const pathParts = urlObj.pathname.split("/").filter((p) => p.length > 0);
      const lastPart = pathParts[pathParts.length - 1] || urlObj.hostname;
      const fallbackTitle = lastPart
        .replace(/[-_]/g, " ")
        .replace(/\.(html|htm|pdf)$/i, "");

      return { title: fallbackTitle, abstract: null };
    } catch (error) {
      this.logger.warn(`Failed to fetch paper info: ${String(error)}`);
      return { title: "Paper", abstract: null };
    }
  }

  /**
   * 获取GitHub项目信息
   */
  private async fetchGithubProjectInfo(
    url: string,
  ): Promise<{ title: string; abstract: string | null }> {
    try {
      const urlObj = new URL(url);

      // GitHub项目
      if (
        urlObj.hostname === "github.com" ||
        urlObj.hostname === "www.github.com"
      ) {
        const pathMatch = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
        if (pathMatch) {
          const owner = pathMatch[1];
          const repo = pathMatch[2].replace(/\.git$/, "");

          // 使用GitHub API获取项目信息
          const response = await fetch(
            `https://api.github.com/repos/${owner}/${repo}`,
            {
              headers: {
                Accept: "application/vnd.github.v3+json",
                "User-Agent": "DeepDive-Engine",
              },
            },
          );

          if (response.ok) {
            const data = (await response.json()) as {
              name?: string;
              full_name?: string;
              description?: string;
            };
            const title = data.full_name || data.name || `${owner}/${repo}`;
            const abstract = data.description || null;

            this.logger.log(`Fetched GitHub project: ${title}`);
            return { title, abstract };
          }
        }
      }

      // 如果无法获取，返回从URL提取的标题
      const pathParts = urlObj.pathname.split("/").filter((p) => p.length > 0);
      const fallbackTitle =
        pathParts.length >= 2
          ? `${pathParts[0]}/${pathParts[1]}`
          : urlObj.hostname;

      return { title: fallbackTitle, abstract: null };
    } catch (error) {
      this.logger.warn(`Failed to fetch GitHub project info: ${String(error)}`);
      return { title: "GitHub Project", abstract: null };
    }
  }

  /**
   * 获取网页信息（通用）
   */
  private async fetchWebPageInfo(
    url: string,
  ): Promise<{ title: string; abstract: string | null }> {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36",
        },
      });

      if (response.ok) {
        const html = await response.text();

        // 提取标题
        const titleMatch =
          html.match(/<title[^>]*>([^<]+)<\/title>/i) ||
          html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i);
        const title = titleMatch
          ? titleMatch[1].replace(/\s+/g, " ").trim()
          : new URL(url).hostname;

        // 提取描述
        const descMatch = html.match(
          /<meta[^>]+(?:name="description"|property="og:description")[^>]+content="([^"]+)"/i,
        );
        const abstract = descMatch
          ? descMatch[1].replace(/\s+/g, " ").trim()
          : null;

        this.logger.log(`Fetched web page title: ${title}`);
        return { title, abstract };
      }

      // 如果无法获取，返回域名作为标题
      const fallbackTitle = new URL(url).hostname;
      return { title: fallbackTitle, abstract: null };
    } catch (error) {
      this.logger.warn(`Failed to fetch web page info: ${String(error)}`);
      const fallbackTitle = new URL(url).hostname;
      return { title: fallbackTitle, abstract: null };
    }
  }

  /**
   * 清理指定类型的重复资源
   * 基于 sourceUrl 或 normalizedUrl 识别重复项
   * 保留最早创建的记录，删除后续重复的记录
   */
  async cleanupDuplicates(resourceType?: string): Promise<{
    total: number;
    duplicatesFound: number;
    deleted: number;
    details: { title: string; url: string; count: number }[];
  }> {
    this.logger.log(
      `Starting duplicate cleanup for type: ${resourceType || "all"}`,
    );

    // 构建类型过滤条件
    const typeFilter = resourceType ? { type: resourceType as any } : {};

    // 查找所有重复的 sourceUrl
    const duplicateUrls = await this.prisma.resource.groupBy({
      by: ["sourceUrl"],
      where: {
        ...typeFilter,
        NOT: { sourceUrl: "" },
      },
      _count: { id: true },
      having: {
        id: { _count: { gt: 1 } },
      },
    });

    this.logger.log(`Found ${duplicateUrls.length} URLs with duplicates`);

    let deletedCount = 0;
    const details: { title: string; url: string; count: number }[] = [];

    // 对每个重复的URL进行处理
    for (const group of duplicateUrls) {
      if (!group.sourceUrl) continue;

      // 获取所有相同URL的资源，按创建时间排序（保留最早的）
      const resources = await this.prisma.resource.findMany({
        where: {
          sourceUrl: group.sourceUrl,
          ...typeFilter,
        },
        orderBy: { createdAt: "asc" },
        select: { id: true, title: true, sourceUrl: true, createdAt: true },
      });

      if (resources.length <= 1) continue;

      // 保留第一个（最早创建的），删除其余的
      const toDelete = resources.slice(1);
      const toKeep = resources[0];

      this.logger.log(
        `Keeping: ${toKeep.title} (${toKeep.id}), Deleting ${toDelete.length} duplicates`,
      );

      // 删除重复项
      const deleteIds = toDelete.map((r) => r.id);
      await this.prisma.resource.deleteMany({
        where: { id: { in: deleteIds } },
      });

      deletedCount += toDelete.length;
      details.push({
        title: toKeep.title || "Untitled",
        url: group.sourceUrl,
        count: toDelete.length,
      });
    }

    // 同样处理 normalizedUrl 的重复
    const duplicateNormalizedUrls = await this.prisma.resource.groupBy({
      by: ["normalizedUrl"],
      where: {
        ...typeFilter,
        normalizedUrl: { not: "" },
      },
      _count: { id: true },
      having: {
        id: { _count: { gt: 1 } },
      },
    });

    for (const group of duplicateNormalizedUrls) {
      if (!group.normalizedUrl) continue;

      const resources = await this.prisma.resource.findMany({
        where: {
          normalizedUrl: group.normalizedUrl,
          ...typeFilter,
        },
        orderBy: { createdAt: "asc" },
        select: { id: true, title: true, sourceUrl: true, createdAt: true },
      });

      if (resources.length <= 1) continue;

      const toDelete = resources.slice(1);
      const toKeep = resources[0];

      this.logger.log(
        `[normalizedUrl] Keeping: ${toKeep.title} (${toKeep.id}), Deleting ${toDelete.length} duplicates`,
      );

      const deleteIds = toDelete.map((r) => r.id);
      await this.prisma.resource.deleteMany({
        where: { id: { in: deleteIds } },
      });

      deletedCount += toDelete.length;

      // 避免重复添加到details
      if (!details.find((d) => d.url === toKeep.sourceUrl)) {
        details.push({
          title: toKeep.title || "Untitled",
          url: toKeep.sourceUrl || group.normalizedUrl,
          count: toDelete.length,
        });
      }
    }

    this.logger.log(
      `Duplicate cleanup completed: ${deletedCount} duplicates deleted`,
    );

    return {
      total: duplicateUrls.length + duplicateNormalizedUrls.length,
      duplicatesFound: duplicateUrls.length + duplicateNormalizedUrls.length,
      deleted: deletedCount,
      details,
    };
  }
}
