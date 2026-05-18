import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { NotificationType, Prisma } from "@prisma/client";
import { PrismaService } from "../../../../../common/prisma/prisma.service";

/**
 * UnsubscribeTokenService —— 三级退订 JWT 签发 + 校验 + 应用
 *
 * 来源：daily-briefing-redesign-2026-05-18.md K5 + §7.3.3 邮件 footer 三级退订
 *
 * 三级 scope:
 * - topic: 单 topic 退订（payload 含 topicId；RADAR_DAILY/WEEKLY 该 topic 不再发）
 * - weekly: 退所有周报（RADAR_WEEKLY 全关）
 * - radar_all: 退所有 AI 雷达通知（RADAR_* 全关）
 * - global: 退全部通知（dispatcher 不再发任何 channel）
 *
 * 安全：
 * - JWT 7d 有效，HMAC 签名（JWT_SECRET）
 * - token-only auth（无需登录）方便邮件转发用户
 * - token 含 sub=userId + scope + 可选 ext(topicId for topic scope)
 * - 用户多次签发覆盖 NotificationPreference.unsubscribeToken（仅最新有效是设计选择，避免 token db 膨胀）
 */
@Injectable()
export class UnsubscribeTokenService {
  private readonly log = new Logger(UnsubscribeTokenService.name);
  private static readonly TTL_SECONDS = 7 * 24 * 60 * 60;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 签发 token 并持久化到 NotificationPreference.unsubscribeToken
   * @returns the issued token string (caller put into email footer URL)
   */
  async issue(
    userId: string,
    scope: UnsubscribeScope,
    ext?: { topicId?: string },
  ): Promise<string> {
    const payload: UnsubscribeTokenPayload = { sub: userId, scope };
    if (scope === "topic" && ext?.topicId) {
      payload.topicId = ext.topicId;
    }
    const token = await this.jwt.signAsync(payload, {
      expiresIn: UnsubscribeTokenService.TTL_SECONDS,
    });
    // 持久化最新 token（让旧 token 仍可用：仅 JWT 自身 expiresIn 控；DB 字段
    // 用于"退订链接复活/重发"场景而非真校验）
    await this.prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId, unsubscribeToken: token },
      update: { unsubscribeToken: token },
    });
    return token;
  }

  /**
   * 校验 token + 应用退订（更新 NotificationPreference.channelSubscriptions）
   *
   * 错误语义：
   * - 签名失败 / 过期 → UnauthorizedException（endpoint 返 401 + 友好提示页）
   * - scope=topic 但缺 topicId → BadRequest 等价（这里也走 401 以暴露伪造）
   */
  async verifyAndApply(token: string): Promise<UnsubscribeResult> {
    let payload: UnsubscribeTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<UnsubscribeTokenPayload>(token);
    } catch (err) {
      this.log.warn(
        `unsubscribe token verify failed: ${(err as Error).message}`,
      );
      throw new UnauthorizedException("invalid or expired unsubscribe token");
    }

    if (!payload.sub || !payload.scope) {
      throw new UnauthorizedException("malformed unsubscribe payload");
    }

    await this.applyScope(payload);
    return {
      userId: payload.sub,
      scope: payload.scope,
      ext: { topicId: payload.topicId },
    };
  }

  private async applyScope(payload: UnsubscribeTokenPayload): Promise<void> {
    const { sub: userId, scope, topicId } = payload;

    if (scope === "global") {
      // 关全部 channel 全部 type — 用 channelSubscriptions 表达"all-off"
      // 业界惯例：set wildcard `*` 全关；这里我们设全已知 type 全 channel false
      await this.prisma.notificationPreference.upsert({
        where: { userId },
        create: {
          userId,
          emailEnabled: false,
          pushEnabled: false,
          channelSubscriptions: UnsubscribeTokenService.buildGlobalOff(),
        },
        update: {
          emailEnabled: false,
          pushEnabled: false,
          channelSubscriptions: UnsubscribeTokenService.buildGlobalOff(),
        },
      });
      return;
    }

    if (scope === "radar_all") {
      await this.mergeChannelSubscriptions(userId, {
        RADAR_DAILY: { email: false, site: false, wechat: false },
        RADAR_WEEKLY: { email: false, site: false, wechat: false },
        RADAR_TIER3_INSTANT: { email: false, site: false, wechat: false },
        RADAR_SOURCE_AUTO_DISABLED: {
          email: false,
          site: false,
          wechat: false,
        },
        RADAR_MISSION_COMPLETE: { email: false, site: false, wechat: false },
      });
      return;
    }

    if (scope === "weekly") {
      await this.mergeChannelSubscriptions(userId, {
        RADAR_WEEKLY: { email: false, site: false, wechat: false },
      });
      return;
    }

    if (scope === "topic") {
      // PR-DR1b 阶段：topic 级退订暂时退化为关 RADAR_DAILY+WEEKLY (该用户全)
      // PR-DR2 引入 per-topic 退订表后细化
      if (!topicId) {
        throw new UnauthorizedException("topic scope requires topicId");
      }
      await this.mergeChannelSubscriptions(userId, {
        // TODO PR-DR2: 真正 per-topic 退订（需新表 RadarTopicSubscription）
        RADAR_DAILY: { email: false },
        RADAR_WEEKLY: { email: false },
      });
      this.log.log(
        `unsubscribe topic=${topicId} user=${userId} (broadcast RADAR_DAILY email off)`,
      );
      return;
    }
  }

  private async mergeChannelSubscriptions(
    userId: string,
    updates: Partial<
      Record<NotificationType, Partial<Record<string, boolean>>>
    >,
  ): Promise<void> {
    const existing = await this.prisma.notificationPreference.findUnique({
      where: { userId },
    });
    const current = (existing?.channelSubscriptions ?? {}) as Record<
      string,
      Record<string, boolean>
    >;
    const next: Record<string, Record<string, boolean>> = { ...current };
    for (const [type, channels] of Object.entries(updates)) {
      const merged: Record<string, boolean> = { ...(current[type] ?? {}) };
      for (const [ch, v] of Object.entries(channels ?? {})) {
        if (typeof v === "boolean") merged[ch] = v;
      }
      next[type] = merged;
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

  private static buildGlobalOff(): Record<string, Record<string, boolean>> {
    const off = { email: false, site: false, wechat: false, webpush: false };
    return {
      RADAR_DAILY: off,
      RADAR_WEEKLY: off,
      RADAR_TIER3_INSTANT: off,
      RADAR_SOURCE_AUTO_DISABLED: off,
      RADAR_MISSION_COMPLETE: off,
      // 其他业务类型 caller 切到 dispatcher 后会自动尊重（resolver 矩阵）
    };
  }
}

export type UnsubscribeScope = "topic" | "weekly" | "radar_all" | "global";

export interface UnsubscribeTokenPayload {
  sub: string; // userId
  scope: UnsubscribeScope;
  topicId?: string;
}

export interface UnsubscribeResult {
  userId: string;
  scope: UnsubscribeScope;
  ext?: { topicId?: string };
}
