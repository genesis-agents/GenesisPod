import { Injectable, Logger } from "@nestjs/common";
import {
  NotificationPreference,
  NotificationType,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../../../../../common/prisma/prisma.service";
import { NotificationChannel } from "../abstractions/notification-channel";

/**
 * NotificationPreferenceService
 *
 * 职责：dispatcher 读 / 写用户通知偏好（channelSubscriptions 矩阵 + 全局 quietHours）
 *
 * 来源：daily-briefing-redesign-2026-05-18.md §8.6
 *
 * 与既有 NotificationService 的偏好读写区别：
 * - 既有 NotificationService.getPreferences/updatePreferences 走 REST，面向 UI
 * - 本 service 面向 dispatcher 内部（无 HTTP exception 包装，纯 DB 操作）
 */
@Injectable()
export class NotificationPreferenceService {
  private readonly log = new Logger(NotificationPreferenceService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 查用户偏好；不存在时返回 null（dispatcher 走默认策略）
   * 错误一律 swallow + log，避免通知层因偏好查询失败而 swallow 用户事件
   */
  async get(userId: string): Promise<NotificationPreference | null> {
    try {
      return await this.prisma.notificationPreference.findUnique({
        where: { userId },
      });
    } catch (err) {
      this.log.warn(
        `Preference lookup failed for ${userId}: ${(err as Error).message}`,
      );
      return null;
    }
  }

  /**
   * 读单 type × channel 订阅开关
   *
   * 用户 channelSubscriptions[type][channel] 显式 boolean
   *   true → 走
   *   false → 不走
   * 未设置 → null（由 ChannelResolver 用 defaultForType 兜底）
   */
  async getChannelSubscription(
    userId: string,
    type: NotificationType,
    channel: NotificationChannel,
  ): Promise<boolean | null> {
    const pref = await this.get(userId);
    if (!pref) return null;
    const subs = (pref.channelSubscriptions ?? {}) as Record<
      string,
      Partial<Record<NotificationChannel, boolean>>
    >;
    const typeSubs = subs[type];
    if (!typeSubs || typeof typeSubs !== "object") return null;
    const value = typeSubs[channel];
    return typeof value === "boolean" ? value : null;
  }

  /**
   * 更新 channelSubscriptions（merge 模式：只覆盖传入的 type → channel，其他保留）
   */
  async updateChannelSubscriptions(
    userId: string,
    updates: Partial<
      Record<NotificationType, Partial<Record<NotificationChannel, boolean>>>
    >,
  ): Promise<void> {
    const existing = await this.get(userId);
    const current = (existing?.channelSubscriptions ?? {}) as Record<
      string,
      Partial<Record<NotificationChannel, boolean>>
    >;
    const next: Record<
      string,
      Partial<Record<NotificationChannel, boolean>>
    > = {
      ...current,
    };
    for (const [type, channels] of Object.entries(updates)) {
      next[type] = { ...(current[type] ?? {}), ...(channels ?? {}) };
    }

    await this.prisma.notificationPreference.upsert({
      where: { userId },
      create: {
        userId,
        channelSubscriptions: next as Prisma.InputJsonValue,
      },
      update: {
        channelSubscriptions: next as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * 是否在 quietHours 静默窗口内
   *
   * 与既有 NotificationService.isWithinQuietHours 同语义但独立读 — 避免循环依赖
   * （NotificationService 已 import 此 service 时反向调用会循环）
   */
  async isInQuietHours(userId: string): Promise<boolean> {
    const pref = await this.get(userId);
    if (!pref?.quietHoursStart || !pref?.quietHoursEnd) return false;
    return NotificationPreferenceService.timeInWindow(
      new Date(),
      pref.quietHoursStart,
      pref.quietHoursEnd,
    );
  }

  /**
   * HH:mm 时间窗口包含判断（支持跨午夜，如 22:00..06:00）。
   * 静态便于单测。
   */
  static timeInWindow(now: Date, startStr: string, endStr: string): boolean {
    const startMin = NotificationPreferenceService.parseHHMMToMinutes(startStr);
    const endMin = NotificationPreferenceService.parseHHMMToMinutes(endStr);
    if (startMin === null || endMin === null) return false;
    const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
    if (startMin === endMin) return false;
    if (startMin < endMin) {
      return nowMin >= startMin && nowMin < endMin;
    }
    // 跨午夜
    return nowMin >= startMin || nowMin < endMin;
  }

  private static parseHHMMToMinutes(s: string): number | null {
    const m = s.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h < 0 || h > 23 || min < 0 || min > 59) return null;
    return h * 60 + min;
  }
}
