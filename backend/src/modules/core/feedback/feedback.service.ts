import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { CreateFeedbackDto, FeedbackTypeDto } from "./dto/create-feedback.dto";
import { EmailService } from "../email/email.service";
import { R2StorageService } from "../storage/r2-storage.service";

// Type mapping for feedback types
type FeedbackTypeEnum = "BUG" | "FEATURE" | "IMPROVEMENT" | "OTHER";
type FeedbackStatusEnum =
  | "PENDING"
  | "REVIEWED"
  | "IN_PROGRESS"
  | "RESOLVED"
  | "CLOSED";

interface StoredAttachment {
  filename: string;
  url: string;
  mimeType: string;
  size: number;
}

@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);

  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
    private r2Storage: R2StorageService,
  ) {}

  /**
   * Convert DTO type to Prisma enum
   */
  private mapFeedbackType(type: FeedbackTypeDto): FeedbackTypeEnum {
    const mapping: Record<FeedbackTypeDto, FeedbackTypeEnum> = {
      [FeedbackTypeDto.BUG]: "BUG",
      [FeedbackTypeDto.FEATURE]: "FEATURE",
      [FeedbackTypeDto.IMPROVEMENT]: "IMPROVEMENT",
      [FeedbackTypeDto.OTHER]: "OTHER",
    };
    return mapping[type];
  }

  /**
   * Upload attachments to R2 storage
   */
  private async uploadAttachments(
    files: Express.Multer.File[],
    feedbackId: string,
  ): Promise<StoredAttachment[]> {
    const attachments: StoredAttachment[] = [];

    for (const file of files) {
      try {
        const result = await this.r2Storage.uploadBuffer(
          file.buffer,
          `feedback/${feedbackId}`,
          file.originalname,
          file.mimetype,
        );

        if (result.success && result.url) {
          attachments.push({
            filename: file.originalname,
            url: result.url,
            mimeType: file.mimetype,
            size: file.size,
          });
          this.logger.log(`Uploaded attachment: ${file.originalname}`);
        } else {
          this.logger.warn(
            `Failed to upload attachment: ${file.originalname} - ${result.error}`,
          );
        }
      } catch (error) {
        this.logger.error(
          `Failed to upload attachment: ${file.originalname}`,
          error,
        );
      }
    }

    return attachments;
  }

  /**
   * Create new feedback with optional attachments and email notification
   */
  async createFeedback(
    dto: CreateFeedbackDto,
    userId?: string,
    files?: Express.Multer.File[],
  ) {
    this.logger.log(
      `Creating feedback: ${dto.type} - ${dto.title} (${files?.length || 0} files)`,
    );

    const feedbackType = this.mapFeedbackType(dto.type);

    // Generate feedback ID first for attachment paths
    const feedbackId = crypto.randomUUID();

    // Upload attachments if any
    let attachments: StoredAttachment[] = [];
    if (files && files.length > 0) {
      attachments = await this.uploadAttachments(files, feedbackId);
    }

    // Use raw SQL to insert feedback with attachments
    const result = await this.prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO "feedbacks" (
        "id", "type", "status", "title", "description",
        "user_email", "user_agent", "page_url", "user_id",
        "attachments", "created_at", "updated_at"
      ) VALUES (
        ${feedbackId}::uuid,
        ${feedbackType}::"FeedbackType",
        'PENDING'::"FeedbackStatus",
        ${dto.title},
        ${dto.description},
        ${dto.userEmail || null},
        ${dto.userAgent || null},
        ${dto.url || null},
        ${userId || null},
        ${JSON.stringify(attachments)}::jsonb,
        NOW(),
        NOW()
      )
      RETURNING id
    `;

    const createdId = result[0]?.id;
    this.logger.log(`Feedback created: ${createdId}`);

    // Send email notification to admin
    try {
      const emailAttachments = files?.map((f) => ({
        filename: f.originalname,
        content: f.buffer,
      }));

      await this.emailService.sendFeedbackNotification({
        id: createdId,
        type: feedbackType,
        title: dto.title,
        description: dto.description,
        userEmail: dto.userEmail,
        pageUrl: dto.url,
        userAgent: dto.userAgent,
        attachments: emailAttachments,
      });
    } catch (error) {
      // Log error but don't fail the request
      this.logger.error("Failed to send email notification", error);
    }

    return {
      success: true,
      feedbackId: createdId,
      message: "Feedback submitted successfully",
      attachmentsCount: attachments.length,
    };
  }

  /**
   * Get all feedback (admin)
   */
  async getAllFeedback(options?: {
    status?: FeedbackStatusEnum;
    type?: FeedbackTypeEnum;
    limit?: number;
    offset?: number;
  }) {
    const { status, type, limit = 50, offset = 0 } = options || {};

    // Build where clause parts
    const whereParts: string[] = [];
    if (status) whereParts.push(`"status" = '${status}'::"FeedbackStatus"`);
    if (type) whereParts.push(`"type" = '${type}'::"FeedbackType"`);

    const whereClause =
      whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";

    const feedbacks = await this.prisma.$queryRawUnsafe<unknown[]>(`
      SELECT * FROM "feedbacks"
      ${whereClause}
      ORDER BY "created_at" DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    const countResult = await this.prisma.$queryRawUnsafe<{ count: bigint }[]>(`
      SELECT COUNT(*) as count FROM "feedbacks" ${whereClause}
    `);

    return {
      feedbacks,
      total: Number(countResult[0]?.count || 0),
      limit,
      offset,
    };
  }

  /**
   * Get feedback by ID
   */
  async getFeedbackById(id: string) {
    const result = await this.prisma.$queryRaw<unknown[]>`
      SELECT * FROM "feedbacks" WHERE "id" = ${id}::uuid
    `;
    return result[0] || null;
  }

  /**
   * Update feedback status (admin)
   */
  async updateFeedbackStatus(
    id: string,
    status: FeedbackStatusEnum,
    adminNotes?: string,
  ) {
    const result = await this.prisma.$queryRaw<unknown[]>`
      UPDATE "feedbacks"
      SET "status" = ${status}::"FeedbackStatus",
          "admin_notes" = ${adminNotes || null},
          "updated_at" = NOW()
      WHERE "id" = ${id}::uuid
      RETURNING *
    `;
    return result[0] || null;
  }

  /**
   * Get feedback statistics
   */
  async getFeedbackStats() {
    const totalResult = await this.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM "feedbacks"
    `;

    const byTypeResult = await this.prisma.$queryRaw<
      { type: string; count: bigint }[]
    >`
      SELECT "type"::text, COUNT(*) as count
      FROM "feedbacks"
      GROUP BY "type"
    `;

    const byStatusResult = await this.prisma.$queryRaw<
      { status: string; count: bigint }[]
    >`
      SELECT "status"::text, COUNT(*) as count
      FROM "feedbacks"
      GROUP BY "status"
    `;

    return {
      total: Number(totalResult[0]?.count || 0),
      byType: byTypeResult.reduce(
        (acc: Record<string, number>, item) => {
          acc[item.type] = Number(item.count);
          return acc;
        },
        {} as Record<string, number>,
      ),
      byStatus: byStatusResult.reduce(
        (acc: Record<string, number>, item) => {
          acc[item.status] = Number(item.count);
          return acc;
        },
        {} as Record<string, number>,
      ),
    };
  }
}
