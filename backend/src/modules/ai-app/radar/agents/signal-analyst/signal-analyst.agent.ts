import { Injectable, Logger } from "@nestjs/common";
import { AIModelType } from "@prisma/client";
import { AiChatService } from "@/modules/ai-engine/facade";
import { ExtractedEntity } from "../entity-extractor/entity-extractor.agent";
import { truncate, tryParseJson } from "../agent-utils";

export interface SignalAnalystInputItem {
  id: string;
  title: string | null;
  aiSummary: string | null;
  relevanceScore: number | null;
  qualityScore: number | null;
  publishedAt: Date;
  entities: ExtractedEntity[];
  url: string | null;
}

export interface SignalAnalystTopicCtx {
  name: string;
  description?: string | null;
  keywords: string[];
}

export interface SignalAnalystPriorContext {
  periodFrom: Date | null;
  periodTo: Date | null;
  itemCount: number;
  topEntities: Array<{ type: string; name: string; mentions: number }>;
  summary: string | null;
}

export interface SignalInsightPayload {
  summary: string;
  highlights: Array<{
    title: string;
    itemIds: string[];
    type: "trend" | "new-entity" | "anomaly" | "key-event";
  }>;
  signals: Array<{
    kind: string;
    magnitude: number;
    evidence: string;
  }>;
  topEntities: Array<{
    type: string;
    name: string;
    mentions: number;
    delta: number;
  }>;
}

const SYSTEM_PROMPT = `你是 AI 雷达的"信号分析师"。

任务：对本期采集到的高质量信息条目做整体洞察，产出周期性 RadarInsight。

输入：
  - 监控主题 + 关键词
  - 本期 enriched items（已含 relevance/quality/aiSummary/entities）
  - 上期 insight 元数据（itemCount + topEntities + summary），用于做"声量突增 / 新实体"对照

输出要求：
  1. summary  : ≤200 字中文总结，回答"这一周期主题领域发生了什么"
  2. highlights: 3-5 条要点，每条含 title (≤30 字) + itemIds (≥1 个) + type
     - trend       : 长期趋势（持续发酵）
     - new-entity  : 新出现的人物/公司/产品
     - anomaly     : 异常信号（声量/情感反转）
     - key-event   : 单次关键事件（发布会 / 收购 / 财报）
  3. signals  : 0-5 条可量化信号
     - kind     : "volume-surge" | "new-entity" | "sentiment-flip" | "competitor-move" | "other"
     - magnitude: 信号强度 0-100
     - evidence : 单行证据 ≤80 字
  4. topEntities: 本期 top 8 实体（合并同 normalizedName）
     - mentions : 本期被提及次数
     - delta    : mentions - 上期同实体 mentions（上期无 → 等于 mentions）

红线：
  - 严格按 JSON schema 输出，不要 markdown 围栏
  - itemIds 必须是输入条目的真实 id（不能编造）
  - summary 不带主观立场词`;

@Injectable()
export class SignalAnalystAgent {
  private readonly log = new Logger(SignalAnalystAgent.name);

  constructor(private readonly chat: AiChatService) {}

  async analyze(
    topic: SignalAnalystTopicCtx,
    items: SignalAnalystInputItem[],
    prior: SignalAnalystPriorContext | null,
    opts: { userId?: string } = {},
  ): Promise<SignalInsightPayload> {
    const fallback = this.buildFallback(items);
    if (items.length === 0) return fallback;
    try {
      const userPrompt = this.buildUserPrompt(topic, items, prior);
      const result = await this.chat.chat({
        systemPrompt: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
        modelType: AIModelType.CHAT,
        taskProfile: {
          creativity: "low",
          outputLength: "medium",
        },
        userId: opts.userId,
        operationName: "radar.signal-analyst",
        skipGuardrails: true,
      });
      const parsed = tryParseJson<SignalInsightPayload>(result.content);
      if (!parsed) {
        this.log.warn("Signal analyst output unparseable, using fallback");
        return fallback;
      }
      // 兜底 schema 校验 + 去掉编造的 itemIds
      const validIds = new Set(items.map((i) => i.id));
      const highlights = (parsed.highlights ?? [])
        .map((h) => ({
          title: typeof h.title === "string" ? truncate(h.title, 30) : "",
          itemIds: Array.isArray(h.itemIds)
            ? h.itemIds.filter((id) => validIds.has(id))
            : [],
          type: this.normalizeHighlightType(h.type),
        }))
        .filter((h) => h.title && h.itemIds.length > 0)
        .slice(0, 5);
      return {
        summary:
          typeof parsed.summary === "string" && parsed.summary.trim()
            ? truncate(parsed.summary.trim(), 200)
            : fallback.summary,
        highlights: highlights.length > 0 ? highlights : fallback.highlights,
        signals: Array.isArray(parsed.signals)
          ? parsed.signals.slice(0, 5).map((s) => ({
              kind: typeof s.kind === "string" ? s.kind : "other",
              magnitude: this.clampMagnitude(s.magnitude),
              evidence:
                typeof s.evidence === "string" ? truncate(s.evidence, 80) : "",
            }))
          : fallback.signals,
        topEntities: Array.isArray(parsed.topEntities)
          ? parsed.topEntities.slice(0, 8).map((e) => ({
              type: typeof e.type === "string" ? e.type : "other",
              name: typeof e.name === "string" ? e.name : "",
              mentions:
                typeof e.mentions === "number"
                  ? Math.max(0, Math.round(e.mentions))
                  : 0,
              delta: typeof e.delta === "number" ? Math.round(e.delta) : 0,
            }))
          : fallback.topEntities,
      };
    } catch (err) {
      this.log.error(
        `Signal analyst LLM failed: ${(err as Error).message}; using fallback`,
      );
      return fallback;
    }
  }

  private buildFallback(items: SignalAnalystInputItem[]): SignalInsightPayload {
    // 无 LLM 时的兜底：仅做基础统计
    const entityCounter = new Map<
      string,
      { type: string; name: string; mentions: number }
    >();
    for (const i of items) {
      for (const e of i.entities) {
        const key = `${e.type}:${e.normalizedName}`;
        const cur = entityCounter.get(key);
        if (cur) cur.mentions++;
        else
          entityCounter.set(key, {
            type: e.type,
            name: e.normalizedName,
            mentions: 1,
          });
      }
    }
    const topEntities = Array.from(entityCounter.values())
      .sort((a, b) => b.mentions - a.mentions)
      .slice(0, 8)
      .map((e) => ({ ...e, delta: e.mentions }));
    return {
      summary:
        items.length > 0
          ? `本周期采集到 ${items.length} 条相关信息，覆盖 ${topEntities.length} 个核心实体。AI 信号分析暂不可用，请稍后查看。`
          : "本周期未采集到新信息。",
      highlights: [],
      signals: [],
      topEntities,
    };
  }

  private normalizeHighlightType(
    raw: unknown,
  ): "trend" | "new-entity" | "anomaly" | "key-event" {
    if (
      raw === "trend" ||
      raw === "new-entity" ||
      raw === "anomaly" ||
      raw === "key-event"
    ) {
      return raw;
    }
    return "key-event";
  }

  private clampMagnitude(n: unknown): number {
    if (typeof n !== "number" || !Number.isFinite(n)) return 50;
    return Math.max(0, Math.min(100, Math.round(n)));
  }

  private buildUserPrompt(
    topic: SignalAnalystTopicCtx,
    items: SignalAnalystInputItem[],
    prior: SignalAnalystPriorContext | null,
  ): string {
    const topicLine = JSON.stringify({
      name: topic.name,
      description: truncate(topic.description ?? "", 400),
      keywords: topic.keywords,
    });
    const priorBlock = prior
      ? JSON.stringify({
          periodFrom: prior.periodFrom?.toISOString() ?? null,
          periodTo: prior.periodTo?.toISOString() ?? null,
          itemCount: prior.itemCount,
          topEntities: prior.topEntities,
          summary: truncate(prior.summary ?? "", 400),
        })
      : '{ "note": "无上期数据" }';
    const itemsBlock = items
      .map((i) =>
        JSON.stringify({
          id: i.id,
          title: truncate(i.title ?? "", 200),
          aiSummary: truncate(i.aiSummary ?? "", 80),
          relevanceScore: i.relevanceScore,
          qualityScore: i.qualityScore,
          publishedAt: i.publishedAt.toISOString(),
          entities: i.entities.map((e) => ({
            type: e.type,
            name: e.normalizedName,
          })),
        }),
      )
      .join("\n");
    return `主题：${topicLine}

上期摘要：${priorBlock}

本期 enriched items（${items.length} 条）：
${itemsBlock}

请按 JSON schema 输出（不要 markdown 包裹）：
{
  "summary": "≤200 字",
  "highlights": [
    { "title": "≤30 字",
      "itemIds": ["..."],
      "type": "trend|new-entity|anomaly|key-event" }
  ],
  "signals": [
    { "kind": "volume-surge|new-entity|sentiment-flip|competitor-move|other",
      "magnitude": 0-100,
      "evidence": "≤80 字" }
  ],
  "topEntities": [
    { "type": "...", "name": "...", "mentions": N, "delta": N }
  ]
}`;
  }
}
