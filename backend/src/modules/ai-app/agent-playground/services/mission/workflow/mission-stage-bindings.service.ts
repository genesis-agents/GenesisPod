import { Injectable, Logger } from "@nestjs/common";
import type { MissionContext } from "./mission-context";
import type { MissionDeps } from "./mission-deps";
import type { RunMissionInput } from "../../../dto/run-mission.dto";
import type { BillingRuntimeEnvAdapter } from "@/modules/ai-harness/facade";
import type { MissionBudgetPool } from "@/modules/ai-harness/facade";
import {
  LeaderService,
  ReconcilerService,
  AnalystService,
  WriterService,
  ReviewerService,
  VerifierService,
  StewardService,
  AgentInvoker,
  type SupervisedMission,
} from "../../roles";
// ★ 2026-05-04 修：所有 DI 注入的 service 必须 runtime import（不能 import type）
//   原因：NestJS DI 用 TS emitDecoratorMetadata 反射构造函数 paramtypes；
//   `import type { X }` 在编译期被剥掉 runtime 引用 → metadata 退化为 `Function`
//   占位 → DI 抛 "Nest can't resolve dependencies of MissionStageBindingsService
//   (..., Function, ..., Function, ...)"。
//   生产 Railway 启动时整模块 boot 失败。
import { MissionStore } from "../lifecycle/mission-store.service";
import {
  HandoffCompactorService,
  MissionAbortRegistry,
  ReportArtifactAssembler,
  FailureLearnerService,
  AgentRunner,
  JudgeService,
  MemoryAutoIndexer,
  DomainEventBus,
  FigureRelevanceService,
  SectionSelfEvalService,
  SectionRemediationService,
  ReportEvaluationService,
  QualityTraceComputeService,
  RuntimeEnvironmentService,
} from "@/modules/ai-harness/facade";
import { FigureExtractorService } from "@/modules/ai-engine/facade";
import { CreditsService } from "../../../../../ai-infra/credits/credits.service";
import { PostmortemClassifierService } from "@/modules/ai-harness/facade";
// ★ DI 注入 → runtime import（非 import type），见上文 emitDecoratorMetadata 说明。
import { MissionLifecycleManager } from "@/modules/ai-harness/facade";

export interface MissionStageCtxArgs {
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
  reviewScore?: MissionContext["reviewScore"];
  verifierVerdicts?: unknown[];
  sharedState?: {
    s4PatchFailures?: MissionContext["s4PatchFailures"];
  };
}

@Injectable()
export class MissionStageBindingsService {
  private readonly log = new Logger(MissionStageBindingsService.name);

  constructor(
    private readonly leaderService: LeaderService,
    private readonly reconcilerService: ReconcilerService,
    private readonly analystService: AnalystService,
    private readonly writerService: WriterService,
    private readonly reviewerService: ReviewerService,
    private readonly verifierService: VerifierService,
    private readonly stewardService: StewardService,
    private readonly invoker: AgentInvoker,
    private readonly store: MissionStore,
    private readonly missionState: HandoffCompactorService,
    private readonly abortRegistry: MissionAbortRegistry,
    private readonly runner: AgentRunner,
    private readonly judge: JudgeService,
    private readonly indexer: MemoryAutoIndexer,
    private readonly eventBus: DomainEventBus,
    private readonly credits: CreditsService,
    private readonly runtimeEnv: RuntimeEnvironmentService,
    private readonly failureLearner: FailureLearnerService,
    private readonly reportAssembler: ReportArtifactAssembler,
    private readonly figureExtractor: FigureExtractorService,
    private readonly figureRelevance: FigureRelevanceService,
    private readonly sectionSelfEval: SectionSelfEvalService,
    private readonly sectionRemediation: SectionRemediationService,
    private readonly reportEvaluation: ReportEvaluationService,
    private readonly qualityTraceCompute: QualityTraceComputeService,
    private readonly postmortemClassifier: PostmortemClassifierService,
    // ★ C0/G1：终态写唯一入口，透进 CommonDeps 让 s11-persist 经 finalize 仲裁。
    private readonly lifecycleManager: MissionLifecycleManager,
  ) {}

  buildCtx(args: MissionStageCtxArgs): MissionContext {
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

  buildDeps(): MissionDeps {
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
      lifecycleManager: this.lifecycleManager,
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
      postmortemClassifier: this.postmortemClassifier,
      log: this.log,
      emit: this.invoker.emitEvent.bind(this.invoker),
      lifecycle: this.invoker.emitLifecycle.bind(this.invoker),
      // ★ 2026-05-06 (A-6): markStageDegraded — stage 内部软失败上报。
      //   stage 调用方显式传 stepId（PLAYGROUND_PIPELINE.steps[i].id），让前端按
      //   stepId 映射到 SystemStageId 后挂到对应 todo 的 narrativeLog 显示警告。
      //   禁止 log.warn 后静默 swallow（这是"软失败盲区"主要源头）。
      markStageDegraded: async (
        missionId: string,
        userId: string,
        stepId: string,
        reason: string,
      ) => {
        await this.invoker.emitEvent({
          type: "agent-playground.stage:degraded",
          missionId,
          userId,
          payload: {
            stage: STEP_ID_TO_FRONTEND_STAGE_ID[stepId] ?? stepId,
            stepId,
            reason: reason.slice(0, 500),
          },
        });
      },
    };
  }
}

/** dispatcher 同款映射（保持 source-of-truth 单一）—— 见 dispatcher 文件末尾 */
const STEP_ID_TO_FRONTEND_STAGE_ID: Record<string, string> = {
  "s1-budget": "s1-budget",
  "s2-leader-plan": "s2-leader-plan",
  "s3-researcher-collect": "s3-researchers",
  "s4-leader-assess": "s4-leader-assess",
  "s5-reconciler": "s5-reconciler",
  "s6-analyst": "s6-analyst",
  "s7-writer-outline": "s7-writer-outline",
  "s8-writer": "s8-writer-draft",
  "s8b-quality-enhancement": "s8b-quality-enhancement",
  "s9-critic": "s9-critic-l4",
  "s9b-objective-eval": "s9b-objective-evaluation",
  "s10-leader-foreword-signoff": "s10-leader-signoff",
  "s11-persist": "s11-persist",
  "s12-self-evolution": "s12-self-evolution",
};
