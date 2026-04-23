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
  HarnessAgentRegistry,
  LeaderPlannerAgent,
  MetaExtractorAgent,
  QualityReviewerAgent,
  SectionReviewerAgent,
  SectionWriterAgent,
  SynthesizerAgent,
} from "./agents";
import { LlmInvokerService } from "./llm";
import { PipelineOrchestratorService, StageRegistry } from "./pipeline";
import {
  AssemblyStage,
  InitStage,
  IntegrateStage,
  PlanStage,
  PrismaPlanContextProvider,
  ResearchStage,
  ReviewStage,
  SynthStage,
  WriteStage,
  PlanContextProvider,
} from "./stages";

const AGENTS = [
  LeaderPlannerAgent,
  SectionWriterAgent,
  SectionReviewerAgent,
  MetaExtractorAgent,
  QualityReviewerAgent,
  SynthesizerAgent,
];

const STAGES = [
  InitStage,
  PlanStage,
  ResearchStage,
  WriteStage,
  ReviewStage,
  IntegrateStage,
  SynthStage,
  AssemblyStage,
];

@Module({
  providers: [
    HarnessAgentRegistry,
    StageRegistry,
    PipelineOrchestratorService,
    LlmInvokerService,
    { provide: PlanContextProvider, useClass: PrismaPlanContextProvider },
    ...AGENTS,
    ...STAGES,
  ],
  exports: [
    HarnessAgentRegistry,
    StageRegistry,
    PipelineOrchestratorService,
    LlmInvokerService,
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
    private readonly init: InitStage,
    private readonly plan: PlanStage,
    private readonly research: ResearchStage,
    private readonly write: WriteStage,
    private readonly review: ReviewStage,
    private readonly integrate: IntegrateStage,
    private readonly synth: SynthStage,
    private readonly assembly: AssemblyStage,
  ) {}

  onModuleInit(): void {
    // 注册 6 Core Agents
    this.agentRegistry.register(this.leader);
    this.agentRegistry.register(this.writer);
    this.agentRegistry.register(this.reviewer);
    this.agentRegistry.register(this.metaExtractor);
    this.agentRegistry.register(this.qualityReviewer);
    this.agentRegistry.register(this.synthesizer);

    // 注册 8 Core Stages
    this.stageRegistry.register(this.init);
    this.stageRegistry.register(this.plan);
    this.stageRegistry.register(this.research);
    this.stageRegistry.register(this.write);
    this.stageRegistry.register(this.review);
    this.stageRegistry.register(this.integrate);
    this.stageRegistry.register(this.synth);
    this.stageRegistry.register(this.assembly);

    const useHarness = process.env.TOPIC_INSIGHTS_USE_HARNESS === "1";
    this.logger.log(
      `HarnessModule ready — agents=${this.agentRegistry.listIds().length} ` +
        `stages=${this.stageRegistry.listIds().length} ` +
        `TOPIC_INSIGHTS_USE_HARNESS=${useHarness ? "1 (active)" : "0 (legacy)"}`,
    );
  }
}
