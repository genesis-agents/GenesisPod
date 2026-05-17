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
import { Prisma } from "@prisma/client";
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
          highlights:
            insightPayload.highlights as unknown as Prisma.InputJsonValue,
          signals: insightPayload.signals as unknown as Prisma.InputJsonValue,
          topEntities:
            insightPayload.topEntities as unknown as Prisma.InputJsonValue,
        },
      });
      insightCreated = true;
      ctx.state.metrics.insightCreated = true;
    }

    // 3. 更新 topic lastRunAt + nextDueAt
    //
    // 2026-05-17 R3 评审 P1：computeNextCronTick 返回 null 时旧逻辑用 undefined
    // 让 Prisma 跳过该字段，nextDueAt 维持不变 = 上一轮 due 时间。scheduler
    // 每分钟扫到 nextDueAt<=now 又会立即重发，dedup 部分救但仍然在分钟级烧
    // budget。新策略：cron 解析失败一律延后 1h，并打 warn 让运维感知。
    const NEXT_DUE_FALLBACK_MS = 60 * 60 * 1000;
    let nextDueAt = computeNextCronTick(topic.refreshCron, now);
    if (!nextDueAt) {
      this.log.warn(
        `[${ctx.missionId}] S8: cron "${topic.refreshCron}" 解析失败，nextDueAt fallback +1h 防 scheduler 风暴`,
      );
      nextDueAt = new Date(now.getTime() + NEXT_DUE_FALLBACK_MS);
    }
    await this.prisma.radarTopic.update({
      where: { id: topic.id },
      data: {
        lastRunAt: now,
        nextDueAt,
      },
    });

    this.log.log(
      `[${ctx.missionId}] S8 persist: accepted=${acceptedIds.size}/${newItemIds.length}` +
        ` insightCreated=${insightCreated} nextDueAt=${nextDueAt.toISOString()}`,
    );

    return;
  }

  // constructor 注入 PrismaService（NestJS DI 标准）
  constructor(private readonly prisma: PrismaService) {}
}
