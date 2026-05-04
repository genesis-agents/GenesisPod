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
import type { MissionInvariants } from "./mission-context";
import type { SupervisedMission } from "../../roles";

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
  ) {}

  onModuleInit(): void {
    if (this.registry.has(PLAYGROUND_PIPELINE.id)) return;
    this.registry.register(this.buildPipelineWithHooks());
    this.log.log(
      `[playground-pipeline] registered "${PLAYGROUND_PIPELINE.id}" (14 step / s1 wired, s2-s12 NotYetWired)`,
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
    this.sessions.set(missionId, { session, t0, input, workspaceId });
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
    return this.buildNotYetWiredHooks(stepId, primitive);
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
        const entry = this.sessions.get(args.ctx.missionId);
        if (!entry) {
          throw new Error(
            `[s1-budget] no active session for mission ${args.ctx.missionId}`,
          );
        }
        // s1 不读 leader（只用 invariants 中的 input/billing/pool/budgetMultiplier）；
        //   placeholder cast 让 TypeScript shape 通过（runBudgetEstimateStage 不会
        //   触碰这个字段）
        const invariants: MissionInvariants = {
          missionId: entry.session.missionId,
          userId: entry.session.userId,
          input: entry.input,
          t0: entry.t0,
          billing: entry.session.billing,
          pool: entry.session.pool,
          leader: undefined as unknown as SupervisedMission,
          budgetMultiplier: entry.session.budgetMultiplier,
        };
        const deps = this.stageBindings.buildDeps();
        await runBudgetEstimateStage(invariants, deps, entry.workspaceId);
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
