import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  Logger,
  Request,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
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
   * Submit feedback with optional file attachments
   * POST /api/v1/feedback
   */
  @Post()
  @UseGuards(OptionalJwtAuthGuard)
  @UseInterceptors(
    FilesInterceptor("files", 5, {
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max per file
      fileFilter: (_req, file, callback) => {
        // Allow images, PDFs, and common document types
        const allowedTypes = [
          "image/jpeg",
          "image/png",
          "image/gif",
          "image/webp",
          "application/pdf",
          "text/plain",
          "application/json",
          "text/html",
          "text/css",
          "text/javascript",
          "application/javascript",
        ];
        if (allowedTypes.includes(file.mimetype)) {
          callback(null, true);
        } else {
          callback(null, false); // Silently reject unsupported types
        }
      },
    }),
  )
  async submitFeedback(
    @Body() dto: CreateFeedbackDto,
    @Request() req: { user?: { id: string } },
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    this.logger.log(
      `Feedback submitted: ${dto.type} - ${dto.title} (${files?.length || 0} files)`,
    );
    return this.feedbackService.createFeedback(dto, req.user?.id, files);
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
