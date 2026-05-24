/**
 * runner-state.util re-export
 *
 * Backwards-compat shim：playground role services 历史 import 路径
 * `./runner-state.util` 仍可用，底层切到 harness facade 单源（2026-05-16 上提）。
 * 后续 PR 把所有 social/playground role service 的 import 改成
 * `@/modules/ai-harness/facade` 后此文件可删。
 */

export {
  normalizeRunnerState,
  type NormalizedRunnerState,
} from "@/modules/ai-harness/facade";
