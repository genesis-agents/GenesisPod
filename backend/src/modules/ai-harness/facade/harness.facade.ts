/**
 * HarnessFacade — Harness 层对外的唯一入口
 *
 * 组合 AgentFactory + HookRegistry + CheckpointService。
 * App 层只与本 facade 打交道，禁止穿透到 harness/core 内部。
 */

import { Injectable, Optional } from "@nestjs/common";
import type {
  IAgent,
  IAgentResult,
  IAgentSpec,
  IAgentTask,
  IHarness,
  IAgentLoop,
  IOutputEvent,
  AgentState,
} from "../kernel/abstractions";
import { AgentFactory } from "../kernel/core/agent-factory";
import { HookRegistry } from "../kernel/core/hook-registry";
import { LoopRegistry } from "../execution/loop/loop-registry";
import { CheckpointService } from "../memory/checkpoint/checkpoint.service";
import type { ICheckpoint } from "../memory/checkpoint/checkpoint.types";
import {
  AgentEventStore,
  type AgentEventRecord,
} from "../memory/checkpoint/agent-event-store";

@Injectable()
export class HarnessFacade implements IHarness {
  constructor(
    private readonly factory: AgentFactory,
    /**
     * DI-injected HookRegistry — the SAME instance used by SubagentSpawner,
     * SkillActivator, ReActLoop. Hooks registered here are visible to all.
     */
    private readonly hookRegistry: HookRegistry,
    /**
     * v2: LoopRegistry — registerLoop() 由 facade 真正派发（不再 no-op）。
     */
    private readonly loopRegistry: LoopRegistry,
    @Optional() private readonly checkpointService?: CheckpointService,
    @Optional() private readonly eventStore?: AgentEventStore,
  ) {}

  createAgent(spec: IAgentSpec): IAgent {
    return this.factory.create(spec);
  }

  async execute(spec: IAgentSpec, task: IAgentTask): Promise<IAgentResult> {
    const agent = this.createAgent(spec);
    const startMs = Date.now();
    let lastOutput: IOutputEvent["payload"]["output"] = "";
    let iterations = 0;
    let terminatedState: AgentState = "completed";

    for await (const event of agent.execute(task)) {
      if (event.type === "output") {
        lastOutput = (event as IOutputEvent).payload.output;
      } else if (event.type === "action_executed") {
        iterations += 1;
      } else if (event.type === "error") {
        terminatedState = "failed";
      } else if (event.type === "terminated") {
        const reason = (event.payload as { reason?: string }).reason;
        if (reason === "error") terminatedState = "failed";
        else if (reason === "cancelled") terminatedState = "cancelled";
        // budget: partial completion, not failure — callers can inspect iterations
        else if (reason === "budget") terminatedState = "completed";
      }
    }

    return {
      output: lastOutput,
      state: terminatedState as IAgentResult["state"],
      iterations,
      tokensUsed: 0, // Phase 2: token tracking postponed to runtime observability integration
      wallTimeMs: Date.now() - startMs,
    };
  }

  /**
   * v2: 真正接通 LoopRegistry。
   * AI App 可注册自定义 loop（ToT / Debate / SWE-style 等），AgentFactory
   * 在 createAgent(spec) 时按 spec.loop 派发。
   */
  registerLoop(loop: IAgentLoop): void {
    this.loopRegistry.register(loop);
  }

  get hooks(): HookRegistry {
    return this.hookRegistry;
  }

  /**
   * Resume — 从 checkpoint id 或最新 checkpoint 恢复 agent 执行
   */
  async resume(
    params: { checkpointId: string } | { agentId: string; useLatest: true },
  ): Promise<{ agent: IAgent; checkpoint: ICheckpoint } | null> {
    if (!this.checkpointService) {
      throw new Error(
        "HarnessFacade.resume: CheckpointService not wired — enable Phase 6 providers in HarnessModule",
      );
    }

    let checkpoint: ICheckpoint | null;
    if ("checkpointId" in params) {
      checkpoint = await this.checkpointService.load(params.checkpointId);
    } else {
      checkpoint = await this.checkpointService.latestForAgent(params.agentId);
    }
    if (!checkpoint) return null;

    const agent = this.factory.createFromCheckpoint({
      identity: checkpoint.identity,
      envelope: checkpoint.envelope,
      sessionId: checkpoint.envelope.memory.sessionId,
    });
    return { agent, checkpoint };
  }

  /**
   * Fork — 从已有 checkpoint 创建一个独立分支的 agent。
   * 用于 branch-and-bound：从同一断点尝试两条路线（如 plan A vs plan B）。
   *
   * PR-I 修复 #4: 完全隔离 memory scope（之前只换 sessionId，userId 不变 →
   * fork 后子 agent 仍可读父 agent 的 user-scope 记忆 → 信息泄漏）。
   * 现在：sessionId + workingMemoryKey + longTermScope 全部隔离；userId 可选保留。
   *
   * @param options.preserveUserId 显式保留原 userId（默认 false——完全隔离）
   *   仅在你确定 fork 后的 agent 仍代表同一用户（如 A/B 实验）时设为 true。
   */
  async fork(
    checkpointId: string,
    options?: {
      newSessionId?: string;
      /** 默认 false —— 强烈推荐保持隔离，避免 fork 跨用户读取记忆 */
      preserveUserId?: boolean;
    },
  ): Promise<{
    agent: import("../kernel/abstractions").IAgent;
    checkpoint: ICheckpoint;
  } | null> {
    if (!this.checkpointService) {
      throw new Error("HarnessFacade.fork: CheckpointService not wired");
    }
    const checkpoint = await this.checkpointService.load(checkpointId);
    if (!checkpoint) return null;
    const newSessionId =
      options?.newSessionId ??
      `${checkpoint.envelope.memory.sessionId}.fork.${Date.now()}`;
    // PR-I: 强隔离 memory scope —— sessionId/workingMemoryKey/longTermScope 全换
    // userId 默认丢弃（preserveUserId=true 才保留）
    const forkedEnv = {
      ...checkpoint.envelope,
      memory: {
        sessionId: newSessionId,
        userId: options?.preserveUserId
          ? checkpoint.envelope.memory.userId
          : undefined,
        workingMemoryKey: undefined,
        longTermScope: undefined,
      },
    };
    const agent = this.factory.createFromCheckpoint({
      identity: checkpoint.identity,
      envelope: forkedEnv,
      sessionId: newSessionId,
    });
    return { agent, checkpoint };
  }

  /**
   * Replay — 拉取 agent 完整事件流（用于审计 / 调试 / Inspector UI）。
   * 不重新执行任何 LLM/tool；只读 event store。
   */
  async replay(
    agentId: string,
    options?: { fromSeq?: number; limit?: number },
  ): Promise<readonly AgentEventRecord[]> {
    if (!this.eventStore) {
      throw new Error(
        "HarnessFacade.replay: AgentEventStore not wired — enable PR-C providers in HarnessModule",
      );
    }
    return this.eventStore.readStream(agentId, options);
  }
}
