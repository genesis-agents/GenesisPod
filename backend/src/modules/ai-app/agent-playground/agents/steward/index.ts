/**
 * Steward stage agent — barrel export
 *
 * 资源 / 合规 / 边界守门员，4 种 scope（budget-guard / compliance-check /
 * data-boundary / source-diversity）。当前 orchestrator 暂未接入，留作后续 PR
 * 在各 stage 之间进行 alert 拦截。
 */

export {
  StewardAgent,
  type StewardInput,
  type StewardOutput,
} from "./steward.agent";
