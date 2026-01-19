import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { SocialContentSourceType } from "../types";

export interface FetchedContent {
  title: string;
  content: string;
  coverImage?: string;
  images?: string[];
  url?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class ContentFetcherService {
  private readonly logger = new Logger(ContentFetcherService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 从外部URL获取内容
   */
  async fetchFromUrl(url: string): Promise<FetchedContent> {
    this.logger.log(`Fetching content from URL: ${url}`);

    try {
      // TODO: 实现真实的URL内容抓取
      // 可以使用 playwright 或 cheerio 等工具
      // 目前返回占位数据

      const response = await fetch(url);
      const html = await response.text();

      // 简单的标题提取（实际应使用更复杂的解析逻辑）
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : "Untitled";

      // TODO: 使用 AI 提取正文内容
      const content = `从 ${url} 提取的内容（待实现）`;

      return {
        title,
        content,
        url,
        metadata: {
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

    return {
      title: resource.title,
      content: resource.abstract || "",
      coverImage: resource.thumbnailUrl || undefined,
      url: resource.sourceUrl || undefined,
      metadata: {
        type: resource.type,
        authors: resource.authors,
      },
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

    return {
      title: topic.name,
      content: latestReport?.fullReport || topic.description || "",
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

    return {
      title: document.title,
      content:
        typeof document.content === "string"
          ? document.content
          : JSON.stringify(document.content),
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

    return {
      title: chapter.title,
      content: chapter.content || "",
      metadata: {
        projectName: chapter.volume.project.name,
        wordCount: chapter.wordCount,
      },
    };
  }
}
