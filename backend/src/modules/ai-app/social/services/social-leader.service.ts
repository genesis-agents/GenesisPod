import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
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
  SocialContentType,
  SocialReviewStatus,
} from "../types";

// Prisma client accessor for models not yet migrated
type PrismaAny = any;

// Helper to sanitize strings by removing problematic characters
function sanitizeString(str: string | undefined | null): string {
  if (!str) return "";
  // Remove null bytes and other control characters that can cause PostgreSQL protocol errors
  // Keep common whitespace (tab, newline, carriage return)
  return str
    .replace(/\x00/g, "") // Remove null bytes
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F]/g, "") // Remove control chars except tab, LF, CR
    .replace(/\uFFFD/g, "") // Remove replacement character
    .replace(/[\uD800-\uDFFF]/g, ""); // Remove lone surrogates
}

// Helper to safely truncate strings for database fields
function truncateString(
  str: string | undefined | null,
  maxLength: number,
): string {
  if (!str) return "";
  const sanitized = sanitizeString(str);
  if (sanitized.length <= maxLength) return sanitized;
  // Truncate and add ellipsis, leaving room for "..."
  return sanitized.substring(0, maxLength - 3) + "...";
}

// Helper to safely convert data to JSON-serializable format
function safeJsonSerialize<T>(data: T, fallback: T): T {
  try {
    // Test if data can be serialized
    JSON.stringify(data);
    return data;
  } catch {
    return fallback;
  }
}

// Helper to ensure array is valid JSON array
function ensureJsonArray(data: unknown): string[] {
  if (!data) return [];
  if (!Array.isArray(data)) return [];
  // Filter out non-string items and ensure serializable
  return data
    .filter((item): item is string => typeof item === "string")
    .map((item) => truncateString(item, 500));
}

// Retry helper for transient database errors (like connection pool issues)
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 500,
  logger?: Logger,
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const errorMessage = lastError.message;

      // Check if it's a transient error that can be retried
      // Be specific to avoid retrying non-transient errors like "Invalid connection string"
      const isTransientError =
        errorMessage.includes("08P01") || // PostgreSQL protocol error
        errorMessage.includes("insufficient data") ||
        errorMessage.includes("ECONNRESET") ||
        errorMessage.includes("ETIMEDOUT") ||
        errorMessage.includes("Connection terminated") ||
        errorMessage.includes("connection reset") ||
        errorMessage.includes("connection closed") ||
        errorMessage.includes("Can't reach database") ||
        errorMessage.includes("Server has closed the connection");

      if (isTransientError && attempt < maxRetries) {
        const delay = delayMs * Math.pow(2, attempt - 1); // Exponential backoff
        logger?.warn(
          `Database operation failed (attempt ${attempt}/${maxRetries}), ` +
            `retrying in ${delay}ms: ${errorMessage.slice(0, 100)}`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw lastError;
      }
    }
  }
  throw lastError;
}

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

    // 3. 验证转换后的内容有效性
    if (
      !transformedContent.content ||
      transformedContent.content.trim().length < 10
    ) {
      this.logger.error(
        `Invalid transformed content: length=${transformedContent.content?.length || 0}`,
      );
      throw new BadRequestException("内容转换结果无效，请重试");
    }

    // 4. 内容合规检测
    const checkResult = await this.contentChecker.check(
      transformedContent.content,
    );

    // 5. 创建内容记录 (truncate fields and validate JSON to fit database constraints)
    const safeImages = ensureJsonArray(fetchedContent.images);
    const safeTags = ensureJsonArray(transformedContent.tags);
    const safeComplianceCheck = safeJsonSerialize(checkResult, {
      passed: false,
      score: 0,
      issues: [],
      suggestions: ["Compliance check data was invalid"],
    });

    this.logger.debug(
      `Creating social content: title=${transformedContent.title?.slice(0, 50)}, ` +
        `contentLength=${transformedContent.content?.length}, ` +
        `imagesCount=${safeImages.length}, tagsCount=${safeTags.length}`,
    );

    // Sanitize content to remove problematic characters
    const safeContent = sanitizeString(transformedContent.content);
    const safeSourceUrl = sanitizeString(dto.url) || null;
    const safeCoverImageUrl = sanitizeString(fetchedContent.coverImage) || null;

    this.logger.log(
      `[processUrl] Saving content: titleLen=${truncateString(transformedContent.title, 200).length}, ` +
        `contentLen=${safeContent.length}, imagesCount=${safeImages.length}, tagsCount=${safeTags.length}`,
    );

    // Use retry logic to handle transient database connection errors
    const content = await withRetry(
      () =>
        this.db.socialContent.create({
          data: {
            userId,
            contentType: dto.targetType,
            sourceType: SocialContentSourceType.EXTERNAL_URL,
            sourceUrl: safeSourceUrl,
            title: truncateString(transformedContent.title, 200),
            content: safeContent,
            digest: truncateString(transformedContent.digest, 200) || null,
            coverImageUrl: safeCoverImageUrl,
            images: safeImages,
            tags: safeTags,
            status: SocialContentStatus.DRAFT,
            reviewStatus: SocialReviewStatus.PENDING,
            complianceCheck: safeComplianceCheck,
          },
        }),
      3,
      500,
      this.logger,
    );

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

    // 3. 验证转换后的内容有效性
    if (
      !transformedContent.content ||
      transformedContent.content.trim().length < 10
    ) {
      this.logger.error(
        `Invalid transformed content from source: length=${transformedContent.content?.length || 0}`,
      );
      throw new BadRequestException("内容转换结果无效，请重试");
    }

    // 4. 内容合规检测
    const checkResult = await this.contentChecker.check(
      transformedContent.content,
    );

    // 5. 创建内容记录 (truncate fields and validate JSON to fit database constraints)
    const safeImages = ensureJsonArray(sourceContent.images);
    const safeTags = ensureJsonArray(transformedContent.tags);
    const safeComplianceCheck = safeJsonSerialize(checkResult, {
      passed: false,
      score: 0,
      issues: [],
      suggestions: ["Compliance check data was invalid"],
    });

    // Sanitize content to remove problematic characters
    const safeContent = sanitizeString(transformedContent.content);
    const safeTitle = truncateString(transformedContent.title, 200);
    const safeDigest = truncateString(transformedContent.digest, 200) || null;
    const safeSourceUrl = sanitizeString(sourceContent.url) || null;
    const safeCoverImageUrl = sanitizeString(sourceContent.coverImage) || null;

    // Build complete data object for debugging and insertion
    const createData = {
      userId,
      contentType: dto.targetType,
      sourceType: dto.sourceType,
      sourceId: dto.sourceId,
      sourceUrl: safeSourceUrl,
      title: safeTitle,
      content: safeContent,
      digest: safeDigest,
      coverImageUrl: safeCoverImageUrl,
      images: safeImages,
      tags: safeTags,
      status: SocialContentStatus.DRAFT,
      reviewStatus: SocialReviewStatus.PENDING,
      complianceCheck: safeComplianceCheck,
    };

    // Debug: Log all field details to identify problematic data
    this.logger.log(
      `[processSource] Creating SocialContent with data: ` +
        `title(${safeTitle.length}), content(${safeContent.length}), ` +
        `digest(${safeDigest?.length || 0}), sourceUrl(${safeSourceUrl?.length || 0}), ` +
        `coverImageUrl(${safeCoverImageUrl?.length || 0}), images(${safeImages.length}), tags(${safeTags.length})`,
    );

    // Debug: Log the full JSON to check for encoding issues
    try {
      const jsonStr = JSON.stringify(createData);
      const byteLength = Buffer.byteLength(jsonStr, "utf8");
      this.logger.debug(
        `[processSource] Data JSON byte length: ${byteLength}, ` +
          `complianceCheck: ${JSON.stringify(safeComplianceCheck).length} bytes`,
      );
    } catch (jsonError) {
      this.logger.error(
        `[processSource] Failed to serialize data to JSON: ${jsonError}`,
      );
    }

    // Use retry logic to handle transient database connection errors
    const content = await withRetry(
      () => this.db.socialContent.create({ data: createData }),
      3,
      500,
      this.logger,
    );

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
    // Use retry for database query in case of transient connection issues
    const existingContent = await withRetry(
      async () => {
        const result = await this.db.socialContent.findFirst({
          where: { id: contentId, userId },
        });
        return result as {
          sourceUrl?: string;
          sourceId?: string;
          sourceType?: SocialContentSourceType;
          contentType: SocialContentType;
        } | null;
      },
      3,
      500,
      this.logger,
    );

    if (!existingContent) {
      throw new NotFoundException("内容不存在");
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

    throw new BadRequestException("无法确定原始内容来源");
  }
}
