/**
 * AgentInvoker —— playground 内部的兼容门面。
 *
 * 原则：
 * 1. 执行支撑（run / 并发 / DAG）与业务事件语义拆开。
 * 2. Playground 特有的 event type 仍留在 app 层，不下沉到 harness。
 * 3. 现有 role services / stages 调用面先保持不变，避免重构扩散。
 */

import { Injectable } from "@nestjs/common";
import {
  AgentRunner,
  DomainEventBus,
  MissionBudgetPool,
} from "@/modules/ai-harness/facade";
import { BillingRuntimeEnvAdapter } from "@/modules/ai-harness/facade";
import { MissionAbortRegistry } from "@/modules/ai-harness/facade";
import { FailureLearnerService } from "@/modules/ai-harness/facade";
import { AgentExecutionSupport } from "./agent-execution-support";
import { AgentInvocationPolicy } from "./agent-invocation-policy";
import { AgentPlaygroundEventRelay } from "./agent-playground-event-relay";

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
  private readonly execution: AgentExecutionSupport;
  private readonly relay: AgentPlaygroundEventRelay;
  private readonly policy: AgentInvocationPolicy;

  constructor(
    runner: AgentRunner,
    eventBus: DomainEventBus,
    abortRegistry: MissionAbortRegistry,
    failureLearner: FailureLearnerService,
  ) {
    this.execution = new AgentExecutionSupport(runner, abortRegistry);
    this.relay = new AgentPlaygroundEventRelay(eventBus);
    // ★ 业务链修2 (2026-05-06): 把 abortRegistry 注入 relay，让 tickCost 在 budget
    //   exhausted 时立即触发 abort（不再要等到 S3 末尾才检查一次）
    this.relay.setAbortRegistry(abortRegistry);
    this.policy = new AgentInvocationPolicy(failureLearner);
  }

  async invoke<TSpec extends Parameters<AgentRunner["run"]>[0]>(
    Spec: TSpec,
    input: Parameters<AgentRunner["run"]>[1],
    ctx: InvocationContext,
  ): Promise<Awaited<ReturnType<AgentRunner["run"]>>> {
    return this.execution.invoke(Spec, input, ctx, async (event) => {
      await this.relay.relayAgentEvents([event], ctx);
    });
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
  ): Promise<void> {
    await this.relay.tickCost(missionId, userId, stage, pool, deltaTokens);
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
