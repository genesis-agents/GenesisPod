/**
 * Favorite service（B16 — Phase 1 简单 boolean 收藏）
 *
 * 来源：daily-briefing-redesign-2026-05-18.md §4.2 §15 B3 决策
 *
 * 设计：
 * - 用 UserFavorite 表存（userId, signalId）唯一对（去重）
 * - signalId 是 DailySignal.id（briefing.signals[].id UUID，JSONB 内嵌，无强 FK）
 * - 反查 topicId 用于详情页跨日期访问"我收藏的信号"
 * - 不存 signal 内容副本（briefing 90 天保留窗口内 join 取，过期收藏 → 失效但不破坏）
 */
import { Injectable } from "@nestjs/common";
import { UserFavorite } from "@prisma/client";
import { PrismaService } from "@/common/prisma/prisma.service";

@Injectable()
export class FavoriteService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Toggle 收藏：已收藏 → 取消；否则创建
   *
   * @returns 收藏后状态（true=favorited）
   */
  async toggle(input: {
    userId: string;
    signalId: string;
    topicId: string;
  }): Promise<{ favorited: boolean }> {
    const existing = await this.prisma.userFavorite.findUnique({
      where: {
        userId_signalId: { userId: input.userId, signalId: input.signalId },
      },
    });
    if (existing) {
      await this.prisma.userFavorite.delete({ where: { id: existing.id } });
      return { favorited: false };
    }
    await this.prisma.userFavorite.create({
      data: {
        userId: input.userId,
        signalId: input.signalId,
        topicId: input.topicId,
      },
    });
    return { favorited: true };
  }

  async isFavorited(userId: string, signalId: string): Promise<boolean> {
    const row = await this.prisma.userFavorite.findUnique({
      where: { userId_signalId: { userId, signalId } },
      select: { id: true },
    });
    return row !== null;
  }

  /** 用户收藏列表（详情页跨日期访问用） */
  async listForUser(userId: string, limit = 50): Promise<UserFavorite[]> {
    return this.prisma.userFavorite.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }
}
