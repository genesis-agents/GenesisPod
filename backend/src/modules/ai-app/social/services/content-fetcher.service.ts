import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { SocialContentSourceType } from "@prisma/client";
import { WebContentExtractionService } from "../../../../common/content-processing/web-content-extraction.service";
import { YoutubeService } from "../../../content/explore/youtube.service";

export interface FetchedContent {
  title: string;
  content: string;
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
   */
  private async fetchFromYoutubeUrl(
    videoId: string,
    url: string,
  ): Promise<FetchedContent> {
    this.logger.log(`Fetching YouTube transcript for video: ${videoId}`);

    try {
      const transcript = await this.youtubeService.getTranscript(videoId);

      if (!transcript || !transcript.transcript?.length) {
        throw new Error("无法获取视频字幕");
      }

      // 合并字幕文本
      const content = transcript.transcript
        .map((seg) => seg.translatedText || seg.text)
        .join(" ");

      return {
        title: sanitizeForDb(transcript.title || "YouTube Video"),
        content: sanitizeForDb(content),
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

    // Use the best available content: content > aiSummary > abstract
    // Resource data comes from crawlers and may contain control characters
    let bestContent =
      resource.content || resource.aiSummary || resource.abstract || "";

    // 如果是 YouTube 视频且内容不足，尝试获取字幕
    if (
      resource.type === "YOUTUBE_VIDEO" &&
      (!bestContent || bestContent.trim().length < 100)
    ) {
      this.logger.log(
        `YouTube resource ${resourceId} has insufficient content, fetching transcript...`,
      );
      const videoId = this.extractYoutubeVideoId(resource.sourceUrl);
      if (videoId) {
        try {
          const transcript = await this.youtubeService.getTranscript(videoId);
          if (transcript?.transcript?.length) {
            bestContent = transcript.transcript
              .map((seg) => seg.translatedText || seg.text)
              .join(" ");
            this.logger.log(
              `Fetched YouTube transcript: ${bestContent.length} chars`,
            );
          }
        } catch (err) {
          this.logger.warn(`Failed to fetch YouTube transcript: ${err}`);
        }
      }
    }

    // 如果是普通网页且内容不足，尝试从 URL 获取
    if (
      !bestContent ||
      (bestContent.trim().length < 100 &&
        resource.type !== "YOUTUBE_VIDEO" &&
        resource.sourceUrl)
    ) {
      this.logger.log(
        `Resource ${resourceId} has insufficient content, fetching from URL...`,
      );
      try {
        const extracted = await this.webExtractor.extractContent(
          resource.sourceUrl,
        );
        if (
          extracted.content &&
          extracted.content.length > bestContent.length
        ) {
          bestContent = extracted.content;
          this.logger.log(
            `Fetched content from URL: ${bestContent.length} chars`,
          );
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
      coverImage: resource.thumbnailUrl || undefined,
      url: resource.sourceUrl || undefined,
      metadata: sanitizeJson({
        type: resource.type,
        authors: resource.authors,
      }) as Record<string, unknown>,
    };
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
