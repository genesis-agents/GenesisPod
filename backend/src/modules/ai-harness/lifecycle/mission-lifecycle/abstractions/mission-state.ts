/**
 * MissionTerminalOutcome / MissionPresentationState —— C7 / G9（2026-05-22）：mission 状态三层之
 * 「终态业务映射」+「前端聚合」层(lifecycle 状态机本身在 mission-lifecycle-manager)。
 *
 * ★ G6:平台 terminal outcome 只保 success/failure/cancelled——**不含 quality_rejected**
 * (有些 app 无"质量拒绝"终态;平台内建它=又预设业务模型)。"leader 拒签"这类留 failureCode /
 * app 级 businessOutcomeCode,不污染平台 enum。
 */

import type {
  MissionLifecycleStatus,
  MissionTerminalStatus,
} from "../mission-lifecycle-manager";
import type { MissionFailureCode, FailureCategory } from "./mission-failure";

/** 平台终态业务映射(纯平台,无业务语义)。 */
export enum MissionTerminalOutcome {
  success = "success",
  failure = "failure",
  cancelled = "cancelled",
}

/** terminal status → outcome(completed→success / failed→failure / cancelled→cancelled)。 */
export function toTerminalOutcome(
  status: MissionTerminalStatus,
): MissionTerminalOutcome {
  switch (status) {
    case "completed":
      return MissionTerminalOutcome.success;
    case "cancelled":
      return MissionTerminalOutcome.cancelled;
    case "failed":
    default:
      return MissionTerminalOutcome.failure;
  }
}

/**
 * 前端聚合状态(给 UI 直接消费)。lifecycle/outcome 是平台层;failureCode/category 由 C2 派生;
 * businessOutcomeCode 是 app 业务态(如 leader_signoff_rejected),平台不解释。
 */
export interface MissionPresentationState {
  readonly lifecycleStatus: MissionLifecycleStatus;
  readonly terminalOutcome?: MissionTerminalOutcome;
  readonly failureCode?: MissionFailureCode;
  readonly failureCategory?: FailureCategory;
  /** app 业务终态码(平台不枚举,如 leader_signoff_rejected)。 */
  readonly businessOutcomeCode?: string;
}
