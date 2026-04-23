/**
 * PipelineModule — Topic Insights pipeline providers
 *
 * 目标架构 v2：取代旧 HarnessModule（已删除）。只负责 pipeline 编排 + 15 stage
 * 注册到 StageRegistry。17 个 agent 已经在 topic-insights.module 的 onModuleInit
 * 里从 agents-spec 生成并注册到 L2 SpecAgentRegistry，不再由本模块承载。
 */

import { Logger, Module, OnModuleInit } from "@nestjs/common";
import { PipelineOrchestratorService } from "./pipeline-orchestrator.service";
import { StageRegistry } from "./stage-registry";
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
} from "./stages";
import {
  MissionMetricsService,
  TopicInsightsHealthController,
} from "../telemetry";
import { DispatcherService } from "../intent";
import { TopicInsightsCapabilityReconciler } from "../capability";

const STAGES = [
  InitStage,
  PlanStage,
  ResearchStage,
  WriteStage,
  ReviewStage,
  IntegrateStage,
  SynthStage,
  AssemblyStage,
  CogLoopStage,
  QualityGateStage,
  EvalStage,
  FactCheckStage,
  LatexStage,
  PersistStage,
  CleanupStage,
];

@Module({
  controllers: [TopicInsightsHealthController],
  providers: [
    StageRegistry,
    PipelineOrchestratorService,
    MissionMetricsService,
    DispatcherService,
    TopicInsightsCapabilityReconciler,
    { provide: PlanContextProvider, useClass: PrismaPlanContextProvider },
    ...STAGES,
  ],
  exports: [
    StageRegistry,
    PipelineOrchestratorService,
    MissionMetricsService,
    DispatcherService,
    TopicInsightsCapabilityReconciler,
  ],
})
export class PipelineModule implements OnModuleInit {
  private readonly logger = new Logger(PipelineModule.name);

  constructor(
    private readonly stageRegistry: StageRegistry,
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
    // 注册 15 Stages 到 StageRegistry
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

    this.logger.log(
      `PipelineModule ready — stages=${this.stageRegistry.listIds().length}`,
    );
  }
}
