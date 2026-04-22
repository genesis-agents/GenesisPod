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
} from "../abstractions";
import { AgentFactory } from "../core/agent-factory";
import { HookRegistry } from "../core/hook-registry";
import { CheckpointService } from "../checkpoint/checkpoint.service";
import type { ICheckpoint } from "../checkpoint/checkpoint.types";

@Injectable()
export class HarnessFacade implements IHarness {
  constructor(
    private readonly factory: AgentFactory,
    /**
     * DI-injected HookRegistry — the SAME instance used by SubagentSpawner,
     * SkillActivator, ReActLoop. Hooks registered here are visible to all.
     */
    private readonly hookRegistry: HookRegistry,
    @Optional() private readonly checkpointService?: CheckpointService,
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
   * registerLoop is part of IHarness contract for future Loop polymorphism
   * (ReAct vs Plan-Execute vs Reflexion). Currently ReActLoop is the default
   * wired via DI; this method is a forward-compatibility hook — NOT YET USED
   * to dispatch to alternative loops. Marked as known-dead until Phase 7.
   */
  registerLoop(_loop: IAgentLoop): void {
    // no-op: alternative loops not yet dispatched (Phase 7)
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
}
