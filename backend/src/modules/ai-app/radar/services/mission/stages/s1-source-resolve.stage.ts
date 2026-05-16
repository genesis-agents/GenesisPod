/**
 * S1 — source-resolve stage adapter
 *
 * 加载 topic + enabled sources（cooldown 过滤）+ 计算 since。写回 ctx.state。
 * 这是个纯 persist primitive（read-only），无 LLM 调用。
 */
import { Injectable, Logger } from "@nestjs/common";
import { RadarSourceHealth } from "@prisma/client";
import { PrismaService } from "@/common/prisma/prisma.service";
import type {
  RadarMissionContext,
  RadarStageHookArgs,
  RadarStageRunner,
} from "./radar-stage-types";

@Injectable()
export class RadarS1SourceResolveStage implements RadarStageRunner {
  private readonly log = new Logger(RadarS1SourceResolveStage.name);

  constructor(private readonly prisma: PrismaService) {}

  async run(
    _args: RadarStageHookArgs,
    ctx: RadarMissionContext,
  ): Promise<void> {
    const input = ctx.input;
    if (!("topicId" in input)) {
      throw new Error("S1 source-resolve: input must contain topicId");
    }
    const topic = await this.prisma.radarTopic.findUniqueOrThrow({
      where: { id: input.topicId },
    });
    const now = new Date();
    const sources = await this.prisma.radarSource.findMany({
      where: {
        topicId: input.topicId,
        enabled: true,
        OR: [{ cooldownUntil: null }, { cooldownUntil: { lte: now } }],
        NOT: { health: RadarSourceHealth.FAILING },
      },
    });
    const since = topic.lastRunAt
      ? new Date(topic.lastRunAt.getTime() - 5 * 60 * 1000)
      : new Date(topic.createdAt.getTime() - 24 * 60 * 60 * 1000);

    ctx.state.topic = topic;
    ctx.state.sources = sources;
    ctx.state.since = since;

    this.log.log(
      `[${ctx.missionId}] S1 source-resolve: topic=${topic.name} sources=${sources.length} since=${since.toISOString()}`,
    );
  }
}
