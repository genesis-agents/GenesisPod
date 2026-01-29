import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../../common/prisma/prisma.service";

@Injectable()
export class NotificationsAdminService {
  private readonly logger = new Logger(NotificationsAdminService.name);

  constructor(private prisma: PrismaService) {}

  async getNotificationStats() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [totalCount, todayCount, unreadCount, byTypeRaw] = await Promise.all([
      this.prisma.notification.count(),
      this.prisma.notification.count({
        where: { createdAt: { gte: todayStart } },
      }),
      this.prisma.notification.count({ where: { read: false } }),
      this.prisma.notification.groupBy({
        by: ["type"],
        _count: true,
      }),
    ]);

    const unreadRate =
      totalCount > 0 ? Math.round((unreadCount / totalCount) * 100) : 0;
    const byType: Record<string, number> = {};
    for (const row of byTypeRaw) {
      byType[row.type] = row._count;
    }

    return {
      totalCount,
      todayCount,
      unreadRate,
      typeCount: byTypeRaw.length,
      byType,
    };
  }

  async getRecentNotifications(page: number, limit: number) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));

    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: { email: true, username: true },
          },
        },
      }),
      this.prisma.notification.count(),
    ]);

    return {
      items: items.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        userId: n.userId,
        userEmail: n.user.email,
        userName: n.user.username,
        read: n.read,
        createdAt: n.createdAt,
      })),
      total,
      page: safePage,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  async broadcastNotification(title: string, message: string) {
    const trimmedTitle = title.trim().slice(0, 200);
    const trimmedMessage = message.trim().slice(0, 2000);

    // Use raw SQL INSERT...SELECT to avoid loading all users into memory
    const sent: number = await this.prisma.$executeRaw`
      INSERT INTO notifications (id, user_id, type, title, message, read, created_at)
      SELECT
        gen_random_uuid(),
        id,
        'SYSTEM'::"NotificationType",
        ${trimmedTitle},
        ${trimmedMessage},
        false,
        NOW()
      FROM users
      WHERE is_active = true
    `;

    this.logger.log(
      `Broadcast notification to ${sent} users: "${trimmedTitle}"`,
    );
    return { sent };
  }
}
