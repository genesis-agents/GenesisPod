import { Module } from "@nestjs/common";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { AiEngineModule } from "../../ai-engine";
import { StorageModule } from "../../core/storage/storage.module";
import { CreditsModule } from "../../credits/credits.module";
import { AiStudioController } from "./ai-studio.controller";
import { AiStudioService } from "./ai-studio.service";
import { AiStudioSourceService } from "./ai-studio-source.service";
import { AiStudioChatService } from "./ai-studio-chat.service";
import { AiStudioOutputService } from "./ai-studio-output.service";
import { AiStudioTTSService } from "./ai-studio-tts.service";
import { FileParserService } from "./services/file-parser.service";

// Deep Research services
import { DeepResearchController } from "./deep-research/deep-research.controller";
import { DeepResearchAgentService } from "./deep-research/deep-research-agent.service";
import { ResearchPlannerService } from "./deep-research/research-planner.service";
import { IterativeSearchService } from "./deep-research/iterative-search.service";
import { SelfReflectionService } from "./deep-research/self-reflection.service";
import { ReportSynthesizerService } from "./deep-research/report-synthesizer.service";

@Module({
  imports: [PrismaModule, AiEngineModule, StorageModule, CreditsModule],
  controllers: [AiStudioController, DeepResearchController],
  providers: [
    AiStudioService,
    AiStudioSourceService,
    AiStudioChatService,
    AiStudioOutputService,
    AiStudioTTSService,
    FileParserService,
    // Deep Research services
    DeepResearchAgentService,
    ResearchPlannerService,
    IterativeSearchService,
    SelfReflectionService,
    ReportSynthesizerService,
  ],
  exports: [
    AiStudioService,
    AiStudioSourceService,
    AiStudioChatService,
    AiStudioOutputService,
    AiStudioTTSService,
    DeepResearchAgentService,
  ],
})
export class AiStudioModule {}
