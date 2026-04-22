/**
 * AgentFactory — 从 IAgentSpec 构造 HarnessedAgent
 *
 * Phase 2：注入 loop + memoryBridge（可选；单测可以 new AgentFactory() 不传任何依赖）。
 */

import { Injectable, Optional, Inject, forwardRef } from "@nestjs/common";
import { randomUUID } from "crypto";
import type {
  IAgent,
  IAgentLoop,
  IAgentSpec,
  IBudgetSnapshot,
  IContextEnvelope,
  IMemoryBinding,
} from "../abstractions";
import { AgentIdentity } from "./agent-identity";
import { ContextEnvelope } from "./context-envelope";
import { HarnessedAgent } from "./harnessed-agent";
import { ReActLoop } from "../loop/react-loop";
import { MemoryBridge } from "../memory-bridge/memory-bridge.service";
import { SkillActivator } from "../skills/skill-activator";
import type { SubagentSpawner } from "../subagent/subagent-spawner";

@Injectable()
export class AgentFactory {
  private readonly defaultLoop?: IAgentLoop;

  constructor(
    @Optional() reactLoop?: ReActLoop,
    @Optional() private readonly memoryBridge?: MemoryBridge,
    @Optional() private readonly skillActivator?: SkillActivator,
    @Optional()
    @Inject(forwardRef(() => "SubagentSpawner" as const))
    private readonly subagentSpawner?: SubagentSpawner,
  ) {
    this.defaultLoop = reactLoop;
  }

  create(spec: IAgentSpec): IAgent {
    const identity =
      spec.identity instanceof AgentIdentity
        ? spec.identity
        : new AgentIdentity(spec.identity);

    const sessionId = spec.sessionId ?? randomUUID();
    const memory: IMemoryBinding = {
      sessionId,
      userId: spec.userId,
    };

    const budget: IBudgetSnapshot = {
      tokensUsed: 0,
      tokensRemaining: identity.constraints?.maxTokens ?? 50_000,
      iterationsUsed: 0,
      iterationsRemaining: identity.constraints?.maxIterations ?? 20,
      wallTimeStartMs: Date.now(),
    };

    const systemPrompt = spec.systemPrompt ?? identity.toSystemPrompt();

    const envelope = new ContextEnvelope({
      system: systemPrompt,
      messages: [],
      reminders: [],
      tools: [...identity.tools],
      memory,
      budget,
    });

    return new HarnessedAgent({
      identity,
      envelope,
      loop: this.defaultLoop,
      memoryBridge: this.memoryBridge,
      skillActivator: this.skillActivator,
      subagentSpawner: this.subagentSpawner,
    });
  }

  /**
   * 供 SubagentSpawner 使用：在已派生的 envelope 上创建 agent，
   * 不重新计算 memory/budget（isolation policy 已经准备好了）。
   */
  createWithEnvelope(
    spec: IAgentSpec,
    envelope: IContextEnvelope,
  ): IAgent {
    const identity =
      spec.identity instanceof AgentIdentity
        ? spec.identity
        : new AgentIdentity(spec.identity);

    const env =
      envelope instanceof ContextEnvelope
        ? envelope
        : new ContextEnvelope({
            system: envelope.system,
            messages: [...envelope.messages],
            reminders: [...envelope.reminders],
            tools: [...envelope.tools],
            memory: envelope.memory,
            budget: envelope.budget,
            metadata: envelope.metadata,
          });

    return new HarnessedAgent({
      identity,
      envelope: env,
      loop: this.defaultLoop,
      memoryBridge: this.memoryBridge,
      skillActivator: this.skillActivator,
      subagentSpawner: this.subagentSpawner,
    });
  }
}
