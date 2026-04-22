/**
 * AgentFactory — 从 IAgentSpec 构造 HarnessedAgent
 *
 * Phase 1 只做最小装配：identity + envelope。
 * Phase 2 将注入 AgentLoop / Skills / Memory bridge。
 */

import { randomUUID } from "crypto";
import type {
  IAgent,
  IAgentSpec,
  IBudgetSnapshot,
  IMemoryBinding,
} from "../abstractions";
import { AgentIdentity } from "./agent-identity";
import { ContextEnvelope } from "./context-envelope";
import { HarnessedAgent } from "./harnessed-agent";

export class AgentFactory {
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
      tokensRemaining: identity.constraints.maxTokens ?? 50_000,
      iterationsUsed: 0,
      iterationsRemaining: identity.constraints.maxIterations ?? 20,
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

    return new HarnessedAgent({ identity, envelope });
  }
}
