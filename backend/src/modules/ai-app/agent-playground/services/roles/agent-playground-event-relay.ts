import { Logger } from "@nestjs/common";
import {
  DomainEventBus,
  MissionBudgetPool,
  type DomainEvent,
  type IAgentEvent,
} from "@/modules/ai-harness/facade";
import type { InvocationContext } from "./agent-invoker.service";

function estimateUsdFromTokens(tokens: number): number {
  return tokens * 0.000003;
}

export class AgentPlaygroundEventRelay {
  private readonly log = new Logger(AgentPlaygroundEventRelay.name);

  constructor(private readonly eventBus: DomainEventBus) {}

  async emitEvent(args: {
    type: string;
    missionId: string;
    userId: string;
    agentId?: string;
    traceId?: string;
    payload: unknown;
  }): Promise<void> {
    const event: DomainEvent = {
      type: args.type,
      scope: { missionId: args.missionId, userId: args.userId },
      payload: args.payload,
      agentId: args.agentId,
      traceId: args.traceId,
      timestamp: Date.now(),
    };
    await this.eventBus.emit(event).catch((err: unknown) => {
      const isCritical =
        args.type.includes("lifecycle") ||
        args.type.includes("cost:tick") ||
        args.type.includes("mission:");
      if (isCritical) {
        this.log.warn(
          `[${args.missionId}] critical event emit failed type=${args.type}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    });
  }

  async emitLifecycle(
    missionId: string,
    userId: string,
    agentId: string,
    role: string,
    phase: "started" | "completed" | "failed",
    detail?: Record<string, unknown>,
  ): Promise<void> {
    await this.emitEvent({
      type: "agent-playground.agent:lifecycle",
      missionId,
      userId,
      agentId,
      payload: { agentId, role, phase, ...detail },
    });
  }

  async tickCost(
    missionId: string,
    userId: string,
    stage: string,
    pool: MissionBudgetPool,
    deltaTokens: number,
  ): Promise<void> {
    const deltaCostUsd = estimateUsdFromTokens(deltaTokens);
    pool.recordSpend(deltaTokens, 0, deltaCostUsd);
    const snap = pool.snapshot();
    await this.emitEvent({
      type: "agent-playground.cost:tick",
      missionId,
      userId,
      payload: {
        stage,
        deltaTokens,
        deltaCostUsd,
        tokensUsed: snap.poolTokensUsed,
        costUsd: snap.poolCostUsd,
      },
    });
  }

  async relayAgentEvents(
    events: readonly IAgentEvent[],
    ctx: InvocationContext,
  ): Promise<void> {
    for (const ev of events) {
      if (ev.type === "thinking") {
        const p = ev.payload as {
          text: string;
          tokenCount?: number;
          modelId?: string;
        };
        await this.emitEvent({
          type: "agent-playground.agent:thought",
          missionId: ctx.missionId,
          userId: ctx.userId,
          agentId: ctx.agentId,
          payload: {
            agentId: ctx.agentId,
            role: ctx.role,
            text: p.text,
            tokenCount: p.tokenCount,
            modelId: p.modelId,
            originalTs: ev.timestamp,
          },
        });
      } else if (ev.type === "action_planned") {
        const action = ev.payload as {
          kind: string;
          toolId?: string;
          input?: unknown;
          calls?: unknown[];
          skillId?: string;
          name?: string;
        };
        await this.emitEvent({
          type: "agent-playground.agent:action",
          missionId: ctx.missionId,
          userId: ctx.userId,
          agentId: ctx.agentId,
          payload: {
            agentId: ctx.agentId,
            role: ctx.role,
            kind: action.kind,
            toolId: action.toolId,
            skillId: action.skillId,
            subagentName: action.name,
            input: action.input,
            calls: action.calls,
            originalTs: ev.timestamp,
          },
        });
      } else if (ev.type === "action_executed") {
        const r = ev.payload as {
          action: { kind: string; toolId?: string };
          output: unknown;
          error?: { message: string };
          latencyMs: number;
          tokensUsed?: number;
        };
        await this.emitEvent({
          type: "agent-playground.agent:observation",
          missionId: ctx.missionId,
          userId: ctx.userId,
          agentId: ctx.agentId,
          payload: {
            agentId: ctx.agentId,
            role: ctx.role,
            kind: r.action?.kind,
            toolId: r.action?.toolId,
            output: this.truncatePayload(r.output),
            error: r.error?.message,
            latencyMs: r.latencyMs,
            tokensUsed: r.tokensUsed,
            originalTs: ev.timestamp,
          },
        });
      } else if (ev.type === "reflection") {
        const p = ev.payload as {
          revision?: number;
          score?: number;
          verdicts?: Array<{
            judgeId: string;
            score: number;
            critique: string;
          }>;
          text?: string;
          verdict?: string;
        };
        await this.emitEvent({
          type: "agent-playground.agent:reflection",
          missionId: ctx.missionId,
          userId: ctx.userId,
          agentId: ctx.agentId,
          payload: {
            agentId: ctx.agentId,
            role: ctx.role,
            revision: p.revision,
            score: p.score,
            verdicts: p.verdicts,
            text: p.text,
            verdict: p.verdict,
            originalTs: ev.timestamp,
          },
        });
      } else if (ev.type === "error") {
        const p = ev.payload as { message: string };
        await this.emitEvent({
          type: "agent-playground.agent:error",
          missionId: ctx.missionId,
          userId: ctx.userId,
          agentId: ctx.agentId,
          payload: {
            agentId: ctx.agentId,
            role: ctx.role,
            message: p.message,
            originalTs: ev.timestamp,
          },
        });
      } else if (ev.type === "tools_recalled") {
        const p = ev.payload as {
          recalledIds?: readonly string[];
          categories?: readonly string[];
          source?: string;
          preferIds?: readonly string[];
        };
        await this.emitEvent({
          type: "agent-playground.tools:recalled",
          missionId: ctx.missionId,
          userId: ctx.userId,
          agentId: ctx.agentId,
          payload: {
            agentId: ctx.agentId,
            role: ctx.role,
            recalledIds: p.recalledIds ?? [],
            categories: p.categories ?? [],
            source: p.source ?? "spec",
            preferIds: p.preferIds ?? [],
            originalTs: ev.timestamp,
          },
        });
      } else if (ev.type === "iteration_progress") {
        const p = ev.payload as {
          iteration?: number;
          maxIterations?: number;
          progress?: number;
          approachingLimit?: boolean;
          lastActionKind?: string;
        };
        await this.emitEvent({
          type: "agent-playground.iteration:progress",
          missionId: ctx.missionId,
          userId: ctx.userId,
          agentId: ctx.agentId,
          payload: {
            agentId: ctx.agentId,
            role: ctx.role,
            iteration: p.iteration ?? 0,
            maxIterations: p.maxIterations ?? 0,
            progress: p.progress ?? 0,
            approachingLimit: p.approachingLimit ?? false,
            lastActionKind: p.lastActionKind,
            originalTs: ev.timestamp,
          },
        });
      } else if (ev.type === "validation_failed") {
        const p = ev.payload as {
          rejectCount?: number;
          maxRejects?: number;
          issues?: string;
        };
        await this.emitEvent({
          type: "agent-playground.agent:validation-rejected",
          missionId: ctx.missionId,
          userId: ctx.userId,
          agentId: ctx.agentId,
          payload: {
            agentId: ctx.agentId,
            role: ctx.role,
            rejectCount: p.rejectCount ?? 0,
            maxRejects: p.maxRejects ?? 3,
            issues: p.issues ?? "",
            originalTs: ev.timestamp,
          },
        });
      }
    }
  }

  private truncatePayload(payload: unknown): unknown {
    if (payload == null) return payload;
    if (typeof payload === "string") {
      return payload.length > 8000 ? payload.slice(0, 8000) + "..." : payload;
    }
    try {
      const s = JSON.stringify(payload);
      if (s.length <= 32_000) return payload;
      if (
        typeof payload === "object" &&
        payload !== null &&
        Array.isArray((payload as { results?: unknown[] }).results)
      ) {
        const obj = payload as { results: unknown[]; [k: string]: unknown };
        return {
          ...obj,
          results: obj.results.slice(0, 10),
          _resultsTruncated: obj.results.length > 10,
          _originalResultsCount: obj.results.length,
        };
      }
      return { _truncated: true, preview: s.slice(0, 32_000) + "..." };
    } catch {
      return String(payload);
    }
  }
}
