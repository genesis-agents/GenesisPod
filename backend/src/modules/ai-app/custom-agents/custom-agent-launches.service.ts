/**
 * CustomAgentLaunchesService (2026-05-05 R-CA)
 *
 * 维护 custom-agents 自己的 mission 启动映射表（custom_agent_launches）。
 * 作用：让每个 custom agent 主页（/custom-agents/:id）能 list "我用这个 agent 跑过的所有 mission"。
 *
 * 设计原则：
 * - playground 完全不感知 custom agent 存在，所有 "哪个 agent 启动了这个 mission" 的关联
 *   都由本表持有；
 * - missionId 不加 FK 约束，playground mission 删除后 launch 仍保留 snapshot；
 * - launch 行除了 missionId 还存 topic snapshot，让 mission 已删时 UI 仍能渲染历史卡片。
 */
import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";

export interface CustomAgentLaunchRow {
  id: string;
  customAgentId: string;
  missionId: string | null;
  topic: string;
  startedAt: Date;
}

@Injectable()
export class CustomAgentLaunchesService {
  private readonly log = new Logger(CustomAgentLaunchesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * mission 启动成功后写一条 launch 行；写失败仅 log warn 不阻断 mission 运行
   * （launch 表丢一条只影响 agent 主页历史展示，不影响 mission 本身）。
   */
  async record(args: {
    userId: string;
    customAgentId: string;
    missionId: string;
    topic: string;
  }): Promise<void> {
    await this.prisma.customAgentLaunch
      .create({
        data: {
          userId: args.userId,
          customAgentId: args.customAgentId,
          missionId: args.missionId,
          topic: args.topic.slice(0, 500),
        },
      })
      .catch((err: unknown) => {
        this.log.warn(
          `[record ${args.customAgentId} → ${args.missionId}] failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      });
  }

  /**
   * 拉某用户某 custom agent 启动过的所有 mission id（按 startedAt 降序）。
   * 上层（service）负责 join playground mission 表拿状态/topic/score 等。
   */
  async listMissionIdsForAgent(
    userId: string,
    customAgentId: string,
    take = 100,
  ): Promise<string[]> {
    const rows = await this.prisma.customAgentLaunch
      .findMany({
        where: {
          userId,
          customAgentId,
          missionId: { not: null },
        },
        select: { missionId: true },
        orderBy: { startedAt: "desc" },
        take,
      })
      .catch((err: unknown) => {
        this.log.warn(
          `[listMissionIdsForAgent ${customAgentId}] failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        return [] as { missionId: string | null }[];
      });
    return rows
      .map((r) => r.missionId)
      .filter((m): m is string => typeof m === "string");
  }

  /**
   * 拉单 launch 详情（debug / mission 详情页反查 "我是被哪个 agent 启动的"）
   */
  async findByMissionId(
    userId: string,
    missionId: string,
  ): Promise<CustomAgentLaunchRow | null> {
    const row = await this.prisma.customAgentLaunch
      .findFirst({
        where: { userId, missionId },
        orderBy: { startedAt: "desc" },
      })
      .catch(() => null);
    if (!row) return null;
    return {
      id: row.id,
      customAgentId: row.customAgentId,
      missionId: row.missionId,
      topic: row.topic,
      startedAt: row.startedAt,
    };
  }
}
