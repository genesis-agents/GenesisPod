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

export interface IErrorEvent extends IAgentEvent {
  type: "error";
  payload: { message: string; recoverable: boolean };
}
