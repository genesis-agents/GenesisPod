/**
 * S9 — daily-top-n stage（B1 + B2 + B3 + B5 + B10 + B20 编排）
 *
 * 来源：docs/architecture/ai-app/radar/daily-briefing-redesign-2026-05-18.md
 *   §7B.1-7B.3 + §8.1 + §8.4-bis 事件契约
 *
 * 工作流：
 * 1. 从 ctx.state 拿 uniqueItems + relevanceScores + qualityScores
 * 2. Stage A 评分 + filter score>0.55 top 20（B1 selectCandidatePool）
 * 3. dailyRepo.getYesterdayEntities 拿跨日延续 boost hint（B3）
 * 4. signalEditor.edit 调 LLM → DailySignal[]（B2）
 * 5. dailyRepo.upsert 写入 RadarDailyBriefing（B5，status='completed'/'no_signals'）
 * 6. EventEmitter emit 'radar.briefing.signal.created' for each tier=3（B10）
 * 7. metric emit 'radar.briefing.generated'（B20 走 EventEmitter2 + AIMetricsService）
 *
 * 仅 daily briefing mission 触发（refresh mission 不跑 S9）
 */
import { Injectable, Logger } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { RADAR_PIPELINE_DEFAULTS } from "../../../radar.constants";
import type { RunRadarDailyBriefingMissionInput } from "../../../dto/run-radar-refresh-mission.dto";
import type {
  RadarMissionContext,
  RadarStageHookArgs,
  RadarStageRunner,
} from "./radar-stage-types";
import {
  RadarDailyBriefingRepo,
  type DailySignal,
} from "../../briefing/radar-daily-briefing.repo";
import {
  SignalEditorService,
  type SignalEditorInput,
} from "../../briefing/signal-editor.service";
import { selectCandidatePool, type StageAInput } from "./scoring";

export const RADAR_BRIEFING_SIGNAL_CREATED_EVENT =
  "radar.briefing.signal.created";

export const RADAR_BRIEFING_GENERATED_METRIC = "radar.briefing.generated";

/** B10 事件 payload 契约 */
export interface RadarBriefingSignalCreatedEvent {
  userId: string;
  topicId: string;
  signal: DailySignal;
}

/** B20 metric payload 契约（observability） */
export interface RadarBriefingGeneratedMetric {
  topicId: string;
  userId: string;
  missionId: string;
  candidatesCount: number;
  selectedCount: number;
  tier3Count: number;
  tier2Count: number;
  tier1Count: number;
  avgWhyItMattersLen: number;
  briefingDate: string; // YYYY-MM-DD
}

@Injectable()
export class RadarS9DailyTopNStage implements RadarStageRunner {
  private readonly log = new Logger(RadarS9DailyTopNStage.name);

  constructor(
    private readonly dailyRepo: RadarDailyBriefingRepo,
    private readonly signalEditor: SignalEditorService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async run(args: RadarStageHookArgs, ctx: RadarMissionContext): Promise<void> {
    if (ctx.signal.aborted) throw new Error("aborted_during_s9_daily_top_n");

    const input = ctx.input as unknown as RunRadarDailyBriefingMissionInput;
    if (!input || !("briefingDate" in input)) {
      // 该 stage 只在 daily briefing mission 触发；refresh mission 不跑
      this.log.log(
        `[${ctx.missionId}] S9 skipped: not a daily briefing mission`,
      );
      return;
    }

    const topic = ctx.state.topic;
    const sources = ctx.state.sources ?? [];
    const uniqueItems = ctx.state.uniqueItems ?? [];
    const newItemIds = ctx.state.newItemIds ?? [];
    const relevanceScores = ctx.state.relevanceScores ?? new Map();
    const qualityScores = ctx.state.qualityScores ?? new Map();

    if (!topic) throw new Error("S9 daily-top-n: ctx.state.topic 缺失");

    const briefingDate = startOfUtcDay(input.briefingDate);

    // Stage A: 评分（B1）—— 仅评估通过 S4 relevance 阈值的 item
    const relevanceMin = RADAR_PIPELINE_DEFAULTS.relevanceThreshold;
    const sourceMap = new Map(sources.map((s) => [s.id, s]));

    const stageAInputs: StageAInput[] = [];
    uniqueItems.forEach((raw, idx) => {
      const itemId = newItemIds[idx];
      if (!itemId) return;
      const rel = relevanceScores.get(itemId);
      if (!rel || rel.score < relevanceMin) return;
      const qual = qualityScores.get(itemId);
      const source = sourceMap.get(raw.sourceId);
      if (!source) return;
      stageAInputs.push({
        item: {
          id: itemId,
          publishedAt: raw.publishedAt,
          metrics: raw.metrics ?? null,
        },
        source: { id: source.id, authorityWeight: source.authorityWeight },
        relevanceScore: rel.score,
        qualityScore: qual?.score,
      });
    });

    const candidatePool = selectCandidatePool(stageAInputs);
    this.log.log(
      `[${ctx.missionId}] S9 Stage A: ${stageAInputs.length} scored → ${candidatePool.length} candidates (threshold 0.55)`,
    );

    // 早期空候选 → 直接 no_signals
    if (candidatePool.length === 0) {
      await this.persistAndEmit({
        topicId: input.topicId,
        userId: ctx.userId,
        briefingDate,
        signals: [],
        missionId: ctx.missionId,
        candidatesCount: 0,
      });
      return;
    }

    // Stage B: signal-editor LLM（B2 + B3 跨日延续 boost）
    const yesterdayTopEntities = await this.dailyRepo.getYesterdayEntities(
      input.topicId,
      briefingDate,
    );

    // 把 candidate 翻译成 SignalEditorInput.candidates 形态
    const rawByItemId = new Map<
      string,
      { title: string | null; content: string | null; publishedAt: Date }
    >();
    uniqueItems.forEach((raw, idx) => {
      const itemId = newItemIds[idx];
      if (!itemId) return;
      rawByItemId.set(itemId, {
        title: raw.title,
        content: raw.content,
        publishedAt: raw.publishedAt,
      });
    });

    const keywords = Array.isArray(topic.keywords)
      ? (topic.keywords as string[]).filter((k) => typeof k === "string")
      : [];

    const editorInput: SignalEditorInput = {
      topic: {
        id: topic.id,
        name: topic.name,
        description: topic.description,
        keywords,
        signalTypes: input.signalTypes,
        outputLanguage: input.outputLanguage,
      },
      candidates: candidatePool.map((c) => {
        const raw = rawByItemId.get(c.itemId);
        const source = sourceMap.get(c.sourceId);
        return {
          itemId: c.itemId,
          title: raw?.title ?? "",
          content: raw?.content ?? "",
          source: source?.label ?? source?.identifier ?? "",
          publishedAt: raw?.publishedAt ?? new Date(),
          score: c.score,
          relevance: c.components.relevance,
          quality: c.components.quality,
        };
      }),
      yesterdayTopEntities,
      targetN: input.signalsTarget,
    };

    const signals = await this.signalEditor.edit(
      editorInput,
      args.systemPrompt,
    );

    // 把 Stage A score 回填到 signal（observability，不展示用户）
    const scoreById = new Map(candidatePool.map((c) => [c.itemId, c.score]));
    for (const s of signals) {
      if (s.evidenceItemIds.length > 0) {
        s.score = scoreById.get(s.evidenceItemIds[0]);
      }
    }

    await this.persistAndEmit({
      topicId: input.topicId,
      userId: ctx.userId,
      briefingDate,
      signals,
      missionId: ctx.missionId,
      candidatesCount: candidatePool.length,
    });
  }

  /** B5 upsert + B10 event emit + B20 metric emit（一处集中，便于 audit） */
  private async persistAndEmit(input: {
    topicId: string;
    userId: string;
    briefingDate: Date;
    signals: DailySignal[];
    missionId: string;
    candidatesCount: number;
  }): Promise<void> {
    const status = input.signals.length === 0 ? "no_signals" : "completed";

    await this.dailyRepo.upsert({
      topicId: input.topicId,
      userId: input.userId,
      briefingDate: input.briefingDate,
      signals: input.signals,
      status,
      generationRunId: input.missionId,
    });

    // B10: 每条 tier=3 signal emit 'radar.briefing.signal.created'（onTier3Signal 监听）
    for (const signal of input.signals) {
      if (signal.tier === 3) {
        const event: RadarBriefingSignalCreatedEvent = {
          userId: input.userId,
          topicId: input.topicId,
          signal,
        };
        this.eventEmitter.emit(RADAR_BRIEFING_SIGNAL_CREATED_EVENT, event);
      }
    }

    // B20: metric emit（观测面板用，M2 走 EventEmitter2）
    const tier3 = input.signals.filter((s) => s.tier === 3).length;
    const tier2 = input.signals.filter((s) => s.tier === 2).length;
    const tier1 = input.signals.filter((s) => s.tier === 1).length;
    const avgWhyLen =
      input.signals.length === 0
        ? 0
        : Math.round(
            input.signals.reduce(
              (sum, s) => sum + (s.whyItMatters?.length ?? 0),
              0,
            ) / input.signals.length,
          );
    const metric: RadarBriefingGeneratedMetric = {
      topicId: input.topicId,
      userId: input.userId,
      missionId: input.missionId,
      candidatesCount: input.candidatesCount,
      selectedCount: input.signals.length,
      tier3Count: tier3,
      tier2Count: tier2,
      tier1Count: tier1,
      avgWhyItMattersLen: avgWhyLen,
      briefingDate: input.briefingDate.toISOString().slice(0, 10),
    };
    this.eventEmitter.emit(RADAR_BRIEFING_GENERATED_METRIC, metric);

    this.log.log(
      `[${input.missionId}] S9 briefing persisted: status=${status} selected=${input.signals.length} tier3=${tier3}`,
    );
  }
}

/** 把任意 Date 规整到 UTC 当日 00:00（@db.Date 字段写入用） */
function startOfUtcDay(d: Date): Date {
  const r = new Date(d);
  r.setUTCHours(0, 0, 0, 0);
  return r;
}
