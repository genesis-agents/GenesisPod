/**
 * runner-state.util — normalize AgentRunner result state for social role services.
 *
 * Copy of agent-playground/services/roles/runner-state.util.ts. AgentRunner can
 * return "degraded" (reflexion verifier 评分 < passThreshold 但 outputSchema 合法
 * 的次优产物 — 仍可用). Don't fold to failed.
 */

export type NormalizedRunnerState =
  | "completed"
  | "degraded"
  | "failed"
  | "cancelled";

export function normalizeRunnerState(s: unknown): NormalizedRunnerState {
  if (s === "completed" || s === "degraded" || s === "cancelled") return s;
  return "failed";
}
