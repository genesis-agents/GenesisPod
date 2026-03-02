import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { FeedbackController } from "./feedback.controller";
import { FeedbackService } from "./feedback.service";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import {
  StorageModule,
  EmailModule,
  SecretsModule,
} from "../../ai-infra/facade";

// AI Services
import { AiEngineModule } from "../../ai-engine/ai-engine.module";

// Triage
import { TriageAgentService } from "./triage/triage-agent.service";
import { SimilarityMatcherService } from "./triage/similarity-matcher.service";

// Analyzer
import { ScreenshotAnalyzerService } from "./analyzer/screenshot-analyzer.service";

// GitHub Integration
import { GitHubIssueService } from "./github/github-issue.service";

// Events
import { FeedbackEventListener } from "./events/feedback-event.listener";

@Module({
  imports: [
    PrismaModule,
    StorageModule,
    ConfigModule,
    EmailModule,
    SecretsModule,
    // AI Services for Triage and Screenshot Analysis
    AiEngineModule,
  ],
  controllers: [FeedbackController],
  providers: [
    FeedbackService,
    // Triage
    TriageAgentService,
    SimilarityMatcherService,
    // Analyzer
    ScreenshotAnalyzerService,
    // GitHub Integration
    GitHubIssueService,
    // Events
    FeedbackEventListener,
  ],
  exports: [FeedbackService, TriageAgentService],
})
export class FeedbackModule {}
