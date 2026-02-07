import { Module, OnModuleInit, Logger } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AiWritingController } from "./ai-writing.controller";
import { AiWritingService } from "./ai-writing.service";
import { WritingCoordinatorService } from "./writing-coordinator.service";
import { WritingRepository } from "./writing.repository";
import { PrismaModule } from "../../../common/prisma/prisma.module";
// 直接从文件导入，避免 barrel export 循环依赖
import { AiEngineModule } from "../../ai-engine/ai-engine.module";
import { CreditsModule } from "../../credits/credits.module";

// AI Engine Long Content (for long-form writing) - 直接文件导入
import { LongContentModule } from "../../ai-engine/long-content/long-content.module";

// WebSocket Gateway and Event Emitter
import { AiWritingGateway } from "./ai-writing.gateway";
import { WritingEventEmitterService } from "./services/events/writing-event-emitter.service";
import { WritingRealtimeAdapter } from "./services/events/writing-realtime.adapter";

// Bible services
import { StoryBibleService } from "./services/bible/story-bible.service";
import { CharacterService } from "./services/bible/character.service";
import { WorldSettingService } from "./services/bible/world-setting.service";
import { TimelineService } from "./services/bible/timeline.service";
import { TerminologyService } from "./services/bible/terminology.service";
import { WorldBuildingEnhancerService } from "./services/bible/world-building-enhancer.service";

// Writing services
import { ProjectService } from "./services/writing/project.service";
import { ChapterWritingService } from "./services/writing/chapter-writing.service";
import { ChapterRevisionService } from "./services/writing/chapter-revision.service";
import { ChapterAnnotationService } from "./services/writing/chapter-annotation.service";
import { ChapterImportService } from "./services/writing/chapter-import.service";
import { ContextBuilderService } from "./services/writing/context-builder.service";
import { OutlineService } from "./services/writing/outline.service";
// v4-DOME: 新增层次摘要和动态大纲服务
import { HierarchicalSummaryService } from "./services/writing/hierarchical-summary.service";
import { DynamicOutlineService } from "./services/writing/dynamic-outline.service";

// Mission services
import { WritingMissionService } from "./services/mission/writing-mission.service";
import { WritingMissionHealthCheckService } from "./services/mission/writing-mission-health-check.service";
import { WritingAgentCoordinator } from "./services/mission/writing-agent-coordinator.service";
import { WritingContextService } from "./services/mission/writing-context.service";
import { WritingStyleService } from "./services/mission/writing-style.service";
import { WritingQualityService } from "./services/mission/writing-quality.service";
import { CheckpointService } from "./services/mission/checkpoint.service";
import { WritingModelManager } from "./services/mission/writing-model-manager.service";
import { WritingPersistence } from "./services/mission/writing-persistence.service";
import { WritingExecutionService } from "./services/mission/writing-execution.service";
import { WritingContentGeneratorService } from "./services/mission/writing-content-generator.service";
// v4-DOME: Agent 共享便签板
import { SharedScratchpadService } from "./services/mission/shared-scratchpad.service";

// Consistency services
import { ConsistencyEngineService } from "./services/consistency/consistency-engine.service";
import { PreWriteInjectionService } from "./services/consistency/pre-write-injection.service";
import { PostWriteValidationService } from "./services/consistency/post-write-validation.service";
import { ConflictResolutionService } from "./services/consistency/conflict-resolution.service";
import { FactExtractorService } from "./services/consistency/fact-extractor.service";
import { ChapterCoherenceService } from "./services/consistency/chapter-coherence.service";
// v4-DOME: 时序冲突检测矩阵
import { TemporalConflictAnalyzerService } from "./services/consistency/temporal-conflict-analyzer.service";

// Parallel services
import { ParallelOrchestratorService } from "./services/parallel/parallel-orchestrator.service";
import { ChapterDependencyService } from "./services/parallel/chapter-dependency.service";
import { WriterPoolService } from "./services/parallel/writer-pool.service";
import { ParallelConflictDetectorService } from "./services/parallel/parallel-conflict-detector.service";

// Quality services (AI Writing Quality Enhancement System)
import {
  ExpressionMemoryService,
  CharacterPersonalityService,
  CharacterConsistencyService,
  QualityGateService,
  HistoricalKnowledgeService,
  DialogueConstraintsService,
  NarrativePacingService,
  SemanticConsistencyService,
  ExpressionAlternativesService,
  ProfessionalVoiceService,
  SensoryImmersionService,
  OpeningHookService,
  ForeshadowingService,
  PacingControlService,
  ChapterQualityEvaluatorService,
  NarrativeCraftService,
  WritingQualityCheckerService,
  StoryCompletionDetectorService,
} from "./services/quality";

// Style services (Three-layer style configuration system)
import { StyleTemplateService } from "./services/style/style-template.service";

// Writing Agents (extending AI Engine BaseAgent)
import {
  StoryArchitectAgent,
  BibleKeeperAgent,
  WriterAgent,
  ConsistencyCheckerAgent,
  EditorAgent,
} from "./agents";

@Module({
  imports: [
    PrismaModule,
    AiEngineModule,
    LongContentModule,
    ConfigModule,
    CreditsModule,
  ],
  controllers: [AiWritingController],
  providers: [
    // Repository
    WritingRepository,

    AiWritingService,
    WritingCoordinatorService,
    // WebSocket Gateway and Event Emitter
    AiWritingGateway,
    WritingEventEmitterService,
    WritingRealtimeAdapter, // ★ Engine Realtime 集成
    // Bible services
    StoryBibleService,
    CharacterService,
    WorldSettingService,
    TimelineService,
    TerminologyService,
    WorldBuildingEnhancerService,
    // Writing services
    ProjectService,
    ChapterWritingService,
    ChapterRevisionService,
    ChapterAnnotationService,
    ChapterImportService,
    ContextBuilderService,
    OutlineService,
    // v4-DOME: 层次摘要和动态大纲
    HierarchicalSummaryService,
    DynamicOutlineService,
    // Mission services (integrates AI Teams mechanism)
    WritingMissionService,
    WritingMissionHealthCheckService,
    WritingAgentCoordinator,
    WritingContextService,
    WritingStyleService,
    WritingQualityService,
    CheckpointService,
    WritingModelManager,
    WritingPersistence,
    WritingExecutionService,
    WritingContentGeneratorService,
    // v4-DOME: Agent 共享便签板
    SharedScratchpadService,
    // Consistency services
    ConsistencyEngineService,
    PreWriteInjectionService,
    PostWriteValidationService,
    ConflictResolutionService,
    FactExtractorService,
    ChapterCoherenceService,
    // v4-DOME: 时序冲突检测矩阵
    TemporalConflictAnalyzerService,
    // Parallel services
    ParallelOrchestratorService,
    ChapterDependencyService,
    WriterPoolService,
    ParallelConflictDetectorService,
    // Quality services (AI Writing Quality Enhancement System)
    ExpressionMemoryService,
    CharacterPersonalityService,
    CharacterConsistencyService,
    QualityGateService,
    HistoricalKnowledgeService,
    DialogueConstraintsService,
    NarrativePacingService,
    SemanticConsistencyService,
    ExpressionAlternativesService,
    ProfessionalVoiceService,
    SensoryImmersionService,
    OpeningHookService,
    ForeshadowingService,
    PacingControlService,
    ChapterQualityEvaluatorService,
    NarrativeCraftService,
    WritingQualityCheckerService,
    // v4-DOME: 智能故事完结检测
    StoryCompletionDetectorService,
    // Style services (Three-layer style configuration)
    StyleTemplateService,
    // Writing Agents (from BaseAgent)
    StoryArchitectAgent,
    BibleKeeperAgent,
    WriterAgent,
    ConsistencyCheckerAgent,
    EditorAgent,
  ],
  exports: [AiWritingService, WritingRepository],
})
export class AiWritingModule implements OnModuleInit {
  private readonly logger = new Logger(AiWritingModule.name);

  constructor(private readonly styleTemplateService: StyleTemplateService) {}

  async onModuleInit() {
    // Writing Agents are managed internally by WritingMissionService
    // They don't need to be registered with the global AgentRegistry
    // because they use a different interface (BaseAgent/IAgent vs IPlanBasedAgent)
    this.logger.log(
      "AI Writing Module initialized successfully (v4-DOME-enhanced)",
    );
    this.logger.log("  Available Writing Agents (5):");
    this.logger.log("    - Story Architect (Leader)");
    this.logger.log("    - Bible Keeper");
    this.logger.log("    - Writer");
    this.logger.log("    - Consistency Checker");
    this.logger.log("    - Editor");

    // 初始化系统风格模板
    try {
      await this.styleTemplateService.initializeSystemTemplates();
      this.logger.log("  System style templates initialized");
    } catch (e) {
      this.logger.warn(
        `Failed to initialize system style templates: ${(e as Error).message}`,
      );
    }
  }
}
