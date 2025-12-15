import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { CreateFeedbackDto, FeedbackTypeDto } from "./dto/create-feedback.dto";

// Type mapping for feedback types
type FeedbackTypeEnum = "BUG" | "FEATURE" | "IMPROVEMENT" | "OTHER";
type FeedbackStatusEnum =
  | "PENDING"
  | "REVIEWED"
  | "IN_PROGRESS"
  | "RESOLVED"
  | "CLOSED";

@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);

  constructor(private prisma: PrismaService) {}

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
   * Create new feedback using raw SQL (works before Prisma client is regenerated)
   */
  async createFeedback(dto: CreateFeedbackDto, userId?: string) {
    this.logger.log(`Creating feedback: ${dto.type} - ${dto.title}`);

    const feedbackType = this.mapFeedbackType(dto.type);

    // Use raw SQL to insert feedback
    const result = await this.prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO "feedbacks" (
        "id", "type", "status", "title", "description",
        "user_email", "user_agent", "page_url", "user_id",
        "created_at", "updated_at"
      ) VALUES (
        gen_random_uuid(),
        ${feedbackType}::"FeedbackType",
        'PENDING'::"FeedbackStatus",
        ${dto.title},
        ${dto.description},
        ${dto.userEmail || null},
        ${dto.userAgent || null},
        ${dto.url || null},
        ${userId || null},
        NOW(),
        NOW()
      )
      RETURNING id
    `;

    const feedbackId = result[0]?.id;
    this.logger.log(`Feedback created: ${feedbackId}`);

    return {
      success: true,
      feedbackId,
      message: "Feedback submitted successfully",
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
