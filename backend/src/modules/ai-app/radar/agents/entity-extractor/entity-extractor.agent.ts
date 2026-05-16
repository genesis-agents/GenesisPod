import { Injectable, Logger } from "@nestjs/common";
import { AIModelType } from "@prisma/client";
import { AiChatService } from "@/modules/ai-engine/facade";
import { chunk, truncate, tryParseJson } from "../agent-utils";
import { RADAR_MAX_ENTITIES_PER_ITEM } from "../../radar.constants";

export interface EntityExtractorInputItem {
  id: string;
  title: string | null;
  content: string | null;
}

export type EntityKind =
  | "person"
  | "company"
  | "product"
  | "event"
  | "location"
  | "other";

export interface ExtractedEntity {
  type: EntityKind;
  name: string;
  normalizedName: string;
  confidence: number;
}

export interface EntityExtractionResult {
  id: string;
  entities: ExtractedEntity[];
}

const BATCH_SIZE = 8;
const ALLOWED_TYPES: EntityKind[] = [
  "person",
  "company",
  "product",
  "event",
  "location",
  "other",
];

const SYSTEM_PROMPT = `你是 AI 雷达的"实体抽取器"。

任务：从每条信息中抽取最多 ${RADAR_MAX_ENTITIES_PER_ITEM} 个核心实体，
为 AI 雷达的实体云 / 实体关联图谱提供原料。

实体类型 (type 取值)：
  person   : 人物（CEO / 学者 / 创始人 / 公众人物）
  company  : 公司 / 机构 / 实验室
  product  : 产品 / 模型 / 服务 / 框架 / 论文标题
  event    : 事件（发布会 / 财报 / 收购 / 诉讼 / 大会）
  location : 国家 / 城市 / 园区
  other    : 上述无法归类的核心专有名词

normalizedName：实体的"权威标准名"。
  - 公司名去后缀（"OpenAI, Inc." → "OpenAI"）
  - 人物用全名（"Sam" → "Sam Altman"）
  - 产品用版本前的主名（"GPT-5 Turbo Preview" → "GPT-5"）
  - 不确定时与 name 相同

confidence (0-100)：抽取置信度。
  90+ 强信号（直接命名 + 上下文清晰）
  60-89 中信号（出现 1-2 次，含一定上下文）
  <60 弱信号（仅 1 次提及无明确指代）

红线：
  - 不抽取普通名词 / 时间 / 数字 / 代词
  - 不抽取主题之外的明显无关人物
  - JSON 输出，无包裹
  - 每条 ≤ ${RADAR_MAX_ENTITIES_PER_ITEM} 个`;

@Injectable()
export class EntityExtractorAgent {
  private readonly log = new Logger(EntityExtractorAgent.name);

  constructor(private readonly chat: AiChatService) {}

  async extractBatch(
    items: EntityExtractorInputItem[],
    opts: { userId?: string } = {},
  ): Promise<EntityExtractionResult[]> {
    if (items.length === 0) return [];
    const batches = chunk(items, BATCH_SIZE);
    const out: EntityExtractionResult[] = [];
    for (const batch of batches) {
      out.push(...(await this.extractOneBatch(batch, opts.userId)));
    }
    return out;
  }

  private async extractOneBatch(
    batch: EntityExtractorInputItem[],
    userId?: string,
  ): Promise<EntityExtractionResult[]> {
    const userPrompt = this.buildUserPrompt(batch);
    try {
      const result = await this.chat.chat({
        systemPrompt: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
        modelType: AIModelType.CHAT_FAST,
        taskProfile: {
          creativity: "deterministic",
          outputLength: "medium",
        },
        userId,
        operationName: "radar.entity-extractor",
        skipGuardrails: true,
      });
      const parsed = tryParseJson<{ items: EntityExtractionResult[] }>(
        result.content,
      );
      if (!parsed || !Array.isArray(parsed.items)) {
        return batch.map((i) => ({ id: i.id, entities: [] }));
      }
      const byId = new Map(parsed.items.map((x) => [x.id, x]));
      return batch.map((i) => {
        const entry = byId.get(i.id);
        if (!entry || !Array.isArray(entry.entities)) {
          return { id: i.id, entities: [] };
        }
        const cleaned = entry.entities
          .map((e) => this.normalizeEntity(e))
          .filter((e): e is ExtractedEntity => e !== null)
          .slice(0, RADAR_MAX_ENTITIES_PER_ITEM);
        return { id: i.id, entities: cleaned };
      });
    } catch (err) {
      this.log.error(`Entity extractor LLM failed: ${(err as Error).message}`);
      return batch.map((i) => ({ id: i.id, entities: [] }));
    }
  }

  private normalizeEntity(raw: unknown): ExtractedEntity | null {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    const name = typeof r.name === "string" ? r.name.trim() : null;
    if (!name) return null;
    const type =
      typeof r.type === "string" && ALLOWED_TYPES.includes(r.type as EntityKind)
        ? (r.type as EntityKind)
        : "other";
    const normalizedName =
      typeof r.normalizedName === "string" && r.normalizedName.trim()
        ? r.normalizedName.trim()
        : name;
    const confidenceRaw = typeof r.confidence === "number" ? r.confidence : 60;
    const confidence = Math.max(0, Math.min(100, Math.round(confidenceRaw)));
    return { type, name, normalizedName, confidence };
  }

  private buildUserPrompt(batch: EntityExtractorInputItem[]): string {
    const itemsBlock = batch
      .map((i) =>
        JSON.stringify({
          id: i.id,
          title: truncate(i.title ?? "", 200),
          content: truncate(i.content ?? "", 800),
        }),
      )
      .join("\n");
    return `请为以下 ${batch.length} 条信息抽取实体：

${itemsBlock}

严格按 JSON 返回（无 markdown 围栏）：
{
  "items": [
    {
      "id": "<原 id>",
      "entities": [
        { "type": "person|company|product|event|location|other",
          "name": "...",
          "normalizedName": "...",
          "confidence": 0-100 }
      ]
    }
  ]
}`;
  }
}
