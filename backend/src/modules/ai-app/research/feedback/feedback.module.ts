import { Module } from "@nestjs/common";
import { FeedbackController } from "./feedback.controller";
import { FeedbackProcessingService } from "./services/feedback-processing.service";
import { FeedbackKnowledgeService } from "./services/feedback-knowledge.service";
import { FeedbackDashboardService } from "./services/feedback-dashboard.service";

@Module({
  controllers: [FeedbackController],
  providers: [
    FeedbackProcessingService,
    FeedbackKnowledgeService,
    FeedbackDashboardService,
  ],
  exports: [
    FeedbackProcessingService,
    FeedbackKnowledgeService,
    FeedbackDashboardService,
  ],
})
export class FeedbackModule {}
