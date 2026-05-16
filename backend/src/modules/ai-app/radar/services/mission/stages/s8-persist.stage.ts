/**
 * S8 — persist stage adapter
 *
 * primitive=persist（不调用 LLM）
 *
 * 执行顺序：
 *   1. updateMany radar_items SET accepted = (relevance>=60 && quality>=50) WHERE id IN newItemIds
 *   2. 如果 insightPayload 存在 + 有 accepted item → 创建 RadarInsight 行
 *   3. radar_topics SET lastRunAt=now, nextDueAt=computeNextCronTick(topic.refreshCron, now)
 *   4. 更新 ctx.state.metrics.itemsAccepted + insightCreated
 *
 * 通知由 dispatcher 在 mission 完成后统一发出，本 stage 不发。
 */
import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import { RADAR_PIPELINE_DEFAULTS } from "../../../radar.constants";
import { computeNextCronTick } from "../../scheduler/cron-util";
import type {
  RadarMissionContext,
  RadarStageHookArgs,
  RadarStageRunner,
} from "./radar-stage-types";

@Injectable()
export class RadarS8PersistStage implements RadarStageRunner {
  private readonly log = new Logger(RadarS8PersistStage.name);

  async run(
    _args: RadarStageHookArgs,
    ctx: RadarMissionContext,
  ): Promise<void> {
    if (ctx.signal.aborted) throw new Error("aborted_during_persist");

    const topic = ctx.state.topic;
    if (!topic) throw new Error("S8 persist: ctx.state.topic 缺失");

    const newItemIds = ctx.state.newItemIds ?? [];
    const relevanceScores = ctx.state.relevanceScores ?? new Map();
    const qualityScores = ctx.state.qualityScores ?? new Map();
    const insightPayload = ctx.state.insightPayload;

    const relMin = RADAR_PIPELINE_DEFAULTS.acceptedRelevanceMin;
    const qualMin = RADAR_PIPELINE_DEFAULTS.acceptedQualityMin;

    const now = new Date();

    // 1. 标记 accepted / not-accepted
    const acceptedIds = new Set<string>();
    const itemUpdates = newItemIds.map((id) => {
      const rel = relevanceScores.get(id);
      const qual = qualityScores.get(id);
      const accepted =
        rel !== undefined &&
        rel.score >= relMin &&
        qual !== undefined &&
        qual.score >= qualMin;
      if (accepted) acceptedIds.add(id);
      return { id, accepted };
    });

    if (itemUpdates.length > 0) {
      await this.prisma.$transaction(
        itemUpdates.map(({ id, accepted }) =>
          this.prisma.radarItem.update({
            where: { id },
            data: { accepted },
          }),
        ),
      );
    }

    ctx.state.metrics.itemsAccepted = acceptedIds.size;

    // 2. 创建 RadarInsight（需要有 payload 且有 accepted item）
    let insightCreated = false;
    if (insightPayload && acceptedIds.size > 0) {
      const periodFrom = topic.lastRunAt ?? ctx.state.since ?? now;
      await this.prisma.radarInsight.create({
        data: {
          topicId: topic.id,
          periodFrom,
          periodTo: now,
          summary: insightPayload.summary,
          highlights: insightPayload.highlights as unknown as object[],
          signals: insightPayload.signals as unknown as object[],
          topEntities: insightPayload.topEntities as unknown as object[],
        },
      });
      insightCreated = true;
      ctx.state.metrics.insightCreated = true;
    }

    // 3. 更新 topic lastRunAt + nextDueAt
    const nextDueAt = computeNextCronTick(topic.refreshCron, now);
    await this.prisma.radarTopic.update({
      where: { id: topic.id },
      data: {
        lastRunAt: now,
        nextDueAt: nextDueAt ?? undefined,
      },
    });

    this.log.log(
      `[${ctx.missionId}] S8 persist: accepted=${acceptedIds.size}/${newItemIds.length}` +
        ` insightCreated=${insightCreated} nextDueAt=${nextDueAt?.toISOString() ?? "null"}`,
    );

    return;
  }

  // constructor 注入 PrismaService（NestJS DI 标准）
  constructor(private readonly prisma: PrismaService) {}
}
