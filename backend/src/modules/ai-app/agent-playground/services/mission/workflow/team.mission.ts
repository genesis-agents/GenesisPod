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
  MissionBudgetPool,
  // ★ 沉淀消费 v3 (2026-04-29): quality 闭环
  // ★ Phase 5 (2026-04-29): mission checkpoint
  MissionCheckpointService,
} from "@/modules/ai-harness/facade";
// ★ P2-R3-3 (round 3): 与同文件相邻 import 统一相对路径风格
import { LeaderAgent } from "../../../agents/leader/leader.agent";
import { LeaderService, SupervisedMission, AgentInvoker } from "../../roles";
import { MissionAbortRegistry } from "@/modules/ai-harness/facade";
// MissionReviewerAgent: 当前 mission 评审走 VerifierService（多 judge 投票），
// MissionReviewerAgent class 已声明但 orchestrator 暂未直接调用，保留为后续替换 path。
import {
  type ResearchReport,
  type RunMissionInput,
} from "../../../dto/run-mission.dto";
import { BillingRuntimeEnvAdapter } from "@/modules/ai-harness/facade";
import { MissionStore } from "../lifecycle/mission-store.service";
import { MissionEventBuffer } from "../lifecycle/mission-event-buffer.service";
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
import {
  MissionRuntimeShellService,
  type MissionRuntimeSession,
} from "./mission-runtime-shell.service";
import { MissionStageBindingsService } from "./mission-stage-bindings.service";

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
  readonly reportArtifact?: import("@/modules/ai-harness/facade").ReportArtifact;
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
    private readonly store: MissionStore,
    private readonly abortRegistry: MissionAbortRegistry,
    private readonly leaderService: LeaderService,
    // per-role services（stage 文件通过 deps 间接调用，注入到 trunk 供 buildStageDeps 打包）
    private readonly invoker: AgentInvoker,
    // ★ 沉淀（2026-04-29）: figure pipeline（agent-playground 复用 ai-engine + ai-harness 沉淀版）
    // ★ 沉淀消费 v3 (2026-04-29): quality 闭环
    // ★ Phase 5 (2026-04-29): 接入 ai-harness 沉淀的 mission checkpoint
    private readonly missionCheckpoint: MissionCheckpointService,
    // ── S12 postmortem 失败模式分类 ──
    // MissionEventBuffer: S12 需要事件快照做失败模式分类
    private readonly missionEventBuffer: MissionEventBuffer,
    private readonly runtimeShell: MissionRuntimeShellService,
    private readonly stageBindings: MissionStageBindingsService,
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
    const session = await this.runtimeShell.openSession({
      missionId,
      input,
      userId,
      workspaceId,
    });
    return this.runMissionWithSession(session, input, workspaceId);
  }

  private async runMissionWithSession(
    session: MissionRuntimeSession,
    input: RunMissionInput,
    workspaceId?: string,
  ): Promise<MissionResult> {
    const { missionId, userId } = session;
    return this.runtimeShell.runWithinContext(session, async () => {
      const t0 = Date.now();
      const partial: {
        report?: unknown;
        reportArtifact?: unknown;
        reviewScore?: number;
        verifierVerdicts?: unknown;
        trajectoryStored?: number;
        themeSummary?: string;
        dimensions?: unknown[];
        reconciliationReport?: unknown;
        userProfile?: unknown;
        leaderSignOff?: {
          leaderOverallScore: number;
          leaderVerdict: "excellent" | "good" | "acceptable" | "failed";
          signed: boolean;
          refusalReason?: string;
        };
      } = {};

      try {
        const result = await this.runMissionBody(
          missionId,
          input,
          userId,
          workspaceId,
          session.pool,
          t0,
          session.billing,
          session.budgetMultiplier,
          partial,
        );
        await runPersistStage(
          { missionId, userId, t0, result, pool: session.pool },
          this.buildStageDeps(),
        );
        await this.missionCheckpoint.clear(missionId);
        await this.store.markStageComplete(missionId, 11);
        const s12Promise = runSelfEvolutionStage(
          {
            missionId,
            userId,
            t0,
            pool: session.pool,
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
            abortSignal: session.missionAbort.signal,
            bufferedEvents: this.missionEventBuffer
              .read(missionId)
              .map((e) => ({
                type: e.type,
                ts: e.timestamp,
                payload: e.payload,
              })),
          },
          this.buildStageDeps(),
        ).catch(() => {});
        void s12Promise.finally(() => {
          session.cleanup();
        });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const errName = err instanceof Error ? err.name : "Unknown";
        const snap = session.pool.snapshot();
        const wasCancelled =
          session.missionAbort.signal.aborted ||
          /aborted|cancelled|user_cancelled/i.test(message);
        if (wasCancelled) {
          session.cleanup();
          throw err;
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
          .catch(() => {});
        const reportPayload =
          partial.reportArtifact ??
          (partial.report as { title?: string; summary?: string } | undefined);
        await this.store.markFailed(missionId, {
          errorMessage: message,
          tokensUsed: snap.poolTokensUsed,
          costUsd: snap.poolCostUsd,
          wallTimeMs: Date.now() - t0,
          trajectoryStored: partial.trajectoryStored,
          themeSummary: partial.themeSummary,
          dimensions: partial.dimensions,
          report: reportPayload as
            | { title?: string; summary?: string }
            | undefined,
          reportArtifactVersion: partial.reportArtifact
            ? 2
            : partial.report
              ? 1
              : undefined,
          userProfile: partial.userProfile,
          reconciliationReport: partial.reconciliationReport,
          verdicts: partial.verifierVerdicts,
          leaderOverallScore: partial.leaderSignOff?.leaderOverallScore,
          leaderSigned: partial.leaderSignOff?.signed,
          leaderVerdict: partial.leaderSignOff?.leaderVerdict,
        });
        session.cleanup();
        throw err;
      }
    });
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
    /**
     * ★ 2026-04-30: 部分产物收集器（mutable ref）。runMissionBody 在每个 stage
     * 完成时回填进度，让外层 catch 抛错时能拿到 reportArtifact / verdicts /
     * leaderSignOff 等已构建产物，传给 markFailed 写库 —— 防失败时丢全部产物。
     */
    partial?: {
      report?: unknown;
      reportArtifact?: unknown;
      reviewScore?: number;
      verifierVerdicts?: unknown;
      trajectoryStored?: number;
      themeSummary?: string;
      dimensions?: unknown[];
      reconciliationReport?: unknown;
      userProfile?: unknown;
      leaderSignOff?: {
        leaderOverallScore: number;
        leaderVerdict: "excellent" | "good" | "acceptable" | "failed";
        signed: boolean;
        refusalReason?: string;
      };
    },
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
        // ★ PR-H v1: stage 1 完成
        await this.store.markStageComplete(missionId, 1);

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
        await this.store.markStageComplete(missionId, 2);
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
        await this.store.markStageComplete(missionId, 3);
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
        await this.store.markStageComplete(missionId, 4);
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
        if (partial) partial.reconciliationReport = reconciliationReport;
        await this.store.markStageComplete(missionId, 5);

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
        await this.store.markStageComplete(missionId, 6);

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
        await this.store.markStageComplete(missionId, 7);

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
        // ★ 2026-04-30: S8 已构建 reportArtifact，回填 partial 让后续 stage 抛错时不丢
        if (partial) {
          partial.report = report;
          partial.reportArtifact = reportArtifact;
          partial.reviewScore = reviewScore;
          partial.verifierVerdicts = verifierVerdicts;
          partial.trajectoryStored = indexed;
          partial.themeSummary = plan.themeSummary;
          partial.dimensions = plan.dimensions as unknown[];
          partial.userProfile = {
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
          };
        }
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
        await this.store.markStageComplete(missionId, 8);

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
        // S8B uses 8.5 to keep monotonic ordering with S8 / S9
        await this.store.markStageComplete(missionId, 8);

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
        await this.store.markStageComplete(missionId, 9);

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
        // S9B uses 9 to keep monotonic ordering
        await this.store.markStageComplete(missionId, 9);

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
        if (partial && leaderSignOff) partial.leaderSignOff = leaderSignOff;
        await this.store.markStageComplete(missionId, 10);

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
    return this.stageBindings.buildCtx(args);
  }

  private buildStageDeps(): MissionDeps {
    return this.stageBindings.buildDeps();
  }
}
