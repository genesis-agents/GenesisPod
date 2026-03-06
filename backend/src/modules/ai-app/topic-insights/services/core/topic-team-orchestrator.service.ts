import { Injectable, Logger, Optional } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { AgentFacade, EvalPipelineService } from "@/modules/ai-engine/facade";
import { RESEARCH_INTERNAL_EVENTS } from "./research-event-emitter.service";
import { PrismaService } from "@/common/prisma/prisma.service";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pLimit: (concurrency: number) => <T>(fn: () => Promise<T>) => Promise<T> =
  // p-limit is ESM-only; handle both CJS interop shapes
  (() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("p-limit");
    return mod.default || mod;
  })();
import {
  DimensionStatus,
  RefreshLogStatus,
  ResearchMissionStatus,
  ResearchTaskStatus,
  ResearchTopicStatus,
  ResearchTodoStatus,
  ResearchTodoType,
} from "@prisma/client";
import type {
  ResearchTopic,
  TopicDimension,
  TopicReport,
} from "@prisma/client";
import { DimensionMissionService } from "../dimension/dimension-mission.service";
import { DataSourceRouterService } from "../data/data-source-router.service";
import { ReportSynthesisService } from "../report/report-synthesis.service";
import { ResearchReviewerService } from "../collaboration/research-reviewer.service";
import { ResearchLeaderService } from "./research-leader.service";
import {
  type OverallReviewResult,
  ReviewQualityLevel,
} from "../../types/collaboration.types";
import { type AgentAssignment } from "../../types/leader.types";
import { ResearchCheckpointService } from "../monitoring/research-checkpoint.service";
import { ResearchTodoService } from "../collaboration/research-todo.service";
import {
  CritiqueRefineService,
  type CritiqueRefineRequest,
} from "../quality/critique-refine.service";
import type { DimensionAnalysisResult } from "../../types/research.types";
import {
  type ResearchDepth,
  type ResearchDepthConfig,
  type ResearchDesign,
  resolveResearchDepthConfig,
} from "../../types/v5-research.types";
import { buildValidationContextForWriting } from "../../prompts/v5-research.prompt";

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
    private readonly researchTodoService: ResearchTodoService,
    private readonly critiqueRefineService: CritiqueRefineService,
    @Optional() private readonly agentFacade?: AgentFacade,
    // ★ Batch 2: 自动化质量评估
    @Optional() private readonly evalPipeline?: EvalPipelineService,
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

    // ★ v4: 清空全局 URL 抓取缓存，确保每次报告生成从干净状态开始
    this.dimensionMissionService.clearEvidenceCache();

    // ★ Hoist missionId so it's accessible in catch block for cleanup
    let missionId: string | undefined;
    // ★ TraceCollector: hoist traceId so it's accessible in catch block
    let traceId: string | undefined;

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

      // ★ TraceCollector: start trace for this research mission
      traceId = this.agentFacade?.startTrace({
        name: `AI Insights: ${topic.name}`,
        type: "research_mission",
        metadata: {
          topicId,
          reportId: report.id,
          researchDepth,
          cognitiveLoops: depthConfig.maxCognitiveLoops,
        },
      });

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
      // ★ 保存执行策略的并行度设置
      let parallelism = 4; // Default parallelism

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
        const leaderPlanSpanId = traceId
          ? this.agentFacade?.addSpan(traceId, {
              name: "Leader AI Planning",
              type: "planning",
              metadata: { topicId },
            })
          : undefined;
        let leaderPlan: Awaited<
          ReturnType<typeof this.researchLeaderService.planResearch>
        >;
        try {
          leaderPlan = await this.researchLeaderService.planResearch(topicId);
          if (leaderPlanSpanId) {
            this.agentFacade?.endSpan(leaderPlanSpanId, {
              status: "success",
              output: {
                dimensionsPlanned: leaderPlan.dimensions?.length ?? 0,
                agentsAssigned: leaderPlan.agentAssignments?.length ?? 0,
              },
            });
          }
        } catch (planErr) {
          if (leaderPlanSpanId) {
            this.agentFacade?.endSpan(leaderPlanSpanId, {
              status: "error",
              error: String(planErr),
            });
          }
          throw planErr;
        }

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

        // ★ 提取并行度设置
        if (leaderPlan.executionStrategy?.parallelism) {
          parallelism = leaderPlan.executionStrategy.parallelism;
          this.logger.log(
            `[executeRefresh] Using leader plan parallelism: ${parallelism}`,
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

        // ★ 创建 ResearchTask 记录（前端 TopicTeamPanel 读取这些来展示 agent 列表）
        // Leader task
        await this.prisma.researchTask.create({
          data: {
            missionId: mission.id,
            title: "研究协调与规划",
            description: "协调各维度研究，制定研究策略",
            taskType: "leader_planning",
            assignedAgent: "Leader",
            status: ResearchTaskStatus.COMPLETED,
            progress: 100,
            priority: 1000,
          },
        });
        // Dimension research tasks
        for (const dim of dimensions) {
          await this.prisma.researchTask.create({
            data: {
              missionId: mission.id,
              title: `研究：${dim.name}`,
              description: dim.description || `深度研究 ${dim.name}`,
              taskType: "dimension_research",
              dimensionId: dim.id,
              dimensionName: dim.name,
              assignedAgent: `Researcher-${dim.name}`,
              status: ResearchTaskStatus.PENDING,
              progress: 0,
              priority: 500,
            },
          });
        }
        // Report synthesis task
        await this.prisma.researchTask.create({
          data: {
            missionId: mission.id,
            title: "合成研究报告",
            description: "整合所有维度分析，生成最终研究报告",
            taskType: "report_synthesis",
            assignedAgent: "Synthesizer",
            status: ResearchTaskStatus.PENDING,
            priority: 200,
          },
        });
        // Quality review task
        await this.prisma.researchTask.create({
          data: {
            missionId: mission.id,
            title: "质量审核",
            description: "审核研究质量，验证关键发现",
            taskType: "quality_review",
            assignedAgent: "Reviewer",
            status: ResearchTaskStatus.PENDING,
            priority: 100,
          },
        });

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
          // ★ 查找此维度对应的 Agent 分配，获取 modelId 和 assignmentReason
          const assignment = agentAssignments.find(
            (a) =>
              a.agentType === "dimension_researcher" &&
              a.assignedDimensions?.includes(dim.id),
          );

          const todo = await this.researchTodoService.createTodo({
            topicId,
            missionId: mission.id,
            type: ResearchTodoType.DIMENSION_RESEARCH,
            title: `研究维度：${dim.name}`,
            description: dim.description || `深度研究 ${dim.name} 维度`,
            dimensionId: dim.id,
            dimensionName: dim.name,
            agentId: assignment?.agentId || `researcher-${dim.id}`,
            agentName: assignment?.agentName || "研究员",
            agentRole: "researcher",
            modelId: assignment?.modelId,
            assignmentReason: assignment?.assignmentReason || {
              agentReason: `研究员专注于「${dim.name}」领域的深度信息收集和分析`,
              modelReason: assignment?.modelId
                ? `选择 ${assignment.modelId} 模型进行研究任务`
                : "使用擅长信息检索和内容分析的模型",
            },
            priority: 500,
          });
          todoMap[dim.id] = todo.id;
          await this.researchTodoService.updateTodoStatus(
            todo.id,
            ResearchTodoStatus.IN_PROGRESS,
            "研究中...",
          );
        }

        // ★ 查找报告撰写员分配
        const writerAssignment = agentAssignments.find(
          (a) => a.agentType === "report_writer",
        );
        // 报告撰写 TODO
        const rTodo = await this.researchTodoService.createTodo({
          topicId,
          missionId: mission.id,
          type: ResearchTodoType.REPORT_WRITING,
          title: "合成研究报告",
          description: "整合所有维度分析，生成最终研究报告",
          agentId: writerAssignment?.agentId || "synthesizer",
          agentName: writerAssignment?.agentName || "报告合成师",
          agentRole: "synthesizer",
          modelId: writerAssignment?.modelId,
          assignmentReason: writerAssignment?.assignmentReason || {
            agentReason:
              "综合撰写员擅长整合多维度研究成果，生成结构化的专业报告",
            modelReason: writerAssignment?.modelId
              ? `选择 ${writerAssignment.modelId} 模型进行报告撰写`
              : "使用具有强大语言生成和总结能力的模型",
          },
          priority: 200,
          dependsOn: Object.values(todoMap),
        });
        reportTodoId = rTodo.id;

        // ★ 查找质量审核员分配
        const reviewerAssignment = agentAssignments.find(
          (a) => a.agentType === "quality_reviewer",
        );
        // 质量审核 TODO
        const qTodo = await this.researchTodoService.createTodo({
          topicId,
          missionId: mission.id,
          type: ResearchTodoType.QUALITY_REVIEW,
          title: "质量审核",
          description: "审核研究质量，验证关键发现的可信度",
          agentId: reviewerAssignment?.agentId || "reviewer",
          agentName: reviewerAssignment?.agentName || "质量审核员",
          agentRole: "reviewer",
          modelId: reviewerAssignment?.modelId,
          assignmentReason: reviewerAssignment?.assignmentReason || {
            agentReason: "质量审核员专注于内容准确性、逻辑一致性和完整性检查",
            modelReason: reviewerAssignment?.modelId
              ? `选择 ${reviewerAssignment.modelId} 模型进行质量审核`
              : "使用擅长一致性检查和质量评估的模型",
          },
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
      const dimensionSpanId = traceId
        ? this.agentFacade?.addSpan(traceId, {
            name: "Dimension Research (Parallel)",
            type: "phase",
            metadata: {
              missionId,
              dimensionCount: dimensions.length,
              parallelism,
            },
          })
        : undefined;
      let analysisResults: Awaited<
        ReturnType<typeof this.researchDimensionsInParallel>
      >["results"];
      let extractedDesign: Awaited<
        ReturnType<typeof this.researchDimensionsInParallel>
      >["researchDesign"];
      try {
        const parallelResult = await this.researchDimensionsInParallel(
          topic,
          dimensions,
          report.id,
          abortController.signal,
          agentAssignments,
          depthConfig,
          parallelism,
        );
        analysisResults = parallelResult.results;
        extractedDesign = parallelResult.researchDesign;
        const successCount = analysisResults.filter(
          (r) => r.status === "fulfilled",
        ).length;
        if (dimensionSpanId) {
          this.agentFacade?.endSpan(dimensionSpanId, {
            status: "success",
            output: {
              totalDimensions: dimensions.length,
              successfulDimensions: successCount,
              failedDimensions: dimensions.length - successCount,
            },
          });
        }
      } catch (dimErr) {
        if (dimensionSpanId) {
          this.agentFacade?.endSpan(dimensionSpanId, {
            status: "error",
            error: String(dimErr),
          });
        }
        throw dimErr;
      }
      const researchDesign = extractedDesign;

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

      // ★ C1 fix: 使用索引遍历（analysisResults 和 dimensions 1:1 对应），避免 indexOf 错位
      try {
        for (let i = 0; i < analysisResults.length; i++) {
          const result = analysisResults[i];
          const dim = dimensions[i];
          if (!dim) continue;

          if (result.status === "fulfilled") {
            const tid = todoMap[result.value.dimensionId];
            if (tid) {
              await this.researchTodoService.completeTodo(tid, {
                wordCount: (
                  result.value.analysisResult as unknown as {
                    content?: { length?: number };
                  }
                )?.content?.length,
              });
            }
            if (missionId) {
              await this.prisma.researchTask.updateMany({
                where: { missionId, dimensionId: result.value.dimensionId },
                data: {
                  status: ResearchTaskStatus.COMPLETED,
                  progress: 100,
                  completedAt: new Date(),
                },
              });
            }
          } else {
            // C3 fix: 失败时同步标记 Todo 和 Task
            if (todoMap[dim.id]) {
              await this.researchTodoService.failTodo(
                todoMap[dim.id],
                "研究失败",
              );
            }
            if (missionId) {
              await this.prisma.researchTask.updateMany({
                where: { missionId, dimensionId: dim.id },
                data: { status: ResearchTaskStatus.FAILED },
              });
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
          const allClaims: import("../../types/v5-research.types").ExtractedClaim[] =
            [];
          for (const result of analysisResults) {
            if (result.status === "fulfilled") {
              const val = result.value as {
                extractedClaims?: import("../../types/v5-research.types").ExtractedClaim[];
              };
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
                const val = (
                  r as PromiseFulfilledResult<{
                    analysisResult?: { summary?: string };
                  }>
                ).value;
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
      // ★ Hoist reviewSpanId outside try so catch can end it on error
      const reviewSpanId = traceId
        ? this.agentFacade?.addSpan(traceId, {
            name: "Quality Review",
            type: "review",
            metadata: { missionId, dimensionCount: dimensions.length },
          })
        : undefined;
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

        if (reviewSpanId) {
          this.agentFacade?.endSpan(reviewSpanId, {
            status: "success",
            output: {
              qualityLevel: reviewResult.qualityLevel,
              overallScore: reviewResult.overallScore,
            },
          });
        }

        if (
          reviewResult.qualityLevel === ReviewQualityLevel.REJECTED ||
          reviewResult.qualityLevel === ReviewQualityLevel.NEEDS_REVISION
        ) {
          this.logger.warn(
            `Research quality below threshold: ${reviewResult.qualityLevel}. ` +
              `Recommendations: ${reviewResult.recommendations.join("; ")}`,
          );

          // ★ 质量修订：对需要修订的维度执行批评-改进循环
          if (
            reviewResult.needsReresearch &&
            reviewResult.dimensionsToReresearch.length > 0
          ) {
            await this.reviseFailedDimensions(
              topic,
              dimensions,
              analysisResults,
              reviewResult,
              topicId,
              report.id,
            );
          }
        }
      } catch (reviewError) {
        if (reviewSpanId) {
          this.agentFacade?.endSpan(reviewSpanId, {
            status: "error",
            error: String(reviewError),
          });
        }
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
      // ★ 更新报告 TODO 和 Task 为进行中
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
      if (missionId) {
        try {
          await this.prisma.researchTask.updateMany({
            where: { missionId, taskType: "report_synthesis" },
            data: {
              status: ResearchTaskStatus.EXECUTING,
              progress: 0,
              startedAt: new Date(),
            },
          });
        } catch {
          /* non-fatal */
        }
      }
      const synthesisSpanId = traceId
        ? this.agentFacade?.addSpan(traceId, {
            name: "Report Synthesis",
            type: "synthesis",
            metadata: { missionId, reportId: report.id },
          })
        : undefined;
      let finalReport: TopicReport;
      try {
        finalReport = await this.reportSynthesisService.synthesizeReport(
          topic,
          report.id,
        );
        if (synthesisSpanId) {
          this.agentFacade?.endSpan(synthesisSpanId, {
            status: "success",
            output: {
              finalReportId: finalReport.id,
              totalSources: finalReport.totalSources,
            },
          });
        }
      } catch (synthErr) {
        if (synthesisSpanId) {
          this.agentFacade?.endSpan(synthesisSpanId, {
            status: "error",
            error: String(synthErr),
          });
        }
        throw synthErr;
      }

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
          const reportContent =
            (finalReport as unknown as { content?: string }).content || "";
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

      // ★ C2 fix: 拆分 todo/task 更新和 mission 更新，确保 mission 始终到达 COMPLETED
      // 1) Todo 更新（非致命）
      try {
        if (reportTodoId)
          await this.researchTodoService.completeTodo(reportTodoId, {
            wordCount: (finalReport as unknown as { fullReport?: string })
              .fullReport?.length,
          });
        if (reviewTodoId) {
          await this.researchTodoService.updateTodoStatus(
            reviewTodoId,
            ResearchTodoStatus.IN_PROGRESS,
            "审核中...",
          );
          await this.researchTodoService.completeTodo(reviewTodoId);
        }
      } catch (todoErr) {
        this.logger.warn(
          `[executeRefresh] Todo update failed (non-fatal): ${todoErr}`,
        );
      }

      // 2) Task 和 Mission 状态更新（独立 try-catch，确保 mission 完成）
      if (missionId) {
        try {
          await this.prisma.researchTask.updateMany({
            where: { missionId, taskType: "report_synthesis" },
            data: {
              status: ResearchTaskStatus.COMPLETED,
              progress: 100,
              completedAt: new Date(),
            },
          });
          await this.prisma.researchTask.updateMany({
            where: { missionId, taskType: "quality_review" },
            data: {
              status: ResearchTaskStatus.COMPLETED,
              progress: 100,
              completedAt: new Date(),
            },
          });
        } catch (taskErr) {
          this.logger.warn(
            `[executeRefresh] Task update failed (non-fatal): ${taskErr}`,
          );
        }

        try {
          await this.prisma.researchMission.update({
            where: { id: missionId },
            data: {
              status: ResearchMissionStatus.COMPLETED,
              completedAt: new Date(),
              completedTasks: dimensions.length + 2,
              progressPercent: 100,
            },
          });
        } catch (missionErr) {
          this.logger.error(
            `[executeRefresh] CRITICAL: Failed to mark mission COMPLETED: ${missionErr}`,
          );
        }
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

      if (traceId) {
        this.agentFacade?.endTrace(traceId, { status: "success" });
        // ★ Batch 2: 火后即忘评估 trace 质量
        if (this.evalPipeline) {
          void this.evalPipeline
            .evaluate(traceId)
            .catch((err) => this.logger.debug(`EvalPipeline failed: ${err}`));
        }
      }

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

      // ★ C4 fix: 中止/失败时清理所有未完成的 Todo、Task、Mission
      if (missionId) {
        try {
          await this.prisma.researchTodo.updateMany({
            where: {
              missionId,
              status: {
                in: [
                  ResearchTodoStatus.PENDING,
                  ResearchTodoStatus.QUEUED,
                  ResearchTodoStatus.IN_PROGRESS,
                ],
              },
            },
            data: { status: ResearchTodoStatus.FAILED },
          });
          await this.prisma.researchTask.updateMany({
            where: {
              missionId,
              status: {
                in: [
                  ResearchTaskStatus.PENDING,
                  ResearchTaskStatus.ASSIGNED,
                  ResearchTaskStatus.EXECUTING,
                ],
              },
            },
            data: { status: ResearchTaskStatus.FAILED },
          });
          await this.prisma.researchMission.update({
            where: { id: missionId },
            data: { status: ResearchMissionStatus.FAILED },
          });
        } catch (cleanupErr) {
          this.logger.warn(
            `[executeRefresh] Cleanup on error failed: ${cleanupErr}`,
          );
        }
      }

      if (traceId) {
        this.agentFacade?.endTrace(traceId, {
          status: "error",
        });
      }

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
    const where: Record<string, unknown> = {
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
   * @param parallelism 并行度限制（默认 4）
   */
  private async researchDimensionsInParallel(
    topic: ResearchTopic,
    dimensions: TopicDimension[],
    reportId: string,
    signal: AbortSignal,
    agentAssignments: AgentAssignment[] = [],
    depthConfig?: ResearchDepthConfig,
    parallelism: number = 4,
  ): Promise<{
    results: PromiseSettledResult<{
      dimensionId: string;
      analysisResult: DimensionAnalysisResult;
      evidenceIds: string[];
      extractedClaims?: import("../../types/v5-research.types").ExtractedClaim[];
    }>[];
    researchDesign?: ResearchDesign;
  }> {
    const totalCount = dimensions.length;

    // Create concurrency limiter
    const limit = pLimit(parallelism);
    this.logger.log(
      `[researchDimensionsInParallel] Using parallelism limit: ${parallelism}`,
    );

    // ============ Phase 1: 并行搜索 ============
    this.logger.log(
      `[researchDimensionsInParallel] Phase 1: Starting parallel search for ${totalCount} dimensions (concurrency: ${parallelism})`,
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

    const searchPromises = dimensions.map((dimension) =>
      limit(async () => {
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
      }),
    );

    const searchResults = await Promise.allSettled(searchPromises);
    const successfulSearches = searchResults.filter(
      (r) => r.status === "fulfilled",
    ) as PromiseFulfilledResult<{
      dimension: TopicDimension;
      assignment: AgentAssignment | undefined;
      searchResult: import("../dimension/dimension-mission.service").SearchPhaseResult;
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
          language: topic.language,
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
      `[researchDimensionsInParallel] Phase 3: Starting parallel writing for ${successfulSearches.length} dimensions (concurrency: ${parallelism})`,
    );

    let completedCount = 0;

    const writingPromises = successfulSearches.map((searchSuccess) =>
      limit(async () => {
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
                language: topic.language,
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
      }),
    );

    const results = await Promise.allSettled(writingPromises);

    // V5: Extract research design from global outline
    const extractedDesign = globalOutline?.researchDesign;

    return { results, researchDesign: extractedDesign };
  }

  /**
   * 发送进度事件
   */
  private emitProgress(event: RefreshProgressEvent): void {
    this.eventEmitter.emit(
      RESEARCH_INTERNAL_EVENTS.TOPIC_RESEARCH_PROGRESS,
      event,
    );
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
   * ★ 对质量审核未通过的维度执行批评-改进循环
   * 最多修订一轮，避免无限循环和过高成本
   */
  private async reviseFailedDimensions(
    topic: ResearchTopic,
    dimensions: TopicDimension[],
    analysisResults: PromiseSettledResult<{
      dimensionId: string;
      analysisResult: DimensionAnalysisResult;
      evidenceIds: string[];
    }>[],
    reviewResult: OverallReviewResult,
    topicId: string,
    reportId: string,
  ): Promise<void> {
    const dimensionIds = new Set(reviewResult.dimensionsToReresearch);
    this.logger.log(
      `[reviseFailedDimensions] Revising ${dimensionIds.size} dimensions: ${[...dimensionIds].join(", ")}`,
    );

    this.emitProgress({
      topicId,
      reportId,
      phase: "reviewing",
      progress: 78,
      completedDimensions: 0,
      totalDimensions: dimensionIds.size,
      message: `正在修订 ${dimensionIds.size} 个未达标维度...`,
    });

    let revisedCount = 0;

    for (const result of analysisResults) {
      if (result.status !== "fulfilled") continue;
      if (!dimensionIds.has(result.value.dimensionId)) continue;

      const { dimensionId, analysisResult } = result.value;
      const dimension = dimensions.find((d) => d.id === dimensionId);
      if (!dimension || !analysisResult.detailedContent) continue;

      // 找到该维度的审核反馈
      const dimReview = reviewResult.dimensionReviews.find(
        (r) => r.dimensionId === dimensionId,
      );
      const qualityFeedback = dimReview
        ? `质量评分: ${dimReview.overallScore}/100. 问题: ${dimReview.issues.map((i) => i.description).join("; ")}. 建议: ${dimReview.suggestions.join("; ")}`
        : reviewResult.recommendations.join("; ");

      try {
        this.logger.log(
          `[reviseFailedDimensions] Revising dimension: ${dimension.name}`,
        );

        const critiqueRequest: CritiqueRefineRequest = {
          content: analysisResult.detailedContent,
          context: {
            topicName: topic.name,
            dimensionName: dimension.name,
            qualityExpectation: qualityFeedback,
          },
          config: { maxIterations: 1 },
        };

        const refineResult =
          await this.critiqueRefineService.runCritiqueRefineLoop(
            critiqueRequest,
          );

        if (refineResult.finalContent !== analysisResult.detailedContent) {
          // 更新内存中的分析结果（供后续 synthesis 使用）
          analysisResult.detailedContent = refineResult.finalContent;

          // 同步更新数据库中的 DimensionAnalysis.dataPoints
          const existingAnalysis =
            await this.prisma.dimensionAnalysis.findFirst({
              where: { dimensionId, reportId },
              orderBy: { createdAt: "desc" },
            });
          if (existingAnalysis) {
            const dataPoints =
              (existingAnalysis.dataPoints as Record<string, unknown>) || {};
            dataPoints.detailedContent = refineResult.finalContent;
            await this.prisma.dimensionAnalysis.update({
              where: { id: existingAnalysis.id },
              data: {
                dataPoints:
                  dataPoints as import("@prisma/client").Prisma.InputJsonValue,
              },
            });
          }

          revisedCount++;
          this.logger.log(
            `[reviseFailedDimensions] ✓ Revised ${dimension.name} (${refineResult.totalChanges} changes in ${refineResult.iterations.length} iteration(s))`,
          );
        }
      } catch (revisionError) {
        this.logger.warn(
          `[reviseFailedDimensions] Failed to revise ${dimension.name}: ${revisionError}`,
        );
        // 非致命错误，继续处理其他维度
      }
    }

    this.logger.log(
      `[reviseFailedDimensions] Completed: ${revisedCount}/${dimensionIds.size} dimensions revised`,
    );
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
      extractedClaims?: import("../../types/v5-research.types").ExtractedClaim[];
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
