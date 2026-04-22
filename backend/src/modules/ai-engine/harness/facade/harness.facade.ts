/**
 * HarnessFacade — Harness 层对外的唯一入口
 *
 * App 层只与本 facade 打交道，禁止穿透到 harness/core 内部。
 */

import { Injectable } from "@nestjs/common";
import type {
  IAgent,
  IAgentResult,
  IAgentSpec,
  IAgentTask,
  IHarness,
  IHookRegistry,
  IAgentLoop,
  IOutputEvent,
  AgentState,
} from "../abstractions";
import { AgentFactory } from "../core/agent-factory";
import { HookRegistry } from "../core/hook-registry";

@Injectable()
export class HarnessFacade implements IHarness {
  private readonly factory = new AgentFactory();
  private readonly _hooks = new HookRegistry();
  private readonly loops = new Map<string, IAgentLoop>();

  createAgent(spec: IAgentSpec): IAgent {
    return this.factory.create(spec);
  }

  async execute(spec: IAgentSpec, task: IAgentTask): Promise<IAgentResult> {
    const agent = this.createAgent(spec);
    const startMs = Date.now();
    let lastOutput: IOutputEvent["payload"]["output"] = "";
    let terminatedState: AgentState = "completed";

    for await (const event of agent.execute(task)) {
      if (event.type === "output") {
        lastOutput = (event as IOutputEvent).payload.output;
      } else if (event.type === "error") {
        terminatedState = "failed";
      } else if (event.type === "terminated") {
        const reason = (event.payload as { reason?: string }).reason;
        if (reason === "error") terminatedState = "failed";
        else if (reason === "cancelled") terminatedState = "cancelled";
      }
    }

    return {
      output: lastOutput,
      state: terminatedState as IAgentResult["state"],
      iterations: 0, // Phase 1: skeleton doesn't run loop
      tokensUsed: 0,
      wallTimeMs: Date.now() - startMs,
    };
  }

  registerLoop(loop: IAgentLoop): void {
    this.loops.set(loop.kind, loop);
  }

  get hooks(): IHookRegistry {
    return this._hooks;
  }
}
