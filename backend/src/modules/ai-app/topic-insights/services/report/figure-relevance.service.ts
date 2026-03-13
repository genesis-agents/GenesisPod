/**
 * Figure Relevance Service
 *
 * 使用多模态 LLM（Vision）对候选图片进行内容审查：
 * 1. 图片是否可辨识（非损坏、非纯色占位符）
 * 2. 图片是否与研究主题有信息价值（不限于 chart/diagram，photo 也可以有价值）
 * 3. 排除纯装饰性图片（横幅广告、纯色背景、无意义 stock photo）
 *
 * ★ v6.0 根因修复：旧 prompt 要求"必须是信息图(chart/diagram/table)"，
 *   导致有价值的新闻照片、产品截图、技术演示图全被杀。
 *   新原则："有信息价值就保留" — photo 类型不再自动拒绝。
 *
 * ★ 通过 ChatFacade（AI Engine Facade）调用 Vision LLM，不直接调用 API。
 */

import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from "@nestjs/common";
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

    // ★ 前置检查：是否有可用的 MULTIMODAL 模型，没有则直接走 type-based fallback
    const multimodalModel = await this.chatFacade.getDefaultModelByType(
      AIModelType.MULTIMODAL,
    );
    if (!multimodalModel?.modelId) {
      this.logger.warn(
        `[filterRelevantFigures] No MULTIMODAL model configured, falling back to type-based filter`,
      );
      return figures;
    }

    // ★ 分离 base64 图片和 URL 图片：base64 无法发送给 Vision API
    const base64Figures: ExtractedFigure[] = [];
    const urlFigures: ExtractedFigure[] = [];
    for (const fig of figures) {
      if (fig.imageUrl?.startsWith("data:")) {
        base64Figures.push(fig);
      } else {
        urlFigures.push(fig);
      }
    }

    // base64 图片走 type-based 自动接受（已成功下载 = 有效图片）
    const base64Accepted = base64Figures.filter((f) => f.type !== "photo");
    if (base64Figures.length > 0) {
      this.logger.log(
        `[filterRelevantFigures] ${base64Accepted.length}/${base64Figures.length} base64 figures auto-accepted by type filter`,
      );
    }

    // URL 图片发送给 Vision LLM 审查
    if (urlFigures.length === 0) {
      return base64Accepted;
    }

    // ★ v6.0: 分批处理所有候选图片，不再截断
    // 旧逻辑 slice(0, 8) 直接丢弃第 9 张之后的图片
    const allAccepted: ExtractedFigure[] = [];
    const allRejected: string[] = [];

    for (
      let batchStart = 0;
      batchStart < urlFigures.length;
      batchStart += MAX_FIGURES_PER_BATCH
    ) {
      const batch = urlFigures.slice(
        batchStart,
        batchStart + MAX_FIGURES_PER_BATCH,
      );

      try {
        const batchResult = await this.evaluateBatch(batch, topicTitle);

        const seenIndices = new Set<number>();
        for (const result of batchResult.results) {
          if (result.index < 0 || result.index >= batch.length) continue;
          if (seenIndices.has(result.index)) continue;
          seenIndices.add(result.index);

          if (result.accepted) {
            allAccepted.push(batch[result.index]);
          } else {
            allRejected.push(
              `[${batchStart + result.index}] ${batch[result.index].imageUrl.substring(0, 60)}... → ${result.reason}`,
            );
          }
        }

        // LLM 遗漏的 index → 视为拒绝
        const missingCount = batch.length - seenIndices.size;
        if (missingCount > 0) {
          const missingIndices = Array.from(
            { length: batch.length },
            (_, i) => i,
          ).filter((i) => !seenIndices.has(i));
          this.logger.warn(
            `[filterRelevantFigures] Batch ${batchStart / MAX_FIGURES_PER_BATCH + 1}: LLM omitted ${missingCount} indices (${missingIndices.join(",")}), treating as rejected`,
          );
        }
      } catch (error) {
        // 单批失败 → 该批全部保留（不因 API 故障丢图）
        this.logger.warn(
          `[filterRelevantFigures] Batch ${batchStart / MAX_FIGURES_PER_BATCH + 1} Vision check failed, accepting all ${batch.length} figures: ${error instanceof Error ? error.message : error}`,
        );
        allAccepted.push(...batch);
      }
    }

    if (allRejected.length > 0) {
      this.logger.log(
        `[filterRelevantFigures] Rejected ${allRejected.length}/${urlFigures.length} URL figures for "${topicTitle}":\n${allRejected.join("\n")}`,
      );
    }

    return [...base64Accepted, ...allAccepted];
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
      text: `请审查以下 ${figures.length} 张候选图片是否适合用于研究报告章节「${topicTitle}」。\n\n对每张图片判断：\n1. 图片是否可辨识（非损坏、非纯色、非占位符）\n2. 图片内容是否与该章节主题直接相关（不仅是大主题相关，而是与具体章节内容匹配）\n3. 图片是否具有信息价值 — 数据图表、产品截图、新闻照片、技术示意图、活动现场等均可\n\n接受标准：图片内容与该章节主题直接相关且有信息价值。\n排除标准：纯广告横幅、装饰性背景图、与章节主题无关的图片。\n`,
    } satisfies TextContentPart);

    // 逐张图片
    for (let i = 0; i < figures.length; i++) {
      const fig = figures[i];
      contentParts.push({
        type: "text",
        text: `\n--- 图片 ${i} ---\nCaption: ${fig.caption || "(无)"}\nType hint: ${fig.type}\nAlt: ${fig.alt || "(无)"}`,
      } satisfies TextContentPart);

      if (fig.imageUrl.startsWith("data:")) {
        contentParts.push({
          type: "text",
          text: `[图片 ${i} 为 base64 内嵌数据，无法通过 Vision API 审查，已跳过]`,
        } satisfies TextContentPart);
      } else {
        contentParts.push({
          type: "image_url",
          image_url: { url: fig.imageUrl, detail: "low" },
        } satisfies ImageUrlContentPart);
      }
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
          modelType: AIModelType.MULTIMODAL,
          skipGuardrails: true, // 内部系统调用，图片审查
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
        throw new InternalServerErrorException(
          "Invalid response structure: missing results array",
        );
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
