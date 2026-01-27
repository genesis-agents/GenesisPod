import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
  UnauthorizedException,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../../../../common/guards/jwt-auth.guard";
import type { RequestWithUser } from "../../../../common/types/express-request.types";
import { FeedbackProcessingService } from "./services/feedback-processing.service";
import { FeedbackKnowledgeService } from "./services/feedback-knowledge.service";
import { FeedbackDashboardService } from "./services/feedback-dashboard.service";
import {
  CreateFeedbackItemDto,
  CreateFromAnnotationDto,
  UpdateFeedbackItemDto,
  FeedbackQueryDto,
  CreateFeedbackKnowledgeDto,
  UpdateFeedbackKnowledgeDto,
  EvaluateEffectDto,
  KnowledgeQueryDto,
} from "./dto";

@ApiTags("研究反馈闭环")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("api/v1/feedback")
export class FeedbackController {
  constructor(
    private readonly feedbackProcessingService: FeedbackProcessingService,
    private readonly feedbackKnowledgeService: FeedbackKnowledgeService,
    private readonly feedbackDashboardService: FeedbackDashboardService,
  ) {}

  // ==================== 反馈管理 ====================

  @Post()
  @ApiOperation({ summary: "创建反馈" })
  @ApiResponse({ status: 201, description: "反馈创建成功" })
  async createFeedback(
    @Request() req: RequestWithUser,
    @Body() dto: CreateFeedbackItemDto,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    return this.feedbackProcessingService.createFeedbackItem(userId, dto);
  }

  @Post("from-annotation/:annotationId")
  @ApiOperation({ summary: "从批注创建反馈" })
  @ApiResponse({ status: 201, description: "反馈创建成功" })
  async createFromAnnotation(
    @Request() req: RequestWithUser,
    @Param("annotationId") annotationId: string,
    @Body() dto: Omit<CreateFromAnnotationDto, "annotationId">,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    return this.feedbackProcessingService.createFromAnnotation(userId, {
      annotationId,
      ...dto,
    });
  }

  @Get()
  @ApiOperation({ summary: "获取反馈列表" })
  @ApiResponse({ status: 200, description: "返回反馈列表" })
  async getFeedbackItems(@Query() query: FeedbackQueryDto) {
    return this.feedbackProcessingService.getFeedbackItems(query);
  }

  @Get(":id")
  @ApiOperation({ summary: "获取反馈详情" })
  @ApiResponse({ status: 200, description: "返回反馈详情" })
  async getFeedbackItem(@Param("id") id: string) {
    return this.feedbackProcessingService.getFeedbackItem(id);
  }

  @Patch(":id")
  @ApiOperation({ summary: "更新反馈" })
  @ApiResponse({ status: 200, description: "反馈更新成功" })
  async updateFeedbackItem(
    @Param("id") id: string,
    @Body() dto: UpdateFeedbackItemDto,
  ) {
    return this.feedbackProcessingService.updateFeedbackItem(id, dto);
  }

  @Delete(":id")
  @ApiOperation({ summary: "删除反馈" })
  @ApiResponse({ status: 200, description: "反馈删除成功" })
  async deleteFeedbackItem(@Param("id") id: string) {
    return this.feedbackProcessingService.deleteFeedbackItem(id);
  }

  @Post(":id/analyze")
  @ApiOperation({ summary: "触发 AI 分析" })
  @ApiResponse({ status: 200, description: "分析结果" })
  async analyzeFeedback(@Param("id") id: string) {
    return this.feedbackProcessingService.analyzeAndClassify(id);
  }

  @Post("process-pending")
  @ApiOperation({ summary: "批量处理待分析反馈" })
  @ApiResponse({ status: 200, description: "处理数量" })
  async processPendingFeedback(@Query("limit") limit?: number) {
    const processed =
      await this.feedbackProcessingService.processPendingFeedback(limit);
    return { processed };
  }

  @Get("clusters/similar")
  @ApiOperation({ summary: "聚类相似反馈" })
  @ApiResponse({ status: 200, description: "聚类结果" })
  async clusterSimilarFeedback(
    @Query("topicId") topicId?: string,
    @Query("minItems") minItems?: number,
  ) {
    return this.feedbackProcessingService.clusterSimilarFeedback({
      topicId,
      minItems,
    });
  }

  // ==================== 仪表板 ====================

  @Get("dashboard/stats")
  @ApiOperation({ summary: "获取仪表板统计" })
  @ApiResponse({ status: 200, description: "统计数据" })
  async getDashboardStats() {
    return this.feedbackDashboardService.getStats();
  }

  @Get("dashboard/pending")
  @ApiOperation({ summary: "获取待审核列表" })
  @ApiResponse({ status: 200, description: "待审核反馈列表" })
  async getPendingReview(
    @Query("page") page?: number,
    @Query("limit") limit?: number,
  ) {
    return this.feedbackDashboardService.getPendingReview(page, limit);
  }

  @Get("dashboard/tracking")
  @ApiOperation({ summary: "获取改进追踪" })
  @ApiResponse({ status: 200, description: "改进追踪数据" })
  async getImprovementTracking() {
    return this.feedbackDashboardService.getImprovementTracking();
  }

  @Get("dashboard/high-priority")
  @ApiOperation({ summary: "获取高优先级反馈" })
  @ApiResponse({ status: 200, description: "高优先级反馈列表" })
  async getHighPriorityItems(@Query("limit") limit?: number) {
    return this.feedbackDashboardService.getHighPriorityItems(limit);
  }

  @Get("dashboard/topic/:topicId")
  @ApiOperation({ summary: "获取专题反馈统计" })
  @ApiResponse({ status: 200, description: "专题统计数据" })
  async getTopicStats(@Param("topicId") topicId: string) {
    return this.feedbackDashboardService.getStatsByTopic(topicId);
  }

  // ==================== 知识沉淀 ====================

  @Post(":feedbackId/knowledge")
  @ApiOperation({ summary: "创建知识条目" })
  @ApiResponse({ status: 201, description: "知识条目创建成功" })
  async createKnowledge(
    @Param("feedbackId") feedbackId: string,
    @Body() dto: CreateFeedbackKnowledgeDto,
  ) {
    return this.feedbackKnowledgeService.createKnowledgeItem(feedbackId, dto);
  }

  @Post(":feedbackId/extract-knowledge")
  @ApiOperation({ summary: "AI 自动提取知识" })
  @ApiResponse({ status: 200, description: "知识提取建议" })
  async extractKnowledge(@Param("feedbackId") feedbackId: string) {
    return this.feedbackKnowledgeService.extractKnowledge(feedbackId);
  }

  @Get("knowledge")
  @ApiOperation({ summary: "获取知识条目列表" })
  @ApiResponse({ status: 200, description: "知识条目列表" })
  async getKnowledgeItems(@Query() query: KnowledgeQueryDto) {
    return this.feedbackKnowledgeService.getKnowledgeItems(query);
  }

  @Get("knowledge/:id")
  @ApiOperation({ summary: "获取知识条目详情" })
  @ApiResponse({ status: 200, description: "知识条目详情" })
  async getKnowledgeItem(@Param("id") id: string) {
    return this.feedbackKnowledgeService.getKnowledgeItem(id);
  }

  @Patch("knowledge/:id")
  @ApiOperation({ summary: "更新知识条目" })
  @ApiResponse({ status: 200, description: "知识条目更新成功" })
  async updateKnowledge(
    @Param("id") id: string,
    @Body() dto: UpdateFeedbackKnowledgeDto,
  ) {
    return this.feedbackKnowledgeService.updateKnowledgeItem(id, dto);
  }

  @Post("knowledge/:id/apply")
  @ApiOperation({ summary: "应用改进措施" })
  @ApiResponse({ status: 200, description: "改进应用成功" })
  async applyImprovement(@Param("id") id: string) {
    return this.feedbackKnowledgeService.applyImprovement(id);
  }

  @Post("knowledge/:id/evaluate")
  @ApiOperation({ summary: "评估改进效果" })
  @ApiResponse({ status: 200, description: "效果评估成功" })
  async evaluateEffect(
    @Param("id") id: string,
    @Body() dto: EvaluateEffectDto,
  ) {
    return this.feedbackKnowledgeService.evaluateEffect(id, dto);
  }

  @Post("knowledge/:id/sync-kb")
  @ApiOperation({ summary: "同步到知识库" })
  @ApiResponse({ status: 200, description: "同步成功" })
  async syncToKnowledgeBase(
    @Param("id") id: string,
    @Body("kbId") kbId: string,
  ) {
    return this.feedbackKnowledgeService.syncToKnowledgeBase(id, kbId);
  }
}
