import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import { RefreshFrequency, ResearchTopicStatus } from "@prisma/client";
import { TopicTeamOrchestratorService } from "../core/topic/topic-team-orchestrator.service";
// ★ P1-CTX-BYOK (2026-04-30): cron 触发的刷新链路必须显式注入 RequestContext.userId,
//   否则下游 AiChatService 走不到 BYOK key resolver — BYOK-only 用户全 fail。
import { withUserContext } from "../../../../../common/context";

/**
 * Topic Refresh Scheduler
 *
 * 负责管理专题的定时刷新：
 * 1. 每小时检查需要刷新的专题
 * 2. 根据刷新频率计算下次刷新时间
 * 3. 执行增量刷新
 */
@Injectable()
export class TopicRefreshScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TopicRefreshScheduler.name);
  private intervalHandle: NodeJS.Timeout | null = null;

  // 检查间隔：1小时
  private readonly CHECK_INTERVAL_MS = 60 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestrator: TopicTeamOrchestratorService,
  ) {}

  async onModuleInit() {
    this.logger.log("Topic Refresh Scheduler initialized");

    // 启动时更新所有专题的下次刷新时间
    // 使用 try-catch 优雅处理表不存在的情况（数据库迁移未完成）
    try {
      await this.updateNextRefreshTimes();
    } catch (error) {
      // P2021: 表不存在
      if (
        error instanceof Error &&
        "code" in error &&
        (error as { code: string }).code === "P2021"
      ) {
        this.logger.warn(
          "ResearchTopic table does not exist yet. Scheduler will retry on next interval.",
        );
      } else {
        this.logger.error("Failed to update next refresh times on init", error);
      }
    }

    // 设置定时检查
    this.intervalHandle = setInterval(() => {
      void this.checkAndRefreshTopics().catch((err) => {
        this.logger.error("Scheduled refresh check failed", err);
      });
    }, this.CHECK_INTERVAL_MS).unref();

    this.logger.log(
      `Scheduled refresh check every ${this.CHECK_INTERVAL_MS / 1000 / 60} minutes`,
    );
  }

  onModuleDestroy() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      this.logger.log("Topic Refresh Scheduler stopped");
    }
  }

  /**
   * 检查需要刷新的专题（每小时调用一次）
   */
  async checkAndRefreshTopics() {
    this.logger.debug("Checking for topics that need refresh...");

    try {
      // 查找需要刷新的专题
      // 如果表不存在会抛出 P2021 错误，在外层 catch 中处理
      const topicsToRefresh = await this.prisma.researchTopic.findMany({
        where: {
          status: ResearchTopicStatus.ACTIVE,
          refreshFrequency: { not: RefreshFrequency.MANUAL },
          nextRefreshAt: { lte: new Date() },
        },
        take: 5, // 每次最多处理5个专题，避免过载
        orderBy: { nextRefreshAt: "asc" },
      });

      if (topicsToRefresh.length === 0) {
        this.logger.debug("No topics need refresh");
        return;
      }

      this.logger.log(`Found ${topicsToRefresh.length} topics to refresh`);

      // 顺序处理每个专题
      for (const topic of topicsToRefresh) {
        try {
          await this.refreshTopic(topic.id);
        } catch (error) {
          this.logger.error(
            `Failed to refresh topic ${topic.id}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    } catch (error) {
      // P2021: 表不存在 - 优雅降级，等待数据库迁移
      if (
        error instanceof Error &&
        "code" in error &&
        (error as { code: string }).code === "P2021"
      ) {
        this.logger.debug(
          "ResearchTopic table does not exist yet. Skipping refresh check.",
        );
      } else {
        this.logger.error("Error in scheduled refresh check", error);
      }
    }
  }

  /**
   * 刷新单个专题
   */
  private async refreshTopic(topicId: string): Promise<void> {
    const topic = await this.prisma.researchTopic.findUnique({
      where: { id: topicId },
    });

    if (!topic) {
      this.logger.warn(`Topic ${topicId} not found for scheduled refresh`);
      return;
    }

    this.logger.log(
      `Starting scheduled refresh for topic: ${topic.name} (user=${topic.userId})`,
    );

    // ★ P1-CTX-BYOK (2026-04-30): wrap with userContext 让下游 AiChatService /
    //   BYOK key resolver 能拿到 topic.userId; 之前 BYOK-only 用户的定时刷新全 fail。
    try {
      await withUserContext(topic.userId, async () => {
        // 执行增量刷新
        await this.orchestrator.executeRefresh(topic, {
          incremental: true,
        });

        // 更新下次刷新时间
        const nextRefreshAt = this.calculateNextRefreshTime(
          topic.refreshFrequency,
        );
        await this.prisma.researchTopic.update({
          where: { id: topicId },
          data: { nextRefreshAt },
        });
      });
      this.logger.log(`Completed scheduled refresh for topic: ${topic.name}`);
    } catch (error) {
      this.logger.error(
        `Scheduled refresh failed for topic ${topic.name}`,
        error,
      );
      throw error;
    }
  }

  /**
   * 计算下次刷新时间
   */
  calculateNextRefreshTime(frequency: RefreshFrequency): Date {
    const now = new Date();

    switch (frequency) {
      case RefreshFrequency.DAILY:
        return new Date(now.getTime() + 24 * 60 * 60 * 1000);

      case RefreshFrequency.WEEKLY:
        return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      case RefreshFrequency.BIWEEKLY:
        return new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

      case RefreshFrequency.MONTHLY:
        const nextMonth = new Date(now);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        return nextMonth;

      case RefreshFrequency.MANUAL:
      default:
        return new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000); // 一年后
    }
  }

  /**
   * 更新所有专题的下次刷新时间
   */
  async updateNextRefreshTimes(): Promise<void> {
    const topics = await this.prisma.researchTopic.findMany({
      where: {
        status: ResearchTopicStatus.ACTIVE,
        refreshFrequency: { not: RefreshFrequency.MANUAL },
        nextRefreshAt: null,
      },
    });

    for (const topic of topics) {
      const nextRefreshAt = this.calculateNextRefreshTime(
        topic.refreshFrequency,
      );
      await this.prisma.researchTopic.update({
        where: { id: topic.id },
        data: { nextRefreshAt },
      });
    }

    if (topics.length > 0) {
      this.logger.log(`Updated next refresh times for ${topics.length} topics`);
    }
  }

  /**
   * 获取或创建专题的刷新计划
   */
  async getSchedule(topicId: string) {
    const topic = await this.prisma.researchTopic.findUnique({
      where: { id: topicId },
      select: {
        refreshFrequency: true,
        lastRefreshAt: true,
        nextRefreshAt: true,
      },
    });

    if (!topic) {
      return null;
    }

    // 检查是否有活跃的刷新计划
    const schedule = await this.prisma.topicSchedule.findFirst({
      where: { topicId, isActive: true },
    });

    return {
      frequency: topic.refreshFrequency,
      lastRefreshAt: topic.lastRefreshAt,
      nextRefreshAt: topic.nextRefreshAt,
      schedule,
    };
  }

  /**
   * 更新刷新计划
   */
  async updateSchedule(
    topicId: string,
    frequency: RefreshFrequency,
    options?: {
      dayOfWeek?: number;
      dayOfMonth?: number;
      hourOfDay?: number;
    },
  ) {
    // 更新专题的刷新频率
    const nextRefreshAt = this.calculateNextRefreshTime(frequency);

    await this.prisma.researchTopic.update({
      where: { id: topicId },
      data: {
        refreshFrequency: frequency,
        nextRefreshAt:
          frequency === RefreshFrequency.MANUAL ? null : nextRefreshAt,
      },
    });

    // 更新或创建计划记录
    const existingSchedule = await this.prisma.topicSchedule.findFirst({
      where: { topicId },
    });

    if (existingSchedule) {
      await this.prisma.topicSchedule.update({
        where: { id: existingSchedule.id },
        data: {
          frequency,
          dayOfWeek: options?.dayOfWeek,
          dayOfMonth: options?.dayOfMonth,
          hourOfDay: options?.hourOfDay ?? 9,
          isActive: frequency !== RefreshFrequency.MANUAL,
          nextRunAt:
            frequency === RefreshFrequency.MANUAL ? null : nextRefreshAt,
        },
      });
    } else {
      await this.prisma.topicSchedule.create({
        data: {
          topicId,
          frequency,
          dayOfWeek: options?.dayOfWeek,
          dayOfMonth: options?.dayOfMonth,
          hourOfDay: options?.hourOfDay ?? 9,
          isActive: frequency !== RefreshFrequency.MANUAL,
          nextRunAt:
            frequency === RefreshFrequency.MANUAL ? null : nextRefreshAt,
        },
      });
    }

    this.logger.log(`Updated schedule for topic ${topicId} to ${frequency}`);

    return this.getSchedule(topicId);
  }
}
