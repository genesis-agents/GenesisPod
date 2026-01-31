import { Injectable, Logger } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { PrismaService } from "@/common/prisma/prisma.service";
import {
  DimensionStatus,
  RefreshLogStatus,
  ResearchTopicStatus,
} from "@prisma/client";
import type {
  ResearchTopic,
  TopicDimension,
  TopicReport,
} from "@prisma/client";
import { DimensionMissionService } from "./dimension-mission.service";
import { ReportSynthesisService } from "./report-synthesis.service";
import {
  ResearchReviewerService,
  type OverallReviewResult,
  ReviewQualityLevel,
} from "./research-reviewer.service";
import {
  ResearchLeaderService,
  type AgentAssignment,
} from "./research-leader.service";
import type { DimensionAnalysisResult } from "../types/research.types";

/**
 * Refresh Progress Event
 */
export interface RefreshProgressEvent {
  topicId: string;
  reportId: string;
  phase:
    | "starting"
    | "researching"
    | "reviewing"
    | "synthesizing"
    | "completed"
    | "failed";
  progress: number; // 0-100
  currentDimension?: string;
  completedDimensions: number;
  totalDimensions: number;
  message: string;
  error?: string;
}

/**
 * Refresh Options
 */
export interface RefreshOptions {
  /** 是否强制刷新所有维度 */
  forceRefresh?: boolean;
  /** 仅刷新指定维度 */
  dimensionIds?: string[];
  /** 是否增量刷新 */
  incremental?: boolean;
}

/**
 * Topic Team Orchestrator Service
 *
 * 协调主题研究的整个流程：
 * 1. 并行执行所有维度的研究
 * 2. 汇总研究结果
 * 3. 生成最终报告
 * 4. 发送进度事件
 */
@Injectable()
export class TopicTeamOrchestratorService {
  private readonly logger = new Logger(TopicTeamOrchestratorService.name);

  // 存储活跃的刷新任务
  private activeRefreshes = new Map<
    string,
    {
      abortController: AbortController;
      startedAt: Date;
    }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly dimensionMissionService: DimensionMissionService,
    private readonly reportSynthesisService: ReportSynthesisService,
    private readonly researchReviewerService: ResearchReviewerService,
    private readonly researchLeaderService: ResearchLeaderService,
  ) {}

  /**
   * 执行完整的主题刷新
   */
  async executeRefresh(
    topic: ResearchTopic,
    options: RefreshOptions = {},
  ): Promise<TopicReport> {
    const topicId = topic.id;
    this.logger.log(`Starting refresh for topic: ${topic.name} (${topicId})`);

    // 检查是否有活跃的刷新任务
    if (this.activeRefreshes.has(topicId)) {
      throw new Error(`Refresh already in progress for topic ${topicId}`);
    }

    // 创建 AbortController
    const abortController = new AbortController();
    this.activeRefreshes.set(topicId, {
      abortController,
      startedAt: new Date(),
    });

    // 创建刷新日志
    const refreshLog = await this.prisma.topicRefreshLog.create({
      data: {
        topicId,
        triggerType: "manual",
        status: RefreshLogStatus.RUNNING,
      },
    });

    try {
      // 1. 创建草稿报告
      const report =
        await this.reportSynthesisService.createDraftReport(topicId);

      // 发送开始事件
      this.emitProgress({
        topicId,
        reportId: report.id,
        phase: "starting",
        progress: 0,
        completedDimensions: 0,
        totalDimensions: 0,
        message: "正在初始化研究...",
      });

      // 2. 获取要研究的维度
      let dimensions = await this.getDimensionsToResearch(topicId, options);
      // ★ 保存 Leader 的 Agent 分配信息（包含工具和技能）
      let agentAssignments: AgentAssignment[] = [];

      // ★ v8.0: 如果没有维度，由 Leader AI 动态规划
      if (dimensions.length === 0) {
        this.logger.log(
          `[executeRefresh] No dimensions found, invoking Leader AI to plan dimensions for topic: ${topic.name}`,
        );

        this.emitProgress({
          topicId,
          reportId: report.id,
          phase: "starting",
          progress: 2,
          completedDimensions: 0,
          totalDimensions: 0,
          message: "Leader AI 正在根据主题智能规划研究维度...",
        });

        // 调用 Leader 规划
        const leaderPlan =
          await this.researchLeaderService.planResearch(topicId);

        if (!leaderPlan.dimensions || leaderPlan.dimensions.length === 0) {
          throw new Error("Leader AI failed to plan dimensions");
        }

        this.logger.log(
          `[executeRefresh] Leader planned ${leaderPlan.dimensions.length} dimensions: ${leaderPlan.dimensions.map((d) => d.name).join(", ")}`,
        );

        // ★ 保存 Agent 分配信息（用于后续传递工具和技能）
        agentAssignments = leaderPlan.agentAssignments || [];
        if (agentAssignments.length > 0) {
          this.logger.log(
            `[executeRefresh] Leader assigned ${agentAssignments.length} agents with tools: ${agentAssignments.map((a) => `${a.agentId}:[${(a.tools || []).join(",")}]`).join("; ")}`,
          );
        }

        // 将规划的维度保存到数据库
        const createdDimensions = await Promise.all(
          leaderPlan.dimensions.map((dim, index) =>
            this.prisma.topicDimension.create({
              data: {
                topicId,
                name: dim.name,
                description: dim.description,
                sortOrder: dim.priority ?? index + 1,
                searchQueries: dim.searchQueries || [],
                searchSources: dim.dataSources || [],
                minSources: 5,
                isEnabled: true,
                status: DimensionStatus.PENDING,
              },
            }),
          ),
        );

        dimensions = createdDimensions;
        this.logger.log(
          `[executeRefresh] Created ${dimensions.length} dimensions from Leader plan`,
        );
      }

      // 发送研究开始事件
      this.emitProgress({
        topicId,
        reportId: report.id,
        phase: "researching",
        progress: 5,
        completedDimensions: 0,
        totalDimensions: dimensions.length,
        message: `开始研究 ${dimensions.length} 个维度...`,
      });

      // 3. 并行执行维度研究（传递 Agent 分配信息以使用正确的工具和技能）
      const analysisResults = await this.researchDimensionsInParallel(
        topic,
        dimensions,
        report.id,
        abortController.signal,
        agentAssignments,
      );

      // 检查是否被取消
      if (abortController.signal.aborted) {
        throw new Error("Refresh cancelled");
      }

      // 4. 保存分析结果
      for (const result of analysisResults) {
        if (result.status === "fulfilled") {
          const { dimensionId, analysisResult, evidenceIds } = result.value;

          // 保存维度分析
          const analysis =
            await this.reportSynthesisService.saveDimensionAnalysis(
              report.id,
              dimensionId,
              analysisResult,
            );

          // 关联证据
          if (evidenceIds.length > 0) {
            await this.reportSynthesisService.linkEvidenceToReport(
              report.id,
              analysis.id,
              evidenceIds,
            );
          }
        }
      }

      // 5. 质量审核阶段
      this.emitProgress({
        topicId,
        reportId: report.id,
        phase: "reviewing",
        progress: 70,
        completedDimensions: dimensions.length,
        totalDimensions: dimensions.length,
        message: "质量审核员正在审核研究质量...",
      });

      // 执行质量审核
      const reviewResult = await this.reviewResearchQuality(
        topic,
        dimensions,
        analysisResults,
      );

      // 记录审核结果
      this.logger.log(
        `Review completed: ${reviewResult.qualityLevel} (${reviewResult.overallScore.toFixed(1)}/100)`,
      );

      // 检查是否需要重新研究（质量不达标）
      if (
        reviewResult.qualityLevel === ReviewQualityLevel.REJECTED ||
        reviewResult.qualityLevel === ReviewQualityLevel.NEEDS_REVISION
      ) {
        this.logger.warn(
          `Research quality below threshold: ${reviewResult.qualityLevel}. ` +
            `Recommendations: ${reviewResult.recommendations.join("; ")}`,
        );
        // 目前仅记录警告，不中断流程；未来可以在这里触发重新研究
      }

      // 发送合成开始事件
      this.emitProgress({
        topicId,
        reportId: report.id,
        phase: "synthesizing",
        progress: 85,
        completedDimensions: dimensions.length,
        totalDimensions: dimensions.length,
        message: "正在合成最终报告...",
      });

      // 6. 合成最终报告
      const finalReport = await this.reportSynthesisService.synthesizeReport(
        topic,
        report.id,
      );

      // 6. 更新专题状态和统计数据
      await this.prisma.researchTopic.update({
        where: { id: topicId },
        data: {
          status: ResearchTopicStatus.ACTIVE,
          lastRefreshAt: new Date(),
          totalReports: { increment: 1 },
          totalSources: finalReport.totalSources || 0,
        },
      });

      // 7. 更新刷新日志
      await this.prisma.topicRefreshLog.update({
        where: { id: refreshLog.id },
        data: {
          status: RefreshLogStatus.COMPLETED,
          completedAt: new Date(),
          reportId: finalReport.id,
          dimensionsRefreshed: dimensions.length,
          sourcesFound: finalReport.totalSources,
        },
      });

      // 发送完成事件
      this.emitProgress({
        topicId,
        reportId: finalReport.id,
        phase: "completed",
        progress: 100,
        completedDimensions: dimensions.length,
        totalDimensions: dimensions.length,
        message: "研究完成！",
      });

      this.logger.log(`Completed refresh for topic: ${topic.name}`);

      return finalReport;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // 更新刷新日志为失败
      await this.prisma.topicRefreshLog.update({
        where: { id: refreshLog.id },
        data: {
          status: RefreshLogStatus.FAILED,
          completedAt: new Date(),
          error: errorMessage,
        },
      });

      // 发送失败事件
      this.emitProgress({
        topicId,
        reportId: "",
        phase: "failed",
        progress: 0,
        completedDimensions: 0,
        totalDimensions: 0,
        message: "研究失败",
        error: errorMessage,
      });

      this.logger.error(`Failed refresh for topic: ${topic.name}`, error);
      throw error;
    } finally {
      // 清理活跃刷新
      this.activeRefreshes.delete(topicId);
    }
  }

  /**
   * 取消刷新
   */
  async cancelRefresh(topicId: string): Promise<boolean> {
    const activeRefresh = this.activeRefreshes.get(topicId);

    if (!activeRefresh) {
      return false;
    }

    activeRefresh.abortController.abort();
    this.activeRefreshes.delete(topicId);

    // 更新最新的刷新日志
    await this.prisma.topicRefreshLog.updateMany({
      where: {
        topicId,
        status: RefreshLogStatus.RUNNING,
      },
      data: {
        status: RefreshLogStatus.CANCELLED,
        completedAt: new Date(),
        error: "Cancelled by user",
      },
    });

    this.logger.log(`Cancelled refresh for topic ${topicId}`);
    return true;
  }

  /**
   * 获取刷新状态
   */
  getRefreshStatus(topicId: string): {
    isRunning: boolean;
    startedAt?: Date;
  } {
    const activeRefresh = this.activeRefreshes.get(topicId);

    return {
      isRunning: !!activeRefresh,
      startedAt: activeRefresh?.startedAt,
    };
  }

  /**
   * 获取要研究的维度
   */
  private async getDimensionsToResearch(
    topicId: string,
    options: RefreshOptions,
  ): Promise<TopicDimension[]> {
    const where: any = {
      topicId,
      isEnabled: true,
    };

    // 如果指定了特定维度
    if (options.dimensionIds?.length) {
      where.id = { in: options.dimensionIds };
    }

    // 如果不是强制刷新，跳过最近已完成的维度
    if (!options.forceRefresh && options.incremental) {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      where.OR = [
        { status: { not: DimensionStatus.COMPLETED } },
        { lastResearchedAt: { lt: oneDayAgo } },
        { lastResearchedAt: null },
      ];
    }

    return this.prisma.topicDimension.findMany({
      where,
      orderBy: { sortOrder: "asc" },
    });
  }

  /**
   * 并行执行维度研究（三阶段架构）
   * Phase 1: 并行搜索 - 所有维度同时搜索
   * Phase 2: 全局大纲 - Leader 看到所有证据后协调规划
   * Phase 3: 并行写作 - 各维度基于全局大纲写作
   *
   * @param agentAssignments Leader 分配的 Agent 信息（包含工具和技能）
   */
  private async researchDimensionsInParallel(
    topic: ResearchTopic,
    dimensions: TopicDimension[],
    reportId: string,
    signal: AbortSignal,
    agentAssignments: AgentAssignment[] = [],
  ): Promise<
    PromiseSettledResult<{
      dimensionId: string;
      analysisResult: DimensionAnalysisResult;
      evidenceIds: string[];
    }>[]
  > {
    const totalCount = dimensions.length;

    // ============ Phase 1: 并行搜索 ============
    this.logger.log(
      `[researchDimensionsInParallel] Phase 1: Starting parallel search for ${totalCount} dimensions`,
    );

    this.emitProgress({
      topicId: topic.id,
      reportId,
      phase: "researching",
      progress: 5,
      completedDimensions: 0,
      totalDimensions: totalCount,
      message: "Phase 1: 所有维度并行搜索中...",
    });

    const searchPromises = dimensions.map(async (dimension) => {
      if (signal.aborted) {
        throw new Error("Refresh cancelled");
      }

      const assignment = agentAssignments.find(
        (a) =>
          a.assignedDimensions?.includes(dimension.id) ||
          a.assignedDimensions?.includes(dimension.name),
      );

      let assignedTools = assignment?.tools || [];
      if (assignedTools.length === 0 && dimension.searchSources) {
        const sources = dimension.searchSources as string[];
        if (Array.isArray(sources) && sources.length > 0) {
          assignedTools = sources;
        }
      }
      const assignedSkills = assignment?.skills || [];
      const modelId = assignment?.modelId;

      try {
        const searchResult =
          await this.dimensionMissionService.executeSearchPhase(
            topic,
            dimension,
            undefined, // missionId
            modelId,
            undefined, // taskId
            assignedTools,
            assignedSkills,
          );

        return { dimension, assignment, searchResult };
      } catch (error) {
        this.logger.error(
          `[Phase 1] Failed to search dimension: ${dimension.name}`,
          error,
        );
        throw error;
      }
    });

    const searchResults = await Promise.allSettled(searchPromises);
    const successfulSearches = searchResults.filter(
      (r) => r.status === "fulfilled",
    ) as PromiseFulfilledResult<{
      dimension: TopicDimension;
      assignment: AgentAssignment | undefined;
      searchResult: import("./dimension-mission.service").SearchPhaseResult;
    }>[];

    // Mark failed Phase 1 dimensions as FAILED
    for (let i = 0; i < searchResults.length; i++) {
      if (searchResults[i].status === "rejected") {
        const dim = dimensions[i];
        try {
          await this.prisma.topicDimension.update({
            where: { id: dim.id },
            data: { status: "FAILED" },
          });
        } catch {
          // non-fatal
        }
      }
    }

    if (successfulSearches.length === 0) {
      throw new Error("All dimension searches failed");
    }

    this.logger.log(
      `[Phase 1] Search completed: ${successfulSearches.length}/${totalCount} dimensions`,
    );

    this.emitProgress({
      topicId: topic.id,
      reportId,
      phase: "researching",
      progress: 30,
      completedDimensions: 0,
      totalDimensions: totalCount,
      message: "Phase 1 完成，准备全局协调...",
    });

    // ============ Phase 2: 全局大纲规划 ============
    this.logger.log(
      `[researchDimensionsInParallel] Phase 2: Planning global outline`,
    );

    this.emitProgress({
      topicId: topic.id,
      reportId,
      phase: "researching",
      progress: 35,
      completedDimensions: 0,
      totalDimensions: totalCount,
      message: "Phase 2: Leader 正在分析所有证据并协调大纲（预计 1-2 分钟）...",
    });

    let globalOutline:
      | import("./research-leader.service").GlobalOutline
      | null = null;

    try {
      const dimensionSearchSummaries = successfulSearches.map((s) => ({
        dimensionId: s.value.dimension.id,
        dimensionName: s.value.dimension.name,
        dimensionDescription: s.value.dimension.description,
        evidenceSummary: s.value.searchResult.evidenceSummary,
        figuresSummary: s.value.searchResult.figuresSummary,
        searchQueries: s.value.dimension.searchQueries,
      }));

      globalOutline = await this.researchLeaderService.planGlobalOutline(
        {
          name: topic.name,
          type: topic.type,
          description: topic.description,
        },
        dimensionSearchSummaries,
      );

      this.logger.log(
        `[Phase 2] Global outline planned for ${globalOutline.dimensions.length} dimensions`,
      );
    } catch (error) {
      this.logger.error(
        `[Phase 2] Global outline planning failed, falling back to per-dimension planning: ${error}`,
        error,
      );
      // Fallback: continue without global coordination
    }

    this.emitProgress({
      topicId: topic.id,
      reportId,
      phase: "researching",
      progress: 40,
      completedDimensions: 0,
      totalDimensions: totalCount,
      message: "Phase 2 完成，开始并行写作...",
    });

    // ============ Phase 3: 并行写作 ============
    this.logger.log(
      `[researchDimensionsInParallel] Phase 3: Starting parallel writing for ${successfulSearches.length} dimensions`,
    );

    let completedCount = 0;

    const writingPromises = successfulSearches.map(async (searchSuccess) => {
      const { dimension, assignment, searchResult } = searchSuccess.value;

      if (signal.aborted) {
        throw new Error("Refresh cancelled");
      }

      try {
        // 查找该维度的全局协调大纲
        let outline:
          | import("./research-leader.service").DimensionOutline
          | null = null;
        if (globalOutline) {
          const coordinated = globalOutline.dimensions.find(
            (d) =>
              d.dimensionId === dimension.id ||
              d.dimensionName === dimension.name,
          );
          if (coordinated) {
            outline = coordinated.outline;
            this.logger.log(
              `[Phase 3] Using global coordinated outline for dimension: ${dimension.name}`,
            );
          }
        }

        // Fallback: 如果全局规划失败，本地规划
        if (!outline) {
          this.logger.log(
            `[Phase 3] Falling back to local outline planning for dimension: ${dimension.name}`,
          );
          const allDimensions = dimensions.map((d) => ({
            name: d.name,
            description: d.description,
          }));
          outline = await this.researchLeaderService.planDimensionOutline(
            {
              name: topic.name,
              type: topic.type,
              description: topic.description,
            },
            {
              name: dimension.name,
              description: dimension.description,
              searchQueries: dimension.searchQueries,
            },
            searchResult.evidenceSummary,
            searchResult.figuresSummary || undefined,
            allDimensions,
          );
        }

        const missionResult =
          await this.dimensionMissionService.executeWritingPhase(
            topic,
            dimension,
            searchResult,
            outline,
            reportId,
            undefined, // missionId
            assignment?.modelId,
            undefined, // taskId
            assignment?.tools,
            assignment?.skills,
          );

        if (!missionResult.success) {
          throw new Error(missionResult.error || "Dimension writing failed");
        }

        completedCount++;

        const progress = 40 + Math.round((completedCount / totalCount) * 40);
        this.emitProgress({
          topicId: topic.id,
          reportId,
          phase: "researching",
          progress,
          currentDimension: dimension.name,
          completedDimensions: completedCount,
          totalDimensions: totalCount,
          message: `已完成 ${dimension.name} (${completedCount}/${totalCount})`,
        });

        return {
          dimensionId: dimension.id,
          analysisResult: missionResult.analysisResult!,
          evidenceIds: missionResult.evidenceIds,
        };
      } catch (error) {
        this.logger.error(
          `[Phase 3] Failed to write dimension: ${dimension.name}`,
          error,
        );
        // Mark failed dimension as FAILED
        try {
          await this.prisma.topicDimension.update({
            where: { id: dimension.id },
            data: { status: "FAILED" },
          });
        } catch {
          // non-fatal
        }
        throw error;
      }
    });

    return Promise.allSettled(writingPromises);
  }

  /**
   * 发送进度事件
   */
  private emitProgress(event: RefreshProgressEvent): void {
    this.eventEmitter.emit("topic-research.progress", event);
  }

  /**
   * 刷新单个维度
   */
  async refreshSingleDimension(
    topic: ResearchTopic,
    dimensionId: string,
  ): Promise<DimensionAnalysisResult> {
    const dimension = await this.prisma.topicDimension.findUnique({
      where: { id: dimensionId },
    });

    if (!dimension || dimension.topicId !== topic.id) {
      throw new Error("Dimension not found or does not belong to topic");
    }

    const missionResult =
      await this.dimensionMissionService.executeDimensionMission(
        topic,
        dimension,
      );

    if (!missionResult.success || !missionResult.analysisResult) {
      throw new Error(missionResult.error || "Dimension mission failed");
    }

    return missionResult.analysisResult;
  }

  /**
   * 执行研究质量审核
   */
  private async reviewResearchQuality(
    topic: ResearchTopic,
    dimensions: TopicDimension[],
    analysisResults: PromiseSettledResult<{
      dimensionId: string;
      analysisResult: DimensionAnalysisResult;
      evidenceIds: string[];
    }>[],
  ): Promise<OverallReviewResult> {
    // 收集成功的分析结果
    const successfulAnalyses: Array<{
      dimension: TopicDimension;
      analysis: DimensionAnalysisResult;
      evidenceCount: number;
    }> = [];

    for (const result of analysisResults) {
      if (result.status === "fulfilled") {
        const dimension = dimensions.find(
          (d) => d.id === result.value.dimensionId,
        );
        if (dimension) {
          successfulAnalyses.push({
            dimension,
            analysis: result.value.analysisResult,
            evidenceCount: result.value.evidenceIds.length,
          });
        }
      }
    }

    // 对每个维度进行审核
    const dimensionReviews = await Promise.all(
      successfulAnalyses.map(async ({ dimension, analysis, evidenceCount }) => {
        return this.researchReviewerService.reviewDimension(
          topic,
          dimension,
          analysis,
          evidenceCount,
        );
      }),
    );

    // 执行整体审核
    const overallReview = await this.researchReviewerService.reviewOverall(
      topic,
      dimensions,
      dimensionReviews,
    );

    return overallReview;
  }
}
