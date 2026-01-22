import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { SocialContentSourceType } from "@prisma/client";
import { WebContentExtractionService } from "../../../../common/content-processing/web-content-extraction.service";
import { YoutubeService } from "../../../content/explore/youtube.service";

export interface FetchedContent {
  title: string;
  content: string;
  /** 原文内容（英文或原始语言） */
  originalContent?: string;
  /** 翻译内容（中文） */
  translatedContent?: string;
  /** 是否为双语内容 */
  isBilingual?: boolean;
  coverImage?: string;
  images?: string[];
  url?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Sanitize string by removing characters that can cause PostgreSQL protocol errors.
 * Removes null bytes, control characters (except tab/LF/CR), replacement character,
 * and lone surrogates that can corrupt the PostgreSQL binary protocol.
 */
function sanitizeForDb(str: string | undefined | null): string {
  if (!str) return "";
  return str
    .replace(/\x00/g, "") // Remove null bytes
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F]/g, "") // Remove control chars except tab, LF, CR
    .replace(/\uFFFD/g, "") // Remove replacement character
    .replace(/[\uD800-\uDFFF]/g, ""); // Remove lone surrogates
}

/**
 * Sanitize JSON data recursively to remove problematic characters.
 */
function sanitizeJson(data: unknown): unknown {
  if (data === null || data === undefined) return data;
  if (typeof data === "string") return sanitizeForDb(data);
  if (Array.isArray(data)) return data.map(sanitizeJson);
  if (typeof data === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      result[key] = sanitizeJson(value);
    }
    return result;
  }
  return data;
}

@Injectable()
export class ContentFetcherService {
  private readonly logger = new Logger(ContentFetcherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly webExtractor: WebContentExtractionService,
    private readonly youtubeService: YoutubeService,
  ) {}

  /**
   * 从外部URL获取内容
   * 支持：YouTube 视频（自动获取字幕）、普通网页（Jina/Firecrawl）
   */
  async fetchFromUrl(url: string): Promise<FetchedContent> {
    this.logger.log(`Fetching content from URL: ${url}`);

    try {
      // 检测是否是 YouTube 视频
      const youtubeVideoId = this.extractYoutubeVideoId(url);
      if (youtubeVideoId) {
        return this.fetchFromYoutubeUrl(youtubeVideoId, url);
      }

      // 使用 WebContentExtractionService 提取普通网页内容
      const extracted = await this.webExtractor.extractContent(url);

      if (extracted.error || !extracted.content) {
        throw new Error(extracted.error || "无法提取内容");
      }

      return {
        title: sanitizeForDb(extracted.title || "Untitled"),
        content: sanitizeForDb(extracted.content),
        coverImage: extracted.image,
        url,
        metadata: {
          source: extracted.source,
          siteName: extracted.siteName,
          author: extracted.author,
          publishedDate: extracted.publishedDate,
          fetchedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to fetch URL: ${url}`, err);
      throw new Error(`无法获取URL内容: ${err.message}`);
    }
  }

  /**
   * 从 YouTube 视频获取字幕内容
   * 优先从数据库缓存获取，支持双语输出
   */
  private async fetchFromYoutubeUrl(
    videoId: string,
    url: string,
  ): Promise<FetchedContent> {
    this.logger.log(`Fetching YouTube transcript for video: ${videoId}`);

    try {
      // 1. 先检查数据库缓存（和 AI Explore 一致的处理方式）
      const cached = await this.prisma.youTubeTranscriptCache.findUnique({
        where: { videoId },
      });

      if (cached && cached.expiresAt > new Date()) {
        this.logger.log(
          `[Cache Hit] Found cached transcript for ${videoId}, hasTranslation=${!!cached.translatedTranscript}`,
        );

        const originalSegments = cached.transcript as Array<{
          text: string;
          start: number;
          duration: number;
        }>;
        const translatedSegments = cached.translatedTranscript as Array<{
          text: string;
          translatedText?: string;
        }> | null;

        // 构建双语内容
        const originalContent = originalSegments.map((s) => s.text).join(" ");
        const translatedContent = translatedSegments
          ? translatedSegments.map((s) => s.translatedText || s.text).join(" ")
          : null;

        // 合并内容：如果有翻译，优先使用翻译版本作为主要内容
        const mainContent = translatedContent || originalContent;

        return {
          title: sanitizeForDb(cached.title || "YouTube Video"),
          content: sanitizeForDb(mainContent),
          originalContent: sanitizeForDb(originalContent),
          translatedContent: translatedContent
            ? sanitizeForDb(translatedContent)
            : undefined,
          isBilingual: !!translatedContent,
          url,
          metadata: {
            videoId,
            source: "youtube",
            hasTranslation: !!cached.translatedTranscript,
            targetLanguage: cached.targetLanguage || undefined,
            cachedAt: cached.createdAt?.toISOString(),
            fetchedAt: new Date().toISOString(),
          },
        };
      }

      // 2. 缓存不存在或已过期，使用 YoutubeService 获取（会自动缓存）
      this.logger.log(
        `[Cache Miss] Fetching transcript via YoutubeService for ${videoId}`,
      );
      const transcript = await this.youtubeService.getTranscript(videoId);

      if (!transcript || !transcript.transcript?.length) {
        throw new Error("无法获取视频字幕");
      }

      // 构建内容
      const originalContent = transcript.transcript
        .map((seg) => seg.text)
        .join(" ");
      const translatedContent = transcript.hasTranslation
        ? transcript.transcript
            .map((seg) => seg.translatedText || seg.text)
            .join(" ")
        : null;

      const mainContent = translatedContent || originalContent;

      return {
        title: sanitizeForDb(transcript.title || "YouTube Video"),
        content: sanitizeForDb(mainContent),
        originalContent: sanitizeForDb(originalContent),
        translatedContent: translatedContent
          ? sanitizeForDb(translatedContent)
          : undefined,
        isBilingual: !!translatedContent,
        url,
        metadata: {
          videoId,
          source: "youtube",
          hasTranslation: transcript.hasTranslation,
          targetLanguage: transcript.targetLanguage,
          fetchedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to fetch YouTube transcript: ${videoId}`, err);
      throw new Error(`无法获取YouTube字幕: ${err.message}`);
    }
  }

  /**
   * 提取 YouTube 视频 ID
   */
  private extractYoutubeVideoId(url: string): string | null {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1];
      }
    }
    return null;
  }

  /**
   * 从内部来源获取内容
   */
  async fetchFromSource(
    sourceType: SocialContentSourceType,
    sourceId: string,
    userId: string,
  ): Promise<FetchedContent> {
    this.logger.log(`Fetching from source: ${sourceType}/${sourceId}`);

    switch (sourceType) {
      case SocialContentSourceType.AI_EXPLORE:
        return this.fetchFromExploreResource(sourceId);

      case SocialContentSourceType.AI_RESEARCH:
        return this.fetchFromResearchReport(sourceId, userId);

      case SocialContentSourceType.AI_OFFICE:
        return this.fetchFromOfficeDocument(sourceId, userId);

      case SocialContentSourceType.AI_WRITING:
        return this.fetchFromWritingChapter(sourceId, userId);

      default:
        throw new Error(`不支持的来源类型: ${sourceType}`);
    }
  }

  private async fetchFromExploreResource(
    resourceId: string,
  ): Promise<FetchedContent> {
    const resource = await this.prisma.resource.findUnique({
      where: { id: resourceId },
    });

    if (!resource) {
      throw new Error("资源不存在");
    }

    // ===== YouTube 视频：优先使用数据库缓存的字幕（和 AI Explore 一致） =====
    if (resource.type === "YOUTUBE_VIDEO") {
      const videoId = this.extractYoutubeVideoId(resource.sourceUrl);
      if (videoId) {
        this.logger.log(
          `Processing YouTube resource ${resourceId}, videoId: ${videoId}`,
        );

        // 直接使用 fetchFromYoutubeUrl，它会先检查缓存
        try {
          const youtubeContent = await this.fetchFromYoutubeUrl(
            videoId,
            resource.sourceUrl,
          );

          // 如果成功获取到字幕，返回（保留 Resource 的标题如果更好）
          if (
            youtubeContent.content &&
            youtubeContent.content.trim().length > 100
          ) {
            return {
              ...youtubeContent,
              title: sanitizeForDb(resource.title || youtubeContent.title),
              coverImage: resource.thumbnailUrl || youtubeContent.coverImage,
              metadata: {
                ...youtubeContent.metadata,
                resourceId,
                resourceType: resource.type,
                authors: resource.authors,
              },
            };
          }
        } catch (err) {
          this.logger.warn(
            `Failed to fetch YouTube content for resource ${resourceId}: ${err}`,
          );
          // 继续尝试使用 Resource 本身的内容
        }
      }
    }

    // ===== 非 YouTube 资源或 YouTube 字幕获取失败 =====
    // Use the best available content: content > aiSummary > abstract
    let bestContent =
      resource.content || resource.aiSummary || resource.abstract || "";
    let originalContent: string | undefined;
    let translatedContent: string | undefined;
    let isBilingual = false;

    // 如果是普通网页且内容不足，尝试从 URL 获取
    if (
      !bestContent ||
      (bestContent.trim().length < 100 && resource.sourceUrl)
    ) {
      this.logger.log(
        `Resource ${resourceId} has insufficient content (${bestContent?.length || 0} chars), fetching from URL...`,
      );
      try {
        const extracted = await this.webExtractor.extractContent(
          resource.sourceUrl,
        );
        if (
          extracted.content &&
          extracted.content.length > (bestContent?.length || 0)
        ) {
          bestContent = extracted.content;
          this.logger.log(
            `Fetched content from URL: ${bestContent.length} chars`,
          );

          // 更新 Resource 的内容（异步，不阻塞）
          this.updateResourceContent(resourceId, bestContent).catch((err) => {
            this.logger.warn(`Failed to update resource content: ${err}`);
          });
        }
      } catch (err) {
        this.logger.warn(`Failed to fetch content from URL: ${err}`);
      }
    }

    if (!bestContent || bestContent.trim().length < 10) {
      this.logger.warn(
        `Resource ${resourceId} has insufficient content: length=${bestContent?.length || 0}`,
      );
      throw new Error(
        "该资源内容不足，无法生成社交媒体内容。请选择内容更丰富的资源。",
      );
    }

    // Sanitize all string fields to prevent PostgreSQL protocol errors
    return {
      title: sanitizeForDb(resource.title),
      content: sanitizeForDb(bestContent),
      originalContent,
      translatedContent,
      isBilingual,
      coverImage: resource.thumbnailUrl || undefined,
      url: resource.sourceUrl || undefined,
      metadata: sanitizeJson({
        resourceId,
        type: resource.type,
        authors: resource.authors,
      }) as Record<string, unknown>,
    };
  }

  /**
   * 异步更新 Resource 的内容（用于缓存从 URL 获取的内容）
   */
  private async updateResourceContent(
    resourceId: string,
    content: string,
  ): Promise<void> {
    try {
      await this.prisma.resource.update({
        where: { id: resourceId },
        data: { content: sanitizeForDb(content) },
      });
      this.logger.log(`Updated resource ${resourceId} with fetched content`);
    } catch (error) {
      this.logger.warn(`Failed to update resource content: ${error}`);
    }
  }

  private async fetchFromResearchReport(
    topicId: string,
    userId: string,
  ): Promise<FetchedContent> {
    const topic = await this.prisma.researchTopic.findFirst({
      where: { id: topicId, userId },
      include: {
        reports: {
          orderBy: { version: "desc" },
          take: 1,
        },
      },
    });

    if (!topic) {
      throw new Error("研究主题不存在");
    }

    const latestReport = topic.reports[0];

    // Sanitize content to prevent PostgreSQL protocol errors
    return {
      title: sanitizeForDb(topic.name),
      content:
        sanitizeForDb(latestReport?.fullReport || topic.description) || "",
      metadata: {
        status: topic.status,
        reportVersion: latestReport?.version,
      },
    };
  }

  private async fetchFromOfficeDocument(
    documentId: string,
    userId: string,
  ): Promise<FetchedContent> {
    const document = await this.prisma.officeDocument.findFirst({
      where: { id: documentId, userId },
    });

    if (!document) {
      throw new Error("文档不存在");
    }

    // Sanitize user content to prevent PostgreSQL protocol errors
    const rawContent =
      typeof document.content === "string"
        ? document.content
        : JSON.stringify(document.content);

    return {
      title: sanitizeForDb(document.title),
      content: sanitizeForDb(rawContent),
      metadata: {
        documentType: document.type,
      },
    };
  }

  private async fetchFromWritingChapter(
    chapterId: string,
    userId: string,
  ): Promise<FetchedContent> {
    const chapter = await this.prisma.writingChapter.findFirst({
      where: { id: chapterId },
      include: {
        volume: {
          include: {
            project: {
              select: { ownerId: true, name: true },
            },
          },
        },
      },
    });

    if (!chapter || chapter.volume.project.ownerId !== userId) {
      throw new Error("章节不存在");
    }

    // Sanitize user content to prevent PostgreSQL protocol errors
    return {
      title: sanitizeForDb(chapter.title),
      content: sanitizeForDb(chapter.content) || "",
      metadata: {
        projectName: sanitizeForDb(chapter.volume.project.name),
        wordCount: chapter.wordCount,
      },
    };
  }
}
