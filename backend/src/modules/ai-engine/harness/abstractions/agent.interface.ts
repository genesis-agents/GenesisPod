/**
 * IAgent — Model + Harness 封装体的运行时实例
 *
 * 区别：
 *   - IAgentIdentity = 蓝图（静态，描述"是谁"）
 *   - IAgent = 实例（运行时，"正在跑"）
 */

import type { IAgentIdentity } from "./identity.interface";
import type { IContextEnvelope } from "./context-envelope.interface";
import type { IAgentEvent } from "./agent-event.interface";
import type { ISubagentHandle, ISubagentSpec } from "./subagent.interface";

/** Agent id（UUID） */
export type AgentId = string;

/** Agent 运行时状态 */
export type AgentState =
  | "idle" // 未启动
  | "running" // 正在执行
  | "paused" // 暂停（HITL 等待）
  | "completed" // 成功完成
  | "failed" // 失败
  | "cancelled"; // 取消

/** 一次 execute 调用的输入 */
export interface IAgentTask {
  readonly goal: string;
  readonly input?: string | Record<string, unknown>;
  /** 覆盖 identity 默认约束 */
  readonly constraintsOverride?: Partial<IAgentIdentity["constraints"]>;
}

/** 一次 execute 的最终结果 */
export interface IAgentResult {
  readonly output: string | Record<string, unknown>;
  readonly state: Exclude<AgentState, "idle" | "running" | "paused">;
  readonly iterations: number;
  readonly tokensUsed: number;
  readonly wallTimeMs: number;
  readonly errors?: readonly string[];
}

/** Agent 运行时实例 */
export interface IAgent {
  readonly id: AgentId;
  readonly identity: IAgentIdentity;
  readonly state: AgentState;

  /** 执行任务，流式发射事件 */
  execute(task: IAgentTask): AsyncIterable<IAgentEvent>;

  /** 派生子 Agent */
  spawnSubagent(spec: ISubagentSpec): Promise<ISubagentHandle>;

  /** 获取当前 context envelope 快照 */
  getEnvelope(): IContextEnvelope;

  /** 取消执行 */
  cancel(reason?: string): Promise<void>;
}
