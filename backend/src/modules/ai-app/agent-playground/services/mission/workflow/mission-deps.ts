/**
 * MissionDeps —— stage 函数所需的依赖包
 *
 * 由 trunk team.mission.ts 在 runMission 入口装配一次，
 * 然后传给每个 stage 函数。包括：
 *   - role services（per-role 路径）
 *   - lifecycle services（持久化 / 状态机 / abort）
 *   - cross-cutting infra（invoker / failureLearner / indexer / judge / reportAssembler）
 *   - 一次性 helpers（emit / lifecycle / tickCostDelta 直接 bind 到 mission class
 *     当前实现，让 stage 函数无须知道这些是 invoker 上的方法还是 mission class 私有方法）
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
import type { MissionStateService } from "../lifecycle/mission-state.service";
import type { MissionAbortRegistry } from "../lifecycle/mission-abort.registry";
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
} from "../../../../../ai-harness/facade";
import type { FigureExtractorService } from "../../../../../ai-engine/facade";
import type { CreditsService } from "../../../../../ai-infra/credits/credits.service";
import type { RuntimeEnvironmentService } from "@/modules/ai-harness/facade";

/** 通用 emit 签名（来自 mission class） */
export type EmitFn = (args: {
  type: string;
  missionId: string;
  userId: string;
  agentId?: string;
  traceId?: string;
  payload: unknown;
}) => Promise<void>;

export type LifecycleFn = (
  missionId: string,
  userId: string,
  agentId: string,
  role: string,
  phase: "started" | "completed" | "failed",
  detail?: Record<string, unknown>,
) => Promise<void>;

export interface MissionDeps {
  // ── role services ──
  readonly leader: LeaderService;
  readonly reconciler: ReconcilerService;
  readonly analyst: AnalystService;
  readonly writer: WriterService;
  readonly reviewer: ReviewerService;
  readonly verifier: VerifierService;
  readonly steward: StewardService;
  readonly invoker: AgentInvoker;

  // ── lifecycle ──
  readonly store: MissionStore;
  readonly missionState: MissionStateService;
  readonly abortRegistry: MissionAbortRegistry;

  // ── cross-cutting / engine ──
  readonly runner: AgentRunner;
  readonly judge: JudgeService;
  readonly indexer: MemoryAutoIndexer;
  readonly eventBus: DomainEventBus;
  readonly credits: CreditsService;
  readonly runtimeEnv: RuntimeEnvironmentService;
  readonly failureLearner: FailureLearnerService;
  readonly reportAssembler: ReportArtifactAssembler;
  // ★ 沉淀（2026-04-29）: figure pipeline（agent-playground 复用，TI 暂保留私有实现）
  readonly figureExtractor: FigureExtractorService;
  readonly figureRelevance: FigureRelevanceService;
  // ★ 沉淀 v3 (2026-04-29): quality 闭环 — section self-eval / 弱维度补救 / 10 维评审 / 全链路 trace
  readonly sectionSelfEval: SectionSelfEvalService;
  readonly sectionRemediation: SectionRemediationService;
  readonly reportEvaluation: ReportEvaluationService;
  readonly qualityTraceCompute: QualityTraceComputeService;

  // ── bound helpers from trunk class（stage 不关心实现位置）──
  readonly log: Logger;
  readonly emit: EmitFn;
  readonly lifecycle: LifecycleFn;
}
