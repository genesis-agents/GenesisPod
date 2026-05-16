import { Injectable, Logger } from "@nestjs/common";
import { AIModelType } from "@prisma/client";
import { AiChatService } from "@/modules/ai-engine/facade";
import { truncate, tryParseJson } from "../agent-utils";

export interface SourceCuratorTopicCtx {
  name: string;
  description?: string | null;
  keywords: string[];
  entityType?: string | null;
  existing: Array<{ type: string; identifier: string }>;
}

export type CuratorSourceType = "X" | "YOUTUBE" | "RSS" | "CUSTOM";

export interface RecommendedSource {
  type: CuratorSourceType;
  identifier: string;
  label: string;
  rationale: string;
  confidence: number;
}

const SYSTEM_PROMPT = `你是 AI 雷达的"数据源策展人"。

任务：给定监控主题（含名称、描述、关键词、实体类型、已添加的 sources），
输出该主题值得长期订阅的若干信息源候选。

候选种类（type 取值）：
  X       : X (Twitter) 账号，identifier 形如 "@handle"（不含 https）
  YOUTUBE : YouTube 频道，identifier 必须是 24 位 channelId (UC...) 或 channel/ URL
  RSS     : 公司官博 / 媒体 RSS，identifier 是完整 https:// URL
  CUSTOM  : 列表页 URL（论坛热帖 / 公告页），identifier 是 https:// URL
            如果你建议 CUSTOM，请同时在 rationale 内简述应抓取的 CSS selector
            （供用户后续填到 config.listSelector）

要求：
  - 每类输出 1-5 个候选，总数 ≤ 12 个
  - 不重复已添加的 sources（输入会附 existing 列表）
  - 不输出已知失效 / 停更 / 内网 / file:// URL
  - YOUTUBE 优先给 channelId（更稳定），无 channelId 时给 https://www.youtube.com/@handle URL
  - X handle 不要给 https URL，给 "@handle" 格式

红线：
  - 严格按 JSON schema 输出，不要 markdown 围栏
  - 不要"猜测"账号 / 频道是否真存在；不确定时输出空数组比编造好
  - confidence (0-100)：你对推荐质量的把握度`;

@Injectable()
export class SourceCuratorAgent {
  private readonly log = new Logger(SourceCuratorAgent.name);

  constructor(private readonly chat: AiChatService) {}

  async recommend(
    topic: SourceCuratorTopicCtx,
    opts: { userId?: string; perTypeLimit?: number } = {},
  ): Promise<RecommendedSource[]> {
    try {
      const userPrompt = this.buildUserPrompt(topic, opts.perTypeLimit ?? 5);
      const result = await this.chat.chat({
        systemPrompt: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
        modelType: AIModelType.CHAT,
        taskProfile: {
          creativity: "low",
          outputLength: "medium",
        },
        userId: opts.userId,
        operationName: "radar.source-curator",
        skipGuardrails: true,
      });
      const parsed = tryParseJson<{ candidates: RecommendedSource[] }>(
        result.content,
      );
      if (!parsed || !Array.isArray(parsed.candidates)) {
        this.log.warn("Source curator returned non-parseable output");
        return [];
      }
      const existing = new Set(
        topic.existing.map((s) => `${s.type}:${s.identifier.toLowerCase()}`),
      );
      const cleaned = parsed.candidates
        .map((c) => this.normalize(c))
        .filter((c): c is RecommendedSource => c !== null)
        .filter(
          (c) => !existing.has(`${c.type}:${c.identifier.toLowerCase()}`),
        );
      return cleaned.slice(0, 12);
    } catch (err) {
      this.log.error(`Source curator LLM failed: ${(err as Error).message}`);
      return [];
    }
  }

  private normalize(raw: unknown): RecommendedSource | null {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    const type = r.type;
    if (
      type !== "X" &&
      type !== "YOUTUBE" &&
      type !== "RSS" &&
      type !== "CUSTOM"
    ) {
      return null;
    }
    const identifier =
      typeof r.identifier === "string" ? r.identifier.trim() : "";
    if (!identifier) return null;
    return {
      type,
      identifier,
      label:
        typeof r.label === "string" && r.label.trim()
          ? truncate(r.label.trim(), 200)
          : identifier,
      rationale:
        typeof r.rationale === "string" ? truncate(r.rationale, 200) : "",
      confidence:
        typeof r.confidence === "number"
          ? Math.max(0, Math.min(100, Math.round(r.confidence)))
          : 50,
    };
  }

  private buildUserPrompt(
    topic: SourceCuratorTopicCtx,
    perTypeLimit: number,
  ): string {
    return `主题：${JSON.stringify({
      name: topic.name,
      description: truncate(topic.description ?? "", 600),
      keywords: topic.keywords,
      entityType: topic.entityType ?? null,
    })}

已添加的 sources（不要重复推荐）：${JSON.stringify(topic.existing)}

请推荐每类至多 ${perTypeLimit} 个，总数 ≤ 12 个。

严格按 JSON 返回：
{
  "candidates": [
    { "type": "X|YOUTUBE|RSS|CUSTOM",
      "identifier": "...",
      "label": "人类可读名",
      "rationale": "为何推荐 (一句话)",
      "confidence": 0-100 }
  ]
}`;
  }
}
