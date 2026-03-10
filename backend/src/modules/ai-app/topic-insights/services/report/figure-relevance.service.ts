/**
 * Figure Relevance Service
 *
 * 使用多模态 LLM（Vision）对候选图片进行内容审查：
 * 1. 图片是否可辨识（非损坏、非纯色占位符）
 * 2. 图片类型是否为有价值的信息图（chart/diagram/table vs 装饰性 photo/banner）
 * 3. 图片内容是否与研究主题相关
 *
 * 原则："宁缺毋滥" — 不确定的图片一律过滤
 *
 * ★ 通过 ChatFacade（AI Engine Facade）调用 Vision LLM，不直接调用 API。
 */

import { Injectable, Logger } from "@nestjs/common";
import { AIModelType } from "@prisma/client";
import { ChatFacade } from "@/modules/ai-engine/facade";
import type {
  ContentPart,
  TextContentPart,
  ImageUrlContentPart,
} from "@/modules/ai-engine/facade";
import type { ExtractedFigure } from "../../types/research.types";

/** 批量审查的返回结构 */
interface FigureRelevanceBatchResult {
  results: Array<{
    index: number;
    accepted: boolean;
    reason?: string;
  }>;
}

/** 批量审查的最大图片数（控制 token 消耗） */
const MAX_FIGURES_PER_BATCH = 8;

@Injectable()
export class FigureRelevanceService {
  private readonly logger = new Logger(FigureRelevanceService.name);

  constructor(private readonly chatFacade: ChatFacade) {}

  /**
   * 对候选图片列表进行多模态 LLM 相关性审查
   *
   * @param figures - 经过 validateAndUpgradeFigures 后的候选图片
   * @param topicTitle - 研究主题标题（用于判断相关性）
   * @returns 通过审查的图片子集
   */
  async filterRelevantFigures(
    figures: ExtractedFigure[],
    topicTitle: string,
  ): Promise<ExtractedFigure[]> {
    if (figures.length === 0) return [];

    // 限制批量大小，避免 token 爆炸
    const candidates = figures.slice(0, MAX_FIGURES_PER_BATCH);

    try {
      const batchResult = await this.evaluateBatch(candidates, topicTitle);

      const accepted: ExtractedFigure[] = [];
      const rejected: string[] = [];
      const seenIndices = new Set<number>();

      for (const result of batchResult.results) {
        if (result.index < 0 || result.index >= candidates.length) continue;
        // ★ 去重：LLM 可能返回重复 index
        if (seenIndices.has(result.index)) continue;
        seenIndices.add(result.index);

        if (result.accepted) {
          accepted.push(candidates[result.index]);
        } else {
          rejected.push(
            `[${result.index}] ${candidates[result.index].imageUrl.substring(0, 60)}... → ${result.reason}`,
          );
        }
      }

      // ★ 检测 LLM 遗漏的 index（宁缺毋滥 → 遗漏视为拒绝）
      const missingCount = candidates.length - seenIndices.size;
      if (missingCount > 0) {
        const missingIndices = Array.from(
          { length: candidates.length },
          (_, i) => i,
        ).filter((i) => !seenIndices.has(i));
        this.logger.warn(
          `[filterRelevantFigures] LLM omitted ${missingCount} indices (${missingIndices.join(",")}), treating as rejected`,
        );
      }

      if (rejected.length > 0) {
        this.logger.log(
          `[filterRelevantFigures] Rejected ${rejected.length + missingCount}/${candidates.length} figures for "${topicTitle}":\n${rejected.join("\n")}`,
        );
      }

      // 如果超出批次的图片，不做审查直接丢弃（宁缺毋滥）
      return accepted;
    } catch (error) {
      // Vision 调用失败时，回退到保守策略：只保留 chart/diagram/table 类型
      this.logger.warn(
        `[filterRelevantFigures] Vision check failed, falling back to type-based filter: ${error instanceof Error ? error.message : error}`,
      );
      return figures.filter((f) => f.type !== "photo");
    }
  }

  /**
   * 批量评估图片：构造多模态消息发送给 Vision LLM
   */
  private async evaluateBatch(
    figures: ExtractedFigure[],
    topicTitle: string,
  ): Promise<FigureRelevanceBatchResult> {
    // 构建多模态 contentParts：交替 text + image
    const contentParts: ContentPart[] = [];

    // 开头说明
    contentParts.push({
      type: "text",
      text: `请审查以下 ${figures.length} 张候选图片是否适合用于研究报告「${topicTitle}」。\n\n对每张图片判断：\n1. 图片是否可辨识（非损坏、非纯色、非占位符、非广告）\n2. 图片类型是否为信息图（chart/diagram/table/infographic），而非装饰性照片\n3. 图片内容是否与研究主题相关\n\n原则：宁缺毋滥，不确定的一律拒绝。\n`,
    } satisfies TextContentPart);

    // 逐张图片
    for (let i = 0; i < figures.length; i++) {
      const fig = figures[i];
      contentParts.push({
        type: "text",
        text: `\n--- 图片 ${i} ---\nCaption: ${fig.caption || "(无)"}\nType hint: ${fig.type}\nAlt: ${fig.alt || "(无)"}`,
      } satisfies TextContentPart);

      contentParts.push({
        type: "image_url",
        image_url: { url: fig.imageUrl, detail: "low" },
      } satisfies ImageUrlContentPart);
    }

    // 要求 JSON 输出
    contentParts.push({
      type: "text",
      text: `\n请以 JSON 格式返回审查结果，格式为：
{
  "results": [
    { "index": 0, "accepted": true },
    { "index": 1, "accepted": false, "reason": "装饰性照片，与主题无关" }
  ]
}
仅返回 JSON，不要其他文字。`,
    } satisfies TextContentPart);

    // ★ 通过 ChatFacade.chatStructured 调用 Vision LLM（内置 JSON 提取 + 重试）
    try {
      const response =
        await this.chatFacade.chatStructured<FigureRelevanceBatchResult>({
          messages: [
            {
              role: "user",
              content: `审查 ${figures.length} 张图片是否适合研究报告「${topicTitle}」`,
              contentParts,
            },
          ],
          modelType: AIModelType.CHAT,
          taskProfile: {
            creativity: "deterministic",
            outputLength: "short",
          },
          schema: {
            type: "object",
            required: ["results"],
            properties: {
              results: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    index: { type: "number" },
                    accepted: { type: "boolean" },
                    reason: { type: "string" },
                  },
                },
              },
            },
          },
          strictMode: true,
          throwOnParseError: false,
          maxRetries: 1,
        });

      // 验证结构
      if (!response.data?.results || !Array.isArray(response.data.results)) {
        throw new Error("Invalid response structure: missing results array");
      }

      return response.data;
    } catch (error) {
      // 结构验证失败（chatStructured 成功但返回格式不对）→ 宁缺毋滥，全部拒绝
      // API/网络错误 → 向上抛出，让 filterRelevantFigures 走 type-based fallback
      if (
        error instanceof Error &&
        error.message.startsWith("Invalid response structure")
      ) {
        this.logger.warn(
          `[evaluateBatch] Vision LLM response validation failed: ${error.message}`,
        );
        return {
          results: figures.map((_, i) => ({
            index: i,
            accepted: false,
            reason: "Vision LLM 响应结构无效",
          })),
        };
      }
      throw error;
    }
  }
}
