import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from "@nestjs/common";
import { AiSocialService } from "./ai-social.service";
import { SocialLeaderService } from "./services/social-leader.service";
import { ReviewService } from "./services/review.service";
import { JwtAuthGuard } from "../../../common/guards/jwt-auth.guard";
import { AdminGuard } from "../../../common/guards/admin.guard";
import { CreateContentDto } from "./dto/create-content.dto";
import { UpdateContentDto } from "./dto/update-content.dto";
import { ProcessUrlDto } from "./dto/process-url.dto";
import { ProcessSourceDto } from "./dto/process-source.dto";
import { PublishContentDto } from "./dto/publish-content.dto";

interface AuthenticatedRequest {
  user: { id: string };
}

@Controller("ai-social")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AiSocialController {
  constructor(
    private readonly aiSocialService: AiSocialService,
    private readonly socialLeaderService: SocialLeaderService,
    private readonly reviewService: ReviewService,
  ) {}

  // ==================== 平台连接 ====================

  @Get("connections")
  async getConnections(@Request() req: AuthenticatedRequest) {
    return this.aiSocialService.getConnections(req.user.id);
  }

  @Post("connections/:type/init")
  async initConnection(
    @Request() req: AuthenticatedRequest,
    @Param("type") type: string,
  ) {
    return this.aiSocialService.initConnection(req.user.id, type);
  }

  @Post("connections/:type/verify")
  async verifyConnection(
    @Request() req: AuthenticatedRequest,
    @Param("type") type: string,
  ) {
    return this.aiSocialService.verifyConnection(req.user.id, type);
  }

  @Delete("connections/:type")
  async deleteConnection(
    @Request() req: AuthenticatedRequest,
    @Param("type") type: string,
  ) {
    return this.aiSocialService.deleteConnection(req.user.id, type);
  }

  @Post("connections/:id/test")
  async testConnection(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
  ) {
    return this.aiSocialService.testConnection(req.user.id, id);
  }

  @Post("connections/:id/refresh")
  async refreshConnection(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
  ) {
    return this.aiSocialService.refreshConnection(req.user.id, id);
  }

  // ==================== 内容管理 ====================

  @Get("contents")
  async getContents(
    @Request() req: AuthenticatedRequest,
    @Query("status") status?: string,
    @Query("contentType") contentType?: string,
    @Query("page") page?: number,
    @Query("limit") limit?: number,
  ) {
    return this.aiSocialService.getContents(req.user.id, {
      status,
      contentType,
      page: page || 1,
      limit: limit || 20,
    });
  }

  @Post("contents")
  async createContent(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreateContentDto,
  ) {
    return this.aiSocialService.createContent(req.user.id, dto);
  }

  // Note: This specific route MUST come before @Get("contents/:id") to avoid route conflict
  @Get("contents/pending-review")
  async getPendingReviewContents(@Request() req: AuthenticatedRequest) {
    return this.reviewService.getPendingReviewContents(req.user.id);
  }

  @Get("contents/:id")
  async getContent(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
  ) {
    return this.aiSocialService.getContent(req.user.id, id);
  }

  @Patch("contents/:id")
  async updateContent(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: UpdateContentDto,
  ) {
    return this.aiSocialService.updateContent(req.user.id, id, dto);
  }

  @Delete("contents/:id")
  async deleteContent(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
  ) {
    return this.aiSocialService.deleteContent(req.user.id, id);
  }

  // ==================== 内容检测 ====================

  @Post("contents/:id/check")
  async checkContent(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
  ) {
    return this.aiSocialService.checkContent(req.user.id, id);
  }

  // ==================== 发布管理 ====================

  @Post("contents/:id/publish")
  async publishContent(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: PublishContentDto,
  ) {
    return this.aiSocialService.publishContent(req.user.id, id, dto);
  }

  @Post("contents/:id/schedule")
  async scheduleContent(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: { scheduledAt: string },
  ) {
    return this.aiSocialService.scheduleContent(
      req.user.id,
      id,
      new Date(dto.scheduledAt),
    );
  }

  @Post("contents/:id/cancel")
  async cancelPublish(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
  ) {
    return this.aiSocialService.cancelPublish(req.user.id, id);
  }

  @Get("contents/:id/logs")
  async getPublishLogs(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
  ) {
    return this.aiSocialService.getPublishLogs(req.user.id, id);
  }

  // ==================== 导入来源 ====================

  @Get("sources/explore")
  async getExploreSources(
    @Request() req: AuthenticatedRequest,
    @Query("type") type?: string,
    @Query("page") page?: number,
    @Query("limit") limit?: number,
  ) {
    return this.aiSocialService.getExploreSources(req.user.id, {
      type,
      page: page || 1,
      limit: limit || 20,
    });
  }

  @Get("sources/research")
  async getResearchSources(@Request() req: AuthenticatedRequest) {
    return this.aiSocialService.getResearchSources(req.user.id);
  }

  @Get("sources/office")
  async getOfficeSources(@Request() req: AuthenticatedRequest) {
    return this.aiSocialService.getOfficeSources(req.user.id);
  }

  @Get("sources/writing")
  async getWritingSources(@Request() req: AuthenticatedRequest) {
    return this.aiSocialService.getWritingSources(req.user.id);
  }

  // ==================== AI Engine ====================

  @Post("ai/process-url")
  async processUrl(
    @Request() req: AuthenticatedRequest,
    @Body() dto: ProcessUrlDto,
  ) {
    return this.socialLeaderService.processUrl(req.user.id, dto);
  }

  @Post("ai/process-source")
  async processSource(
    @Request() req: AuthenticatedRequest,
    @Body() dto: ProcessSourceDto,
  ) {
    return this.socialLeaderService.processSource(req.user.id, dto);
  }

  @Post("ai/regenerate/:id")
  async regenerateContent(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
  ) {
    return this.socialLeaderService.regenerateContent(req.user.id, id);
  }

  // ==================== 审核管理 ====================

  @Post("contents/:id/approve")
  async approveContent(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: { note?: string },
  ) {
    return this.reviewService.approveContent(req.user.id, id, dto.note);
  }

  @Post("contents/:id/reject")
  async rejectContent(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: { note: string },
  ) {
    return this.reviewService.rejectContent(req.user.id, id, dto.note);
  }

  @Post("contents/:id/resubmit")
  async resubmitForReview(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
  ) {
    return this.reviewService.resubmitForReview(req.user.id, id);
  }
}
