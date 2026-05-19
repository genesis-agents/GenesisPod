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
    // R8 2026-05-19：since 计算分三档：
    // - FIRST_RUN: 24h 回退（topic 首次跑，拉一天内的）
    // - MANUAL（用户点重新精选）: 24h 回退 —— 用户主动触发就是想"再看看最近一天有啥
    //   新的"，5min 太苛刻（多数 RSS feed 5min 内一条新 item 都没有，0 抓取一片空白）
    // - SCHEDULED（定时）: 5min 回退（保留原逻辑，避免重复入库）
    const SCHEDULED_LOOKBACK_MS = 5 * 60 * 1000;
    const MANUAL_LOOKBACK_MS = 24 * 60 * 60 * 1000;
    const trigger =
      "trigger" in input && typeof input.trigger === "string"
        ? input.trigger
        : "SCHEDULED";
    let since: Date;
    if (!topic.lastRunAt) {
      // 首次跑：回退 24h
      since = new Date(topic.createdAt.getTime() - 24 * 60 * 60 * 1000);
    } else if (trigger === "MANUAL") {
      since = new Date(topic.lastRunAt.getTime() - MANUAL_LOOKBACK_MS);
    } else {
      since = new Date(topic.lastRunAt.getTime() - SCHEDULED_LOOKBACK_MS);
    }

    ctx.state.topic = topic;
    ctx.state.sources = sources;
    ctx.state.since = since;

    this.log.log(
      `[${ctx.missionId}] S1 source-resolve: topic=${topic.name} sources=${sources.length} trigger=${trigger} since=${since.toISOString()}`,
    );
  }
}
