/**
 * Mission Execution Service
 *
 * 负责 Mission 的任务执行和调度
 */

import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { PrismaService } from "@/common/prisma/prisma.service";
import {
  ResearchMissionStatus,
  ResearchTaskStatus,
  AIModelType,
} from "@prisma/client";
import type {
  ResearchTask,
  ResearchTopic,
  TopicDimension,
} from "@prisma/client";
import {
  ResearchEventEmitterService,
  RESEARCH_INTERNAL_EVENTS,
} from "./research-event-emitter.service";
import { MissionQueryService } from "./mission-query.service";
import { DimensionMissionService } from "../dimension/dimension-mission.service";
import { ReportSynthesisService } from "../report/report-synthesis.service";
import { AgentActivityService } from "../monitoring/agent-activity.service";
import { AIEngineFacade } from "@/modules/ai-engine/facade/ai-engine.facade";
import { ResearchReviewerService } from "../collaboration/research-reviewer.service";
import type { DimensionAnalysisResult } from "../../types/research.types";
import type { ResearchDepth } from "../../types/v5-research.types";
import { resolveResearchDepthConfig } from "../../types/v5-research.types";
import type { LeaderPlan } from "../../types/leader.types";
import { getModelDisplayNameMap } from "../../utils/model-display-name";
import { toPrismaJson } from "@/common/utils/prisma-json.utils";

/** Shape of ResearchTask.result (Prisma Json field) for dimension_research tasks */
interface TaskResultJson {
  summary?: string;
  content?: string;
  reportId?: string;
  analysisResult?: {
    summary?: string;
    keyFindings?: Array<
      string | { finding: string; title?: string; significance?: string }
    >;
  };
  keyFindings?: Array<
    | string
    | {
        finding: string;
        title?: string;
        significance?: string;
        evidenceIds?: string[];
      }
  >;
  trends?: DimensionAnalysisResult["trends"];
  challenges?: DimensionAnalysisResult["challenges"];
  opportunities?: DimensionAnalysisResult["opportunities"];
  evidenceUsed?: number;
  confidenceLevel?: string;
  detailedContent?: string;
  figureReferences?: DimensionAnalysisResult["figureReferences"];
  generatedCharts?: DimensionAnalysisResult["generatedCharts"];
  actualModelId?: string;
}

type ResearchTopicWithDimensions = ResearchTopic & {
  dimensions: TopicDimension[];
};

@Injectable()
export class MissionExecutionService {
  private readonly logger = new Logger(MissionExecutionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly researchEventEmitter: ResearchEventEmitterService,
    private readonly queryService: MissionQueryService,
    private readonly dimensionMissionService: DimensionMissionService,
    private readonly reportSynthesisService: ReportSynthesisService,
    private readonly agentActivity: AgentActivityService,
    private readonly aiFacade: AIEngineFacade,
    private readonly reviewerService: ResearchReviewerService,
  ) {}

  /**
   * 启动任务执行循环
   * 异步执行所有可执行的任务
   */
  async startExecution(missionId: string, topicId: string): Promise<void> {
    this.logger.log(
      `[startExecution] Starting execution for mission ${missionId}`,
    );

    // 获取专题信息
    const topic = await this.prisma.researchTopic.findUnique({
      where: { id: topicId },
      include: { dimensions: true },
    });

    // V5: 读取 mission 的 researchDepth 并解析深度配置
    const mission = await this.prisma.researchMission.findUnique({
      where: { id: missionId },
      select: { researchDepth: true },
    });
    const researchDepth = (mission?.researchDepth ??
      "standard") as ResearchDepth;
    const depthConfig = resolveResearchDepthConfig(researchDepth);
    this.logger.log(
      `[startExecution] V5 depth: ${researchDepth} (cognitiveLoops=${depthConfig.maxCognitiveLoops}, revisions=${depthConfig.maxRevisionRounds}, literatureBaseline=${depthConfig.literatureBaselineEnabled})`,
    );

    if (!topic) {
      throw new Error(`Topic ${topicId} not found`);
    }

    // ★ 先创建草稿报告，以便关联证据
    const draftReport =
      await this.reportSynthesisService.createDraftReport(topicId);
    this.logger.log(
      `[startExecution] Created draft report: ${draftReport.id} for evidence association`,
    );

    // ★ 检查是否有继承的已完成任务（增量模式）
    // 如果有，需要将之前报告的证据复制到新报告
    const completedTasks = await this.prisma.researchTask.findMany({
      where: {
        missionId,
        taskType: "dimension_research",
        status: ResearchTaskStatus.COMPLETED,
      },
    });

    if (completedTasks.length > 0) {
      // ★ 找到最近的有证据的报告，复制证据到新报告
      const previousReport = await this.prisma.topicReport.findFirst({
        where: {
          topicId,
          id: { not: draftReport.id }, // 排除刚创建的草稿
          evidences: { some: {} }, // 必须有证据
        },
        orderBy: { generatedAt: "desc" },
        include: { evidences: true },
      });

      if (previousReport && previousReport.evidences.length > 0) {
        // 复制证据到新报告（保持 citationIndex）
        const evidencesCopyData = previousReport.evidences.map((e) => ({
          reportId: draftReport.id, // ★ 关联到新报告
          title: e.title,
          url: e.url,
          domain: e.domain,
          snippet: e.snippet,
          sourceType: e.sourceType,
          publishedAt: e.publishedAt,
          credibilityScore: e.credibilityScore,
          citationIndex: e.citationIndex,
          analysisId: e.analysisId, // 保持分析关联
        }));

        await this.prisma.topicEvidence.createMany({
          data: evidencesCopyData,
        });

        this.logger.log(
          `[startExecution] ★ Copied ${previousReport.evidences.length} evidences from report ${previousReport.id.slice(0, 8)} to new report ${draftReport.id.slice(0, 8)}`,
        );
      }
    }

    // ★ v7.5: 使用动态调度器替代批量执行
    // 动态调度器会在每个任务完成后立即检查是否有新的可执行任务
    // 不再等待当前批次全部完成，实现真正的动态调度
    const maxConcurrentTasks = await this.calculateDynamicConcurrency();
    this.logger.log(
      `[startExecution] Starting dynamic scheduler with max concurrency ${maxConcurrentTasks}`,
    );

    await this.executeDynamicScheduler(missionId, maxConcurrentTasks, (task) =>
      this.executeTask(task, topic, missionId, draftReport.id, depthConfig),
    );

    // 更新最终状态
    await this.finalizeMission(missionId, topicId);
  }

  /**
   * 执行单个任务
   */
  async executeTask(
    task: ResearchTask,
    topic: ResearchTopicWithDimensions,
    missionId: string,
    reportId: string,
    depthConfig?: import("../../types/v5-research.types").ResearchDepthConfig,
  ): Promise<void> {
    this.logger.log(`[executeTask] Executing task: ${task.title} (${task.id})`);

    // ★ 前置检查：任务开始前检查是否已被取消（防止竞态条件覆盖 FAILED 状态）
    // ★ 同时获取 leaderPlan 以查找 Agent 分配的模型
    const [currentTask, currentMission] = await Promise.all([
      this.prisma.researchTask.findUnique({
        where: { id: task.id },
        select: { status: true, modelId: true, skills: true, tools: true },
      }),
      this.prisma.researchMission.findUnique({
        where: { id: missionId },
        select: { status: true, leaderPlan: true, researchDepth: true },
      }),
    ]);

    // 如果任务已被取消（状态为 FAILED）或任务不存在，直接返回
    if (!currentTask || currentTask.status === ResearchTaskStatus.FAILED) {
      this.logger.log(
        `[executeTask] Task ${task.id} was cancelled or not found, skipping execution`,
      );
      return;
    }

    // 如果 Mission 已被取消，直接返回
    if (
      !currentMission ||
      currentMission.status === ResearchMissionStatus.CANCELLED
    ) {
      this.logger.log(
        `[executeTask] Mission ${missionId} was cancelled, skipping task ${task.id}`,
      );
      return;
    }

    // 确定 Agent 角色
    const agentRole = this.queryService.getAgentRoleFromTaskType(task.taskType);
    const agentName = this.queryService.getAgentNameFromTaskType(task.taskType);

    // ★ 优先使用任务记录中的 modelId，fallback 到 leaderPlan 查找
    // 任务创建时已保存 modelId，直接使用更可靠
    const leaderPlan = currentMission?.leaderPlan as LeaderPlan | null;
    const agentAssignment = leaderPlan?.agentAssignments?.find(
      (a) => a.agentId === task.assignedAgent,
    );
    const assignedModelId =
      currentTask.modelId || task.modelId || agentAssignment?.modelId;

    // ★ 提取 Leader 分配的 skills 和 tools（优先从任务记录，fallback 到 agentAssignment）
    const assignedSkills =
      currentTask.skills?.length > 0
        ? currentTask.skills
        : agentAssignment?.skills || [];
    const assignedTools =
      currentTask.tools?.length > 0
        ? currentTask.tools
        : agentAssignment?.tools || [];

    try {
      // 更新任务状态为执行中
      await this.queryService.updateTaskStatus(
        task.id,
        ResearchTaskStatus.EXECUTING,
      );

      // ★ 发送任务开始事件
      await this.researchEventEmitter.emitTaskStarted(topic.id, {
        taskId: task.id,
        taskType: task.taskType,
        title: task.title,
        dimensionName: task.dimensionName ?? undefined,
        status: "executing",
        progress: 0,
        message: `开始执行: ${task.title}`,
      });

      // ★ 发送 Agent 工作状态事件（传递 missionId 以便持久化）
      await this.researchEventEmitter.emitAgentWorking(
        topic.id,
        {
          agentId: task.assignedAgent,
          agentName,
          agentRole,
          status: "working",
          taskDescription: task.title,
          dimensionId: task.dimensionId ?? undefined,
          dimensionName: task.dimensionName ?? undefined,
          progress: 0,
          modelId: assignedModelId, // ★ 传递模型 ID 用于显示
        },
        missionId,
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- result shape varies by taskType, stored as Prisma JSON
      let result: any;

      switch (task.taskType) {
        case "dimension_research": {
          // ★ 发送维度研究开始事件
          const dimensionName = task.dimensionName || task.title;
          await this.researchEventEmitter.emitDimensionResearchStarted(
            topic.id,
            dimensionName,
            agentName,
            missionId,
          );

          // ★ 优先使用 dimensionId 查找（更可靠）
          let dimension = task.dimensionId
            ? topic.dimensions?.find(
                (d: TopicDimension) => d.id === task.dimensionId,
              )
            : null;

          // 回退：按名称查找
          if (!dimension && task.dimensionName) {
            dimension = topic.dimensions?.find(
              (d: TopicDimension) => d.name === task.dimensionName,
            );
          }

          // ★ v8.2: 如果在缓存的 topic.dimensions 中没找到，从数据库重新查询
          // 这处理 Leader 在 Mission 执行过程中创建新维度的情况
          if (!dimension && task.dimensionId) {
            this.logger.log(
              `[executeTask] Dimension not in cached topic, querying DB for ${task.dimensionId}`,
            );
            dimension = await this.prisma.topicDimension.findUnique({
              where: { id: task.dimensionId },
            });
          }

          if (dimension) {
            this.logger.log(
              `[executeTask] Found dimension: ${dimension.name} (${dimension.id})${assignedModelId ? `, model: ${assignedModelId}` : ""}`,
            );

            // ★ 发送进度事件：正在采集数据
            await this.researchEventEmitter.emitDimensionResearchProgress(
              topic.id,
              dimensionName,
              30,
              "正在采集相关数据...",
              missionId,
              task.id, // ★ 传递 taskId 用于前端精确匹配
            );

            // 使用新的 Leader-Agent 协作机制
            const missionResult =
              await this.dimensionMissionService.executeDimensionMission(
                topic,
                dimension,
                reportId, // ★ 传入 reportId 以便关联证据
                missionId, // ★ 传入 missionId 以便持久化团队消息
                assignedModelId, // ★ 传入 Leader 分配的模型
                task.id, // ★ 传入任务ID用于前端精确匹配进度
                assignedTools, // ★ 传入 Leader 分配的工具
                assignedSkills, // ★ 传入 Leader 分配的技能
                depthConfig?.maxRevisionRounds, // V5: 修订轮次
              );

            if (!missionResult.success) {
              throw new Error(
                missionResult.error || "Dimension mission failed",
              );
            }
            result = missionResult.analysisResult;

            // ★ 发送维度研究完成事件
            await this.researchEventEmitter.emitDimensionResearchCompleted(
              topic.id,
              dimensionName,
              result.keyFindings?.length || 0,
              result.detailedContent?.length || 0,
              missionId,
            );
          } else {
            // 如果没有找到维度，创建新维度进行研究
            this.logger.warn(
              `[executeTask] Dimension not found for task ${task.id}, creating new one`,
            );
            result = await this.executeGenericDimensionResearch(
              task,
              topic,
              reportId,
            );

            // ★ 发送维度研究完成事件
            await this.researchEventEmitter.emitDimensionResearchCompleted(
              topic.id,
              dimensionName,
              result.keyFindings?.length || 0,
              result.detailedContent?.length || 0,
              missionId,
            );
          }
          break;
        }

        case "quality_review": {
          // ★ 发送审核开始提示（传递 missionId 以便持久化）
          await this.researchEventEmitter.emitAgentWorking(
            topic.id,
            {
              agentId: task.assignedAgent,
              agentName: "质量审核员",
              agentRole: "reviewer",
              status: "working",
              taskDescription: "正在审核所有维度研究结果的质量...",
              progress: 10,
              modelId: assignedModelId, // ★ 传递模型 ID
            },
            missionId,
          );

          // ★ 获取所有已完成的维度研究结果及其维度信息
          const completedTasks = await this.prisma.researchTask.findMany({
            where: {
              missionId,
              taskType: "dimension_research",
              status: ResearchTaskStatus.COMPLETED,
            },
            include: {
              mission: {
                include: {
                  topic: {
                    include: {
                      dimensions: true,
                    },
                  },
                },
              },
            },
          });

          if (completedTasks.length === 0) {
            result = {
              reviewedTasks: 0,
              status: "skipped",
              feedback: "没有已完成的维度研究任务需要审核",
            };
            break;
          }

          // ============ V5: 认知循环 (Claim Validation) ============
          if (depthConfig && depthConfig.maxCognitiveLoops > 0) {
            this.logger.log(
              `[V5] Running cognitive loop before quality review (maxLoops=${depthConfig.maxCognitiveLoops})`,
            );

            await this.researchEventEmitter.emitAgentWorking(
              topic.id,
              {
                agentId: task.assignedAgent,
                agentName: "质量审核员",
                agentRole: "reviewer",
                status: "working",
                taskDescription: "V5: 认知循环 - 提取断言并交叉验证...",
                progress: 5,
                modelId: assignedModelId,
              },
              missionId,
            );

            try {
              // 收集所有维度研究的摘要作为证据
              const evidenceSummary = completedTasks
                .map((t) => {
                  const taskResult = t.result as TaskResultJson;
                  return (
                    taskResult?.summary ||
                    taskResult?.analysisResult?.summary ||
                    ""
                  );
                })
                .filter(Boolean)
                .join("\n\n")
                .substring(0, 8000);

              // 从结果中提取 claims（key findings 作为 claims）
              const allClaims: import("../../types/v5-research.types").ExtractedClaim[] =
                [];
              for (const t of completedTasks) {
                const taskResult = t.result as TaskResultJson;
                const findings =
                  taskResult?.keyFindings ||
                  taskResult?.analysisResult?.keyFindings ||
                  [];
                for (let i = 0; i < findings.length; i++) {
                  const f = findings[i];
                  allClaims.push({
                    id: `${t.id}-claim-${i}`,
                    statement:
                      typeof f === "string"
                        ? f
                        : f.finding || f.title || JSON.stringify(f),
                    sectionId: t.dimensionId || t.id,
                    sourceEvidenceIndices: [],
                    importance: (() => {
                      const sig = typeof f === "object" && f.significance;
                      return sig === "high" || sig === "low" ? sig : "medium";
                    })(),
                  });
                }
              }

              if (allClaims.length > 0 && evidenceSummary.length > 0) {
                const claimValidation =
                  await this.reviewerService.validateClaims(
                    allClaims,
                    evidenceSummary,
                  );

                this.logger.log(
                  `[V5] Claim validation: ${claimValidation.stats.verified} verified, ${claimValidation.stats.disputed} disputed, ${claimValidation.stats.unverified} unverified`,
                );

                await this.researchEventEmitter.emitAgentWorking(
                  topic.id,
                  {
                    agentId: task.assignedAgent,
                    agentName: "质量审核员",
                    agentRole: "reviewer",
                    status: "working",
                    taskDescription: `V5: 断言验证完成 - ${claimValidation.stats.verified}个已验证, ${claimValidation.stats.disputed}个有争议`,
                    progress: 8,
                    modelId: assignedModelId,
                  },
                  missionId,
                );
              } else {
                this.logger.log(
                  `[V5] No claims or evidence to validate, skipping cognitive loop`,
                );
              }
            } catch (error) {
              this.logger.warn(
                `[V5] Cognitive loop failed (non-fatal): ${error}`,
              );
            }
          }

          // ★ 执行真正的 AI 质量审核
          const dimensionReviews = [];
          const dimensions = topic.dimensions || [];

          for (let i = 0; i < completedTasks.length; i++) {
            const completedTask = completedTasks[i];
            const dimension = dimensions.find(
              (d: { id: string }) => d.id === completedTask.dimensionId,
            );

            if (!dimension) continue;

            // 更新进度
            const reviewProgress = Math.round(
              10 + ((i + 1) / completedTasks.length) * 70,
            );
            await this.researchEventEmitter.emitAgentWorking(
              topic.id,
              {
                agentId: task.assignedAgent,
                agentName: "质量审核员",
                agentRole: "reviewer",
                status: "working",
                taskDescription: `正在审核维度「${dimension.name}」...`,
                progress: reviewProgress,
                modelId: assignedModelId,
              },
              missionId,
            );

            // 从任务结果中提取分析数据
            // DimensionMissionResult 包含 analysisResult?: DimensionAnalysisResult
            const missionResult = completedTask.result as {
              analysisResult?: DimensionAnalysisResult;
              evidenceIds?: string[];
            } | null;

            const analysisResult = missionResult?.analysisResult;

            // 如果没有分析结果，跳过审核
            if (!analysisResult) {
              this.logger.warn(
                `No analysis result found for dimension ${dimension.name}, skipping review`,
              );
              continue;
            }

            // 调用审核服务
            try {
              const review = await this.reviewerService.reviewDimension(
                topic,
                dimension,
                analysisResult,
                analysisResult.evidenceUsed || 0,
              );
              dimensionReviews.push(review);

              // ★ 记录维度审核结果到活动记录（供前端展示详细审核数据）
              await this.agentActivity.recordDimensionReview(
                topic.id,
                missionId,
                dimension.id,
                dimension.name,
                review,
              );

              // ★ 发送维度审核结果事件（包含评分和结论）
              await this.researchEventEmitter.emitAgentWorking(
                topic.id,
                {
                  agentId: task.assignedAgent,
                  agentName: "质量审核员",
                  agentRole: "reviewer",
                  status: "working",
                  taskDescription: `维度「${dimension.name}」审核完成`,
                  progress: reviewProgress,
                  modelId: assignedModelId,
                  dimensionId: dimension.id,
                  dimensionName: dimension.name,
                  reviewResult: {
                    qualityLevel: review.qualityLevel,
                    overallScore: review.overallScore,
                    scores: review.scores,
                    issueCount: review.issues.length,
                    suggestions: review.suggestions.slice(0, 3),
                    needsReresearch: review.needsReresearch,
                  },
                },
                missionId,
              );
            } catch (error) {
              this.logger.warn(
                `Failed to review dimension ${dimension.name}: ${error}`,
              );
            }
          }

          // ★ 执行全局审核
          let overallReview = null;
          if (dimensionReviews.length > 0) {
            try {
              overallReview = await this.reviewerService.reviewOverall(
                topic,
                dimensions,
                dimensionReviews,
              );

              // ★ 记录整体审核结果到活动记录
              if (overallReview) {
                await this.agentActivity.recordOverallReview(
                  topic.id,
                  missionId,
                  overallReview,
                );

                // ★ 发送整体审核结果事件
                await this.researchEventEmitter.emitAgentWorking(
                  topic.id,
                  {
                    agentId: task.assignedAgent,
                    agentName: "质量审核员",
                    agentRole: "reviewer",
                    status: "completed",
                    taskDescription: `质量审核完成：${overallReview.qualityLevel === "excellent" ? "优秀" : overallReview.qualityLevel === "good" ? "良好" : overallReview.qualityLevel === "acceptable" ? "合格" : "需修订"} (${overallReview.overallScore}分)`,
                    progress: 100,
                    modelId: assignedModelId,
                    reviewResult: {
                      type: "overall",
                      qualityLevel: overallReview.qualityLevel,
                      overallScore: overallReview.overallScore,
                      dimensionCount: dimensionReviews.length,
                      recommendations: overallReview.recommendations.slice(
                        0,
                        5,
                      ),
                      needsReresearch: overallReview.needsReresearch,
                      dimensionsToReresearch:
                        overallReview.dimensionsToReresearch,
                    },
                  },
                  missionId,
                );
              }
            } catch (error) {
              this.logger.warn(`Failed to perform overall review: ${error}`);
            }
          }

          // ★ 提取最后一个审核结果的实际模型ID
          const lastReviewModel = dimensionReviews
            .map((r) => r.actualModelId)
            .filter(Boolean)
            .pop();

          result = {
            reviewedTasks: completedTasks.length,
            dimensionReviews: dimensionReviews.map((r) => ({
              dimensionName: r.dimensionName,
              qualityLevel: r.qualityLevel,
              score: r.overallScore,
              issues: r.issues.length,
              suggestions: r.suggestions.slice(0, 3),
            })),
            overallReview: overallReview
              ? {
                  qualityLevel: overallReview.qualityLevel,
                  score: overallReview.overallScore,
                  recommendations: overallReview.recommendations.slice(0, 5),
                  needsReresearch: overallReview.needsReresearch,
                }
              : null,
            status: overallReview?.qualityLevel || "approved",
            feedback:
              overallReview?.recommendations?.join("; ") ||
              `已审核 ${completedTasks.length} 个维度研究结果`,
            actualModelId: lastReviewModel, // ★ 记录实际使用的模型
          };
          break;
        }

        case "report_synthesis": {
          // ★ 发送报告撰写开始事件（同时触发阶段转换）
          await this.researchEventEmitter.emitReportSynthesisStarted(
            topic.id,
            missionId,
          );

          // ★ 复用 startExecution 中创建的草稿报告，避免重复创建
          // reportId 已在 startExecution 中创建并传递到此处
          this.logger.log(
            `[report_synthesis] Using existing draft report: ${reportId}`,
          );

          // ★ 收集所有维度研究结果并保存到 DimensionAnalysis 表
          const dimensionTasks = await this.prisma.researchTask.findMany({
            where: {
              missionId,
              taskType: "dimension_research",
              status: ResearchTaskStatus.COMPLETED,
            },
          });

          for (const dimTask of dimensionTasks) {
            if (dimTask.result && dimTask.dimensionId) {
              const taskResult = dimTask.result as TaskResultJson;
              try {
                await this.reportSynthesisService.saveDimensionAnalysis(
                  reportId, // ★ 使用已有的 reportId
                  dimTask.dimensionId,
                  {
                    summary: taskResult.summary || "无摘要",
                    keyFindings: (taskResult.keyFindings ||
                      []) as DimensionAnalysisResult["keyFindings"],
                    trends: (taskResult.trends ||
                      []) as DimensionAnalysisResult["trends"],
                    challenges: (taskResult.challenges ||
                      []) as DimensionAnalysisResult["challenges"],
                    opportunities: (taskResult.opportunities ||
                      []) as DimensionAnalysisResult["opportunities"],
                    evidenceUsed: taskResult.evidenceUsed || 0,
                    confidenceLevel: taskResult.confidenceLevel || "medium",
                    detailedContent: taskResult.detailedContent || "",
                    figureReferences: (taskResult.figureReferences ||
                      []) as DimensionAnalysisResult["figureReferences"],
                    generatedCharts: (taskResult.generatedCharts ||
                      []) as DimensionAnalysisResult["generatedCharts"],
                  },
                );
                this.logger.log(
                  `[report_synthesis] Saved dimension analysis for ${dimTask.dimensionName}`,
                );
              } catch (err) {
                this.logger.warn(
                  `[report_synthesis] Failed to save dimension analysis for ${dimTask.dimensionName}: ${err}`,
                );
              }
            }
          }

          // 合成最终报告
          result = await this.reportSynthesisService.synthesizeReport(
            topic,
            reportId, // ★ 使用已有的 reportId
          );

          // V5: 深度门控后处理（fact-check for thorough mode）
          const missionDepth = (currentMission?.researchDepth ??
            "standard") as ResearchDepth;
          const depthConfig = resolveResearchDepthConfig(missionDepth);

          if (depthConfig.factCheckEnabled) {
            this.logger.log(`[V5] Running fact-check (depth=${missionDepth})`);
            try {
              const reportContent = (result as TaskResultJson)?.content || "";
              const evidenceForFactCheck =
                await this.prisma.topicEvidence.findMany({
                  where: { reportId },
                  select: { id: true, title: true, snippet: true },
                  take: 50,
                });
              const factCheckResult =
                await this.reviewerService.factCheckReport(
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

          // ★ 发送报告撰写完成事件（同时触发阶段完成）
          await this.researchEventEmitter.emitReportSynthesisCompleted(
            topic.id,
            result?.chapters?.length || 0,
            JSON.stringify(result).length,
            missionId,
          );

          // ★ 将 TopicReport 转换为前端 TodoResult 兼容格式
          const reportResult = result as Record<string, unknown>;
          const fullReportText = (reportResult?.fullReport as string) || "";
          result = {
            summary: (reportResult?.executiveSummary as string) || "报告已生成",
            wordCount: fullReportText.length,
            sourcesFound: (reportResult?.totalSources as number) || 0,
            keyFindings: Array.isArray(reportResult?.highlights)
              ? (reportResult.highlights as Array<{ title?: string }>).map(
                  (h, i) => ({
                    finding: h.title || `亮点 ${i + 1}`,
                    significance: (i < 2 ? "high" : "medium") as
                      | "high"
                      | "medium"
                      | "low",
                    evidenceIds: [],
                  }),
                )
              : 0,
            reportId,
          };
          break;
        }

        default:
          result = {
            status: "completed",
            message: `任务类型 ${task.taskType} 已处理`,
          };
      }

      // ★ 发送 Agent 完成事件（传递 missionId 以便持久化）
      await this.researchEventEmitter.emitAgentCompleted(
        topic.id,
        task.assignedAgent,
        agentName,
        `${task.title} 完成`,
        missionId,
        {
          dimensionId: task.dimensionId ?? undefined,
          dimensionName: task.dimensionName ?? undefined,
          modelId: assignedModelId,
        },
      );

      // ★ 在更新状态前检查任务和 Mission 是否已被取消
      const [currentTaskStatus, currentMissionStatus] = await Promise.all([
        this.prisma.researchTask.findUnique({
          where: { id: task.id },
          select: { status: true },
        }),
        this.prisma.researchMission.findUnique({
          where: { id: missionId },
          select: { status: true },
        }),
      ]);

      // 如果任务已被取消（状态被设置为 FAILED），跳过更新
      if (
        currentTaskStatus?.status === ResearchTaskStatus.FAILED ||
        currentTaskStatus?.status === ResearchTaskStatus.COMPLETED
      ) {
        this.logger.log(
          `[executeTask] Task ${task.id} status already changed to ${currentTaskStatus.status}, skipping update`,
        );
        return;
      }

      // 如果 Mission 已被取消，跳过更新
      if (currentMissionStatus?.status === ResearchMissionStatus.CANCELLED) {
        this.logger.log(
          `[executeTask] Mission ${missionId} was cancelled during execution, skipping task ${task.id} completion`,
        );
        return;
      }

      // ★ 发送任务完成事件
      await this.researchEventEmitter.emitTaskCompleted(topic.id, {
        taskId: task.id,
        taskType: task.taskType,
        title: task.title,
        dimensionName: task.dimensionName ?? undefined,
        status: "completed",
        progress: 100,
        message: `完成: ${task.title}`,
      });

      // 更新任务状态为完成
      // ★ 修复：从 result 中提取人类可读的摘要，而不是 JSON.stringify
      let summary: string;
      if (typeof result === "string") {
        summary = result.substring(0, 500);
      } else if (result?.summary) {
        // 优先使用 result.summary 字段
        summary = result.summary.substring(0, 500);
      } else if (result?.content) {
        // 其次使用 result.content 字段
        summary = result.content.substring(0, 500);
      } else {
        // 最后才使用简单描述
        summary = `研究完成`;
      }

      // ★ 提取实际使用的模型（从维度研究结果或审核结果中）
      const actualModelId = result?.actualModelId;

      if (actualModelId && actualModelId !== assignedModelId) {
        this.logger.warn(
          `[executeTask] Model fallback occurred for task ${task.id}: assigned=${assignedModelId} → actual=${actualModelId}`,
        );
      }

      await this.queryService.updateTaskStatus(
        task.id,
        ResearchTaskStatus.COMPLETED,
        {
          result,
          resultSummary: summary,
          actualModelId,
        },
      );

      // ★ 当实际模型与分配模型不同时，更新该 agent 所有活动记录的 agentName
      // 包括 emitAgentWorking（带旧模型标签）和 emitAgentCompleted（无标签）的记录
      if (actualModelId && actualModelId !== assignedModelId) {
        try {
          const nameMap = await getModelDisplayNameMap(
            this.prisma,
            [actualModelId, assignedModelId].filter(Boolean) as string[],
          );
          const actualDisplayName = nameMap.get(actualModelId) || actualModelId;
          const newAgentName = `${agentName} [${actualDisplayName}]`;

          await this.prisma.researchAgentActivity.updateMany({
            where: {
              missionId,
              agentId: task.assignedAgent,
              ...(task.dimensionId ? { dimensionId: task.dimensionId } : {}),
            },
            data: {
              agentName: newAgentName,
            },
          });
        } catch (err) {
          this.logger.debug(
            `[executeTask] Failed to update activity model labels: ${err}`,
          );
        }
      }

      this.logger.log(`[executeTask] Task completed: ${task.title}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[executeTask] Task failed: ${task.title} - ${errorMsg}`,
      );

      // 更新任务状态为失败
      await this.queryService.updateTaskStatus(
        task.id,
        ResearchTaskStatus.FAILED,
        {
          result: { error: errorMsg },
          resultSummary: `执行失败: ${errorMsg}`,
        },
      );
    }
  }

  /**
   * 执行通用维度研究（当没有预定义维度时）
   * 会在数据库中创建真实的维度记录
   */
  async executeGenericDimensionResearch(
    task: ResearchTask,
    topic: ResearchTopicWithDimensions,
    reportId: string,
  ): Promise<DimensionAnalysisResult> {
    const dimensionName = task.dimensionName || task.title;

    this.logger.log(
      `[executeGenericDimensionResearch] Creating dimension in DB: ${dimensionName}`,
    );

    // 计算 sortOrder（获取当前最大值 + 1）
    const maxDimension = await this.prisma.topicDimension.findFirst({
      where: { topicId: topic.id },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const sortOrder = (maxDimension?.sortOrder || 0) + 1;

    // 在数据库中创建真实的维度记录
    const dimension = await this.prisma.topicDimension.create({
      data: {
        topicId: topic.id,
        name: dimensionName,
        description: task.description || `研究维度: ${dimensionName}`,
        sortOrder,
        status: "PENDING",
        // ★ 设置默认搜索配置
        searchQueries: [dimensionName],
        searchSources: ["web"],
      },
    });

    this.logger.log(
      `[executeGenericDimensionResearch] Created dimension: ${dimension.id}`,
    );

    // 使用新的 Leader-Agent 协作机制
    const missionResult =
      await this.dimensionMissionService.executeDimensionMission(
        topic,
        dimension,
        reportId, // ★ 传入 reportId 以便关联证据
        undefined, // missionId
        task.modelId ?? undefined, // ★ 传入任务分配的模型 ID
      );

    if (!missionResult.success || !missionResult.analysisResult) {
      throw new Error(missionResult.error || "Dimension mission failed");
    }

    return missionResult.analysisResult;
  }

  /**
   * ★ 动态计算并发度
   * 根据可用 Provider 数量调整，每个 Provider 有独立的限流配额
   *
   * 逻辑：
   * - 单 Provider: 5 并发
   * - 2 Providers: 7 并发
   * - 3+ Providers: 9 并发
   * - 最大 10 并发（避免过度占用资源）
   */
  async calculateDynamicConcurrency(): Promise<number> {
    const MIN_CONCURRENCY = 5;
    const MAX_CONCURRENCY = 10;

    try {
      // 获取所有启用的 CHAT 模型
      const models = await this.aiFacade.getAvailableModels(AIModelType.CHAT);

      // 统计唯一 Provider 数量
      const uniqueProviders = new Set(models.map((m) => m.provider));
      const providerCount = uniqueProviders.size;

      // 根据 Provider 数量计算并发度
      // 公式：基础 5 + 每多一个 Provider 增加 2，上限 10
      const concurrency = Math.min(
        MAX_CONCURRENCY,
        Math.max(MIN_CONCURRENCY, MIN_CONCURRENCY + (providerCount - 1) * 2),
      );

      this.logger.log(
        `[calculateDynamicConcurrency] ${providerCount} providers (${Array.from(uniqueProviders).join(", ")}) → concurrency=${concurrency}`,
      );

      return concurrency;
    } catch (error) {
      this.logger.warn(
        `[calculateDynamicConcurrency] Failed to get models, using default: ${error}`,
      );
      return MIN_CONCURRENCY;
    }
  }

  /**
   * 完成 Mission，更新最终状态
   */
  async finalizeMission(missionId: string, topicId: string): Promise<void> {
    // ★ 先检查 Mission 当前状态，如果已被取消则不覆盖
    const currentMission = await this.prisma.researchMission.findUnique({
      where: { id: missionId },
      select: { status: true },
    });

    if (currentMission?.status === ResearchMissionStatus.CANCELLED) {
      this.logger.log(
        `[finalizeMission] Mission ${missionId} was cancelled, skipping finalization`,
      );
      return;
    }

    const tasks = await this.prisma.researchTask.findMany({
      where: { missionId },
    });

    const completedTasks = tasks.filter(
      (t) => t.status === ResearchTaskStatus.COMPLETED,
    );
    const failedTasks = tasks.filter(
      (t) => t.status === ResearchTaskStatus.FAILED,
    );

    // ★ 改进的状态判断逻辑：
    // - 如果有任何成功的任务，标记为 COMPLETED（部分成功也算成功）
    // - 只有全部失败才标记为 FAILED
    // 这样用户可以看到部分成功的研究结果
    const hasAnySuccess = completedTasks.length > 0;
    const hasAnyFailure = failedTasks.length > 0;
    const finalStatus = hasAnySuccess
      ? ResearchMissionStatus.COMPLETED
      : ResearchMissionStatus.FAILED;

    await this.prisma.researchMission.update({
      where: { id: missionId },
      data: {
        status: finalStatus,
        completedTasks: completedTasks.length,
        progressPercent: 100,
        completedAt: new Date(),
      },
    });

    // ★ 只清理完全空的草稿报告（没有任何维度分析的）
    // 部分成功的报告应该保留，让用户看到已完成的研究
    if (!hasAnySuccess) {
      const emptyDraftReports = await this.prisma.topicReport.findMany({
        where: {
          topicId,
          dimensionAnalyses: { none: {} },
        },
        select: { id: true },
      });

      if (emptyDraftReports.length > 0) {
        const deleteIds = emptyDraftReports.map((r) => r.id);
        await this.prisma.topicReport.deleteMany({
          where: { id: { in: deleteIds } },
        });
        this.logger.log(
          `[finalizeMission] Cleaned up ${deleteIds.length} empty draft reports after complete failure`,
        );
      }
    }

    // ★ 构建更详细的状态消息
    let statusMessage: string;
    let phase: string;

    if (hasAnySuccess && !hasAnyFailure) {
      // 完全成功
      phase = "completed";
      statusMessage = `研究完成，共完成 ${completedTasks.length} 个任务`;
    } else if (hasAnySuccess && hasAnyFailure) {
      // 部分成功
      phase = "completed";
      statusMessage = `研究部分完成：${completedTasks.length} 个任务成功，${failedTasks.length} 个任务失败`;
    } else {
      // 完全失败
      phase = "failed";
      statusMessage = `研究失败，${failedTasks.length} 个任务全部失败`;
    }

    // 发送进度事件
    this.queryService.emitProgress({
      missionId,
      topicId,
      status: finalStatus,
      progress: 100,
      phase,
      message: statusMessage,
      completedTasks: completedTasks.length,
      totalTasks: tasks.length,
    });

    // ★ 关键修复：发送完成事件通知前端状态变化
    // 之前只发送了 emitProgress，没有发送 emitMissionCompleted
    // 导致前端需要手动刷新才能看到状态从"研究中"变为"已完成"
    if (finalStatus === ResearchMissionStatus.COMPLETED) {
      await this.researchEventEmitter.emitMissionCompleted(
        topicId,
        missionId,
        completedTasks.length,
        tasks.length,
      );
    }

    this.logger.log(
      `[finalizeMission] Mission ${missionId} finalized: ${statusMessage}`,
    );
  }

  /**
   * ★ v7.5: 动态任务调度器
   *
   * 核心改进：每完成一个任务就立即检查是否有新的可执行任务
   * 不再等待当前批次全部完成，实现真正的动态调度
   *
   * @param missionId Mission ID
   * @param maxConcurrent 最大并发数
   * @param executor 任务执行函数
   */
  async executeDynamicScheduler(
    missionId: string,
    maxConcurrent: number,
    executor: (task: ResearchTask) => Promise<void>,
  ): Promise<void> {
    const executingTasks = new Map<string, Promise<void>>();
    const completedTaskIds = new Set<string>();
    let consecutiveWaits = 0;
    const MAX_CONSECUTIVE_WAITS = 30; // 30 × 2s = 60s deadlock timeout

    // ★ 主调度循环
    while (true) {
      // 0. 检查 Mission 是否被取消
      const mission = await this.prisma.researchMission.findUnique({
        where: { id: missionId },
        select: { status: true },
      });
      if (
        !mission ||
        mission.status === ResearchMissionStatus.CANCELLED ||
        mission.status === ResearchMissionStatus.FAILED
      ) {
        this.logger.log(
          `[dynamicScheduler] Mission ${missionId} cancelled/failed, stopping`,
        );
        break;
      }

      // 1. 获取当前可执行的任务（依赖已满足的 PENDING 任务）
      const executableTasks =
        await this.queryService.getExecutableTasks(missionId);

      // 过滤掉已完成或正在执行的任务
      const newTasks = executableTasks.filter(
        (t) => !completedTaskIds.has(t.id) && !executingTasks.has(t.id),
      );

      // 2. 如果有空闲槽位，启动新任务
      const availableSlots = maxConcurrent - executingTasks.size;
      const tasksToStart = newTasks.slice(0, availableSlots);

      if (tasksToStart.length > 0) {
        consecutiveWaits = 0; // Reset deadlock counter when dispatching
      }

      for (const task of tasksToStart) {
        this.logger.log(
          `[dynamicScheduler] Starting task: ${task.title} (${task.id}), ` +
            `active: ${executingTasks.size + 1}/${maxConcurrent}`,
        );

        // 创建任务执行 Promise
        const taskPromise = executor(task)
          .then(() => {
            this.logger.log(
              `[dynamicScheduler] Task completed: ${task.title} (${task.id})`,
            );
          })
          .catch((error) => {
            this.logger.error(
              `[dynamicScheduler] Task failed: ${task.title} (${task.id}): ${error.message}`,
            );
          })
          .finally(() => {
            // 任务完成后从执行列表移除
            executingTasks.delete(task.id);
            completedTaskIds.add(task.id);
          });

        executingTasks.set(task.id, taskPromise);
      }

      // 3. 检查是否需要退出循环
      if (executingTasks.size === 0) {
        // 没有正在执行的任务，检查是否还有待处理的
        const remainingPending = await this.prisma.researchTask.count({
          where: {
            missionId,
            status: ResearchTaskStatus.PENDING,
          },
        });

        if (remainingPending === 0) {
          this.logger.log(
            `[dynamicScheduler] No more tasks to execute, exiting scheduler`,
          );
          break;
        }

        // 还有待处理任务但依赖未满足，等待一下再检查
        consecutiveWaits++;
        if (
          consecutiveWaits >= MAX_CONSECUTIVE_WAITS &&
          executingTasks.size === 0
        ) {
          this.logger.error(
            `[dynamicScheduler] Deadlock detected: ${remainingPending} tasks pending but no tasks executing after ${consecutiveWaits} waits`,
          );
          break;
        }
        this.logger.log(
          `[dynamicScheduler] Waiting for dependencies, ${remainingPending} tasks pending (wait ${consecutiveWaits}/${MAX_CONSECUTIVE_WAITS})`,
        );
        await new Promise((resolve) => setTimeout(resolve, 2000));
        continue;
      }

      // 4. 等待任意一个任务完成，然后立即检查是否有新的可执行任务
      await Promise.race(executingTasks.values());

      // 短暂延迟，让数据库状态稳定
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // 5. 等待所有剩余任务完成
    if (executingTasks.size > 0) {
      this.logger.log(
        `[dynamicScheduler] Waiting for ${executingTasks.size} remaining tasks`,
      );
      await Promise.all(executingTasks.values());
    }
  }

  /**
   * ★ v7.3: 恢复执行新添加的任务
   *
   * 当用户在 Mission 完成后添加新任务时调用此方法
   * 会重新激活 Mission 并执行待处理的任务
   *
   * @param missionId Mission ID
   * @param topicId Topic ID
   * @returns 是否成功触发执行
   */
  async resumeExecutionForNewTask(
    missionId: string,
    topicId: string,
  ): Promise<boolean> {
    this.logger.log(
      `[resumeExecutionForNewTask] Checking mission ${missionId} for new task execution`,
    );

    // 1. 检查 Mission 状态
    const mission = await this.prisma.researchMission.findUnique({
      where: { id: missionId },
      select: { status: true },
    });

    if (!mission) {
      this.logger.warn(
        `[resumeExecutionForNewTask] Mission ${missionId} not found`,
      );
      return false;
    }

    // 2. 如果 Mission 正在执行中，循环会自动拾取新任务，无需处理
    if (mission.status === ResearchMissionStatus.EXECUTING) {
      this.logger.log(
        `[resumeExecutionForNewTask] Mission ${missionId} is still executing, loop will pick up new task`,
      );
      return true;
    }

    // 3. 如果 Mission 已完成或失败，检查是否有待执行的任务
    if (
      mission.status === ResearchMissionStatus.COMPLETED ||
      mission.status === ResearchMissionStatus.FAILED
    ) {
      const pendingTasks = await this.prisma.researchTask.findMany({
        where: {
          missionId,
          status: ResearchTaskStatus.PENDING,
        },
        orderBy: { priority: "asc" },
      });

      if (pendingTasks.length === 0) {
        this.logger.log(
          `[resumeExecutionForNewTask] No pending tasks for mission ${missionId}`,
        );
        return false;
      }

      this.logger.log(
        `[resumeExecutionForNewTask] Found ${pendingTasks.length} pending tasks, restarting execution`,
      );

      // 4. 更新 Mission 状态为 EXECUTING
      await this.prisma.researchMission.update({
        where: { id: missionId },
        data: { status: ResearchMissionStatus.EXECUTING },
      });

      // 5. 发送状态更新事件
      await this.researchEventEmitter.emitMissionProgress(topicId, {
        missionId,
        progress: 0,
        phase: "resuming",
        message: `恢复执行 ${pendingTasks.length} 个新任务`,
        completedTasks: 0,
        totalTasks: pendingTasks.length,
      });

      // 6. 异步启动执行循环
      this.startExecution(missionId, topicId).catch((err) => {
        this.logger.error(
          `[resumeExecutionForNewTask] Execution failed: ${err}`,
        );
      });

      return true;
    }

    // 其他状态（CANCELLED）不处理
    this.logger.log(
      `[resumeExecutionForNewTask] Mission ${missionId} status is ${mission.status}, not resuming`,
    );
    return false;
  }

  /**
   * 事件监听器 - 处理 Mission 恢复执行请求
   * 由 Leader/Todo 通过 ResearchEventEmitterService 发出（避免循环依赖）
   */
  @OnEvent(RESEARCH_INTERNAL_EVENTS.RESUME_MISSION_EXECUTION)
  async handleResumeMissionExecution(payload: {
    missionId: string;
    topicId: string;
  }): Promise<void> {
    this.resumeExecutionForNewTask(payload.missionId, payload.topicId).catch(
      (err) => {
        this.logger.error(
          `[handleResumeMissionExecution] Failed to resume mission: ${err}`,
        );
      },
    );
  }

  // ==================== Phase 5: Recovery Methods ====================

  /**
   * ★ Phase 5: 事件监听器 - 处理恢复事件
   * 当 HealthService 检测到需要恢复的任务时，会发出此事件
   */
  @OnEvent(RESEARCH_INTERNAL_EVENTS.RECOVERY_NEEDED)
  async handleRecoveryNeeded(payload: {
    missionId: string;
    topicId: string;
    resetTaskCount: number;
  }): Promise<void> {
    const { missionId, resetTaskCount } = payload;
    this.logger.log(
      `[handleRecoveryNeeded] Received recovery event for mission ${missionId}, ` +
        `${resetTaskCount} tasks were reset`,
    );

    try {
      await this.continueExecution(missionId);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[handleRecoveryNeeded] Failed to continue execution: ${errorMessage}`,
      );
    }
  }

  /**
   * ★ Phase 5: 继续执行被中断的 Mission
   *
   * 用于服务重启后自动恢复被中断的任务：
   * 1. 验证 Mission 存在且状态为 EXECUTING
   * 2. 将 EXECUTING 状态的任务重置为 PENDING（它们可能在执行中被中断）
   * 3. 调用 startExecution 继续执行
   *
   * @param missionId 要恢复的 Mission ID
   * @returns Promise<void>
   * @throws Error 如果 Mission 不存在或状态不正确
   */
  async continueExecution(missionId: string): Promise<void> {
    this.logger.log(
      `[continueExecution] Attempting to continue mission ${missionId}`,
    );

    // 1. 查询 Mission 及其相关信息
    const mission = await this.prisma.researchMission.findUnique({
      where: { id: missionId },
      include: {
        topic: true,
        tasks: {
          where: { status: ResearchTaskStatus.EXECUTING },
        },
      },
    });

    if (!mission) {
      throw new Error(`Mission ${missionId} not found`);
    }

    if (mission.status !== ResearchMissionStatus.EXECUTING) {
      throw new Error(
        `Mission ${missionId} is not in EXECUTING status (current: ${mission.status})`,
      );
    }

    // 2. 将 EXECUTING 状态的任务重置为 PENDING
    // 这些任务在服务重启前可能正在执行，需要重新执行
    if (mission.tasks.length > 0) {
      const taskIds = mission.tasks.map((t) => t.id);
      await this.prisma.researchTask.updateMany({
        where: { id: { in: taskIds } },
        data: {
          status: ResearchTaskStatus.PENDING,
          startedAt: null, // 重置开始时间
        },
      });
      this.logger.log(
        `[continueExecution] Reset ${taskIds.length} EXECUTING tasks to PENDING`,
      );
    }

    // 3. 发送恢复进度事件
    const completedCount = await this.prisma.researchTask.count({
      where: { missionId, status: ResearchTaskStatus.COMPLETED },
    });
    const totalCount = await this.prisma.researchTask.count({
      where: { missionId },
    });
    const progress =
      totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    await this.researchEventEmitter.emitMissionProgress(mission.topicId, {
      missionId,
      progress,
      phase: "executing",
      message: `任务已恢复，继续执行... (${completedCount}/${totalCount})`,
      completedTasks: completedCount,
      totalTasks: totalCount,
    });

    this.logger.log(
      `[continueExecution] Resuming mission ${missionId} for topic ${mission.topicId}, ` +
        `progress: ${completedCount}/${totalCount} (${progress}%)`,
    );

    // 4. 异步启动执行（不阻塞）
    this.startExecution(missionId, mission.topicId).catch((err) => {
      this.logger.error(
        `[continueExecution] Failed to continue execution: ${err.message}`,
      );
      // 更新状态为失败
      this.prisma.researchMission
        .update({
          where: { id: missionId },
          data: { status: ResearchMissionStatus.FAILED },
        })
        .catch((updateErr) => {
          this.logger.error(
            `[continueExecution] Failed to mark mission as FAILED: ${updateErr.message}`,
          );
        });
    });
  }

  /**
   * ★ v8.1: 添加新 Agent 到 leaderPlan.agentAssignments
   *
   * 当通过 Leader 对话创建任务时，需要将新 Agent 的配置
   * （包括 skills、tools、modelId）添加到 leaderPlan 中，
   * 以便前端能够正确显示 Agent 的能力配置。
   *
   * @param missionId Mission ID
   * @param agentAssignment 新的 Agent 分配信息
   */
  async addAgentToLeaderPlan(
    missionId: string,
    agentAssignment: {
      agentId: string;
      agentName?: string;
      agentType: string;
      role?: string;
      modelId?: string;
      skills?: string[];
      tools?: string[];
    },
  ): Promise<void> {
    try {
      // 1. 获取当前 Mission 的 leaderPlan
      const mission = await this.prisma.researchMission.findUnique({
        where: { id: missionId },
        select: { leaderPlan: true },
      });

      if (!mission) {
        this.logger.warn(
          `[addAgentToLeaderPlan] Mission ${missionId} not found`,
        );
        return;
      }

      // 2. 解析现有的 leaderPlan
      const leaderPlan = (mission.leaderPlan as unknown as LeaderPlan) || {
        taskUnderstanding: { topic: "", scope: "", objectives: [] },
        dimensions: [],
        executionStrategy: { parallelism: 5, priorityOrder: [] },
        agentAssignments: [],
      };

      // 3. 检查是否已存在该 Agent
      const existingIndex = leaderPlan.agentAssignments?.findIndex(
        (a) => a.agentId === agentAssignment.agentId,
      );

      if (existingIndex !== undefined && existingIndex >= 0) {
        // 更新现有 Agent 的配置（保留原有的 agentType）
        const existingAgent = leaderPlan.agentAssignments[existingIndex];
        leaderPlan.agentAssignments[existingIndex] = {
          ...existingAgent,
          agentName: agentAssignment.agentName ?? existingAgent.agentName,
          role: agentAssignment.role ?? existingAgent.role,
          modelId: agentAssignment.modelId ?? existingAgent.modelId,
          skills: agentAssignment.skills ?? existingAgent.skills,
          tools: agentAssignment.tools ?? existingAgent.tools,
        };
        this.logger.log(
          `[addAgentToLeaderPlan] Updated existing agent ${agentAssignment.agentId} in leaderPlan`,
        );
      } else {
        // 添加新 Agent
        if (!leaderPlan.agentAssignments) {
          leaderPlan.agentAssignments = [];
        }
        leaderPlan.agentAssignments.push({
          agentId: agentAssignment.agentId,
          agentName: agentAssignment.agentName,
          agentType: agentAssignment.agentType as
            | "dimension_researcher"
            | "quality_reviewer"
            | "report_writer",
          role: agentAssignment.role || "用户请求研究员",
          modelId: agentAssignment.modelId,
          skills: agentAssignment.skills,
          tools: agentAssignment.tools,
        });
        this.logger.log(
          `[addAgentToLeaderPlan] Added new agent ${agentAssignment.agentId} to leaderPlan with skills: [${agentAssignment.skills?.join(", ")}], tools: [${agentAssignment.tools?.join(", ")}]`,
        );
      }

      // 4. 更新数据库
      await this.prisma.researchMission.update({
        where: { id: missionId },
        data: {
          leaderPlan: toPrismaJson(leaderPlan),
        },
      });
    } catch (error) {
      this.logger.error(
        `[addAgentToLeaderPlan] Failed to update leaderPlan: ${error}`,
      );
      // 不抛出异常，避免影响主流程
    }
  }
}
