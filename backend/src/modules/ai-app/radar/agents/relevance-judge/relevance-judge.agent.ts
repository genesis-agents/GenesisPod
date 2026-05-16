import { Injectable, Logger } from "@nestjs/common";
import { AIModelType } from "@prisma/client";
import { AiChatService } from "@/modules/ai-engine/facade";
import { chunk, clampScore, truncate, tryParseJson } from "../agent-utils";

export interface RelevanceJudgeInputItem {
  id: string;
  title: string | null;
  content: string | null;
  url: string | null;
  source: string;
}

export interface RelevanceJudgeTopicCtx {
  name: string;
  description?: string | null;
  keywords: string[];
  entityType?: string | null;
}

export interface RelevanceScored {
  id: string;
  relevanceScore: number;
  reason: string;
}

const BATCH_SIZE = 10;
const SYSTEM_PROMPT = `你是 AI 雷达的"相关性裁判"。

任务：给定一个监控主题（名称 + 关键词 + 实体类型），以及一批候选信息条目，
为每个条目打一个 0-100 的"主题相关性分"，并给出一句话理由。

打分锚点：
  90-100  : 直接报道主题对象 / 含核心实体 / 主题方关键决策
  70-89   : 强相关，主题对象在主体内容，但只是其中一个角度
  50-69   : 部分提及主题，是辅助信息（如行业里其他主体被主题对象影响）
  20-49   : 弱相关，主题词出现但与正文论点偏离
  0-19    : 不相关 / 噪声 / 标题党

只看条目本身判断相关性，不引入你对主题的额外知识。

红线：
  - 严格按 JSON schema 输出，不写任何额外文字
  - reason 单行，≤60 字
  - 不知道时输出 score=30 reason="信息不足无法判断"`;

@Injectable()
export class RelevanceJudgeAgent {
  private readonly log = new Logger(RelevanceJudgeAgent.name);

  constructor(private readonly chat: AiChatService) {}

  /**
   * 批量打分（10 个一批，并行 batch 之间串行）。
   */
  async scoreBatch(
    topic: RelevanceJudgeTopicCtx,
    items: RelevanceJudgeInputItem[],
    opts: { userId?: string } = {},
  ): Promise<RelevanceScored[]> {
    if (items.length === 0) return [];
    const batches = chunk(items, BATCH_SIZE);
    const out: RelevanceScored[] = [];
    for (const batch of batches) {
      const scored = await this.scoreOneBatch(topic, batch, opts.userId);
      out.push(...scored);
    }
    return out;
  }

  private async scoreOneBatch(
    topic: RelevanceJudgeTopicCtx,
    batch: RelevanceJudgeInputItem[],
    userId?: string,
  ): Promise<RelevanceScored[]> {
    const userPrompt = this.buildUserPrompt(topic, batch);
    try {
      const result = await this.chat.chat({
        systemPrompt: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
        modelType: AIModelType.CHAT_FAST,
        taskProfile: {
          creativity: "deterministic",
          outputLength: "minimal",
        },
        userId,
        operationName: "radar.relevance-judge",
        skipGuardrails: true,
      });
      const parsed = tryParseJson<{ items: RelevanceScored[] }>(result.content);
      if (!parsed || !Array.isArray(parsed.items)) {
        this.log.warn(
          `Relevance judge returned non-parseable output, falling back to neutral 30`,
        );
        return batch.map((i) => ({
          id: i.id,
          relevanceScore: 30,
          reason: "LLM 解析失败兜底",
        }));
      }
      // 按 id 对齐 + clamp
      const byId = new Map(parsed.items.map((x) => [x.id, x]));
      return batch.map((i) => {
        const entry = byId.get(i.id);
        if (!entry) {
          return { id: i.id, relevanceScore: 30, reason: "LLM 漏评分兜底" };
        }
        return {
          id: i.id,
          relevanceScore: clampScore(entry.relevanceScore, 30),
          reason:
            typeof entry.reason === "string" ? truncate(entry.reason, 60) : "",
        };
      });
    } catch (err) {
      this.log.error(
        `Relevance judge LLM call failed: ${(err as Error).message}`,
      );
      return batch.map((i) => ({
        id: i.id,
        relevanceScore: 30,
        reason: "LLM 调用失败兜底",
      }));
    }
  }

  private buildUserPrompt(
    topic: RelevanceJudgeTopicCtx,
    batch: RelevanceJudgeInputItem[],
  ): string {
    const topicLine = JSON.stringify({
      name: topic.name,
      description: truncate(topic.description ?? "", 400),
      keywords: topic.keywords,
      entityType: topic.entityType ?? null,
    });
    const itemsBlock = batch
      .map((i, idx) =>
        JSON.stringify({
          id: i.id,
          idx,
          source: i.source,
          title: truncate(i.title ?? "", 200),
          content: truncate(i.content ?? "", 600),
          url: i.url,
        }),
      )
      .join("\n");
    return `主题：${topicLine}

请为下列 ${batch.length} 个条目逐一打分。

候选条目（JSON Lines，每行一条）：
${itemsBlock}

请严格按以下 JSON schema 返回：
{
  "items": [
    { "id": "<原 id>", "relevanceScore": 0-100, "reason": "≤60 字" }
  ]
}`;
  }
}
