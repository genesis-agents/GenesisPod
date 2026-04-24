import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import { sanitizeMarkdownContent } from "@/common/utils/sanitize-content.utils";
import { preprocessDimensionContent } from "../shared/report-template";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { RESEARCH_INTERNAL_EVENTS } from "@/modules/ai-app/topic-insights/mission/realtime/event-emitter.service";
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
} from "./api/dto";
import { AnnotationStatus, AnnotationType } from "@prisma/client";
// H6 step 6: RefreshProgressEvent was originally exported from the legacy
// team-orchestrator. That orchestrator is being deleted; the SSE progress
// stream below listens on the TOPIC_RESEARCH_PROGRESS event, which harness
// stages will emit (see ResearchEventEmitterService). Keep the wire shape
// stable for the frontend.
interface RefreshProgressEvent {
  topicId: string;
  reportId: string;
  phase:
    | "starting"
    | "researching"
    | "reviewing"
    | "synthesizing"
    | "completed"
    | "failed";
  progress: number;
  currentDimension?: string;
  completedDimensions: number;
  totalDimensions: number;
  message: string;
  error?: string;
}
import { MissionExecutionService } from "./mission/control/execution.service";
import { MissionCancellationService } from "./mission/control/cancellation.service";
// ★ Direct imports per domain (services.ts barrel 已删除)
import { ReportSynthesisService } from "./artifacts/report/core/synthesis.service";
import { EvidenceManagementService } from "./knowledge/evidence/evidence.service";
import { ReportChangeService } from "./artifacts/report/editing/change.service";
import { ReportAnnotationService } from "./artifacts/report/editing/annotation.service";
import { ResearchStrategyService } from "./artifacts/strategy/strategy.service";
import { AgentActivityService } from "./agents/activity.service";
import { CredibilityReportService } from "./artifacts/report/enhancement/credibility-report.service";
import { TopicCrudService } from "./artifacts/topic/crud.service";
import { TopicDimensionService } from "./artifacts/topic/dimension.service";
import { TopicExportService } from "./artifacts/topic/export.service";
import { TopicScheduleService } from "./artifacts/topic/schedule.service";
import { ReportQualityTraceService } from "./artifacts/report/quality/report-quality-trace.service";
import { ReportDataService } from "./artifacts/report/core/data.service";
import { LatexRepairService } from "./artifacts/report/enhancement/latex-repair.service";
import {
  ComputeUsageService,
  type ComputeUsageResult,
} from "./shared/compute-usage/compute-usage.service";
import {
  ReportContentEditingService,
  type AiEditReportDto,
  type UpdateReportContentDto,
} from "./artifacts/report/editing/content-editing.service";
import { BillingContext } from "@/modules/ai-infra/facade";
import type { ResearchDepth } from "./shared/types";

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
 * TopicInsightsService (Facade)
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
export class TopicInsightsService {
  private readonly logger = new Logger(TopicInsightsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly missionExecution: MissionExecutionService,
    private readonly cancellation: MissionCancellationService,
    private readonly reportService: ReportSynthesisService,
    private readonly evidenceService: EvidenceManagementService,
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
    private readonly qualityTraceService: ReportQualityTraceService,
    private readonly reportDataService: ReportDataService,
    private readonly latexRepairService: LatexRepairService,
    private readonly computeUsageService: ComputeUsageService,
    private readonly reportContentEditingService: ReportContentEditingService,
  ) {}

  /**
   * ★ LaTeX-only repair for already-stored reports (no content rewrite).
   * Runs `validateLatexDelimiters`; if issues found, asks LLM to add/fix
   * math delimiters while keeping all prose identical. Writes back to DB.
   */
  async repairReportLatex(userId: string, reportId: string) {
    const report = await this.prisma.topicReport.findUnique({
      where: { id: reportId },
      include: { topic: true },
    });
    if (!report || report.topic.userId !== userId) {
      throw new NotFoundException("Report not found");
    }

    const result = await this.latexRepairService.repairMarkdown(
      report.fullReport,
    );

    if (!result.changed) {
      return {
        success: true,
        changed: false,
        issuesBefore: result.before?.issues.length ?? 0,
        failureReason: result.failureReason,
      };
    }

    await this.prisma.topicReport.update({
      where: { id: reportId },
      data: { fullReport: result.repaired },
    });

    this.eventEmitter.emit("topic-insights.report.refreshed", {
      topicId: report.topic.id,
      reportId,
      refreshedAt: new Date(),
    });

    return {
      success: true,
      changed: true,
      issuesBefore: result.before?.issues.length ?? 0,
      issuesAfter: result.after?.issues.length ?? 0,
    };
  }

  /**
   * ★ Batch LaTeX repair — scan every report of every topic owned by the
   * caller, validate delimiters, repair ones with issues via LatexRepairService.
   *
   * Sequential (not parallel) to keep LLM cost under control and avoid
   * overrunning rate limits. Streams per-report result into an array so the
   * caller sees exactly which reports were touched.
   */
  async repairAllReportsLatex(
    userId: string,
    options: { dryRun?: boolean } = {},
  ) {
    const topics = await this.prisma.researchTopic.findMany({
      where: { userId },
      select: { id: true, name: true },
    });
    const reports = await this.prisma.topicReport.findMany({
      where: { topic: { userId } },
      select: {
        id: true,
        topicId: true,
        fullReport: true,
        version: true,
        generatedAt: true,
      },
      orderBy: { generatedAt: "desc" },
    });

    const results: Array<{
      reportId: string;
      topicId: string;
      topicName: string;
      version: number;
      changed: boolean;
      issuesBefore: number;
      issuesAfter?: number;
      failureReason?: string;
    }> = [];

    const topicNameById = new Map(topics.map((t) => [t.id, t.name]));

    let repaired = 0;
    let skipped = 0;
    let failed = 0;

    for (const r of reports) {
      if (!r.fullReport) {
        skipped++;
        continue;
      }
      try {
        const result = await this.latexRepairService.repairMarkdown(
          r.fullReport,
        );
        if (!result.changed) {
          if (result.before?.issues.length === 0) {
            skipped++;
            continue;
          }
          failed++;
          results.push({
            reportId: r.id,
            topicId: r.topicId,
            topicName: topicNameById.get(r.topicId) ?? "unknown",
            version: r.version,
            changed: false,
            issuesBefore: result.before?.issues.length ?? 0,
            failureReason: result.failureReason,
          });
          continue;
        }
        if (!options.dryRun) {
          await this.prisma.topicReport.update({
            where: { id: r.id },
            data: { fullReport: result.repaired },
          });
          this.eventEmitter.emit("topic-insights.report.refreshed", {
            topicId: r.topicId,
            reportId: r.id,
            refreshedAt: new Date(),
          });
        }
        repaired++;
        results.push({
          reportId: r.id,
          topicId: r.topicId,
          topicName: topicNameById.get(r.topicId) ?? "unknown",
          version: r.version,
          changed: true,
          issuesBefore: result.before?.issues.length ?? 0,
          issuesAfter: result.after?.issues.length ?? 0,
        });
      } catch (err) {
        failed++;
        this.logger.error(
          `[repairAllReportsLatex] Report ${r.id} failed: ${(err as Error).message}`,
        );
      }
    }

    return {
      totalReports: reports.length,
      repaired,
      skipped,
      failed,
      dryRun: !!options.dryRun,
      details: results,
    };
  }

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
        moduleType: "topic-insights",
        operationType: "refresh",
        referenceId: topicId,
      },
      async () => {
        // 验证专题所有权
        const topic = await this.crudService.getTopic(userId, topicId);

        // H6 step 5: route refresh through harness pipeline.
        const isIncremental = dto.type === "INCREMENTAL";
        const mission = await this.prisma.researchMission.create({
          data: {
            topicId: topic.id,
            status: "EXECUTING",
            researchDepth: (dto.researchDepth as ResearchDepth) ?? "standard",
            leaderPlan: {},
            totalTasks: 0,
            userPrompt: "",
            startedAt: new Date(),
            userContext: isIncremental ? { mode: "incremental" } : undefined,
          },
        });
        await this.missionExecution.startExecution(mission.id, topic.id);

        // harness writes/updates the latest report for this topic
        const latestReport = await this.prisma.topicReport.findFirst({
          where: { topicId: topic.id },
          orderBy: { generatedAt: "desc" },
          select: { id: true },
        });

        return {
          success: true,
          reportId: latestReport?.id ?? "",
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
        moduleType: "topic-insights",
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

        // H6 step 5: harness-driven smart refresh.
        const mission = await this.prisma.researchMission.create({
          data: {
            topicId: topic.id,
            status: "EXECUTING",
            researchDepth: "standard",
            leaderPlan: {},
            totalTasks: 0,
            userPrompt: "",
            startedAt: new Date(),
            userContext: smartOptions.incremental
              ? { mode: "incremental" }
              : undefined,
          },
        });
        await this.missionExecution.startExecution(mission.id, topic.id);

        const latestReport = await this.prisma.topicReport.findFirst({
          where: { topicId: topic.id },
          orderBy: { generatedAt: "desc" },
          select: { id: true },
        });

        return {
          success: true,
          reportId: latestReport?.id ?? "",
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

    // 通知订阅了此专题的 PPT 来源已刷新
    const topicId = report.topic.id;
    this.eventEmitter.emit("topic-insights.report.refreshed", {
      topicId,
      reportId,
      refreshedAt: new Date(),
    });

    return {
      success: true,
      report: updatedReport,
    };
  }

  /**
   * ★ 轻量级报告重新处理（不调用 LLM）
   * 只对已存储的 fullReport 重新跑最新的后处理管道
   */
  async reprocessReportFormatting(userId: string, reportId: string) {
    const report = await this.prisma.topicReport.findUnique({
      where: { id: reportId },
      include: { topic: true },
    });

    if (!report || report.topic.userId !== userId) {
      throw new NotFoundException("Report not found");
    }

    const updated = await this.reportService.reprocessExistingReport(reportId);

    this.eventEmitter.emit("topic-insights.report.refreshed", {
      topicId: report.topic.id,
      reportId,
      refreshedAt: new Date(),
    });

    return { success: true, report: updated };
  }

  /**
   * ★ v5: 获取报告质量追踪数据
   */
  async getReportQualityTrace(
    userId: string,
    topicId: string,
    reportId: string,
  ) {
    await this.verifyTopicReadAccess(userId, topicId);
    await this.verifyReportBelongsToTopic(reportId, topicId);
    return this.qualityTraceService.getQualityTrace(reportId);
  }

  /**
   * ★ v5: 获取报告质量概览
   */
  async getReportQualitySummary(
    userId: string,
    topicId: string,
    reportId: string,
  ) {
    await this.verifyTopicReadAccess(userId, topicId);
    await this.verifyReportBelongsToTopic(reportId, topicId);
    return this.qualityTraceService.getQualitySummary(reportId);
  }

  /**
   * ★ v5.1: 获取报告质量缺陷详情（按需扫描）
   */
  async getReportQualityDetails(
    userId: string,
    topicId: string,
    reportId: string,
    rule?: string,
  ) {
    await this.verifyTopicReadAccess(userId, topicId);
    await this.verifyReportBelongsToTopic(reportId, topicId);
    return this.qualityTraceService.getQualityDetails(reportId, rule);
  }

  /**
   * ★ 重新计算证据可信度评分
   */
  async recalculateEvidenceCredibility(
    userId: string,
    topicId: string,
    reportId: string,
  ) {
    await this.verifyTopicReadAccess(userId, topicId);
    await this.verifyReportBelongsToTopic(reportId, topicId);
    return this.evidenceService.recalculateCredibilityScores(reportId);
  }

  /**
   * 获取刷新状态
   */
  async getRefreshStatus(userId: string, topicId: string) {
    // 验证专题读取权限（支持公开专题访问）
    await this.verifyTopicReadAccess(userId, topicId);

    // H6 step 6: harness-based "is refreshing" = "does the topic have an
    // EXECUTING mission right now". Refresh history comes from TopicRefreshLog
    // unchanged.
    const activeMission = await this.prisma.researchMission.findFirst({
      where: { topicId, status: "EXECUTING" },
      select: { id: true, startedAt: true },
      orderBy: { startedAt: "desc" },
    });

    const latestLog = await this.prisma.topicRefreshLog.findFirst({
      where: { topicId },
      orderBy: { startedAt: "desc" },
    });

    return {
      isRunning: Boolean(activeMission),
      startedAt: activeMission?.startedAt ?? null,
      latestLog,
    };
  }

  /**
   * 监听刷新进度 (SSE)
   * ★ 修复内存泄漏：添加超时自动清理机制
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

    // ★ 清理函数
    const cleanup = () => {
      this.eventEmitter.off(
        RESEARCH_INTERNAL_EVENTS.TOPIC_RESEARCH_PROGRESS,
        listener,
      );
    };

    this.eventEmitter.on(
      RESEARCH_INTERNAL_EVENTS.TOPIC_RESEARCH_PROGRESS,
      listener,
    );

    // 当客户端断开连接时清理
    subject.subscribe({
      complete: cleanup,
      error: cleanup,
    });

    // ★ 修复内存泄漏：45分钟超时自动清理（防止客户端异常断开未触发 complete）
    // 注意：报告综合（synthesis）可能需要 7-15 分钟，必须大于此值
    const SSE_TIMEOUT_MS = 45 * 60 * 1000;
    const timeoutId = setTimeout(() => {
      cleanup();
      subject.complete();
    }, SSE_TIMEOUT_MS);

    // 正常完成时清除超时定时器
    subject.subscribe({
      complete: () => clearTimeout(timeoutId),
      error: () => clearTimeout(timeoutId),
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

    // H6 step 6: harness cancel — find the active mission and abort via
    // MissionCancellationService (H1 primitive).
    const activeMission = await this.prisma.researchMission.findFirst({
      where: { topicId, status: "EXECUTING" },
      select: { id: true },
      orderBy: { startedAt: "desc" },
    });
    const cancelled = activeMission
      ? this.cancellation.cancel(activeMission.id, {
          reason: "user requested cancel refresh",
          requestedBy: userId,
          requestedAt: new Date(),
        })
      : false;

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
    await this.verifyTopicOwnership(userId, topicId);

    const report = await this.reportService.getReport(reportId);
    if (!report || report.topicId !== topicId) {
      throw new NotFoundException("Report not found");
    }

    await this.reportDataService.deleteReportCascade(reportId);

    this.logger.log(
      `[deleteReport] Report ${reportId} deleted by user ${userId}`,
    );
    return { success: true, message: "Report deleted successfully" };
  }

  /**
   * 转换报告数据以适配前端接口
   * ★ 同时清理AI生成内容中的HTML标签和Markdown格式问题
   */
  private transformReportForFrontend(report: Record<string, unknown> | null) {
    if (!report) return report;

    // ★ 清理报告级别的内容字段（HTML标签 + 下划线等格式问题）
    if (report.executiveSummary) {
      report.executiveSummary = sanitizeMarkdownContent(
        cleanHtmlTagsFromContent(report.executiveSummary as string) || "",
      );
    }
    if (report.fullReport) {
      report.fullReport = sanitizeMarkdownContent(
        cleanHtmlTagsFromContent(report.fullReport as string) || "",
      );
    }

    // 转换维度分析数据
    if (report.dimensionAnalyses) {
      // ★ 辅助函数：清理HTML + 下划线等格式问题
      const cleanAndSanitize = (content: string | undefined | null): string => {
        if (!content) return "";
        return sanitizeMarkdownContent(cleanHtmlTagsFromContent(content) || "");
      };

      interface DataPointsShape {
        trends?: Record<string, unknown>[];
        challenges?: Record<string, unknown>[];
        opportunities?: Record<string, unknown>[];
        confidenceLevel?: string;
        detailedContent?: string;
      }

      interface KeyFindingShape {
        finding?: string;
        implication?: string;
        [key: string]: unknown;
      }

      interface AnalysisShape {
        analysis?: string;
        summary?: string;
        dataPoints?: DataPointsShape | null;
        keyFindings?: KeyFindingShape[];
        [key: string]: unknown;
      }

      report.dimensionAnalyses = (
        report.dimensionAnalyses as AnalysisShape[]
      ).map((analysis: AnalysisShape) => {
        const dataPoints = analysis.dataPoints as DataPointsShape | null;

        // ★ 清理维度分析中的文本内容（HTML标签 + 下划线等格式问题）
        const cleanedAnalysis = cleanAndSanitize(analysis.analysis);
        const cleanedSummary = cleanAndSanitize(analysis.summary);
        const cleanedDetailedContent = cleanAndSanitize(
          dataPoints?.detailedContent,
        );

        // ★ 清理 keyFindings 中的文本
        const cleanedKeyFindings =
          analysis.keyFindings?.map((kf: KeyFindingShape) => ({
            ...kf,
            finding: cleanAndSanitize(kf.finding),
            implication: cleanAndSanitize(kf.implication),
          })) || [];

        // ★ 清理趋势、挑战、机会中的文本
        const cleanedTrends = (dataPoints?.trends || []).map(
          (t: Record<string, unknown>) => ({
            ...t,
            trend: cleanAndSanitize(t.trend as string),
            drivers: cleanAndSanitize(t.drivers as string),
            prediction: cleanAndSanitize(t.prediction as string),
          }),
        );

        const cleanedChallenges = (dataPoints?.challenges || []).map(
          (c: Record<string, unknown>) => ({
            ...c,
            challenge: cleanAndSanitize(c.challenge as string),
            rootCause: cleanAndSanitize(c.rootCause as string),
            impact: cleanAndSanitize(c.impact as string),
            potentialSolutions: cleanAndSanitize(
              c.potentialSolutions as string,
            ),
          }),
        );

        const cleanedOpportunities = (dataPoints?.opportunities || []).map(
          (o: Record<string, unknown>) => ({
            ...o,
            opportunity: cleanAndSanitize(o.opportunity as string),
            potential: cleanAndSanitize(o.potential as string),
            requirements: cleanAndSanitize(o.requirements as string),
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
          // ★ Apply preprocessing pipeline for historical data that was stored
          // before the save-time preprocessing was added (Root Cause 1 fix).
          // All transforms are idempotent so double-processing is safe.
          detailedContent: cleanedDetailedContent
            ? preprocessDimensionContent(cleanedDetailedContent)
            : cleanedDetailedContent,
        };
      });
    }

    return report;
  }

  // ==================== Report Editing (delegated to ReportContentEditingService) ====================

  async updateReportContent(
    userId: string,
    topicId: string,
    reportId: string,
    dto: UpdateReportContentDto,
  ) {
    return this.reportContentEditingService.updateReportContent(
      userId,
      topicId,
      reportId,
      dto,
    );
  }

  async aiEditReport(
    userId: string,
    topicId: string,
    reportId: string,
    dto: AiEditReportDto,
  ) {
    return this.reportContentEditingService.aiEditReport(
      userId,
      topicId,
      reportId,
      dto,
    );
  }

  async getReportRevisions(userId: string, topicId: string, reportId: string) {
    return this.reportContentEditingService.getReportRevisions(
      userId,
      topicId,
      reportId,
    );
  }

  async rollbackReport(
    userId: string,
    topicId: string,
    reportId: string,
    revisionNumber: number,
  ) {
    return this.reportContentEditingService.rollbackReport(
      userId,
      topicId,
      reportId,
      revisionNumber,
    );
  }

  async compareReports(
    userId: string,
    topicId: string,
    dto: CompareReportsDto,
  ) {
    return this.reportContentEditingService.compareReports(
      userId,
      topicId,
      dto,
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

    return this.reportAnnotationService.getAnnotations(
      reportId,
      status as AnnotationStatus | undefined,
    );
  }

  async createAnnotation(
    userId: string,
    topicId: string,
    reportId: string,
    dto: {
      content: string;
      type: AnnotationType;
      selectedText?: string;
      startOffset: number;
      endOffset: number;
      selectorPrefix?: string;
      selectorSuffix?: string;
      color?: string;
    },
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
    dto: { content?: string; status?: AnnotationStatus },
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
   * 验证报告属于指定专题
   */
  private async verifyReportBelongsToTopic(
    reportId: string,
    topicId: string,
  ): Promise<void> {
    const report = await this.prisma.topicReport.findUnique({
      where: { id: reportId },
      select: { topicId: true },
    });

    if (!report || report.topicId !== topicId) {
      throw new NotFoundException("Report not found");
    }
  }

  // ==================== Compute Usage ====================

  /**
   * 获取专题算力消耗数据 — 委托到 ComputeUsageService
   */
  async getComputeUsage(
    userId: string,
    topicId: string,
    missionId?: string,
  ): Promise<ComputeUsageResult> {
    return this.computeUsageService.getComputeUsage(userId, topicId, missionId);
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
