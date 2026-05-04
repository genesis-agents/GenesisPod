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
      `[playground-pipeline] registered "${PLAYGROUND_PIPELINE.id}" (14 step / s1+s2 wired, s3-s12 NotYetWired)`,
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
