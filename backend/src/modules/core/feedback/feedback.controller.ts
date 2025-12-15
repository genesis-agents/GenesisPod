import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Logger,
  Request,
} from "@nestjs/common";
import { FeedbackService } from "./feedback.service";
import { CreateFeedbackDto } from "./dto/create-feedback.dto";
import { JwtAuthGuard } from "../../../common/guards/jwt-auth.guard";
import { AdminGuard } from "../../../common/guards/admin.guard";
import { OptionalJwtAuthGuard } from "../../../common/guards/optional-jwt-auth.guard";

// Type definitions for feedback enums
type FeedbackStatusEnum =
  | "PENDING"
  | "REVIEWED"
  | "IN_PROGRESS"
  | "RESOLVED"
  | "CLOSED";
type FeedbackTypeEnum = "BUG" | "FEATURE" | "IMPROVEMENT" | "OTHER";

@Controller("feedback")
export class FeedbackController {
  private readonly logger = new Logger(FeedbackController.name);

  constructor(private feedbackService: FeedbackService) {}

  /**
   * Submit feedback (public, but can include user info if logged in)
   * POST /api/v1/feedback
   */
  @Post()
  @UseGuards(OptionalJwtAuthGuard)
  async submitFeedback(
    @Body() dto: CreateFeedbackDto,
    @Request() req: { user?: { id: string } },
  ) {
    this.logger.log(`Feedback submitted: ${dto.type} - ${dto.title}`);
    return this.feedbackService.createFeedback(dto, req.user?.id);
  }

  /**
   * Get all feedback (admin only)
   * GET /api/v1/feedback
   */
  @Get()
  @UseGuards(JwtAuthGuard, AdminGuard)
  async getAllFeedback(
    @Query("status") status?: FeedbackStatusEnum,
    @Query("type") type?: FeedbackTypeEnum,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    return this.feedbackService.getAllFeedback({
      status,
      type,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  /**
   * Get feedback statistics (admin only)
   * GET /api/v1/feedback/stats
   */
  @Get("stats")
  @UseGuards(JwtAuthGuard, AdminGuard)
  async getFeedbackStats() {
    return this.feedbackService.getFeedbackStats();
  }

  /**
   * Get feedback by ID (admin only)
   * GET /api/v1/feedback/:id
   */
  @Get(":id")
  @UseGuards(JwtAuthGuard, AdminGuard)
  async getFeedback(@Param("id") id: string) {
    return this.feedbackService.getFeedbackById(id);
  }

  /**
   * Update feedback status (admin only)
   * PATCH /api/v1/feedback/:id/status
   */
  @Patch(":id/status")
  @UseGuards(JwtAuthGuard, AdminGuard)
  async updateFeedbackStatus(
    @Param("id") id: string,
    @Body("status") status: FeedbackStatusEnum,
    @Body("adminNotes") adminNotes?: string,
  ) {
    return this.feedbackService.updateFeedbackStatus(id, status, adminNotes);
  }
}
