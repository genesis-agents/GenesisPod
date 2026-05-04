/**
 * MissionDeps —— stage 函数所需的依赖包（按 phase 拆类型）
 *
 * 由 trunk team.mission.ts 在 runMission 入口装配一次，然后传给每个 stage 函数。
 *
 * 类型分组（PR-7a 2026-05-04 standardize playground）:
 *   • CommonDeps        ← 所有 stage 都用（invoker / store / abort / runner / eventBus / log / emit / lifecycle / runtimeEnv / credits / missionState）
 *   • PlanDeps          ← s1/s2 用（leader + steward）
 *   • ResearchDeps      ← s3/s4 用（leader + writer + reviewer + figureExtractor + figureRelevance）
 *   • SynthesisDeps     ← s5/s6 用（reconciler + analyst）
 *   • WriterDeps        ← s7/s8/s8b 用（writer + reviewer + verifier + judge + indexer + reportAssembler + sectionSelfEval + sectionRemediation）
 *   • QualityDeps       ← s9/s9b 用（reportEvaluation + qualityTraceCompute）
 *   • SignoffDeps       ← s10 用（leader + reviewer）
 *   • PersistDeps       ← s11/s12 用（failureLearner + postmortemClassifier）
 *
 * MissionDeps 仍为单一合成 type，stage 当前签名收完整 deps；后续 PR-7b 逐 stage
 * 改窄签名（如 runResearcherDispatchStage 改收 ResearchDeps），让 reader 看签名
 * 就知道 stage 调用了哪些下层服务。
 */

import type { Logger } from "@nestjs/common";
import type {
  AgentInvoker,
  LeaderService,
  ReconcilerService,
  AnalystService,
  WriterService,
  ReviewerService,
  VerifierService,
  StewardService,
} from "../../roles";
import type { MissionStore } from "../lifecycle/mission-store.service";
import type { HandoffCompactorService } from "@/modules/ai-harness/facade";
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
import type { PostmortemClassifierService } from "@/modules/ai-harness/facade";

/** 通用 emit 签名 — 2026-05-01 上提到 ai-harness/protocols/ipc/stage-emit.utils */
import type { EmitFn } from "@/modules/ai-harness/facade";
export type { EmitFn };

export type LifecycleFn = (
  missionId: string,
  userId: string,
  agentId: string,
  role: string,
  phase: "started" | "completed" | "failed",
  detail?: Record<string, unknown>,
) => Promise<void>;

// ─── Phase 0: CommonDeps（每个 stage 都注入）─────────────────────────
export interface CommonDeps {
  readonly invoker: AgentInvoker;
  readonly store: MissionStore;
  readonly missionState: HandoffCompactorService;
  readonly abortRegistry: MissionAbortRegistry;
  readonly runner: AgentRunner;
  readonly eventBus: DomainEventBus;
  readonly credits: CreditsService;
  readonly runtimeEnv: RuntimeEnvironmentService;
  readonly log: Logger;
  readonly emit: EmitFn;
  readonly lifecycle: LifecycleFn;
}

// ─── Phase 1: Plan（s1/s2）──────────────────────────────────────────
export interface PlanDeps extends CommonDeps {
  readonly leader: LeaderService;
  readonly steward: StewardService;
}

// ─── Phase 2: Research（s3/s4）──────────────────────────────────────
//   per-dim-pipeline 调 writer.planDimensionOutline + reviewer.judgeDimension
export interface ResearchDeps extends CommonDeps {
  readonly leader: LeaderService;
  readonly writer: WriterService;
  readonly reviewer: ReviewerService;
  readonly figureExtractor: FigureExtractorService;
  readonly figureRelevance: FigureRelevanceService;
}

// ─── Phase 3: Synthesis（s5/s6）─────────────────────────────────────
export interface SynthesisDeps extends CommonDeps {
  readonly reconciler: ReconcilerService;
  readonly analyst: AnalystService;
}

// ─── Phase 4: Writer（s7/s8/s8b）────────────────────────────────────
export interface WriterDeps extends CommonDeps {
  readonly writer: WriterService;
  readonly reviewer: ReviewerService;
  readonly verifier: VerifierService;
  readonly judge: JudgeService;
  readonly indexer: MemoryAutoIndexer;
  readonly reportAssembler: ReportArtifactAssembler;
  readonly sectionSelfEval: SectionSelfEvalService;
  readonly sectionRemediation: SectionRemediationService;
}

// ─── Phase 5: Quality（s9/s9b）──────────────────────────────────────
export interface QualityDeps extends CommonDeps {
  readonly reviewer: ReviewerService;
  readonly reportEvaluation: ReportEvaluationService;
  readonly qualityTraceCompute: QualityTraceComputeService;
}

// ─── Phase 6: Signoff（s10）─────────────────────────────────────────
export interface SignoffDeps extends CommonDeps {
  readonly leader: LeaderService;
  readonly reviewer: ReviewerService;
}

// ─── Phase 7: Persist（s11/s12）─────────────────────────────────────
export interface PersistDeps extends CommonDeps {
  readonly failureLearner: FailureLearnerService;
  readonly postmortemClassifier: PostmortemClassifierService;
}

/**
 * MissionDeps —— 完整合成类型（trunk + buildStageDeps + 所有 stage 函数当前签名都用这个）。
 *
 * PR-7b（W22 主线波次）将逐 stage 改成更窄签名（如 runResearcherDispatchStage(ctx, deps: ResearchDeps)），
 * 让 reader 看签名就知道 stage 调用了哪些下层服务。
 */
export interface MissionDeps
  extends
    CommonDeps,
    PlanDeps,
    ResearchDeps,
    SynthesisDeps,
    WriterDeps,
    QualityDeps,
    SignoffDeps,
    PersistDeps {}
