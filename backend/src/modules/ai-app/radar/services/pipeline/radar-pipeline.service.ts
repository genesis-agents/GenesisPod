import { Injectable, Logger } from "@nestjs/common";
import type { JsonObject, JsonValue } from "@prisma/client/runtime/library";
import { Prisma, RadarItem, RadarTopic } from "@prisma/client";
import { PrismaService } from "../../../../../common/prisma/prisma.service";
import { NotificationService } from "../../../../ai-infra/notifications/notification.service";
import { NotificationTypeDto } from "../../../../ai-infra/notifications/dto/notification.dto";
import { RADAR_PIPELINE_DEFAULTS } from "../../radar.constants";
import { RelevanceJudgeAgent } from "../../agents/relevance-judge/relevance-judge.agent";
import { QualityRaterAgent } from "../../agents/quality-rater/quality-rater.agent";
import {
  EntityExtractorAgent,
  ExtractedEntity,
} from "../../agents/entity-extractor/entity-extractor.agent";
import {
  SignalAnalystAgent,
  SignalAnalystPriorContext,
} from "../../agents/signal-analyst/signal-analyst.agent";

export interface PipelineRunSummary {
  itemsEvaluated: number;
  itemsAccepted: number;
  llmBatches: number;
  insightCreated: boolean;
}

/**
 * RadarPipeline —— RadarCollectService 完成 collect 之后接力。
 *
 * 流程（PR-R3）：
 *   S4 relevance-score   : RelevanceJudgeAgent → 写 RadarItem.relevanceScore
 *   S5 quality-score     : QualityRaterAgent → 写 qualityScore + aiSummary
 *   S6 entity-extract    : EntityExtractorAgent → 写 entities
 *   S7 signal-insight    : SignalAnalystAgent → 写 RadarInsight
 *   S8 persist           : 设置 RadarItem.accepted（relevance>=60 && quality>=50）
 *
 * 在 S4 之后，relevance < threshold 的 item 直接标 accepted=false 不进 S5/S6（省 LLM）。
 */
@Injectable()
export class RadarPipeline {
  private readonly log = new Logger(RadarPipeline.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly relevance: RelevanceJudgeAgent,
    private readonly quality: QualityRaterAgent,
    private readonly entity: EntityExtractorAgent,
    private readonly analyst: SignalAnalystAgent,
    private readonly notifications: NotificationService,
  ) {}

  /**
   * 对一次 run 新插入的 items 做 AI 评分 + 生成 insight。
   *
   * @param topic 主题
   * @param newItemIds  本次 run 新插入的 RadarItem.id（避免重复评分历史数据）
   * @param runId 关联到 RadarInsight.runId
   * @param userId 走 BYOK 的用户 id（PR-R4 注入）
   */
  async enrich(
    topic: RadarTopic,
    newItemIds: string[],
    runId: string,
    userId?: string,
  ): Promise<PipelineRunSummary> {
    this.log.log(
      `Pipeline enrich start topic=${topic.id} newItems=${newItemIds.length} runId=${runId}`,
    );
    if (newItemIds.length === 0) {
      // 仍可基于"过去 N 天" items 生成洞察
      return this.maybeGenerateInsightForEmpty(topic, runId, userId);
    }
    const items = await this.prisma.radarItem.findMany({
      where: { id: { in: newItemIds } },
      include: {
        source: { select: { type: true, identifier: true, label: true } },
      },
      orderBy: { publishedAt: "desc" },
    });
    if (items.length === 0) {
      return {
        itemsEvaluated: 0,
        itemsAccepted: 0,
        llmBatches: 0,
        insightCreated: false,
      };
    }

    const keywords = this.parseKeywords(topic.keywords);

    // ── S4 relevance ────────────────────────────────────
    const scored = await this.relevance.scoreBatch(
      {
        name: topic.name,
        description: topic.description,
        keywords,
        entityType: topic.entityType,
      },
      items.map((i) => ({
        id: i.id,
        title: i.title,
        content: i.content,
        url: i.url,
        source: i.source.label ?? i.source.identifier,
      })),
      { userId },
    );
    const scoredMap = new Map(scored.map((s) => [s.id, s]));

    // 写 relevance + 过滤进入 S5/S6 的 items
    // R6 整改：批量 $transaction 一次性 update N 条（消除 N+1）
    const threshold = RADAR_PIPELINE_DEFAULTS.relevanceThreshold;
    const itemsForS5: RadarItem[] = [];
    const s4Updates: Prisma.PrismaPromise<RadarItem>[] = [];
    for (const item of items) {
      const s = scoredMap.get(item.id);
      const relScore = s?.relevanceScore ?? 30;
      s4Updates.push(
        this.prisma.radarItem.update({
          where: { id: item.id },
          data: { relevanceScore: relScore },
        }),
      );
      if (relScore >= threshold) itemsForS5.push(item);
    }
    if (s4Updates.length > 0) await this.prisma.$transaction(s4Updates);

    // ── S5 quality + summary ──────────────────────────
    const rated = await this.quality.rateBatch(
      itemsForS5.map((i) => ({
        id: i.id,
        title: i.title,
        content: i.content,
        url: i.url,
        source: this.findSourceLabel(items, i.id),
        author: i.author,
      })),
      { userId },
    );
    const ratedMap = new Map(rated.map((r) => [r.id, r]));

    const s5Updates = itemsForS5.map((item) => {
      const r = ratedMap.get(item.id);
      return this.prisma.radarItem.update({
        where: { id: item.id },
        data: {
          qualityScore: r?.qualityScore ?? 40,
          aiSummary: r?.aiSummary ?? null,
        },
      });
    });
    if (s5Updates.length > 0) await this.prisma.$transaction(s5Updates);

    // ── S6 entities ───────────────────────────────────
    const extracted = await this.entity.extractBatch(
      itemsForS5.map((i) => ({
        id: i.id,
        title: i.title,
        content: i.content,
      })),
      { userId },
    );
    const entityMap = new Map(extracted.map((e) => [e.id, e.entities]));

    const s6Updates = itemsForS5.map((item) => {
      const entities = entityMap.get(item.id) ?? [];
      return this.prisma.radarItem.update({
        where: { id: item.id },
        data: {
          entities: entities as unknown as Prisma.InputJsonValue,
        },
      });
    });
    if (s6Updates.length > 0) await this.prisma.$transaction(s6Updates);

    // ── S8 accepted ───────────────────────────────────
    const acceptedIds: string[] = [];
    for (const item of itemsForS5) {
      const score = scoredMap.get(item.id);
      const rate = ratedMap.get(item.id);
      const accepted =
        (score?.relevanceScore ?? 0) >=
          RADAR_PIPELINE_DEFAULTS.acceptedRelevanceMin &&
        (rate?.qualityScore ?? 0) >= RADAR_PIPELINE_DEFAULTS.acceptedQualityMin;
      if (accepted) acceptedIds.push(item.id);
    }
    const itemsAccepted = acceptedIds.length;
    if (acceptedIds.length > 0) {
      await this.prisma.radarItem.updateMany({
        where: { id: { in: acceptedIds } },
        data: { accepted: true },
      });
    }

    // ── S7 insight ────────────────────────────────────
    const insightCreated = await this.generateInsight(topic, runId, userId);

    return {
      itemsEvaluated: items.length,
      itemsAccepted,
      // batches: relevance + quality + entity（粗算）
      llmBatches:
        Math.ceil(items.length / 10) +
        Math.ceil(itemsForS5.length / 10) +
        Math.ceil(itemsForS5.length / 8),
      insightCreated,
    };
  }

  private async maybeGenerateInsightForEmpty(
    topic: RadarTopic,
    runId: string,
    userId?: string,
  ): Promise<PipelineRunSummary> {
    // 空 run 时仍生成 insight（用历史 items）
    const created = await this.generateInsight(topic, runId, userId);
    return {
      itemsEvaluated: 0,
      itemsAccepted: 0,
      llmBatches: 0,
      insightCreated: created,
    };
  }

  private async generateInsight(
    topic: RadarTopic,
    runId: string,
    userId?: string,
  ): Promise<boolean> {
    const lookbackDays = RADAR_PIPELINE_DEFAULTS.insightLookbackDays;
    const periodTo = new Date();
    const periodFrom = new Date(
      periodTo.getTime() - lookbackDays * 24 * 60 * 60 * 1000,
    );

    const currentItems = await this.prisma.radarItem.findMany({
      where: {
        topicId: topic.id,
        accepted: true,
        publishedAt: { gte: periodFrom, lte: periodTo },
      },
      orderBy: { publishedAt: "desc" },
      take: 60,
    });
    if (currentItems.length === 0) return false;

    const prevInsight = await this.prisma.radarInsight.findFirst({
      where: { topicId: topic.id },
      orderBy: { periodTo: "desc" },
    });
    const prior: SignalAnalystPriorContext | null = prevInsight
      ? {
          periodFrom: prevInsight.periodFrom,
          periodTo: prevInsight.periodTo,
          itemCount: this.countFromMetrics(prevInsight.signals),
          topEntities: this.parseTopEntitiesFromInsight(
            prevInsight.topEntities,
          ),
          summary: prevInsight.summary,
        }
      : null;

    const keywords = this.parseKeywords(topic.keywords);
    const insightPayload = await this.analyst.analyze(
      {
        name: topic.name,
        description: topic.description,
        keywords,
      },
      currentItems.map((i) => ({
        id: i.id,
        title: i.title,
        aiSummary: i.aiSummary,
        relevanceScore: i.relevanceScore,
        qualityScore: i.qualityScore,
        publishedAt: i.publishedAt,
        entities: this.parseItemEntities(i.entities),
        url: i.url,
      })),
      prior,
      { userId },
    );

    const insight = await this.prisma.radarInsight.create({
      data: {
        topicId: topic.id,
        runId,
        periodFrom,
        periodTo,
        summary: insightPayload.summary,
        highlights:
          insightPayload.highlights as unknown as Prisma.InputJsonValue,
        signals: insightPayload.signals as unknown as Prisma.InputJsonValue,
        topEntities:
          insightPayload.topEntities as unknown as Prisma.InputJsonValue,
      },
    });

    // 通知主题所有者（fire-and-forget，失败不影响 insight 落库）
    void this.notifyInsight(topic, insight.id, insightPayload.summary);
    return true;
  }

  private async notifyInsight(
    topic: RadarTopic,
    insightId: string,
    summary: string,
  ): Promise<void> {
    try {
      await this.notifications.createNotification({
        userId: topic.userId,
        type: NotificationTypeDto.SYSTEM,
        title: `[AI 雷达] ${topic.name} 新洞察`,
        message: summary.slice(0, 200),
        actionUrl: `/ai-radar/topic/${topic.id}`,
        actionLabel: "查看",
        relatedType: "RadarInsight",
        relatedId: insightId,
        metadata: { topicId: topic.id },
      });
    } catch (err) {
      this.log.warn(
        `Notify insight failed topic=${topic.id}: ${(err as Error).message}`,
      );
    }
  }

  private parseKeywords(raw: Prisma.JsonValue): string[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter((v): v is string => typeof v === "string");
  }

  private parseItemEntities(raw: Prisma.JsonValue | null): ExtractedEntity[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((e) => this.normalizeEntity(e))
      .filter((e): e is ExtractedEntity => e !== null);
  }

  private normalizeEntity(raw: unknown): ExtractedEntity | null {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    if (typeof r.name !== "string" || typeof r.normalizedName !== "string") {
      return null;
    }
    const type =
      typeof r.type === "string"
        ? (r.type as ExtractedEntity["type"])
        : "other";
    return {
      type,
      name: r.name,
      normalizedName: r.normalizedName,
      confidence: typeof r.confidence === "number" ? r.confidence : 60,
    };
  }

  private parseTopEntitiesFromInsight(
    raw: Prisma.JsonValue,
  ): Array<{ type: string; name: string; mentions: number }> {
    if (!Array.isArray(raw)) return [];
    const out: Array<{ type: string; name: string; mentions: number }> = [];
    for (const e of raw) {
      if (!this.isJsonObject(e)) continue;
      const type = typeof e.type === "string" ? e.type : "other";
      const name = typeof e.name === "string" ? e.name : "";
      const mentions = typeof e.mentions === "number" ? e.mentions : 0;
      if (!name) continue;
      out.push({ type, name, mentions });
    }
    return out;
  }

  private isJsonObject(v: JsonValue): v is JsonObject {
    return v !== null && typeof v === "object" && !Array.isArray(v);
  }

  private countFromMetrics(raw: Prisma.JsonValue): number {
    if (!Array.isArray(raw)) return 0;
    return raw.length;
  }

  private findSourceLabel(
    items: Array<
      RadarItem & { source?: { label: string | null; identifier: string } }
    >,
    id: string,
  ): string {
    const item = items.find((i) => i.id === id);
    return item?.source?.label ?? item?.source?.identifier ?? "";
  }
}
