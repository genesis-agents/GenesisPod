/**
 * AgentInvoker —— playground 内部的兼容门面。
 *
 * 原则：
 * 1. 执行支撑（run / 并发 / DAG）与业务事件语义拆开。
 * 2. Playground 特有的 event type 仍留在 app 层，不下沉到 harness。
 * 3. 现有 role services / stages 调用面先保持不变，避免重构扩散。
 */

import { Injectable, Logger, Optional } from "@nestjs/common";
import {
  AgentRunner,
  DomainEventBus,
  MissionBudgetPool,
  isRetryableError,
  calculateBackoffDelay,
  sleep,
} from "@/modules/ai-harness/facade";
import { BillingRuntimeEnvAdapter } from "@/modules/ai-harness/facade";
import { MissionAbortRegistry } from "@/modules/ai-harness/facade";
import { FailureLearnerService } from "@/modules/ai-harness/facade";
import type { IAgentEvent } from "@/modules/ai-harness/facade";
import { AgentExecutionSupport } from "./agent-execution-support";
import { AgentInvocationPolicy } from "./agent-invocation-policy";
import { AgentPlaygroundEventRelay } from "./agent-playground-event-relay";
import { PlaygroundMissionSpanService } from "../mission/workflow/playground-mission-span.service";

/** Maximum number of additional attempts after the first failure (total = 1 + MAX_ROLE_RETRIES) */
const MAX_ROLE_RETRIES = 2;

/** 每次 invoke 时给到 invoker 的 context，统一所有 role service 入参 shape */
export interface InvocationContext {
  missionId: string;
  userId: string;
  agentId: string;
  role: string;
  envAdapter?: BillingRuntimeEnvAdapter;
  budgetMultiplier?: number;
  toolRecallHint?: {
    categories?: readonly string[];
    excludeIds?: readonly string[];
    preferIds?: readonly string[];
  };
  loopOverride?: "react" | "reflexion";
}

@Injectable()
export class AgentInvoker {
  private readonly log = new Logger(AgentInvoker.name);
  private readonly execution: AgentExecutionSupport;
  private readonly relay: AgentPlaygroundEventRelay;
  private readonly policy: AgentInvocationPolicy;
  private readonly abortRegistry: MissionAbortRegistry;

  constructor(
    runner: AgentRunner,
    eventBus: DomainEventBus,
    abortRegistry: MissionAbortRegistry,
    failureLearner: FailureLearnerService,
    @Optional() private readonly spanService?: PlaygroundMissionSpanService,
  ) {
    this.abortRegistry = abortRegistry;
    this.execution = new AgentExecutionSupport(runner, abortRegistry);
    this.relay = new AgentPlaygroundEventRelay(eventBus);
    // ★ 业务链修2 (2026-05-06): 把 abortRegistry 注入 relay，让 tickCost 在 budget
    //   exhausted 时立即触发 abort（不再要等到 S3 末尾才检查一次）
    this.relay.setAbortRegistry(abortRegistry);
    this.policy = new AgentInvocationPolicy(failureLearner);
  }

  /**
   * Invoke a role agent with transient-error retry (up to MAX_ROLE_RETRIES extra attempts).
   *
   * R2-#46: role-level retry + degradation reporting.
   *   - Retries ONLY on transient errors (network/5xx/rate-limit) detected by isRetryableError.
   *   - Non-transient errors (context overflow, auth, 4xx) surface immediately.
   *   - After all retries are exhausted, emits "agent-playground.stage:degraded" so the UI
   *     can surface partial failure without crashing the whole mission.
   *   - AbortSignal abort bypasses retry immediately.
   *
   * R3-#38 (agent-level span nesting): wraps the entire retry loop in a single
   * agent span parented to the currently active stage span (via PlaygroundMissionSpanService).
   * The span covers all retry attempts; the final status reflects the outcome.
   *
   * Deferred: iteration/tool-level nesting requires threading RunOptions.parentSpan
   * through AgentRunner.run() → loop → AgentTracer.startSpan, which touches
   * ai-harness/harness.module DI (outside R3-#38 whitelist). The seam is
   * RunOptions.parentSpan (already documented in AgentRunner.run JSDoc).
   */
  async invoke<TSpec extends Parameters<AgentRunner["run"]>[0]>(
    Spec: TSpec,
    input: Parameters<AgentRunner["run"]>[1],
    ctx: InvocationContext,
  ): Promise<Awaited<ReturnType<AgentRunner["run"]>>> {
    // R3-#38: open agent-level span parented to the active stage span.
    // Span is tracked internally by the service; callers only need startAgentSpan/endAgentSpan.
    this.spanService?.startAgentSpan(ctx.missionId, ctx.agentId);

    const onEvent = async (event: IAgentEvent) => {
      await this.relay.relayAgentEvents([event], ctx);
    };

    let lastError: Error = new Error("unknown role invocation error");
    try {
      for (let attempt = 0; attempt <= MAX_ROLE_RETRIES; attempt++) {
        try {
          const result = await this.execution.invoke(Spec, input, ctx, onEvent);
          this.spanService?.endAgentSpan(
            ctx.missionId,
            ctx.agentId,
            "completed",
          );
          return result;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));

          // Never retry on abort signal
          if (ctx.missionId) {
            const signal = this.abortRegistry.getSignal(ctx.missionId);
            if (signal?.aborted) {
              throw lastError;
            }
          }

          const isTransient = isRetryableError(lastError.message);
          if (attempt < MAX_ROLE_RETRIES && isTransient) {
            const delayMs = calculateBackoffDelay(attempt);
            this.log.warn(
              `[AgentInvoker] role=${ctx.role} mission=${ctx.missionId} attempt=${attempt + 1}/${MAX_ROLE_RETRIES + 1} transient error — retrying in ${delayMs}ms: ${lastError.message}`,
            );
            await sleep(delayMs);
          } else {
            // Permanent error or exhausted retries — emit degraded event then re-throw
            const isDegraded = attempt >= MAX_ROLE_RETRIES && isTransient;
            if (isDegraded) {
              this.log.error(
                `[AgentInvoker] role=${ctx.role} mission=${ctx.missionId} degraded after ${MAX_ROLE_RETRIES + 1} attempts: ${lastError.message}`,
              );
            }
            // R2-#46: emit degraded event so UI can surface partial failure.
            // Uses the registered "stage:degraded" type (passthrough schema accepts
            // all fields); a dedicated role-level degraded type would need an
            // events-file change outside this service whitelist, so stage:degraded
            // is the seam for now.
            await this.relay
              .emitEvent({
                type: "agent-playground.stage:degraded",
                missionId: ctx.missionId,
                userId: ctx.userId,
                agentId: ctx.agentId,
                payload: {
                  stage: ctx.role,
                  reason: `role degraded after ${attempt + 1} attempt(s): ${lastError.message.slice(0, 300)}`,
                  role: ctx.role,
                  agentId: ctx.agentId,
                  attempts: attempt + 1,
                  error: lastError.message.slice(0, 500),
                  transient: isTransient,
                },
              })
              .catch((emitErr: unknown) => {
                this.log.warn(
                  `[AgentInvoker] degraded-event emit failed (non-fatal): ${emitErr instanceof Error ? emitErr.message : String(emitErr)}`,
                );
              });
            throw lastError;
          }
        }
      }
      // Unreachable — TypeScript flow guard
      throw lastError;
    } catch (err) {
      // R3-#38: end agent span with failed status on any thrown error path.
      const thrownErr = err instanceof Error ? err : new Error(String(err));
      this.spanService?.endAgentSpan(
        ctx.missionId,
        ctx.agentId,
        "failed",
        thrownErr,
      );
      throw thrownErr;
    }
  }

  async preDisableKnownFailingModels(
    billing: BillingRuntimeEnvAdapter,
    agentSpecId: string,
    promptKey: string,
  ): Promise<{ failed: string; fallback: string }[]> {
    return this.policy.preDisableKnownFailingModels(
      billing,
      agentSpecId,
      promptKey,
    );
  }

  resolveLoopOverride(
    auditLayers: string,
    stage:
      | "leader"
      | "researcher"
      | "reconciler"
      | "analyst"
      | "writer"
      | "reviewer"
      | "verifier"
      | "critic"
      | "steward",
  ): "react" | "reflexion" | undefined {
    return this.policy.resolveLoopOverride(auditLayers, stage);
  }

  async emitEvent(args: {
    type: string;
    missionId: string;
    userId: string;
    agentId?: string;
    traceId?: string;
    payload: unknown;
  }): Promise<void> {
    await this.relay.emitEvent(args);
  }

  async emitLifecycle(
    missionId: string,
    userId: string,
    agentId: string,
    role: string,
    phase: "started" | "completed" | "failed",
    detail?: Record<string, unknown>,
  ): Promise<void> {
    await this.relay.emitLifecycle(
      missionId,
      userId,
      agentId,
      role,
      phase,
      detail,
    );
  }

  async tickCost(
    missionId: string,
    userId: string,
    stage: string,
    pool: MissionBudgetPool,
    deltaTokens: number,
    /** R2-#36: pass raw agent events so tickCost can read real per-model costUsd */
    agentEvents?: readonly IAgentEvent[],
  ): Promise<void> {
    await this.relay.tickCost(
      missionId,
      userId,
      stage,
      pool,
      deltaTokens,
      agentEvents,
    );
  }

  /**
   * P0-1 (2026-05-06): 清理 relay 层 exhaustedMissions Map 中指定 mission 的条目，
   * 防止 short mission 在 finally 阶段 leak。
   * dispatcher finally 通过本方法转发，不直接访问 private relay。
   */
  clearMissionRelayState(missionId: string): void {
    this.relay.clearMission(missionId);
  }

  async runDagConcurrency<
    TIn extends { id: string; dependsOn?: string[] },
    TOut,
  >(
    items: readonly TIn[],
    concurrency: number,
    fn: (item: TIn, idx: number) => Promise<TOut>,
  ): Promise<TOut[]> {
    return this.execution.runDagConcurrency(items, concurrency, fn);
  }
}
