/**
 * TeamMission —— mission 主剧本（trunk）
 *
 * 11 个 stage 顺序串起 mission 全流程，每个 stage 是一个独立 .stage.ts 文件，
 * 命名规则：s{序号}-{agent}-{职责}.stage.ts
 *
 *   s1  mission    estimate-budget          预算闸门 + mission:started
 *   s2  leader     plan-mission             Leader 维度规划 + 声明 goals
 *   s3  researcher collect-findings         researcher×N 并行 + per-dim chapter pipeline
 *   s4  leader     assess-research          Leader 看 researcher 产出，retry/abort/extend
 *   s5  reconciler cross-dim-fact-check     跨 dim 对账 → factTable / conflicts / gaps
 *   s6  analyst    synthesize-insights      跨 dim 综合 insights / themeSummary
 *   s7  writer     plan-outline             thorough+ 档位下规划 mission 级章节大纲
 *   s8  writer     draft-report             起草 + L3 三路评分 + memory 入库 + assemble
 *   s9  reviewer   critic-l4                独立 meta-review（blindspots / biases）
 *   s10 leader     foreword-and-signoff     Leader 综合摘要 + 签字（accountabilityNote）
 *   s11 mission    persist                  按签字结果 markCompleted / markFailed
 *
 * 三层架构：
 *   Mission（本文件，业务剧本）→ Agent（agents/，单步认知）→ Harness（ai-engine，执行底座）
 *
 * 跨 stage 共享状态由 MissionContext 持有；stage 函数依赖打包成 MissionDeps 注入
 * （见同级 mission-context.ts / mission-deps.ts）。
 *
 * 事件粒度（emit 类型）：
 *   mission:started / mission:completed / mission:rejected
 *   stage:started / stage:completed / agent:lifecycle / agent:thought
 *   agent:action / agent:observation / cost:tick / verifier:verdict
 *   leader:goals-set / leader:decision / leader:foreword / leader:signed
 *   report:draft / memory:indexed / dimension:*
 */

import { Injectable, Logger } from "@nestjs/common";
import {
  AgentRunner,
  DomainEventBus,
  FigureRelevanceService,
  JudgeService,
  MemoryAutoIndexer,
  MissionBudgetPool,
  // ★ 沉淀消费 v3 (2026-04-29): quality 闭环
  SectionSelfEvalService,
  SectionRemediationService,
  ReportEvaluationService,
  QualityTraceComputeService,
  // ★ Phase 5 (2026-04-29): mission checkpoint
  MissionCheckpointService,
} from "../../../../../ai-harness/facade";
import { FigureExtractorService } from "../../../../../ai-engine/facade";
import { BillingContext } from "../../../../../ai-infra/credits/billing-context";
import { withUserContext } from "../../../../../../common/context";
import { CreditsService } from "../../../../../ai-infra/credits/credits.service";
// ★ P2-R3-3 (round 3): 与同文件相邻 import 统一相对路径风格
import { RuntimeEnvironmentService } from "../../../../../ai-harness/facade";
import { LeaderAgent } from "../../../agents/leader/leader.agent";
import {
  LeaderService,
  SupervisedMission,
  ReconcilerService,
  AnalystService,
  WriterService,
  ReviewerService,
  VerifierService,
  StewardService,
  AgentInvoker,
} from "../../roles";
import { ReportAssemblerService } from "../../artifact/report-assembler.service";
import { MissionStateService } from "../lifecycle/mission-state.service";
import { MissionAbortRegistry } from "../lifecycle/mission-abort.registry";
// MissionReviewerAgent: 当前 mission 评审走 VerifierService（多 judge 投票），
// MissionReviewerAgent class 已声明但 orchestrator 暂未直接调用，保留为后续替换 path。
import {
  type ResearchReport,
  resolveBudgetMultiplier,
  resolveMissionCredits,
  resolveMissionWallTimeMs,
  type RunMissionInput,
} from "../../../dto/run-mission.dto";
import { BillingRuntimeEnvAdapter } from "../../../../../ai-harness/facade";
import { MissionStore } from "../lifecycle/mission-store.service";
import { HarnessFailureLearner } from "../../failure-learning/harness-failure-learner.service";
import type { MissionContext } from "./mission-context";
import type { MissionDeps } from "./mission-deps";
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

interface MissionResult {
  readonly missionId: string;
  readonly report: ResearchReport;
  readonly reviewScore: number;
  readonly costUsd: number;
  readonly trajectoryStored: number;
  readonly themeSummary?: string;
  readonly dimensions?: { id: string; name: string; rationale: string }[];
  readonly verdicts?: {
    verifierId: string;
    score: number;
    critique?: string;
    attempt?: number;
  }[];
  // ReportArtifact v2（结构化输出，三视图共享）
  readonly reportArtifact?: import("../../../dto/report-artifact.dto").ReportArtifact;
  // Reconciler [3.5] 产物
  readonly reconciliationReport?: unknown;
  // 用户档位 merged 后快照
  readonly userProfile?: unknown;
  // signoff 产物
  readonly leaderSignOff?: {
    leaderOverallScore: number;
    leaderVerdict: "excellent" | "good" | "acceptable" | "failed";
    accountabilityNote: string;
    signed: boolean;
    refusalReason?: string;
  };
}

@Injectable()
export class TeamMission {
  private readonly log = new Logger(TeamMission.name);

  constructor(
    private readonly runner: AgentRunner,
    private readonly judge: JudgeService,
    private readonly indexer: MemoryAutoIndexer,
    private readonly eventBus: DomainEventBus,
    private readonly credits: CreditsService,
    private readonly runtimeEnv: RuntimeEnvironmentService,
    private readonly store: MissionStore,
    private readonly failureLearner: HarnessFailureLearner,
    private readonly reportAssembler: ReportAssemblerService,
    private readonly missionState: MissionStateService,
    private readonly abortRegistry: MissionAbortRegistry,
    private readonly leaderService: LeaderService,
    // per-role services（stage 文件通过 deps 间接调用，注入到 trunk 供 buildStageDeps 打包）
    private readonly reconcilerService: ReconcilerService,
    private readonly analystService: AnalystService,
    private readonly writerService: WriterService,
    private readonly reviewerService: ReviewerService,
    private readonly verifierService: VerifierService,
    private readonly stewardService: StewardService,
    private readonly invoker: AgentInvoker,
    // ★ 沉淀（2026-04-29）: figure pipeline（agent-playground 复用 ai-engine + ai-harness 沉淀版）
    private readonly figureExtractor: FigureExtractorService,
    private readonly figureRelevance: FigureRelevanceService,
    // ★ 沉淀消费 v3 (2026-04-29): quality 闭环
    private readonly sectionSelfEval: SectionSelfEvalService,
    private readonly sectionRemediation: SectionRemediationService,
    private readonly reportEvaluation: ReportEvaluationService,
    private readonly qualityTraceCompute: QualityTraceComputeService,
    // ★ Phase 5 (2026-04-29): 接入 ai-harness 沉淀的 mission checkpoint
    private readonly missionCheckpoint: MissionCheckpointService,
  ) {}

  /**
   * 给 LeaderService 用的 runFn —— 复用 orchestrator 的 runner +
   * 让 leader 调用同样走 BillingContext / event relay。
   */
  private buildLeaderInvocation(
    missionId: string,
    userId: string,
    billing: unknown,
  ): import("../../roles/leader.service").LeaderRunFn {
    const fn = async <TIn, TOut>({
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
    return fn;
  }

  async runMission(
    missionId: string,
    input: RunMissionInput,
    userId: string,
    workspaceId?: string,
  ): Promise<MissionResult> {
    // 注册 abort controller + mission 级 wall-time（按 depth × audit × budget 联动）
    const missionAbort = this.abortRegistry.register(missionId);
    const MISSION_WALL_TIME_MS = resolveMissionWallTimeMs(input);
    this.log.log(
      `[${missionId}] mission wall-time = ${Math.round(MISSION_WALL_TIME_MS / 60000)}min ` +
        `(depth=${input.depth}, audit=${input.auditLayers}, budget=${input.budgetProfile})`,
    );
    const wallTimer = setTimeout(() => {
      this.log.warn(
        `[${missionId}] mission wall-time exceeded (${MISSION_WALL_TIME_MS}ms) — auto abort`,
      );
      void this.invoker
        .emitEvent({
          type: "agent-playground.mission:budget-warning-hard",
          missionId,
          userId,
          payload: {
            reason: "wall_time_exceeded",
            wallTimeMs: MISSION_WALL_TIME_MS,
          },
        })
        .catch(() => {});
      missionAbort.abort("mission_wall_time_exceeded");
    }, MISSION_WALL_TIME_MS);
    const billing = new BillingRuntimeEnvAdapter(
      userId,
      workspaceId,
      this.credits,
      this.runtimeEnv,
    );

    const effectiveMaxCredits = resolveMissionCredits(input);
    // 1 credit ≈ 1k tokens；max 10k credits = 10M tokens 上限保护，足够任何
    // 实际研究任务。配合 budgetProfile=unlimited 时基本不触发上限。
    const pool = new MissionBudgetPool({
      maxTokens: effectiveMaxCredits * 1000,
      maxCostUsd: effectiveMaxCredits * 0.002,
    });

    // 预检 1：模型可用性 —— 用户 BYOK 默认模型必须真实可用。
    // 否则 mission 会跑到第一次 LLM 调用才空响应，浪费 1-2 分钟才报错。
    try {
      const allModels = await billing.listAvailableModels();
      const healthy = allModels.filter((m) => m.available);
      if (allModels.length > 0 && healthy.length === 0) {
        const ids = allModels.map((m) => m.modelId).join(", ");
        const msg = `用户 BYOK 配置的所有模型均不可用：${ids}。请前往 设置 → 模型 检查 model id 是否真实存在 / API key 是否有效`;
        await this.invoker.emitEvent({
          type: "agent-playground.mission:rejected",
          missionId,
          userId,
          payload: {
            reason: "no_healthy_model",
            availableCount: 0,
            totalCount: allModels.length,
            userMessage: msg,
          },
        });
        throw new Error(msg);
      }
      // ★ P0-CONFIG-MODEL (2026-04-30): 仅 1 个 healthy 模型时给 warning event，
      //   让前端能展示"无 fallback"提示。任一模型 rate-limit/失败时整个 mission
      //   会全 fail。non-blocking warning，不抛错。
      if (healthy.length === 1) {
        await this.invoker
          .emitEvent({
            type: "agent-playground.mission:warning",
            missionId,
            userId,
            payload: {
              code: "SINGLE_MODEL_NO_FALLBACK",
              modelId: healthy[0].modelId,
              userMessage:
                `当前仅启用 1 个模型 (${healthy[0].modelId})，` +
                `若该模型 rate-limit 或临时故障，mission 将无 fallback。` +
                `建议在 设置 → 模型 启用 2+ 模型作为备份`,
            },
          })
          .catch(() => {});
      }
    } catch (err) {
      // 仅 reject-throw 抛出；env 查询失败不阻断（partial info ok）
      if (err instanceof Error && err.message.includes("BYOK 配置")) throw err;
    }

    const credit = await billing.getCreditState();
    if (credit.balance <= (credit.hardLimit ?? 0)) {
      const hint = await billing.suggestFallback({ reason: "no_credit" });
      await this.invoker.emitEvent({
        type: "agent-playground.mission:rejected",
        missionId,
        userId,
        payload: {
          reason: "no_credit",
          balance: credit.balance,
          userMessage: hint.userMessage,
        },
      });
      throw new Error(hint.userMessage ?? "Credit balance too low");
    }

    // 先持久化 mission record (status=running)
    // 同时把 userProfile 快照写进去，cancelled/failed 时也能看到配置
    await this.store.create({
      id: missionId,
      userId,
      workspaceId,
      topic: input.topic,
      depth: input.depth,
      language: input.language,
      maxCredits: effectiveMaxCredits,
      userProfile: {
        depth: input.depth,
        language: input.language,
        budgetProfile: input.budgetProfile,
        styleProfile: input.styleProfile,
        lengthProfile: input.lengthProfile,
        audienceProfile: input.audienceProfile,
        withFigures: input.withFigures,
        auditLayers: input.auditLayers,
        concurrency: input.concurrency,
        viewMode: input.viewMode,
      } as Record<string, unknown>,
    });

    // ★ 必须同时 wrap withUserContext —— BillingContext 不会自动让 RequestContext.getUserId() 看到 userId，
    //   reflexion / verifier 等异步内部调用 AiChatService 需要 RequestContext 拿 BYOK userId。
    return withUserContext(userId, () =>
      BillingContext.run(
        {
          userId,
          moduleType: "agent-playground",
          operationType: "team",
          referenceId: missionId,
        },
        async () => {
          const t0 = Date.now();
          try {
            const result = await this.runMissionBody(
              missionId,
              input,
              userId,
              workspaceId,
              pool,
              t0,
              billing,
              // depth × budgetProfile 组合倍率：让两个 lever 协同 scale agent budget
              resolveBudgetMultiplier(input),
            );
            // ── Stage 99: 持久化（已抽到 stages/s11-mission-persist.stage.ts）──
            await runPersistStage(
              { missionId, userId, t0, result, pool },
              this.buildStageDeps(),
            );
            // ★ Phase 5 (2026-04-29): persist 成功后清理 checkpoint，避免被 listResumable 误识别
            await this.missionCheckpoint.clear(missionId);
            // ── Stage 100: S12 self-evolution（best-effort，不阻塞返回）──
            //   异步执行，让用户立即拿到 result；evolved 事件后续 emit 给前端
            //   ★ P1-NEW-A (round 2): 把 abortSignal 传进 S12，让 wallTimer 触发 / 用户取消
            //   时 S12 能立即停手，防止超 wall-time 后继续烧 BYOK credits。
            //   wallTimer / abortRegistry 也推迟到 S12 完成后再清理，确保 signal 在
            //   S12 整个生命周期内都可用。
            const s12Promise = runSelfEvolutionStage(
              {
                missionId,
                userId,
                t0,
                pool,
                topic: input.topic,
                plan: result.themeSummary
                  ? {
                      dimensions: (result.dimensions ?? []) as unknown[],
                      goals: undefined,
                    }
                  : undefined,
                researcherResults: result.dimensions as unknown[] | undefined,
                reportArtifact: result.reportArtifact as
                  | { quality?: { overall?: number }; sections?: unknown[] }
                  | undefined,
                leaderSignOff: result.leaderSignOff,
                abortSignal: missionAbort.signal,
              },
              this.buildStageDeps(),
            ).catch(() => {});
            void s12Promise.finally(() => {
              clearTimeout(wallTimer);
              this.abortRegistry.unregister(missionId);
            });
            return result;
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            const errName = err instanceof Error ? err.name : "Unknown";
            const snap = pool.snapshot();
            // ★ P0-LIVE-CANCEL-GHOST (2026-04-30): mission 8e77271d 实证 —
            //   用户取消后 mission 主流程没立即退出，下游 stage（reconciler/
            //   analyst）继续跑但每个 agent 入口 signal.aborted 即退出，
            //   wallTimeMs=2-5ms iterations=0 没产 output → schema_mismatch
            //   派生错误 → s6 stage throw → catch 这里发 mission:failed
            //   "Analyst 连续 2 次未产出"，把"用户取消"真因彻底遮蔽。
            //   修复：cancel 时 catch 走 cancelled 路径，不发 mission:failed。
            const wasCancelled =
              missionAbort.signal.aborted ||
              /aborted|cancelled|user_cancelled/i.test(message);
            if (wasCancelled) {
              const cancelReason =
                typeof missionAbort.signal.reason === "string"
                  ? missionAbort.signal.reason
                  : "user_cancelled";
              this.log.log(
                `[${missionId}] catch detected mission abort (${cancelReason}), routing to cancel path instead of failure (suppressed派生 errors: ${message.slice(0, 200)})`,
              );
              // mission:cancelled 已在 abortRegistry.abort() 调用方（controller /
              // wallTimer）emit；DB markCancelled 也已在那里执行。这里**不**重复
              // emit mission:failed，避免 schema_mismatch 这种派生错误盖住真因。
              clearTimeout(wallTimer);
              this.abortRegistry.unregister(missionId);
              throw err;
            }
            // ★ mission 级失败码归类
            let missionFailureCode: string = "UNKNOWN";
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
            // 任何 uncaught 错误都要让 UI 知道 —— 否则 status 永远停在 "running"
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
              .catch(() => {});
            await this.store.markFailed(missionId, {
              errorMessage: message,
              tokensUsed: snap.poolTokensUsed,
              costUsd: snap.poolCostUsd,
              wallTimeMs: Date.now() - t0,
            });
            clearTimeout(wallTimer);
            this.abortRegistry.unregister(missionId);
            throw err;
          }
        },
      ),
    );
  }

  private async runMissionBody(
    missionId: string,
    input: RunMissionInput,
    userId: string,
    workspaceId: string | undefined,
    pool: MissionBudgetPool,
    t0: number,
    billing: BillingRuntimeEnvAdapter,
    budgetMultiplier: number,
  ): Promise<MissionResult> {
    // ★ P0-LIVE-CANCEL-GHOST (2026-04-30): mission 8e77271d 实证 — 用户取消后
    //   mission 主流程没立即退出，下游 stage（reconciler/analyst）继续跑，
    //   每个 agent 入口 signal.aborted 立刻退出但 wallTimeMs=2-5ms iterations=0
    //   产 schema_mismatch 派生错误遮蔽 cancel 真因。
    //   修复：每个关键 stage 边界 check abortRegistry，aborted 直接 throw 跳出，
    //   走外层 catch 的 wasCancelled 分支，不再跑后续 stage 制造假错误。
    const checkAbort = (between: string): void => {
      if (this.abortRegistry.isAborted(missionId)) {
        const reason = this.abortRegistry.getSignal(missionId)?.reason;
        const reasonStr =
          typeof reason === "string" && reason ? reason : "user_cancelled";
        this.log.log(
          `[${missionId}] abort detected before stage "${between}" (reason=${reasonStr}), short-circuiting`,
        );
        throw new Error(`Mission aborted: ${reasonStr}`);
      }
    };
    // ★ P0-LIVE-PATCH-SILENT (2026-04-30): mission-level shared state，跨 stage 共享。
    //   buildStageCtx 每次 new 新 ctx，要把这个对象 reference 注入让 stage 之间能读写。
    const sharedState: { s4PatchFailures?: MissionContext["s4PatchFailures"] } =
      {};
    {
      {
        // ── Stage 0: 预算预估 + mission:started（已抽到 stages/s1-mission-estimate-budget.stage.ts）──
        const startCtx = this.buildStageCtx({
          missionId,
          userId,
          input,
          t0,
          billing,
          pool,
          leader: undefined as never, // leader 在下一个 stage 才创建，budget 不需要它
          budgetMultiplier,
        });
        await runBudgetEstimateStage(
          startCtx,
          this.buildStageDeps(),
          workspaceId,
        );

        // ── Stage S2: Leader plans the mission（已抽到 stages/s2-leader-plan-mission.stage.ts）──
        // Leader 全程在场 —— 创建 SupervisedMission，整 mission 复用
        const leader: SupervisedMission = this.leaderService.create(
          missionId,
          userId,
          {
            topic: input.topic,
            depth: input.depth,
            language: input.language,
            userProfile: input,
          },
          this.buildLeaderInvocation(missionId, userId, billing),
        );

        // Run S2 leader-plan stage: stages/s2-leader-plan-mission.stage.ts
        const m0Ctx = this.buildStageCtx({
          missionId,
          userId,
          input,
          t0,
          billing,
          pool,
          leader,
          budgetMultiplier,
        });
        await runLeaderPlanStage(m0Ctx, this.buildStageDeps());
        const plan = m0Ctx.plan!;
        // ★ Phase 5 (2026-04-29): 关键 stage 完成后保存 checkpoint
        await this.missionCheckpoint.save(
          missionId,
          { lastStage: "s2-leader-plan", topic: input.topic },
          ["s1-budget", "s2-leader-plan"],
          "running",
        );

        // ── Stage S3: Researcher×N dispatch（已抽到 stages/s3-researcher-collect-findings.stage.ts）──
        const s3Ctx = this.buildStageCtx({
          missionId,
          userId,
          input,
          t0,
          billing,
          pool,
          leader,
          budgetMultiplier,
          plan,
        });
        checkAbort("s3-researchers");
        await runResearcherDispatchStage(s3Ctx, this.buildStageDeps());
        const researcherResults = s3Ctx.researcherResults!;
        // ★ Phase 5: 最重 stage 完成后保存 checkpoint（researcher 数据是 mission 价值核心）
        await this.missionCheckpoint.save(
          missionId,
          {
            lastStage: "s3-researcher-dispatch",
            topic: input.topic,
            dimensionCount: plan.dimensions.length,
            researcherCount: researcherResults.length,
          },
          ["s1-budget", "s2-leader-plan", "s3-researcher-dispatch"],
          "running",
        );

        // ── Stage S4: Leader assesses research（已抽到 stages/s4-leader-assess-research.stage.ts）──
        const s4Ctx = this.buildStageCtx({
          missionId,
          userId,
          input,
          t0,
          billing,
          pool,
          leader,
          budgetMultiplier,
          plan,
          researcherResults,
          sharedState,
        });
        await runLeaderAssessResearchStage(s4Ctx, this.buildStageDeps());
        // ★ P0-LIVE-PATCH-SILENT (2026-04-30): S4 写到本 ctx 的 s4PatchFailures
        //   要回写到 mission-level sharedState，让下游 S10 读到
        if (s4Ctx.s4PatchFailures && s4Ctx.s4PatchFailures.length > 0) {
          sharedState.s4PatchFailures = s4Ctx.s4PatchFailures;
        }

        // ── Stage B' (3.5): Reconciler 对账（已抽到 stages/s5-reconciler-cross-dim-fact-check.stage.ts）──
        const reconCtx = this.buildStageCtx({
          missionId,
          userId,
          input,
          t0,
          billing,
          pool,
          leader,
          budgetMultiplier,
          plan,
          researcherResults,
        });
        checkAbort("s5-reconciler");
        await runReconcilerStage(reconCtx, this.buildStageDeps());
        const reconciliationReport = reconCtx.reconciliationReport;

        checkAbort("s6-analyst");
        // ── Stage 3: Analyst 反思整合（已抽到 stages/s6-analyst-synthesize-insights.stage.ts）──
        const analyst = await runAnalystStage(
          this.buildStageCtx({
            missionId,
            userId,
            input,
            t0,
            billing,
            pool,
            leader,
            budgetMultiplier,
            plan,
            researcherResults,
            reconciliationReport,
          }),
          this.buildStageDeps(),
        );

        // Stage S7: Writer plans mission outline（已抽到 stages/s7-writer-plan-outline.stage.ts）
        checkAbort("s7-writer-outline");
        await runWriterOutlineStage(
          this.buildStageCtx({
            missionId,
            userId,
            input,
            t0,
            billing,
            pool,
            leader,
            budgetMultiplier,
            plan,
            researcherResults,
            reconciliationReport,
          }),
          this.buildStageDeps(),
        );

        // ── Stage S8: Writer + L3 reviewer + memory + assemble（已抽到 stages/s8-writer-draft-report.stage.ts）──
        const s8Ctx = this.buildStageCtx({
          missionId,
          userId,
          input,
          t0,
          billing,
          pool,
          leader,
          budgetMultiplier,
          plan,
          researcherResults,
          reconciliationReport,
        });
        checkAbort("s8-writer");
        await runWriterStage(
          s8Ctx,
          this.buildStageDeps(),
          analyst,
          workspaceId,
        );
        const report = s8Ctx.report!;
        const reviewScore = s8Ctx.reviewScore!;
        const verifierVerdicts = s8Ctx.verifierVerdicts!;
        const reportArtifact = s8Ctx.reportArtifact;
        const indexed = s8Ctx.trajectoryStored ?? 0;
        const snap = pool.snapshot();
        // ★ Phase 5: writer 起草完成是写作侧最贵的步骤，保存 checkpoint 让重启可跳过
        await this.missionCheckpoint.save(
          missionId,
          {
            lastStage: "s8-writer-draft",
            topic: input.topic,
            reviewScore,
            hasReportArtifact: !!reportArtifact,
          },
          [
            "s1-budget",
            "s2-leader-plan",
            "s3-researcher-dispatch",
            "s4-leader-assess",
            "s5-reconciler",
            "s6-analyst",
            "s7-writer-outline",
            "s8-writer-draft",
          ],
          "running",
        );

        // ── Stage S8B: Section quality enhancement (沉淀消费 v3, 2026-04-29)
        //    4 维写中自评 + 弱维度合并补救 + 强制重评（auditLayers !== "minimal" 时启用）
        const s8bCtx = this.buildStageCtx({
          missionId,
          userId,
          input,
          t0,
          billing,
          pool,
          leader,
          budgetMultiplier,
          plan,
          researcherResults,
          reconciliationReport,
          reportArtifact,
          report,
          reviewScore,
          verifierVerdicts,
        });
        await runSectionQualityEnhancementStage(s8bCtx, this.buildStageDeps());

        // ── Stage S9: Reviewer L4 critic（已抽到 stages/s9-reviewer-critic-l4.stage.ts）
        await runCriticStage(
          this.buildStageCtx({
            missionId,
            userId,
            input,
            t0,
            billing,
            pool,
            leader,
            budgetMultiplier,
            plan,
            researcherResults,
            reconciliationReport,
            reportArtifact,
            report,
            reviewScore,
            verifierVerdicts,
          }),
          this.buildStageDeps(),
        );

        // ── Stage S9B: 10 维客观评审 (沉淀消费 v3, 2026-04-29)
        //    EVALUATOR 模型独立打分，给 leader signoff 提供客观证据
        const s9bCtx = this.buildStageCtx({
          missionId,
          userId,
          input,
          t0,
          billing,
          pool,
          leader,
          budgetMultiplier,
          plan,
          researcherResults,
          reconciliationReport,
          reportArtifact,
          report,
          reviewScore,
          verifierVerdicts,
        });
        await runReportObjectiveEvaluationStage(s9bCtx, this.buildStageDeps());

        // ── Stage S10: Leader foreword + signoff
        // services/mission/workflow/stages/s10-leader-foreword-and-signoff.stage.ts
        const stageCtx = this.buildStageCtx({
          missionId,
          userId,
          input,
          t0,
          billing,
          pool,
          leader,
          budgetMultiplier,
          plan,
          researcherResults,
          reconciliationReport,
          reportArtifact,
          report,
          reviewScore,
          verifierVerdicts,
          // ★ P0-LIVE-PATCH-SILENT (2026-04-30): S10 必须看到 S4 patch 失败列表，
          //   patchFailures.length > 0 时强制 signed=false
          sharedState,
        });
        const stageDeps = this.buildStageDeps();
        await runLeaderForewordAndSignoffStage(stageCtx, stageDeps);
        const leaderSignOff = stageCtx.leaderSignOff;

        // ★ Phase 6 (2026-04-29): 拒签 revision 推荐事件 —— 给前端展示"立即修订重跑"按钮
        // 不在主流程自动重跑（避免无限循环 + mission 资源失控），而是让前端用户决定
        // 后续可结合 missions/:id/rerun endpoint 自动构造 revision spec
        if (leaderSignOff && leaderSignOff.signed === false) {
          await this.invoker
            .emitEvent({
              type: "agent-playground.leader:rejected-revision-recommended",
              missionId,
              userId,
              payload: {
                refusalReason: leaderSignOff.refusalReason,
                leaderVerdict: leaderSignOff.leaderVerdict,
                leaderOverallScore: leaderSignOff.leaderOverallScore,
                hint: "建议: 调整 lengthProfile/auditLayers 后立即 rerun，或参考 refusalReason 修复输入",
              },
            })
            .catch(() => {});
        }

        return {
          missionId,
          report,
          reviewScore,
          costUsd: snap.poolCostUsd,
          trajectoryStored: indexed,
          themeSummary: plan.themeSummary,
          dimensions: plan.dimensions,
          verdicts: verifierVerdicts as MissionResult["verdicts"],
          reportArtifact,
          reconciliationReport: reconciliationReport ?? undefined,
          userProfile: {
            depth: input.depth,
            budgetProfile: input.budgetProfile,
            styleProfile: input.styleProfile,
            lengthProfile: input.lengthProfile,
            audienceProfile: input.audienceProfile,
            withFigures: input.withFigures,
            auditLayers: input.auditLayers,
            concurrency: input.concurrency,
            viewMode: input.viewMode,
            language: input.language,
          },
          leaderSignOff,
        };
      }
    }
  }

  // ─── stage extraction helpers ──────────────────────────────────

  private buildStageCtx(args: {
    missionId: string;
    userId: string;
    input: RunMissionInput;
    t0: number;
    billing: BillingRuntimeEnvAdapter;
    pool: MissionBudgetPool;
    leader: SupervisedMission;
    budgetMultiplier: number;
    plan?: MissionContext["plan"];
    researcherResults?: MissionContext["researcherResults"];
    reconciliationReport?: MissionContext["reconciliationReport"];
    reportArtifact?: MissionContext["reportArtifact"];
    report?: MissionContext["report"];
    reviewScore?: number;
    verifierVerdicts?: unknown[];
    /**
     * ★ P0-LIVE-PATCH-SILENT (2026-04-30): mission-level shared state 透传。
     * 之前 buildStageCtx 每次创建新 ctx, 跨 stage state（如 S4 patch 失败列表）
     * 全丢。新增 sharedState 让上游 stage 写、下游 stage 读。
     */
    sharedState?: {
      s4PatchFailures?: MissionContext["s4PatchFailures"];
    };
  }): MissionContext {
    return {
      missionId: args.missionId,
      userId: args.userId,
      input: args.input,
      t0: args.t0,
      billing: args.billing,
      pool: args.pool,
      leader: args.leader,
      budgetMultiplier: args.budgetMultiplier,
      plan: args.plan,
      researcherResults: args.researcherResults,
      reconciliationReport: args.reconciliationReport,
      reportArtifact: args.reportArtifact,
      report: args.report,
      reviewScore: args.reviewScore,
      verifierVerdicts: args.verifierVerdicts,
      s4PatchFailures: args.sharedState?.s4PatchFailures,
    };
  }

  private buildStageDeps(): MissionDeps {
    return {
      leader: this.leaderService,
      reconciler: this.reconcilerService,
      analyst: this.analystService,
      writer: this.writerService,
      reviewer: this.reviewerService,
      verifier: this.verifierService,
      steward: this.stewardService,
      invoker: this.invoker,
      store: this.store,
      missionState: this.missionState,
      abortRegistry: this.abortRegistry,
      runner: this.runner,
      judge: this.judge,
      indexer: this.indexer,
      eventBus: this.eventBus,
      credits: this.credits,
      runtimeEnv: this.runtimeEnv,
      failureLearner: this.failureLearner,
      reportAssembler: this.reportAssembler,
      figureExtractor: this.figureExtractor,
      figureRelevance: this.figureRelevance,
      sectionSelfEval: this.sectionSelfEval,
      sectionRemediation: this.sectionRemediation,
      reportEvaluation: this.reportEvaluation,
      qualityTraceCompute: this.qualityTraceCompute,
      log: this.log,
      emit: this.invoker.emitEvent.bind(this.invoker),
      lifecycle: this.invoker.emitLifecycle.bind(this.invoker),
    };
  }
}
