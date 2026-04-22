/**
 * HarnessedAgent — IAgent 的默认实现（Phase 1 骨架）
 *
 * Phase 1 状态：
 *   - execute() 立即返回 finalize event（不跑真实 loop）
 *   - spawnSubagent() 抛出 Not Implemented
 *   - 只支撑 Harness 的 plumbing 可编译、可注入、可 mock 测试
 *
 * Phase 2 将引入真实 loop（ReAct）+ memory-bridge + tool-invoker。
 */

import { randomUUID } from "crypto";
import type {
  AgentId,
  AgentState,
  IAgent,
  IAgentEvent,
  IAgentIdentity,
  IAgentTask,
  IContextEnvelope,
  ISubagentHandle,
  ISubagentSpec,
} from "../abstractions";
import { AgentIdentity } from "./agent-identity";
import { ContextEnvelope } from "./context-envelope";

export interface HarnessedAgentInit {
  identity: IAgentIdentity;
  envelope: ContextEnvelope;
}

export class HarnessedAgent implements IAgent {
  readonly id: AgentId;
  readonly identity: IAgentIdentity;
  state: AgentState;
  private envelope: ContextEnvelope;

  constructor(init: HarnessedAgentInit, id?: string) {
    this.id = id ?? randomUUID();
    this.identity =
      init.identity instanceof AgentIdentity
        ? init.identity
        : new AgentIdentity(init.identity);
    this.envelope = init.envelope;
    this.state = "idle";
  }

  async *execute(task: IAgentTask): AsyncIterable<IAgentEvent> {
    this.state = "running";

    // Append user task as a message on the envelope
    const userMsg = {
      role: "user" as const,
      content: task.input
        ? `${task.goal}\n\n${typeof task.input === "string" ? task.input : JSON.stringify(task.input)}`
        : task.goal,
      timestamp: Date.now(),
    };
    const appended = this.envelope.append([userMsg]);
    this.envelope = appended.envelope as ContextEnvelope;

    // Phase 1 skeleton: emit thinking → output → terminated
    yield {
      type: "thinking",
      agentId: this.id,
      timestamp: Date.now(),
      payload: { text: "[skeleton] Phase 1 placeholder", tokenCount: 0 },
    };

    const output = {
      ok: true,
      stub: true,
      agent: this.identity.role.id,
      goal: task.goal,
      message:
        "HarnessedAgent Phase 1 skeleton — real loop will be implemented in Phase 2.",
    };

    yield {
      type: "output",
      agentId: this.id,
      timestamp: Date.now(),
      payload: { output },
    };

    this.state = "completed";

    yield {
      type: "terminated",
      agentId: this.id,
      timestamp: Date.now(),
      payload: { reason: "completed" as const },
    };
  }

  spawnSubagent(_spec: ISubagentSpec): Promise<ISubagentHandle> {
    return Promise.reject(
      new Error("HarnessedAgent.spawnSubagent: not implemented in Phase 1"),
    );
  }

  getEnvelope(): IContextEnvelope {
    return this.envelope;
  }

  async cancel(reason = "cancelled by caller"): Promise<void> {
    this.state = "cancelled";
    // Record in envelope metadata for observability
    void reason;
    return Promise.resolve();
  }
}
