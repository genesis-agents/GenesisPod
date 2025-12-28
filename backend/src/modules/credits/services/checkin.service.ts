import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { CreditTransactionType } from "@prisma/client";
import { AlreadyCheckedInException } from "../exceptions/insufficient-credits.exception";

/**
 * 签到奖励配置
 */
const CHECKIN_REWARDS = {
  base: 50, // 基础奖励
  streak7: 100, // 7天连续签到奖励
  streak30: 300, // 30天连续签到奖励
  maxStreak: 100, // 最大连续天数（超过后不再增加奖励）
};

/**
 * 防刷配置
 */
const ANTI_ABUSE_CONFIG = {
  maxAccountsPerIp: 3, // 同一IP每日最多签到账户数
  newAccountWaitHours: 24, // 新账户注册后等待时间
};

/**
 * 签到结果
 */
export interface CheckinResult {
  success: boolean;
  creditsEarned: number;
  streakDays: number;
  message: string;
  isStreakBonus: boolean;
  bonusType?: "streak7" | "streak30";
}

/**
 * 签到状态
 */
export interface CheckinStatus {
  canCheckin: boolean;
  hasCheckedInToday: boolean;
  streakDays: number;
  lastCheckinDate: Date | null;
  nextReward: number;
  message?: string;
}

/**
 * 签到服务
 */
@Injectable()
export class CheckinService {
  private readonly logger = new Logger(CheckinService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * 获取签到状态
   */
  async getCheckinStatus(userId: string): Promise<CheckinStatus> {
    const account = await this.prisma.creditAccount.findUnique({
      where: { userId },
      include: {
        checkins: {
          orderBy: { checkinDate: "desc" },
          take: 1,
        },
      },
    });

    if (!account) {
      return {
        canCheckin: false,
        hasCheckedInToday: false,
        streakDays: 0,
        lastCheckinDate: null,
        nextReward: CHECKIN_REWARDS.base,
        message: "Account not found",
      };
    }

    const today = this.getTodayDate();
    const lastCheckin = account.checkins[0];

    if (!lastCheckin) {
      return {
        canCheckin: true,
        hasCheckedInToday: false,
        streakDays: 0,
        lastCheckinDate: null,
        nextReward: CHECKIN_REWARDS.base,
      };
    }

    const lastCheckinDate = new Date(lastCheckin.checkinDate);
    const isToday = this.isSameDay(lastCheckinDate, today);

    if (isToday) {
      return {
        canCheckin: false,
        hasCheckedInToday: true,
        streakDays: lastCheckin.streakDays,
        lastCheckinDate: lastCheckinDate,
        nextReward: this.calculateNextReward(lastCheckin.streakDays),
      };
    }

    // 检查是否连续
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = this.isSameDay(lastCheckinDate, yesterday);

    const currentStreak = isYesterday ? lastCheckin.streakDays : 0;

    return {
      canCheckin: true,
      hasCheckedInToday: false,
      streakDays: currentStreak,
      lastCheckinDate: lastCheckinDate,
      nextReward: this.calculateNextReward(currentStreak),
    };
  }

  /**
   * 执行签到
   */
  async performCheckin(
    userId: string,
    ipAddress?: string,
  ): Promise<CheckinResult> {
    // 检查签到状态
    const status = await this.getCheckinStatus(userId);

    if (!status.canCheckin) {
      throw new AlreadyCheckedInException();
    }

    // 检查 IP 防刷
    if (ipAddress) {
      const isIpBlocked = await this.checkIpLimit(ipAddress);
      if (isIpBlocked) {
        return {
          success: false,
          creditsEarned: 0,
          streakDays: status.streakDays,
          message: "Too many check-ins from this IP today",
          isStreakBonus: false,
        };
      }
    }

    // 检查新账户限制
    const account = await this.prisma.creditAccount.findUnique({
      where: { userId },
    });

    if (account) {
      const hoursSinceCreation =
        (Date.now() - account.createdAt.getTime()) / (1000 * 60 * 60);
      if (hoursSinceCreation < ANTI_ABUSE_CONFIG.newAccountWaitHours) {
        const hoursLeft = Math.ceil(
          ANTI_ABUSE_CONFIG.newAccountWaitHours - hoursSinceCreation,
        );
        return {
          success: false,
          creditsEarned: 0,
          streakDays: 0,
          message: `New accounts must wait ${hoursLeft} hours before first check-in`,
          isStreakBonus: false,
        };
      }
    }

    // 计算新的连续天数
    const newStreakDays = status.streakDays + 1;

    // 计算奖励
    const { credits, isStreakBonus, bonusType } =
      this.calculateCheckinReward(newStreakDays);

    const today = this.getTodayDate();

    // 使用事务执行签到
    await this.prisma.$transaction(async (tx) => {
      // 获取账户并锁定
      const currentAccount = await tx.creditAccount.findUnique({
        where: { userId },
      });

      if (!currentAccount) {
        throw new Error("Account not found");
      }

      // 创建签到记录
      const checkin = await tx.dailyCheckin.create({
        data: {
          accountId: currentAccount.id,
          checkinDate: today,
          creditsEarned: credits,
          streakDays: newStreakDays,
          ipAddress,
        },
      });

      // 更新账户余额
      const newBalance = currentAccount.balance + credits;
      await tx.creditAccount.update({
        where: { id: currentAccount.id },
        data: {
          balance: newBalance,
          totalEarned: currentAccount.totalEarned + credits,
        },
      });

      // 创建交易记录
      await tx.creditTransaction.create({
        data: {
          accountId: currentAccount.id,
          type: CreditTransactionType.DAILY_CHECKIN,
          amount: credits,
          balanceAfter: newBalance,
          description: isStreakBonus
            ? `Daily check-in (${newStreakDays} days streak bonus)`
            : `Daily check-in (Day ${newStreakDays})`,
        },
      });

      return { checkin, newBalance };
    });

    this.logger.log(
      `User ${userId} checked in, day ${newStreakDays}, earned ${credits} credits`,
    );

    return {
      success: true,
      creditsEarned: credits,
      streakDays: newStreakDays,
      message: isStreakBonus
        ? `Congratulations! You've checked in for ${newStreakDays} consecutive days!`
        : `Check-in successful! Day ${newStreakDays}`,
      isStreakBonus,
      bonusType,
    };
  }

  /**
   * 计算签到奖励
   */
  private calculateCheckinReward(streakDays: number): {
    credits: number;
    isStreakBonus: boolean;
    bonusType?: "streak7" | "streak30";
  } {
    // 30天连续签到奖励
    if (streakDays % 30 === 0) {
      return {
        credits: CHECKIN_REWARDS.streak30,
        isStreakBonus: true,
        bonusType: "streak30",
      };
    }

    // 7天连续签到奖励
    if (streakDays % 7 === 0) {
      return {
        credits: CHECKIN_REWARDS.streak7,
        isStreakBonus: true,
        bonusType: "streak7",
      };
    }

    // 基础奖励
    return {
      credits: CHECKIN_REWARDS.base,
      isStreakBonus: false,
    };
  }

  /**
   * 计算下一次签到奖励
   */
  private calculateNextReward(currentStreak: number): number {
    const nextStreak = currentStreak + 1;

    if (nextStreak % 30 === 0) {
      return CHECKIN_REWARDS.streak30;
    }
    if (nextStreak % 7 === 0) {
      return CHECKIN_REWARDS.streak7;
    }
    return CHECKIN_REWARDS.base;
  }

  /**
   * 检查 IP 限制
   */
  private async checkIpLimit(ipAddress: string): Promise<boolean> {
    const today = this.getTodayDate();

    const count = await this.prisma.dailyCheckin.count({
      where: {
        ipAddress,
        checkinDate: today,
      },
    });

    return count >= ANTI_ABUSE_CONFIG.maxAccountsPerIp;
  }

  /**
   * 获取今日日期（UTC 零点）
   */
  private getTodayDate(): Date {
    const now = new Date();
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
  }

  /**
   * 判断两个日期是否是同一天
   */
  private isSameDay(date1: Date, date2: Date): boolean {
    return (
      date1.getUTCFullYear() === date2.getUTCFullYear() &&
      date1.getUTCMonth() === date2.getUTCMonth() &&
      date1.getUTCDate() === date2.getUTCDate()
    );
  }

  /**
   * 获取签到历史
   */
  async getCheckinHistory(
    userId: string,
    limit: number = 30,
  ): Promise<
    Array<{
      date: Date;
      credits: number;
      streakDays: number;
    }>
  > {
    const account = await this.prisma.creditAccount.findUnique({
      where: { userId },
    });

    if (!account) {
      return [];
    }

    const checkins = await this.prisma.dailyCheckin.findMany({
      where: { accountId: account.id },
      orderBy: { checkinDate: "desc" },
      take: limit,
    });

    return checkins.map((c) => ({
      date: c.checkinDate,
      credits: c.creditsEarned,
      streakDays: c.streakDays,
    }));
  }
}
