/**
 * Verifier stage agent — barrel export
 *
 * 客观事实核验员，4 种 mode（citation-audit / number-check / claim-grounding /
 * source-tier）。当前 orchestrator 暂未接入，留作后续 PR 在
 * mission [3.5] reconciliation 之后 + writer 之后两个节点调用。
 */

export {
  VerifierAgent,
  type VerifierInput,
  type VerifierOutput,
} from "./verifier.agent";
