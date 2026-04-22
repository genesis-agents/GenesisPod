/**
 * Agent Loop — 决策循环（perceive → reason → act → reflect）
 *
 * Loop 是循环骨架；reasoning 策略（CoT / ReAct / ToT / Reflexion）是可插拔的。
 * Phase 1 只定义接口，具体 loop 实现在 Phase 2 落地。
 */

import type { IAgentEvent } from "./agent-event.interface";
import type { IContextEnvelope } from "./context-envelope.interface";
import type { IAction, IActionResult } from "./action.interface";

/** Loop 类型标识 */
export type AgentLoopKind = "react" | "plan-execute" | "reflexion" | "simple";

/** Loop 单步的四阶段结果 */
export interface ILoopStep {
  readonly iteration: number;
  readonly perceived: IContextEnvelope;
  readonly reasoning: string; // LLM 产生的思考
  readonly action: IAction;
  readonly actionResult: IActionResult;
  readonly reflection?: string; // reflexion 才有
  readonly terminated: boolean;
}

/** Loop 终止条件 */
export interface ILoopTerminationCriteria {
  readonly maxIterations: number;
  readonly maxTokens?: number;
  readonly maxWallTimeMs?: number;
  /** 自定义终止判定（见到 finalize action 即终止） */
  readonly terminateOn?: readonly IAction["kind"][];
}

/** AgentLoop 接口 */
export interface IAgentLoop {
  readonly kind: AgentLoopKind;
  run(
    envelope: IContextEnvelope,
    criteria: ILoopTerminationCriteria,
  ): AsyncIterable<IAgentEvent>;
}
