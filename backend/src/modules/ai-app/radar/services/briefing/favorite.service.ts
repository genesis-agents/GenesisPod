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
import {
  RadarDailyBriefingRepo,
  type DailySignal,
} from "./radar-daily-briefing.repo";

export interface FavoriteWithSignal {
  signalId: string;
  topicId: string;
  topicName: string;
  favoritedAt: string;
  /** signal 内容；找不到（briefing 已 90 天清理 / signal id 不匹配）则 null */
  signal: DailySignal | null;
  briefingDate: string | null;
}

@Injectable()
export class FavoriteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dailyRepo: RadarDailyBriefingRepo,
  ) {}

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

  /** 用户收藏列表（详情页跨日期访问用 — 仅 UserFavorite 原始行） */
  async listForUser(userId: string, limit = 50): Promise<UserFavorite[]> {
    return this.prisma.userFavorite.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  /**
   * FC-6: 收藏列表 + 联表取出每条收藏对应的 signal 内容
   *
   * 实现：从 UserFavorite 拿 (signalId, topicId)，按 topicId 拉最近 N 条
   *      RadarDailyBriefing，遍历 signals 数组查 signalId 命中。
   *      过期（briefing 已被 90 天清理）则 signal=null（前端展示"内容已过期"）
   */
  async listForUserWithSignals(
    userId: string,
    limit = 50,
  ): Promise<FavoriteWithSignal[]> {
    const favs = await this.prisma.userFavorite.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    if (favs.length === 0) return [];

    // 拿涉及的 topic 名（一次查询）
    const topicIds = Array.from(new Set(favs.map((f) => f.topicId)));
    const topics = await this.prisma.radarTopic.findMany({
      where: { id: { in: topicIds }, userId },
      select: { id: true, name: true },
    });
    const topicNameById = new Map(topics.map((t) => [t.id, t.name]));

    // 按 topic 拉最近 30 条 briefing（90 天窗口够用）；遍历找 signal
    const briefingsByTopic = new Map<
      string,
      Awaited<ReturnType<typeof this.dailyRepo.findRecentByTopic>>
    >();
    for (const tid of topicIds) {
      briefingsByTopic.set(tid, await this.dailyRepo.findRecentByTopic(tid, 30));
    }

    return favs.map((f) => {
      let foundSignal: DailySignal | null = null;
      let foundDate: Date | null = null;
      const briefings = briefingsByTopic.get(f.topicId) ?? [];
      for (const b of briefings) {
        const arr = (b.signals as unknown as DailySignal[]) ?? [];
        const hit = arr.find((s) => s.id === f.signalId);
        if (hit) {
          foundSignal = hit;
          foundDate = b.briefingDate;
          break;
        }
      }
      return {
        signalId: f.signalId,
        topicId: f.topicId,
        topicName: topicNameById.get(f.topicId) ?? "(已删除)",
        favoritedAt: f.createdAt.toISOString(),
        signal: foundSignal,
        briefingDate: foundDate ? foundDate.toISOString().slice(0, 10) : null,
      };
    });
  }
}
