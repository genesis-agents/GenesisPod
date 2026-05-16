/**
 * S4 — relevance scoring stage adapter
 *
 * primitive=assess, roleId=relevance-judge
 *
 * 用 ResolvedRole.skillSpec.systemPrompt（从 SKILL.md 加载）调 AiChatService.chat。
 * 批量 10 个 item 一批，并行 batch 之间串行（保留响应顺序）。
 *
 * LLM 解析失败 / 调用失败 → 整批兜底 score=30 reason="LLM 失败兜底"，
 * 不阻断下游 stage。S4 阈值过滤在 stage 内部应用：score < relevanceThreshold
 * 的 item 标记 accepted=false 但保留 score（让 UI 能看到为何被过滤）。
 */
import { Injectable, Logger } from "@nestjs/common";
import { AIModelType } from "@prisma/client";
import { AiChatService } from "@/modules/ai-engine/facade";
import { PrismaService } from "@/common/prisma/prisma.service";
import { RADAR_PIPELINE_DEFAULTS } from "../../../radar.constants";
import type {
  RadarMissionContext,
  RadarStageHookArgs,
  RadarStageRunner,
} from "./radar-stage-types";

const BATCH_SIZE = RADAR_PIPELINE_DEFAULTS.relevanceBatchSize;

interface RelevanceScored {
  id: string;
  relevanceScore: number;
  reason: string;
}

@Injectable()
export class RadarS4RelevanceStage implements RadarStageRunner {
  private readonly log = new Logger(RadarS4RelevanceStage.name);

  constructor(
    private readonly chat: AiChatService,
    private readonly prisma: PrismaService,
  ) {}

  async run(args: RadarStageHookArgs, ctx: RadarMissionContext): Promise<void> {
    const topic = ctx.state.topic;
    const newItemIds = ctx.state.newItemIds ?? [];
    const uniqueItems = ctx.state.uniqueItems ?? [];
    if (!topic) throw new Error("S4 relevance: ctx.state.topic 缺失");
    if (newItemIds.length === 0 || uniqueItems.length === 0) {
      ctx.state.relevanceScores = new Map();
      return;
    }

    const systemPrompt =
      args.systemPrompt ||
      "你是 AI 雷达的相关性裁判，按 JSON schema 输出每条 0-100 分。";

    // 把 newItemIds 跟 uniqueItems 按顺序配对
    const itemsForLLM = uniqueItems.map((raw, idx) => ({
      id: newItemIds[idx],
      title: raw.title ?? "",
      content: raw.content ?? "",
      url: raw.url ?? "",
      source: raw.sourceId,
    }));

    const keywords = parseStringArray(topic.keywords);
    const scores = new Map<string, { score: number; reason: string }>();

    for (let i = 0; i < itemsForLLM.length; i += BATCH_SIZE) {
      if (ctx.signal.aborted)
        throw new Error("aborted_during_relevance_scoring");
      const batch = itemsForLLM.slice(i, i + BATCH_SIZE);
      const scored = await this.scoreBatch(
        systemPrompt,
        {
          name: topic.name,
          description: topic.description,
          keywords,
          entityType: topic.entityType,
        },
        batch,
        ctx.userId,
      );
      for (const s of scored) {
        scores.set(s.id, { score: s.relevanceScore, reason: s.reason });
      }
    }

    ctx.state.relevanceScores = scores;
    ctx.state.metrics.itemsEvaluated = scores.size;

    // 写回 DB（updateMany 单条循环，N+1 在 batch=10 量级下可接受）
    await this.persistScores(scores);

    this.log.log(
      `[${ctx.missionId}] S4 relevance: scored=${scores.size}/${itemsForLLM.length}`,
    );
  }

  private async scoreBatch(
    systemPrompt: string,
    topic: {
      name: string;
      description: string | null;
      keywords: string[];
      entityType: string | null;
    },
    batch: Array<{
      id: string;
      title: string;
      content: string;
      url: string;
      source: string;
    }>,
    userId: string,
  ): Promise<RelevanceScored[]> {
    const userPrompt = `主题：${JSON.stringify({
      name: topic.name,
      description: truncate(topic.description ?? "", 400),
      keywords: topic.keywords,
      entityType: topic.entityType ?? null,
    })}

请为下列 ${batch.length} 个条目逐一打分。

候选条目（JSON Lines，每行一条）：
${batch
  .map((i, idx) =>
    JSON.stringify({
      id: i.id,
      idx,
      source: i.source,
      title: truncate(i.title, 200),
      content: truncate(i.content, 600),
      url: i.url,
    }),
  )
  .join("\n")}

请严格按以下 JSON schema 返回（无 markdown 围栏）：
{
  "items": [
    { "id": "<原 id>", "relevanceScore": 0-100, "reason": "≤60 字" }
  ]
}`;

    try {
      const result = await this.chat.chat({
        systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
        modelType: AIModelType.CHAT_FAST,
        taskProfile: {
          creativity: "deterministic",
          outputLength: "minimal",
        },
        userId,
        operationName: "radar.s4-relevance",
        skipGuardrails: true,
      });
      const parsed = tryParseJson<{ items: RelevanceScored[] }>(result.content);
      if (!parsed || !Array.isArray(parsed.items)) {
        this.log.warn("Relevance LLM unparseable, fallback 30");
        return batch.map((i) => ({
          id: i.id,
          relevanceScore: 30,
          reason: "LLM 解析失败兜底",
        }));
      }
      const byId = new Map(parsed.items.map((x) => [x.id, x]));
      return batch.map((i) => {
        const e = byId.get(i.id);
        if (!e) {
          return { id: i.id, relevanceScore: 30, reason: "LLM 漏评分兜底" };
        }
        return {
          id: i.id,
          relevanceScore: clampScore(e.relevanceScore, 30),
          reason: typeof e.reason === "string" ? truncate(e.reason, 60) : "",
        };
      });
    } catch (err) {
      this.log.error(`S4 relevance LLM err: ${(err as Error).message}`);
      return batch.map((i) => ({
        id: i.id,
        relevanceScore: 30,
        reason: "LLM 调用失败兜底",
      }));
    }
  }

  private async persistScores(
    scores: Map<string, { score: number; reason: string }>,
  ): Promise<void> {
    if (scores.size === 0) return;
    await this.prisma.$transaction(
      [...scores.entries()].map(([id, v]) =>
        this.prisma.radarItem.update({
          where: { id },
          data: { relevanceScore: v.score },
        }),
      ),
    );
  }
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

function tryParseJson<T>(raw: string): T | null {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/, "")
    .replace(/\s*```$/, "");
  const firstBrace = stripped.search(/[{[]/);
  const candidate = firstBrace >= 0 ? stripped.slice(firstBrace) : stripped;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    return null;
  }
}

function clampScore(v: unknown, fallback: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  return Math.max(0, Math.min(100, Math.round(v)));
}

function truncate(s: string, max: number): string {
  if (!s) return "";
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 3)) + "...";
}
