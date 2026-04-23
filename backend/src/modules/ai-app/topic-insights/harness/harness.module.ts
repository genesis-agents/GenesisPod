/**
 * HarnessModule — Tier Core Group E
 *
 * NestJS 模块：把所有 harness 组件（orchestrator + 2 registries + 6 agents + 8 stages）
 * 注册为 providers，topic-insights.module 通过 import 拿到完整 harness 能力。
 *
 * 启动时 onModuleInit：
 * - 向 HarnessAgentRegistry 注册 6 Core Agents
 * - 向 StageRegistry 注册 8 Core Stages
 *
 * 运行时 feature flag：
 * - `TOPIC_INSIGHTS_USE_HARNESS=1` 时，mission-execution 才会路由到 harness pipeline
 * - 默认关闭 → legacy 流程未受影响
 */

import { Logger, Module, OnModuleInit } from "@nestjs/common";
import {
  DimensionPlannerAgent,
  FactCheckerAgent,
  FactExtractorAgent,
  GapSearcherAgent,
  HarnessAgentRegistry,
  HypothesisVerifierAgent,
  LatexRepairAgent,
  LeaderDispatcherAgent,
  LeaderPlannerAgent,
  MetaExtractorAgent,
  MissionAdjusterAgent,
  QualityReviewerAgent,
  ReportEditorAgent,
  ReportEvaluatorAgent,
  SectionRemediatorAgent,
  SectionReviewerAgent,
  SectionWriterAgent,
  SynthesizerAgent,
} from "./agents";
import { LlmInvokerService } from "./llm";
import { PipelineOrchestratorService, StageRegistry } from "../pipeline";
import {
  HarnessDispatcherService,
  HarnessHealthController,
  HarnessRolloutService,
} from "../rollout";
import {
  AssemblyStage,
  CleanupStage,
  CogLoopStage,
  EvalStage,
  FactCheckStage,
  InitStage,
  IntegrateStage,
  LatexStage,
  PersistStage,
  PlanStage,
  PrismaPlanContextProvider,
  QualityGateStage,
  ResearchStage,
  ReviewStage,
  SynthStage,
  WriteStage,
  PlanContextProvider,
} from "../pipeline/stages";

const AGENTS = [
  // Core
  LeaderPlannerAgent,
  SectionWriterAgent,
  SectionReviewerAgent,
  MetaExtractorAgent,
  QualityReviewerAgent,
  SynthesizerAgent,
  // Enhancement
  DimensionPlannerAgent,
  FactCheckerAgent,
  GapSearcherAgent,
  HypothesisVerifierAgent,
  FactExtractorAgent,
  // Advanced (Group J)
  SectionRemediatorAgent,
  ReportEvaluatorAgent,
  ReportEditorAgent,
  LatexRepairAgent,
  MissionAdjusterAgent,
  LeaderDispatcherAgent,
];

const STAGES = [
  // Core
  InitStage,
  PlanStage,
  ResearchStage,
  WriteStage,
  ReviewStage,
  IntegrateStage,
  SynthStage,
  AssemblyStage,
  // Enhancement
  CogLoopStage,
  QualityGateStage,
  EvalStage,
  FactCheckStage,
  LatexStage,
  PersistStage,
  CleanupStage,
];

@Module({
  controllers: [HarnessHealthController],
  providers: [
    HarnessAgentRegistry,
    StageRegistry,
    PipelineOrchestratorService,
    LlmInvokerService,
    HarnessRolloutService,
    HarnessDispatcherService,
    { provide: PlanContextProvider, useClass: PrismaPlanContextProvider },
    ...AGENTS,
    ...STAGES,
  ],
  exports: [
    HarnessAgentRegistry,
    StageRegistry,
    PipelineOrchestratorService,
    LlmInvokerService,
    HarnessRolloutService,
    HarnessDispatcherService,
  ],
})
export class HarnessModule implements OnModuleInit {
  private readonly logger = new Logger(HarnessModule.name);

  constructor(
    private readonly agentRegistry: HarnessAgentRegistry,
    private readonly stageRegistry: StageRegistry,
    // Nest injects singletons of each
    private readonly leader: LeaderPlannerAgent,
    private readonly writer: SectionWriterAgent,
    private readonly reviewer: SectionReviewerAgent,
    private readonly metaExtractor: MetaExtractorAgent,
    private readonly qualityReviewer: QualityReviewerAgent,
    private readonly synthesizer: SynthesizerAgent,
    private readonly dimPlanner: DimensionPlannerAgent,
    private readonly factChecker: FactCheckerAgent,
    private readonly gapSearcher: GapSearcherAgent,
    private readonly hypVerifier: HypothesisVerifierAgent,
    private readonly factExtractor: FactExtractorAgent,
    private readonly sectionRemediator: SectionRemediatorAgent,
    private readonly reportEvaluator: ReportEvaluatorAgent,
    private readonly reportEditor: ReportEditorAgent,
    private readonly latexRepair: LatexRepairAgent,
    private readonly missionAdjuster: MissionAdjusterAgent,
    private readonly leaderDispatcher: LeaderDispatcherAgent,
    private readonly init: InitStage,
    private readonly plan: PlanStage,
    private readonly research: ResearchStage,
    private readonly write: WriteStage,
    private readonly review: ReviewStage,
    private readonly integrate: IntegrateStage,
    private readonly cogLoop: CogLoopStage,
    private readonly synth: SynthStage,
    private readonly qgate: QualityGateStage,
    private readonly evalStage: EvalStage,
    private readonly factCheckStage: FactCheckStage,
    private readonly assembly: AssemblyStage,
    private readonly latexStage: LatexStage,
    private readonly persistStage: PersistStage,
    private readonly cleanupStage: CleanupStage,
  ) {}

  onModuleInit(): void {
    // 注册 17 Agents（Core 6 + Enhancement 5 + Advanced 6）
    this.agentRegistry.register(this.leader);
    this.agentRegistry.register(this.writer);
    this.agentRegistry.register(this.reviewer);
    this.agentRegistry.register(this.metaExtractor);
    this.agentRegistry.register(this.qualityReviewer);
    this.agentRegistry.register(this.synthesizer);
    this.agentRegistry.register(this.dimPlanner);
    this.agentRegistry.register(this.factChecker);
    this.agentRegistry.register(this.gapSearcher);
    this.agentRegistry.register(this.hypVerifier);
    this.agentRegistry.register(this.factExtractor);
    this.agentRegistry.register(this.sectionRemediator);
    this.agentRegistry.register(this.reportEvaluator);
    this.agentRegistry.register(this.reportEditor);
    this.agentRegistry.register(this.latexRepair);
    this.agentRegistry.register(this.missionAdjuster);
    this.agentRegistry.register(this.leaderDispatcher);

    // 注册 15 Stages（Core 8 + Enhancement 7：COGLOOP/QGATE/EVAL/FACT/LATEX/PERSIST/CLEANUP）
    this.stageRegistry.register(this.init);
    this.stageRegistry.register(this.plan);
    this.stageRegistry.register(this.research);
    this.stageRegistry.register(this.write);
    this.stageRegistry.register(this.review);
    this.stageRegistry.register(this.integrate);
    this.stageRegistry.register(this.cogLoop);
    this.stageRegistry.register(this.synth);
    this.stageRegistry.register(this.qgate);
    this.stageRegistry.register(this.evalStage);
    this.stageRegistry.register(this.factCheckStage);
    this.stageRegistry.register(this.assembly);
    this.stageRegistry.register(this.latexStage);
    this.stageRegistry.register(this.persistStage);
    this.stageRegistry.register(this.cleanupStage);

    const useHarness = process.env.TOPIC_INSIGHTS_USE_HARNESS === "1";
    this.logger.log(
      `HarnessModule ready — agents=${this.agentRegistry.listIds().length} ` +
        `stages=${this.stageRegistry.listIds().length} ` +
        `TOPIC_INSIGHTS_USE_HARNESS=${useHarness ? "1 (active)" : "0 (legacy)"}`,
    );
  }
}
