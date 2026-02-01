import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { sanitizeMarkdownContent } from "../../../../common/utils/sanitize-content.utils";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { RESEARCH_INTERNAL_EVENTS } from "./services/core/research-event-emitter.service";
import { Observable, Subject, filter, map } from "rxjs";
import { MessageEvent } from "@nestjs/common";
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
} from "./dto";
import { AIModelType } from "@prisma/client";
import type { RefreshProgressEvent } from "./services/core/topic-team-orchestrator.service";
import {
  TopicTeamOrchestratorService,
  ReportSynthesisService,
  EvidenceManagementService,
  ReportChangeService,
  ReportAnnotationService,
  ResearchStrategyService,
  AgentActivityService,
  CredibilityReportService,
  TopicCrudService,
  TopicDimensionService,
  TopicExportService,
  TopicScheduleService,
} from "./services";
import { AIEngineFacade } from "../../../ai-engine/facade";
import {
  REPORT_EDITING_SYSTEM_PROMPT,
  buildEditPrompt,
  buildEnhancedEditPrompt,
} from "./prompts";
import { BillingContext } from "../../../credits/billing-context";
import type { ResearchDepth } from "./types";

// 维度模板已外置到 config/dimension-templates.config.ts
/**
 * 清理AI生成内容中的HTML标签
 * 主要处理 <br> 标签转换为换行，其他标签移除
 * @param content 原始内容
 * @returns 清理后的内容
 */
function cleanHtmlTagsFromContent(
  content: string | null | undefined,
): string | null {
  if (!content) return content as null;

  let cleaned = content;

  // 1. 将 <br>, <br/>, <br /> 转换为换行符
  cleaned = cleaned.replace(/<br\s*\/?>/gi, "\n");

  // 2. 将 </p><p> 转换为双换行（段落分隔）
  cleaned = cleaned.replace(/<\/p>\s*<p>/gi, "\n\n");

  // 3. 将 <p> 和 </p> 单独出现时转换为换行
  cleaned = cleaned.replace(/<\/?p>/gi, "\n");

  // 4. 移除其他常见HTML标签但保留内容
  cleaned = cleaned.replace(
    /<\/?(?:div|span|strong|em|b|i|u|a|ul|ol|li|h[1-6])[^>]*>/gi,
    "",
  );

  // 5. 清理多余的连续换行（超过2个变成2个）
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");

  // 6. 清理行首行尾的空白
  cleaned = cleaned.trim();

  return cleaned;
}

/**
 * TopicResearchService (Facade)
 *
 * ★ Facade Pattern: 将原有 2571 行服务拆分为 4 个子服务
 * - TopicCrudService: CRUD, list, stats, history, logs
 * - TopicDimensionService: dimension add/remove/reorder/refresh/config
 * - TopicExportService: export, template, share
 * - TopicScheduleService: scheduled refresh, smart-start, strategy
 *
 * Facade 保留复杂的编排逻辑：
 * - Refresh operations (triggerRefresh, smartStartResearch, etc.)
 * - Report operations (listReports, getReport, aiEditReport, etc.)
 * - Evidence operations
 * - Annotations & Changes
 * - Agent & Credibility
 */
@Injectable()
export class TopicResearchService {
  private readonly logger = new Logger(TopicResearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly orchestrator: TopicTeamOrchestratorService,
    private readonly reportService: ReportSynthesisService,
    private readonly evidenceService: EvidenceManagementService,
    private readonly aiFacade: AIEngineFacade,
    private readonly reportChangeService: ReportChangeService,
    private readonly reportAnnotationService: ReportAnnotationService,
    private readonly researchStrategyService: ResearchStrategyService,
    private readonly agentActivityService: AgentActivityService,
    private readonly credibilityReportService: CredibilityReportService,
    // ★ 4 个子服务（Facade pattern）
    private readonly crudService: TopicCrudService,
    private readonly dimensionService: TopicDimensionService,
    private readonly exportService: TopicExportService,
    private readonly scheduleService: TopicScheduleService,
  ) {}

  // ==================== Topics CRUD (delegated to TopicCrudService) ====================

  async createTopic(userId: string, dto: CreateTopicDto) {
    return this.crudService.createTopic(userId, dto);
  }

  async listTopics(userId: string, query: ListTopicsDto) {
    return this.crudService.listTopics(userId, query);
  }

  async getTopic(userId: string, topicId: string) {
    return this.crudService.getTopic(userId, topicId);
  }

  async updateTopic(userId: string, topicId: string, dto: UpdateTopicDto) {
    return this.crudService.updateTopic(userId, topicId, dto);
  }

  async deleteTopic(userId: string, topicId: string) {
    return this.crudService.deleteTopic(userId, topicId);
  }

  async getResearchHistory(userId: string, topicId: string, limit?: number) {
    return this.crudService.getResearchHistory(userId, topicId, limit);
  }

  async getLogs(userId: string, topicId: string, query: ListLogsDto) {
    return this.crudService.getLogs(userId, topicId, query);
  }

  async getStats(userId: string, topicId: string) {
    return this.crudService.getStats(userId, topicId);
  }

  async recalculateTopicStats(userId: string, topicId: string) {
    return this.crudService.recalculateTopicStats(userId, topicId);
  }

  // ==================== Dimensions (delegated to TopicDimensionService) ====================

  async listDimensions(userId: string, topicId: string) {
    return this.dimensionService.listDimensions(userId, topicId);
  }

  async addDimension(userId: string, topicId: string, dto: AddDimensionDto) {
    return this.dimensionService.addDimension(userId, topicId, dto);
  }

  async updateDimension(
    userId: string,
    topicId: string,
    dimensionId: string,
    dto: UpdateDimensionDto,
  ) {
    return this.dimensionService.updateDimension(
      userId,
      topicId,
      dimensionId,
      dto,
    );
  }

  async deleteDimension(userId: string, topicId: string, dimensionId: string) {
    return this.dimensionService.deleteDimension(userId, topicId, dimensionId);
  }

  async refreshDimension(
    userId: string,
    topicId: string,
    dimensionId: string,
    dto: RefreshDimensionDto,
  ) {
    return this.dimensionService.refreshDimension(
      userId,
      topicId,
      dimensionId,
      dto,
    );
  }

  async reorderDimensions(
    userId: string,
    topicId: string,
    dto: ReorderDimensionsDto,
  ) {
    return this.dimensionService.reorderDimensions(userId, topicId, dto);
  }

  async getTemplates(query: GetTemplatesDto) {
    return this.dimensionService.getTemplates(query);
  }

  async createFromTemplate(userId: string, dto: CreateFromTemplateDto) {
    return this.dimensionService.createFromTemplate(userId, dto);
  }

  // ==================== Export & Sharing (delegated to TopicExportService) ====================

  async exportReport(
    userId: string,
    topicId: string,
    reportId: string,
    dto: ExportReportDto,
  ) {
    return this.exportService.exportReport(userId, topicId, reportId, dto);
  }

  async updateVisibility(userId: string, topicId: string, visibility: string) {
    return this.exportService.updateVisibility(userId, topicId, visibility);
  }

  async getSharingSettings(userId: string, topicId: string) {
    return this.exportService.getSharingSettings(userId, topicId);
  }

  async getSharedTopic(topicId: string) {
    return this.exportService.getSharedTopic(topicId);
  }

  async getSharedTopicLatestReport(topicId: string) {
    return this.exportService.getSharedTopicLatestReport(topicId);
  }

  // ==================== Schedule (delegated to TopicScheduleService) ====================

  async getSchedule(userId: string, topicId: string) {
    return this.scheduleService.getSchedule(userId, topicId);
  }

  async updateSchedule(
    userId: string,
    topicId: string,
    dto: UpdateScheduleDto,
  ) {
    return this.scheduleService.updateSchedule(userId, topicId, dto);
  }

  // ==================== Refresh Operations (kept in Facade) ====================

  /**
   * 触发刷新
   */
  async triggerRefresh(
    userId: string,
    topicId: string,
    dto: TriggerRefreshDto,
  ) {
    return BillingContext.run(
      {
        userId,
        moduleType: "topic-research",
        operationType: "refresh",
        referenceId: topicId,
      },
      async () => {
        // 验证专题所有权
        const topic = await this.crudService.getTopic(userId, topicId);

        // 根据刷新类型决定是否增量刷新
        const isIncremental = dto.type === "INCREMENTAL";

        // 执行刷新
        const report = await this.orchestrator.executeRefresh(topic, {
          forceRefresh: dto.type === "FULL",
          dimensionIds: dto.dimensionIds,
          incremental: isIncremental,
          researchDepth: dto.researchDepth as ResearchDepth,
        });

        return {
          success: true,
          reportId: report.id,
          message: "刷新完成",
        };
      },
    );
  }

  /**
   * 获取研究策略建议
   */
  async getResearchStrategy(userId: string, topicId: string) {
    // 验证专题所有权
    await this.verifyTopicOwnership(userId, topicId);

    return this.researchStrategyService.analyzeAndRecommend(topicId);
  }

  /**
   * 快速检查研究状态（用于前端按钮显示）
   */
  async quickCheckResearchStatus(userId: string, topicId: string) {
    // 验证专题所有权
    await this.verifyTopicOwnership(userId, topicId);

    return this.researchStrategyService.quickCheck(topicId);
  }

  /**
   * 智能开始研究
   */
  async smartStartResearch(userId: string, topicId: string) {
    return BillingContext.run(
      {
        userId,
        moduleType: "topic-research",
        operationType: "refresh",
        referenceId: topicId,
      },
      async () => {
        // 验证专题所有权
        const topic = await this.crudService.getTopic(userId, topicId);

        // 获取智能策略
        const smartOptions =
          await this.researchStrategyService.getSmartRefreshOptions(topicId);

        this.logger.log(
          `Smart research for topic ${topicId}: ${smartOptions.strategy} - ${smartOptions.message}`,
        );

        // 执行研究
        const report = await this.orchestrator.executeRefresh(topic, {
          forceRefresh: smartOptions.forceRefresh,
          dimensionIds: smartOptions.dimensionIds,
          incremental: smartOptions.incremental,
        });

        return {
          success: true,
          reportId: report.id,
          strategy: smartOptions.strategy,
          message: smartOptions.message,
        };
      },
    );
  }

  /**
   * 获取 Agent 活动记录（按维度分组）
   */
  async getAgentActivities(
    userId: string,
    topicId: string,
    missionId?: string,
  ) {
    // 验证专题所有权
    await this.verifyTopicOwnership(userId, topicId);

    return this.agentActivityService.getActivitiesByDimension(
      topicId,
      missionId,
    );
  }

  /**
   * 获取 Agent 活动统计
   */
  async getAgentActivityStats(
    userId: string,
    topicId: string,
    missionId?: string,
  ) {
    // 验证专题所有权
    await this.verifyTopicOwnership(userId, topicId);

    return this.agentActivityService.getActivityStats(topicId, missionId);
  }

  /**
   * 获取报告的可信度评估
   */
  async getCredibilityReport(userId: string, reportId: string) {
    // 获取报告及其专题信息
    const report = await this.prisma.topicReport.findUnique({
      where: { id: reportId },
      include: { topic: { select: { id: true, userId: true } } },
    });

    if (!report) {
      throw new NotFoundException("Report not found");
    }

    // 验证专题读取权限（支持公开专题访问）
    await this.verifyTopicReadAccess(userId, report.topic.id);

    return this.credibilityReportService.getOrGenerateCredibilityReport(
      reportId,
    );
  }

  /**
   * 重新生成可信度报告
   */
  async regenerateCredibilityReport(userId: string, reportId: string) {
    // 验证报告所有权
    const report = await this.prisma.topicReport.findUnique({
      where: { id: reportId },
      include: { topic: { select: { userId: true } } },
    });

    if (!report || report.topic.userId !== userId) {
      throw new NotFoundException("Report not found");
    }

    return this.credibilityReportService.generateCredibilityReport(reportId);
  }

  /**
   * ★ 重新合成报告内容
   */
  async regenerateReportContent(
    userId: string,
    reportId: string,
    feedback?: string,
  ) {
    // 验证报告所有权
    const report = await this.prisma.topicReport.findUnique({
      where: { id: reportId },
      include: { topic: true },
    });

    if (!report || report.topic.userId !== userId) {
      throw new NotFoundException("Report not found");
    }

    // 调用报告合成服务重新生成内容
    const updatedReport = await this.reportService.synthesizeReport(
      report.topic,
      reportId,
      feedback,
    );

    this.logger.log(
      `[regenerateReportContent] Report ${reportId} regenerated successfully`,
    );

    return {
      success: true,
      report: updatedReport,
    };
  }

  /**
   * ★ 重新计算证据可信度评分
   */
  async recalculateEvidenceCredibility(reportId: string) {
    return this.evidenceService.recalculateCredibilityScores(reportId);
  }

  /**
   * 获取刷新状态
   */
  async getRefreshStatus(userId: string, topicId: string) {
    // 验证专题读取权限（支持公开专题访问）
    await this.verifyTopicReadAccess(userId, topicId);

    const status = this.orchestrator.getRefreshStatus(topicId);

    // 获取最近的刷新日志
    const latestLog = await this.prisma.topicRefreshLog.findFirst({
      where: { topicId },
      orderBy: { startedAt: "desc" },
    });

    return {
      isRunning: status.isRunning,
      startedAt: status.startedAt,
      latestLog,
    };
  }

  /**
   * 监听刷新进度 (SSE)
   */
  streamRefreshProgress(
    _userId: string,
    topicId: string,
  ): Observable<MessageEvent> {
    // 创建一个 Subject 来发送事件
    const subject = new Subject<RefreshProgressEvent>();

    // 监听事件
    const listener = (event: RefreshProgressEvent) => {
      if (event.topicId === topicId) {
        subject.next(event);
      }
    };

    this.eventEmitter.on(
      RESEARCH_INTERNAL_EVENTS.TOPIC_RESEARCH_PROGRESS,
      listener,
    );

    // 当客户端断开连接时清理
    subject.subscribe({
      complete: () => {
        this.eventEmitter.off(
          RESEARCH_INTERNAL_EVENTS.TOPIC_RESEARCH_PROGRESS,
          listener,
        );
      },
    });

    // 转换为 MessageEvent
    return subject.pipe(
      filter(
        (event): event is RefreshProgressEvent => event.topicId === topicId,
      ),
      map(
        (event) =>
          ({
            data: JSON.stringify(event),
          }) as MessageEvent,
      ),
    );
  }

  /**
   * 取消刷新
   */
  async cancelRefresh(userId: string, topicId: string, _dto: CancelRefreshDto) {
    // 验证专题所有权
    await this.verifyTopicOwnership(userId, topicId);

    const cancelled = await this.orchestrator.cancelRefresh(topicId);

    return {
      success: cancelled,
      message: cancelled ? "刷新已取消" : "没有正在进行的刷新",
    };
  }

  // ==================== Reports (kept in Facade) ====================

  /**
   * 获取报告列表
   */
  async listReports(userId: string, topicId: string, query: ListReportsDto) {
    // 验证专题读取权限（支持公开专题访问）
    await this.verifyTopicReadAccess(userId, topicId);

    return this.reportService.listReports(topicId, {
      skip: 0,
      take: query.limit || 10,
    });
  }

  /**
   * 获取最新报告
   */
  async getLatestReport(userId: string, topicId: string) {
    // 验证专题读取权限（支持公开专题访问）
    await this.verifyTopicReadAccess(userId, topicId);

    const report = await this.reportService.getLatestReport(topicId);

    if (!report) {
      throw new NotFoundException("No reports found for this topic");
    }

    // 转换报告数据，提取 dataPoints 中的字段到顶层
    return this.transformReportForFrontend(report);
  }

  /**
   * 获取指定版本报告
   */
  async getReport(userId: string, topicId: string, reportId: string) {
    // 验证专题读取权限（支持公开专题访问）
    await this.verifyTopicReadAccess(userId, topicId);

    const report = await this.reportService.getReport(reportId);

    if (!report || report.topicId !== topicId) {
      throw new NotFoundException("Report not found");
    }

    // 转换报告数据，提取 dataPoints 中的字段到顶层
    return this.transformReportForFrontend(report);
  }

  /**
   * 删除报告（仅管理员/所有者）
   */
  async deleteReport(userId: string, topicId: string, reportId: string) {
    // 验证专题所有权
    await this.verifyTopicOwnership(userId, topicId);

    const report = await this.reportService.getReport(reportId);

    if (!report || report.topicId !== topicId) {
      throw new NotFoundException("Report not found");
    }

    // 使用事务删除报告及其关联数据
    await this.prisma.$transaction(async (tx) => {
      // 1. 删除维度分析
      await tx.dimensionAnalysis.deleteMany({
        where: { reportId },
      });

      // 2. 删除报告修订历史
      await tx.topicReportRevision.deleteMany({
        where: { reportId },
      });

      // 3. 删除报告批注
      await tx.reportAnnotation.deleteMany({
        where: { reportId },
      });

      // 4. 删除报告变更记录
      await tx.reportChange.deleteMany({
        where: { reportId },
      });

      // 5. 删除报告本身
      await tx.topicReport.delete({
        where: { id: reportId },
      });
    });

    this.logger.log(
      `[deleteReport] Report ${reportId} deleted by user ${userId}`,
    );

    return { success: true, message: "Report deleted successfully" };
  }

  /**
   * 转换报告数据以适配前端接口
   * ★ 同时清理AI生成内容中的HTML标签和Markdown格式问题
   */
  private transformReportForFrontend(report: any) {
    if (!report) return report;

    // ★ 清理报告级别的内容字段（HTML标签 + 下划线等格式问题）
    if (report.executiveSummary) {
      report.executiveSummary = sanitizeMarkdownContent(
        cleanHtmlTagsFromContent(report.executiveSummary) || "",
      );
    }
    if (report.fullReport) {
      report.fullReport = sanitizeMarkdownContent(
        cleanHtmlTagsFromContent(report.fullReport) || "",
      );
    }

    // 转换维度分析数据
    if (report.dimensionAnalyses) {
      // ★ 辅助函数：清理HTML + 下划线等格式问题
      const cleanAndSanitize = (content: string | undefined | null): string => {
        if (!content) return "";
        return sanitizeMarkdownContent(cleanHtmlTagsFromContent(content) || "");
      };

      report.dimensionAnalyses = report.dimensionAnalyses.map(
        (analysis: any) => {
          const dataPoints = analysis.dataPoints as {
            trends?: any[];
            challenges?: any[];
            opportunities?: any[];
            confidenceLevel?: string;
            detailedContent?: string;
          } | null;

          // ★ 清理维度分析中的文本内容（HTML标签 + 下划线等格式问题）
          const cleanedAnalysis = cleanAndSanitize(analysis.analysis);
          const cleanedSummary = cleanAndSanitize(analysis.summary);
          const cleanedDetailedContent = cleanAndSanitize(
            dataPoints?.detailedContent,
          );

          // ★ 清理 keyFindings 中的文本
          const cleanedKeyFindings =
            analysis.keyFindings?.map((kf: any) => ({
              ...kf,
              finding: cleanAndSanitize(kf.finding),
              implication: cleanAndSanitize(kf.implication),
            })) || [];

          // ★ 清理趋势、挑战、机会中的文本
          const cleanedTrends = (dataPoints?.trends || []).map((t: any) => ({
            ...t,
            trend: cleanAndSanitize(t.trend),
            drivers: cleanAndSanitize(t.drivers),
            prediction: cleanAndSanitize(t.prediction),
          }));

          const cleanedChallenges = (dataPoints?.challenges || []).map(
            (c: any) => ({
              ...c,
              challenge: cleanAndSanitize(c.challenge),
              rootCause: cleanAndSanitize(c.rootCause),
              impact: cleanAndSanitize(c.impact),
              potentialSolutions: cleanAndSanitize(c.potentialSolutions),
            }),
          );

          const cleanedOpportunities = (dataPoints?.opportunities || []).map(
            (o: any) => ({
              ...o,
              opportunity: cleanAndSanitize(o.opportunity),
              potential: cleanAndSanitize(o.potential),
              requirements: cleanAndSanitize(o.requirements),
            }),
          );

          return {
            ...analysis,
            analysis: cleanedAnalysis,
            summary: cleanedSummary,
            keyFindings: cleanedKeyFindings,
            // 从 dataPoints 提取到顶层（已清理）
            trends: cleanedTrends,
            challenges: cleanedChallenges,
            opportunities: cleanedOpportunities,
            confidenceLevel: dataPoints?.confidenceLevel || null,
            detailedContent: cleanedDetailedContent,
          };
        },
      );
    }

    return report;
  }

  /**
   * 更新报告内容
   */
  async updateReportContent(
    userId: string,
    topicId: string,
    reportId: string,
    dto: {
      executiveSummary?: string;
      fullReport?: string;
      changeDescription?: string;
    },
  ) {
    // 验证专题所有权
    await this.verifyTopicOwnership(userId, topicId);

    const report = await this.reportService.getReport(reportId);
    if (!report || report.topicId !== topicId) {
      throw new NotFoundException("Report not found");
    }

    // 使用事务确保修订历史和报告更新的原子性
    return this.prisma.$transaction(async (tx) => {
      // 创建修订历史记录
      const latestRevision = await tx.topicReportRevision.findFirst({
        where: { reportId },
        orderBy: { revisionNumber: "desc" },
      });

      const newRevisionNumber = (latestRevision?.revisionNumber || 0) + 1;

      // 保存当前版本到修订历史
      await tx.topicReportRevision.create({
        data: {
          reportId,
          revisionNumber: newRevisionNumber,
          content: report.fullReport,
          changeDescription: dto.changeDescription || "用户手动编辑",
          editedBy: "user",
          editOperation: "manual_edit",
        },
      });

      // 更新报告
      const updatedReport = await tx.topicReport.update({
        where: { id: reportId },
        data: {
          ...(dto.executiveSummary && {
            executiveSummary: dto.executiveSummary,
          }),
          ...(dto.fullReport && { fullReport: dto.fullReport }),
        },
      });

      return updatedReport;
    });
  }

  /**
   * AI 编辑报告
   */
  async aiEditReport(
    userId: string,
    topicId: string,
    reportId: string,
    dto: {
      operation: "rewrite" | "polish" | "expand" | "compress" | "style";
      selectedText?: string;
      context?: string;
      fullContent?: string;
      styleGuide?: string;
      selectorPrefix?: string;
      selectorSuffix?: string;
      selection?: string;
      customInstruction?: string;
      targetStyle?: "academic" | "business" | "casual" | "technical";
    },
  ) {
    // 验证专题所有权
    await this.verifyTopicOwnership(userId, topicId);

    const report = await this.reportService.getReport(reportId);
    if (!report || report.topicId !== topicId) {
      throw new NotFoundException("Report not found");
    }

    // 确定使用新模式还是旧模式
    const useNewMode = Boolean(dto.selectedText);

    // 获取待编辑的文本（兼容两种模式）
    const textToEdit = dto.selectedText || dto.selection || report.fullReport;

    // 构建 AI 编辑 prompt
    let prompt: string;
    if (useNewMode) {
      // 新模式：使用增强提示词
      prompt = buildEnhancedEditPrompt(dto.operation, textToEdit, {
        userInstruction: dto.context,
        fullContent: dto.fullContent,
        styleGuide: dto.styleGuide,
        targetStyle: dto.targetStyle,
      });
    } else {
      // 旧模式：使用简单提示词（向后兼容）
      prompt = buildEditPrompt(dto.operation, textToEdit, {
        targetStyle: dto.targetStyle,
        customInstruction: dto.customInstruction,
      });
    }

    // 调用 AI 服务进行编辑（带自动积分扣除）
    const aiResponse = await this.aiFacade.chat({
      messages: [
        {
          role: "system",
          content: REPORT_EDITING_SYSTEM_PROMPT,
        },
        { role: "user", content: prompt },
      ],
      modelType: AIModelType.CHAT,
      taskProfile: {
        creativity: dto.operation === "rewrite" ? "high" : "medium",
        outputLength: dto.operation === "compress" ? "short" : "medium",
      },
      // ★ 自动积分扣除：基于实际 token 消耗
      billing: {
        userId,
        moduleType: "topic-research",
        operationType: "ai-edit",
        referenceId: reportId,
        description: `AI 编辑报告 (${dto.operation})`,
      },
    });

    const editedContent = aiResponse.content || "";

    // 计算新报告内容
    const selectionToReplace = dto.selectedText || dto.selection;
    let newFullReport = report.fullReport;

    if (selectionToReplace) {
      // 使用上下文定位进行精确替换
      let selectionIndex = -1;

      // 方法1：使用 selectorPrefix 和 selectorSuffix 进行上下文匹配
      if (dto.selectorPrefix || dto.selectorSuffix) {
        const prefix = dto.selectorPrefix || "";
        const suffix = dto.selectorSuffix || "";
        const contextPattern = prefix + selectionToReplace + suffix;
        const contextIndex = report.fullReport.indexOf(contextPattern);

        if (contextIndex !== -1) {
          // 找到上下文匹配，计算实际选中文本的位置
          selectionIndex = contextIndex + prefix.length;
          this.logger.debug(
            `Context-based match found at index ${selectionIndex}`,
          );
        } else {
          this.logger.warn(`Context pattern not found, falling back`);
        }
      }

      // 方法2：退回到简单的 indexOf 匹配
      if (selectionIndex === -1) {
        selectionIndex = report.fullReport.indexOf(selectionToReplace);
      }

      if (selectionIndex !== -1) {
        newFullReport =
          report.fullReport.substring(0, selectionIndex) +
          editedContent +
          report.fullReport.substring(
            selectionIndex + selectionToReplace.length,
          );
      } else {
        this.logger.warn(`Selection not found in report ${reportId}`);
      }
    } else {
      // 替换整个报告
      newFullReport = editedContent;
    }

    // 使用事务确保修订历史和报告更新的原子性
    const updatedReport = await this.prisma.$transaction(async (tx) => {
      // 保存修订历史
      const latestRevision = await tx.topicReportRevision.findFirst({
        where: { reportId },
        orderBy: { revisionNumber: "desc" },
      });

      const newRevisionNumber = (latestRevision?.revisionNumber || 0) + 1;

      await tx.topicReportRevision.create({
        data: {
          reportId,
          revisionNumber: newRevisionNumber,
          content: report.fullReport,
          changeDescription: dto.context
            ? `AI ${dto.operation}: ${dto.context.slice(0, 50)}`
            : `AI ${dto.operation} 操作`,
          editedBy: "ai",
          editOperation: dto.operation,
        },
      });

      // 更新报告
      return tx.topicReport.update({
        where: { id: reportId },
        data: { fullReport: newFullReport },
      });
    });

    return {
      report: updatedReport,
      editedContent,
      operation: dto.operation,
    };
  }

  /**
   * 获取报告修订历史
   */
  async getReportRevisions(userId: string, topicId: string, reportId: string) {
    // 验证专题读取权限（支持公开专题访问）
    await this.verifyTopicReadAccess(userId, topicId);

    const report = await this.reportService.getReport(reportId);
    if (!report || report.topicId !== topicId) {
      throw new NotFoundException("Report not found");
    }

    const revisions = await this.prisma.topicReportRevision.findMany({
      where: { reportId },
      orderBy: { revisionNumber: "desc" },
      select: {
        id: true,
        revisionNumber: true,
        changeDescription: true,
        editedBy: true,
        editOperation: true,
        createdAt: true,
      },
    });

    return revisions;
  }

  /**
   * 回滚报告到指定版本
   */
  async rollbackReport(
    userId: string,
    topicId: string,
    reportId: string,
    revisionNumber: number,
  ) {
    // 验证专题所有权
    await this.verifyTopicOwnership(userId, topicId);

    const report = await this.reportService.getReport(reportId);
    if (!report || report.topicId !== topicId) {
      throw new NotFoundException("Report not found");
    }

    // 获取目标修订版本
    const targetRevision = await this.prisma.topicReportRevision.findFirst({
      where: { reportId, revisionNumber },
    });

    if (!targetRevision) {
      throw new NotFoundException(
        `Revision ${revisionNumber} not found for this report`,
      );
    }

    // 保存当前版本到修订历史
    const latestRevision = await this.prisma.topicReportRevision.findFirst({
      where: { reportId },
      orderBy: { revisionNumber: "desc" },
    });

    const newRevisionNumber = (latestRevision?.revisionNumber || 0) + 1;

    await this.prisma.topicReportRevision.create({
      data: {
        reportId,
        revisionNumber: newRevisionNumber,
        content: report.fullReport,
        changeDescription: `回滚前的版本（从版本 ${revisionNumber} 回滚）`,
        editedBy: "user",
        editOperation: "rollback",
      },
    });

    // 恢复到目标版本
    const updatedReport = await this.prisma.topicReport.update({
      where: { id: reportId },
      data: { fullReport: targetRevision.content },
    });

    return {
      report: updatedReport,
      rolledBackFrom: newRevisionNumber - 1,
      rolledBackTo: revisionNumber,
    };
  }

  /**
   * 比较报告版本
   */
  async compareReports(
    userId: string,
    topicId: string,
    dto: CompareReportsDto,
  ) {
    // 验证专题所有权
    await this.verifyTopicOwnership(userId, topicId);

    // 通过版本号获取报告 ID
    const [fromReport, toReport] = await Promise.all([
      this.prisma.topicReport.findFirst({
        where: { topicId, version: dto.from },
        select: { id: true },
      }),
      this.prisma.topicReport.findFirst({
        where: { topicId, version: dto.to },
        select: { id: true },
      }),
    ]);

    if (!fromReport || !toReport) {
      throw new NotFoundException("One or both report versions not found");
    }

    return this.reportService.compareReports(
      topicId,
      fromReport.id,
      toReport.id,
    );
  }

  // ==================== Evidence (kept in Facade) ====================

  /**
   * 获取证据列表
   */
  async listEvidence(
    userId: string,
    topicId: string,
    reportId: string,
    query: ListEvidenceDto,
  ) {
    // 验证专题读取权限（支持公开专题访问）
    await this.verifyTopicReadAccess(userId, topicId);

    // 验证报告属于该专题
    const report = await this.reportService.getReport(reportId);
    if (!report || report.topicId !== topicId) {
      throw new NotFoundException("Report not found");
    }

    const page = query.page || 1;
    const pageSize = query.pageSize || 20;

    const result = await this.evidenceService.listEvidence(reportId, {
      skip: (page - 1) * pageSize,
      take: pageSize,
      sourceType: query.sourceType as string | undefined,
      minCredibility: query.minCredibility,
    });

    // 转换为前端期望的格式
    return {
      evidence: result.evidences,
      total: result.total,
      hasMore: (page - 1) * pageSize + result.evidences.length < result.total,
    };
  }

  /**
   * 获取证据详情
   */
  async getEvidence(
    userId: string,
    topicId: string,
    reportId: string,
    evidenceId: string,
  ) {
    // 验证专题读取权限（支持公开专题访问）
    await this.verifyTopicReadAccess(userId, topicId);

    // 验证报告属于该专题
    const report = await this.reportService.getReport(reportId);
    if (!report || report.topicId !== topicId) {
      throw new NotFoundException("Report not found");
    }

    const evidence = await this.evidenceService.getEvidence(evidenceId);

    if (!evidence || evidence.reportId !== reportId) {
      throw new NotFoundException("Evidence not found");
    }

    return evidence;
  }

  // ==================== Report Editing (kept in Facade) ====================

  async getReportChanges(userId: string, topicId: string, reportId: string) {
    // 验证专题读取权限（支持公开专题访问）
    await this.verifyTopicReadAccess(userId, topicId);

    // 验证报告属于该专题
    const report = await this.reportService.getReport(reportId);
    if (!report || report.topicId !== topicId) {
      throw new NotFoundException("Report not found");
    }

    return this.reportChangeService.getChanges(reportId);
  }

  async checkinChange(
    userId: string,
    topicId: string,
    reportId: string,
    changeId: string,
  ) {
    // 验证专题所有权
    await this.verifyTopicOwnership(userId, topicId);

    // 验证报告属于该专题
    const report = await this.reportService.getReport(reportId);
    if (!report || report.topicId !== topicId) {
      throw new NotFoundException("Report not found");
    }

    await this.reportChangeService.checkinChange(changeId, userId);
    return { success: true };
  }

  async checkinAllChanges(
    userId: string,
    topicId: string,
    reportId: string,
    changeIds?: string[],
  ) {
    // 验证专题所有权
    await this.verifyTopicOwnership(userId, topicId);

    // 验证报告属于该专题
    const report = await this.reportService.getReport(reportId);
    if (!report || report.topicId !== topicId) {
      throw new NotFoundException("Report not found");
    }

    const count = await this.reportChangeService.checkinAllChanges(
      reportId,
      userId,
      changeIds,
    );
    return { count };
  }

  async getReportAnnotations(
    userId: string,
    topicId: string,
    reportId: string,
    status?: string,
  ) {
    // 验证专题读取权限（支持公开专题访问）
    await this.verifyTopicReadAccess(userId, topicId);

    // 验证报告属于该专题
    const report = await this.reportService.getReport(reportId);
    if (!report || report.topicId !== topicId) {
      throw new NotFoundException("Report not found");
    }

    return this.reportAnnotationService.getAnnotations(reportId, status as any);
  }

  async createAnnotation(
    userId: string,
    topicId: string,
    reportId: string,
    dto: any,
  ) {
    // 验证专题读取权限（公开专题的所有登录用户都可以创建批注）
    await this.verifyTopicReadAccess(userId, topicId);

    // 验证报告属于该专题
    const report = await this.reportService.getReport(reportId);
    if (!report || report.topicId !== topicId) {
      throw new NotFoundException("Report not found");
    }

    return this.reportAnnotationService.createAnnotation(reportId, userId, dto);
  }

  async updateAnnotation(
    userId: string,
    topicId: string,
    reportId: string,
    annotationId: string,
    dto: any,
  ) {
    // 验证专题读取权限
    await this.verifyTopicReadAccess(userId, topicId);

    // 验证报告属于该专题
    const report = await this.reportService.getReport(reportId);
    if (!report || report.topicId !== topicId) {
      throw new NotFoundException("Report not found");
    }

    // 验证批注所有权（只有批注创建者可以更新自己的批注）
    const annotation = await this.prisma.reportAnnotation.findUnique({
      where: { id: annotationId },
      select: { createdById: true },
    });
    if (!annotation) {
      throw new NotFoundException("Annotation not found");
    }
    if (annotation.createdById !== userId) {
      throw new ForbiddenException("You can only update your own annotations");
    }

    return this.reportAnnotationService.updateAnnotation(annotationId, dto);
  }

  async deleteAnnotation(
    userId: string,
    topicId: string,
    reportId: string,
    annotationId: string,
  ) {
    // 获取专题信息
    const topic = await this.prisma.researchTopic.findUnique({
      where: { id: topicId },
      select: { userId: true },
    });
    if (!topic) {
      throw new NotFoundException("Topic not found");
    }

    // 验证专题读取权限
    await this.verifyTopicReadAccess(userId, topicId);

    // 验证报告属于该专题
    const report = await this.reportService.getReport(reportId);
    if (!report || report.topicId !== topicId) {
      throw new NotFoundException("Report not found");
    }

    // 验证删除权限（批注创建者或专题创建者可删除）
    const annotation = await this.prisma.reportAnnotation.findUnique({
      where: { id: annotationId },
      select: { createdById: true },
    });
    if (!annotation) {
      throw new NotFoundException("Annotation not found");
    }
    const isAnnotationOwner = annotation.createdById === userId;
    const isTopicOwner = topic.userId === userId;
    if (!isAnnotationOwner && !isTopicOwner) {
      throw new ForbiddenException(
        "Only the annotation creator or topic owner can delete this annotation",
      );
    }

    return this.reportAnnotationService.deleteAnnotation(annotationId);
  }

  async resolveAnnotation(
    userId: string,
    topicId: string,
    reportId: string,
    annotationId: string,
  ) {
    // 获取专题信息
    const topic = await this.prisma.researchTopic.findUnique({
      where: { id: topicId },
      select: { userId: true },
    });
    if (!topic) {
      throw new NotFoundException("Topic not found");
    }

    // 验证专题读取权限
    await this.verifyTopicReadAccess(userId, topicId);

    // 验证报告属于该专题
    const report = await this.reportService.getReport(reportId);
    if (!report || report.topicId !== topicId) {
      throw new NotFoundException("Report not found");
    }

    // 验证解决权限（批注创建者或专题创建者可解决）
    const annotation = await this.prisma.reportAnnotation.findUnique({
      where: { id: annotationId },
      select: { createdById: true },
    });
    if (!annotation) {
      throw new NotFoundException("Annotation not found");
    }
    const isAnnotationOwner = annotation.createdById === userId;
    const isTopicOwner = topic.userId === userId;
    if (!isAnnotationOwner && !isTopicOwner) {
      throw new ForbiddenException(
        "Only the annotation creator or topic owner can resolve this annotation",
      );
    }

    return this.reportAnnotationService.resolveAnnotation(annotationId, userId);
  }

  async resolveAllAnnotations(
    userId: string,
    topicId: string,
    reportId: string,
    annotationIds?: string[],
  ) {
    // 验证专题所有权
    await this.verifyTopicOwnership(userId, topicId);

    // 验证报告属于该专题
    const report = await this.reportService.getReport(reportId);
    if (!report || report.topicId !== topicId) {
      throw new NotFoundException("Report not found");
    }

    const count = await this.reportAnnotationService.resolveAllAnnotations(
      reportId,
      userId,
      annotationIds,
    );
    return { count };
  }

  // ==================== Helper Methods ====================

  /**
   * 验证专题所有权（仅创建者可访问，用于写入操作）
   */
  private async verifyTopicOwnership(
    userId: string,
    topicId: string,
  ): Promise<void> {
    const topic = await this.prisma.researchTopic.findUnique({
      where: { id: topicId },
      select: { userId: true },
    });

    if (!topic) {
      throw new NotFoundException(`Topic ${topicId} not found`);
    }

    if (topic.userId !== userId) {
      throw new ForbiddenException(
        "You do not have permission to access this topic",
      );
    }
  }

  /**
   * 验证专题读取权限（支持公开专题访问，用于只读操作）
   */
  private async verifyTopicReadAccess(
    userId: string,
    topicId: string,
  ): Promise<void> {
    const topic = await this.prisma.researchTopic.findUnique({
      where: { id: topicId },
      select: { userId: true },
    });

    if (!topic) {
      throw new NotFoundException(`Topic ${topicId} not found`);
    }

    // 创建者始终有权限
    if (topic.userId === userId) {
      return;
    }

    // 检查 visibility 和协作者状态
    const hasAccess = await this.checkTopicAccess(
      userId,
      topicId,
      topic.userId,
    );
    if (!hasAccess) {
      throw new ForbiddenException(
        "You do not have permission to access this topic",
      );
    }
  }

  /**
   * 检查用户是否有权访问专题
   */
  private async checkTopicAccess(
    userId: string,
    topicId: string,
    ownerId: string,
  ): Promise<boolean> {
    // 1. 创建者始终有权限
    if (userId === ownerId) {
      return true;
    }

    // 2. 检查visibility和协作者状态
    const result = await this.prisma.$queryRaw<
      { visibility: string; is_collaborator: boolean }[]
    >`
      SELECT
        rt.visibility,
        EXISTS(
          SELECT 1 FROM research_topic_collaborators tc
          WHERE tc."topic_id" = rt.id
            AND tc."user_id" = ${userId}
            AND tc."is_active" = true
        ) as is_collaborator
      FROM research_topics rt
      WHERE rt.id = ${topicId}
    `;

    if (!result.length) {
      return false;
    }

    const { visibility, is_collaborator } = result[0];

    // PUBLIC: 所有登录用户可见
    if (visibility === "PUBLIC") {
      return true;
    }

    // SHARED: 协作者可见
    if (visibility === "SHARED" && is_collaborator) {
      return true;
    }

    // PRIVATE: 只有创建者可见（已在上面检查过）
    return false;
  }
}
