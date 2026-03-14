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
 * ★ v9.0 根因修复：v8 的"宁缺毋滥"prompt 导致 Vision LLM 过度保守，
 *   8 个维度 393 条证据仅存活 3 张图片。根因：4 项审查"任一不通过即拒绝" +
 *   "如果不确定请拒绝" 双重保守指令 → 大量有价值图片被杀。
 *   新原则："只拒绝明确不合格的图片" — 倾向保留，让后续 Leader 分配环节做相关性筛选。
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
      // ★ v9: 无 Vision 模型时，保留全部图片（上游已做基本质量关卡）
      // ExtractedFigure.type 仅有 chart/table/diagram/photo 4 种，全部属于有效类型
      this.logger.warn(
        `[filterRelevantFigures] No MULTIMODAL model configured, ` +
          `keeping all ${figures.length} figures (v9 倾向保留)`,
      );
      return figures;
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

        // ★ v9: LLM 遗漏的 index → 视为接受（倾向保留原则）
        const missingCount = batch.length - seenIndices.size;
        if (missingCount > 0) {
          const missingIndices = Array.from(
            { length: batch.length },
            (_, i) => i,
          ).filter((i) => !seenIndices.has(i));
          for (const idx of missingIndices) {
            allAccepted.push(batch[idx]);
          }
          this.logger.warn(
            `[filterRelevantFigures] Batch ${batchStart / MAX_FIGURES_PER_BATCH + 1}: LLM omitted ${missingCount} indices (${missingIndices.join(",")}), treating as accepted (v9 倾向保留)`,
          );
        }
      } catch (error) {
        // ★ v9: 单批失败 → 保留全部图片（上游已做基本质量关卡）
        this.logger.warn(
          `[filterRelevantFigures] Batch ${batchStart / MAX_FIGURES_PER_BATCH + 1} Vision check failed, ` +
            `keeping all ${batch.length} figures (v9 倾向保留): ` +
            `${error instanceof Error ? error.message : error}`,
        );
        allAccepted.push(...batch);
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

    // 开头说明 — ★ v9: 倾向保留，只拒绝明确不合格的图片
    contentParts.push({
      type: "text",
      text: [
        `请审查以下 ${figures.length} 张候选图片是否适合用于研究报告「${topicTitle}」。`,
        "",
        "★ 核心原则：倾向保留 — 只拒绝明确不合格的图片。有信息价值就保留，让后续环节做精选。",
        "",
        "仅在以下情况拒绝图片（必须明确命中才拒绝）：",
        "1. **损坏/不可用**：图片损坏无法显示、纯色占位符、完全无法辨认的极度模糊图",
        "2. **明确无关**：图片内容与研究主题「" +
          topicTitle +
          "」完全无关（如一篇AI文章配了一张美食照片）。注意：只要与主题领域沾边就应保留",
        "3. **明确垃圾**：纯广告横幅、网站 UI 元素（导航栏/按钮截图）、meme/表情包、tracking pixel",
        "",
        "以下类型应当保留：",
        "- 数据图表、趋势图、对比图、架构图（高价值）",
        "- 产品截图、技术演示图、新闻配图（中价值）",
        "- 与主题相关的活动照片、人物照片（可接受）",
        "- 略有模糊但内容可辨识的图片（可接受）",
        "",
        "★ 如果不确定，请保留。后续环节会进一步筛选。",
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
      // ★ v9: 结构验证失败 → 向上抛出，让 filterRelevantFigures 走 fallback 保留全部
      // API/网络错误 → 同样向上抛出
      this.logger.warn(
        `[evaluateBatch] Vision LLM call failed: ${error instanceof Error ? error.message : error}`,
      );
      throw error;
    }
  }
}
