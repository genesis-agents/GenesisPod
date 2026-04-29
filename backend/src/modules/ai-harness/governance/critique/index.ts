/**
 * ai-harness/governance/critique —— Reflexion 批评-改进闭环（沉淀自 topic-insights, 2026-04-29）
 *
 * 参考: Reflexion (Shinn et al., 2023) + Self-Consistency (Wang et al., 2022)
 *
 * 单一入口 CritiqueRefineService.run({ content, context, config }) →
 * 多轮 critique → refine → reach 收敛阈值或 maxIterations。
 *
 * TI 仍使用 ai-app/topic-insights/services/quality/critique-refine.service.ts。
 */

export { CritiqueRefineService } from "./critique-refine.service";
export type { CritiqueRefineRequest } from "./critique-refine.service";
// ★ 沉淀 v2: section-level 4 维自评（写中评估，~700 token）
export { SectionSelfEvalService } from "./section-self-eval.service";
// ★ 沉淀 v2: 内容缺陷扫描（纯函数 utility，0 LLM）
export {
  type ContentDefectScan,
  type DefectDetail,
  type DefectDetails,
  scanContentDefects,
  createEmptyScan,
  extractDefectDetails,
} from "./defect-scanner";
export {
  CritiqueCategory,
  CritiqueSeverity,
  type CritiqueItem,
  type CritiqueResult,
  type RefineResult,
  type CritiqueRefineIteration,
  type CritiqueRefineLoopResult,
  type CritiqueRefineConfig,
  type SelfEvalDimension,
  type SectionSelfEvalResult,
  type RemediationAction,
  type RemediationActionType,
  DEFAULT_CRITIQUE_REFINE_CONFIG,
} from "./quality.types";
