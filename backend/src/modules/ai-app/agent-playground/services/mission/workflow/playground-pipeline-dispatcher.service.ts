/**
 * PlaygroundPipelineDispatcher —— v5.1 R2-A.1 / R2-A.3 新轨入口
 *
 * 职责：
 *   - 与 TeamMission 同签名（runMission(missionId, input, userId, workspaceId?)）
 *   - 复用 MissionRuntimeShellService.openSession（保持 billing / pool / abort
 *     / heartbeat / DB record / model+credit 校验完全一致）
 *   - 走 MissionPipelineOrchestrator 跑新轨 14 step（hooks 由本 service 通过
 *     buildPipelineWithHooks 注入闭包，闭包从 dispatcher session map 取 session
 *     上下文 + delegate 到 stage adapter）
 *   - cleanup session（成功 / 失败都释放 abort registry / heartbeat timer）
 *
 * 设计要点（与 writing-team service 一致 closure pattern）：
 *   - PLAYGROUND_PIPELINE 在 onModuleInit 注册一次 + hooks 闭包引用 this
 *   - per-mission session 存放在 sessions Map，hook 闭包通过 ctx.missionId 反查；
 *     mission 结束清掉 entry
 *   - 并发安全：每 mission 一个独立 session entry，hook 不共享状态
 *
 * R2-A 增量：
 *   - R2-A.1 (committed): scaffolding + module wiring + 14 step NotYetWired 占位
 *   - R2-A.3 (本 commit): s1-budget hook 实装 = thin adapter 调既有
 *                         runBudgetEstimateStage（其余 13 step 仍 NotYetWired）
 *   - R2-A.4 ~ R2-A.13: s2-s12 hook 逐 stage 实装
 */
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import {
  MissionPipelineOrchestrator,
  MissionPipelineRegistry,
  type MissionPipelineConfig,
  type ResolvedStageHooks,
  type StageRunArgs,
} from "@/modules/ai-harness/facade";
import {
  MissionRuntimeShellService,
  type MissionRuntimeSession,
} from "./mission-runtime-shell.service";
import { MissionStageBindingsService } from "./mission-stage-bindings.service";
import {
  PLAYGROUND_PIPELINE,
  PlaygroundHookNotYetWiredError,
} from "../../../playground.config";
import { type RunMissionInput } from "../../../dto/run-mission.dto";
import { runBudgetEstimateStage } from "./stages/s1-mission-estimate-budget.stage";
import { runLeaderPlanStage } from "./stages/s2-leader-plan-mission.stage";
import { runResearcherDispatchStage } from "./stages/s3-researcher-collect-findings.stage";
import { runLeaderAssessResearchStage } from "./stages/s4-leader-assess-research.stage";
import { runReconcilerStage } from "./stages/s5-reconciler-cross-dim-fact-check.stage";
import { runAnalystStage } from "./stages/s6-analyst-synthesize-insights.stage";
import { runWriterOutlineStage } from "./stages/s7-writer-plan-outline.stage";
import { runWriterStage } from "./stages/s8-writer-draft-report.stage";
import type { MissionInvariants } from "./mission-context";
import {
  AgentInvoker,
  LeaderService,
  type SupervisedMission,
} from "../../roles";
import { LeaderAgent } from "../../../agents/leader/leader.agent";
import type { LeaderRunFn } from "../../roles/leader.service";

export interface PipelineMissionSummary {
  readonly missionId: string;
  readonly status: "completed" | "failed" | "aborted";
  readonly stageOutputs: Readonly<Record<string, unknown>>;
  readonly error?: unknown;
}

interface SessionEntry {
  readonly session: MissionRuntimeSession;
  readonly t0: number;
  readonly input: RunMissionInput;
  readonly workspaceId?: string;
  /**
   * SupervisedMission —— Leader 容器（s2/s4/s10 全程在场）
   * 每 mission 一个，由 leaderService.create + buildLeaderInvocation 构造
   */
  readonly leader: SupervisedMission;
  /**
   * 跨 stage 缓存的中间产物（legacy stage 内部依赖完整 ctx，hook 闭包只能拿到
   * primitive 暴露的 args；这里把每个 stage 写入的 ctx 字段缓存起来供下游重建）。
   */
  lastPlan?: import("./mission-context").MissionContext["plan"];
  lastResearcherResults?: import("./mission-context").MissionContext["researcherResults"];
  lastReconciliationReport?: import("./mission-context").MissionContext["reconciliationReport"];
  lastAnalystOutput?: import("./mission-context").MissionContext["analystOutput"];
  lastOutlinePlan?: import("./mission-context").MissionContext["outlinePlan"];
  lastReport?: import("./mission-context").MissionContext["report"];
  lastReportArtifact?: import("./mission-context").MissionContext["reportArtifact"];
  lastReviewScore?: import("./mission-context").MissionContext["reviewScore"];
  lastVerifierVerdicts?: unknown[];
  /**
   * s4PatchFailures 跨 stage 共享状态（legacy team.mission.ts 用 sharedState
   * 对象 reference 注入，pipeline-v1 用本字段 + buildCtx args.sharedState 同步）
   */
  s4PatchFailures?: import("./mission-context").MissionContext["s4PatchFailures"];
}

@Injectable()
export class PlaygroundPipelineDispatcher implements OnModuleInit {
  private readonly log = new Logger(PlaygroundPipelineDispatcher.name);
  private readonly sessions = new Map<string, SessionEntry>();

  constructor(
    private readonly registry: MissionPipelineRegistry,
    private readonly orchestrator: MissionPipelineOrchestrator,
    private readonly runtimeShell: MissionRuntimeShellService,
    private readonly stageBindings: MissionStageBindingsService,
    private readonly leaderService: LeaderService,
    private readonly invoker: AgentInvoker,
  ) {}

  onModuleInit(): void {
    if (this.registry.has(PLAYGROUND_PIPELINE.id)) return;
    this.registry.register(this.buildPipelineWithHooks());
    this.log.log(
      `[playground-pipeline] registered "${PLAYGROUND_PIPELINE.id}" (14 step / s1-s8 wired, s8b-s12 NotYetWired)`,
    );
  }

  /** spec / hook 闭包用：取出指定 missionId 的活动 session（不存在抛错）*/
  getSession(missionId: string): MissionRuntimeSession {
    const entry = this.sessions.get(missionId);
    if (!entry) {
      throw new Error(
        `[playground-pipeline] no active session for mission ${missionId}`,
      );
    }
    return entry.session;
  }

  /**
   * 跑一次 mission（与 TeamMission.runMission 同签名）。
   *
   * 1. shell.openSession 起 billing / pool / abort / heartbeat
   * 2. orchestrator.run 跑 14 step（每 step 走 hook 闭包）
   * 3. cleanup session
   * 4. 返回最小快照
   */
  async runMission(
    missionId: string,
    input: RunMissionInput,
    userId: string,
    workspaceId?: string,
  ): Promise<PipelineMissionSummary> {
    const t0 = Date.now();
    const session = await this.runtimeShell.openSession({
      missionId,
      input,
      userId,
      workspaceId,
    });
    // 创建 SupervisedMission（Leader 容器）—— 整 mission 复用，s2/s4/s10 都用它
    const leader = this.leaderService.create(
      missionId,
      userId,
      {
        topic: input.topic,
        depth: input.depth,
        language: input.language,
        userProfile: input,
      },
      this.buildLeaderInvocation(missionId, userId, session.billing),
    );
    this.sessions.set(missionId, { session, t0, input, workspaceId, leader });
    try {
      return await this.runtimeShell.runWithinContext(session, async () => {
        const result = await this.orchestrator.run({
          missionId,
          pipelineId: PLAYGROUND_PIPELINE.id,
          input,
          userId,
          tenantId: workspaceId,
          signal: session.missionAbort.signal,
        });
        return {
          missionId: result.missionId,
          status: result.status,
          stageOutputs: result.stageOutputs,
          error: result.error,
        };
      });
    } finally {
      this.sessions.delete(missionId);
      session.cleanup();
    }
  }

  // ── pipeline 构造 ──────────────────────────────────────────────────────

  private buildPipelineWithHooks(): MissionPipelineConfig {
    const stepHooks: Record<string, ResolvedStageHooks> = {};
    for (const step of PLAYGROUND_PIPELINE.steps) {
      stepHooks[step.id] = this.buildHooksForStep(step.id, step.primitive);
    }
    return {
      ...PLAYGROUND_PIPELINE,
      steps: PLAYGROUND_PIPELINE.steps.map((s) => ({
        ...s,
        hooks: stepHooks[s.id] ?? {},
      })),
    };
  }

  /**
   * 为每个 step 构造 hook 闭包。
   *
   * 已实装：
   *   s1-budget (R2-A.3) → 调 runBudgetEstimateStage
   *
   * 待实装（NotYetWired 占位）：
   *   s2-leader-plan, s3-researcher-collect, s4-leader-assess, s5-reconciler,
   *   s6-analyst, s7-writer-outline, s8-writer, s8b-quality-enhancement,
   *   s9-critic, s9b-objective-eval, s10-leader-foreword-signoff,
   *   s11-persist, s12-self-evolution
   */
  private buildHooksForStep(
    stepId: string,
    primitive: string,
  ): ResolvedStageHooks {
    if (stepId === "s1-budget") {
      return this.buildS1BudgetHooks();
    }
    if (stepId === "s2-leader-plan") {
      return this.buildS2LeaderPlanHooks();
    }
    if (stepId === "s3-researcher-collect") {
      return this.buildS3ResearcherCollectHooks();
    }
    if (stepId === "s4-leader-assess") {
      return this.buildS4LeaderAssessHooks();
    }
    if (stepId === "s5-reconciler") {
      return this.buildS5ReconcilerHooks();
    }
    if (stepId === "s6-analyst") {
      return this.buildS6AnalystHooks();
    }
    if (stepId === "s7-writer-outline") {
      return this.buildS7WriterOutlineHooks();
    }
    if (stepId === "s8-writer") {
      return this.buildS8WriterHooks();
    }
    return this.buildNotYetWiredHooks(stepId, primitive);
  }

  /**
   * 构造 LeaderRunFn —— 给 SupervisedMission 用的 LLM 调用闭包。
   * 与 team.mission.ts.buildLeaderInvocation 行为一致（走 invoker.invoke +
   * BillingContext + event relay）；唯一差别是这里在 dispatcher 而非 trunk。
   */
  private buildLeaderInvocation(
    missionId: string,
    userId: string,
    billing: unknown,
  ): LeaderRunFn {
    return async <TIn, TOut>({
      spec,
      input,
      agentId,
    }: {
      spec: typeof LeaderAgent;
      input: TIn;
      agentId: string;
    }): Promise<{
      state: "completed" | "failed" | "cancelled";
      output?: TOut;
      events?: readonly unknown[];
    }> => {
      const result = await this.invoker.invoke(
        spec as unknown as typeof LeaderAgent,
        input as unknown as Record<string, unknown>,
        {
          missionId,
          userId,
          agentId,
          role: "leader",
          envAdapter: billing as never,
        },
      );
      return {
        state:
          result.state === "completed"
            ? "completed"
            : result.state === "cancelled"
              ? "cancelled"
              : "failed",
        output: result.output as TOut | undefined,
        events: result.events,
      };
    };
  }

  /**
   * 公共 helper：从 sessions Map 取 entry，缺失抛错 + 类型收窄
   */
  private getEntry(missionId: string): SessionEntry {
    const entry = this.sessions.get(missionId);
    if (!entry) {
      throw new Error(
        `[playground-pipeline] no active session for mission ${missionId}`,
      );
    }
    return entry;
  }

  /**
   * 构造单 stage 用的 MissionContext（每 stage 独立 ctx，避免 mutable 状态串扰）。
   * partial = caller 已知的 ctx 字段（如 plan，从 previousOutputs 重建）
   */
  private buildStageInvariants(entry: SessionEntry): MissionInvariants {
    return {
      missionId: entry.session.missionId,
      userId: entry.session.userId,
      input: entry.input,
      t0: entry.t0,
      billing: entry.session.billing,
      pool: entry.session.pool,
      leader: entry.leader,
      budgetMultiplier: entry.session.budgetMultiplier,
    };
  }

  /**
   * s1-budget hook 实装（R2-A.3）
   *
   * persist primitive 期望 hooks.persist；s1 模式下"persist"行为是"预算闸门
   * + emit mission:started"，调既有 runBudgetEstimateStage thin adapter。
   *
   * 失败模式（runBudgetEstimateStage 抛 Error "余额不足..."）会被 orchestrator
   * 包成 stage:failed 事件，pipeline-v1 mission 标 failed —— 与 legacy 行为一致。
   */
  private buildS1BudgetHooks(): ResolvedStageHooks {
    const hooks = {
      persist: async (args: {
        ctx: StageRunArgs["ctx"];
        previousOutputs: StageRunArgs["previousOutputs"];
        crossStageState: StageRunArgs["crossStageState"];
      }): Promise<void> => {
        const entry = this.getEntry(args.ctx.missionId);
        const invariants = this.buildStageInvariants(entry);
        const deps = this.stageBindings.buildDeps();
        await runBudgetEstimateStage(invariants, deps, entry.workspaceId);
      },
    };
    return hooks as unknown as ResolvedStageHooks;
  }

  /**
   * s2-leader-plan hook 实装（R2-A.4）
   *
   * plan primitive 必填 hooks.runRole；额外 hooks.extractPlanFields 让 orchestrator
   * 把 plan.dimensions 提取到 stage output（前端 / 下游 stage 需要）。
   *
   * thin adapter：调既有 runLeaderPlanStage（mutates ctx.plan），然后把
   * ctx.plan 作为 raw 返回；extractPlanFields 从 raw 取 dimensions/goals。
   *
   * 失败模式：runLeaderPlanStage 抛错（leader.plan() 失败 / dimensions[] 空）
   * → orchestrator 标 stage:failed → mission failed（与 legacy 一致）。
   */
  private buildS2LeaderPlanHooks(): ResolvedStageHooks {
    const hooks = {
      runRole: async (args: { ctx: StageRunArgs["ctx"] }): Promise<unknown> => {
        const entry = this.getEntry(args.ctx.missionId);
        // buildCtx 复用现有 stageBindings 服务，确保字段映射与 legacy 一致
        const stageCtx = this.stageBindings.buildCtx({
          missionId: entry.session.missionId,
          userId: entry.session.userId,
          input: entry.input,
          t0: entry.t0,
          billing: entry.session.billing,
          pool: entry.session.pool,
          leader: entry.leader,
          budgetMultiplier: entry.session.budgetMultiplier,
        });
        await runLeaderPlanStage(stageCtx, this.stageBindings.buildDeps());
        if (!stageCtx.plan) {
          // runLeaderPlanStage 已经在 dimensions 空时抛错；不应到这里
          throw new Error(
            "[s2-leader-plan] stage returned without populating ctx.plan (unexpected)",
          );
        }
        // 缓存 plan 供 s3 hook 重建 stageCtx 时用（hook 闭包不直接拿到 previousOutputs）
        entry.lastPlan = stageCtx.plan;
        return stageCtx.plan;
      },
      extractPlanFields: (raw: unknown) => {
        const plan = raw as
          | {
              dimensions?: ReadonlyArray<unknown>;
              goals?: unknown;
            }
          | undefined;
        return {
          dimensions: plan?.dimensions ?? [],
          goals: plan?.goals as ReadonlyArray<unknown> | undefined,
        };
      },
    };
    return hooks as unknown as ResolvedStageHooks;
  }

  /**
   * s3-researcher-collect hook 实装（R2-A.5）
   *
   * research primitive 必填 hooks.fanOut + hooks.perItemPipeline。
   * 因为 legacy runResearcherDispatchStage 内部已自带 fan-out + 并发 + DAG +
   * per-dim chapter pipeline + 三层容错（S1 self-heal / S2 cross-mission /
   * S3 dim degraded），本 hook 不重复实现 fan-out 逻辑：
   *   - hooks.fanOut 返回 [singleton]，让 primitive 跑 1 次 perItemPipeline
   *   - hooks.perItemPipeline 调整个 runResearcherDispatchStage（mutates ctx.researcherResults）
   *   - 返回 ctx.researcherResults 让 orchestrator 写到 stageOutputs
   *
   * 这是 thin adapter 妥协：让 legacy stage 自管 fan-out，primitive 退化为
   * "单次包装"。R2-C 删 legacy 后再考虑用 primitive 原生 fan-out 重写。
   *
   * 失败模式：
   *   · runResearcherDispatchStage 自身吞掉单 dim 失败（emit ORCH_DIMENSION_DEGRADED）
   *   · 整 stage 抛错（如 ctx.plan 缺失）→ orchestrator 标 stage:failed
   *   · 跨 stage 状态：s4PatchFailures 由 ctx.s4PatchFailures 持续，下游 hook
   *     通过 sessions[missionId] 共享 ctx 读取（R2-A.6 起处理）
   */
  private buildS3ResearcherCollectHooks(): ResolvedStageHooks {
    const hooks = {
      fanOut: (_args: {
        ctx: StageRunArgs["ctx"];
        previousOutputs: StageRunArgs["previousOutputs"];
      }): ReadonlyArray<unknown> => {
        // 单 singleton —— legacy stage 自管 fan-out
        return [{ kind: "all-dimensions" }];
      },
      perItemPipeline: async (args: {
        item: unknown;
        role: StageRunArgs["role"];
        ctx: StageRunArgs["ctx"];
      }): Promise<unknown> => {
        const entry = this.getEntry(args.ctx.missionId);
        // research primitive 的 perItemPipeline 签名不直接给 previousOutputs；
        // 从 entry.lastPlan 取（s2 hook 末尾把 stageCtx.plan 缓存到 entry）
        const cachedPlan = entry.lastPlan;
        if (!cachedPlan) {
          throw new Error(
            "[s3-researcher-collect] no plan from s2 (sessions[missionId].lastPlan undefined)",
          );
        }
        const stageCtx = this.stageBindings.buildCtx({
          missionId: entry.session.missionId,
          userId: entry.session.userId,
          input: entry.input,
          t0: entry.t0,
          billing: entry.session.billing,
          pool: entry.session.pool,
          leader: entry.leader,
          budgetMultiplier: entry.session.budgetMultiplier,
          plan: cachedPlan,
        });
        await runResearcherDispatchStage(
          stageCtx,
          this.stageBindings.buildDeps(),
        );
        // 缓存 researcherResults 给下游 hook 用
        entry.lastResearcherResults = stageCtx.researcherResults;
        // s4PatchFailures sharedState 同步（s3 内部可能积累）
        if (stageCtx.s4PatchFailures && stageCtx.s4PatchFailures.length > 0) {
          entry.s4PatchFailures = stageCtx.s4PatchFailures;
        }
        return stageCtx.researcherResults;
      },
    };
    return hooks as unknown as ResolvedStageHooks;
  }

  /**
   * s4-leader-assess hook 实装（R2-A.6）
   *
   * assess primitive 必填 hooks.runRole + hooks.parseDecision。
   * 与 s3 同款 thin adapter：legacy runLeaderAssessResearchStage 内部已经
   * 完成 leader.assessResearchers + per-dim dispatch（retry/abort/extend）+
   * mutates ctx.researcherResults/plan，本 hook 不重写决策逻辑：
   *   hooks.runRole → 调整个 runLeaderAssessResearchStage（mutates ctx）
   *                   返回 "ok" 标记（assess 决策已被 legacy stage 内部处理 + 落地）
   *   hooks.parseDecision → 返 "continue"（legacy 决定 abort 时自己 throw，到不了这）
   *
   * 失败模式：
   *   · runLeaderAssessResearchStage 主动 throw "Leader aborted mission..."
   *     → orchestrator 标 stage:failed → mission failed
   *   · per-dim retry 失败累积到 entry.s4PatchFailures（s10 签字时读）
   */
  private buildS4LeaderAssessHooks(): ResolvedStageHooks {
    const hooks = {
      runRole: async (args: { ctx: StageRunArgs["ctx"] }): Promise<unknown> => {
        const entry = this.getEntry(args.ctx.missionId);
        if (!entry.lastPlan) {
          throw new Error("[s4-leader-assess] no plan from s2");
        }
        if (!entry.lastResearcherResults) {
          throw new Error("[s4-leader-assess] no researcherResults from s3");
        }
        const stageCtx = this.stageBindings.buildCtx({
          missionId: entry.session.missionId,
          userId: entry.session.userId,
          input: entry.input,
          t0: entry.t0,
          billing: entry.session.billing,
          pool: entry.session.pool,
          leader: entry.leader,
          budgetMultiplier: entry.session.budgetMultiplier,
          plan: entry.lastPlan,
          researcherResults: entry.lastResearcherResults,
          sharedState: { s4PatchFailures: entry.s4PatchFailures },
        });
        await runLeaderAssessResearchStage(
          stageCtx,
          this.stageBindings.buildDeps(),
        );
        // legacy stage mutates ctx.researcherResults / ctx.plan.dimensions / s4PatchFailures —
        // 把变化回写到 entry 让下游 hook 能读
        entry.lastResearcherResults = stageCtx.researcherResults;
        entry.lastPlan = stageCtx.plan;
        if (stageCtx.s4PatchFailures && stageCtx.s4PatchFailures.length > 0) {
          entry.s4PatchFailures = stageCtx.s4PatchFailures;
        }
        return { ok: true };
      },
      parseDecision: (_raw: unknown): "continue" => {
        // legacy stage 已经内部 dispatch 了所有 action（retry / abort / extend）；
        // 主动 abort 在 stage 内 throw 不到这里。返 "continue" 让 primitive
        // 走完 happy path，stageOutputs[s4-leader-assess]={ decision:"continue", raw:{ok:true} }
        return "continue";
      },
    };
    return hooks as unknown as ResolvedStageHooks;
  }

  /**
   * s5-reconciler hook 实装（R2-A.7）
   *
   * synthesize primitive (mode=reconcile) 必填 hooks.synthesize。
   * thin adapter：调 runReconcilerStage（mutates ctx.reconciliationReport），
   * 返回 stageCtx.reconciliationReport（synthesize primitive 包成 { result }）。
   */
  private buildS5ReconcilerHooks(): ResolvedStageHooks {
    const hooks = {
      synthesize: async (args: {
        ctx: StageRunArgs["ctx"];
      }): Promise<unknown> => {
        const entry = this.getEntry(args.ctx.missionId);
        if (!entry.lastPlan || !entry.lastResearcherResults) {
          throw new Error(
            "[s5-reconciler] missing plan/researcherResults from prev stages",
          );
        }
        const stageCtx = this.stageBindings.buildCtx({
          missionId: entry.session.missionId,
          userId: entry.session.userId,
          input: entry.input,
          t0: entry.t0,
          billing: entry.session.billing,
          pool: entry.session.pool,
          leader: entry.leader,
          budgetMultiplier: entry.session.budgetMultiplier,
          plan: entry.lastPlan,
          researcherResults: entry.lastResearcherResults,
        });
        await runReconcilerStage(stageCtx, this.stageBindings.buildDeps());
        entry.lastReconciliationReport = stageCtx.reconciliationReport;
        return stageCtx.reconciliationReport;
      },
    };
    return hooks as unknown as ResolvedStageHooks;
  }

  /**
   * s6-analyst hook 实装（R2-A.8）
   *
   * synthesize primitive (mode=analyze) 必填 hooks.synthesize。
   * thin adapter：调 runAnalystStage（mutates ctx.analystOutput）。
   */
  private buildS6AnalystHooks(): ResolvedStageHooks {
    const hooks = {
      synthesize: async (args: {
        ctx: StageRunArgs["ctx"];
      }): Promise<unknown> => {
        const entry = this.getEntry(args.ctx.missionId);
        if (!entry.lastPlan || !entry.lastResearcherResults) {
          throw new Error(
            "[s6-analyst] missing plan/researcherResults from prev stages",
          );
        }
        const stageCtx = this.stageBindings.buildCtx({
          missionId: entry.session.missionId,
          userId: entry.session.userId,
          input: entry.input,
          t0: entry.t0,
          billing: entry.session.billing,
          pool: entry.session.pool,
          leader: entry.leader,
          budgetMultiplier: entry.session.budgetMultiplier,
          plan: entry.lastPlan,
          researcherResults: entry.lastResearcherResults,
          reconciliationReport: entry.lastReconciliationReport,
        });
        await runAnalystStage(stageCtx, this.stageBindings.buildDeps());
        entry.lastAnalystOutput = stageCtx.analystOutput;
        return stageCtx.analystOutput;
      },
    };
    return hooks as unknown as ResolvedStageHooks;
  }

  /**
   * s7-writer-outline hook 实装（R2-A.9）
   *
   * draft primitive (mode=outline) 必填 hooks.draftOnce。
   * thin adapter：调 runWriterOutlineStage（仅 thorough+ 档位真跑，否则 no-op）。
   * 写入 entry.lastOutlinePlan 给 s8 用。
   */
  private buildS7WriterOutlineHooks(): ResolvedStageHooks {
    const hooks = {
      draftOnce: async (args: {
        ctx: StageRunArgs["ctx"];
      }): Promise<unknown> => {
        const entry = this.getEntry(args.ctx.missionId);
        const stageCtx = this.stageBindings.buildCtx({
          missionId: entry.session.missionId,
          userId: entry.session.userId,
          input: entry.input,
          t0: entry.t0,
          billing: entry.session.billing,
          pool: entry.session.pool,
          leader: entry.leader,
          budgetMultiplier: entry.session.budgetMultiplier,
          plan: entry.lastPlan,
          researcherResults: entry.lastResearcherResults,
          reconciliationReport: entry.lastReconciliationReport,
        });
        await runWriterOutlineStage(stageCtx, this.stageBindings.buildDeps());
        entry.lastOutlinePlan = stageCtx.outlinePlan;
        return stageCtx.outlinePlan ?? null;
      },
    };
    return hooks as unknown as ResolvedStageHooks;
  }

  /**
   * s8-writer hook 实装（R2-A.10）—— 14 stage 中最大的（450+ 行业务逻辑）
   *
   * draft primitive (mode=full) 必填 hooks.draftOnce。
   * thin adapter 调 runWriterStage（mutates ctx.report / reportArtifact /
   * reviewScore / verifierVerdicts，含 judgeConsensusRetry + memoryIndexer +
   * reportArtifactAssembler 全部业务逻辑）。
   */
  private buildS8WriterHooks(): ResolvedStageHooks {
    const hooks = {
      draftOnce: async (args: {
        ctx: StageRunArgs["ctx"];
      }): Promise<unknown> => {
        const entry = this.getEntry(args.ctx.missionId);
        if (!entry.lastPlan || !entry.lastResearcherResults) {
          throw new Error("[s8-writer] missing plan/researcherResults");
        }
        const stageCtx = this.stageBindings.buildCtx({
          missionId: entry.session.missionId,
          userId: entry.session.userId,
          input: entry.input,
          t0: entry.t0,
          billing: entry.session.billing,
          pool: entry.session.pool,
          leader: entry.leader,
          budgetMultiplier: entry.session.budgetMultiplier,
          plan: entry.lastPlan,
          researcherResults: entry.lastResearcherResults,
          reconciliationReport: entry.lastReconciliationReport,
        });
        // s7 outlinePlan 通过 mutable ctx 字段透传（buildCtx 不直接接受 outlinePlan，
        // 但 runWriterStage 从 ctx.outlinePlan 读 —— 直接 assign 到 stageCtx）
        if (entry.lastOutlinePlan) {
          (stageCtx as { outlinePlan?: unknown }).outlinePlan =
            entry.lastOutlinePlan;
        }
        // runWriterStage 接受 (ctx, deps, analyst, workspaceId)
        const analyst = (entry.lastAnalystOutput as
          | {
              insights?: unknown[];
              themeSummary?: string;
              contradictions?: unknown[];
            }
          | undefined) ?? {
          insights: [],
          themeSummary: entry.lastPlan?.themeSummary ?? "",
        };
        await runWriterStage(
          stageCtx,
          this.stageBindings.buildDeps(),
          {
            insights: analyst.insights ?? [],
            themeSummary: analyst.themeSummary ?? "",
            contradictions: analyst.contradictions,
          },
          entry.workspaceId,
        );
        // 缓存 s8 产物供 s8b/s9/s9b/s10/s11 用
        entry.lastReport = stageCtx.report;
        entry.lastReportArtifact = stageCtx.reportArtifact;
        entry.lastReviewScore = stageCtx.reviewScore;
        entry.lastVerifierVerdicts = stageCtx.verifierVerdicts as unknown[];
        return stageCtx.reportArtifact ?? stageCtx.report ?? null;
      },
    };
    return hooks as unknown as ResolvedStageHooks;
  }

  /**
   * NotYetWired 占位（R2-A.4~A.13 替换）—— 各 primitive 的必填 hook 全部抛错。
   */
  private buildNotYetWiredHooks(
    stepId: string,
    primitive: string,
  ): ResolvedStageHooks {
    const requiredHooks: Record<string, ReadonlyArray<string>> = {
      plan: ["runRole"],
      research: ["fanOut", "perItemPipeline"],
      assess: ["runRole", "parseDecision"],
      synthesize: ["synthesize"],
      draft: ["draftOnce"],
      review: ["review"],
      signoff: ["runRole"],
      persist: ["persist"],
      learn: [], // postmortemClassifier / memoryConsolidation 都 optional
    };
    const hooks: ResolvedStageHooks = {};
    const required = requiredHooks[primitive] ?? [];
    for (const name of required) {
      (hooks as Record<string, unknown>)[name] = () => {
        throw new PlaygroundHookNotYetWiredError(stepId, name);
      };
    }
    return hooks;
  }
}

export type PipelineHookCtx = StageRunArgs["ctx"];
