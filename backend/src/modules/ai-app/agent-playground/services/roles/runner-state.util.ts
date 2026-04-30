/**
 * runner-state.util —— role service 内部的 runner state 归一化
 *
 * 背景:
 *   AgentRunner 返回的 state 现在含 "degraded"（reflexion verifier 评分 <
 *   passThreshold 但 outputSchema 合法的次优产物 — 仍可用 → 不应折成 failed）。
 *   role services（analyst/writer/reviewer/...）的旧逻辑用 ternary 把
 *   "completed" / "cancelled" 之外的所有 state 折成 "failed"，会把 degraded
 *   误判成 failed → s6/s8 stage 见 state !== "completed" → 整个 mission 失败。
 *
 * 修复:
 *   - "completed" / "degraded" / "cancelled" 透传
 *   - 其它（含 "failed" / undefined / 任何未知值）→ "failed"，不误传脏 state
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
