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
 * ★ v10.0 根因修复：v9 的"全类型倾向保留"导致大量装饰性新闻配图（文章头图、
 *   新闻缩略图、stock photo）通过审查，最终报告图片与内容无关。
 *   新原则：按图片类型分层审核 — chart/table/diagram 保持倾向保留，
 *   photo 类型要求图片本身包含可辨识的信息元素（数据、文字、产品细节、技术内容）。
 *   纯场景照、文章头图、新闻配图等装饰性照片予以拒绝。
 *
 * ★ v11.0 根因修复：v10 大面积 "Invalid response structure" 错误。
 *   根因：8 维度并发 Vision API 调用触发内部 rate limiter → chatStructured
 *   收到 isError=true 后立即重试（不等待）→ 再次被限流 → 返回空对象 {} as T。
 *   修复：(1) chatStructured 检测 rate limit 错误并 await retryAfter 后重试；
 *   (2) evaluateBatch 改 throwOnParseError=true + maxRetries=2，
 *   所有失败直接走 filterRelevantFigures 的 type-based fallback。
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

/** ★ v10: 信息性图片类型（fallback 时仅保留这些类型，photo 需要 Vision LLM 验证） */
const INFORMATIONAL_FIGURE_TYPES = new Set(["chart", "table", "diagram"]);

/**
 * ★ v12: Vision API 不可达的 CDN 域名黑名单
 * 这些域名要求登录或使用签名鉴权，Vision LLM 下载时会超时或 403，导致整 batch 失败。
 */
const VISION_INCOMPATIBLE_DOMAINS: RegExp[] = [
  /fbcdn\.net/i,
  /scontent.*\.xx\./i,
  /cdninstagram\.com/i,
  /media\.licdn\.com/i,
  /pinimg\.com/i,
  /tiktokcdn\.com/i,
];

function isVisionCompatibleUrl(url: string): boolean {
  return !VISION_INCOMPATIBLE_DOMAINS.some((re) => re.test(url));
}

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
      // ★ v10: 无 Vision 模型时，仅保留 chart/table/diagram 类型（photo 类无法验证信息价值）
      const filtered = figures.filter((f) =>
        INFORMATIONAL_FIGURE_TYPES.has(f.type),
      );
      this.logger.warn(
        `[filterRelevantFigures] No MULTIMODAL model configured, ` +
          `keeping ${filtered.length}/${figures.length} informational figures (v10 type-based fallback)`,
      );
      return filtered;
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

        // ★ v10: LLM 遗漏的 index → chart/table/diagram 保留，photo 拒绝
        const missingCount = batch.length - seenIndices.size;
        if (missingCount > 0) {
          const missingIndices = Array.from(
            { length: batch.length },
            (_, i) => i,
          ).filter((i) => !seenIndices.has(i));
          let keptCount = 0;
          for (const idx of missingIndices) {
            if (INFORMATIONAL_FIGURE_TYPES.has(batch[idx].type)) {
              allAccepted.push(batch[idx]);
              keptCount++;
            } else {
              allRejected.push(
                `[${batchStart + idx}] ${batch[idx].imageUrl.substring(0, 60)}... → LLM omitted, photo type rejected`,
              );
            }
          }
          this.logger.warn(
            `[filterRelevantFigures] Batch ${batchStart / MAX_FIGURES_PER_BATCH + 1}: LLM omitted ${missingCount} indices, kept ${keptCount} informational types (v10)`,
          );
        }
      } catch (error) {
        // ★ v10: 单批失败 → 仅保留 chart/table/diagram 类型（photo 无法验证信息价值）
        const safeBatch = batch.filter((f) =>
          INFORMATIONAL_FIGURE_TYPES.has(f.type),
        );
        this.logger.warn(
          `[filterRelevantFigures] Batch ${batchStart / MAX_FIGURES_PER_BATCH + 1} Vision check failed, ` +
            `keeping ${safeBatch.length}/${batch.length} informational figures (v10 type-based fallback): ` +
            `${error instanceof Error ? error.message : error}`,
        );
        allAccepted.push(...safeBatch);
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
    // ★ v12: 预过滤已知 Vision API 不可达的 CDN 域名，避免下载超时导致整 batch 失败
    const compatibleFigures = figures.filter((fig) =>
      isVisionCompatibleUrl(fig.imageUrl),
    );
    if (compatibleFigures.length < figures.length) {
      this.logger.debug(
        `[evaluateBatch] Skipped ${figures.length - compatibleFigures.length} incompatible CDN URLs`,
      );
    }
    if (compatibleFigures.length === 0) {
      // 全部不兼容，跳过 Vision 调用，返回空结果
      return { results: [] };
    }

    // 构建多模态 contentParts：交替 text + image
    const contentParts: ContentPart[] = [];

    // 开头说明 — ★ v10: 按图片类型分层审核
    contentParts.push({
      type: "text",
      text: [
        `请审查以下 ${compatibleFigures.length} 张候选图片是否适合用于研究报告「${topicTitle}」。`,
        "",
        "★ 核心原则：按类型分层审核。图表类（chart/table/diagram）倾向保留；照片类（photo）需要包含具体信息元素才保留。",
        "",
        "## 一、对所有类型都拒绝的情况：",
        "1. **损坏/不可用**：图片损坏无法显示、纯色占位符、完全无法辨认的极度模糊图",
        "2. **明确垃圾**：纯广告横幅、网站 UI 元素（导航栏/按钮截图）、meme/表情包、tracking pixel",
        "3. **人物肖像/头像**：个人头像照、证件照式肖像、演讲者单人照",
        "4. **AI生成装饰图**：AI生成的抽象概念插画、科幻风装饰图、过度光滑的 stock photo 风格AI生成配图",
        "",
        "## 二、chart/table/diagram 类型 → 倾向保留：",
        "- 数据图表、趋势图、对比图、架构图、流程图 → 直接保留",
        "- 略有模糊但内容可辨识 → 保留",
        "- 不确定是否相关 → 保留",
        "",
        "## 三、photo 类型 → 需要信息价值才保留（这是关键判断）：",
        "photo 类图片必须满足以下至少一项才保留：",
        "- 图中包含**可读文字**（幻灯片、白板、标语、告示）",
        "- 图中包含**产品实物/硬件/设备**的细节展示",
        "- 图中包含**技术演示画面**（软件界面、代码运行、系统架构）",
        "- 图中是**带有信息标注的照片**（标注了数据、名称、结构的实景照）",
        "",
        "photo 类图片如果属于以下类型则拒绝：",
        "- **文章头图/封面图**：新闻网站文章顶部的装饰性大图（通常是建筑物、城市天际线、会议室等场景照）",
        "- **新闻缩略图**：新闻列表中的小配图，通常是记者会、签约仪式、领导人合影等泛场景照",
        "- **Stock photo**：专业摄影的通用场景（握手、会议桌、服务器机房外景等），没有包含具体的数据或技术细节",
        "- **纯场景/建筑照**：政府大楼、公司总部、会场外景等，没有包含图表、文字、产品等信息元素",
        "- **泛活动照片**：大型会议全景、签约仪式、颁奖典礼等，图中没有可辨识的信息内容",
        "",
        `关键问题：这张图片是否能为「${topicTitle}」的读者提供超越文字描述的信息增量？如果只是"配图"而非"信息图"，请拒绝。`,
      ].join("\n"),
    } satisfies TextContentPart);

    // 逐张图片（使用已过滤的 compatibleFigures）
    for (let i = 0; i < compatibleFigures.length; i++) {
      const fig = compatibleFigures[i];
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
    // ★ v11: throwOnParseError=true + maxRetries=2 — rate limit 时 chatStructured 会等待后重试
    try {
      const response =
        await this.chatFacade.chatStructured<FigureRelevanceBatchResult>({
          messages: [
            {
              role: "user",
              content: `审查 ${compatibleFigures.length} 张图片是否适合研究报告「${topicTitle}」`,
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
          throwOnParseError: true,
          maxRetries: 2,
        });

      // 验证结构
      if (!response.data?.results || !Array.isArray(response.data.results)) {
        throw new InternalServerErrorException(
          "Invalid response structure: missing results array",
        );
      }

      // ★ v12: 将 compatibleFigures 的索引映射回原始 figures 索引
      // 同时为被 CDN 黑名单过滤掉的图片生成拒绝条目
      const originalIndexOf = compatibleFigures.map((fig) =>
        figures.indexOf(fig),
      );
      const remappedResults = response.data.results.map((r) => ({
        ...r,
        index:
          r.index >= 0 && r.index < originalIndexOf.length
            ? originalIndexOf[r.index]
            : -1,
      }));

      // 为 CDN 黑名单过滤掉的图片补充 rejected 条目
      const compatibleSet = new Set(compatibleFigures);
      const incompatibleRejections = figures
        .map((fig, idx) => ({ fig, idx }))
        .filter(({ fig }) => !compatibleSet.has(fig))
        .map(({ idx }) => ({
          index: idx,
          accepted: false as const,
          reason: "incompatible CDN domain, Vision API cannot access",
        }));

      return {
        results: [...remappedResults, ...incompatibleRejections],
      };
    } catch (error) {
      // ★ v11: 所有失败向上抛出，让 filterRelevantFigures 走 type-based fallback
      this.logger.warn(
        `[evaluateBatch] Vision LLM call failed: ${error instanceof Error ? error.message : error}`,
      );
      throw error;
    }
  }
}
