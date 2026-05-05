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
  runWithStageInstrumentation,
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
import { narrate } from "./narrative.util";
import { runBudgetEstimateStage } from "./stages/s1-mission-estimate-budget.stage";
import { runLeaderPlanStage } from "./stages/s2-leader-plan-mission.stage";
import { runResearcherDispatchStage } from "./stages/s3-researcher-collect-findings.stage";
import { runLeaderAssessResearchStage } from "./stages/s4-leader-assess-research.stage";
import { runReconcilerStage } from "./stages/s5-reconciler-cross-dim-fact-check.stage";
import { runAnalystStage } from "./stages/s6-analyst-synthesize-insights.stage";
import { runWriterOutlineStage } from "./stages/s7-writer-plan-outline.stage";
import { runWriterStage } from "./stages/s8-writer-draft-report.stage";
import { runSectionQualityEnhancementStage } from "./stages/s8b-section-quality-enhancement.stage";
import { runCriticStage } from "./stages/s9-reviewer-critic-l4.stage";
import { runReportObjectiveEvaluationStage } from "./stages/s9b-report-objective-evaluation.stage";
import { runLeaderForewordAndSignoffStage } from "./stages/s10-leader-foreword-and-signoff.stage";
import { runPersistStage } from "./stages/s11-mission-persist.stage";
import { runSelfEvolutionStage } from "./stages/s12-self-evolution.stage";
import { MissionCheckpointService } from "@/modules/ai-harness/facade";
import { MissionEventBuffer } from "../lifecycle/mission-event-buffer.service";
import { MissionStore } from "../lifecycle/mission-store.service";
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
  lastLeaderForeword?: import("./mission-context").MissionContext["leaderForeword"];
  lastLeaderSignOff?: import("./mission-context").MissionContext["leaderSignOff"];
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
    // R2-A.13: s11/s12 hook 需要 missionCheckpoint.clear + eventBuffer.read
    private readonly missionCheckpoint: MissionCheckpointService,
    private readonly missionEventBuffer: MissionEventBuffer,
    // R2-A.13.1: 失败兜底需要 store.markFailed
    private readonly store: MissionStore,
  ) {}

  // ── stepId → DB stageNumber（与 legacy team.mission.ts 对齐）──
  // 用于 markStageComplete + missionCheckpoint.save 的进度索引
  private readonly STAGE_NUMBER: Record<string, number> = {
    "s1-budget": 1,
    "s2-leader-plan": 2,
    "s3-researcher-collect": 3,
    "s4-leader-assess": 4,
    "s5-reconciler": 5,
    "s6-analyst": 6,
    "s7-writer-outline": 7,
    "s8-writer": 8,
    "s8b-quality-enhancement": 8, // 同 s8（quality 增强）
    "s9-critic": 9,
    "s9b-objective-eval": 9,
    "s10-leader-foreword-signoff": 10,
    "s11-persist": 11,
    // s12 在 legacy 不入 stage 计数（fire-and-forget）
  };

  /** S3/S8 milestone 后 save checkpoint，让 pod 崩溃可 resume */
  private readonly CHECKPOINT_AT: Record<string, string> = {
    "s2-leader-plan": "s2-leader-plan",
    "s3-researcher-collect": "s3-researcher-dispatch",
    "s8-writer": "s8-writer-draft",
  };

  /**
   * 每 primitive 的"主 hook"名 —— success-after-this 视为 stage 完成。
   * 助手 hook（extractPlanFields / parseDecision / scoreScaling 等同步）不包，
   * 否则会把同步函数变成 Promise，破坏 primitive 的同步消费链。
   */
  private readonly PRIMARY_HOOK_BY_PRIMITIVE: Record<string, string> = {
    plan: "runRole",
    research: "perItemPipeline",
    assess: "runRole",
    synthesize: "synthesize",
    draft: "draftOnce",
    review: "review",
    signoff: "runRole",
    persist: "persist",
    learn: "postmortemClassifier",
  };

  /**
   * 把"主 hook"包一层进度跟踪：成功后 markStageComplete + 选择性 save
   * checkpoint。对齐 legacy team.mission.ts 的 markStageComplete 调用点。
   *
   * 助手 hook（如 extractPlanFields, parseDecision, scoreScaling）保持原样，
   * 因为 primitive 把它们当同步 / 类型严格的特定签名消费。
   */
  private withProgressTracking(
    stepId: string,
    stageHooks: ResolvedStageHooks,
  ): ResolvedStageHooks {
    const stageNumber = this.STAGE_NUMBER[stepId];
    const checkpointTag = this.CHECKPOINT_AT[stepId];

    // 找该 step 对应的 primitive，取主 hook 名
    const step = PLAYGROUND_PIPELINE.steps.find((s) => s.id === stepId);
    if (!step) return stageHooks;
    const primaryHookName = this.PRIMARY_HOOK_BY_PRIMITIVE[step.primitive];
    if (!primaryHookName) return stageHooks;
    const original = (stageHooks as Record<string, unknown>)[primaryHookName];
    if (typeof original !== "function") return stageHooks;

    const wrappedPrimary = async (args: unknown) => {
      const result = await (original as (a: unknown) => unknown)(args);
      // success path: write progress + checkpoint
      const ctx = (args as { ctx?: { missionId?: string } }).ctx;
      const missionId = ctx?.missionId;
      if (missionId && stageNumber != null) {
        await this.store
          .markStageComplete(missionId, stageNumber)
          .catch(() => undefined);
      }
      if (missionId && checkpointTag) {
        const entry = this.sessions.get(missionId);
        if (entry) {
          const completedKeys = Object.keys(this.STAGE_NUMBER).filter(
            (k) => this.STAGE_NUMBER[k] <= (stageNumber ?? 0),
          );
          await this.missionCheckpoint
            .save(
              missionId,
              {
                lastStage: checkpointTag,
                topic: entry.input.topic,
              },
              completedKeys,
              "running",
            )
            .catch(() => undefined);
        }
      }
      return result;
    };

    return {
      ...stageHooks,
      [primaryHookName]: wrappedPrimary,
    } as unknown as ResolvedStageHooks;
  }

  onModuleInit(): void {
    if (this.registry.has(PLAYGROUND_PIPELINE.id)) return;
    this.registry.register(this.buildPipelineWithHooks());
    this.log.log(
      `[playground-pipeline] registered "${PLAYGROUND_PIPELINE.id}" (14 step / ALL WIRED ★ 试用就绪)`,
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
    // ★ 2026-05-05 增量更新："更新"按钮 → input.inheritFromMissionId 携带源 mission；
    //   从源 mission DB row hydrate plan（dimensions+themeSummary）到 entry.lastPlan，
    //   下游 S2 hook 检测到 lastPlan 已就绪即跳过 LLM 调用并 emit synthetic plan event。
    if (input.inheritFromMissionId) {
      await this.hydrateInheritedPlan(
        missionId,
        userId,
        input.inheritFromMissionId,
      );
    }
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
        // ★ R2-A.13.1 失败兜底：orchestrator 返 status=failed/aborted 时，
        //   补齐 legacy team.mission.ts 的 mission:failed event + markFailed 行为
        //   （pipeline-v1 hook 内部抛错经 orchestrator 包成 stage:failed event +
        //    result.status="failed"，但 mission DB row + 前端事件流缺收尾兜底）
        if (result.status !== "completed") {
          await this.handleMissionFailure(
            missionId,
            userId,
            t0,
            result,
            session,
          );
        } else {
          // ★ R2-A.13.1 成功路径：清 checkpoint（mission 已完整落库）
          await this.missionCheckpoint.clear(missionId).catch(() => undefined);
          // ★ F2 修复：s12 已在 orchestrator 内部跑过（fire-and-forget hook 内部
          //   .catch undefined），不再阻塞返回。如未来想把 s12 拆出独立 fire-and-
          //   forget，需要把 s12 从 PLAYGROUND_PIPELINE.steps 移除 + 这里手动 fire。
        }
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

  /**
   * R2-A.13.1 失败兜底（与 legacy team.mission.ts:265-340 等价）：
   *   1. 检测 cancel（abort signal / cancelled message）→ 不发 mission:failed，
   *      让 controller.cancelMission 已 emit 的 mission:cancelled 接管
   *   2. 分类 failureCode（ORCH_CREDIT_INSUFFICIENT / PROVIDER_BYOK_MODEL_NOT_FOUND
   *      / RUNNER_INPUT_SCHEMA_MISMATCH / RUNNER_WALL_TIME_EXCEEDED /
   *      PROVIDER_RATE_LIMIT / PROVIDER_API_ERROR）
   *   3. emit mission:failed event 含完整 payload（tokensUsed/costUsd/wallTimeMs/
   *      diagnostic.errorStack）
   *   4. store.markFailed 写 partial 产物（reportArtifact / leaderSignOff /
   *      themeSummary 等）让用户能看到部分结果
   */
  private async handleMissionFailure(
    missionId: string,
    userId: string,
    t0: number,
    result: { error?: unknown; status: string },
    session: MissionRuntimeSession,
  ): Promise<void> {
    const err = result.error;
    const message = err instanceof Error ? err.message : String(err);
    const errName = err instanceof Error ? err.name : "Unknown";
    const snap = session.pool.snapshot();
    const wasCancelled =
      session.missionAbort.signal.aborted ||
      result.status === "aborted" ||
      /aborted|cancelled|user_cancelled/i.test(message);
    if (wasCancelled) {
      // mission:cancelled 已由 controller.cancelMission emit；这里不补 mission:failed
      this.log.log(
        `[pipeline-v1] mission ${missionId} cancelled (abort signal aborted) — skipping mission:failed`,
      );
      return;
    }

    let missionFailureCode = "UNKNOWN";
    if (
      errName === "InsufficientCreditsException" ||
      /credit|余额不足|insufficient/i.test(message)
    ) {
      missionFailureCode = "ORCH_CREDIT_INSUFFICIENT";
    } else if (errName === "ByokRequiredError") {
      missionFailureCode = "PROVIDER_BYOK_MODEL_NOT_FOUND";
    } else if (
      errName === "InputValidationError" ||
      errName === "DefineAgentMissingError"
    ) {
      missionFailureCode = "RUNNER_INPUT_SCHEMA_MISMATCH";
    } else if (/timeout|timed out/i.test(message)) {
      missionFailureCode = "RUNNER_WALL_TIME_EXCEEDED";
    } else if (/rate.?limit|429/i.test(message)) {
      missionFailureCode = "PROVIDER_RATE_LIMIT";
    } else {
      missionFailureCode = "PROVIDER_API_ERROR";
    }

    await this.invoker
      .emitEvent({
        type: "agent-playground.mission:failed",
        missionId,
        userId,
        payload: {
          message,
          failureCode: missionFailureCode,
          errorName: errName,
          wallTimeMs: Date.now() - t0,
          tokensUsed: snap.poolTokensUsed,
          costUsd: snap.poolCostUsd,
          diagnostic: {
            errorStack: err instanceof Error ? err.stack : undefined,
          },
        },
      })
      .catch(() => undefined);

    // 写 partial 产物到 DB —— 与 legacy team.mission.ts:317-339 一致
    const entry = this.sessions.get(missionId);
    const reportPayload = entry?.lastReportArtifact ?? entry?.lastReport;
    await this.store
      .markFailed(missionId, {
        errorMessage: message,
        tokensUsed: snap.poolTokensUsed,
        costUsd: snap.poolCostUsd,
        wallTimeMs: Date.now() - t0,
        themeSummary: entry?.lastPlan?.themeSummary,
        dimensions: entry?.lastPlan?.dimensions as unknown[] | undefined,
        report: reportPayload as
          | { title?: string; summary?: string }
          | undefined,
        reportArtifactVersion: entry?.lastReportArtifact
          ? 2
          : entry?.lastReport
            ? 1
            : undefined,
        userProfile: entry?.input,
        reconciliationReport: entry?.lastReconciliationReport,
        verdicts: entry?.lastVerifierVerdicts,
        leaderOverallScore: entry?.lastLeaderSignOff?.leaderOverallScore,
        leaderSigned: entry?.lastLeaderSignOff?.signed,
        leaderVerdict: entry?.lastLeaderSignOff?.leaderVerdict,
      })
      .catch((dbErr) => {
        this.log.error(
          `[pipeline-v1] markFailed for mission ${missionId} failed: ${
            dbErr instanceof Error ? dbErr.message : String(dbErr)
          }`,
        );
      });
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
    const baseHooks = this.buildBaseHooksForStep(stepId, primitive);
    // 包一层 progress tracking（markStageComplete + 选择性 checkpoint.save）
    return this.withProgressTracking(stepId, baseHooks);
  }

  private buildBaseHooksForStep(
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
    if (
      stepId === "s8b-quality-enhancement" ||
      stepId === "s9-critic" ||
      stepId === "s9b-objective-eval"
    ) {
      return this.buildReviewHooks(stepId);
    }
    if (stepId === "s10-leader-foreword-signoff") {
      return this.buildS10SignoffHooks();
    }
    if (stepId === "s11-persist") {
      return this.buildS11PersistHooks();
    }
    if (stepId === "s12-self-evolution") {
      return this.buildS12LearnHooks();
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
   * ★ 2026-05-05 增量更新（"更新"按钮）helper：
   * 从 source mission DB row 重建 plan（dimensions+themeSummary+goals）写入
   * entry.lastPlan，让 S2 hook 检测到后跳过 Leader LLM 调用直接用继承的 plan。
   *
   * 失败兜底：source 不存在 / dimensions 缺失 → log warn，不写 entry.lastPlan，
   * S2 走原有 runLeaderPlanStage 路径（fallback to fresh plan）。
   */
  private async hydrateInheritedPlan(
    missionId: string,
    userId: string,
    sourceMissionId: string,
  ): Promise<void> {
    try {
      const source = await this.store.getById(sourceMissionId, userId);
      if (!source) {
        this.log.warn(
          `[hydrateInheritedPlan] source mission ${sourceMissionId} not found, S2 will run fresh`,
        );
        return;
      }
      const rawDimensions = source.dimensions;
      const themeSummary = (source as { themeSummary?: string | null })
        .themeSummary;
      // ★ 防御 source DB JSON 损坏：每个 dim 必须有 string id + name + rationale
      if (!Array.isArray(rawDimensions) || rawDimensions.length === 0) {
        this.log.warn(
          `[hydrateInheritedPlan] source mission ${sourceMissionId} has no/invalid dimensions, S2 will run fresh`,
        );
        return;
      }
      const dimensions = rawDimensions.filter(
        (
          d,
        ): d is {
          id: string;
          name: string;
          rationale: string;
          toolHint?: { categories: string[]; preferIds?: string[] };
          dependsOn?: string[];
        } =>
          typeof d === "object" &&
          d !== null &&
          typeof (d as { id?: unknown }).id === "string" &&
          typeof (d as { name?: unknown }).name === "string" &&
          typeof (d as { rationale?: unknown }).rationale === "string",
      );
      if (dimensions.length === 0) {
        this.log.warn(
          `[hydrateInheritedPlan] source mission ${sourceMissionId} dimensions all malformed, S2 will run fresh`,
        );
        return;
      }
      if (dimensions.length < rawDimensions.length) {
        this.log.warn(
          `[hydrateInheritedPlan] source mission ${sourceMissionId} dimensions partially malformed: kept ${dimensions.length}/${rawDimensions.length}`,
        );
      }
      const entry = this.sessions.get(missionId);
      if (!entry) return;
      entry.lastPlan = {
        themeSummary: themeSummary ?? "",
        dimensions: dimensions as NonNullable<
          import("./mission-context").MissionContext["plan"]
        >["dimensions"],
        // goals/initialRisks 不从 source DB 反序列化（不在 mission row 持久化里），
        // 留空数组让下游 stage 走兜底逻辑（S4 leader assess 仅消费 dimensions）
        goals: [] as unknown as NonNullable<
          import("./mission-context").MissionContext["plan"]
        >["goals"],
        initialRisks: [] as unknown as NonNullable<
          import("./mission-context").MissionContext["plan"]
        >["initialRisks"],
      };
      this.log.log(
        `[hydrateInheritedPlan] mission ${missionId} inherited plan from ${sourceMissionId} (${dimensions.length} dims)`,
      );
    } catch (err) {
      this.log.warn(
        `[hydrateInheritedPlan] failed for ${sourceMissionId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
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
        // ★ 2026-05-05 增量更新：runMission 已 hydrate entry.lastPlan from source mission；
        //   走 runWithStageInstrumentation 跳过 LLM 调用，保留所有 UI 关键事件
        //   （stage:started / stage:completed with stage='leader' / lifecycle / narrative）
        if (entry.lastPlan && entry.input.inheritFromMissionId) {
          this.log.log(
            `[s2-leader-plan] inheriting from mission ${entry.input.inheritFromMissionId}, skip LLM`,
          );
          const inheritedPlan = entry.lastPlan;
          const sourceMissionId = entry.input.inheritFromMissionId;
          const deps = this.stageBindings.buildDeps();
          const result = await runWithStageInstrumentation(
            {
              missionId: entry.session.missionId,
              userId: entry.session.userId,
              pool: entry.session.pool,
            },
            deps,
            {
              eventPrefix: "agent-playground",
              stageId: "s2-leader-plan",
              role: "leader",
              narrate,
              narrateThinking: `Leader 继承自 mission ${sourceMissionId.slice(0, 8)} 的研究方案（${inheritedPlan.dimensions.length} 个维度），跳过重新规划`,
              narrateSuccess: (out) =>
                `继承方案：${out.dimensions.length} 个维度（${out.dimensions
                  .map((d) => d.name)
                  .slice(0, 3)
                  .join(" / ")}${out.dimensions.length > 3 ? " 等" : ""}）`,
              customMetrics: (out) => ({
                dimensions: out.dimensions,
                themeSummary: out.themeSummary,
                inherited: true,
                sourceMissionId,
              }),
              emitExtras: async (out) => {
                // 同时 emit goals-set 让前端 dim 卡片有 rationale 来源
                await deps
                  .emit({
                    type: "agent-playground.leader:goals-set",
                    missionId: entry.session.missionId,
                    userId: entry.session.userId,
                    payload: {
                      goals: out.goals ?? [],
                      initialRisks: out.initialRisks ?? [],
                    },
                  })
                  .catch(() => undefined);
              },
            },
            async () => ({
              themeSummary: inheritedPlan.themeSummary,
              dimensions: inheritedPlan.dimensions,
              goals: inheritedPlan.goals ?? [],
              initialRisks: inheritedPlan.initialRisks ?? [],
            }),
          );
          // 已 hydrate；result 与 inheritedPlan 等价，写一遍给类型上的 entry 同步
          entry.lastPlan = inheritedPlan;
          return result;
        }
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
   * s8b/s9/s9b review hooks 实装（R2-A.11）—— 三个 review primitive stage
   *
   * review primitive 必填 hooks.review。三个 stage 都是 thin adapter：
   *   s8b-quality-enhancement → runSectionQualityEnhancementStage
   *   s9-critic               → runCriticStage
   *   s9b-objective-eval      → runReportObjectiveEvaluationStage
   *
   * 全部 mutates ctx.reportArtifact / qualityTraceCtx / reportEvaluation 等；
   * 缓存到 entry 让 s10 leader signoff 读 quality 快照。
   */
  private buildReviewHooks(stepId: string): ResolvedStageHooks {
    const stageFn =
      stepId === "s8b-quality-enhancement"
        ? runSectionQualityEnhancementStage
        : stepId === "s9-critic"
          ? runCriticStage
          : runReportObjectiveEvaluationStage;
    const hooks = {
      review: async (args: { ctx: StageRunArgs["ctx"] }): Promise<unknown> => {
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
          reportArtifact: entry.lastReportArtifact,
          report: entry.lastReport,
          reviewScore: entry.lastReviewScore,
          verifierVerdicts: entry.lastVerifierVerdicts,
        });
        await stageFn(stageCtx, this.stageBindings.buildDeps());
        // 回写更新（s8b 可能改 reportArtifact / s9 可能改 reviewScore / s9b 可能加 reportEvaluation）
        entry.lastReportArtifact = stageCtx.reportArtifact;
        entry.lastReviewScore = stageCtx.reviewScore;
        return {
          score: stageCtx.reviewScore,
          verdict: stageCtx.reportArtifact?.quality,
        };
      },
    };
    return hooks as unknown as ResolvedStageHooks;
  }

  /**
   * s10-leader-foreword-signoff hook 实装（R2-A.12）
   *
   * signoff primitive 必填 hooks.runRole。thin adapter 调
   * runLeaderForewordAndSignoffStage（mutates ctx.leaderForeword + leaderSignOff）。
   */
  private buildS10SignoffHooks(): ResolvedStageHooks {
    const hooks = {
      runRole: async (args: { ctx: StageRunArgs["ctx"] }): Promise<unknown> => {
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
          reportArtifact: entry.lastReportArtifact,
          report: entry.lastReport,
          reviewScore: entry.lastReviewScore,
          verifierVerdicts: entry.lastVerifierVerdicts,
          sharedState: { s4PatchFailures: entry.s4PatchFailures },
        });
        await runLeaderForewordAndSignoffStage(
          stageCtx,
          this.stageBindings.buildDeps(),
        );
        entry.lastLeaderForeword = stageCtx.leaderForeword;
        entry.lastLeaderSignOff = stageCtx.leaderSignOff;
        return {
          foreword: stageCtx.leaderForeword,
          signoff: stageCtx.leaderSignOff,
        };
      },
    };
    return hooks as unknown as ResolvedStageHooks;
  }

  /**
   * s11-persist hook 实装（R2-A.13）
   *
   * persist primitive 必填 hooks.persist。s11 是 mission 终态落库，
   * 接受自定义 PersistInput 形态（不直接吃 MissionContext）—— hook 显式拼装。
   * 落库后 clear checkpoint（mission 已成功写入 markCompleted）。
   */
  private buildS11PersistHooks(): ResolvedStageHooks {
    const hooks = {
      persist: async (args: { ctx: StageRunArgs["ctx"] }): Promise<void> => {
        const entry = this.getEntry(args.ctx.missionId);
        await runPersistStage(
          {
            missionId: entry.session.missionId,
            userId: entry.session.userId,
            t0: entry.t0,
            result: {
              report: entry.lastReport,
              reportArtifact: entry.lastReportArtifact as
                | {
                    metadata: { topic?: string; modelTrail?: string[] };
                    quickView?: {
                      executiveSummary?: { markdown?: string };
                    };
                    sections?: Array<{
                      title?: string;
                      startOffset: number;
                      endOffset: number;
                    }>;
                    content?: { fullMarkdown: string };
                  }
                | undefined,
              reviewScore: entry.lastReviewScore,
              themeSummary: entry.lastPlan?.themeSummary,
              dimensions: entry.lastPlan?.dimensions as unknown[] | undefined,
              verdicts: entry.lastVerifierVerdicts,
              userProfile: entry.input,
              reconciliationReport: entry.lastReconciliationReport,
              leaderSignOff: entry.lastLeaderSignOff,
            },
            pool: entry.session.pool,
          },
          this.stageBindings.buildDeps(),
        );
        // mission 已落库，clear checkpoint
        await this.missionCheckpoint
          .clear(entry.session.missionId)
          .catch(() => undefined);
      },
    };
    return hooks as unknown as ResolvedStageHooks;
  }

  /**
   * s12-self-evolution hook 实装（R2-A.13）
   *
   * learn primitive 没有必填 hook（postmortemClassifier / memoryConsolidation
   * 都是 optional）。我们利用 postmortemClassifier 入口调既有
   * runSelfEvolutionStage —— 它内部 fire-and-forget 不抛错（self-evolution
   * 是 best-effort，统计 + memory 索引而已）。
   */
  private buildS12LearnHooks(): ResolvedStageHooks {
    const hooks = {
      postmortemClassifier: async (args: {
        ctx: StageRunArgs["ctx"];
      }): Promise<unknown> => {
        const entry = this.getEntry(args.ctx.missionId);
        const bufferedEvents = this.missionEventBuffer
          .read(entry.session.missionId)
          .map((e) => ({
            type: e.type,
            ts: e.timestamp,
            payload: e.payload,
          }));
        await runSelfEvolutionStage(
          {
            missionId: entry.session.missionId,
            userId: entry.session.userId,
            t0: entry.t0,
            pool: entry.session.pool,
            topic: entry.input.topic,
            plan: entry.lastPlan
              ? {
                  dimensions: (entry.lastPlan.dimensions ?? []) as unknown[],
                  goals: entry.lastPlan.goals,
                }
              : undefined,
            researcherResults: entry.lastResearcherResults as
              | unknown[]
              | undefined,
            reportArtifact: entry.lastReportArtifact as
              | { quality?: { overall?: number }; sections?: unknown[] }
              | undefined,
            leaderSignOff: entry.lastLeaderSignOff,
            abortSignal: entry.session.missionAbort.signal,
            bufferedEvents,
          },
          this.stageBindings.buildDeps(),
        ).catch(() => undefined);
        return { postmortemDone: true };
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
