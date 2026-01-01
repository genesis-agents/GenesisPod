/**
 * Wechat Import Service
 * Handles importing content from WeChat (Official Account articles, Video Channel)
 * to RAG Knowledge Base
 */

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { KnowledgeBaseService } from "./knowledge-base.service";
import { UrlFetchService } from "./url-fetch.service";

export type WechatLinkType = "article" | "video" | "external";

export interface WechatImportParams {
  url: string;
  title?: string;
  description?: string;
  userId: string;
  knowledgeBaseId?: string; // Optional: specify target KB, otherwise use default
}

export interface WechatImportResult {
  documentId: string;
  title: string;
  knowledgeBaseId: string;
  knowledgeBaseName: string;
  linkType: WechatLinkType;
  detailUrl: string;
}

export interface WechatMetadata {
  title: string;
  description?: string;
  author?: string;
  source?: string;
  thumbnail?: string;
  publishedAt?: Date;
}

@Injectable()
export class WechatImportService {
  private readonly logger = new Logger(WechatImportService.name);

  // WeChat domain patterns
  private readonly WECHAT_DOMAINS = {
    article: ["mp.weixin.qq.com"],
    video: ["channels.weixin.qq.com"],
    shortLink: ["weixin.qq.com"],
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly knowledgeBaseService: KnowledgeBaseService,
    private readonly urlFetchService: UrlFetchService,
  ) {}

  /**
   * Import content from WeChat URL to RAG Knowledge Base
   */
  async importWechatUrl(
    params: WechatImportParams,
  ): Promise<WechatImportResult> {
    this.logger.log(`Importing WeChat URL: ${params.url}`);

    // 1. Identify link type
    const linkType = this.identifyLinkType(params.url);
    this.logger.log(`Link type: ${linkType}`);

    // 2. Check for duplicates
    const existingDoc = await this.findExistingDocument(params.url);
    if (existingDoc) {
      throw new Error(
        `该内容已存在于知识库"${existingDoc.knowledgeBase?.name || "未知"}"中`,
      );
    }

    // 3. Get or create default knowledge base
    const knowledgeBase = params.knowledgeBaseId
      ? await this.knowledgeBaseService.findById(params.knowledgeBaseId)
      : await this.getOrCreateDefaultKnowledgeBase(params.userId);

    // 4. Extract metadata from URL
    const metadata = await this.extractMetadata(
      params.url,
      linkType,
      params.title,
      params.description,
    );

    // 5. Determine source type based on link type
    const sourceType = this.getSourceType(linkType);

    // 6. Add document to knowledge base
    const document = await this.knowledgeBaseService.addDocument(
      knowledgeBase.id,
      {
        title: metadata.title,
        sourceType,
        sourceUrl: params.url,
        content: metadata.description || "",
        metadata: {
          author: metadata.author,
          source: metadata.source,
          thumbnail: metadata.thumbnail,
          publishedAt: metadata.publishedAt,
          wechatLinkType: linkType,
          importedAt: new Date().toISOString(),
          importSource: "wechat_work",
        },
      },
    );

    this.logger.log(
      `Document created: ${document.id} in KB ${knowledgeBase.id}`,
    );

    return {
      documentId: document.id,
      title: document.title,
      knowledgeBaseId: knowledgeBase.id,
      knowledgeBaseName: knowledgeBase.name,
      linkType,
      detailUrl: `/rag/${knowledgeBase.id}/documents/${document.id}`,
    };
  }

  /**
   * Identify the type of WeChat link
   */
  identifyLinkType(url: string): WechatLinkType {
    try {
      const parsedUrl = new URL(url);
      const hostname = parsedUrl.hostname.toLowerCase();

      if (this.WECHAT_DOMAINS.article.some((d) => hostname.includes(d))) {
        return "article";
      }
      if (this.WECHAT_DOMAINS.video.some((d) => hostname.includes(d))) {
        return "video";
      }
      if (this.WECHAT_DOMAINS.shortLink.some((d) => hostname.includes(d))) {
        // WeChat short links usually redirect to articles
        return "article";
      }
    } catch (error) {
      this.logger.warn(`Failed to parse URL: ${url}`);
    }

    return "external";
  }

  /**
   * Extract metadata from URL
   * @param linkType Reserved for future use (different extraction strategies per type)
   */
  private async extractMetadata(
    url: string,
    _linkType: WechatLinkType,
    providedTitle?: string,
    providedDescription?: string,
  ): Promise<WechatMetadata> {
    try {
      // Use URL fetch service to extract metadata
      const fetchResult = await this.urlFetchService.fetchUrl(url);

      return {
        title: providedTitle || fetchResult.title || "无标题",
        description: providedDescription || fetchResult.metadata.description,
        author: fetchResult.metadata.author,
        source: fetchResult.metadata.siteName,
        publishedAt: fetchResult.metadata.publishDate
          ? new Date(fetchResult.metadata.publishDate)
          : undefined,
      };
    } catch (error) {
      this.logger.warn(
        `Failed to extract metadata from ${url}: ${error instanceof Error ? error.message : "Unknown error"}`,
      );

      // Fallback to provided metadata
      return {
        title: providedTitle || "无标题",
        description: providedDescription,
      };
    }
  }

  /**
   * Map link type to KnowledgeBaseSourceType
   */
  private getSourceType(linkType: WechatLinkType): string {
    switch (linkType) {
      case "article":
        return "WECHAT_ARTICLE";
      case "video":
        return "WECHAT_VIDEO";
      default:
        return "URL";
    }
  }

  /**
   * Check if URL already exists in any knowledge base
   */
  private async findExistingDocument(url: string) {
    return this.prisma.knowledgeBaseDocument.findFirst({
      where: {
        sourceUrl: url,
      },
      include: {
        knowledgeBase: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  /**
   * Get user's default knowledge base or create one
   */
  private async getOrCreateDefaultKnowledgeBase(userId: string) {
    // First, try to find an existing KB named "微信收藏" or similar
    let kb = await this.prisma.knowledgeBase.findFirst({
      where: {
        userId,
        name: {
          in: ["微信收藏", "WeChat Collection", "微信同步"],
        },
      },
    });

    if (kb) {
      return kb;
    }

    // Try to find any existing personal KB
    kb = await this.prisma.knowledgeBase.findFirst({
      where: {
        userId,
        type: "PERSONAL",
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    if (kb) {
      return kb;
    }

    // Create a new default KB for WeChat content
    this.logger.log(`Creating default WeChat KB for user ${userId}`);
    return this.knowledgeBaseService.create(userId, {
      name: "微信收藏",
      description: "通过企业微信自动同步的文章和视频",
      sourceType: "URL",
    });
  }

  /**
   * Get user mapping from WeChat Work user ID
   * WeChat Work uses different user IDs than our platform
   */
  async getUserByWechatWorkId(
    wechatWorkUserId: string,
  ): Promise<string | null> {
    // Try to find user with wechatWorkUserId in preferences
    const mapping = await this.prisma.user.findFirst({
      where: {
        preferences: {
          path: ["wechatWorkUserId"],
          equals: wechatWorkUserId,
        },
      },
      select: {
        id: true,
      },
    });

    return mapping?.id || null;
  }
}
