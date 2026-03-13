import { isValidFigureUrl } from "../../utils/sanitize-image-url.utils";
import type {
  EvidenceData,
  EnrichedEvidenceData,
} from "../../types/research.types";

const MAX_EVIDENCE_ITEMS = 10;
const MAX_FIGURES_FOR_LEADER = 20;

const FIGURE_ALLOCATION_GUIDANCE = `【重要】图表分配原则（充分利用，每章必配）：
1. 每个章节分配 2-4 张与章节主题相关的图表，确保报告图文并茂
2. 优先选择数据图表、趋势图、对比图，也接受产品截图、架构图、新闻配图等有信息价值的图片
3. 仅排除明显无关的图片（如纯广告图、网站装饰图）
4. 当有多张可选图表时，优先分配信息量大、与论述互补的图表
5. 每个章节至少分配 1 张图表 — 无图章节会显著降低报告可读性
6. figureId 必须从下方图片资源列表中选择（如 FIG-1、FIG-2），禁止编造 figureId`;

/**
 * 图表注册表条目
 * 保存每个图表的唯一 ID 和原始元数据，用于系统回填而非 LLM 输出
 */
export interface FigureRegistryEntry {
  figureId: string;
  imageUrl: string;
  caption: string;
  type: string;
  alt?: string;
  /** 原始证据索引 (1-based)，用于最终报告的引用标注 [N] */
  evidenceIndex: number;
  /** 原始 figure 在 extractedFigures 数组中的位置 */
  figureIndex: number;
  /** 证据标题，用于 source 文本 */
  evidenceTitle: string;
  /** 证据域名 */
  evidenceDomain?: string;
}

/**
 * 创建证据摘要（取前 10 条的标题列表）
 * 统一实现，替代 dimension-mission 和 dimension-search 中的两份副本
 */
export function createEvidenceSummary(evidenceData: EvidenceData[]): string {
  const summary = evidenceData
    .slice(0, MAX_EVIDENCE_ITEMS)
    .map(
      (e, i) =>
        `${i + 1}. [${e.sourceType || "web"}] ${e.title} (${e.domain || "未知来源"})`,
    )
    .join("\n");

  return `共收集到 ${evidenceData.length} 条证据，摘要如下：\n${summary}\n${evidenceData.length > MAX_EVIDENCE_ITEMS ? `...还有 ${evidenceData.length - MAX_EVIDENCE_ITEMS} 条` : ""}`;
}

/**
 * 构建图表摘要（用于 Leader 规划时分配图表）
 * 统一实现，替代 dimension-mission 和 dimension-search 中的两份副本
 *
 * 返回摘要字符串和图表注册表 Map。注册表以 figureId 为 key，保存图表的完整元数据。
 * LLM 在分配图表时只需输出 figureId，系统通过注册表回填 imageUrl 等字段。
 *
 * @param includeGuidance - 是否包含分配指引（dimension-mission 需要，dimension-search 不需要）
 */
export function buildFiguresSummary(
  evidenceData: EnrichedEvidenceData[],
  includeGuidance = true,
): { summary: string; figureRegistry: Map<string, FigureRegistryEntry> } {
  const entries: string[] = [];
  const figureRegistry = new Map<string, FigureRegistryEntry>();
  // ★ 按 imageUrl 去重：同一张图可能被多个证据引用，只保留首次出现
  // 避免 LLM 以为是不同图表而分配给不同 section，导致 validateAllocatedFigures 全部拒绝
  const seenUrls = new Set<string>();
  for (let i = 0; i < evidenceData.length; i++) {
    const evidence = evidenceData[i];
    if (evidence.extractedFigures && evidence.extractedFigures.length > 0) {
      for (let j = 0; j < evidence.extractedFigures.length; j++) {
        const fig = evidence.extractedFigures[j];
        const rawUrl = fig.imageUrl || "";
        // ★ 跳过无效 URL（base64、placeholder、PDF 等）— 不应呈现给 LLM
        if (!isValidFigureUrl(rawUrl)) {
          continue;
        }
        // 跳过已见过的 imageUrl（去重）
        if (seenUrls.has(rawUrl)) {
          continue;
        }
        seenUrls.add(rawUrl);
        // 生成唯一 figureId（基于全局递增序号）
        const figureId = `FIG-${entries.length + 1}`;
        entries.push(
          `图表 ${figureId}: ${fig.type} - "${fig.caption || fig.alt || "无标题"}" (来源: 证据[${i + 1}] ${evidence.title}) (URL: ${rawUrl})`,
        );
        figureRegistry.set(figureId, {
          figureId,
          imageUrl: rawUrl,
          caption: fig.caption || fig.alt || "",
          type: fig.type,
          alt: fig.alt,
          evidenceIndex: i + 1,
          figureIndex: j,
          evidenceTitle: evidence.title || "",
          evidenceDomain: evidence.domain || undefined,
        });
      }
    }
  }
  if (entries.length === 0) {
    return { summary: "", figureRegistry };
  }
  const displayEntries = entries.slice(0, MAX_FIGURES_FOR_LEADER);
  const suffix =
    entries.length > MAX_FIGURES_FOR_LEADER
      ? `\n...还有 ${entries.length - MAX_FIGURES_FOR_LEADER} 个图表未列出`
      : "";
  const prefix = includeGuidance ? `${FIGURE_ALLOCATION_GUIDANCE}\n\n` : "";
  const summary = `${prefix}共 ${entries.length} 个可用图表（展示前 ${displayEntries.length} 个）：\n${displayEntries.join("\n")}${suffix}`;
  return { summary, figureRegistry };
}
