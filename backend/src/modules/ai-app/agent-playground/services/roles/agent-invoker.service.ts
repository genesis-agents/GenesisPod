/**
 * AgentInvoker —— per-role services 共享的"调用 + relay + 计费 + 生命周期"基座
 *
 * 设计 (Phase Lead-Services):
 *   • orchestrator 不再持有 runAndRelay / lifecycle / tickCost / 等 helper
 *   • 每个 role service（ResearcherService/WriterService/...）注入 AgentInvoker
 *   • Invoker 完全不感知业务流程，只做"代跑 agent + 把事件 relay 到 WebSocket + 记账"
 *
 * 复用关注:
 *   - runAndRelay 一次性运行 Agent + 实时 relay
 *   - relayAgentEvents 把 IAgentEvent 转成 demo 友好事件
 *   - emitLifecycle / emitEvent / tickCost
 *   - runWithConcurrency / runDagConcurrency
 *   - preDisableKnownFailingModels（跨 mission failure pattern 预查）
 *   - resolveLoopOverride（auditLayers 切 reflexion）
 */

import { Injectable, Logger } from "@nestjs/common";
import {
  AgentRunner,
  DomainEventBus,
  MissionBudgetPool,
  type DomainEvent,
  type IAgentEvent,
} from "../../../../ai-harness/facade";
import { BillingRuntimeEnvAdapter } from "../../../../ai-harness/facade";
import { MissionAbortRegistry } from "../mission/lifecycle/mission-abort.registry";
import { FailureLearnerService } from "@/modules/ai-harness/facade";

/** 每次 invoke 时给到 invoker 的 context，统一所有 role service 入参 shape */
export interface InvocationContext {
  missionId: string;
  userId: string;
  /** demo agentId — 稳定且对人友好（如 "researcher#0"），不是 runtime UUID */
  agentId: string;
  role: string;
  /** 每 mission 独享的 RuntimeEnvironment 适配器（含 BYOK / 余额 / 模型池） */
  envAdapter?: BillingRuntimeEnvAdapter;
  /** budgetProfile 转出的倍率 */
  budgetMultiplier?: number;
  /** Tool Recall hint（dim.toolHint 透传到 AgentRunner 收窄召回） */
  toolRecallHint?: {
    categories?: readonly string[];
    excludeIds?: readonly string[];
    preferIds?: readonly string[];
  };
  /** loop 覆盖（thorough/paranoid 档位切 reflexion） */
  loopOverride?: "react" | "reflexion";
}

function estimateUsdFromTokens(tokens: number): number {
  return tokens * 0.000003;
}

@Injectable()
export class AgentInvoker {
  private readonly log = new Logger(AgentInvoker.name);

  constructor(
    private readonly runner: AgentRunner,
    private readonly eventBus: DomainEventBus,
    private readonly abortRegistry: MissionAbortRegistry,
    private readonly failureLearner: FailureLearnerService,
  ) {}

  /**
   * 一次性运行 Agent + 实时 relay 每个事件 → WebSocket。
   *
   * 第三参数走 RunOptions，让 Harness 自闭包：
   *   - userId         → 自动包 BillingContext
   *   - environment    → 自动注入 <environment> block
   *   - exposeCatalog  → 默认 true，自动注入 <available_tools>
   *   - onEvent        → per-iteration 实时 relay
   */
  async invoke<TSpec extends Parameters<AgentRunner["run"]>[0]>(
    Spec: TSpec,
    input: Parameters<AgentRunner["run"]>[1],
    ctx: InvocationContext,
  ): Promise<Awaited<ReturnType<AgentRunner["run"]>>> {
    const signal = this.abortRegistry.getSignal(ctx.missionId);
    return this.runner.run(Spec, input, {
      userId: ctx.userId,
      environment: ctx.envAdapter,
      budgetMultiplier: ctx.budgetMultiplier,
      toolRecallHint: ctx.toolRecallHint,
      loopOverride: ctx.loopOverride,
      signal,
      billingMeta: {
        moduleType: "agent-playground",
        operationType: ctx.role,
        referenceId: ctx.missionId,
      },
      onEvent: async (ev) => {
        await this.relayAgentEvents([ev], ctx);
      },
    });
  }

  /** 跨 mission 失败模式预查（mission-pipeline-failure-learning.md） */
  async preDisableKnownFailingModels(
    billing: BillingRuntimeEnvAdapter,
    agentSpecId: string,
    promptKey: string,
  ): Promise<{ failed: string; fallback: string }[]> {
    const known = await this.failureLearner
      .lookup({ agentSpecId, systemPrompt: promptKey })
      .catch(() => []);
    const preDisabled: { failed: string; fallback: string }[] = [];
    for (const rec of known) {
      if (rec.count >= 2 && rec.lastFallbackModel) {
        billing.markModelDisabled(rec.modelId, rec.lastFallbackModel);
        preDisabled.push({
          failed: rec.modelId,
          fallback: rec.lastFallbackModel,
        });
      }
    }
    return preDisabled;
  }

  /**
   * auditLayers 档位 → loop override（researcher/reconciler 不走 reflexion）
   * ★ P2-R3-2 (round 3): 补全 stage 类型签名，含 verifier/steward/critic
   */
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
    if (auditLayers === "minimal") return undefined;
    const useReflexion =
      auditLayers === "thorough" || auditLayers === "thorough+";
    if (!useReflexion) return undefined;
    // ★ P1-R4-E (round 4): verifier/critic/steward 是"快速判断"角色，
    // reflexion 反思 loop 反而让它们多花 2-3 倍 tokens 时间却无质量提升；
    // researcher/reconciler 同理（之前已 react-only）
    if (
      stage === "researcher" ||
      stage === "reconciler" ||
      stage === "verifier" ||
      stage === "critic" ||
      stage === "steward"
    )
      return undefined;
    return "reflexion";
  }

  /** 通用 emit —— event 失败不影响主流程 */
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
    // ★ P1-L (2026-04-29): 严重事件（lifecycle / cost / mission:*）至少 log，避免前后端状态不一致诡异
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

  /** lifecycle 事件（started / completed / failed） */
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

  /** 记录本 stage 的 token/cost 增量到 pool，并 emit cost:tick */
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

  /** 简单池化并发 */
  async runWithConcurrency<TIn, TOut>(
    items: readonly TIn[],
    concurrency: number,
    fn: (item: TIn, idx: number) => Promise<TOut>,
  ): Promise<TOut[]> {
    const results: TOut[] = [];
    let cursor = 0;
    const workers = Array.from(
      { length: Math.min(concurrency, items.length) },
      async () => {
        while (cursor < items.length) {
          const idx = cursor++;
          results[idx] = await fn(items[idx], idx);
        }
      },
    );
    await Promise.all(workers);
    return results;
  }

  /**
   * 拓扑序分批并行：每个 item 可声明 dependsOn:string[]；同 batch 并行，跨 batch 串行。
   * 检测到循环时回退到全并行。
   */
  async runDagConcurrency<
    TIn extends { id: string; dependsOn?: string[] },
    TOut,
  >(
    items: readonly TIn[],
    concurrency: number,
    fn: (item: TIn, idx: number) => Promise<TOut>,
  ): Promise<TOut[]> {
    const ids = new Set(items.map((i) => i.id));
    const inDeg = new Map<string, number>();
    const adj = new Map<string, string[]>();
    for (const it of items) {
      const deps = (it.dependsOn ?? []).filter((d) => ids.has(d));
      inDeg.set(it.id, deps.length);
      for (const d of deps) {
        const arr = adj.get(d) ?? [];
        arr.push(it.id);
        adj.set(d, arr);
      }
    }
    const batches: string[][] = [];
    let pending = Array.from(inDeg.entries())
      .filter(([, n]) => n === 0)
      .map(([id]) => id);
    const seen = new Set<string>();
    while (pending.length > 0) {
      batches.push([...pending]);
      pending.forEach((id) => seen.add(id));
      const next: string[] = [];
      for (const id of pending) {
        for (const child of adj.get(id) ?? []) {
          inDeg.set(child, (inDeg.get(child) ?? 0) - 1);
          if (inDeg.get(child) === 0) next.push(child);
        }
      }
      pending = next;
    }
    if (seen.size < items.length) {
      this.log.warn(
        `[runDagConcurrency] cycle or missing deps detected — fallback to flat`,
      );
      return this.runWithConcurrency(items, concurrency, fn);
    }
    const results: TOut[] = new Array(items.length);
    const idToIdx = new Map<string, number>();
    items.forEach((it, i) => idToIdx.set(it.id, i));
    for (const batch of batches) {
      const batchItems = batch.map((id) => items[idToIdx.get(id)!]);
      const batchResults = await this.runWithConcurrency(
        batchItems,
        concurrency,
        async (it) => fn(it, idToIdx.get(it.id)!),
      );
      batchItems.forEach((it, i) => {
        results[idToIdx.get(it.id)!] = batchResults[i];
      });
    }
    return results;
  }

  // ── private ──

  /**
   * 把 RunResult.events 转成 demo 友好事件。
   * 必须 await 每条 emit —— 否则 caller 紧接的 lifecycle:completed 会赶在 trace 之前到达 UI。
   */
  private async relayAgentEvents(
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
        // ★ P0-LIVE-OBS-VERDICT (2026-04-30): reflexion-loop emit 的 payload 是
        //   { revision, score, verdicts: [{judgeId, score, critique}] }，之前
        //   错解构成 {text, verdict} 把所有评分细节扔掉，前端 reflection event
        //   永远只有 role/agentId/originalTs 三字段，不知道 verifier 给了多少分
        //   /哪条 critique 拖低评分。透传完整 payload 让 trace 看得到。
        const p = ev.payload as {
          revision?: number;
          score?: number;
          verdicts?: Array<{
            judgeId: string;
            score: number;
            critique: string;
          }>;
          // legacy fallback
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
        // ★ Phase P1 fix (2026-04-29 mission 8c7b4358)：把 ReAct 每轮进度透到 mission
        // 事件流。用途：前端 UI 可视化死循环（reservoir/timeline 卡 60+ 轮再无 milestone
        // 的场景，原本只有 cost:tick 在涨，现在能看到 iter=12/15 + approachingLimit=true
        // → 用户/监控立即能识别）。
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
      return payload.length > 1500 ? payload.slice(0, 1500) + "…" : payload;
    }
    try {
      const s = JSON.stringify(payload);
      if (s.length <= 4000) return payload;
      return { _truncated: true, preview: s.slice(0, 4000) + "…" };
    } catch {
      return String(payload);
    }
  }
}
