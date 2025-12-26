import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { FeedbackController } from "./feedback.controller";
import { FeedbackService } from "./feedback.service";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { StorageModule } from "../storage/storage.module";
import { EmailModule } from "../email/email.module";

// Triage
import { TriageAgentService } from "./triage/triage-agent.service";
import { SimilarityMatcherService } from "./triage/similarity-matcher.service";

// Analyzer
import { ScreenshotAnalyzerService } from "./analyzer/screenshot-analyzer.service";

// Events
import { FeedbackEventListener } from "./events/feedback-event.listener";

@Module({
  imports: [
    PrismaModule,
    StorageModule,
    ConfigModule,
    EmailModule,
    EventEmitterModule.forRoot(),
  ],
  controllers: [FeedbackController],
  providers: [
    FeedbackService,
    // Triage
    TriageAgentService,
    SimilarityMatcherService,
    // Analyzer
    ScreenshotAnalyzerService,
    // Events
    FeedbackEventListener,
  ],
  exports: [FeedbackService, TriageAgentService],
})
export class FeedbackModule {}
