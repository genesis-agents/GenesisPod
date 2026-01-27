import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../../../common/prisma/prisma.service";
import {
  ResearchFeedbackItemStatus,
  ResearchFeedbackCategory,
  FeedbackPriority,
} from "@prisma/client";
import { FeedbackStatsResponse } from "../dto";

/**
 * 反馈仪表板服务
 * 提供统计、审核队列和改进追踪数据
 */
@Injectable()
export class FeedbackDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 获取仪表板统计
   */
  async getStats(): Promise<FeedbackStatsResponse> {
    const [total, byCategory, byStatus, byPriority, recentTrend] =
      await Promise.all([
        this.prisma.researchFeedbackItem.count(),
        this.getCategoryStats(),
        this.getStatusStats(),
        this.getPriorityStats(),
        this.getRecentTrend(),
      ]);

    return {
      total,
      byCategory,
      byStatus,
      byPriority,
      recentTrend,
    };
  }

  /**
   * 获取按分类统计
   */
  private async getCategoryStats(): Promise<
    Record<ResearchFeedbackCategory, number>
  > {
    const stats = await this.prisma.researchFeedbackItem.groupBy({
      by: ["category"],
      _count: true,
    });

    // 初始化所有分类为 0
    const result: Record<ResearchFeedbackCategory, number> = {
      [ResearchFeedbackCategory.QUALITY_ISSUE]: 0,
      [ResearchFeedbackCategory.CONTENT_ERROR]: 0,
      [ResearchFeedbackCategory.FEATURE_REQUEST]: 0,
      [ResearchFeedbackCategory.IMPROVEMENT]: 0,
      [ResearchFeedbackCategory.POSITIVE]: 0,
    };

    // 填充实际数据
    for (const stat of stats) {
      if (stat.category) {
        result[stat.category] = stat._count;
      }
    }

    return result;
  }

  /**
   * 获取按状态统计
   */
  private async getStatusStats(): Promise<
    Record<ResearchFeedbackItemStatus, number>
  > {
    const stats = await this.prisma.researchFeedbackItem.groupBy({
      by: ["status"],
      _count: true,
    });

    // 初始化所有状态为 0
    const result: Record<ResearchFeedbackItemStatus, number> = {
      [ResearchFeedbackItemStatus.PENDING]: 0,
      [ResearchFeedbackItemStatus.ANALYZING]: 0,
      [ResearchFeedbackItemStatus.REVIEWING]: 0,
      [ResearchFeedbackItemStatus.APPROVED]: 0,
      [ResearchFeedbackItemStatus.REJECTED]: 0,
      [ResearchFeedbackItemStatus.APPLIED]: 0,
      [ResearchFeedbackItemStatus.CLOSED]: 0,
    };

    // 填充实际数据
    for (const stat of stats) {
      result[stat.status] = stat._count;
    }

    return result;
  }

  /**
   * 获取按优先级统计
   */
  private async getPriorityStats(): Promise<Record<FeedbackPriority, number>> {
    const stats = await this.prisma.researchFeedbackItem.groupBy({
      by: ["priority"],
      _count: true,
    });

    // 初始化所有优先级为 0
    const result: Record<FeedbackPriority, number> = {
      [FeedbackPriority.CRITICAL]: 0,
      [FeedbackPriority.HIGH]: 0,
      [FeedbackPriority.NORMAL]: 0,
      [FeedbackPriority.LOW]: 0,
    };

    // 填充实际数据
    for (const stat of stats) {
      result[stat.priority] = stat._count;
    }

    return result;
  }

  /**
   * 获取最近7天趋势
   * 优化：单次查询获取所有数据，在内存中聚合，避免 N+1 问题
   */
  private async getRecentTrend(): Promise<{ date: string; count: number }[]> {
    const TREND_DAYS = 7;

    // 计算起始日期
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (TREND_DAYS - 1));
    startDate.setHours(0, 0, 0, 0);

    // 单次查询获取所有相关数据
    const items = await this.prisma.researchFeedbackItem.findMany({
      where: {
        createdAt: { gte: startDate },
      },
      select: { createdAt: true },
    });

    // 在内存中按日期聚合
    const countByDate = new Map<string, number>();
    for (const item of items) {
      const dateStr = item.createdAt.toISOString().split("T")[0];
      countByDate.set(dateStr, (countByDate.get(dateStr) || 0) + 1);
    }

    // 构建结果，确保包含所有日期（包括计数为0的日期）
    const result: { date: string; count: number }[] = [];
    for (let i = TREND_DAYS - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const dateStr = date.toISOString().split("T")[0];
      result.push({
        date: dateStr,
        count: countByDate.get(dateStr) || 0,
      });
    }

    return result;
  }

  /**
   * 获取待审核列表
   */
  async getPendingReview(page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const where = {
      status: {
        in: [
          ResearchFeedbackItemStatus.PENDING,
          ResearchFeedbackItemStatus.REVIEWING,
        ],
      },
    };

    const [items, total] = await Promise.all([
      this.prisma.researchFeedbackItem.findMany({
        where,
        skip,
        take: limit,
        orderBy: [
          { priority: "desc" },
          { status: "asc" }, // PENDING 优先于 REVIEWING
          { createdAt: "asc" }, // 先提交的优先
        ],
        include: {
          user: {
            select: {
              id: true,
              username: true,
              fullName: true,
              avatarUrl: true,
            },
          },
          topic: {
            select: { id: true, name: true },
          },
          report: {
            select: { id: true, version: true },
          },
        },
      }),
      this.prisma.researchFeedbackItem.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * 获取改进追踪
   */
  async getImprovementTracking() {
    const [applied, pending, avgEffect, recentImprovements] = await Promise.all(
      [
        this.prisma.researchFeedbackKnowledge.count({
          where: { appliedAt: { not: null } },
        }),
        this.prisma.researchFeedbackKnowledge.count({
          where: { appliedAt: null },
        }),
        this.prisma.researchFeedbackKnowledge.aggregate({
          _avg: { effectScore: true },
          where: { effectScore: { not: null } },
        }),
        this.prisma.researchFeedbackKnowledge.findMany({
          where: { appliedAt: { not: null } },
          orderBy: { appliedAt: "desc" },
          take: 10,
          select: {
            id: true,
            title: true,
            improvementType: true,
            appliedAt: true,
            effectScore: true,
            tags: true,
          },
        }),
      ],
    );

    return {
      applied,
      pending,
      avgEffectScore: avgEffect._avg.effectScore || 0,
      recentImprovements,
    };
  }

  /**
   * 获取高优先级反馈
   */
  async getHighPriorityItems(limit = 5) {
    return this.prisma.researchFeedbackItem.findMany({
      where: {
        priority: {
          in: [FeedbackPriority.CRITICAL, FeedbackPriority.HIGH],
        },
        status: {
          notIn: [
            ResearchFeedbackItemStatus.APPLIED,
            ResearchFeedbackItemStatus.CLOSED,
            ResearchFeedbackItemStatus.REJECTED,
          ],
        },
      },
      take: limit,
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      include: {
        user: {
          select: {
            id: true,
            username: true,
            fullName: true,
          },
        },
        topic: {
          select: { id: true, name: true },
        },
      },
    });
  }

  /**
   * 获取按专题的反馈统计
   */
  async getStatsByTopic(topicId: string) {
    const where = { topicId };

    const [total, byCategory, byStatus, resolved] = await Promise.all([
      this.prisma.researchFeedbackItem.count({ where }),
      this.prisma.researchFeedbackItem.groupBy({
        by: ["category"],
        where,
        _count: true,
      }),
      this.prisma.researchFeedbackItem.groupBy({
        by: ["status"],
        where,
        _count: true,
      }),
      this.prisma.researchFeedbackItem.count({
        where: {
          ...where,
          status: {
            in: [
              ResearchFeedbackItemStatus.APPLIED,
              ResearchFeedbackItemStatus.CLOSED,
            ],
          },
        },
      }),
    ]);

    return {
      total,
      resolved,
      resolutionRate: total > 0 ? (resolved / total) * 100 : 0,
      byCategory: Object.fromEntries(
        byCategory.map((b) => [b.category, b._count]),
      ),
      byStatus: Object.fromEntries(byStatus.map((b) => [b.status, b._count])),
    };
  }
}
