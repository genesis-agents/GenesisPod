import { isValidFigureUrl } from "../../utils/sanitize-image-url.utils";
import type {
  EvidenceData,
  EnrichedEvidenceData,
} from "../../types/research.types";

const MAX_EVIDENCE_ITEMS = 10;
const MAX_FIGURES_FOR_LEADER = 20;

const FIGURE_ALLOCATION_GUIDANCE = `【重要】图表分配原则（质量第一，合理数量）：
1. 每个章节分配 1-3 张与章节主题直接相关的高质量图表
2. 优先选择数据图表、趋势图、对比图等能增强论述的图表
3. 禁止将明显无关的图片（如产品 Logo、人物头像、广告图）分配给技术分析章节
4. 没有高度相关的图表时，宁可不分配也不要凑数 — 质量永远优先于数量`;

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
 * @param includeGuidance - 是否包含分配指引（dimension-mission 需要，dimension-search 不需要）
 */
export function buildFiguresSummary(
  evidenceData: EnrichedEvidenceData[],
  includeGuidance = true,
): string {
  const entries: string[] = [];
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
        entries.push(
          `图表 [${i + 1}:${j}] - ${fig.type} - "${fig.caption || fig.alt || "无标题"}" (来源: 证据[${i + 1}] ${evidence.title}) URL: ${rawUrl}`,
        );
      }
    }
  }
  if (entries.length === 0) {
    return "";
  }
  const displayEntries = entries.slice(0, MAX_FIGURES_FOR_LEADER);
  const suffix =
    entries.length > MAX_FIGURES_FOR_LEADER
      ? `\n...还有 ${entries.length - MAX_FIGURES_FOR_LEADER} 个图表未列出`
      : "";
  const prefix = includeGuidance ? `${FIGURE_ALLOCATION_GUIDANCE}\n\n` : "";
  return `${prefix}共 ${entries.length} 个可用图表（展示前 ${displayEntries.length} 个）：\n${displayEntries.join("\n")}${suffix}`;
}
