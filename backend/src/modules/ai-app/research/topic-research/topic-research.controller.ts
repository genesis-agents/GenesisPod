import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
  UnauthorizedException,
  NotFoundException,
  ForbiddenException,
  Sse,
  MessageEvent,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
} from "@nestjs/swagger";
import { Observable } from "rxjs";
import { TopicResearchService } from "./topic-research.service";
import {
  CreateTopicDto,
  UpdateTopicDto,
  ListTopicsDto,
  TriggerRefreshDto,
  CancelRefreshDto,
  RefreshDimensionDto,
  AddDimensionDto,
  UpdateDimensionDto,
  ReorderDimensionsDto,
  ListReportsDto,
  ExportReportDto,
  CompareReportsDto,
  ListEvidenceDto,
  GetTemplatesDto,
  CreateFromTemplateDto,
  UpdateScheduleDto,
  ListLogsDto,
  LeaderPlanDto,
  LeaderMessageDto,
  MissionRetryDto,
  UpdateReportContentDto,
  AIEditReportDto,
  RollbackReportDto,
  MissionAdjustDto,
  AssignReviewTaskDto,
  CompleteReviewTaskDto,
  GetTodosQueryDto,
  CancelTodoDto,
  PrioritizeTodoDto,
  UpdateTodoProgressDto,
  CreateUserRequestTodoDto,
} from "./dto";
import {
  AddCollaboratorDto,
  UpdateCollaboratorRoleDto,
  UpdateTopicVisibilityDto,
  CollaboratorRole,
} from "./dto/collaborator.dto";
import { JwtAuthGuard } from "../../../../common/guards/jwt-auth.guard";
import { Public } from "../../../../common/decorators/public.decorator";
import { ResearchMissionService } from "./services/research-mission.service";
import { ResearchLeaderService } from "./services/research-leader.service";
import { TopicCollaboratorService } from "./services/topic-collaborator.service";
import { ResearchEventEmitterService } from "./services/research-event-emitter.service";
import { ReviewWorkflowService } from "./services/review-workflow.service";
import { ResearchTodoService } from "./services/research-todo.service";

@ApiTags("Topic Research")
@ApiBearerAuth("access-token")
@Controller("topic-research")
@UseGuards(JwtAuthGuard)
export class TopicResearchController {
  constructor(
    private readonly topicResearchService: TopicResearchService,
    private readonly missionService: ResearchMissionService,
    private readonly leaderService: ResearchLeaderService,
    private readonly collaboratorService: TopicCollaboratorService,
    private readonly eventEmitterService: ResearchEventEmitterService,
    private readonly reviewWorkflowService: ReviewWorkflowService,
    private readonly todoService: ResearchTodoService,
  ) {}

  // ==================== Public Endpoints ====================

  /**
   * 获取公开专题（无需认证）
   */
  @Public()
  @Get("shared/topics/:id")
  @ApiOperation({
    summary: "获取公开专题",
    description: "获取设置为公开可见的研究专题详情（无需登录）",
  })
  @ApiParam({ name: "id", description: "专题ID" })
  @ApiResponse({ status: 200, description: "返回专题详情" })
  @ApiResponse({ status: 404, description: "专题不存在或不公开" })
  async getSharedTopic(@Param("id") id: string) {
    return this.topicResearchService.getSharedTopic(id);
  }

  /**
   * 获取公开专题的最新报告（无需认证）
   */
  @Public()
  @Get("shared/topics/:id/reports/latest")
  @ApiOperation({
    summary: "获取公开专题最新报告",
    description: "获取设置为公开可见的研究专题的最新报告（无需登录）",
  })
  @ApiParam({ name: "id", description: "专题ID" })
  @ApiResponse({ status: 200, description: "返回最新报告" })
  @ApiResponse({ status: 404, description: "专题不存在或不公开" })
  async getSharedTopicLatestReport(@Param("id") id: string) {
    return this.topicResearchService.getSharedTopicLatestReport(id);
  }

  // ==================== Topics CRUD ====================

  /**
   * 创建专题
   */
  @Post("topics")
  @ApiOperation({
    summary: "创建专题",
    description: "创建一个新的研究专题",
  })
  @ApiResponse({ status: 201, description: "专题创建成功" })
  @ApiResponse({ status: 401, description: "未认证" })
  async createTopic(@Request() req: any, @Body() dto: CreateTopicDto) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    // TODO: Implement createTopic
    return this.topicResearchService.createTopic(userId, dto);
  }

  /**
   * 获取专题列表
   */
  @Get("topics")
  @ApiOperation({
    summary: "获取专题列表",
    description: "获取当前用户的所有研究专题",
  })
  @ApiQuery({ name: "type", required: false, description: "专题类型" })
  @ApiQuery({ name: "status", required: false, description: "专题状态" })
  @ApiQuery({ name: "search", required: false, description: "搜索关键词" })
  @ApiQuery({ name: "skip", required: false, description: "跳过数量" })
  @ApiQuery({ name: "take", required: false, description: "返回数量" })
  @ApiResponse({ status: 200, description: "返回专题列表" })
  async listTopics(@Request() req: any, @Query() query: ListTopicsDto) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    // TODO: Implement listTopics
    return this.topicResearchService.listTopics(userId, query);
  }

  /**
   * 获取专题详情
   */
  @Get("topics/:id")
  @ApiOperation({ summary: "获取专题详情" })
  @ApiParam({ name: "id", description: "专题ID" })
  @ApiResponse({ status: 200, description: "返回专题详情" })
  @ApiResponse({ status: 404, description: "专题不存在" })
  async getTopic(@Request() req: any, @Param("id") id: string) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    // TODO: Implement getTopic
    return this.topicResearchService.getTopic(userId, id);
  }

  /**
   * 更新专题
   */
  @Patch("topics/:id")
  @ApiOperation({ summary: "更新专题" })
  @ApiParam({ name: "id", description: "专题ID" })
  @ApiResponse({ status: 200, description: "更新成功" })
  @ApiResponse({ status: 404, description: "专题不存在" })
  async updateTopic(
    @Request() req: any,
    @Param("id") id: string,
    @Body() dto: UpdateTopicDto,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    // TODO: Implement updateTopic
    return this.topicResearchService.updateTopic(userId, id, dto);
  }

  /**
   * 删除专题
   */
  @Delete("topics/:id")
  @ApiOperation({ summary: "删除专题" })
  @ApiParam({ name: "id", description: "专题ID" })
  @ApiResponse({ status: 200, description: "删除成功" })
  @ApiResponse({ status: 404, description: "专题不存在" })
  async deleteTopic(@Request() req: any, @Param("id") id: string) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    // TODO: Implement deleteTopic
    return this.topicResearchService.deleteTopic(userId, id);
  }

  // ==================== Refresh Operations ====================

  /**
   * 触发刷新
   */
  @Post("topics/:id/refresh")
  @ApiOperation({
    summary: "触发刷新",
    description: "手动触发专题刷新（全量或增量）",
  })
  @ApiParam({ name: "id", description: "专题ID" })
  @ApiResponse({ status: 202, description: "刷新任务已创建" })
  async triggerRefresh(
    @Request() req: any,
    @Param("id") id: string,
    @Body() dto: TriggerRefreshDto,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    // TODO: Implement triggerRefresh
    return this.topicResearchService.triggerRefresh(userId, id, dto);
  }

  /**
   * 获取研究策略建议
   */
  @Get("topics/:id/research/strategy")
  @ApiOperation({
    summary: "获取研究策略建议",
    description: "智能分析主题状态，推荐最佳研究策略（全新/增量/全量刷新）",
  })
  @ApiParam({ name: "id", description: "专题ID" })
  @ApiResponse({ status: 200, description: "返回研究策略建议" })
  async getResearchStrategy(@Request() req: any, @Param("id") id: string) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    return this.topicResearchService.getResearchStrategy(userId, id);
  }

  /**
   * 快速检查研究状态（用于前端按钮）
   */
  @Get("topics/:id/research/quick-check")
  @ApiOperation({
    summary: "快速检查研究状态",
    description: "返回研究状态摘要，用于前端按钮显示",
  })
  @ApiParam({ name: "id", description: "专题ID" })
  @ApiResponse({ status: 200, description: "返回研究状态摘要" })
  async quickCheckResearchStatus(@Request() req: any, @Param("id") id: string) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    return this.topicResearchService.quickCheckResearchStatus(userId, id);
  }

  /**
   * 智能开始研究
   */
  @Post("topics/:id/research/smart-start")
  @HttpCode(202)
  @ApiOperation({
    summary: "智能开始研究",
    description:
      "根据主题状态自动决定研究策略：从未研究→全新研究，有部分过期→增量更新，全部过期→全量刷新",
  })
  @ApiParam({ name: "id", description: "专题ID" })
  @ApiResponse({ status: 202, description: "研究任务已创建" })
  async smartStartResearch(@Request() req: any, @Param("id") id: string) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    return this.topicResearchService.smartStartResearch(userId, id);
  }

  /**
   * 获取按维度分组的 Agent 活动记录
   */
  @Get("topics/:id/agent-activities/by-dimension")
  @ApiOperation({
    summary: "获取按维度分组的 Agent 活动记录",
    description: "返回按维度分组的 Agent 思考过程和活动记录（增强版）",
  })
  @ApiParam({ name: "id", description: "专题ID" })
  @ApiQuery({ name: "missionId", required: false, description: "任务ID" })
  @ApiResponse({ status: 200, description: "返回按维度分组的 Agent 活动记录" })
  async getAgentActivitiesByDimension(
    @Request() req: any,
    @Param("id") id: string,
    @Query("missionId") missionId?: string,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    return this.topicResearchService.getAgentActivities(userId, id, missionId);
  }

  /**
   * 获取 Agent 活动统计
   */
  @Get("topics/:id/agent-activities/stats")
  @ApiOperation({
    summary: "获取 Agent 活动统计",
    description: "返回 Agent 活动的统计数据",
  })
  @ApiParam({ name: "id", description: "专题ID" })
  @ApiQuery({ name: "missionId", required: false, description: "任务ID" })
  @ApiResponse({ status: 200, description: "返回活动统计" })
  async getAgentActivityStats(
    @Request() req: any,
    @Param("id") id: string,
    @Query("missionId") missionId?: string,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    return this.topicResearchService.getAgentActivityStats(
      userId,
      id,
      missionId,
    );
  }

  /**
   * 获取刷新状态
   */
  @Get("topics/:id/refresh/status")
  @ApiOperation({ summary: "获取当前刷新状态" })
  @ApiParam({ name: "id", description: "专题ID" })
  @ApiResponse({ status: 200, description: "返回刷新状态" })
  async getRefreshStatus(@Request() req: any, @Param("id") id: string) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    // TODO: Implement getRefreshStatus
    return this.topicResearchService.getRefreshStatus(userId, id);
  }

  /**
   * 监听刷新进度 (SSE)
   */
  @Sse("topics/:id/refresh/progress")
  @ApiOperation({
    summary: "监听刷新进度",
    description: "Server-Sent Events 实时推送刷新进度",
  })
  @ApiParam({ name: "id", description: "专题ID" })
  streamRefreshProgress(
    @Request() req: any,
    @Param("id") id: string,
  ): Observable<MessageEvent> {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    // TODO: Implement streamRefreshProgress
    return this.topicResearchService.streamRefreshProgress(userId, id);
  }

  /**
   * 取消刷新
   */
  @Post("topics/:id/refresh/cancel")
  @ApiOperation({ summary: "取消正在进行的刷新" })
  @ApiParam({ name: "id", description: "专题ID" })
  @ApiResponse({ status: 200, description: "取消成功" })
  async cancelRefresh(
    @Request() req: any,
    @Param("id") id: string,
    @Body() dto: CancelRefreshDto,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    // TODO: Implement cancelRefresh
    return this.topicResearchService.cancelRefresh(userId, id, dto);
  }

  // ==================== Dimensions ====================

  /**
   * 获取维度列表
   */
  @Get("topics/:id/dimensions")
  @ApiOperation({ summary: "获取专题的所有维度" })
  @ApiParam({ name: "id", description: "专题ID" })
  @ApiResponse({ status: 200, description: "返回维度列表" })
  async listDimensions(@Request() req: any, @Param("id") id: string) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    // TODO: Implement listDimensions
    return this.topicResearchService.listDimensions(userId, id);
  }

  /**
   * 添加维度
   */
  @Post("topics/:id/dimensions")
  @ApiOperation({ summary: "添加新维度" })
  @ApiParam({ name: "id", description: "专题ID" })
  @ApiResponse({ status: 201, description: "维度创建成功" })
  async addDimension(
    @Request() req: any,
    @Param("id") id: string,
    @Body() dto: AddDimensionDto,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    // TODO: Implement addDimension
    return this.topicResearchService.addDimension(userId, id, dto);
  }

  /**
   * 更新维度
   */
  @Patch("topics/:topicId/dimensions/:dimensionId")
  @ApiOperation({ summary: "更新维度配置" })
  @ApiParam({ name: "topicId", description: "专题ID" })
  @ApiParam({ name: "dimensionId", description: "维度ID" })
  @ApiResponse({ status: 200, description: "更新成功" })
  async updateDimension(
    @Request() req: any,
    @Param("topicId") topicId: string,
    @Param("dimensionId") dimensionId: string,
    @Body() dto: UpdateDimensionDto,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    // TODO: Implement updateDimension
    return this.topicResearchService.updateDimension(
      userId,
      topicId,
      dimensionId,
      dto,
    );
  }

  /**
   * 删除维度
   */
  @Delete("topics/:topicId/dimensions/:dimensionId")
  @ApiOperation({ summary: "删除维度" })
  @ApiParam({ name: "topicId", description: "专题ID" })
  @ApiParam({ name: "dimensionId", description: "维度ID" })
  @ApiResponse({ status: 200, description: "删除成功" })
  async deleteDimension(
    @Request() req: any,
    @Param("topicId") topicId: string,
    @Param("dimensionId") dimensionId: string,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    // TODO: Implement deleteDimension
    return this.topicResearchService.deleteDimension(
      userId,
      topicId,
      dimensionId,
    );
  }

  /**
   * 刷新单个维度
   */
  @Post("topics/:topicId/dimensions/:dimensionId/refresh")
  @ApiOperation({ summary: "刷新单个维度" })
  @ApiParam({ name: "topicId", description: "专题ID" })
  @ApiParam({ name: "dimensionId", description: "维度ID" })
  @ApiResponse({ status: 202, description: "刷新任务已创建" })
  async refreshDimension(
    @Request() req: any,
    @Param("topicId") topicId: string,
    @Param("dimensionId") dimensionId: string,
    @Body() dto: RefreshDimensionDto,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    // TODO: Implement refreshDimension
    return this.topicResearchService.refreshDimension(
      userId,
      topicId,
      dimensionId,
      dto,
    );
  }

  /**
   * 调整维度顺序
   */
  @Post("topics/:id/dimensions/reorder")
  @ApiOperation({ summary: "调整维度顺序" })
  @ApiParam({ name: "id", description: "专题ID" })
  @ApiResponse({ status: 200, description: "顺序调整成功" })
  async reorderDimensions(
    @Request() req: any,
    @Param("id") id: string,
    @Body() dto: ReorderDimensionsDto,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    // TODO: Implement reorderDimensions
    return this.topicResearchService.reorderDimensions(userId, id, dto);
  }

  // ==================== Reports ====================

  /**
   * 获取报告列表
   */
  @Get("topics/:id/reports")
  @ApiOperation({
    summary: "获取报告列表",
    description: "获取专题的历史报告（按版本倒序）",
  })
  @ApiParam({ name: "id", description: "专题ID" })
  @ApiQuery({ name: "limit", required: false, description: "返回数量" })
  @ApiQuery({ name: "cursor", required: false, description: "游标" })
  @ApiResponse({ status: 200, description: "返回报告列表" })
  async listReports(
    @Request() req: any,
    @Param("id") id: string,
    @Query() query: ListReportsDto,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    // TODO: Implement listReports
    return this.topicResearchService.listReports(userId, id, query);
  }

  /**
   * 获取最新报告
   */
  @Get("topics/:id/reports/latest")
  @ApiOperation({ summary: "获取最新报告" })
  @ApiParam({ name: "id", description: "专题ID" })
  @ApiResponse({ status: 200, description: "返回最新报告" })
  @ApiResponse({ status: 404, description: "报告不存在" })
  async getLatestReport(@Request() req: any, @Param("id") id: string) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    // TODO: Implement getLatestReport
    return this.topicResearchService.getLatestReport(userId, id);
  }

  /**
   * 获取指定版本报告
   */
  @Get("topics/:topicId/reports/:reportId")
  @ApiOperation({ summary: "获取指定版本报告" })
  @ApiParam({ name: "topicId", description: "专题ID" })
  @ApiParam({ name: "reportId", description: "报告ID" })
  @ApiResponse({ status: 200, description: "返回报告详情" })
  async getReport(
    @Request() req: any,
    @Param("topicId") topicId: string,
    @Param("reportId") reportId: string,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    // TODO: Implement getReport
    return this.topicResearchService.getReport(userId, topicId, reportId);
  }

  /**
   * 删除报告
   */
  @Delete("topics/:topicId/reports/:reportId")
  @ApiOperation({
    summary: "删除报告",
    description: "删除指定报告及其所有关联数据（维度分析、修订历史、批注等）",
  })
  @ApiParam({ name: "topicId", description: "专题ID" })
  @ApiParam({ name: "reportId", description: "报告ID" })
  @ApiResponse({ status: 200, description: "删除成功" })
  @ApiResponse({ status: 404, description: "报告不存在" })
  async deleteReport(
    @Request() req: any,
    @Param("topicId") topicId: string,
    @Param("reportId") reportId: string,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    return this.topicResearchService.deleteReport(userId, topicId, reportId);
  }

  /**
   * 导出报告
   */
  @Post("topics/:topicId/reports/:reportId/export")
  @ApiOperation({ summary: "导出报告为 PDF 或 DOCX" })
  @ApiParam({ name: "topicId", description: "专题ID" })
  @ApiParam({ name: "reportId", description: "报告ID" })
  @ApiResponse({ status: 200, description: "返回下载链接" })
  async exportReport(
    @Request() req: any,
    @Param("topicId") topicId: string,
    @Param("reportId") reportId: string,
    @Body() dto: ExportReportDto,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    // TODO: Implement exportReport
    return this.topicResearchService.exportReport(
      userId,
      topicId,
      reportId,
      dto,
    );
  }

  /**
   * 比较报告版本
   */
  @Post("topics/:id/reports/compare")
  @ApiOperation({ summary: "比较两个版本的报告差异" })
  @ApiParam({ name: "id", description: "专题ID" })
  @ApiResponse({ status: 200, description: "返回差异对比" })
  async compareReports(
    @Request() req: any,
    @Param("id") id: string,
    @Body() dto: CompareReportsDto,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    // TODO: Implement compareReports
    return this.topicResearchService.compareReports(userId, id, dto);
  }

  /**
   * 更新报告内容
   */
  @Patch("topics/:topicId/reports/:reportId")
  @ApiOperation({
    summary: "更新报告内容",
    description: "手动编辑报告内容，自动创建修订历史",
  })
  @ApiParam({ name: "topicId", description: "专题ID" })
  @ApiParam({ name: "reportId", description: "报告ID" })
  @ApiResponse({ status: 200, description: "更新成功" })
  @ApiResponse({ status: 404, description: "报告不存在" })
  async updateReportContent(
    @Request() req: any,
    @Param("topicId") topicId: string,
    @Param("reportId") reportId: string,
    @Body() dto: UpdateReportContentDto,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    return this.topicResearchService.updateReportContent(
      userId,
      topicId,
      reportId,
      dto,
    );
  }

  /**
   * AI 编辑报告
   */
  @Post("topics/:topicId/reports/:reportId/ai-edit")
  @ApiOperation({
    summary: "AI 编辑报告",
    description: "使用 AI 对报告进行重写、润色、扩写、压缩或风格调整",
  })
  @ApiParam({ name: "topicId", description: "专题ID" })
  @ApiParam({ name: "reportId", description: "报告ID" })
  @ApiResponse({ status: 200, description: "编辑成功" })
  @ApiResponse({ status: 404, description: "报告不存在" })
  async aiEditReport(
    @Request() req: any,
    @Param("topicId") topicId: string,
    @Param("reportId") reportId: string,
    @Body() dto: AIEditReportDto,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    return this.topicResearchService.aiEditReport(
      userId,
      topicId,
      reportId,
      dto,
    );
  }

  /**
   * 获取报告修订历史
   */
  @Get("topics/:topicId/reports/:reportId/revisions")
  @ApiOperation({
    summary: "获取修订历史",
    description: "获取报告的所有修订版本记录",
  })
  @ApiParam({ name: "topicId", description: "专题ID" })
  @ApiParam({ name: "reportId", description: "报告ID" })
  @ApiResponse({ status: 200, description: "返回修订历史列表" })
  @ApiResponse({ status: 404, description: "报告不存在" })
  async getReportRevisions(
    @Request() req: any,
    @Param("topicId") topicId: string,
    @Param("reportId") reportId: string,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    return this.topicResearchService.getReportRevisions(
      userId,
      topicId,
      reportId,
    );
  }

  /**
   * 回滚报告版本
   */
  @Post("topics/:topicId/reports/:reportId/rollback")
  @ApiOperation({
    summary: "回滚报告版本",
    description: "将报告回滚到指定的历史版本",
  })
  @ApiParam({ name: "topicId", description: "专题ID" })
  @ApiParam({ name: "reportId", description: "报告ID" })
  @ApiResponse({ status: 200, description: "回滚成功" })
  @ApiResponse({ status: 404, description: "报告或修订版本不存在" })
  async rollbackReport(
    @Request() req: any,
    @Param("topicId") topicId: string,
    @Param("reportId") reportId: string,
    @Body() dto: RollbackReportDto,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    return this.topicResearchService.rollbackReport(
      userId,
      topicId,
      reportId,
      dto.revisionNumber,
    );
  }

  // ==================== Report Editing ====================

  /**
   * 获取报告变更列表
   */
  @Get("topics/:topicId/reports/:reportId/changes")
  @ApiOperation({
    summary: "获取报告变更列表",
    description: "获取报告的所有增量更新变更记录",
  })
  @ApiParam({ name: "topicId", description: "专题ID" })
  @ApiParam({ name: "reportId", description: "报告ID" })
  @ApiResponse({ status: 200, description: "返回变更列表" })
  async getReportChanges(
    @Request() req: any,
    @Param("topicId") topicId: string,
    @Param("reportId") reportId: string,
  ) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException("User not authenticated");
    return this.topicResearchService.getReportChanges(
      userId,
      topicId,
      reportId,
    );
  }

  /**
   * Checkin 单条变更
   */
  @Post("topics/:topicId/reports/:reportId/changes/:changeId/checkin")
  @ApiOperation({
    summary: "Checkin 单条变更",
    description: "将单条变更标记为已确认",
  })
  @ApiParam({ name: "topicId", description: "专题ID" })
  @ApiParam({ name: "reportId", description: "报告ID" })
  @ApiParam({ name: "changeId", description: "变更ID" })
  @ApiResponse({ status: 200, description: "Checkin 成功" })
  async checkinChange(
    @Request() req: any,
    @Param("topicId") topicId: string,
    @Param("reportId") reportId: string,
    @Param("changeId") changeId: string,
  ) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException("User not authenticated");
    return this.topicResearchService.checkinChange(
      userId,
      topicId,
      reportId,
      changeId,
    );
  }

  /**
   * 批量 Checkin 变更
   */
  @Post("topics/:topicId/reports/:reportId/changes/checkin")
  @ApiOperation({
    summary: "批量 Checkin 变更",
    description: "批量确认报告变更",
  })
  @ApiParam({ name: "topicId", description: "专题ID" })
  @ApiParam({ name: "reportId", description: "报告ID" })
  @ApiResponse({ status: 200, description: "Checkin 成功" })
  async checkinAllChanges(
    @Request() req: any,
    @Param("topicId") topicId: string,
    @Param("reportId") reportId: string,
    @Body() dto: { changeIds?: string[] },
  ) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException("User not authenticated");
    return this.topicResearchService.checkinAllChanges(
      userId,
      topicId,
      reportId,
      dto.changeIds,
    );
  }

  /**
   * 获取报告批注列表
   */
  @Get("topics/:topicId/reports/:reportId/annotations")
  @ApiOperation({
    summary: "获取报告批注",
    description: "获取报告的所有批注",
  })
  @ApiParam({ name: "topicId", description: "专题ID" })
  @ApiParam({ name: "reportId", description: "报告ID" })
  @ApiQuery({
    name: "status",
    required: false,
    description: "批注状态 (OPEN, RESOLVED, DISMISSED)",
  })
  @ApiResponse({ status: 200, description: "返回批注列表" })
  async getReportAnnotations(
    @Request() req: any,
    @Param("topicId") topicId: string,
    @Param("reportId") reportId: string,
    @Query("status") status?: string,
  ) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException("User not authenticated");
    return this.topicResearchService.getReportAnnotations(
      userId,
      topicId,
      reportId,
      status,
    );
  }

  /**
   * 创建批注
   */
  @Post("topics/:topicId/reports/:reportId/annotations")
  @ApiOperation({
    summary: "创建批注",
    description: "在报告中添加新批注",
  })
  @ApiParam({ name: "topicId", description: "专题ID" })
  @ApiParam({ name: "reportId", description: "报告ID" })
  @ApiResponse({ status: 201, description: "批注创建成功" })
  async createAnnotation(
    @Request() req: any,
    @Param("topicId") topicId: string,
    @Param("reportId") reportId: string,
    @Body() dto: any,
  ) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException("User not authenticated");
    return this.topicResearchService.createAnnotation(
      userId,
      topicId,
      reportId,
      dto,
    );
  }

  /**
   * 更新批注
   */
  @Patch("topics/:topicId/reports/:reportId/annotations/:annotationId")
  @ApiOperation({
    summary: "更新批注",
    description: "修改批注内容或状态",
  })
  @ApiParam({ name: "topicId", description: "专题ID" })
  @ApiParam({ name: "reportId", description: "报告ID" })
  @ApiParam({ name: "annotationId", description: "批注ID" })
  @ApiResponse({ status: 200, description: "更新成功" })
  async updateAnnotation(
    @Request() req: any,
    @Param("topicId") topicId: string,
    @Param("reportId") reportId: string,
    @Param("annotationId") annotationId: string,
    @Body() dto: any,
  ) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException("User not authenticated");
    return this.topicResearchService.updateAnnotation(
      userId,
      topicId,
      reportId,
      annotationId,
      dto,
    );
  }

  /**
   * 删除批注
   */
  @Delete("topics/:topicId/reports/:reportId/annotations/:annotationId")
  @ApiOperation({
    summary: "删除批注",
    description: "从报告中删除批注",
  })
  @ApiParam({ name: "topicId", description: "专题ID" })
  @ApiParam({ name: "reportId", description: "报告ID" })
  @ApiParam({ name: "annotationId", description: "批注ID" })
  @ApiResponse({ status: 200, description: "删除成功" })
  async deleteAnnotation(
    @Request() req: any,
    @Param("topicId") topicId: string,
    @Param("reportId") reportId: string,
    @Param("annotationId") annotationId: string,
  ) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException("User not authenticated");
    return this.topicResearchService.deleteAnnotation(
      userId,
      topicId,
      reportId,
      annotationId,
    );
  }

  /**
   * 解决批注
   */
  @Post("topics/:topicId/reports/:reportId/annotations/:annotationId/resolve")
  @ApiOperation({
    summary: "解决批注",
    description: "将批注标记为已解决",
  })
  @ApiParam({ name: "topicId", description: "专题ID" })
  @ApiParam({ name: "reportId", description: "报告ID" })
  @ApiParam({ name: "annotationId", description: "批注ID" })
  @ApiResponse({ status: 200, description: "解决成功" })
  async resolveAnnotation(
    @Request() req: any,
    @Param("topicId") topicId: string,
    @Param("reportId") reportId: string,
    @Param("annotationId") annotationId: string,
  ) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException("User not authenticated");
    return this.topicResearchService.resolveAnnotation(
      userId,
      topicId,
      reportId,
      annotationId,
    );
  }

  /**
   * 批量解决批注
   */
  @Post("topics/:topicId/reports/:reportId/annotations/resolve-all")
  @ApiOperation({
    summary: "批量解决批注",
    description: "批量将批注标记为已解决",
  })
  @ApiParam({ name: "topicId", description: "专题ID" })
  @ApiParam({ name: "reportId", description: "报告ID" })
  @ApiResponse({ status: 200, description: "批量解决成功" })
  async resolveAllAnnotations(
    @Request() req: any,
    @Param("topicId") topicId: string,
    @Param("reportId") reportId: string,
    @Body() dto: { annotationIds?: string[] },
  ) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException("User not authenticated");
    return this.topicResearchService.resolveAllAnnotations(
      userId,
      topicId,
      reportId,
      dto.annotationIds,
    );
  }

  // ==================== Evidence ====================

  /**
   * 获取证据列表
   */
  @Get("topics/:topicId/reports/:reportId/evidence")
  @ApiOperation({ summary: "获取报告的引用证据" })
  @ApiParam({ name: "topicId", description: "专题ID" })
  @ApiParam({ name: "reportId", description: "报告ID" })
  @ApiQuery({ name: "dimensionId", required: false, description: "维度ID" })
  @ApiQuery({ name: "sourceType", required: false, description: "来源类型" })
  @ApiQuery({
    name: "minCredibility",
    required: false,
    description: "最低可信度",
  })
  @ApiQuery({ name: "sortBy", required: false, description: "排序方式" })
  @ApiQuery({ name: "pageSize", required: false, description: "每页数量" })
  @ApiQuery({ name: "page", required: false, description: "页码" })
  @ApiResponse({ status: 200, description: "返回证据列表" })
  async listEvidence(
    @Request() req: any,
    @Param("topicId") topicId: string,
    @Param("reportId") reportId: string,
    @Query() query: ListEvidenceDto,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    // TODO: Implement listEvidence
    return this.topicResearchService.listEvidence(
      userId,
      topicId,
      reportId,
      query,
    );
  }

  /**
   * 获取证据详情
   */
  @Get("topics/:topicId/reports/:reportId/evidence/:evidenceId")
  @ApiOperation({ summary: "获取证据详情" })
  @ApiParam({ name: "topicId", description: "专题ID" })
  @ApiParam({ name: "reportId", description: "报告ID" })
  @ApiParam({ name: "evidenceId", description: "证据ID" })
  @ApiResponse({ status: 200, description: "返回证据详情" })
  async getEvidence(
    @Request() req: any,
    @Param("topicId") topicId: string,
    @Param("reportId") reportId: string,
    @Param("evidenceId") evidenceId: string,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    // TODO: Implement getEvidence
    return this.topicResearchService.getEvidence(
      userId,
      topicId,
      reportId,
      evidenceId,
    );
  }

  // ==================== Templates ====================

  /**
   * 获取模板列表
   */
  @Get("templates")
  @ApiOperation({ summary: "获取专题模板列表" })
  @ApiQuery({ name: "type", required: true, description: "专题类型" })
  @ApiResponse({ status: 200, description: "返回模板列表" })
  async getTemplates(@Request() req: any, @Query() query: GetTemplatesDto) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    // TODO: Implement getTemplates
    return this.topicResearchService.getTemplates(query);
  }

  /**
   * 从模板创建专题
   */
  @Post("topics/from-template")
  @ApiOperation({ summary: "从模板创建专题" })
  @ApiResponse({ status: 201, description: "专题创建成功" })
  async createFromTemplate(
    @Request() req: any,
    @Body() dto: CreateFromTemplateDto,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    // TODO: Implement createFromTemplate
    return this.topicResearchService.createFromTemplate(userId, dto);
  }

  // ==================== Schedule ====================

  /**
   * 获取刷新计划
   */
  @Get("topics/:id/schedule")
  @ApiOperation({ summary: "获取专题的刷新计划" })
  @ApiParam({ name: "id", description: "专题ID" })
  @ApiResponse({ status: 200, description: "返回刷新计划" })
  async getSchedule(@Request() req: any, @Param("id") id: string) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    // TODO: Implement getSchedule
    return this.topicResearchService.getSchedule(userId, id);
  }

  /**
   * 更新刷新计划
   */
  @Patch("topics/:id/schedule")
  @ApiOperation({ summary: "更新刷新计划" })
  @ApiParam({ name: "id", description: "专题ID" })
  @ApiResponse({ status: 200, description: "更新成功" })
  async updateSchedule(
    @Request() req: any,
    @Param("id") id: string,
    @Body() dto: UpdateScheduleDto,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    // TODO: Implement updateSchedule
    return this.topicResearchService.updateSchedule(userId, id, dto);
  }

  // ==================== Logs ====================

  /**
   * 获取刷新日志
   */
  @Get("topics/:id/logs")
  @ApiOperation({ summary: "获取专题的刷新日志" })
  @ApiParam({ name: "id", description: "专题ID" })
  @ApiQuery({ name: "limit", required: false, description: "返回数量" })
  @ApiQuery({ name: "status", required: false, description: "日志状态" })
  @ApiResponse({ status: 200, description: "返回日志列表" })
  async getLogs(
    @Request() req: any,
    @Param("id") id: string,
    @Query() query: ListLogsDto,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    // TODO: Implement getLogs
    return this.topicResearchService.getLogs(userId, id, query);
  }

  // ==================== Stats ====================

  /**
   * 获取专题统计
   */
  @Get("topics/:id/stats")
  @ApiOperation({ summary: "获取专题统计数据" })
  @ApiParam({ name: "id", description: "专题ID" })
  @ApiResponse({ status: 200, description: "返回统计数据" })
  async getStats(@Request() req: any, @Param("id") id: string) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    // TODO: Implement getStats
    return this.topicResearchService.getStats(userId, id);
  }

  // ==================== Leader API ====================

  /**
   * Leader 生成研究规划
   */
  @Post("topics/:id/leader/plan")
  @ApiOperation({
    summary: "Leader 生成研究规划",
    description: "调用 Leader（推理模型）规划研究维度和执行策略",
  })
  @ApiParam({ name: "id", description: "专题ID" })
  @ApiResponse({ status: 201, description: "规划成功" })
  async leaderPlan(
    @Request() req: any,
    @Param("id") id: string,
    @Body() dto: LeaderPlanDto,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    // ★ 权限检查：只有创建者或 EDITOR/ADMIN 角色才能启动研究
    const hasPermission = await this.collaboratorService.hasAccess(
      id,
      userId,
      CollaboratorRole.EDITOR,
    );
    if (!hasPermission) {
      throw new ForbiddenException("无权启动研究任务，需要编辑权限");
    }
    return this.missionService.createMission({
      topicId: id,
      userPrompt: dto.userPrompt,
      userContext: dto.userContext,
    });
  }

  /**
   * 处理 @Leader 用户消息
   */
  @Post("topics/:id/leader/message")
  @ApiOperation({
    summary: "处理 @Leader 消息",
    description: "用户通过 @Leader 向 Leader 发送指令或补充提示",
  })
  @ApiParam({ name: "id", description: "专题ID" })
  @ApiResponse({ status: 200, description: "消息处理成功" })
  async leaderMessage(
    @Request() req: any,
    @Param("id") id: string,
    @Body() dto: LeaderMessageDto,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    // 获取当前 Mission
    const mission = await this.missionService.getMissionByTopicId(id);
    if (!mission) {
      throw new Error("No active mission for this topic");
    }
    return this.leaderService.handleUserMessage(id, mission.id, dto.content);
  }

  /**
   * ★ Leader 解码用户输入（Claude Code CLI 风格）
   * 先理解用户意图，再决定如何响应
   */
  @Post("topics/:id/leader/chat")
  @ApiOperation({
    summary: "Leader 解码用户输入",
    description:
      "类似 Claude Code CLI：Leader 理解用户意图后决定是直接回答、创建TODO、还是请求澄清",
  })
  @ApiParam({ name: "id", description: "专题ID" })
  @ApiResponse({
    status: 200,
    description: "返回 Leader 解码结果",
    schema: {
      type: "object",
      properties: {
        decisionType: {
          type: "string",
          enum: ["DIRECT_ANSWER", "CREATE_TODO", "CLARIFY", "ACKNOWLEDGE"],
        },
        understanding: { type: "string" },
        response: { type: "string" },
        todo: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
          },
        },
        clarifyQuestion: { type: "string" },
        clarifyOptions: { type: "array", items: { type: "string" } },
      },
    },
  })
  async leaderChat(
    @Request() req: any,
    @Param("id") topicId: string,
    @Body() dto: { message: string; missionId?: string },
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }

    // 1. 获取当前 Mission（如果有）
    let missionId = dto.missionId;
    if (!missionId) {
      const mission = await this.missionService.getMissionByTopicId(topicId);
      missionId = mission?.id;
    }

    // 2. Leader 解码用户输入
    const decodeResult = await this.leaderService.decodeUserInput(
      topicId,
      dto.message,
      missionId,
    );

    // 3. 如果决定创建 TODO，则创建并自动执行
    let createdTodo = null;
    if (
      decodeResult.decisionType === "CREATE_TODO" &&
      decodeResult.todoTitle &&
      missionId
    ) {
      try {
        const todo = await this.todoService.createTodo({
          topicId,
          missionId,
          type: "USER_REQUEST",
          title: decodeResult.todoTitle,
          description: decodeResult.todoDescription,
        });
        createdTodo = {
          id: todo.id,
          title: todo.title,
        };

        // ★ 自动执行新创建的 TODO（异步，不阻塞响应）
        this.todoService.executeTodo(topicId, todo.id).catch((error) => {
          console.error(
            `[decodeInput] Auto-execute TODO failed: ${error instanceof Error ? error.message : error}`,
          );
        });
      } catch (error) {
        // 继续返回响应，但标记 TODO 创建失败
        console.error(`Failed to create TODO: ${error}`);
      }
    }

    // 4. 保存用户消息和 Leader 响应到数据库（用于对话历史）
    if (missionId) {
      await this.eventEmitterService.saveUserMessage(
        topicId,
        missionId,
        dto.message,
      );
      await this.eventEmitterService.emitLeaderResponse(
        topicId,
        missionId,
        decodeResult.response,
      );
    }

    // 5. 返回结果
    return {
      decisionType: decodeResult.decisionType,
      understanding: decodeResult.understanding,
      response: decodeResult.response,
      todo: createdTodo,
      clarifyQuestion: decodeResult.clarifyQuestion,
      clarifyOptions: decodeResult.clarifyOptions,
    };
  }

  /**
   * 获取 Leader 决策历史
   */
  @Get("topics/:id/leader/decisions")
  @ApiOperation({
    summary: "获取 Leader 决策历史",
    description: "获取 Leader 在研究过程中的所有决策记录",
  })
  @ApiParam({ name: "id", description: "专题ID" })
  @ApiResponse({ status: 200, description: "返回决策历史" })
  async getLeaderDecisions(@Request() req: any, @Param("id") id: string) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    const mission = await this.missionService.getMissionByTopicId(id);
    if (!mission) {
      return [];
    }
    return this.leaderService.getDecisionHistory(mission.id);
  }

  // ==================== Mission API ====================

  /**
   * 获取当前 Mission 状态
   */
  @Get("topics/:id/mission")
  @ApiOperation({
    summary: "获取 Mission 状态",
    description: "获取专题当前研究任务的状态和进度",
  })
  @ApiParam({ name: "id", description: "专题ID" })
  @ApiResponse({ status: 200, description: "返回 Mission 状态" })
  async getMission(@Request() req: any, @Param("id") id: string) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    return this.missionService.getMissionByTopicId(id);
  }

  /**
   * 重试失败的任务
   */
  @Post("topics/:id/mission/retry")
  @ApiOperation({
    summary: "重试失败任务",
    description: "重试 Mission 中失败的任务",
  })
  @ApiParam({ name: "id", description: "专题ID" })
  @ApiResponse({ status: 200, description: "重试成功" })
  async retryMission(
    @Request() req: any,
    @Param("id") id: string,
    @Body() dto: MissionRetryDto,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    // ★ 权限检查：只有创建者或 EDITOR/ADMIN 角色才能重试任务
    const hasPermission = await this.collaboratorService.hasAccess(
      id,
      userId,
      CollaboratorRole.EDITOR,
    );
    if (!hasPermission) {
      throw new ForbiddenException("无权重试研究任务，需要编辑权限");
    }
    const mission = await this.missionService.getMissionByTopicId(id);
    if (!mission) {
      throw new Error("No mission found for this topic");
    }
    if (dto.taskIds?.length) {
      // 重试指定任务
      const results = await Promise.all(
        dto.taskIds.map((taskId) => this.missionService.retryTask(taskId)),
      );
      return { retriedTasks: results.length };
    }
    // 重试整个 Mission
    return this.missionService.retryMission(mission.id);
  }

  /**
   * 获取当前团队组成
   */
  @Get("topics/:id/team")
  @ApiOperation({
    summary: "获取研究团队",
    description: "获取 Leader 动态创建的 Agent 列表",
  })
  @ApiParam({ name: "id", description: "专题ID" })
  @ApiResponse({ status: 200, description: "返回团队信息" })
  async getTeam(@Request() req: any, @Param("id") id: string) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    const mission = await this.missionService.getMissionByTopicId(id);
    if (!mission) {
      return { leaderId: null, leaderModel: null, agents: [] };
    }
    return this.missionService.getTeamInfo(mission.id);
  }

  /**
   * 获取团队互动消息
   */
  @Get("topics/:id/team-messages")
  @ApiOperation({
    summary: "获取团队互动消息",
    description: "获取专题的团队互动消息历史，包括 Leader 回复、用户消息等",
  })
  @ApiParam({ name: "id", description: "专题ID" })
  @ApiQuery({ name: "limit", required: false, description: "返回数量限制" })
  @ApiQuery({
    name: "missionId",
    required: false,
    description: "按 Mission ID 过滤",
  })
  @ApiResponse({ status: 200, description: "返回团队消息列表" })
  async getTeamMessages(
    @Request() req: any,
    @Param("id") id: string,
    @Query("limit") limit?: string,
    @Query("missionId") missionId?: string,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    return this.eventEmitterService.getTeamMessages(id, {
      limit: limit ? parseInt(limit, 10) : undefined,
      missionId,
    });
  }

  /**
   * 获取 Agent 活动记录
   */
  @Get("topics/:id/agent-activities")
  @ApiOperation({
    summary: "获取 Agent 活动记录",
    description: "获取专题的 Agent 思考和工作记录",
  })
  @ApiParam({ name: "id", description: "专题ID" })
  @ApiQuery({ name: "limit", required: false, description: "返回数量限制" })
  @ApiQuery({
    name: "missionId",
    required: false,
    description: "按 Mission ID 过滤",
  })
  @ApiQuery({
    name: "agentRole",
    required: false,
    description: "按 Agent 角色过滤",
  })
  @ApiResponse({ status: 200, description: "返回 Agent 活动列表" })
  async getAgentActivities(
    @Request() req: any,
    @Param("id") id: string,
    @Query("limit") limit?: string,
    @Query("missionId") missionId?: string,
    @Query("agentRole") agentRole?: string,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    return this.eventEmitterService.getAgentActivities(id, {
      limit: limit ? parseInt(limit, 10) : undefined,
      missionId,
      agentRole,
    });
  }

  /**
   * 调整 Mission 执行策略
   */
  @Post("topics/:id/mission/adjust")
  @ApiOperation({
    summary: "调整 Mission 执行策略",
    description: "添加/移除维度、调整聚焦领域等",
  })
  @ApiParam({ name: "id", description: "专题ID" })
  @ApiResponse({ status: 200, description: "调整成功" })
  async adjustMission(
    @Request() req: any,
    @Param("id") id: string,
    @Body() dto: MissionAdjustDto,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    const mission = await this.missionService.getMissionByTopicId(id);
    if (!mission) {
      throw new Error("No active mission for this topic");
    }
    return this.missionService.adjustMission(userId, mission.id, dto);
  }

  /**
   * 取消 Mission
   */
  @Post("topics/:id/mission/cancel")
  @ApiOperation({
    summary: "取消 Mission",
    description: "取消正在执行的研究任务",
  })
  @ApiParam({ name: "id", description: "专题ID" })
  @ApiResponse({ status: 200, description: "取消成功" })
  async cancelMission(@Request() req: any, @Param("id") id: string) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    // ★ 权限检查：只有创建者或 EDITOR/ADMIN 角色才能取消任务
    const hasPermission = await this.collaboratorService.hasAccess(
      id,
      userId,
      CollaboratorRole.EDITOR,
    );
    if (!hasPermission) {
      throw new ForbiddenException("无权取消研究任务，需要编辑权限");
    }
    const mission = await this.missionService.getMissionByTopicId(id);
    if (!mission) {
      throw new Error("No active mission for this topic");
    }
    return this.missionService.cancelMission(userId, mission.id);
  }

  // ==================== Collaborators ====================

  /**
   * 获取协作者列表
   */
  @Get("topics/:id/collaborators")
  @ApiOperation({
    summary: "获取协作者列表",
    description: "获取专题的所有协作者",
  })
  @ApiParam({ name: "id", description: "专题ID" })
  @ApiResponse({ status: 200, description: "返回协作者列表" })
  async getCollaborators(@Request() req: any, @Param("id") id: string) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    return this.collaboratorService.getCollaborators(id, userId);
  }

  /**
   * 添加协作者
   */
  @Post("topics/:id/collaborators")
  @ApiOperation({
    summary: "添加协作者",
    description: "通过邮箱添加协作者到专题",
  })
  @ApiParam({ name: "id", description: "专题ID" })
  @ApiResponse({ status: 201, description: "协作者添加成功" })
  async addCollaborator(
    @Request() req: any,
    @Param("id") id: string,
    @Body() dto: AddCollaboratorDto,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    return this.collaboratorService.addCollaborator(
      id,
      userId,
      dto.email,
      dto.role,
    );
  }

  /**
   * 更新协作者角色
   */
  @Patch("topics/:topicId/collaborators/:collaboratorId")
  @ApiOperation({
    summary: "更新协作者角色",
    description: "更新协作者的权限角色",
  })
  @ApiParam({ name: "topicId", description: "专题ID" })
  @ApiParam({ name: "collaboratorId", description: "协作者ID" })
  @ApiResponse({ status: 200, description: "更新成功" })
  async updateCollaboratorRole(
    @Request() req: any,
    @Param("topicId") topicId: string,
    @Param("collaboratorId") collaboratorId: string,
    @Body() dto: UpdateCollaboratorRoleDto,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    return this.collaboratorService.updateCollaboratorRole(
      topicId,
      collaboratorId,
      userId,
      dto.role,
    );
  }

  /**
   * 移除协作者
   */
  @Delete("topics/:topicId/collaborators/:collaboratorId")
  @ApiOperation({
    summary: "移除协作者",
    description: "从专题中移除协作者",
  })
  @ApiParam({ name: "topicId", description: "专题ID" })
  @ApiParam({ name: "collaboratorId", description: "协作者ID" })
  @ApiResponse({ status: 200, description: "移除成功" })
  async removeCollaborator(
    @Request() req: any,
    @Param("topicId") topicId: string,
    @Param("collaboratorId") collaboratorId: string,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    await this.collaboratorService.removeCollaborator(
      topicId,
      collaboratorId,
      userId,
    );
    return { success: true };
  }

  /**
   * 离开专题
   */
  @Post("topics/:id/leave")
  @ApiOperation({
    summary: "离开专题",
    description: "协作者主动退出专题",
  })
  @ApiParam({ name: "id", description: "专题ID" })
  @ApiResponse({ status: 200, description: "退出成功" })
  async leaveTopic(@Request() req: any, @Param("id") id: string) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    await this.collaboratorService.leaveProject(id, userId);
    return { success: true };
  }

  /**
   * 更新专题可见性
   */
  @Patch("topics/:id/visibility")
  @ApiOperation({
    summary: "更新专题可见性",
    description: "设置专题为私有、共享或公开",
  })
  @ApiParam({ name: "id", description: "专题ID" })
  @ApiResponse({ status: 200, description: "更新成功" })
  async updateVisibility(
    @Request() req: any,
    @Param("id") id: string,
    @Body() dto: UpdateTopicVisibilityDto,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    return this.topicResearchService.updateVisibility(
      userId,
      id,
      dto.visibility,
    );
  }

  /**
   * 获取专题共享设置
   */
  @Get("topics/:id/sharing")
  @ApiOperation({
    summary: "获取共享设置",
    description: "获取专题的可见性和协作者信息",
  })
  @ApiParam({ name: "id", description: "专题ID" })
  @ApiResponse({ status: 200, description: "返回共享设置" })
  async getSharingSettings(@Request() req: any, @Param("id") id: string) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    return this.topicResearchService.getSharingSettings(userId, id);
  }

  // ==================== Credibility Report (Phase 2.2) ====================

  /**
   * 获取报告可信度评估
   */
  @Get("topics/:topicId/reports/:reportId/credibility")
  @ApiOperation({
    summary: "获取可信度报告",
    description: "获取报告的可信度评估，包括来源分布、时效性、覆盖度等指标",
  })
  @ApiParam({ name: "topicId", description: "专题ID" })
  @ApiParam({ name: "reportId", description: "报告ID" })
  @ApiResponse({ status: 200, description: "返回可信度评估" })
  async getCredibilityReport(
    @Request() req: any,
    @Param("topicId") _topicId: string,
    @Param("reportId") reportId: string,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    return this.topicResearchService.getCredibilityReport(userId, reportId);
  }

  /**
   * 重新生成可信度报告
   */
  @Post("topics/:topicId/reports/:reportId/credibility/regenerate")
  @ApiOperation({
    summary: "重新生成可信度报告",
    description: "强制重新计算报告的可信度评估",
  })
  @ApiParam({ name: "topicId", description: "专题ID" })
  @ApiParam({ name: "reportId", description: "报告ID" })
  @ApiResponse({ status: 200, description: "返回新的可信度评估" })
  async regenerateCredibilityReport(
    @Request() req: any,
    @Param("topicId") _topicId: string,
    @Param("reportId") reportId: string,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    return this.topicResearchService.regenerateCredibilityReport(
      userId,
      reportId,
    );
  }

  /**
   * ★ 重新计算证据可信度评分
   */
  @Post("topics/:topicId/reports/:reportId/evidence/recalculate-credibility")
  @ApiOperation({
    summary: "重新计算证据可信度",
    description: "重新计算报告中所有证据的可信度评分，用于修复历史数据问题",
  })
  @ApiParam({ name: "topicId", description: "专题ID" })
  @ApiParam({ name: "reportId", description: "报告ID" })
  @ApiResponse({ status: 200, description: "返回更新统计" })
  async recalculateEvidenceCredibility(
    @Request() req: any,
    @Param("topicId") _topicId: string,
    @Param("reportId") reportId: string,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    return this.topicResearchService.recalculateEvidenceCredibility(reportId);
  }

  /**
   * ★ 重新计算专题统计数据
   */
  @Post("topics/:topicId/recalculate-stats")
  @ApiOperation({
    summary: "重新计算专题统计数据",
    description:
      "重新计算专题的 totalReports、totalSources 和 lastRefreshAt，用于修复历史数据问题",
  })
  @ApiParam({ name: "topicId", description: "专题ID" })
  @ApiResponse({ status: 200, description: "返回更新后的专题" })
  async recalculateTopicStats(
    @Request() req: any,
    @Param("topicId") topicId: string,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    return this.topicResearchService.recalculateTopicStats(userId, topicId);
  }

  // ==================== Research History (Phase 2.3) ====================

  /**
   * 获取研究历史时间线
   */
  @Get("topics/:id/research-history")
  @ApiOperation({
    summary: "获取研究历史时间线",
    description: "获取专题的所有研究历史记录，包括每次研究的目标、策略和成果",
  })
  @ApiParam({ name: "id", description: "专题ID" })
  @ApiQuery({ name: "limit", required: false, description: "返回数量" })
  @ApiResponse({ status: 200, description: "返回研究历史列表" })
  async getResearchHistory(
    @Request() req: any,
    @Param("id") id: string,
    @Query("limit") limit?: string,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    return this.topicResearchService.getResearchHistory(
      userId,
      id,
      limit ? parseInt(limit, 10) : undefined,
    );
  }

  // ==================== Review Workflow (Phase 3.3) ====================

  /**
   * 获取报告的审核任务列表
   */
  @Get("topics/:topicId/reports/:reportId/review-tasks")
  @ApiOperation({
    summary: "获取审核任务列表",
    description: "获取报告的所有审核任务",
  })
  @ApiParam({ name: "topicId", description: "专题ID" })
  @ApiParam({ name: "reportId", description: "报告ID" })
  @ApiResponse({ status: 200, description: "返回审核任务列表" })
  async getReviewTasks(
    @Request() req: any,
    @Param("topicId") _topicId: string,
    @Param("reportId") reportId: string,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    return this.reviewWorkflowService.getReviewTasks(reportId);
  }

  /**
   * 创建审核任务
   */
  @Post("topics/:topicId/reports/:reportId/review-tasks")
  @ApiOperation({
    summary: "创建审核任务",
    description: "为报告的各章节自动创建审核任务",
  })
  @ApiParam({ name: "topicId", description: "专题ID" })
  @ApiParam({ name: "reportId", description: "报告ID" })
  @ApiResponse({ status: 201, description: "审核任务创建成功" })
  async createReviewTasks(
    @Request() req: any,
    @Param("topicId") _topicId: string,
    @Param("reportId") reportId: string,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    return this.reviewWorkflowService.createReviewTasksForReport(
      reportId,
      userId,
    );
  }

  /**
   * 分配审核任务
   */
  @Patch("topics/:topicId/reports/:reportId/review-tasks/:taskId/assign")
  @ApiOperation({
    summary: "分配审核任务",
    description: "将审核任务分配给指定协作者",
  })
  @ApiParam({ name: "topicId", description: "专题ID" })
  @ApiParam({ name: "reportId", description: "报告ID" })
  @ApiParam({ name: "taskId", description: "任务ID" })
  @ApiResponse({ status: 200, description: "分配成功" })
  async assignReviewTask(
    @Request() req: any,
    @Param("topicId") _topicId: string,
    @Param("reportId") _reportId: string,
    @Param("taskId") taskId: string,
    @Body() dto: AssignReviewTaskDto,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    return this.reviewWorkflowService.assignTask(
      {
        taskId,
        assigneeId: dto.assigneeId,
        assigneeName: dto.assigneeName,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
      },
      userId,
    );
  }

  /**
   * 完成审核任务
   */
  @Patch("topics/:topicId/reports/:reportId/review-tasks/:taskId/complete")
  @ApiOperation({
    summary: "完成审核任务",
    description: "提交审核结果，标记任务为完成",
  })
  @ApiParam({ name: "topicId", description: "专题ID" })
  @ApiParam({ name: "reportId", description: "报告ID" })
  @ApiParam({ name: "taskId", description: "任务ID" })
  @ApiResponse({ status: 200, description: "审核完成" })
  async completeReviewTask(
    @Request() req: any,
    @Param("topicId") _topicId: string,
    @Param("reportId") _reportId: string,
    @Param("taskId") taskId: string,
    @Body() dto: CompleteReviewTaskDto,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    return this.reviewWorkflowService.completeTask(
      {
        taskId,
        approved: dto.approved,
        comments: dto.comments,
        score: dto.score,
      },
      userId,
    );
  }

  /**
   * 获取审核任务统计
   */
  @Get("topics/:topicId/reports/:reportId/review-tasks/stats")
  @ApiOperation({
    summary: "获取审核任务统计",
    description: "获取报告审核任务的统计数据",
  })
  @ApiParam({ name: "topicId", description: "专题ID" })
  @ApiParam({ name: "reportId", description: "报告ID" })
  @ApiResponse({ status: 200, description: "返回审核任务统计" })
  async getReviewTaskStats(
    @Request() req: any,
    @Param("topicId") _topicId: string,
    @Param("reportId") reportId: string,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    return this.reviewWorkflowService.getTaskStats(reportId);
  }

  /**
   * 检查报告是否可发布
   */
  @Get("topics/:topicId/reports/:reportId/review-tasks/can-publish")
  @ApiOperation({
    summary: "检查报告是否可发布",
    description: "检查所有审核任务是否完成且通过",
  })
  @ApiParam({ name: "topicId", description: "专题ID" })
  @ApiParam({ name: "reportId", description: "报告ID" })
  @ApiResponse({ status: 200, description: "返回发布状态" })
  async canPublishReport(
    @Request() req: any,
    @Param("topicId") _topicId: string,
    @Param("reportId") reportId: string,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    return this.reviewWorkflowService.canPublishReport(reportId);
  }

  // ==================== TODO Management ====================

  /**
   * 获取专题的 TODO 列表
   */
  @Get("topics/:topicId/todos")
  @ApiOperation({
    summary: "获取 TODO 列表",
    description: "获取专题的研究任务 TODO 列表",
  })
  @ApiParam({ name: "topicId", description: "专题ID" })
  @ApiQuery({
    name: "missionId",
    required: false,
    description: "按 Mission 过滤",
  })
  @ApiResponse({ status: 200, description: "返回 TODO 列表和汇总" })
  async getTodos(
    @Request() req: any,
    @Param("topicId") topicId: string,
    @Query() query: GetTodosQueryDto,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    return this.todoService.getTodos(topicId, {
      missionId: query.missionId,
      status: query.status,
      type: query.type,
    });
  }

  /**
   * 获取单个 TODO 详情
   */
  @Get("topics/:topicId/todos/:todoId")
  @ApiOperation({
    summary: "获取 TODO 详情",
    description: "获取单个 TODO 的详细信息",
  })
  @ApiParam({ name: "topicId", description: "专题ID" })
  @ApiParam({ name: "todoId", description: "TODO ID" })
  @ApiResponse({ status: 200, description: "返回 TODO 详情" })
  async getTodoById(
    @Request() req: any,
    @Param("topicId") _topicId: string,
    @Param("todoId") todoId: string,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    return this.todoService.getTodoById(todoId);
  }

  /**
   * 获取 TODO 详情（包含 Agent 活动）
   */
  @Get("topics/:topicId/todos/:todoId/details")
  @ApiOperation({
    summary: "获取 TODO 详情和活动",
    description: "获取 TODO 详情，包含关联的 Agent 活动记录",
  })
  @ApiParam({ name: "topicId", description: "专题ID" })
  @ApiParam({ name: "todoId", description: "TODO ID" })
  @ApiResponse({ status: 200, description: "返回 TODO 详情和活动" })
  async getTodoDetails(
    @Request() req: any,
    @Param("topicId") _topicId: string,
    @Param("todoId") todoId: string,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    return this.todoService.getTodoDetails(todoId);
  }

  /**
   * ★ 获取任务（ResearchTask）相关的活动记录
   * 注意：这个 endpoint 用于获取 missionStatus.tasks 中任务的活动
   */
  @Get("topics/:topicId/tasks/:taskId/activities")
  @ApiOperation({
    summary: "获取任务活动记录",
    description: "获取 ResearchTask 关联的 Agent 活动记录",
  })
  @ApiParam({ name: "topicId", description: "专题ID" })
  @ApiParam({ name: "taskId", description: "任务ID (ResearchTask.id)" })
  @ApiResponse({ status: 200, description: "返回任务信息和活动记录" })
  async getTaskActivities(
    @Request() req: any,
    @Param("topicId") _topicId: string,
    @Param("taskId") taskId: string,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    return this.missionService.getTaskActivities(taskId);
  }

  /**
   * 暂停 TODO
   */
  @Post("topics/:topicId/todos/:todoId/pause")
  @HttpCode(200)
  @ApiOperation({
    summary: "暂停 TODO",
    description: "暂停正在进行的 TODO",
  })
  @ApiParam({ name: "topicId", description: "专题ID" })
  @ApiParam({ name: "todoId", description: "TODO ID" })
  @ApiResponse({ status: 200, description: "暂停成功" })
  async pauseTodo(
    @Request() req: any,
    @Param("topicId") _topicId: string,
    @Param("todoId") todoId: string,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    const todo = await this.todoService.pauseTodo(todoId);
    return { success: true, todo };
  }

  /**
   * 恢复 TODO
   */
  @Post("topics/:topicId/todos/:todoId/resume")
  @HttpCode(200)
  @ApiOperation({
    summary: "恢复 TODO",
    description: "恢复已暂停的 TODO",
  })
  @ApiParam({ name: "topicId", description: "专题ID" })
  @ApiParam({ name: "todoId", description: "TODO ID" })
  @ApiResponse({ status: 200, description: "恢复成功" })
  async resumeTodo(
    @Request() req: any,
    @Param("topicId") _topicId: string,
    @Param("todoId") todoId: string,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    const todo = await this.todoService.resumeTodo(todoId);
    return { success: true, todo };
  }

  /**
   * 取消 TODO
   */
  @Post("topics/:topicId/todos/:todoId/cancel")
  @HttpCode(200)
  @ApiOperation({
    summary: "取消 TODO",
    description: "取消待处理或已暂停的 TODO",
  })
  @ApiParam({ name: "topicId", description: "专题ID" })
  @ApiParam({ name: "todoId", description: "TODO ID" })
  @ApiResponse({ status: 200, description: "取消成功" })
  async cancelTodo(
    @Request() req: any,
    @Param("topicId") _topicId: string,
    @Param("todoId") todoId: string,
    @Body() dto: CancelTodoDto,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    const todo = await this.todoService.cancelTodo(todoId, dto.reason);
    return { success: true, todo };
  }

  /**
   * 重试 TODO
   * ★ 增强版：同时支持 ResearchTodo ID 和 ResearchTask ID
   * 前端显示的任务可能来自 missionStatus.tasks（ResearchTask）或 apiTodos（ResearchTodo）
   */
  @Post("topics/:topicId/todos/:todoId/retry")
  @HttpCode(200)
  @ApiOperation({
    summary: "重试 TODO",
    description: "重试失败的 TODO 或任务",
  })
  @ApiParam({ name: "topicId", description: "专题ID" })
  @ApiParam({ name: "todoId", description: "TODO ID 或 Task ID" })
  @ApiResponse({ status: 200, description: "重试已排队" })
  async retryTodo(
    @Request() req: any,
    @Param("topicId") _topicId: string,
    @Param("todoId") todoId: string,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }

    // ★ 先尝试作为 ResearchTodo 处理
    try {
      const todo = await this.todoService.retryTodo(todoId);
      return { success: true, todo };
    } catch (error) {
      // 如果是 NotFoundException，尝试作为 ResearchTask 处理
      if (error instanceof NotFoundException) {
        try {
          const task = await this.missionService.retryTask(todoId);
          // 将 Task 转换为类似 TODO 的格式返回
          return {
            success: true,
            todo: {
              id: task.id,
              title: task.title,
              status: task.status === "PENDING" ? "QUEUED" : task.status,
              type: task.taskType,
              dimensionName: task.dimensionName,
              progress: 0,
              statusMessage: "等待重试",
            },
          };
        } catch (taskError) {
          // 两个都失败，抛出原始错误
          throw error;
        }
      }
      throw error;
    }
  }

  /**
   * ★ 执行用户请求的 TODO
   * 解析 TODO 内容，执行相应操作（如新增维度并研究）
   */
  @Post("topics/:topicId/todos/:todoId/execute")
  @HttpCode(202)
  @ApiOperation({
    summary: "执行 TODO",
    description: "执行用户请求的 TODO，如新增维度、深入研究等",
  })
  @ApiParam({ name: "topicId", description: "专题ID" })
  @ApiParam({ name: "todoId", description: "TODO ID" })
  @ApiResponse({ status: 202, description: "执行已开始" })
  async executeTodo(
    @Request() req: any,
    @Param("topicId") topicId: string,
    @Param("todoId") todoId: string,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    const result = await this.todoService.executeTodo(topicId, todoId);
    return { success: true, ...result };
  }

  /**
   * 调整 TODO 优先级
   */
  @Patch("topics/:topicId/todos/:todoId/priority")
  @ApiOperation({
    summary: "调整优先级",
    description: "调整 TODO 的执行优先级",
  })
  @ApiParam({ name: "topicId", description: "专题ID" })
  @ApiParam({ name: "todoId", description: "TODO ID" })
  @ApiResponse({ status: 200, description: "优先级已调整" })
  async prioritizeTodo(
    @Request() req: any,
    @Param("topicId") _topicId: string,
    @Param("todoId") todoId: string,
    @Body() dto: PrioritizeTodoDto,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    const todo = await this.todoService.prioritizeTodo(todoId, dto.priority);
    return { success: true, todo };
  }

  /**
   * 更新 TODO 进度（内部使用）
   */
  @Patch("topics/:topicId/todos/:todoId/progress")
  @ApiOperation({
    summary: "更新进度",
    description: "更新 TODO 的执行进度",
  })
  @ApiParam({ name: "topicId", description: "专题ID" })
  @ApiParam({ name: "todoId", description: "TODO ID" })
  @ApiResponse({ status: 200, description: "进度已更新" })
  async updateTodoProgress(
    @Request() req: any,
    @Param("topicId") _topicId: string,
    @Param("todoId") todoId: string,
    @Body() dto: UpdateTodoProgressDto,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    const todo = await this.todoService.updateTodoProgress(todoId, {
      progress: dto.progress,
      statusMessage: dto.statusMessage,
    });
    return { success: true, todo };
  }

  /**
   * 创建用户请求 TODO
   */
  @Post("topics/:topicId/missions/:missionId/todos")
  @ApiOperation({
    summary: "创建用户请求",
    description: "创建一个用户请求的 TODO",
  })
  @ApiParam({ name: "topicId", description: "专题ID" })
  @ApiParam({ name: "missionId", description: "Mission ID" })
  @ApiResponse({ status: 201, description: "TODO 创建成功" })
  async createUserRequestTodo(
    @Request() req: any,
    @Param("topicId") topicId: string,
    @Param("missionId") missionId: string,
    @Body() dto: CreateUserRequestTodoDto,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    const todo = await this.todoService.createUserRequestTodo(
      topicId,
      missionId,
      dto.title,
      dto.description,
    );
    return { success: true, todo };
  }

  /**
   * ★ 更新 TODO（编辑标题和描述）
   */
  @Patch("topics/:topicId/todos/:todoId")
  @ApiOperation({
    summary: "更新 TODO",
    description: "更新 TODO 的标题和描述（仅限 USER_REQUEST 类型）",
  })
  @ApiParam({ name: "topicId", description: "专题ID" })
  @ApiParam({ name: "todoId", description: "TODO ID" })
  @ApiResponse({ status: 200, description: "更新成功" })
  async updateTodo(
    @Request() req: any,
    @Param("topicId") _topicId: string,
    @Param("todoId") todoId: string,
    @Body() dto: { title?: string; description?: string },
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    const todo = await this.todoService.updateTodoContent(todoId, dto);
    return { success: true, todo };
  }

  /**
   * ★ 删除 TODO
   */
  @Delete("topics/:topicId/todos/:todoId")
  @HttpCode(200)
  @ApiOperation({
    summary: "删除 TODO",
    description: "删除 TODO（仅限 USER_REQUEST 类型且状态为 PENDING）",
  })
  @ApiParam({ name: "topicId", description: "专题ID" })
  @ApiParam({ name: "todoId", description: "TODO ID" })
  @ApiResponse({ status: 200, description: "删除成功" })
  async deleteTodo(
    @Request() req: any,
    @Param("topicId") _topicId: string,
    @Param("todoId") todoId: string,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }
    await this.todoService.deleteTodo(todoId);
    return { success: true };
  }
}
