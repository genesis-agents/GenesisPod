import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { AiChatService } from "../../../ai-engine/llm/services/ai-chat.service";
import { ContentFetcherService } from "./content-fetcher.service";
import { ContentTransformerService } from "./content-transformer.service";
import { ContentCheckerService } from "./content-checker.service";
import { ProcessUrlDto } from "../dto/process-url.dto";
import { ProcessSourceDto } from "../dto/process-source.dto";
import {
  SocialContentStatus,
  SocialContentSourceType,
  SocialReviewStatus,
} from "../types";

// Prisma client accessor for models not yet migrated
type PrismaAny = any;

@Injectable()
export class SocialLeaderService {
  private readonly logger = new Logger(SocialLeaderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiChatService: AiChatService,
    private readonly contentFetcher: ContentFetcherService,
    private readonly contentTransformer: ContentTransformerService,
    private readonly contentChecker: ContentCheckerService,
  ) {}

  // Helper to access prisma with new models
  private get db(): PrismaAny {
    return this.prisma;
  }

  // Expose AI chat service for advanced operations
  getAiChat(): AiChatService {
    return this.aiChatService;
  }

  /**
   * 处理外部URL，自动提取内容并转换为目标平台格式
   */
  async processUrl(userId: string, dto: ProcessUrlDto) {
    this.logger.log(`Processing URL: ${dto.url} for user ${userId}`);

    // 1. 获取URL内容
    const fetchedContent = await this.contentFetcher.fetchFromUrl(dto.url);

    // 2. AI 转换为目标平台格式
    const transformedContent = await this.contentTransformer.transform({
      sourceContent: fetchedContent.content,
      sourceTitle: fetchedContent.title,
      targetType: dto.targetType,
      additionalInstructions: dto.additionalInstructions,
    });

    // 3. 内容合规检测
    const checkResult = await this.contentChecker.check(
      transformedContent.content,
    );

    // 4. 创建内容记录
    const content = await this.db.socialContent.create({
      data: {
        userId,
        contentType: dto.targetType,
        sourceType: SocialContentSourceType.EXTERNAL_URL,
        sourceUrl: dto.url,
        title: transformedContent.title,
        content: transformedContent.content,
        digest: transformedContent.digest,
        coverImageUrl: fetchedContent.coverImage,
        images: fetchedContent.images || [],
        tags: transformedContent.tags || [],
        status: SocialContentStatus.DRAFT,
        reviewStatus: SocialReviewStatus.PENDING,
        complianceCheck: checkResult as object,
      },
    });

    return {
      content,
      checkResult,
      message: checkResult.passed
        ? "内容已生成，请确认后发布"
        : "内容存在合规问题，请修改后再发布",
    };
  }

  /**
   * 处理内部来源（AI Explore、Research、Office、Writing）
   */
  async processSource(userId: string, dto: ProcessSourceDto) {
    this.logger.log(
      `Processing source: ${dto.sourceType}/${dto.sourceId} for user ${userId}`,
    );

    // 1. 获取来源内容
    const sourceContent = await this.contentFetcher.fetchFromSource(
      dto.sourceType,
      dto.sourceId,
      userId,
    );

    // 2. AI 转换为目标平台格式
    const transformedContent = await this.contentTransformer.transform({
      sourceContent: sourceContent.content,
      sourceTitle: sourceContent.title,
      targetType: dto.targetType,
      additionalInstructions: dto.additionalInstructions,
    });

    // 3. 内容合规检测
    const checkResult = await this.contentChecker.check(
      transformedContent.content,
    );

    // 4. 创建内容记录
    const content = await this.db.socialContent.create({
      data: {
        userId,
        contentType: dto.targetType,
        sourceType: dto.sourceType,
        sourceId: dto.sourceId,
        sourceUrl: sourceContent.url,
        title: transformedContent.title,
        content: transformedContent.content,
        digest: transformedContent.digest,
        coverImageUrl: sourceContent.coverImage,
        images: sourceContent.images || [],
        tags: transformedContent.tags || [],
        status: SocialContentStatus.DRAFT,
        reviewStatus: SocialReviewStatus.PENDING,
        complianceCheck: checkResult as object,
      },
    });

    return {
      content,
      checkResult,
      message: checkResult.passed
        ? "内容已生成，请确认后发布"
        : "内容存在合规问题，请修改后再发布",
    };
  }

  /**
   * 重新生成内容
   */
  async regenerateContent(userId: string, contentId: string) {
    const existingContent = await this.db.socialContent.findFirst({
      where: { id: contentId, userId },
    });

    if (!existingContent) {
      throw new Error("内容不存在");
    }

    // 根据原始来源重新获取和转换
    if (existingContent.sourceUrl) {
      return this.processUrl(userId, {
        url: existingContent.sourceUrl,
        targetType: existingContent.contentType,
      });
    }

    if (existingContent.sourceId && existingContent.sourceType) {
      return this.processSource(userId, {
        sourceType: existingContent.sourceType,
        sourceId: existingContent.sourceId,
        targetType: existingContent.contentType,
      });
    }

    throw new Error("无法确定原始内容来源");
  }
}
