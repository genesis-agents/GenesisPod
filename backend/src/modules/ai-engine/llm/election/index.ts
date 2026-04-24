/**
 * Model Election barrel — 对外唯一入口。
 * L3 / harness 层应通过 `@/modules/ai-engine/facade` 导入；本 barrel 供 LLM
 * 模块内部和 facade 转出使用。
 */

export { ModelElectionService } from "./model-election.service";
export {
  NoEligibleModelError,
  type ElectionCandidate,
  type ElectionRequest,
  type ElectionResult,
  type ElectionRoleHint,
  type ElectionScore,
  type ElectionCostBias,
} from "./model-election.types";
