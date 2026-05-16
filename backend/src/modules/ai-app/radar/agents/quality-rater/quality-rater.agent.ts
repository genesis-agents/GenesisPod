import { Injectable, Logger } from "@nestjs/common";
import { AIModelType } from "@prisma/client";
import { AiChatService } from "@/modules/ai-engine/facade";
import { chunk, clampScore, truncate, tryParseJson } from "../agent-utils";

export interface QualityRaterInputItem {
  id: string;
  title: string | null;
  content: string | null;
  url: string | null;
  source: string;
  author: string | null;
}

export interface QualityRated {
  id: string;
  qualityScore: number;
  aiSummary: string;
}

const BATCH_SIZE = 10;
const SYSTEM_PROMPT = `你是 AI 雷达的"信息质量评分员 + 摘要员"。

任务：对每个条目同时输出：
  qualityScore (0-100) - 综合"信息密度 / 来源权威性 / 时效性 / 原创性"
  aiSummary           - 中文 ≤80 字摘要，提炼核心信息点

质量打分锚点：
  85-100 : 权威源 (公司官方 / 一线媒体) + 高信息密度 + 原创报道
  65-84  : 有信源支撑 + 信息密度中等
  40-64  : 二手转述或观点为主 / 信息密度偏低
  20-39  : 内容空洞 / 标题党 / 重复转发
  0-19   : 几乎无价值 / 广告 / 垃圾

摘要要求：
  - 中性陈述，不评价，不带主观情绪词
  - ≤80 字，单行，无引号包裹
  - 包含主要事实 + 关键数字（若有）

红线：
  - 严格按 JSON schema 输出
  - 缺字段 / 解析失败 → 该条目走兜底
  - 摘要不能为空`;

@Injectable()
export class QualityRaterAgent {
  private readonly log = new Logger(QualityRaterAgent.name);

  constructor(private readonly chat: AiChatService) {}

  async rateBatch(
    items: QualityRaterInputItem[],
    opts: { userId?: string } = {},
  ): Promise<QualityRated[]> {
    if (items.length === 0) return [];
    const batches = chunk(items, BATCH_SIZE);
    const out: QualityRated[] = [];
    for (const batch of batches) {
      const rated = await this.rateOneBatch(batch, opts.userId);
      out.push(...rated);
    }
    return out;
  }

  private async rateOneBatch(
    batch: QualityRaterInputItem[],
    userId?: string,
  ): Promise<QualityRated[]> {
    const userPrompt = this.buildUserPrompt(batch);
    try {
      const result = await this.chat.chat({
        systemPrompt: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
        modelType: AIModelType.CHAT_FAST,
        taskProfile: {
          creativity: "deterministic",
          outputLength: "short",
        },
        userId,
        operationName: "radar.quality-rater",
        skipGuardrails: true,
      });
      const parsed = tryParseJson<{ items: QualityRated[] }>(result.content);
      if (!parsed || !Array.isArray(parsed.items)) {
        return batch.map((i) => ({
          id: i.id,
          qualityScore: 40,
          aiSummary: truncate(i.title ?? "", 80) || "无摘要",
        }));
      }
      const byId = new Map(parsed.items.map((x) => [x.id, x]));
      return batch.map((i) => {
        const entry = byId.get(i.id);
        if (!entry) {
          return {
            id: i.id,
            qualityScore: 40,
            aiSummary: truncate(i.title ?? "", 80) || "无摘要",
          };
        }
        return {
          id: i.id,
          qualityScore: clampScore(entry.qualityScore, 40),
          aiSummary:
            typeof entry.aiSummary === "string" && entry.aiSummary.trim()
              ? truncate(entry.aiSummary.trim(), 80)
              : truncate(i.title ?? "", 80) || "无摘要",
        };
      });
    } catch (err) {
      this.log.error(`Quality rater LLM failed: ${(err as Error).message}`);
      return batch.map((i) => ({
        id: i.id,
        qualityScore: 40,
        aiSummary: truncate(i.title ?? "", 80) || "无摘要",
      }));
    }
  }

  private buildUserPrompt(batch: QualityRaterInputItem[]): string {
    const itemsBlock = batch
      .map((i) =>
        JSON.stringify({
          id: i.id,
          source: i.source,
          author: i.author,
          title: truncate(i.title ?? "", 200),
          content: truncate(i.content ?? "", 800),
          url: i.url,
        }),
      )
      .join("\n");
    return `请评估以下 ${batch.length} 个信息条目的质量并产出摘要：

${itemsBlock}

严格按 JSON 返回（不要 markdown 包裹）：
{
  "items": [
    { "id": "<原 id>", "qualityScore": 0-100, "aiSummary": "≤80 字" }
  ]
}`;
  }
}
