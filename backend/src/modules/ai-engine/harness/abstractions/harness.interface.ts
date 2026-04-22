/**
 * IHarness — Agent 运行时脚手架总接口
 *
 * "The harness makes the agent." —— Anthropic 2025
 *
 * Harness 负责：
 *   1. 把零件（LLM / Tools / Memory / Skills）组装成一个可跑的 Agent
 *   2. 管理 Agent 的 lifecycle 与事件流
 *   3. 派生 subagent 并做隔离
 *   4. 提供 hook 钩子扩展点
 */

import type { IAgent, IAgentTask, IAgentResult } from "./agent.interface";
import type { IAgentIdentity } from "./identity.interface";
import type {
  IContextEnvelope,
  IContextMutation,
} from "./context-envelope.interface";
import type { IHookRegistry } from "./hook.interface";
import type { IAgentLoop, AgentLoopKind } from "./agent-loop.interface";

/** 创建 Agent 的规格（App 层提供） */
export interface IAgentSpec {
  readonly identity: IAgentIdentity;
  /** 指定 loop 策略（默认 react） */
  readonly loop?: AgentLoopKind;
  /** 初始 system prompt（可选，默认由 identity 生成） */
  readonly systemPrompt?: string;
  /** 初始 session id（用于 memory scoping） */
  readonly sessionId?: string;
  readonly userId?: string;
}

/** Context 操作接口（只读 envelope 上的变换器） */
export interface IContextManager {
  readonly envelope: IContextEnvelope;
  append(messages: IContextEnvelope["messages"]): IContextMutation;
  reminder(
    content: string,
    priority?: "low" | "medium" | "high",
  ): IContextMutation;
  fork(): IContextEnvelope;
  compact(): Promise<IContextMutation>;
}

/** Harness 总接口 */
export interface IHarness {
  /** 创建 Agent 实例（不启动） */
  createAgent(spec: IAgentSpec): IAgent;

  /** 一次性 execute：创建并执行到完成，返回最终结果 */
  execute(spec: IAgentSpec, task: IAgentTask): Promise<IAgentResult>;

  /** 注册 Loop 实现（Phase 2 使用） */
  registerLoop(loop: IAgentLoop): void;

  /** Hook 注册表 */
  readonly hooks: IHookRegistry;
}
