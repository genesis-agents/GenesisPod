import { Module, OnModuleInit, Logger } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AiWritingController } from "./ai-writing.controller";
import { AiWritingService } from "./ai-writing.service";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { AiEngineModule } from "../../ai-engine";

// AI Engine Long Content (for long-form writing)
import { LongContentModule } from "../../ai-engine/long-content";

// WebSocket Gateway and Event Emitter
import { AiWritingGateway } from "./ai-writing.gateway";
import { WritingEventEmitterService } from "./services/events/writing-event-emitter.service";

// Bible services
import { StoryBibleService } from "./services/bible/story-bible.service";
import { CharacterService } from "./services/bible/character.service";
import { WorldSettingService } from "./services/bible/world-setting.service";
import { TimelineService } from "./services/bible/timeline.service";
import { TerminologyService } from "./services/bible/terminology.service";

// Writing services
import { ProjectService } from "./services/writing/project.service";
import { ChapterWritingService } from "./services/writing/chapter-writing.service";
import { ContextBuilderService } from "./services/writing/context-builder.service";
import { OutlineService } from "./services/writing/outline.service";

// Mission services
import { WritingMissionService } from "./services/mission/writing-mission.service";
import { WritingMissionHealthCheckService } from "./services/mission/writing-mission-health-check.service";

// Consistency services
import { ConsistencyEngineService } from "./services/consistency/consistency-engine.service";
import { PreWriteInjectionService } from "./services/consistency/pre-write-injection.service";
import { PostWriteValidationService } from "./services/consistency/post-write-validation.service";
import { ConflictResolutionService } from "./services/consistency/conflict-resolution.service";

// Parallel services
import { ParallelOrchestratorService } from "./services/parallel/parallel-orchestrator.service";
import { ChapterDependencyService } from "./services/parallel/chapter-dependency.service";
import { WriterPoolService } from "./services/parallel/writer-pool.service";
import { ParallelConflictDetectorService } from "./services/parallel/parallel-conflict-detector.service";

// Quality services (AI Writing Quality Enhancement System)
import {
  ExpressionMemoryService,
  CharacterPersonalityService,
  QualityGateService,
  HistoricalKnowledgeService,
} from "./services/quality";

// Writing Agents (extending AI Engine BaseAgent)
import {
  StoryArchitectAgent,
  BibleKeeperAgent,
  WriterAgent,
  ConsistencyCheckerAgent,
  EditorAgent,
} from "./agents";

@Module({
  imports: [PrismaModule, AiEngineModule, LongContentModule, ConfigModule],
  controllers: [AiWritingController],
  providers: [
    AiWritingService,
    // WebSocket Gateway and Event Emitter
    AiWritingGateway,
    WritingEventEmitterService,
    // Bible services
    StoryBibleService,
    CharacterService,
    WorldSettingService,
    TimelineService,
    TerminologyService,
    // Writing services
    ProjectService,
    ChapterWritingService,
    ContextBuilderService,
    OutlineService,
    // Mission services (integrates AI Teams mechanism)
    WritingMissionService,
    WritingMissionHealthCheckService,
    // Consistency services
    ConsistencyEngineService,
    PreWriteInjectionService,
    PostWriteValidationService,
    ConflictResolutionService,
    // Parallel services
    ParallelOrchestratorService,
    ChapterDependencyService,
    WriterPoolService,
    ParallelConflictDetectorService,
    // Quality services (AI Writing Quality Enhancement System)
    ExpressionMemoryService,
    CharacterPersonalityService,
    QualityGateService,
    HistoricalKnowledgeService,
    // Writing Agents (from BaseAgent)
    StoryArchitectAgent,
    BibleKeeperAgent,
    WriterAgent,
    ConsistencyCheckerAgent,
    EditorAgent,
  ],
  exports: [
    AiWritingService,
    WritingEventEmitterService,
    StoryBibleService,
    CharacterService,
    ProjectService,
    ConsistencyEngineService,
    ParallelOrchestratorService,
    WritingMissionService,
    // Quality services
    ExpressionMemoryService,
    CharacterPersonalityService,
    QualityGateService,
    HistoricalKnowledgeService,
    // Export agents for external use
    StoryArchitectAgent,
    BibleKeeperAgent,
    WriterAgent,
    ConsistencyCheckerAgent,
    EditorAgent,
  ],
})
export class AiWritingModule implements OnModuleInit {
  private readonly logger = new Logger(AiWritingModule.name);

  onModuleInit() {
    // Writing Agents are managed internally by WritingMissionService
    // They don't need to be registered with the global AgentRegistry
    // because they use a different interface (BaseAgent/IAgent vs IPlanBasedAgent)
    this.logger.log(
      "AI Writing Module initialized successfully (v2-teams-fix)",
    );
    this.logger.log("  Available Writing Agents (5):");
    this.logger.log("    - Story Architect (Leader)");
    this.logger.log("    - Bible Keeper");
    this.logger.log("    - Writer");
    this.logger.log("    - Consistency Checker");
    this.logger.log("    - Editor");
  }
}
