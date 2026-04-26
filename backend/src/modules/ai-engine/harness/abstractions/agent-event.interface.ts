/**
 * Agent Event — Agent 运行时向外发射的事件流
 *
 * WebSocket / SSE / Observability 都消费这个 stream。
 */

import type { IAction, IActionResult } from "./action.interface";

export type AgentEventType =
  | "thinking" // LLM 思考（CoT 中间步骤）
  | "action_planned" // 决定做某个 action
  | "action_executed" // action 完成
  | "reflection" // 自我反思
  | "output" // 最终输出
  | "error" // 错误
  | "budget_warning" // 预算即将耗尽
  | "terminated"; // 终止

export interface IAgentEvent {
  readonly type: AgentEventType;
  readonly agentId: string;
  readonly timestamp: number;
  readonly payload: unknown;
}

export interface IThinkingEvent extends IAgentEvent {
  type: "thinking";
  payload: { text: string; tokenCount: number };
}

export interface IActionPlannedEvent extends IAgentEvent {
  type: "action_planned";
  payload: IAction;
}

export interface IActionExecutedEvent extends IAgentEvent {
  type: "action_executed";
  payload: IActionResult;
}

export interface IOutputEvent extends IAgentEvent {
  type: "output";
  payload: { output: string | Record<string, unknown> };
}

/**
 * Harness 失败码 —— 全链路统一枚举。
 *
 * 设计：每个 layer 抛 error 时**必须**带 failureCode，由 RuntimeEnvironment
 * 据此决定 fallback 策略（retry / switch_model / downgrade / abort）。
 *
 * 命名约定：`<LAYER>_<CAUSE>`，方便 SQL 按前缀分组统计：
 *   PROVIDER_*  L5 真实 API 返回的故障（safety / 限流 / 截断 / 模型不存在）
 *   PARSE_*     L3 ReActLoop 解析 LLM JSON 时的故障
 *   LOOP_*      L3 Loop 自身的循环逻辑故障（空响应 / iter 用尽 / budget）
 *   REFLEXION_* L3 ReflexionLoop 故障（verifier 低分 / 连续空 revision）
 *   RUNNER_*    L2 AgentRunner 故障（输入/输出 schema / wallTime）
 *   TOOL_*      L6 Tool 调用故障
 *   ORCH_*      L1 Orchestrator 故障（额度 / 维度降级）
 */
export type HarnessFailureCode =
  // L5 Provider
  | "PROVIDER_API_ERROR"
  | "PROVIDER_RATE_LIMIT"
  | "PROVIDER_SAFETY_REFUSAL"
  | "PROVIDER_TRUNCATED"
  | "PROVIDER_BYOK_MODEL_NOT_FOUND"
  // L3 Parse
  | "PARSE_MALFORMED_JSON"
  | "PARSE_MISSING_ACTION"
  | "PARSE_UNKNOWN_ACTION_KIND"
  | "PARSE_EMPTY_ACTIONS_ARRAY"
  // L3 Loop
  | "LOOP_EMPTY_RESPONSE_IMMEDIATE" // completion < ~100tk，model 死了
  | "LOOP_REASONING_COT_EXHAUSTION" // completion ≫ 0 但 visible 空，CoT 撞墙
  | "LOOP_MAX_ITERATIONS"
  | "LOOP_BUDGET_EXHAUSTED"
  // L3 Reflexion
  | "REFLEXION_VERIFIER_LOW_SCORE"
  | "REFLEXION_CONSECUTIVE_EMPTY"
  // L2 Runner
  | "RUNNER_OUTPUT_SCHEMA_MISMATCH"
  | "RUNNER_INPUT_SCHEMA_MISMATCH"
  | "RUNNER_WALL_TIME_EXCEEDED"
  // L6 Tool
  | "TOOL_NOT_FOUND"
  | "TOOL_TIMEOUT"
  | "TOOL_RUNTIME_ERROR"
  | "TOOL_INPUT_VALIDATION_FAILED"
  // L1 Orchestrator
  | "ORCH_DIMENSION_DEGRADED"
  | "ORCH_CREDIT_INSUFFICIENT"
  // 兜底：未来新失败模式没枚举进来时用
  | "UNKNOWN";

/**
 * 标准化 error event payload。
 *
 * **向后兼容**：旧调用点 yield `{ message, recoverable }` 仍然合法
 * （failureCode 默认 "UNKNOWN"），但新代码必须填 failureCode + diagnostic。
 */
export interface IHarnessErrorPayload {
  /** 人类可读消息（继续保留，兼容老代码） */
  message: string;
  /** 是否可恢复（caller 决定要不要 retry） */
  recoverable: boolean;
  /** ★ 失败码：层级化 enum，全链路统一，DB 可分组 */
  failureCode?: HarnessFailureCode;
  /**
   * ★ 诊断证据：足够让人离线复现根因的全部数据
   * - LLM 路径：rawContent、completionTokens、modelId
   * - Tool 路径：toolId、input、stderr
   * - Runner 路径：schemaError、output snapshot
   */
  diagnostic?: {
    rawContent?: string;
    parseError?: { name: string; message: string };
    modelId?: string;
    promptTokens?: number;
    completionTokens?: number;
    iteration?: number;
    revision?: number;
    consecutiveEmptyLLM?: number;
    toolId?: string;
    toolInput?: unknown;
    toolError?: string;
    schemaError?: string;
    /** 任意业务自定义字段 */
    [key: string]: unknown;
  };
  /**
   * ★ runtimeEnv.suggestFallback(reason) 的结果（如果调过）
   * 可恢复时上层据此自动 fallback；不可恢复时仅作记录。
   */
  recoveryHint?: {
    action: "retry" | "switch_model" | "downgrade_tier" | "abort";
    reason?: string;
    fallbackModelId?: string;
    retryAfterMs?: number;
  };
}

export interface IErrorEvent extends IAgentEvent {
  type: "error";
  payload: IHarnessErrorPayload;
}
