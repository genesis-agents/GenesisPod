import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
  UnauthorizedException,
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
} from "./dto";
import {
  AddCollaboratorDto,
  UpdateCollaboratorRoleDto,
  UpdateTopicVisibilityDto,
} from "./dto/collaborator.dto";
import { JwtAuthGuard } from "../../../common/guards/jwt-auth.guard";
import { ResearchMissionService } from "./services/research-mission.service";
import { ResearchLeaderService } from "./services/research-leader.service";
import { TopicCollaboratorService } from "./services/topic-collaborator.service";

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
  ) {}

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
}
