import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { FeedbackController } from "./feedback.controller";
import { FeedbackService } from "./feedback.service";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { StorageModule } from "../storage/storage.module";
import { EmailModule } from "../email/email.module";

// AI Services
import { AiOfficeModule } from "../../ai-app/office/ai-office.module";

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
    // AI Services for Triage and Screenshot Analysis
    AiOfficeModule,
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
