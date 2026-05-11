/**
 * BusinessAgentTeam — Event Relay Framework
 *
 * 上提自 ai-app/agent-playground/services/roles/agent-playground-event-relay.ts @migrated-from
 * （2026-05-08 PR-E1）。通用 emit + budget exhaustion + IAgentEvent → DomainEvent
 * 翻译现作为框架，业务侧仅注入 eventNamespace（如 "my-app" / "research"），
 * 所有 event type 字符串由 framework 用模板拼接（{namespace}.cost:tick 等）。
 *
 * 业务侧扩展模板：
 * ```ts
 * @Injectable()
 * export class MyAppEventRelay extends EventRelayFramework {
 *   constructor(eventBus: DomainEventBus) {
 *     super(eventBus, "my-app");
 *   }
 * }
 * ```
 */

import { Logger } from "@nestjs/common";
// ★ 不走 facade barrel：facade/index.ts 也 re-export 本 framework，
//   构成循环加载（详见 mission-runtime-shell.framework.ts 注释）。
import { DomainEventBus } from "@/modules/ai-harness/protocols/events/domain-event-bus";
import { MissionAbortRegistry } from "@/modules/ai-harness/lifecycle/mission-lifecycle/abort-registry";
import { MissionBudgetPool } from "@/modules/ai-harness/guardrails/budget/mission-budget-pool";
import { estimateUsdFromTokens } from "@/modules/ai-harness/tracing/observability/token-spend.utils";
import type { DomainEvent } from "@/modules/ai-harness/protocols/events/domain-event.types";
import type { IAgentEvent } from "@/modules/ai-harness/agents/abstractions/agent-event.interface";

/** EventRelay 与 invoker 共享的调用上下文 */
export interface EventRelayContext {
  missionId: string;
  userId: string;
  agentId: string;
  role: string;
}

export class EventRelayFramework {
  private readonly log = new Logger(EventRelayFramework.name);
  private abortRegistry?: MissionAbortRegistry;
  /** 防重复发：单 mission 仅 emit budget:exhausted + abort 一次（带 60min 过期清理） */
  private readonly exhaustedMissions = new Map<string, number>();
  /** 防重复发：90% 软告警只 emit 一次 */
  private readonly softWarnedMissions = new Map<string, number>();
  /** budget 软告警阈值（已用 / 上限）—— 跨过即 emit budget:warning-soft */
  private static readonly SOFT_WARN_THRESHOLD = 0.9;

  constructor(
    protected readonly eventBus: DomainEventBus,
    /** 业务事件 type 字符串前缀（如 "my-app" / "research"） */
    protected readonly eventNamespace: string,
  ) {}

  setAbortRegistry(registry: MissionAbortRegistry): void {
    this.abortRegistry = registry;
  }

  clearMission(missionId: string): void {
    this.exhaustedMissions.delete(missionId);
    this.softWarnedMissions.delete(missionId);
  }

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
      type: `${this.eventNamespace}.agent:lifecycle`,
      missionId,
      userId,
      agentId,
      payload: { agentId, role, phase, ...detail },
    });
  }

  /**
   * 记录 stage tokens 消耗 + budget exhaustion 检测 + emit + abort。
   *
   * 业务链修2 (2026-05-06 origin): budget exhausted 立即 emit + abort（覆盖所有
   * stage / chapter writer tickCost 路径）。之前只在 S3 末尾检查一次，S5+ 阶段
   * budget 用尽要 wall-time 4h 才被发现。
   * P1 leak fix (2026-05-06 origin): exhaustedMissions Map 加 60min 过期清理防内存泄漏。
   */
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
      type: `${this.eventNamespace}.cost:tick`,
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
    const now = Date.now();
    for (const [mid, ts] of this.exhaustedMissions) {
      if (now - ts > 60 * 60_000) this.exhaustedMissions.delete(mid);
    }
    for (const [mid, ts] of this.softWarnedMissions) {
      if (now - ts > 60 * 60_000) this.softWarnedMissions.delete(mid);
    }

    // 90% soft warning（先于 isExhausted 检查；exhausted 已是 100%，不重复发软告警）
    if (!pool.isExhausted() && !this.softWarnedMissions.has(missionId)) {
      const capTokens =
        snap.poolTokensUsed + snap.poolTokensRemaining || Infinity;
      const capCost = snap.poolCostUsd + snap.poolCostRemaining || Infinity;
      const tokenRatio = capTokens > 0 ? snap.poolTokensUsed / capTokens : 0;
      const costRatio = capCost > 0 ? snap.poolCostUsd / capCost : 0;
      const ratio = Math.max(tokenRatio, costRatio);
      if (ratio >= EventRelayFramework.SOFT_WARN_THRESHOLD) {
        this.softWarnedMissions.set(missionId, now);
        await this.emitEvent({
          type: `${this.eventNamespace}.budget:warning-soft`,
          missionId,
          userId,
          payload: {
            ...snap,
            ratio,
            tokenRatio,
            costRatio,
            threshold: EventRelayFramework.SOFT_WARN_THRESHOLD,
          },
        });
      }
    }

    if (pool.isExhausted() && !this.exhaustedMissions.has(missionId)) {
      this.exhaustedMissions.set(missionId, now);
      await this.emitEvent({
        type: `${this.eventNamespace}.budget:exhausted`,
        missionId,
        userId,
        payload: snap,
      });
      if (this.abortRegistry) {
        this.abortRegistry.abort(missionId, "budget_exhausted");
      }
    }
  }

  /**
   * IAgentEvent → DomainEvent 翻译。8 类内部事件统一映射到
   * `{namespace}.agent:* / .tools:* / .iteration:* / .agent:validation-rejected`。
   */
  async relayAgentEvents(
    events: readonly IAgentEvent[],
    ctx: EventRelayContext,
  ): Promise<void> {
    for (const ev of events) {
      if (ev.type === "thinking") {
        const p = ev.payload as {
          text: string;
          tokenCount?: number;
          modelId?: string;
        };
        await this.emitEvent({
          type: `${this.eventNamespace}.agent:thought`,
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
          type: `${this.eventNamespace}.agent:action`,
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
          type: `${this.eventNamespace}.agent:observation`,
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
          type: `${this.eventNamespace}.agent:reflection`,
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
          type: `${this.eventNamespace}.agent:error`,
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
          type: `${this.eventNamespace}.tools:recalled`,
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
          type: `${this.eventNamespace}.iteration:progress`,
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
          type: `${this.eventNamespace}.agent:validation-rejected`,
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

  protected truncatePayload(payload: unknown): unknown {
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
        Array.isArray((payload as Record<string, unknown>)["results"])
      ) {
        const obj = payload as Record<string, unknown>;
        const results = obj["results"] as unknown[];
        return {
          ...obj,
          results: results.slice(0, 10),
          _resultsTruncated: results.length > 10,
          _originalResultsCount: results.length,
        };
      }
      return { _truncated: true, preview: s.slice(0, 32_000) + "..." };
    } catch {
      return String(payload);
    }
  }
}
