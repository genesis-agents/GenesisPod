import { Injectable, Logger } from "@nestjs/common";
import type {
  IBroadcastAdapter,
  DomainEvent,
} from "@/modules/ai-harness/facade";
import { NotificationPresetsService } from "@/modules/ai-infra/facade";
import { PrismaService } from "@/common/prisma/prisma.service";

/**
 * NotificationBroadcastAdapter
 *
 * 把 DomainEventBus 上的"业务任务完成"事件桥接成持久化通知。
 *
 * 职责：
 *   - 监听 `agent-playground.mission:completed` 等业务终态事件
 *   - 从 event.scope.userId 取出归属用户
 *   - 调用 NotificationPresetsService 写库
 *   - 写库失败只记日志，不抛错（业务流不能被通知层拖垮）
 *
 * 解耦设计：
 *   - 业务模块（playground/research/writing/office）只 emit DomainEvent，不 import 通知服务
 *   - 适配 ai-harness 的 IBroadcastAdapter 协议，通过 DomainEventBus.registerAdapter 接入
 *   - 后续新增模块只需扩 EVENT_TYPE_MAP，无需改业务侧
 *
 * V1 覆盖事件：
 *   - agent-playground.mission:completed (mission 完成 + Lead 已签字)
 *
 * 待扩展（W4 follow-up）：
 *   - topic-insights research:completed（当前走自有 SocketIO emit，未上 DomainEventBus）
 *   - writing.task:completed
 *   - office.slides:completed
 */
@Injectable()
export class NotificationBroadcastAdapter implements IBroadcastAdapter {
  readonly id = "notifications-bridge";
  private readonly log = new Logger(NotificationBroadcastAdapter.name);

  /**
   * 事件 type → handler key 的映射。
   * 添加新事件时仅需在此扩展，不动 accepts/broadcast 逻辑。
   */
  private static readonly HANDLED_TYPES = new Set<string>([
    "agent-playground.mission:completed",
  ]);

  constructor(
    private readonly presets: NotificationPresetsService,
    private readonly prisma: PrismaService,
  ) {}

  accepts(event: DomainEvent): boolean {
    return NotificationBroadcastAdapter.HANDLED_TYPES.has(event.type);
  }

  async broadcast(event: DomainEvent): Promise<void> {
    const userId = event.scope?.userId;
    if (!userId) {
      this.log.debug(
        `Skipping notification for ${event.type}: no userId in scope`,
      );
      return;
    }

    try {
      switch (event.type) {
        case "agent-playground.mission:completed":
          await this.handleMissionCompleted(event);
          return;
        default:
          // 未匹配到 handler — accepts() 应已过滤，这里做防御性兜底
          return;
      }
    } catch (err) {
      // 只记日志：通知失败绝不影响业务流
      this.log.warn(
        `Failed to persist notification for ${event.type}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async handleMissionCompleted(event: DomainEvent): Promise<void> {
    const userId = event.scope.userId!;
    const missionId = event.scope.missionId;
    if (!missionId) {
      this.log.debug(
        "Skipping mission:completed notification: no missionId in scope",
      );
      return;
    }

    const payload = event.payload as
      | {
          reviewScore?: number;
          leaderSigned?: boolean;
          leaderOverallScore?: number;
        }
      | undefined;

    // 拒签的 mission（leaderSigned=false）虽走 markCompleted 但不应通知"已完成"
    if (payload?.leaderSigned === false) {
      this.log.debug(
        `Skipping mission:completed notification for ${missionId}: leader did not sign`,
      );
      return;
    }

    const missionTitle = await this.fetchMissionTitle(missionId);

    await this.presets.notifyMissionCompleted({
      userId,
      missionId,
      missionTitle,
      reviewScore: payload?.reviewScore,
    });
  }

  /**
   * 从 DB 读 mission 标题。优先 reportTitle（W2 / S11 markCompleted 时落库），
   * 其次 themeSummary，最后 missionId 兜底。
   */
  private async fetchMissionTitle(missionId: string): Promise<string> {
    try {
      const row = await this.prisma.agentPlaygroundMission.findUnique({
        where: { id: missionId },
        select: { reportTitle: true, themeSummary: true },
      });
      const t = row?.reportTitle?.trim() || row?.themeSummary?.trim();
      if (t) return t.slice(0, 200);
    } catch (err) {
      this.log.debug(
        `fetchMissionTitle failed for ${missionId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return missionId;
  }
}
