import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { NotificationType, Prisma } from "@prisma/client";
import {
  CreateNotificationDto,
  BatchCreateNotificationDto,
  UpdateNotificationPreferenceDto,
  NotificationTypeDto,
} from "./dto/notification.dto";

// 用于验证类型的映射
const VALID_NOTIFICATION_TYPES: Record<NotificationTypeDto, NotificationType> =
  {
    [NotificationTypeDto.SYSTEM]: "SYSTEM",
    [NotificationTypeDto.UPDATE]: "UPDATE",
    [NotificationTypeDto.TIP]: "TIP",
    [NotificationTypeDto.JOIN_REQUEST]: "JOIN_REQUEST",
    [NotificationTypeDto.JOIN_APPROVED]: "JOIN_APPROVED",
    [NotificationTypeDto.JOIN_REJECTED]: "JOIN_REJECTED",
    [NotificationTypeDto.INVITATION]: "INVITATION",
    [NotificationTypeDto.INVITATION_EXPIRED]: "INVITATION_EXPIRED",
    [NotificationTypeDto.RESEARCH_COMPLETED]: "RESEARCH_COMPLETED",
    [NotificationTypeDto.TASK_ASSIGNED]: "TASK_ASSIGNED",
    [NotificationTypeDto.MENTION]: "MENTION",
    [NotificationTypeDto.CREDITS_LOW]: "CREDITS_LOW",
    [NotificationTypeDto.CREDITS_RECEIVED]: "CREDITS_RECEIVED",
    [NotificationTypeDto.FEEDBACK_REPLIED]: "FEEDBACK_REPLIED",
    [NotificationTypeDto.FEEDBACK_STATUS_CHANGED]: "FEEDBACK_STATUS_CHANGED",
    [NotificationTypeDto.SESSION_EXPIRED]: "SESSION_EXPIRED",
  };

// 批量操作结果
interface BatchResult {
  count: number;
  succeeded: string[];
  failed: Array<{ userId: string; error: string }>;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  /**
   * 验证并转换通知类型
   */
  private validateNotificationType(
    type: NotificationTypeDto,
  ): NotificationType {
    const validType = VALID_NOTIFICATION_TYPES[type];
    if (!validType) {
      throw new BadRequestException(`Invalid notification type: ${type}`);
    }
    return validType;
  }

  /**
   * 创建单个通知
   */
  async createNotification(
    dto: CreateNotificationDto,
  ): Promise<{ id: string }> {
    this.logger.log(
      `Creating notification for user ${dto.userId}: ${dto.type}`,
    );

    const notificationType = this.validateNotificationType(dto.type);

    const notification = await this.prisma.notification.create({
      data: {
        userId: dto.userId,
        type: notificationType,
        title: dto.title,
        message: dto.message,
        iconUrl: dto.iconUrl,
        actionUrl: dto.actionUrl,
        actionLabel: dto.actionLabel,
        relatedType: dto.relatedType,
        relatedId: dto.relatedId,
        metadata: (dto.metadata || {}) as Prisma.InputJsonValue,
      },
      select: { id: true },
    });

    this.logger.log(`Notification created: ${notification.id}`);

    // 发出通知事件（用于WebSocket推送）
    this.eventEmitter.emit("notification.created", {
      notificationId: notification.id,
      userId: dto.userId,
      type: dto.type,
      title: dto.title,
      message: dto.message,
    });

    return { id: notification.id };
  }

  /**
   * 批量创建通知（发送给多个用户）
   * 使用 createMany 优化性能，避免 N+1 问题
   */
  async batchCreateNotifications(
    dto: BatchCreateNotificationDto,
  ): Promise<BatchResult> {
    this.logger.log(
      `Creating batch notifications for ${dto.userIds.length} users`,
    );

    const notificationType = this.validateNotificationType(dto.type);
    const succeeded: string[] = [];
    const failed: Array<{ userId: string; error: string }> = [];

    try {
      // 使用 createMany 批量插入，大幅提升性能
      const metadataJson = (dto.metadata || {}) as Prisma.InputJsonValue;
      const result = await this.prisma.notification.createMany({
        data: dto.userIds.map((userId) => ({
          userId,
          type: notificationType,
          title: dto.title,
          message: dto.message,
          actionUrl: dto.actionUrl,
          actionLabel: dto.actionLabel,
          metadata: metadataJson,
        })),
        skipDuplicates: true,
      });

      // 所有成功
      succeeded.push(...dto.userIds);

      // 批量发送事件
      dto.userIds.forEach((userId) => {
        this.eventEmitter.emit("notification.created", {
          userId,
          type: dto.type,
          title: dto.title,
          message: dto.message,
        });
      });

      this.logger.log(
        `Batch notifications created: ${result.count}/${dto.userIds.length}`,
      );
      return { count: result.count, succeeded, failed };
    } catch (error) {
      // 如果批量插入失败，降级为逐个插入以确保部分成功
      this.logger.warn(
        "Batch insert failed, falling back to individual inserts",
      );

      const fallbackMetadata = (dto.metadata || {}) as Prisma.InputJsonValue;
      for (const userId of dto.userIds) {
        try {
          await this.prisma.notification.create({
            data: {
              userId,
              type: notificationType,
              title: dto.title,
              message: dto.message,
              actionUrl: dto.actionUrl,
              actionLabel: dto.actionLabel,
              metadata: fallbackMetadata,
            },
          });
          succeeded.push(userId);

          this.eventEmitter.emit("notification.created", {
            userId,
            type: dto.type,
            title: dto.title,
            message: dto.message,
          });
        } catch (err) {
          const errorMessage =
            err instanceof Error ? err.message : "Unknown error";
          this.logger.error(
            `Failed to create notification for user ${userId}`,
            err,
          );
          failed.push({ userId, error: errorMessage });
        }
      }

      this.logger.log(
        `Batch notifications created: ${succeeded.length}/${dto.userIds.length}`,
      );
      return { count: succeeded.length, succeeded, failed };
    }
  }

  /**
   * 获取用户通知列表
   * 使用 Prisma ORM 避免 SQL 注入
   */
  async getNotifications(
    userId: string,
    options?: {
      page?: number;
      limit?: number;
      type?: NotificationTypeDto;
      read?: boolean;
    },
  ) {
    const { page = 1, limit = 20, type, read } = options || {};
    const skip = (page - 1) * limit;

    // 构建类型安全的查询条件
    const where: Prisma.NotificationWhereInput = {
      userId,
    };

    if (type) {
      where.type = this.validateNotificationType(type);
    }

    if (read !== undefined) {
      where.read = read;
    }

    // 并行查询通知列表和总数
    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return {
      notifications: notifications.map((n) => ({
        id: n.id,
        userId: n.userId,
        type: n.type,
        title: n.title,
        message: n.message,
        iconUrl: n.iconUrl,
        actionUrl: n.actionUrl,
        actionLabel: n.actionLabel,
        relatedType: n.relatedType,
        relatedId: n.relatedId,
        read: n.read,
        readAt: n.readAt,
        metadata: n.metadata,
        expiresAt: n.expiresAt,
        createdAt: n.createdAt,
      })),
      total,
      page,
      limit,
    };
  }

  /**
   * 获取未读通知数量
   */
  async getUnreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: {
        userId,
        read: false,
      },
    });
  }

  /**
   * 标记单个通知为已读
   */
  async markAsRead(notificationId: string, userId: string): Promise<boolean> {
    try {
      await this.prisma.notification.updateMany({
        where: {
          id: notificationId,
          userId, // 确保只能修改自己的通知
        },
        data: {
          read: true,
          readAt: new Date(),
        },
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 标记所有通知为已读
   */
  async markAllAsRead(userId: string): Promise<number> {
    const result = await this.prisma.notification.updateMany({
      where: {
        userId,
        read: false,
      },
      data: {
        read: true,
        readAt: new Date(),
      },
    });
    return result.count;
  }

  /**
   * 删除单个通知
   */
  async deleteNotification(
    notificationId: string,
    userId: string,
  ): Promise<boolean> {
    try {
      await this.prisma.notification.deleteMany({
        where: {
          id: notificationId,
          userId, // 确保只能删除自己的通知
        },
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 清理过期通知
   */
  async cleanupExpiredNotifications(): Promise<number> {
    const result = await this.prisma.notification.deleteMany({
      where: {
        expiresAt: {
          not: null,
          lt: new Date(),
        },
      },
    });

    if (result.count > 0) {
      this.logger.log(`Cleaned up ${result.count} expired notifications`);
    }
    return result.count;
  }

  // ========== 通知偏好设置 ==========

  /**
   * 获取用户通知偏好
   */
  async getPreferences(userId: string) {
    const preference = await this.prisma.notificationPreference.findUnique({
      where: { userId },
    });

    if (!preference) {
      // 返回默认偏好
      return {
        emailEnabled: true,
        pushEnabled: true,
        soundEnabled: true,
        typeSettings: {},
        quietHoursStart: null,
        quietHoursEnd: null,
      };
    }

    return {
      emailEnabled: preference.emailEnabled,
      pushEnabled: preference.pushEnabled,
      soundEnabled: preference.soundEnabled,
      typeSettings: preference.typeSettings as Record<string, boolean>,
      quietHoursStart: preference.quietHoursStart,
      quietHoursEnd: preference.quietHoursEnd,
    };
  }

  /**
   * 更新用户通知偏好
   * 使用 upsert 避免竞态条件
   */
  async updatePreferences(
    userId: string,
    dto: UpdateNotificationPreferenceDto,
  ) {
    // 构建更新数据
    const updateData: Prisma.NotificationPreferenceUpdateInput = {};
    const createData: Prisma.NotificationPreferenceCreateInput = {
      user: { connect: { id: userId } },
      emailEnabled: dto.emailEnabled ?? true,
      pushEnabled: dto.pushEnabled ?? true,
      soundEnabled: dto.soundEnabled ?? true,
      typeSettings: dto.typeSettings || {},
      quietHoursStart: dto.quietHoursStart || null,
      quietHoursEnd: dto.quietHoursEnd || null,
    };

    if (dto.emailEnabled !== undefined)
      updateData.emailEnabled = dto.emailEnabled;
    if (dto.pushEnabled !== undefined) updateData.pushEnabled = dto.pushEnabled;
    if (dto.soundEnabled !== undefined)
      updateData.soundEnabled = dto.soundEnabled;
    if (dto.typeSettings !== undefined)
      updateData.typeSettings = dto.typeSettings;
    if (dto.quietHoursStart !== undefined)
      updateData.quietHoursStart = dto.quietHoursStart;
    if (dto.quietHoursEnd !== undefined)
      updateData.quietHoursEnd = dto.quietHoursEnd;

    await this.prisma.notificationPreference.upsert({
      where: { userId },
      create: createData,
      update: updateData,
    });

    return this.getPreferences(userId);
  }

  // ========== 便捷方法：发送特定类型通知 ==========

  /**
   * 发送加入申请通知给团队管理员
   */
  async notifyJoinRequest(params: {
    topicId: string;
    topicName: string;
    applicantId: string;
    applicantName: string;
    adminUserIds: string[];
  }) {
    const { topicId, topicName, applicantId, applicantName, adminUserIds } =
      params;

    await this.batchCreateNotifications({
      userIds: adminUserIds,
      type: NotificationTypeDto.JOIN_REQUEST,
      title: "新的加入申请",
      message: `${applicantName} 申请加入「${topicName}」`,
      actionUrl: `/topics/${topicId}/settings/members`,
      actionLabel: "查看申请",
      metadata: { topicId, applicantId, applicantName },
    });
  }

  /**
   * 发送申请结果通知给申请者
   */
  async notifyJoinRequestResult(params: {
    userId: string;
    topicId: string;
    topicName: string;
    approved: boolean;
    reason?: string;
  }) {
    const { userId, topicId, topicName, approved, reason } = params;

    await this.createNotification({
      userId,
      type: approved
        ? NotificationTypeDto.JOIN_APPROVED
        : NotificationTypeDto.JOIN_REJECTED,
      title: approved ? "申请已通过" : "申请未通过",
      message: approved
        ? `你加入「${topicName}」的申请已通过`
        : `你加入「${topicName}」的申请未通过${reason ? `：${reason}` : ""}`,
      actionUrl: approved ? `/topics/${topicId}` : undefined,
      actionLabel: approved ? "进入团队" : undefined,
      relatedType: "topic",
      relatedId: topicId,
      metadata: { topicId, approved, reason },
    });
  }

  /**
   * 发送邀请通知
   */
  async notifyInvitation(params: {
    userId: string;
    topicId: string;
    topicName: string;
    inviterName: string;
    inviteCode?: string;
  }) {
    const { userId, topicId, topicName, inviterName, inviteCode } = params;

    await this.createNotification({
      userId,
      type: NotificationTypeDto.INVITATION,
      title: "邀请加入团队",
      message: `${inviterName} 邀请你加入「${topicName}」`,
      actionUrl: inviteCode
        ? `/invitations/${inviteCode}`
        : `/topics/${topicId}`,
      actionLabel: "查看邀请",
      relatedType: "topic",
      relatedId: topicId,
      metadata: { topicId, inviterName, inviteCode },
    });
  }

  /**
   * 发送研究完成通知
   */
  async notifyResearchCompleted(params: {
    userId: string;
    researchId: string;
    researchTitle: string;
  }) {
    const { userId, researchId, researchTitle } = params;

    await this.createNotification({
      userId,
      type: NotificationTypeDto.RESEARCH_COMPLETED,
      title: "研究任务完成",
      message: `研究「${researchTitle}」已完成`,
      actionUrl: `/research/${researchId}`,
      actionLabel: "查看报告",
      relatedType: "research",
      relatedId: researchId,
    });
  }

  /**
   * 发送积分不足警告
   */
  async notifyCreditsLow(params: {
    userId: string;
    balance: number;
    threshold: number;
  }) {
    const { userId, balance, threshold } = params;

    await this.createNotification({
      userId,
      type: NotificationTypeDto.CREDITS_LOW,
      title: "积分余额不足",
      message: `你的积分余额仅剩 ${balance}，低于 ${threshold}`,
      actionUrl: "/credits",
      actionLabel: "查看积分",
      metadata: { balance, threshold },
    });
  }
}
