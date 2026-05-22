/**
 * SocialAgentInvoker — playground AgentInvoker 的 social 对应物
 *
 * 责任：
 *   1. 把 AgentRunner.run() 用 social 业务上下文（missionId / userId / role）包装
 *   2. abortRegistry signal 注入（mission 终止时立即停 agent）
 *   3. agent 事件经 SocialEventRelay 转 social.* 前缀广播
 *   4. tickCost 把 token spend 计入 MissionBudgetPool（mission 总预算闸）
 *
 * 设计简化 vs playground:
 *   - 不持有 FailureLearner / InvocationPolicy（PR-5 publish-executor 真接通时再加）
 *   - 不实现 DAG concurrency（social 多平台用平面 ConcurrencyLimiter 即可）
 */

import { Injectable } from "@nestjs/common";
import {
  AgentRunner,
  DomainEventBus,
  MissionAbortRegistry,
  MissionBudgetPool,
  type IAgentEvent,
  type BillingRuntimeEnvAdapter,
} from "@/modules/ai-harness/facade";
import { SocialEventRelay } from "./social-event-relay";

export interface SocialInvocationContext {
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
export class SocialAgentInvoker {
  private readonly relay: SocialEventRelay;

  constructor(
    private readonly runner: AgentRunner,
    eventBus: DomainEventBus,
    private readonly abortRegistry: MissionAbortRegistry,
  ) {
    this.relay = new SocialEventRelay(eventBus);
    this.relay.setAbortRegistry(abortRegistry);
  }

  async invoke<TSpec extends Parameters<AgentRunner["run"]>[0]>(
    Spec: TSpec,
    input: Parameters<AgentRunner["run"]>[1],
    ctx: SocialInvocationContext,
  ): Promise<Awaited<ReturnType<AgentRunner["run"]>>> {
    const signal = this.abortRegistry.getSignal(ctx.missionId);
    const startedAt = Date.now();
    // per-agent lifecycle —— social 此前从不发 agent:lifecycle，前端拿不到精确
    // agent 状态/wallTime（只能按 stage 兜底）。在唯一 invoke 出口统一发，覆盖 9 个角色。
    // started 用 fire-and-forget（emit 慢/挂不阻塞主流水线；CLAUDE.md 反向洞察 #4）。
    void this.relay.emitLifecycle(
      ctx.missionId,
      ctx.userId,
      ctx.agentId,
      ctx.role,
      "started",
    );
    try {
      const result = await this.runner.run(Spec, input, {
        userId: ctx.userId,
        environment: ctx.envAdapter,
        budgetMultiplier: ctx.budgetMultiplier,
        toolRecallHint: ctx.toolRecallHint,
        loopOverride: ctx.loopOverride,
        signal,
        billingMeta: {
          moduleType: "ai-social",
          operationType: ctx.role,
          referenceId: ctx.missionId,
        },
        onEvent: async (event: IAgentEvent) => {
          await this.relay.relayAgentEvents([event], ctx);
        },
      });
      await this.relay.emitLifecycle(
        ctx.missionId,
        ctx.userId,
        ctx.agentId,
        ctx.role,
        result.state === "failed" ? "failed" : "completed",
        { wallTimeMs: Date.now() - startedAt, iterations: result.iterations },
      );
      return result;
    } catch (err) {
      await this.relay.emitLifecycle(
        ctx.missionId,
        ctx.userId,
        ctx.agentId,
        ctx.role,
        "failed",
        {
          wallTimeMs: Date.now() - startedAt,
          error: err instanceof Error ? err.message : String(err),
        },
      );
      throw err;
    }
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

  clearMissionRelayState(missionId: string): void {
    this.relay.clearMission(missionId);
  }
}

/**
 * Re-export harness facade extractTokenSpend
 *
 * Round-2 Reviewer A P1: 移除 social local copy，统一走 facade 版（处理
 * thinking token，本地版会漏算）。9 个 role service 透过 ./roles barrel
 * 拿到的仍是同名 export，无需改 import path。
 */
export { extractTokenSpend } from "@/modules/ai-harness/facade";
