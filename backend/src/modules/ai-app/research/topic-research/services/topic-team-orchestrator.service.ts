import { Injectable, Logger, Inject, forwardRef } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { PrismaService } from "@/common/prisma/prisma.service";
import {
  DimensionStatus,
  RefreshLogStatus,
  ResearchMissionStatus,
  ResearchTopicStatus,
  ResearchTodoStatus,
  ResearchTodoType,
} from "@prisma/client";
import type {
  ResearchTopic,
  TopicDimension,
  TopicReport,
} from "@prisma/client";
import { DimensionMissionService } from "./dimension-mission.service";
import { DataSourceRouterService } from "./data-source-router.service";
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
import { ResearchCheckpointService } from "./research-checkpoint.service";
import { ResearchTodoService } from "./research-todo.service";
import type { DimensionAnalysisResult } from "../types/research.types";
import {
  type ResearchDepth,
  type ResearchDepthConfig,
  type ResearchDesign,
  resolveResearchDepthConfig,
} from "../types/v5-research.types";
import { buildValidationContextForWriting } from "../prompts/v5-research.prompt";

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
  /** V5: 研究深度 */
  researchDepth?: ResearchDepth;
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
    private readonly researchCheckpointService: ResearchCheckpointService,
    private readonly dataSourceRouterService: DataSourceRouterService,
    @Inject(forwardRef(() => ResearchTodoService))
    private readonly researchTodoService: ResearchTodoService,
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

      // V5: Resolve research depth config
      const researchDepth: ResearchDepth = options.researchDepth || "standard";
      const depthConfig = resolveResearchDepthConfig(researchDepth);
      this.logger.log(
        `[executeRefresh] V5 depth: ${researchDepth} (cognitiveLoops=${depthConfig.maxCognitiveLoops}, revisions=${depthConfig.maxRevisionRounds})`,
      );

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

      // ★ 创建 Mission 和 TODOs 供前端展示任务列表
      const todoMap: Record<string, string> = {}; // dimensionId -> todoId
      let missionId: string | undefined;
      let reportTodoId: string | undefined;
      let reviewTodoId: string | undefined;
      try {
        const mission = await this.prisma.researchMission.create({
          data: {
            topicId,
            status: ResearchMissionStatus.EXECUTING,
            researchDepth: options.researchDepth || "standard",
            totalTasks: dimensions.length + 2, // dimensions + report + review
          },
        });
        missionId = mission.id;

        // Leader 规划 TODO（已完成）
        const leaderTodo = await this.researchTodoService.createTodo({
          topicId,
          missionId: mission.id,
          type: ResearchTodoType.LEADER_PLANNING,
          title: "Leader 任务理解与规划",
          description: "Leader 分析研究主题，制定研究策略和任务分配",
          agentId: "leader",
          agentName: "研究协调员",
          agentRole: "leader",
          priority: 1000,
          userCanPause: false,
          userCanCancel: false,
        });
        await this.researchTodoService.completeTodo(leaderTodo.id);

        // 每个维度的研究 TODO
        for (const dim of dimensions) {
          const todo = await this.researchTodoService.createTodo({
            topicId,
            missionId: mission.id,
            type: ResearchTodoType.DIMENSION_RESEARCH,
            title: `研究维度：${dim.name}`,
            description: dim.description || `深度研究 ${dim.name} 维度`,
            dimensionId: dim.id,
            dimensionName: dim.name,
            agentId: `researcher-${dim.id}`,
            agentName: "研究员",
            agentRole: "researcher",
            priority: 500,
          });
          todoMap[dim.id] = todo.id;
          await this.researchTodoService.updateTodoStatus(
            todo.id,
            ResearchTodoStatus.IN_PROGRESS,
            "研究中...",
          );
        }

        // 报告撰写 TODO
        const rTodo = await this.researchTodoService.createTodo({
          topicId,
          missionId: mission.id,
          type: ResearchTodoType.REPORT_WRITING,
          title: "合成研究报告",
          description: "整合所有维度分析，生成最终研究报告",
          agentId: "synthesizer",
          agentName: "报告合成师",
          agentRole: "synthesizer",
          priority: 200,
          dependsOn: Object.values(todoMap),
        });
        reportTodoId = rTodo.id;

        // 质量审核 TODO
        const qTodo = await this.researchTodoService.createTodo({
          topicId,
          missionId: mission.id,
          type: ResearchTodoType.QUALITY_REVIEW,
          title: "质量审核",
          description: "审核研究质量，验证关键发现的可信度",
          agentId: "reviewer",
          agentName: "质量审核员",
          agentRole: "reviewer",
          priority: 100,
          dependsOn: [rTodo.id],
        });
        reviewTodoId = qTodo.id;

        this.logger.log(
          `[executeRefresh] Created mission ${mission.id} with ${Object.keys(todoMap).length + 3} todos`,
        );
      } catch (todoError) {
        this.logger.warn(
          `[executeRefresh] Failed to create todos (non-fatal): ${todoError}`,
        );
      }

      // V5: Research design extracted from global outline (populated after Phase 2)
      let researchDesign: ResearchDesign | undefined;
      // V5: Validation context built from cognitive loop (used for future iterative rewriting)
      let validationContext = "";

      // V5: Literature baseline scan (standard/thorough only)
      if (depthConfig.knowledgeIterations >= 2) {
        this.logger.log(
          `[V5] Running literature baseline scan for ${dimensions.length} dimensions`,
        );
        try {
          await Promise.all(
            dimensions
              .slice(0, 3)
              .map((dim) =>
                this.dataSourceRouterService.scanLiteratureBaseline(topic, dim),
              ),
          );
          this.logger.log(`[V5] Literature baseline scan complete`);
        } catch (error) {
          this.logger.warn(
            `[V5] Literature baseline scan failed (non-fatal): ${error}`,
          );
        }
      }

      // 3. 并行执行维度研究（传递 Agent 分配信息以使用正确的工具和技能）
      const { results: analysisResults, researchDesign: extractedDesign } =
        await this.researchDimensionsInParallel(
          topic,
          dimensions,
          report.id,
          abortController.signal,
          agentAssignments,
          depthConfig,
        );
      researchDesign = extractedDesign;

      // V5: Checkpoint after Phase 2 (global outline + research design)
      try {
        await this.researchCheckpointService.saveCheckpoint(
          topic.id, // Use topicId as a proxy since we don't have missionId here
          { phase: "L2_knowledge", researchDesign, depthConfig },
        );
      } catch {
        // non-fatal
      }

      // V5: Hypothesis-driven queries (if hypotheses available and standard/thorough)
      if (
        researchDesign?.hypotheses?.length &&
        depthConfig.hypothesisTestingEnabled
      ) {
        this.logger.log(
          `[V5] Running hypothesis-driven queries for ${researchDesign.hypotheses.length} hypotheses`,
        );
        try {
          for (const hypothesis of researchDesign.hypotheses.slice(0, 3)) {
            await this.dataSourceRouterService.searchForHypothesis(
              hypothesis.statement,
            );
          }
          this.logger.log(`[V5] Hypothesis-driven queries complete`);
        } catch (error) {
          this.logger.warn(
            `[V5] Hypothesis-driven queries failed (non-fatal): ${error}`,
          );
        }
      }

      // 检查是否被取消
      if (abortController.signal.aborted) {
        throw new Error("Refresh cancelled");
      }

      // 4. 保存分析结果（优先保存，确保即使后续步骤崩溃数据也不丢失）
      this.logger.log(
        `[executeRefresh] Saving ${analysisResults.filter((r) => r.status === "fulfilled").length} dimension analyses...`,
      );
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
      this.logger.log(`[executeRefresh] Dimension analyses saved successfully`);

      // ★ 更新维度 TODOs 为已完成
      try {
        for (const result of analysisResults) {
          if (result.status === "fulfilled") {
            const tid = todoMap[result.value.dimensionId];
            if (tid) {
              await this.researchTodoService.completeTodo(tid, {
                wordCount: (result.value.analysisResult as any)?.content
                  ?.length,
              });
            }
          } else {
            // Find the dimension this failed result corresponds to
            const dimIndex = analysisResults.indexOf(result);
            const dim = dimensions[dimIndex];
            if (dim && todoMap[dim.id]) {
              await this.researchTodoService.failTodo(
                todoMap[dim.id],
                "研究失败",
              );
            }
          }
        }
      } catch (todoErr) {
        this.logger.warn(
          `[executeRefresh] Todo update failed (non-fatal): ${todoErr}`,
        );
      }

      // ============ V5: Cognitive Loop (Claim Extraction → Validation → Hypothesis Verification) ============
      // Wrapped in try-catch: cognitive loop is non-fatal — analyses are already saved above
      if (depthConfig.maxCognitiveLoops > 0) {
        try {
          this.emitProgress({
            topicId,
            reportId: report.id,
            phase: "reviewing",
            progress: 65,
            completedDimensions: dimensions.length,
            totalDimensions: dimensions.length,
            message: "V5: 认知循环 - 提取断言并交叉验证...",
          });

          // Collect claims from successful results
          const allClaims: import("../types/v5-research.types").ExtractedClaim[] =
            [];
          for (const result of analysisResults) {
            if (result.status === "fulfilled") {
              const val = result.value as any;
              if (val.extractedClaims) {
                allClaims.push(...val.extractedClaims);
              }
            }
          }

          if (allClaims.length > 0) {
            // Build evidence summary from analysis results
            const evidenceSummary = analysisResults
              .filter((r) => r.status === "fulfilled")
              .map((r) => {
                const val = (r as PromiseFulfilledResult<any>).value;
                return val.analysisResult?.summary || "";
              })
              .join("\n\n")
              .substring(0, 8000);

            const claimValidation =
              await this.researchReviewerService.validateClaims(
                allClaims,
                evidenceSummary,
              );

            this.logger.log(
              `[V5] Claim validation: ${claimValidation.stats.verified} verified, ${claimValidation.stats.disputed} disputed`,
            );

            // Verify hypotheses
            if (
              depthConfig.hypothesisTestingEnabled &&
              researchDesign?.hypotheses?.length
            ) {
              const hypothesisResults =
                await this.researchLeaderService.verifyHypotheses(
                  researchDesign.hypotheses,
                  evidenceSummary,
                );
              this.logger.log(
                `[V5] Hypothesis verification: ${hypothesisResults.length} results`,
              );

              // Build validation context for potential rewriting
              validationContext = buildValidationContextForWriting(
                claimValidation.results,
                hypothesisResults,
              );
              if (validationContext) {
                this.logger.log(
                  `[V5] Built validation context (${validationContext.length} chars) for quality-aware synthesis`,
                );
              }
            }
          }

          // V5: Checkpoint after cognitive loop
          try {
            await this.researchCheckpointService.saveCheckpoint(topic.id, {
              phase: "L3_analysis",
              claimsCount: allClaims.length,
              validationContext,
            });
          } catch {
            // non-fatal
          }
        } catch (cognitiveError) {
          this.logger.warn(
            `[V5] Cognitive loop failed (non-fatal, analyses already saved): ${cognitiveError}`,
          );
        }
      }

      // 5. 质量审核阶段（non-fatal）
      try {
        this.emitProgress({
          topicId,
          reportId: report.id,
          phase: "reviewing",
          progress: 70,
          completedDimensions: dimensions.length,
          totalDimensions: dimensions.length,
          message: "质量审核员正在审核研究质量...",
        });

        const reviewResult = await this.reviewResearchQuality(
          topic,
          dimensions,
          analysisResults,
        );

        this.logger.log(
          `Review completed: ${reviewResult.qualityLevel} (${reviewResult.overallScore.toFixed(1)}/100)`,
        );

        if (
          reviewResult.qualityLevel === ReviewQualityLevel.REJECTED ||
          reviewResult.qualityLevel === ReviewQualityLevel.NEEDS_REVISION
        ) {
          this.logger.warn(
            `Research quality below threshold: ${reviewResult.qualityLevel}. ` +
              `Recommendations: ${reviewResult.recommendations.join("; ")}`,
          );
        }
      } catch (reviewError) {
        this.logger.warn(
          `[executeRefresh] Quality review failed (non-fatal): ${reviewError}`,
        );
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
      // ★ 更新报告 TODO 为进行中
      if (reportTodoId) {
        try {
          await this.researchTodoService.updateTodoStatus(
            reportTodoId,
            ResearchTodoStatus.IN_PROGRESS,
            "正在合成报告...",
          );
        } catch {
          /* non-fatal */
        }
      }
      const finalReport = await this.reportSynthesisService.synthesizeReport(
        topic,
        report.id,
      );

      // V5: Fact check (thorough mode only)
      if (depthConfig.factCheckEnabled) {
        this.emitProgress({
          topicId,
          reportId: report.id,
          phase: "reviewing",
          progress: 92,
          completedDimensions: dimensions.length,
          totalDimensions: dimensions.length,
          message: "V5: 事实核查中...",
        });

        try {
          const reportContent = (finalReport as any).content || "";
          // Collect evidence data from successful analysis results
          const evidenceForFactCheck = await this.prisma.topicEvidence.findMany(
            {
              where: { reportId: report.id },
              select: { id: true, title: true, snippet: true },
              take: 50,
            },
          );
          const factCheckResult =
            await this.researchReviewerService.factCheckReport(
              reportContent,
              evidenceForFactCheck,
            );
          this.logger.log(
            `[V5] Fact check: accuracy=${factCheckResult.accuracyScore}/100, issues=${factCheckResult.issues.length}`,
          );
        } catch (error) {
          this.logger.warn(`[V5] Fact check failed (non-fatal): ${error}`);
        }
      }

      // ★ 标记报告和审核 TODOs 为已完成
      try {
        if (reportTodoId)
          await this.researchTodoService.completeTodo(reportTodoId, {
            wordCount: (finalReport as any).fullReport?.length,
          });
        if (reviewTodoId) {
          await this.researchTodoService.updateTodoStatus(
            reviewTodoId,
            ResearchTodoStatus.IN_PROGRESS,
            "审核中...",
          );
          await this.researchTodoService.completeTodo(reviewTodoId);
        }
        if (missionId) {
          await this.prisma.researchMission.update({
            where: { id: missionId },
            data: {
              status: ResearchMissionStatus.COMPLETED,
              completedAt: new Date(),
              completedTasks: dimensions.length + 2,
              progressPercent: 100,
            },
          });
        }
      } catch (todoErr) {
        this.logger.warn(
          `[executeRefresh] Final todo update failed (non-fatal): ${todoErr}`,
        );
      }

      // 7. 更新专题状态和统计数据
      await this.prisma.researchTopic.update({
        where: { id: topicId },
        data: {
          status: ResearchTopicStatus.ACTIVE,
          lastRefreshAt: new Date(),
          totalReports: { increment: 1 },
          totalSources: finalReport.totalSources || 0,
        },
      });

      // 8. 更新刷新日志
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
   * @param depthConfig V5 研究深度配置
   */
  private async researchDimensionsInParallel(
    topic: ResearchTopic,
    dimensions: TopicDimension[],
    reportId: string,
    signal: AbortSignal,
    agentAssignments: AgentAssignment[] = [],
    depthConfig?: ResearchDepthConfig,
  ): Promise<{
    results: PromiseSettledResult<{
      dimensionId: string;
      analysisResult: DimensionAnalysisResult;
      evidenceIds: string[];
      extractedClaims?: import("../types/v5-research.types").ExtractedClaim[];
    }>[];
    researchDesign?: ResearchDesign;
  }> {
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

    // V5: Checkpoint after Phase 1 search completion
    try {
      await this.researchCheckpointService.saveCheckpoint(topic.id, {
        phase: "L2_knowledge",
        searchedDimensions: successfulSearches.length,
        totalDimensions: totalCount,
      });
    } catch {
      // non-fatal
    }

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
            undefined, // validationContext
            depthConfig?.maxRevisionRounds, // V5: revision rounds from depth config
          );

        if (!missionResult.success) {
          throw new Error(missionResult.error || "Dimension writing failed");
        }

        completedCount++;

        // V5: Checkpoint after each dimension writing completes
        try {
          await this.researchCheckpointService.saveCheckpoint(topic.id, {
            phase: "L4_writing",
            completedDimension: dimension.name,
            completedCount,
            totalCount,
          });
        } catch {
          // non-fatal
        }

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
          extractedClaims: missionResult.extractedClaims,
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

    const results = await Promise.allSettled(writingPromises);

    // V5: Extract research design from global outline
    const extractedDesign = globalOutline?.researchDesign;

    return { results, researchDesign: extractedDesign };
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
      extractedClaims?: import("../types/v5-research.types").ExtractedClaim[];
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
