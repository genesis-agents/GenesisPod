/**
 * Figure Relevance Service
 *
 * ★ v17.0 彻底替换 Vision LLM → Embedding 方案
 *
 * 问题根因（Vision 方案）：
 * - 每张图 8s fetch + 30s Vision LLM = 最坏 38s；80 张图约 50 分钟
 * - CDN 封锁（中国 CDN / 签名 CDN）导致 Vision 无法访问图片 URL
 * - Rate limit / 超时连锁（8 维度并发 × 多 batch × 3 次重试）
 * - Vision 过保守（v9）或过宽（v10）：难以调优
 *
 * 新方案（Embedding）：
 * ① type = chart/table/diagram → 直接保留（0 次 API 调用）
 * ② type = photo, caption.trim().length < 10 → 直接拒绝（无有效描述）
 * ③ type = photo, caption 有效 → cosine(embed(caption), embed(topicTitle)) >= 0.35 → 保留
 * ④ Embedding 失败 → type-based fallback（chart 保留，photo caption >= 10 字符保留）
 *
 * 性能提升：80 张图 ~50 分钟 → ~1 分钟（embedding 批量并发，无图片下载）
 * 多语言支持：text-embedding-3-small 跨语言语义对齐（中英文 caption vs 英文 topicTitle）
 */

import { Injectable, Logger } from "@nestjs/common";
import { AIEngineFacade } from "@/modules/ai-harness/facade";
import type { ExtractedFigure } from "../../types/research.types";

/** 信息性图片类型：chart/table/diagram 直接保留，无需 Embedding 判断 */
const INFORMATIONAL_FIGURE_TYPES = new Set(["chart", "table", "diagram"]);

/** Stage 2 全局相关性阈值：photo caption 与研究主题的 cosine 相似度下限 */
const STAGE2_COSINE_THRESHOLD = 0.35;

/** photo 有效 caption 最小长度（< 10 字符视为无描述，直接拒绝） */
const MIN_CAPTION_LENGTH = 10;

/** Cosine 相似度计算 */
function cosine(a: number[], b: number[]): number {
  let dot = 0,
    magA = 0,
    magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return magA === 0 || magB === 0
    ? 0
    : dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

@Injectable()
export class FigureRelevanceService {
  private readonly logger = new Logger(FigureRelevanceService.name);

  constructor(private readonly engineFacade: AIEngineFacade) {}

  /**
   * 对候选图片列表进行 Embedding 相关性过滤（替代原 Vision LLM 方案）
   *
   * @param figures - 经过 validateAndUpgradeFigures 后的候选图片
   * @param topicTitle - 研究主题标题（用于语义相似度对比）
   * @returns 通过审查的图片子集
   */
  async filterRelevantFigures(
    figures: ExtractedFigure[],
    topicTitle: string,
  ): Promise<ExtractedFigure[]> {
    if (figures.length === 0) return [];

    // topicTitle embedding：懒计算 Promise 缓存，整个调用只算一次
    let topicEmbeddingPromise: Promise<number[] | null> | null = null;
    const getTopicEmbedding = (): Promise<number[] | null> => {
      if (topicEmbeddingPromise === null) {
        topicEmbeddingPromise = this.engineFacade
          .embeddingGenerate(topicTitle)
          .then((r) => r?.embedding ?? null)
          .catch(() => null);
      }
      return topicEmbeddingPromise;
    };

    const evalResults = await Promise.all(
      figures.map(async (fig, idx) => {
        try {
          const accepted = await this.evaluateSingleByEmbedding(
            fig,
            getTopicEmbedding,
          );
          return { fig, accepted };
        } catch (error) {
          // Embedding 失败 → type-based fallback
          const accepted = this.typeBasedFallback(fig);
          this.logger.warn(
            `[filterRelevantFigures] [${idx}] ${fig.imageUrl.substring(0, 60)}... ` +
              `embedding failed, fallback=${accepted}: ` +
              `${error instanceof Error ? error.message : String(error)}`,
          );
          return { fig, accepted };
        }
      }),
    );

    const allAccepted = evalResults.filter((r) => r.accepted).map((r) => r.fig);
    const rejected = evalResults.filter((r) => !r.accepted);

    if (rejected.length > 0) {
      this.logger.log(
        `[filterRelevantFigures] Rejected ${rejected.length}/${figures.length} figures for "${topicTitle}":\n` +
          rejected
            .map(
              (r) =>
                `  ${r.fig.type} | caption="${(r.fig.caption ?? "").substring(0, 60)}" | ${r.fig.imageUrl.substring(0, 60)}...`,
            )
            .join("\n"),
      );
    }

    this.logger.log(
      `[filterRelevantFigures] Accepted ${allAccepted.length}/${figures.length} figures for "${topicTitle}" (embedding v17)`,
    );

    return allAccepted;
  }

  /**
   * 单张图片 Embedding 评估
   *
   * ① chart/table/diagram → 直接保留
   * ② photo, caption < 10 chars → 直接拒绝
   * ③ photo, valid caption → cosine(caption, topicTitle) >= 0.35 → 保留
   * ④ Embedding 失败 → typeBasedFallback（抛出错误由上层处理）
   */
  private async evaluateSingleByEmbedding(
    fig: ExtractedFigure,
    getTopicEmbedding: () => Promise<number[] | null>,
  ): Promise<boolean> {
    // ① 信息性图表类型：直接保留，无需语义判断
    if (INFORMATIONAL_FIGURE_TYPES.has(fig.type)) {
      return true;
    }

    // ② photo：无有效 caption → 直接拒绝
    const caption = (fig.caption ?? fig.alt ?? "").trim();
    if (caption.length < MIN_CAPTION_LENGTH) {
      this.logger.debug(
        `[evaluateSingleByEmbedding] Rejected (no caption): ${fig.imageUrl.substring(0, 80)}`,
      );
      return false;
    }

    // ③ photo：有效 caption → Embedding 语义相似度判断
    const [topicEmb, captionResult] = await Promise.all([
      getTopicEmbedding(),
      this.engineFacade.embeddingGenerate(caption.substring(0, 300)),
    ]);

    const captionEmb = captionResult?.embedding;
    if (!topicEmb?.length || !captionEmb?.length) {
      // Embedding API 不可用或返回空向量 → fail-open（caption 已 >= 10 chars，保留）
      this.logger.warn(
        `[evaluateSingleByEmbedding] Embedding unavailable, fail-open for: ${fig.imageUrl.substring(0, 80)}`,
      );
      return true;
    }

    const similarity = cosine(topicEmb, captionEmb);
    const accepted = similarity >= STAGE2_COSINE_THRESHOLD;

    if (!accepted) {
      this.logger.debug(
        `[evaluateSingleByEmbedding] Rejected (cosine=${similarity.toFixed(3)} < ${STAGE2_COSINE_THRESHOLD}): ` +
          `caption="${caption.substring(0, 60)}" | ${fig.imageUrl.substring(0, 60)}`,
      );
    }

    return accepted;
  }

  /**
   * Embedding 失败时的 type-based fallback（B2 修复：photo 需要 caption >= 10 chars）
   */
  private typeBasedFallback(fig: ExtractedFigure): boolean {
    if (INFORMATIONAL_FIGURE_TYPES.has(fig.type)) return true;
    if (fig.type === "photo") {
      const caption = (fig.caption ?? fig.alt ?? "").trim();
      return caption.length >= MIN_CAPTION_LENGTH;
    }
    return false;
  }
}
