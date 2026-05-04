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
import type { MissionStore } from "../lifecycle/mission-store.service";
import { HandoffCompactorService } from "@/modules/ai-harness/facade";
import type { MissionAbortRegistry } from "@/modules/ai-harness/facade";
import type {
  ReportArtifactAssembler,
  FailureLearnerService,
} from "@/modules/ai-harness/facade";
import type {
  AgentRunner,
  JudgeService,
  MemoryAutoIndexer,
  DomainEventBus,
  FigureRelevanceService,
  SectionSelfEvalService,
  SectionRemediationService,
  ReportEvaluationService,
  QualityTraceComputeService,
} from "@/modules/ai-harness/facade";
import type { FigureExtractorService } from "@/modules/ai-engine/facade";
import type { CreditsService } from "../../../../../ai-infra/credits/credits.service";
import type { RuntimeEnvironmentService } from "@/modules/ai-harness/facade";
import { PostmortemClassifierService } from "@/modules/ai-harness/facade";

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
    };
  }
}
