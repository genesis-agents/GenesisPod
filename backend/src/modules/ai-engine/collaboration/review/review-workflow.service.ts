/**
 * Review Workflow Service
 * 审查工作流服务
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";

// TODO: Phase 4.1 - 需要创建 Review Prisma 模型
// 临时使用 any 类型以允许编译，待数据库迁移后移除
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getPrismaReview = (prisma: PrismaService): any => (prisma as any).review;
import { EventEmitter2 } from "@nestjs/event-emitter";
import {
  IReviewWorkflow,
  Review,
  ReviewRequest,
  ReviewFeedback,
  ReviewStatus,
  ReviewStats,
  ReviewEvent,
} from "./review.interface";

/**
 * 审查工作流服务
 */
@Injectable()
export class ReviewWorkflowService implements IReviewWorkflow {
  private readonly logger = new Logger(ReviewWorkflowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * 创建审查请求
   */
  async createReview(request: ReviewRequest): Promise<Review> {
    this.logger.debug(
      `Creating review for ${request.entityType}:${request.entityId}`,
    );

    const review = await getPrismaReview(this.prisma).create({
      data: {
        entityType: request.entityType,
        entityId: request.entityId,
        requesterId: request.requesterId,
        reviewerId: request.reviewerId,
        criteria: request.criteria,
        deadline: request.deadline,
        priority: request.priority ?? "medium",
        title: request.title,
        description: request.description,
        metadata: request.metadata as Record<string, unknown>,
        status: "pending",
        timeline: [
          {
            type: "created",
            timestamp: new Date().toISOString(),
            actor: request.requesterId,
          },
        ],
        version: 1,
      },
    });

    const result = this.mapToReview(review);

    this.eventEmitter.emit("review.created", {
      reviewId: result.id,
      entityType: request.entityType,
      entityId: request.entityId,
    });

    return result;
  }

  /**
   * 分配审查者
   * 使用乐观锁防止并发更新冲突
   */
  async assignReviewer(
    reviewId: string,
    reviewerId: string,
    assignedBy: string,
  ): Promise<Review> {
    const review = await getPrismaReview(this.prisma).findUnique({
      where: { id: reviewId },
    });
    if (!review) {
      throw new NotFoundException(`Review ${reviewId} not found`);
    }

    const currentVersion = review.version as number;
    const timeline = [...((review.timeline as ReviewEvent[]) || [])];
    timeline.push({
      type: "assigned",
      timestamp: new Date().toISOString(), // ★ 使用 ISO 字符串而非 Date 对象
      actor: assignedBy,
      details: { reviewerId },
    });

    try {
      const updated = await getPrismaReview(this.prisma).update({
        where: {
          id: reviewId,
          version: currentVersion, // ★ 乐观锁：检查版本
        },
        data: {
          reviewerId,
          reviewerName: await this.getReviewerName(reviewerId),
          timeline,
          version: { increment: 1 },
        },
      });

      this.eventEmitter.emit("review.assigned", {
        reviewId,
        reviewerId,
      });

      return this.mapToReview(updated);
    } catch (error) {
      // Prisma P2025: Record not found (version mismatch)
      if ((error as { code?: string }).code === "P2025") {
        throw new ConflictException(
          "Review was modified by another user, please refresh and try again",
        );
      }
      throw error;
    }
  }

  /**
   * 自动分配审查者
   */
  async autoAssign(reviewId: string): Promise<Review> {
    // 简化实现：随机选择一个可用的审查者
    // 实际应用中应根据工作负载、专业领域等进行智能分配
    const review = await getPrismaReview(this.prisma).findUnique({
      where: { id: reviewId },
    });
    if (!review) {
      throw new NotFoundException(`Review ${reviewId} not found`);
    }

    // 这里应该有审查者选择逻辑
    // 暂时返回原始数据
    return this.mapToReview(review);
  }

  /**
   * 开始审查
   * 使用乐观锁防止并发更新冲突
   */
  async startReview(reviewId: string, reviewerId: string): Promise<Review> {
    const review = await getPrismaReview(this.prisma).findUnique({
      where: { id: reviewId },
    });
    if (!review) {
      throw new NotFoundException(`Review ${reviewId} not found`);
    }

    const currentVersion = review.version as number;
    const timeline = [...((review.timeline as ReviewEvent[]) || [])];
    timeline.push({
      type: "started",
      timestamp: new Date().toISOString(), // ★ ISO 字符串
      actor: reviewerId,
    });

    try {
      const updated = await getPrismaReview(this.prisma).update({
        where: {
          id: reviewId,
          version: currentVersion, // ★ 乐观锁
        },
        data: {
          status: "in_progress",
          timeline,
          version: { increment: 1 },
        },
      });

      return this.mapToReview(updated);
    } catch (error) {
      if ((error as { code?: string }).code === "P2025") {
        throw new ConflictException(
          "Review was modified by another user, please refresh and try again",
        );
      }
      throw error;
    }
  }

  /**
   * 提交审查反馈
   * 使用乐观锁防止并发更新冲突
   */
  async submitFeedback(
    reviewId: string,
    feedback: ReviewFeedback,
    reviewerId: string,
  ): Promise<Review> {
    const review = await getPrismaReview(this.prisma).findUnique({
      where: { id: reviewId },
    });
    if (!review) {
      throw new NotFoundException(`Review ${reviewId} not found`);
    }

    const currentVersion = review.version as number;
    const timeline = [...((review.timeline as ReviewEvent[]) || [])];
    const now = new Date().toISOString(); // ★ ISO 字符串
    timeline.push({
      type: "feedback_added",
      timestamp: now,
      actor: reviewerId,
      details: { recommendation: feedback.recommendation },
    });

    // 根据反馈决定状态
    let newStatus: ReviewStatus = "in_progress";
    if (feedback.recommendation === "approve") {
      newStatus = "approved";
      timeline.push({
        type: "completed",
        timestamp: now,
        actor: reviewerId,
      });
    } else if (feedback.recommendation === "reject") {
      newStatus = "rejected";
      timeline.push({
        type: "completed",
        timestamp: now,
        actor: reviewerId,
      });
    } else if (feedback.recommendation === "revise") {
      newStatus = "revision_required";
    }

    try {
      const updated = await getPrismaReview(this.prisma).update({
        where: {
          id: reviewId,
          version: currentVersion, // ★ 乐观锁
        },
        data: {
          feedback: feedback as unknown as Record<string, unknown>,
          status: newStatus,
          timeline,
          completedAt: ["approved", "rejected"].includes(newStatus)
            ? new Date()
            : undefined,
          version: { increment: 1 },
        },
      });

      this.eventEmitter.emit("review.feedback_submitted", {
        reviewId,
        recommendation: feedback.recommendation,
      });

      return this.mapToReview(updated);
    } catch (error) {
      if ((error as { code?: string }).code === "P2025") {
        throw new ConflictException(
          "Review was modified by another user, please refresh and try again",
        );
      }
      throw error;
    }
  }

  /**
   * 更新审查状态
   * 使用乐观锁防止并发更新冲突
   */
  async updateStatus(
    reviewId: string,
    status: ReviewStatus,
    actor: string,
  ): Promise<Review> {
    const review = await getPrismaReview(this.prisma).findUnique({
      where: { id: reviewId },
    });
    if (!review) {
      throw new NotFoundException(`Review ${reviewId} not found`);
    }

    const currentVersion = review.version as number;
    const timeline = [...((review.timeline as ReviewEvent[]) || [])];
    timeline.push({
      type: "status_changed",
      timestamp: new Date().toISOString(), // ★ ISO 字符串
      actor,
      details: { oldStatus: review.status, newStatus: status },
    });

    try {
      const updated = await getPrismaReview(this.prisma).update({
        where: {
          id: reviewId,
          version: currentVersion, // ★ 乐观锁
        },
        data: {
          status,
          timeline,
          completedAt: ["approved", "rejected"].includes(status)
            ? new Date()
            : undefined,
          version: { increment: 1 },
        },
      });

      return this.mapToReview(updated);
    } catch (error) {
      if ((error as { code?: string }).code === "P2025") {
        throw new ConflictException(
          "Review was modified by another user, please refresh and try again",
        );
      }
      throw error;
    }
  }

  /**
   * 获取审查记录
   */
  async getReview(reviewId: string): Promise<Review | null> {
    const review = await getPrismaReview(this.prisma).findUnique({
      where: { id: reviewId },
    });
    return review ? this.mapToReview(review) : null;
  }

  /**
   * 获取实体的所有审查
   */
  async getReviewsForEntity(
    entityType: string,
    entityId: string,
  ): Promise<Review[]> {
    const reviews = await getPrismaReview(this.prisma).findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: "desc" },
    });
    return reviews.map((r: Record<string, unknown>) => this.mapToReview(r));
  }

  /**
   * 获取审查者的待审列表
   */
  async getPendingReviews(reviewerId: string): Promise<Review[]> {
    const reviews = await getPrismaReview(this.prisma).findMany({
      where: {
        reviewerId,
        status: { in: ["pending", "in_progress"] },
      },
      orderBy: [{ priority: "desc" }, { deadline: "asc" }],
    });
    return reviews.map((r: Record<string, unknown>) => this.mapToReview(r));
  }

  /**
   * 获取审查统计
   */
  async getStats(filters?: {
    entityType?: string;
    reviewerId?: string;
  }): Promise<ReviewStats> {
    const where: Record<string, unknown> = {};
    if (filters?.entityType) where.entityType = filters.entityType;
    if (filters?.reviewerId) where.reviewerId = filters.reviewerId;

    const reviews = await getPrismaReview(this.prisma).findMany({
      where,
      select: {
        status: true,
        createdAt: true,
        completedAt: true,
        feedback: true,
      },
    });

    let totalCompletionTime = 0;
    let completedCount = 0;
    let totalRating = 0;
    let ratingCount = 0;

    const stats: ReviewStats = {
      totalReviews: reviews.length,
      pendingCount: 0,
      inProgressCount: 0,
      completedCount: 0,
      avgCompletionTime: 0,
      avgRating: 0,
    };

    for (const review of reviews) {
      switch (review.status) {
        case "pending":
          stats.pendingCount++;
          break;
        case "in_progress":
          stats.inProgressCount++;
          break;
        case "approved":
        case "rejected":
          stats.completedCount++;
          completedCount++;
          if (review.completedAt && review.createdAt) {
            totalCompletionTime +=
              new Date(review.completedAt).getTime() -
              new Date(review.createdAt).getTime();
          }
          break;
      }

      const feedback = review.feedback as ReviewFeedback | null;
      if (feedback?.overallRating) {
        totalRating += feedback.overallRating;
        ratingCount++;
      }
    }

    stats.avgCompletionTime =
      completedCount > 0 ? totalCompletionTime / completedCount : 0;
    stats.avgRating = ratingCount > 0 ? totalRating / ratingCount : 0;

    return stats;
  }

  /**
   * 取消审查
   * 使用乐观锁防止并发更新冲突
   */
  async cancelReview(
    reviewId: string,
    actor: string,
    reason?: string,
  ): Promise<Review> {
    const review = await getPrismaReview(this.prisma).findUnique({
      where: { id: reviewId },
    });
    if (!review) {
      throw new NotFoundException(`Review ${reviewId} not found`);
    }

    const currentVersion = review.version as number;
    const timeline = [...((review.timeline as ReviewEvent[]) || [])];
    timeline.push({
      type: "cancelled",
      timestamp: new Date().toISOString(), // ★ ISO 字符串
      actor,
      details: { reason },
    });

    try {
      const updated = await getPrismaReview(this.prisma).update({
        where: {
          id: reviewId,
          version: currentVersion, // ★ 乐观锁
        },
        data: {
          status: "rejected",
          timeline,
          completedAt: new Date(),
          version: { increment: 1 },
        },
      });

      return this.mapToReview(updated);
    } catch (error) {
      if ((error as { code?: string }).code === "P2025") {
        throw new ConflictException(
          "Review was modified by another user, please refresh and try again",
        );
      }
      throw error;
    }
  }

  /**
   * 重新打开审查
   * 使用乐观锁防止并发更新冲突
   */
  async reopenReview(
    reviewId: string,
    actor: string,
    reason?: string,
  ): Promise<Review> {
    const review = await getPrismaReview(this.prisma).findUnique({
      where: { id: reviewId },
    });
    if (!review) {
      throw new NotFoundException(`Review ${reviewId} not found`);
    }

    const currentVersion = review.version as number;
    const timeline = [...((review.timeline as ReviewEvent[]) || [])];
    timeline.push({
      type: "reopened",
      timestamp: new Date().toISOString(), // ★ ISO 字符串
      actor,
      details: { reason },
    });

    try {
      const updated = await getPrismaReview(this.prisma).update({
        where: {
          id: reviewId,
          version: currentVersion, // ★ 乐观锁
        },
        data: {
          status: "pending",
          timeline,
          completedAt: null,
          version: { increment: 1 },
        },
      });

      return this.mapToReview(updated);
    } catch (error) {
      if ((error as { code?: string }).code === "P2025") {
        throw new ConflictException(
          "Review was modified by another user, please refresh and try again",
        );
      }
      throw error;
    }
  }

  /**
   * 获取审查者名称
   */
  private async getReviewerName(reviewerId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: reviewerId },
      select: { username: true, email: true },
    });
    if (!user) {
      this.logger.warn(
        `User ${reviewerId} not found when getting reviewer name`,
      );
    }
    return user?.username ?? user?.email ?? "Unknown";
  }

  /**
   * 映射数据库记录到 Review 类型
   */
  private mapToReview(record: Record<string, unknown>): Review {
    return {
      id: record.id as string,
      request: {
        entityType: record.entityType as string,
        entityId: record.entityId as string,
        requesterId: record.requesterId as string,
        reviewerId: record.reviewerId as string | undefined,
        criteria: record.criteria as string[],
        deadline: record.deadline as Date | undefined,
        priority: record.priority as Review["request"]["priority"],
        title: record.title as string | undefined,
        description: record.description as string | undefined,
        metadata: record.metadata as Record<string, unknown> | undefined,
      },
      status: record.status as ReviewStatus,
      reviewer: record.reviewerId
        ? {
            id: record.reviewerId as string,
            name: (record.reviewerName as string) ?? "Unknown",
            role: record.reviewerRole as string | undefined,
          }
        : undefined,
      feedback: record.feedback as ReviewFeedback | undefined,
      timeline: (record.timeline as ReviewEvent[]) ?? [],
      createdAt: record.createdAt as Date,
      updatedAt: record.updatedAt as Date,
      completedAt: record.completedAt as Date | undefined,
      version: record.version as number,
    };
  }
}
