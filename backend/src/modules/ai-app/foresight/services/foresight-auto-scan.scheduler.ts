import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { NotificationService } from "../../../platform/notifications/notification.service";
import { NotificationTypeDto } from "../../../platform/notifications/notification.types";
import { ForesightIntakeService } from "./foresight-intake.service";

/**
 * ForesightAutoScanScheduler —— 前瞻信号的每日自动扫描（2026-06-12）。
 *
 * 背景：P2 雷达扫描首发为手动按钮；但扫描是纯机械动作（LLM 初筛 + 人工终审
 * 的"初筛"半边），没有理由让 Owner 每天点按钮。本调度器把入站自动化：
 * 信号自己到收件箱，人只做判断（查验依据 → 注入 → 复核）。
 *
 * 节奏与成本：
 *   - 每日 00:00 UTC（北京 08:00，工作日开始前信号就绪）
 *   - 只扫最近 3 天雷达信号（每日重叠窗，scanRadar 同名去重兜底）
 *   - 每主题 1 次 LLM 调用（deterministic），每轮上限 50 主题
 *   - 单主题失败不阻塞其余（无 falsifier 卡的主题静默跳过）
 *   - 新命中 > 0 时发站内通知（actionUrl 直达 /foresight）
 *
 * ENABLE_FORESIGHT_AUTO_SCAN !== "true" 时禁用（与 radar / retention 同款
 * 开关模式，生产显式开启）。
 */
@Injectable()
export class ForesightAutoScanScheduler {
  private readonly logger = new Logger(ForesightAutoScanScheduler.name);
  static readonly MAX_TOPICS_PER_SWEEP = 50;
  static readonly SCAN_WINDOW_DAYS = 3;

  constructor(
    private readonly prisma: PrismaService,
    private readonly intake: ForesightIntakeService,
    private readonly notifications: NotificationService,
  ) {}

  @Cron("0 0 * * *", {
    name: "foresight-auto-scan",
    timeZone: "UTC",
    disabled: process.env.ENABLE_FORESIGHT_AUTO_SCAN !== "true",
  })
  async sweep(): Promise<void> {
    const topics = await this.prisma.foresightTopic.findMany({
      select: { id: true, userId: true, name: true },
      orderBy: { createdAt: "asc" },
      take: ForesightAutoScanScheduler.MAX_TOPICS_PER_SWEEP,
    });
    if (topics.length === 0) return;
    this.logger.log(`[auto-scan] sweep start: ${topics.length} topics`);

    let totalCreated = 0;
    for (const topic of topics) {
      try {
        const res = await this.intake.scanRadar(
          topic.userId,
          topic.id,
          ForesightAutoScanScheduler.SCAN_WINDOW_DAYS,
        );
        totalCreated += res.created;
        if (res.created > 0) {
          this.logger.log(
            `[auto-scan] topic="${topic.name}" created=${res.created} (scanned=${res.scanned})`,
          );
          await this.notifications
            .createNotification({
              userId: topic.userId,
              type: NotificationTypeDto.SYSTEM,
              title: `前瞻信号：「${topic.name}」新增 ${res.created} 条候选`,
              message:
                "雷达信号命中了该主题的预登记证伪条件，已进入信号收件箱 —— 请查验依据档案后决定是否注入传播。",
              actionUrl: "/foresight",
              actionLabel: "去查验",
            })
            .catch((err: unknown) => {
              this.logger.warn(
                `[auto-scan] notify failed topic=${topic.id}: ${err instanceof Error ? err.message : String(err)}`,
              );
            });
        }
      } catch (err) {
        /* 无 falsifier 卡（BadRequest）/ 雷达无源 / LLM 异常 —— 单主题跳过 */
        this.logger.debug(
          `[auto-scan] topic="${topic.name}" skipped: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    this.logger.log(
      `[auto-scan] sweep done: topics=${topics.length} newSignals=${totalCreated}`,
    );
  }
}
