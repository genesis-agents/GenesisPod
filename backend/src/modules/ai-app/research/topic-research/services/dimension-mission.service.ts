/**
 * Dimension Mission Service
 *
 * 维度研究的 Mission 协调器
 *
 * 核心职责：
 * 1. 调用 Leader 规划维度分析大纲
 * 2. 按照大纲创建章节任务
 * 3. 调用 Agent 写作各章节
 * 4. 调用 Leader 审核各章节（支持多轮修订）
 * 5. 调用 Leader 整合最终结果
 *
 * 解决的问题：
 * - 避免单次 LLM 调用生成超长内容导致截断
 * - 充分发挥 Leader-Agent 协作机制
 * - 支持多轮质量审核
 */

import { Injectable, Logger, forwardRef, Inject } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import {
  DimensionStatus,
  type ResearchTopic,
  type TopicDimension,
} from "@prisma/client";
import {
  ResearchLeaderService,
  type DimensionOutline,
  type SectionPlan,
  type IntegratedDimensionResult,
} from "./research-leader.service";
import {
  SectionWriterService,
  type SectionWriteResult,
  type TemporalContext,
} from "./section-writer.service";
import { DataSourceRouterService } from "./data-source-router.service";
import { ResearchEventEmitterService } from "./research-event-emitter.service";
import {
  AgentActivityService,
  type ThinkingPhase,
  type SearchResultsRecord,
} from "./agent-activity.service";
import { DataEnrichmentService } from "./data-enrichment.service";
import { LeaderToolService } from "./leader-tool.service";
import type {
  EvidenceData,
  DimensionAnalysisResult,
  EnrichedEvidenceData,
  GeneratedChart,
  FigureReference,
} from "../types/research.types";
import { AgentActivityType } from "@prisma/client";
import {
  getCurrentDateString,
  getFreshnessRequirementDescription,
} from "../prompts/dimension-research.prompt";
import { AICapabilityContext } from "@/modules/ai-engine/capabilities/ai-capability-resolver.service";

/**
 * 维度 Mission 执行结果
 */
export interface DimensionMissionResult {
  success: boolean;
  dimensionId: string;
  analysisResult?: DimensionAnalysisResult;
  evidenceIds: string[];
  outline?: DimensionOutline;
  sectionResults?: SectionWriteResult[];
  integratedResult?: IntegratedDimensionResult;
  error?: string;
  actualModelId?: string; // ★ 实际使用的模型
  /** V5: 提取的事实断言（用于后续验证） */
  extractedClaims?: import("../types/v5-research.types").ExtractedClaim[];
}

/**
 * Mission 执行进度
 */
export interface MissionProgress {
  stage:
    | "planning"
    | "writing"
    | "reviewing"
    | "integrating"
    | "completed"
    | "failed";
  sectionsTotal: number;
  sectionsCompleted: number;
  currentSection?: string;
  message: string;
}

/**
 * 搜索阶段结果（Phase 1）
 */
export interface SearchPhaseResult {
  dimensionId: string;
  dimensionName: string;
  enrichedResults: import("../types/research.types").EnrichedResult[];
  evidenceData: EnrichedEvidenceData[];
  evidenceSummary: string;
  searchResultsRecord: SearchResultsRecord;
  temporalContext: TemporalContext;
  figuresSummary: string;
  leaderContextSummary: string;
  /** Phase 1 使用的模型、工具、技能（便于 Phase 3 调试） */
  modelId?: string;
  assignedTools?: string[];
  assignedSkills?: string[];
  /** V5: 验证上下文（注入到写作 prompt） */
  validationContext?: string;
}

@Injectable()
export class DimensionMissionService {
  private readonly logger = new Logger(DimensionMissionService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => ResearchLeaderService))
    private readonly leaderService: ResearchLeaderService,
    private readonly sectionWriter: SectionWriterService,
    private readonly dataSourceRouter: DataSourceRouterService,
    private readonly eventEmitter: ResearchEventEmitterService,
    private readonly agentActivity: AgentActivityService,
    private readonly dataEnrichment: DataEnrichmentService,
    private readonly leaderTool: LeaderToolService,
  ) {}

  /**
   * 执行搜索阶段（Phase 1）
   *
   * 职责：
   * 1. 执行搜索并收集资料
   * 2. 数据增强和图表提取
   * 3. 生成证据摘要和时间上下文
   * 4. Leader 主动搜索补充上下文
   *
   * @param topic 研究专题
   * @param dimension 研究维度
   * @param missionId 任务ID（可选，用于持久化团队消息）
   * @param modelId Leader 分配的模型 ID
   * @param taskId 研究任务ID（可选，用于前端精确匹配进度更新）
   * @param assignedTools Leader 分配的工具
   * @param assignedSkills Leader 分配的技能
   * @returns 搜索阶段结果
   */
  async executeSearchPhase(
    topic: ResearchTopic,
    dimension: TopicDimension,
    missionId?: string,
    modelId?: string,
    taskId?: string,
    assignedTools?: string[],
    assignedSkills?: string[],
  ): Promise<SearchPhaseResult> {
    const dimId = dimension.id.slice(0, 8);
    const logPrefix = `[Dimension:${dimension.name}:${dimId}]`;

    this.logger.log(
      `${logPrefix} Starting search phase (topicId=${topic.id.slice(0, 8)})${modelId ? `, model: ${modelId}` : ""}`,
    );

    // Update dimension status to RESEARCHING
    await this.prisma.topicDimension.update({
      where: { id: dimension.id },
      data: { status: DimensionStatus.RESEARCHING },
    });

    const researcherAgentId = `researcher_${dimId}`;
    const researcherAgentName = "研究员";
    const effectiveMissionId = missionId || dimension.id;

    // Suppress unused variable warnings - these are used in the search phase
    void researcherAgentId;
    void researcherAgentName;

    // 1. 获取搜索结果
    this.emitProgress(
      topic.id,
      dimension.name,
      {
        stage: "planning",
        sectionsTotal: 0,
        sectionsCompleted: 0,
        message: "正在收集资料...",
      },
      missionId,
      5,
      taskId,
    );

    await this.agentActivity.startThinkingPhase({
      topicId: topic.id,
      missionId: effectiveMissionId,
      dimensionId: dimension.id,
      dimensionName: dimension.name,
      agentId: researcherAgentId,
      agentName: researcherAgentName,
      agentRole: "researcher",
      activityType: AgentActivityType.RESEARCHING,
      phase: "searching",
      content: `正在为维度「${dimension.name}」收集资料...`,
      progress: 0,
      thinkingPhase: "searching" as ThinkingPhase,
      thinkingContent: `搜索关键词: ${Array.isArray(dimension.searchQueries) ? dimension.searchQueries.join(", ") : dimension.name}`,
    });

    const searchResult = await this.dataSourceRouter.fetchDataForDimension(
      dimension,
      topic,
      {
        assignedTools,
        assignedSkills,
      },
    );

    this.logger.log(
      `${logPrefix} Search completed: ${searchResult.items.length} sources found`,
    );

    // 2. 数据增强
    const topicConfig = topic.topicConfig as Record<string, unknown> | null;
    const enrichmentTopN = (topicConfig?.enrichmentTopN as number) || 5;
    const enrichmentMaxLength =
      (topicConfig?.enrichmentMaxLength as number) || 3000;
    const enableFigures = topicConfig?.enableFigures !== false;

    this.logger.log(
      `${logPrefix} Enriching search results (topN=${enrichmentTopN}, enableFigures=${enableFigures})...`,
    );
    const enrichedResults = await this.dataEnrichment.enrichSearchResults(
      searchResult.items,
      {
        topN: enrichmentTopN,
        maxContentLength: enrichmentMaxLength,
        enableFigures,
      },
    );

    const enrichmentStats =
      this.dataEnrichment.getEnrichmentStats(enrichedResults);
    this.logger.log(
      `${logPrefix} Enrichment: ${enrichmentStats.fetched}/${enrichmentStats.total} fetched, ` +
        `${enrichmentStats.validUrls} valid URLs, avg ${enrichmentStats.avgContentLength} chars`,
    );

    if (enrichmentStats.invalidUrls > 0) {
      this.logger.warn(
        `${logPrefix} Found ${enrichmentStats.invalidUrls} invalid URLs (404/error pages)`,
      );
    }

    await this.eventEmitter.emitAgentWorking(
      topic.id,
      {
        agentId: researcherAgentId,
        agentName: researcherAgentName,
        agentRole: "researcher",
        status: "working",
        taskDescription: `维度「${dimension.name}」资料收集完成：找到 ${searchResult.items.length} 条结果，增强处理 ${enrichedResults.length} 条`,
        dimensionId: dimension.id,
        dimensionName: dimension.name,
        progress: 15,
        modelId,
      },
      effectiveMissionId,
    );

    // 3. 计算时效性信息
    const publishedDates = enrichedResults
      .map((item) => {
        if (!item.publishedAt) return null;
        const d =
          item.publishedAt instanceof Date
            ? item.publishedAt
            : new Date(item.publishedAt);
        return !isNaN(d.getTime()) ? d : null;
      })
      .filter((d): d is Date => d !== null)
      .sort((a, b) => b.getTime() - a.getTime());

    const freshnessInfo =
      publishedDates.length > 0
        ? {
            newestDate: publishedDates[0]?.toISOString(),
            oldestDate:
              publishedDates[publishedDates.length - 1]?.toISOString(),
            avgAgeInDays: Math.round(
              publishedDates.reduce(
                (sum, d) =>
                  sum + (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24),
                0,
              ) / publishedDates.length,
            ),
          }
        : undefined;

    const usedSources = (searchResult.sources || [])
      .map((s) => String(s))
      .join(", ");

    const knowledgeBaseResults = searchResult.items.filter(
      (item) =>
        String(item.sourceType).toLowerCase() === "local" ||
        (item.metadata as Record<string, unknown>)?.knowledgeBaseSource,
    );
    const knowledgeBaseIds = (topicConfig?.knowledgeBaseIds as string[]) || [];
    const knowledgeBaseInfo =
      knowledgeBaseIds.length > 0
        ? {
            enabled: true,
            knowledgeBaseIds,
            matchedCount: knowledgeBaseResults.length,
            avgSimilarity:
              knowledgeBaseResults.length > 0
                ? knowledgeBaseResults.reduce(
                    (sum, item) =>
                      sum +
                      (((item.metadata as Record<string, unknown>)
                        ?.similarity as number) || 0),
                    0,
                  ) / knowledgeBaseResults.length
                : undefined,
          }
        : undefined;

    if (knowledgeBaseInfo?.matchedCount && knowledgeBaseInfo.matchedCount > 0) {
      this.logger.log(
        `${logPrefix} ★ Knowledge base used! Matched ${knowledgeBaseInfo.matchedCount} results ` +
          `from ${knowledgeBaseIds.length} knowledge bases. Avg similarity: ${knowledgeBaseInfo.avgSimilarity?.toFixed(2) || "N/A"}`,
      );
    }

    const searchResultsRecord: SearchResultsRecord = {
      total: searchResult.items.length,
      filtered: enrichedResults.length,
      searchTool: usedSources || "web",
      query: searchResult.metadata?.searchQuery || dimension.name,
      searchedAt: new Date().toISOString(),
      freshnessInfo,
      knowledgeBaseInfo,
      sources: enrichedResults.slice(0, 20).map((item) => {
        let publishedDate: string | undefined;
        if (item.publishedAt) {
          try {
            const d =
              item.publishedAt instanceof Date
                ? item.publishedAt
                : new Date(item.publishedAt);
            if (!isNaN(d.getTime())) {
              publishedDate = d.toISOString();
            }
          } catch {
            // ignore
          }
        }
        const metadata = item.metadata as Record<string, unknown> | undefined;
        const isKnowledgeBase =
          String(item.sourceType).toLowerCase() === "local" ||
          metadata?.knowledgeBaseSource === true;
        return {
          title: item.title || "未知标题",
          url: item.url || "",
          domain: item.domain,
          sourceType: String(item.sourceType),
          publishedDate,
          isKnowledgeBase,
          similarity: isKnowledgeBase
            ? (metadata?.similarity as number | undefined)
            : undefined,
          documentId: isKnowledgeBase
            ? (metadata?.documentId as string | undefined)
            : undefined,
        };
      }),
    };

    await this.agentActivity.endThinkingPhase(
      topic.id,
      researcherAgentId,
      "searching" as ThinkingPhase,
      {
        searchResults: searchResultsRecord,
        finalContent: `搜索完成，找到 ${searchResult.items.length} 条资料，${enrichmentStats.fetched} 条已增强完整内容`,
      },
    );

    await this.eventEmitter.emitAgentWorking(
      topic.id,
      {
        agentId: researcherAgentId,
        agentName: researcherAgentName,
        agentRole: "researcher",
        status: "working",
        taskDescription: `维度「${dimension.name}」搜索完成：${searchResultsRecord.searchTool || "网络"} 找到 ${searchResultsRecord.total} 条${searchResultsRecord.knowledgeBaseInfo?.matchedCount ? `，知识库匹配 ${searchResultsRecord.knowledgeBaseInfo.matchedCount} 条` : ""}`,
        dimensionId: dimension.id,
        dimensionName: dimension.name,
        progress: 20,
        modelId,
        searchResults: searchResultsRecord,
      },
      effectiveMissionId,
    );

    // 4. 生成时间上下文
    const searchTimeRange =
      (topicConfig?.searchTimeRange as string) || undefined;
    const temporalContext: TemporalContext = {
      currentDate: getCurrentDateString(),
      freshnessRequirement: getFreshnessRequirementDescription(searchTimeRange),
    };

    this.logger.log(
      `${logPrefix} Temporal context: ${temporalContext.currentDate}, ${searchTimeRange || "default"}`,
    );

    // 5. Leader 主动搜索获取额外上下文
    const leaderAgentId = "leader-" + dimId;
    const leaderCapabilityContext: AICapabilityContext = {
      agentId: leaderAgentId,
      domain: "research",
      roleId: "research-leader",
      userId: topic.userId || undefined,
    };

    let leaderContextSummary = "";
    try {
      const leaderContext =
        await this.leaderTool.generateEnhancedPlanningContext(
          {
            topicName: topic.name,
            topicDescription: topic.description || undefined,
            dimensionName: dimension.name,
            searchTimeRange,
          },
          leaderCapabilityContext,
        );
      leaderContextSummary = leaderContext.contextSummary;
      this.logger.log(
        `${logPrefix} Leader gathered additional context: ${leaderContextSummary.length} chars`,
      );
    } catch (error) {
      this.logger.warn(
        `${logPrefix} Leader context gathering failed (non-fatal): ${error}`,
      );
    }

    // 6. 准备证据数据
    const evidenceData = this.prepareEnrichedEvidenceData(enrichedResults);
    const evidenceSummary =
      this.createEvidenceSummary(evidenceData) +
      (leaderContextSummary ? `\n\n## 最新背景\n${leaderContextSummary}` : "");

    const figuresSummary = this.buildFiguresSummary(
      evidenceData as EnrichedEvidenceData[],
    );
    if (figuresSummary) {
      this.logger.log(
        `${logPrefix} Figures summary for Leader: ${figuresSummary.split("\n").length - 1} figures available`,
      );
    }

    return {
      dimensionId: dimension.id,
      dimensionName: dimension.name,
      enrichedResults,
      evidenceData: evidenceData as EnrichedEvidenceData[],
      evidenceSummary,
      searchResultsRecord,
      temporalContext,
      figuresSummary,
      leaderContextSummary,
      modelId,
      assignedTools,
      assignedSkills,
    };
  }

  /**
   * 执行维度研究 Mission
   *
   * 完整流程：
   * 1. Leader 规划大纲
   * 2. Agent 写作各章节（可并行）
   * 3. Leader 审核各章节（多轮修订）
   * 4. Leader 整合最终结果
   *
   * @param topic 研究专题
   * @param dimension 研究维度
   * @param reportId 报告ID（可选，用于关联证据）
   * @param missionId 任务ID（可选，用于持久化团队消息）
   * @param modelId ★ Leader 分配给此维度研究员的模型 ID（实现多元化）
   * @param taskId ★ 研究任务ID（可选，用于前端精确匹配进度更新）
   * @returns Mission 执行结果
   */
  async executeDimensionMission(
    topic: ResearchTopic,
    dimension: TopicDimension,
    reportId?: string,
    missionId?: string,
    modelId?: string,
    taskId?: string,
    assignedTools?: string[], // ★ Leader 分配的工具
    assignedSkills?: string[], // ★ Leader 分配的技能
    maxRevisionRounds?: number, // V5: 最大修订轮次（来自 depthConfig）
  ): Promise<DimensionMissionResult> {
    // ★ 统一日志前缀，便于区分不同维度的 Agent
    const dimId = dimension.id.slice(0, 8);
    const logPrefix = `[Dimension:${dimension.name}:${dimId}]`;

    this.logger.log(
      `${logPrefix} Starting mission (topicId=${topic.id.slice(0, 8)}, reportId=${reportId || "NONE"})${modelId ? `, model: ${modelId}` : ""}`,
    );

    // ★ 更新维度状态为 RESEARCHING
    await this.prisma.topicDimension.update({
      where: { id: dimension.id },
      data: { status: DimensionStatus.RESEARCHING },
    });

    const leaderAgentId = "leader-" + dimId;
    const leaderAgentName = "研究组长";
    const effectiveMissionId = missionId || dimension.id;

    try {
      // V5: Literature baseline scan (standard/thorough only)
      if (maxRevisionRounds !== undefined && maxRevisionRounds > 0) {
        try {
          this.logger.log(
            `${logPrefix} [V5] Running literature baseline scan before search`,
          );
          await this.dataSourceRouter.scanLiteratureBaseline(topic, dimension);
          this.logger.log(
            `${logPrefix} [V5] Literature baseline scan complete`,
          );
        } catch (error) {
          this.logger.warn(
            `${logPrefix} [V5] Literature baseline scan failed (non-fatal): ${error}`,
          );
        }
      }

      // Phase 1: 执行搜索阶段
      const searchPhaseResult = await this.executeSearchPhase(
        topic,
        dimension,
        missionId,
        modelId,
        taskId,
        assignedTools,
        assignedSkills,
      );

      // Phase 2: Leader 本地规划大纲（非全局协调）
      // 发送 Leader 思考事件 - 理解阶段
      await this.eventEmitter.emitLeaderThinking(topic.id, {
        missionId: missionId || dimension.id,
        phase: "understanding",
        content: `正在理解研究主题「${topic.name}」的需求，分析维度「${dimension.name}」的研究范围...`,
        progress: 10,
      });

      this.emitProgress(
        topic.id,
        dimension.name,
        {
          stage: "planning",
          sectionsTotal: 0,
          sectionsCompleted: 0,
          message: "Leader 正在规划研究大纲...",
        },
        missionId,
        undefined,
        taskId,
      );

      await this.agentActivity.startThinkingPhase({
        topicId: topic.id,
        missionId: effectiveMissionId,
        dimensionId: dimension.id,
        dimensionName: dimension.name,
        agentId: leaderAgentId,
        agentName: leaderAgentName,
        agentRole: "leader",
        activityType: AgentActivityType.PLANNING,
        phase: "planning",
        content: `正在规划维度「${dimension.name}」的研究大纲...`,
        progress: 0,
        thinkingPhase: "understanding" as ThinkingPhase,
        thinkingContent: `分析研究主题：${topic.name}\n维度：${dimension.name}\n参考资料数量：${searchPhaseResult.evidenceSummary.split("\n").length} 条`,
      });

      // 查询所有维度，传给 Leader 避免跨维度重复
      const allDimensions = await this.prisma.topicDimension.findMany({
        where: { topicId: topic.id },
        select: { name: true, description: true },
      });

      const outline = await this.leaderService.planDimensionOutline(
        { name: topic.name, type: topic.type, description: topic.description },
        {
          name: dimension.name,
          description: dimension.description,
          searchQueries: dimension.searchQueries,
        },
        searchPhaseResult.evidenceSummary,
        searchPhaseResult.figuresSummary || undefined,
        allDimensions,
      );

      this.logger.log(
        `${logPrefix} Local outline planned: ${outline.sections.length} sections`,
      );

      // Phase 3: 执行写作阶段
      const writingResult = await this.executeWritingPhase(
        topic,
        dimension,
        searchPhaseResult,
        outline,
        reportId,
        missionId,
        modelId,
        taskId,
        assignedTools,
        assignedSkills,
        undefined, // validationContext
        maxRevisionRounds, // V5: 最大修订轮次
      );

      return writingResult;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        `${logPrefix} Mission FAILED: ${errorMessage}`,
        error instanceof Error ? error.stack : error,
      );

      // ★ 更新维度状态为 FAILED
      await this.prisma.topicDimension.update({
        where: { id: dimension.id },
        data: { status: DimensionStatus.FAILED },
      });

      this.emitProgress(
        topic.id,
        dimension.name,
        {
          stage: "failed",
          sectionsTotal: 0,
          sectionsCompleted: 0,
          message: `研究失败: ${errorMessage}`,
        },
        missionId,
        undefined,
        taskId, // ★ 传递 taskId
      );

      return {
        success: false,
        dimensionId: dimension.id,
        evidenceIds: [],
        error: errorMessage,
      };
    }
  }

  /**
   * 执行写作阶段（Phase 3）
   *
   * 职责：
   * 1. 使用全局协调的 outline 进行写作（而非本地规划）
   * 2. Agent 写作各章节
   * 3. Leader 审核各章节
   * 4. Leader 整合最终结果
   * 5. 保存证据和生成分析结果
   *
   * @param topic 研究专题
   * @param dimension 研究维度
   * @param searchPhaseResult 搜索阶段结果
   * @param outline 全局协调的维度大纲
   * @param reportId 报告ID
   * @param missionId 任务ID
   * @param modelId Leader 分配的模型 ID
   * @param taskId 研究任务ID
   * @param assignedTools Leader 分配的工具
   * @param assignedSkills Leader 分配的技能
   * @returns Mission 执行结果
   */
  async executeWritingPhase(
    topic: ResearchTopic,
    dimension: TopicDimension,
    searchPhaseResult: SearchPhaseResult,
    outline: DimensionOutline,
    reportId?: string,
    missionId?: string,
    modelId?: string,
    taskId?: string,
    _assignedTools?: string[], // Prefixed with _ to indicate intentionally unused
    _assignedSkills?: string[], // Prefixed with _ to indicate intentionally unused
    validationContext?: string, // V5: 验证上下文
    maxRevisionRounds?: number, // V5: 最大修订轮次（来自 depthConfig）
  ): Promise<DimensionMissionResult> {
    const dimId = dimension.id.slice(0, 8);
    const logPrefix = `[Dimension:${dimension.name}:${dimId}]`;

    this.logger.log(
      `${logPrefix} Starting writing phase with global outline (${outline.sections.length} sections)`,
    );

    const leaderAgentId = "leader-" + dimId;
    const leaderAgentName = "研究组长";
    const researcherAgentId = `researcher_${dimId}`;
    const researcherAgentName = "研究员";
    const effectiveMissionId = missionId || dimension.id;

    try {
      // 1. 校验并清理 Leader 分配的图表
      this.validateAllocatedFigures(
        outline,
        searchPhaseResult.evidenceData as EnrichedEvidenceData[],
      );

      this.logger.log(
        `${logPrefix} Outline validated: ${outline.sections.length} sections`,
      );

      // 记录规划完成
      const understanding = outline.intentUnderstanding;
      await this.agentActivity.endThinkingPhase(
        topic.id,
        leaderAgentId,
        "understanding" as ThinkingPhase,
        {
          actionResult: {
            sectionsCount: outline.sections.length,
            coreQuestion: understanding.coreQuestion,
            scope: understanding.scope.included,
            expectedDepth: understanding.expectedDepth,
            sections: outline.sections.map((s) => s.title),
          },
          finalContent: `规划完成：${outline.sections.length} 个章节\n核心问题: ${understanding.coreQuestion}\n研究范围: ${understanding.scope.included.join(", ")}`,
        },
      );

      // 发送 Leader 规划完成事件
      await this.eventEmitter.emitLeaderPlanReady(
        topic.id,
        dimension.id,
        outline.sections.length,
        outline.sections.length,
      );

      await this.eventEmitter.emitLeaderThinking(topic.id, {
        missionId: missionId || dimension.id,
        phase: "analyzing",
        content: `核心问题: ${understanding.coreQuestion}\n研究范围: ${understanding.scope.included.join(", ")}\n期望深度: ${understanding.expectedDepth}`,
        progress: 20,
      });

      // 2. Agent 写作各章节
      this.emitProgress(
        topic.id,
        dimension.name,
        {
          stage: "writing",
          sectionsTotal: outline.sections.length,
          sectionsCompleted: 0,
          message: "Agent 正在撰写章节...",
        },
        missionId,
        undefined,
        taskId,
      );

      await this.agentActivity.startThinkingPhase({
        topicId: topic.id,
        missionId: effectiveMissionId,
        dimensionId: dimension.id,
        dimensionName: dimension.name,
        agentId: researcherAgentId,
        agentName: researcherAgentName,
        agentRole: "researcher",
        activityType: AgentActivityType.WRITING,
        phase: "writing",
        content: `开始撰写 ${outline.sections.length} 个章节...`,
        progress: 0,
        thinkingPhase: "writing" as ThinkingPhase,
        thinkingContent: `章节列表：${outline.sections.map((s) => s.title).join("、")}`,
      });

      const sectionResults = await this.writeSectionsWithReview(
        topic.id,
        dimension,
        outline,
        searchPhaseResult.evidenceData,
        missionId,
        modelId,
        searchPhaseResult.temporalContext,
        taskId,
        validationContext, // V5
        maxRevisionRounds, // V5
      );

      // 记录写作完成
      const totalWordCount = sectionResults.reduce(
        (sum, r) => sum + (r.content?.length || 0),
        0,
      );
      await this.agentActivity.endThinkingPhase(
        topic.id,
        researcherAgentId,
        "writing" as ThinkingPhase,
        {
          writingProgress: {
            sections: sectionResults.map((r) => ({
              id: r.sectionId,
              title: r.title,
              status: "completed" as const,
              wordCount: r.content?.length || 0,
            })),
            totalWordCount,
            completedSections: sectionResults.length,
            totalSections: outline.sections.length,
          },
          finalContent: `写作完成：${sectionResults.length} 个章节，共 ${totalWordCount} 字`,
        },
      );

      // V5: Extract claims from all sections
      const allSectionContents = sectionResults.map((r) => ({
        sectionId: r.sectionId,
        content: r.content,
      }));

      let extractedClaims: import("../types/v5-research.types").ExtractedClaim[] =
        [];
      try {
        const claimPromises = allSectionContents.map((sc) =>
          this.leaderService.extractClaims(sc.sectionId, sc.content),
        );
        const claimResults = await Promise.all(claimPromises);
        extractedClaims = claimResults.flat();
        this.logger.log(
          `${logPrefix} V5: Extracted ${extractedClaims.length} claims from ${allSectionContents.length} sections`,
        );
      } catch (error) {
        this.logger.warn(
          `${logPrefix} V5: Claim extraction failed (non-fatal): ${error}`,
        );
      }

      // 3. Leader 整合结果
      this.emitProgress(
        topic.id,
        dimension.name,
        {
          stage: "integrating",
          sectionsTotal: outline.sections.length,
          sectionsCompleted: outline.sections.length,
          message: "Leader 正在整合最终报告...",
        },
        missionId,
        undefined,
        taskId,
      );

      await this.agentActivity.startThinkingPhase({
        topicId: topic.id,
        missionId: effectiveMissionId,
        dimensionId: dimension.id,
        dimensionName: dimension.name,
        agentId: leaderAgentId,
        agentName: leaderAgentName,
        agentRole: "leader",
        activityType: AgentActivityType.REVIEWING,
        phase: "integrating",
        content: `正在整合 ${sectionResults.length} 个章节的研究结果...`,
        progress: 0,
        thinkingPhase: "integrating" as ThinkingPhase,
        thinkingContent: `整合章节：${sectionResults.map((s) => s.title).join("、")}`,
      });

      const integratedResult =
        await this.leaderService.integrateDimensionResults(
          { name: dimension.name, description: dimension.description },
          sectionResults.map((r) => ({ title: r.title, content: r.content })),
        );

      await this.agentActivity.endThinkingPhase(
        topic.id,
        leaderAgentId,
        "integrating" as ThinkingPhase,
        {
          actionResult: {
            summary: integratedResult.metadata?.summary?.substring(0, 200),
            keyFindings: integratedResult.metadata?.keyFindings?.length || 0,
            contentLength: integratedResult.content?.length || 0,
          },
          finalContent: `整合完成：摘要 ${integratedResult.metadata?.summary?.length || 0} 字，关键发现 ${integratedResult.metadata?.keyFindings?.length || 0} 条`,
        },
      );

      // 4. 汇总所有章节的图表（去重）
      const allGeneratedChartsRaw = sectionResults.flatMap(
        (r) => r.generatedCharts || [],
      );
      const seenChartTitles = new Set<string>();
      const allGeneratedCharts = allGeneratedChartsRaw.filter((chart) => {
        const key = chart.title?.trim().toLowerCase();
        if (!key) return true;
        if (seenChartTitles.has(key)) return false;
        seenChartTitles.add(key);
        return true;
      });

      const allFigureReferencesRaw = sectionResults.flatMap(
        (r) => r.figureReferences || [],
      );
      const seenImageUrls = new Set<string>();
      const allFigureReferences = allFigureReferencesRaw.filter((fig) => {
        if (!fig.imageUrl) return false;
        if (seenImageUrls.has(fig.imageUrl)) return false;
        seenImageUrls.add(fig.imageUrl);
        return true;
      });
      this.logger.log(
        `${logPrefix} Charts from sections: ${allFigureReferences.length} refs, ${allGeneratedCharts.length} generated`,
      );

      // 5. 保存证据到数据库并替换临时ID
      let savedEvidenceIds: string[] = [];
      let finalIntegratedResult = integratedResult;
      this.logger.log(
        `${logPrefix} Saving evidence: ${searchPhaseResult.evidenceData.length} items, reportId=${reportId || "NONE"}`,
      );
      if (reportId) {
        const { savedIds, indexMapping } = await this.saveEvidence(
          searchPhaseResult.evidenceData,
          reportId,
        );
        savedEvidenceIds = savedIds;
        this.logger.log(
          `${logPrefix} Evidence saved: ${savedIds.length} items`,
        );

        if (indexMapping.size > 0) {
          finalIntegratedResult = {
            ...integratedResult,
            content: this.replaceEvidenceIds(
              integratedResult.content,
              indexMapping,
            ),
          };
        }

        if (indexMapping.size > 0) {
          for (const ref of allFigureReferences) {
            const mapped = indexMapping.get(ref.evidenceCitationIndex);
            if (mapped !== undefined) {
              ref.evidenceCitationIndex = mapped;
            }
          }
        }
      }

      // 6. 转换为标准结果格式
      const analysisResult = this.convertToAnalysisResult(
        dimension.id,
        finalIntegratedResult,
        savedEvidenceIds,
        allFigureReferences,
        allGeneratedCharts,
      );

      // 7. 更新维度状态为 COMPLETED
      await this.prisma.topicDimension.update({
        where: { id: dimension.id },
        data: {
          status: DimensionStatus.COMPLETED,
          lastResearchedAt: new Date(),
        },
      });
      this.logger.log(`${logPrefix} Status updated to COMPLETED`);

      // 8. 完成
      this.emitProgress(
        topic.id,
        dimension.name,
        {
          stage: "completed",
          sectionsTotal: outline.sections.length,
          sectionsCompleted: outline.sections.length,
          message: "维度研究完成",
        },
        missionId,
        undefined,
        taskId,
      );

      const researcherTotalWords = sectionResults.reduce(
        (sum, r) => sum + (r.content?.length || 0),
        0,
      );
      await this.eventEmitter.emitAgentWorking(
        topic.id,
        {
          agentId: `researcher_${dimId}`,
          agentName: "研究员",
          agentRole: "researcher",
          status: "completed",
          taskDescription: `维度「${dimension.name}」研究完成：${sectionResults.length} 个章节，共 ${researcherTotalWords} 字`,
          dimensionId: dimension.id,
          dimensionName: dimension.name,
          progress: 100,
          modelId,
        },
        effectiveMissionId,
      );

      this.logger.log(`${logPrefix} Writing phase completed successfully`);

      // ★ 提取最后一个章节的实际模型ID
      const lastActualModel = sectionResults
        .map((r) => r.actualModelId)
        .filter(Boolean)
        .pop();

      return {
        success: true,
        dimensionId: dimension.id,
        analysisResult,
        evidenceIds: savedEvidenceIds,
        outline,
        sectionResults,
        integratedResult: finalIntegratedResult,
        actualModelId: lastActualModel, // ★ 记录实际使用的模型
        extractedClaims, // V5: 提取的事实断言
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        `${logPrefix} Writing phase FAILED: ${errorMessage}`,
        error instanceof Error ? error.stack : error,
      );

      await this.prisma.topicDimension.update({
        where: { id: dimension.id },
        data: { status: DimensionStatus.FAILED },
      });

      this.emitProgress(
        topic.id,
        dimension.name,
        {
          stage: "failed",
          sectionsTotal: 0,
          sectionsCompleted: 0,
          message: `研究失败: ${errorMessage}`,
        },
        missionId,
        undefined,
        taskId,
      );

      return {
        success: false,
        dimensionId: dimension.id,
        evidenceIds: [],
        error: errorMessage,
      };
    }
  }

  /**
   * 写作所有章节并进行审核
   *
   * 支持：
   * - 按依赖关系分组执行
   * - 同组内并行写作
   * - 每个章节审核 + 修订循环
   */
  private async writeSectionsWithReview(
    topicId: string,
    dimension: TopicDimension,
    outline: DimensionOutline,
    evidenceData: EvidenceData[],
    missionId?: string,
    modelId?: string, // ★ Leader 分配的模型
    temporalContext?: TemporalContext, // ★ 时间上下文
    taskId?: string, // ★ 研究任务ID（用于前端精确匹配进度更新）
    validationContext?: string, // V5: 验证上下文
    maxRevisionRounds?: number, // V5: 最大修订轮次
  ): Promise<SectionWriteResult[]> {
    const sectionResults: SectionWriteResult[] = [];
    const sectionMap = new Map<string, SectionWriteResult>();

    // ★ 统一日志前缀
    const dimId = dimension.id.slice(0, 8);
    const logPrefix = `[Dimension:${dimension.name}:${dimId}]`;

    // 按并行组执行
    for (const group of outline.executionPlan.parallelGroups) {
      this.logger.log(
        `${logPrefix} Writing group: ${group.join(", ")}${modelId ? ` with model: ${modelId}` : ""}`,
      );

      // 获取当前组的章节
      const groupSections = outline.sections.filter((s) =>
        group.includes(s.id),
      );

      // 并行写作
      const writeInputs = groupSections.map((section) => ({
        section,
        evidenceData,
        previousSections: this.getPreviousSections(
          section,
          sectionMap,
          outline,
        ),
        modelId, // ★ 传递模型
        temporalContext, // ★ 传递时间上下文
        allocatedFigures: section.allocatedFigures, // ★ 传递 Leader 预分配的图表
        validationContext, // V5: inject validation context
      }));

      // ★ 发送研究员开始写作事件
      const researcherAgentId = `researcher_${dimId}`;
      await this.eventEmitter.emitAgentWorking(
        topicId,
        {
          agentId: researcherAgentId,
          agentName: "研究员",
          agentRole: "researcher",
          status: "working",
          taskDescription: `正在撰写章节：${groupSections.map((s) => s.title).join("、")}`,
          dimensionId: dimension.id,
          dimensionName: dimension.name,
          progress: 30,
          modelId,
        },
        missionId,
      );

      const groupResults =
        await this.sectionWriter.writeSectionsParallel(writeInputs);

      // 逐个审核和修订
      for (let i = 0; i < groupResults.length; i++) {
        const section = groupSections[i];
        let result = groupResults[i];

        // ★ 发送研究员章节完成事件
        const progressPercent =
          30 +
          Math.round((sectionResults.length / outline.sections.length) * 50);
        await this.eventEmitter.emitAgentWorking(
          topicId,
          {
            agentId: researcherAgentId,
            agentName: "研究员",
            agentRole: "researcher",
            status: "working",
            taskDescription: `章节「${section.title}」撰写完成（${result.content?.length || 0} 字），等待审核`,
            dimensionId: dimension.id,
            dimensionName: dimension.name,
            progress: progressPercent,
            modelId,
          },
          missionId,
        );

        // 审核循环（V5: 修订轮次由 depthConfig 控制，默认 3）
        const effectiveMaxRevisions = maxRevisionRounds ?? 3;
        let revisionCount = 0;
        while (revisionCount < effectiveMaxRevisions) {
          const review = await this.leaderService.reviewSectionOutput(
            section,
            result.content,
            revisionCount,
            {
              generatedCharts: result.generatedCharts,
              figureReferences: result.figureReferences,
            },
            sectionResults.map((r) => ({
              title: r.title,
              content: r.content,
            })),
          );

          if (review.approved) {
            this.logger.log(
              `${logPrefix} Section "${section.title}" approved (score: ${review.score})`,
            );
            // ★ 记录审核通过到 Activity
            await this.agentActivity.recordReviewActivity(
              topicId,
              missionId || dimension.id,
              dimension.id,
              dimension.name,
              `章节「${section.title}」审核通过 (评分: ${review.score}/100)`,
              true,
            );
            break;
          }

          // 需要修订
          this.logger.log(
            `${logPrefix} Section "${section.title}" revision needed (score: ${review.score})`,
          );
          // ★ 记录审核不通过到 Activity
          await this.agentActivity.recordReviewActivity(
            topicId,
            missionId || dimension.id,
            dimension.id,
            dimension.name,
            `章节「${section.title}」需要修订 (评分: ${review.score}/100)：${review.feedback}`,
            false,
          );

          // ★ 发送研究员修订事件
          await this.eventEmitter.emitAgentWorking(
            topicId,
            {
              agentId: researcherAgentId,
              agentName: "研究员",
              agentRole: "researcher",
              status: "working",
              taskDescription: `正在修订章节「${section.title}」（第 ${revisionCount + 1} 次修订，评分: ${review.score}/100）`,
              dimensionId: dimension.id,
              dimensionName: dimension.name,
              progress: progressPercent + 5,
              modelId,
            },
            missionId,
          );

          // ★ 修订时添加异常处理，失败时保持原内容并退出修订循环
          try {
            result = await this.sectionWriter.reviseSection({
              section,
              originalContent: result.content,
              reviewFeedback: review.feedback,
              revisionInstructions: review.revisionInstructions || "",
              evidenceData,
              modelId, // ★ 修订时使用同一模型
            });
          } catch (revisionError) {
            const errorMsg =
              revisionError instanceof Error
                ? revisionError.message
                : String(revisionError);
            this.logger.error(
              `${logPrefix} Section "${section.title}" revision failed: ${errorMsg}, keeping current content`,
            );
            // 修订失败，保持当前内容并退出修订循环，避免阻塞其他章节
            break;
          }

          revisionCount++;
        }

        // 保存结果
        sectionMap.set(section.id, result);
        sectionResults.push(result);

        // 发送进度
        this.emitProgress(
          topicId,
          dimension.name,
          {
            stage: "reviewing",
            sectionsTotal: outline.sections.length,
            sectionsCompleted: sectionResults.length,
            currentSection: section.title,
            message: `已完成章节: ${section.title}`,
          },
          missionId,
          undefined,
          taskId, // ★ 传递 taskId
        );
      }
    }

    return sectionResults;
  }

  /**
   * 获取前置章节（用于保持连贯性）
   */
  private getPreviousSections(
    section: SectionPlan,
    sectionMap: Map<string, SectionWriteResult>,
    _outline: DimensionOutline,
  ): Array<{ title: string; content: string }> {
    if (!section.dependsOn || section.dependsOn.length === 0) {
      return [];
    }

    const previousSections: Array<{ title: string; content: string }> = [];
    for (const depId of section.dependsOn) {
      const depResult = sectionMap.get(depId);
      if (depResult) {
        previousSections.push({
          title: depResult.title,
          content: depResult.content,
        });
      }
    }

    return previousSections;
  }

  /**
   * 从 URL 中提取域名
   */
  private extractDomainFromUrl(url: string): string | null {
    try {
      const parsed = new URL(url);
      return parsed.hostname;
    } catch {
      return null;
    }
  }

  /**
   * 准备增强后的证据数据
   * ★ 包含完整网页内容（fullContent）
   */
  private prepareEnrichedEvidenceData(
    enrichedItems: import("../types/research.types").EnrichedResult[],
  ): EnrichedEvidenceData[] {
    return enrichedItems.map((item, index) => ({
      id: `temp-${index}-${Date.now()}`,
      title: item.title,
      url: item.url,
      domain: item.domain || this.extractDomainFromUrl(item.url),
      snippet: item.snippet || null,
      sourceType: item.sourceType,
      publishedAt: item.publishedAt || null,
      credibilityScore: null,
      // ★ 新增：完整内容和内容来源
      fullContent: item.fullContent,
      contentSource: item.contentSource,
      extractedFigures: item.extractedFigures,
    }));
  }

  /**
   * 创建证据摘要（用于 Leader 规划大纲）
   */
  private createEvidenceSummary(evidenceData: EvidenceData[]): string {
    const summary = evidenceData
      .slice(0, 10) // 只取前10条，避免过长
      .map(
        (e, i) =>
          `${i + 1}. [${e.sourceType || "web"}] ${e.title} (${e.domain || "未知来源"})`,
      )
      .join("\n");

    return `共收集到 ${evidenceData.length} 条证据，摘要如下：\n${summary}\n${evidenceData.length > 10 ? `...还有 ${evidenceData.length - 10} 条` : ""}`;
  }

  /**
   * 构建图表摘要（用于 Leader 规划时分配图表）
   * 从证据数据中提取所有 extractedFigures，生成可读摘要
   */
  private buildFiguresSummary(evidenceData: EnrichedEvidenceData[]): string {
    const entries: string[] = [];
    for (let i = 0; i < evidenceData.length; i++) {
      const evidence = evidenceData[i];
      if (evidence.extractedFigures && evidence.extractedFigures.length > 0) {
        for (let j = 0; j < evidence.extractedFigures.length; j++) {
          const fig = evidence.extractedFigures[j];
          entries.push(
            `图表 [${i + 1}:${j}] - ${fig.type} - "${fig.caption || fig.alt || "无标题"}" (来源: 证据[${i + 1}] ${evidence.title}) URL: ${fig.imageUrl}`,
          );
        }
      }
    }
    if (entries.length === 0) {
      return "";
    }
    // ★ 限制最多 20 个图表，避免 prompt 膨胀挤占 Leader 思考空间
    const MAX_FIGURES_FOR_LEADER = 20;
    const displayEntries = entries.slice(0, MAX_FIGURES_FOR_LEADER);
    const suffix =
      entries.length > MAX_FIGURES_FOR_LEADER
        ? `\n...还有 ${entries.length - MAX_FIGURES_FOR_LEADER} 个图表未列出`
        : "";
    return `共 ${entries.length} 个可用图表（展示前 ${displayEntries.length} 个）：\n${displayEntries.join("\n")}${suffix}`;
  }

  /**
   * 校验并清理 Leader 分配的 allocatedFigures
   * - 过滤 evidenceIndex 越界的条目
   * - 过滤 imageUrl 为空的条目
   * - 全局去重：确保同一图表不被分配给多个 section
   * - 记录分配结果日志
   */
  private validateAllocatedFigures(
    outline: DimensionOutline,
    evidenceData: EnrichedEvidenceData[],
  ): void {
    const globalSeen = new Set<string>(); // "evidenceIndex:figureIndex"
    let totalAllocated = 0;

    for (const section of outline.sections) {
      if (!section.allocatedFigures || section.allocatedFigures.length === 0) {
        continue;
      }

      const valid: typeof section.allocatedFigures = [];
      for (const fig of section.allocatedFigures) {
        // 校验 evidenceIndex 范围（1-based）
        if (fig.evidenceIndex < 1 || fig.evidenceIndex > evidenceData.length) {
          this.logger.warn(
            `[validateAllocatedFigures] Section "${section.title}": evidenceIndex ${fig.evidenceIndex} out of range (1-${evidenceData.length}), skipping`,
          );
          continue;
        }
        // 校验 imageUrl 非空
        if (!fig.imageUrl) {
          // 尝试从原始证据数据中补全
          const evidence = evidenceData[fig.evidenceIndex - 1];
          const originalFig = evidence?.extractedFigures?.[fig.figureIndex];
          if (originalFig?.imageUrl) {
            fig.imageUrl = originalFig.imageUrl;
            fig.caption =
              fig.caption || originalFig.caption || originalFig.alt || "";
          } else {
            this.logger.warn(
              `[validateAllocatedFigures] Section "${section.title}": empty imageUrl for [${fig.evidenceIndex}:${fig.figureIndex}], skipping`,
            );
            continue;
          }
        }
        // 全局去重
        const key = `${fig.evidenceIndex}:${fig.figureIndex}`;
        if (globalSeen.has(key)) {
          this.logger.warn(
            `[validateAllocatedFigures] Section "${section.title}": duplicate figure [${key}], skipping`,
          );
          continue;
        }
        globalSeen.add(key);
        valid.push(fig);
      }

      section.allocatedFigures = valid;
      totalAllocated += valid.length;
    }

    this.logger.log(
      `[validateAllocatedFigures] Total allocated: ${totalAllocated} figures across ${outline.sections.length} sections`,
    );
  }

  /**
   * 保存证据到数据库
   * ★ 返回 promptIndex -> actualCitationIndex 映射
   * promptIndex 是 LLM 在 prompt 中看到的序号 (1, 2, 3...)
   * actualCitationIndex 是证据在数据库中的实际引用编号
   */
  private async saveEvidence(
    evidenceData: EvidenceData[],
    reportId: string,
  ): Promise<{
    savedIds: string[];
    idMapping: Map<string, string>;
    indexMapping: Map<number, number>; // ★ 改为 promptIndex -> actualCitationIndex
  }> {
    if (evidenceData.length === 0) {
      return { savedIds: [], idMapping: new Map(), indexMapping: new Map() };
    }

    // 评估可信度
    const evidenceWithCredibility = evidenceData.map((e) => ({
      ...e,
      credibilityScore: this.assessCredibility(e),
    }));

    // ★ 使用 interactive transaction 保证 citationIndex 原子递增（防止并行写作阶段的竞态）
    const created = await this.prisma.$transaction(async (tx) => {
      const maxIndexResult = await tx.topicEvidence.aggregate({
        where: { reportId },
        _max: { citationIndex: true },
      });
      const startIndex = (maxIndexResult._max.citationIndex || 0) + 1;

      const results = [];
      for (let i = 0; i < evidenceWithCredibility.length; i++) {
        const evidence = evidenceWithCredibility[i];
        const result = await tx.topicEvidence.create({
          data: {
            title: evidence.title,
            url: evidence.url,
            domain: evidence.domain,
            snippet: evidence.snippet,
            sourceType: evidence.sourceType,
            publishedAt: this.validateDate(evidence.publishedAt),
            credibilityScore: evidence.credibilityScore,
            citationIndex: startIndex + i,
            reportId,
          },
          select: { id: true, citationIndex: true },
        });
        results.push(result);
      }
      return results;
    });

    // 构建 tempId -> actualId 映射
    const idMapping = new Map<string, string>();
    // ★ 构建 promptIndex -> actualCitationIndex 映射
    // promptIndex 是 LLM 看到的 [1], [2], [3]...
    // actualCitationIndex 是数据库中的实际编号
    const indexMapping = new Map<number, number>();
    evidenceData.forEach((e, index) => {
      idMapping.set(e.id, created[index].id);
      // promptIndex = index + 1 (从1开始)
      // actualCitationIndex = created[index].citationIndex
      indexMapping.set(index + 1, created[index].citationIndex!);
    });

    return { savedIds: created.map((e) => e.id), idMapping, indexMapping };
  }

  /**
   * 替换内容中的 prompt 引用为实际的 citationIndex
   * ★ LLM 输出 [1], [2], [3]... 需要替换为实际的数据库 citationIndex
   * 例如：如果第一个维度有10条证据，第二个维度的 [1] 需要变成 [11]
   */
  private replaceEvidenceIds(
    content: string,
    indexMapping: Map<number, number>,
  ): string {
    let result = content;
    // 从大到小替换，避免 [1] 被替换后影响 [10], [11] 等
    const sortedEntries = Array.from(indexMapping.entries()).sort(
      (a, b) => b[0] - a[0],
    );
    for (const [promptIndex, actualCitationIndex] of sortedEntries) {
      // 只有当 promptIndex 和 actualCitationIndex 不同时才需要替换
      if (promptIndex !== actualCitationIndex) {
        const pattern = new RegExp(`\\[${promptIndex}\\]`, "g");
        result = result.replace(pattern, `[${actualCitationIndex}]`);
      }
    }
    return result;
  }

  /**
   * 验证日期有效性
   * ★ 修复：避免 Invalid Date 导致 Prisma 验证错误
   */
  private validateDate(date: Date | string | null | undefined): Date | null {
    if (!date) {
      return null;
    }
    // 检查是否为有效的 Date 对象
    const d = date instanceof Date ? date : new Date(date);
    // isNaN(d.getTime()) 检测 Invalid Date
    if (isNaN(d.getTime())) {
      return null;
    }
    return d;
  }

  /**
   * 评估证据可信度
   * ★ 改进版：更细致的评分系统，避免全部50%的问题
   */
  private assessCredibility(evidence: EvidenceData): number {
    let score = 0;

    // 1. 域名权威性评分 (最高 40 分)
    if (evidence.domain) {
      const domain = evidence.domain.toLowerCase();

      // 最高权威 (政府、教育、顶级学术)
      const topAuthority = [
        ".gov",
        ".edu",
        ".ac.",
        "nature.com",
        "science.org",
        "sciencedirect.com",
        "springer.com",
        "wiley.com",
        "arxiv.org",
        "pubmed.ncbi",
        "ieee.org",
        "acm.org",
        "who.int",
        "un.org",
        "worldbank.org",
        "imf.org",
        "oecd.org",
      ];

      // 高权威 (知名媒体、智库)
      const highAuthority = [
        "reuters.com",
        "bloomberg.com",
        "wsj.com",
        "nytimes.com",
        "washingtonpost.com",
        "bbc.com",
        "economist.com",
        "ft.com",
        "theguardian.com",
        "apnews.com",
        "stanford.edu",
        "mit.edu",
        "harvard.edu",
        "brookings.edu",
        "rand.org",
        "mckinsey.com",
        "gartner.com",
        "forrester.com",
        "statista.com",
      ];

      // 中等权威 (行业媒体、知名博客)
      const mediumAuthority = [
        "techcrunch.com",
        "wired.com",
        "arstechnica.com",
        "theverge.com",
        "venturebeat.com",
        "forbes.com",
        "businessinsider.com",
        "cnbc.com",
        "cnn.com",
        "medium.com",
        "substack.com",
        "hbr.org",
      ];

      if (topAuthority.some((auth) => domain.includes(auth))) {
        score += 40;
      } else if (highAuthority.some((auth) => domain.includes(auth))) {
        score += 30;
      } else if (mediumAuthority.some((auth) => domain.includes(auth))) {
        score += 20;
      } else {
        // 普通网站基础分（提高以避免全部低可信）
        score += 20;
      }
    } else {
      score += 15; // 无域名信息给基础分
    }

    // 2. 来源类型评分 (最高 30 分)
    const sourceTypeLower = (evidence.sourceType || "").toLowerCase();
    switch (sourceTypeLower) {
      case "academic":
        score += 30;
        break;
      case "official":
        score += 25;
        break;
      case "news":
        score += 20;
        break;
      case "report":
        score += 18;
        break;
      case "web":
        score += 18; // 提高 web 类型分数
        break;
      default:
        score += 15; // 默认给基础分
        break;
    }

    // 3. 内容深度评分 (最高 15 分) - 基于 snippet 长度
    const snippetLength = evidence.snippet?.length || 0;
    if (snippetLength > 500) {
      score += 15;
    } else if (snippetLength > 200) {
      score += 10;
    } else if (snippetLength > 50) {
      score += 5;
    }

    // 4. 时效性评分 (最高 15 分)
    if (evidence.publishedAt) {
      const ageInDays = Math.floor(
        (Date.now() - new Date(evidence.publishedAt).getTime()) /
          (1000 * 60 * 60 * 24),
      );
      if (ageInDays <= 30) {
        score += 15; // 近一个月
      } else if (ageInDays <= 180) {
        score += 12; // 近半年
      } else if (ageInDays <= 365) {
        score += 8; // 近一年
      } else if (ageInDays <= 730) {
        score += 5; // 近两年
      }
      // 超过两年不加分
    }

    // 确保分数在合理范围内 (最低 15，最高 100)
    return Math.max(15, Math.min(100, score));
  }

  /**
   * 转换为标准分析结果格式
   */
  private convertToAnalysisResult(
    dimensionId: string,
    integratedResult: IntegratedDimensionResult,
    evidenceIds: string[],
    figureReferences: FigureReference[] = [],
    generatedCharts: GeneratedChart[] = [],
  ): DimensionAnalysisResult {
    return {
      dimensionId,
      summary: integratedResult.metadata.summary,
      keyFindings: integratedResult.metadata.keyFindings.map(
        (finding, index) => ({
          finding,
          // V5: 根据位置和内容分配 significance，避免全部 "medium"
          // 前2个发现通常最重要（AI 按重要性排序输出）
          significance: (index < 2 ? "high" : index < 4 ? "medium" : "low") as
            | "high"
            | "medium"
            | "low",
          implication: "",
          evidenceIds: [],
        }),
      ),
      trends: [],
      challenges: [],
      opportunities: [],
      evidenceUsed: evidenceIds.length,
      confidenceLevel: integratedResult.metadata.confidenceLevel,
      detailedContent: integratedResult.content,
      figureReferences,
      generatedCharts,
    };
  }

  /**
   * 发送进度事件
   * @param dimensionName - 维度名称（用于前端显示）
   * @param stageProgress - 当前阶段的进度百分比（可选，如果提供则使用此值）
   * @param taskId - 研究任务ID（可选，用于前端精确匹配进度更新）
   *
   * ★ v7.3: 同时更新 ResearchTask.progress，确保前端能正确显示实时进度
   * ★ 同时更新 mission.updatedAt 作为心跳，防止被健康检测误判为卡死
   */
  private async emitProgress(
    topicId: string,
    dimensionName: string,
    progress: MissionProgress,
    missionId?: string,
    stageProgress?: number,
    taskId?: string,
  ): Promise<void> {
    // 计算进度：优先使用 stageProgress，否则根据 section 完成比例计算
    let calculatedProgress: number;
    if (stageProgress !== undefined) {
      calculatedProgress = stageProgress;
    } else if (progress.sectionsTotal > 0) {
      // 写作阶段：30% - 80% 之间根据 section 完成比例
      const sectionRatio = progress.sectionsCompleted / progress.sectionsTotal;
      calculatedProgress = Math.round(30 + sectionRatio * 50);
    } else {
      // 规划阶段默认 10%
      calculatedProgress = 10;
    }

    // 使用维度研究进度事件（前端通过 WebSocket 接收实时进度）
    this.eventEmitter.emitDimensionResearchProgress(
      topicId,
      dimensionName,
      calculatedProgress,
      progress.message,
      missionId,
      taskId, // ★ 传递 taskId 用于前端精确匹配
    );

    // ★ 心跳更新：更新关联的 mission.updatedAt，防止被健康检测误判为卡死
    if (missionId) {
      try {
        await this.prisma.researchMission.update({
          where: { id: missionId },
          data: { updatedAt: new Date() },
        });
      } catch {
        // 忽略更新失败（mission 可能已被删除或取消）
      }
    }
  }
}
