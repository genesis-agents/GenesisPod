import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AiWritingController } from "./ai-writing.controller";
import { AiWritingService } from "./ai-writing.service";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { AiEngineModule } from "../../ai-engine";

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

@Module({
  imports: [PrismaModule, AiEngineModule, ConfigModule],
  controllers: [AiWritingController],
  providers: [
    AiWritingService,
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
  ],
  exports: [
    AiWritingService,
    StoryBibleService,
    CharacterService,
    ProjectService,
    ConsistencyEngineService,
    ParallelOrchestratorService,
  ],
})
export class AiWritingModule {}
