/**
 * SubagentSpawner — 派生子 Agent
 *
 * 职责：
 *   1. PreSubagentSpawn hook（可阻断）
 *   2. 解析 isolation policy 派生 envelope
 *   3. 用 AgentFactory 构造子 Agent（继承 loop / memoryBridge / skillActivator）
 *   4. 返回 SubagentHandle，让父 agent 可以消费事件流或等结果
 */

import { Injectable, Inject, forwardRef } from "@nestjs/common";
import { randomUUID } from "crypto";
import type {
  IAgent,
  ISubagentHandle,
  ISubagentSpec,
  ISubagentSpawner,
  IHookRegistry,
} from "../abstractions";
import { AgentFactory } from "../core/agent-factory";
import { HookRegistry } from "../core/hook-registry";
import { resolveIsolation } from "./isolation";
import { SubagentHandle } from "./subagent-handle";

export class SubagentSpawnBlockedError extends Error {
  constructor(reason?: string) {
    super(`Subagent spawn blocked: ${reason ?? "policy"}`);
    this.name = "SubagentSpawnBlockedError";
  }
}

@Injectable()
export class SubagentSpawner implements ISubagentSpawner {
  constructor(
    @Inject(forwardRef(() => AgentFactory))
    private readonly factory: AgentFactory,
    private readonly hooks: HookRegistry,
  ) {}

  async spawn(parent: IAgent, spec: ISubagentSpec): Promise<ISubagentHandle> {
    const parentEnvelope = parent.getEnvelope();

    // 1. PreSubagentSpawn hook
    const hookResult = await (this.hooks as IHookRegistry).dispatch(
      "PreSubagentSpawn",
      {
        spec: {
          kind: "subagent_spawn",
          name: spec.name,
          prompt: spec.prompt,
          isolation: spec.isolation,
          budget: spec.budget
            ? {
                tokens: spec.budget.maxTokens,
                iterations: spec.budget.maxIterations,
              }
            : undefined,
        },
      },
      { agentId: parent.id, envelope: parentEnvelope },
    );
    if (hookResult.block) {
      throw new SubagentSpawnBlockedError(hookResult.reason);
    }

    // 2. Derive envelope via isolation policy
    const isolation = resolveIsolation(spec.isolation ?? "context");
    const childSessionId = randomUUID();
    const childSystemPrompt =
      spec.identity instanceof Object && "toSystemPrompt" in spec.identity
        ? // AgentIdentity with toSystemPrompt
          (spec.identity as { toSystemPrompt: () => string }).toSystemPrompt()
        : `# Role\n${spec.identity.role.name}\n\n${spec.identity.role.description ?? ""}`;

    const childEnvelope = isolation.derive(parentEnvelope, {
      subagentSessionId: childSessionId,
      subagentSystemPrompt: childSystemPrompt,
      budgetOverride: spec.budget,
    });

    // 3. Build child agent via factory with derived envelope
    const child = this.factory.createWithEnvelope(
      {
        identity: spec.identity,
        sessionId: childSessionId,
        userId: childEnvelope.memory.userId,
      },
      childEnvelope,
    );

    // 4. Wrap in handle
    return new SubagentHandle({
      name: spec.name,
      parent,
      spec,
      child,
    });
  }
}
