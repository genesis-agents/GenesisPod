import {
  Injectable,
  Logger,
  InternalServerErrorException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pLimit: (concurrency: number) => <T>(fn: () => Promise<T>) => Promise<T> =
  // p-limit is ESM-only; handle both CJS interop shapes
  (() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("p-limit");
    return mod.default || mod;
  })();
import type { ResearchTopic, TopicDimension } from "@prisma/client";
import { DimensionMissionService } from "../dimension/dimension-mission.service";
import { ResearchReviewerService } from "../collaboration/research-reviewer.service";
import { ResearchCheckpointService } from "../monitoring/research-checkpoint.service";
import {
  CritiqueRefineService,
  type CritiqueRefineRequest,
} from "../quality/critique-refine.service";
import { ResearchLeaderService } from "./research-leader.service";
import {
  type OverallReviewResult,
} from "../../types/collaboration.types";
import { type AgentAssignment } from "../../types/leader.types";
import type { DimensionAnalysisResult } from "../../types/research.types";
import type {
  ResearchDepthConfig,
  ResearchDesign,
} from "../../types/v5-research.types";
import { RESEARCH_INTERNAL_EVENTS } from "./research-event-emitter.service";
import { EventEmitter2 } from "@nestjs/event-emitter";
import type { RefreshProgressEvent } from "./topic-team-orchestrator.service";

/**
 * Refresh Pipeline Service
 *
 * Orchestrates the core research pipeline stages INSIDE executeRefresh:
 * 1. Parallel dimension research (3-phase: search → global outline → writing)
 * 2. Failed dimension revision (critique-refine loop)
 * 3. Quality review
 */
@Injectable()
export class RefreshPipelineService {
  private readonly logger = new Logger(RefreshPipelineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly dimensionMissionService: DimensionMissionService,
    private readonly researchReviewerService: ResearchReviewerService,
    private readonly researchCheckpointService: ResearchCheckpointService,
    private readonly critiqueRefineService: CritiqueRefineService,
    private readonly researchLeaderService: ResearchLeaderService,
  ) {}

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
  async researchDimensionsInParallel(
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
        } catch (err) {
          this.logger.warn(
            `[researchDimensionsInParallel] Non-fatal error marking dimension as FAILED after search error: ${(err as Error).message}`,
          );
        }
      }
    }

    if (successfulSearches.length === 0) {
      throw new ServiceUnavailableException("All dimension searches failed");
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
    } catch (err) {
      this.logger.warn(
        `[researchDimensionsInParallel] Non-fatal error saving Phase 1 search checkpoint: ${(err as Error).message}`,
      );
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
            throw new InternalServerErrorException(
              missionResult.error || "Dimension writing failed",
            );
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
          } catch (err) {
            this.logger.warn(
              `[RefreshPipelineService] Non-fatal error saving L4 writing checkpoint for dimension "${dimension.name}": ${(err as Error).message}`,
            );
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
          } catch (err) {
            this.logger.warn(
              `[RefreshPipelineService] Non-fatal error marking dimension as FAILED after write error: ${(err as Error).message}`,
            );
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
   * ★ 对质量审核未通过的维度执行批评-改进循环
   * 最多修订一轮，避免无限循环和过高成本
   */
  async reviseFailedDimensions(
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
            `[reviseFailedDimensions] Revised ${dimension.name} (${refineResult.totalChanges} changes in ${refineResult.iterations.length} iteration(s))`,
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
  async reviewResearchQuality(
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

  /**
   * 发送进度事件
   */
  private emitProgress(event: RefreshProgressEvent): void {
    this.eventEmitter.emit(
      RESEARCH_INTERNAL_EVENTS.TOPIC_RESEARCH_PROGRESS,
      event,
    );
  }
}
