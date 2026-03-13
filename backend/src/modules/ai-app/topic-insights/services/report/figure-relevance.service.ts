/**
 * Figure Relevance Service
 *
 * 使用多模态 LLM（Vision）对候选图片进行内容审查：
 * 1. 图片是否可辨识（非损坏、非纯色占位符、非模糊不清）
 * 2. 图片是否与研究主题有直接信息关联（不仅是主题词匹配，需内容实质相关）
 * 3. 排除：纯装饰、横幅广告、stock photo、模糊/低质量、与主题无实质关联的配图
 *
 * ★ v6.0 根因修复：旧 prompt 要求"必须是信息图(chart/diagram/table)"，
 *   导致有价值的新闻照片、产品截图、技术演示图全被杀。
 *   新原则："有信息价值就保留" — photo 类型不再自动拒绝。
 *
 * ★ v8.0 强化：detail "low" → "auto"，增加模糊/质量检测指令，
 *   API 失败时仅保留 chart/diagram/table 类型（不再全部放行）。
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
      // ★ v8: 无 Vision 模型时，仅保留 chart/diagram/table（高置信度类型）
      // photo 类型在没有 Vision 审查的情况下风险太高
      const safeFigures = figures.filter(
        (fig) =>
          fig.type === "chart" ||
          fig.type === "diagram" ||
          fig.type === "table",
      );
      this.logger.warn(
        `[filterRelevantFigures] No MULTIMODAL model configured, ` +
          `type-based fallback: keeping ${safeFigures.length}/${figures.length} (chart/diagram/table only)`,
      );
      return safeFigures;
    }

    // ★ v7: 上游 validateSingleFigure 已丢弃所有 data: URL，
    //   到达此处的全部是 HTTP/HTTPS URL，可直接发送给 Vision API。

    // ★ 分批处理所有候选图片，不再截断
    const allAccepted: ExtractedFigure[] = [];
    const allRejected: string[] = [];

    for (
      let batchStart = 0;
      batchStart < figures.length;
      batchStart += MAX_FIGURES_PER_BATCH
    ) {
      const batch = figures.slice(
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
        // ★ v8: 单批失败 → 仅保留 chart/diagram/table 类型（高置信度图片），photo 丢弃
        // 不再全部放行，避免低质量 photo 绕过质量关卡
        const safeFallback = batch.filter(
          (fig) =>
            fig.type === "chart" ||
            fig.type === "diagram" ||
            fig.type === "table",
        );
        this.logger.warn(
          `[filterRelevantFigures] Batch ${batchStart / MAX_FIGURES_PER_BATCH + 1} Vision check failed, ` +
            `keeping ${safeFallback.length}/${batch.length} (chart/diagram/table only): ` +
            `${error instanceof Error ? error.message : error}`,
        );
        allAccepted.push(...safeFallback);
      }
    }

    if (allRejected.length > 0) {
      this.logger.log(
        `[filterRelevantFigures] Rejected ${allRejected.length}/${figures.length} figures for "${topicTitle}":\n${allRejected.join("\n")}`,
      );
    }

    return allAccepted;
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

    // 开头说明 — ★ v8: 强化质量标准，增加模糊/低质量检测指令
    contentParts.push({
      type: "text",
      text: [
        `请严格审查以下 ${figures.length} 张候选图片是否适合用于研究报告「${topicTitle}」。`,
        "",
        "对每张图片判断以下 4 项（任一不通过即拒绝）：",
        "1. **可辨识性**：图片是否清晰可读？拒绝：损坏、纯色占位符、严重模糊/马赛克、文字无法辨认的低分辨率图",
        "2. **内容相关性**：图片内容是否与研究主题「" +
          topicTitle +
          "」有直接实质关联？仅主题词巧合不算相关。拒绝：虽含相关关键词但实际内容无关的配图（如一篇AI文章配了一张无关的城市风景照）",
        "3. **信息价值**：图片是否传递了对读者有用的信息？数据图表、趋势图、对比图、技术架构图、产品截图、关键人物照片 > 新闻配图 > 一般活动照片",
        "4. **专业性**：图片是否适合出现在专业研究报告中？拒绝：纯广告横幅、stock photo（明显摆拍的素材图）、社交媒体截图、meme/表情包、装饰性背景图、网站 UI 元素",
        "",
        "★ 宁缺毋滥 — 报告不配图好过配低质量图。如果不确定，请拒绝。",
      ].join("\n"),
    } satisfies TextContentPart);

    // 逐张图片
    for (let i = 0; i < figures.length; i++) {
      const fig = figures[i];
      contentParts.push({
        type: "text",
        text: `\n--- 图片 ${i} ---\nCaption: ${fig.caption || "(无)"}\nType hint: ${fig.type}\nAlt: ${fig.alt || "(无)"}`,
      } satisfies TextContentPart);

      // ★ v7: 所有 data: URL 已在上游丢弃，此处只有 HTTP/HTTPS URL
      // ★ v8: detail "low" → "auto" — 让模型根据图片大小选择分辨率，
      //   低分辨率下无法检测模糊和细节质量问题
      contentParts.push({
        type: "image_url",
        image_url: { url: fig.imageUrl, detail: "auto" },
      } satisfies ImageUrlContentPart);
    }

    // 要求 JSON 输出
    contentParts.push({
      type: "text",
      text: `\n请以 JSON 格式返回审查结果。对于拒绝的图片，reason 必须说明具体原因类别（模糊/低质量/无关/装饰/广告/stock photo）。格式：
{
  "results": [
    { "index": 0, "accepted": true },
    { "index": 1, "accepted": false, "reason": "模糊不清，文字无法辨认" },
    { "index": 2, "accepted": false, "reason": "stock photo，与主题无实质关联" }
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
