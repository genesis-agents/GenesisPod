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

import { Injectable, Logger, Optional } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { DimensionProgressService } from "./dimension-progress.service";
import {
  DimensionStatus,
  type ResearchTopic,
  type TopicDimension,
} from "@prisma/client";
import { LeaderPlanningService } from "../core/leader/leader-planning.service";
import { LeaderReviewService } from "../core/leader/leader-review.service";
import { ResearchLeaderService } from "../core/research/research-leader.service";
import {
  SectionWriterService,
  type SectionWriteResult,
  type TemporalContext,
} from "./section-writer.service";
import { DataSourceRouterService } from "../data/data-source-router.service";
import { ResearchEventEmitterService } from "../core/research/research-event-emitter.service";
import {
  AgentActivityService,
  type ThinkingPhase,
} from "../monitoring/agent-activity.service";
import {
  type DimensionOutline,
  type SectionPlan,
  type IntegratedDimensionResult,
} from "../../types/leader.types";
import { type SearchResultsRecord } from "../../types/monitoring.types";
import { DataEnrichmentService } from "../data/data-enrichment.service";
import { LeaderToolService } from "../data/leader-tool.service";
import type {
  EvidenceData,
  DimensionAnalysisResult,
  EnrichedEvidenceData,
  GeneratedChart,
  FigureReference,
} from "../../types/research.types";
import {
  extractTrendsFromContent,
  extractChallengesFromContent,
  extractOpportunitiesFromContent,
  replaceEvidenceIds,
  validateDate,
} from "./content-analysis.utils";
import { assessCredibility } from "./credibility.utils";
import { AgentActivityType, AIModelType } from "@prisma/client";
import {
  getCurrentDateString,
  getFreshnessRequirementDescription,
} from "../../prompts/dimension-research.prompt";
import {
  createEvidenceSummary,
  buildFiguresSummary,
  type FigureRegistryEntry,
} from "./evidence-summary.utils";
import { isValidFigureUrl } from "../../utils/sanitize-image-url.utils";
import {
  ContextCompressionService,
  type AICapabilityContext,
  ContextEvolutionService,
  ChatFacade,
  type AiCallerFn,
  type EstablishedFact,
  TokenBudgetService,
} from "@/modules/ai-engine/facade";
import { MissionObservabilityService } from "../core/mission/mission-observability.service";
import { ReportQualityGateService } from "../quality/report-quality-gate.service";

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
  extractedClaims?: import("../../types/research-depth.types").ExtractedClaim[];
  /** Batch 2: 跨维度事实（用于报告一致性） */
  extractedFacts?: EstablishedFact[];
}

export type { MissionProgress } from "./dimension-progress.service";

/**
 * 搜索阶段结果（Phase 1）
 */
export interface SearchPhaseResult {
  dimensionId: string;
  dimensionName: string;
  enrichedResults: import("../../types/research.types").EnrichedResult[];
  evidenceData: EnrichedEvidenceData[];
  evidenceSummary: string;
  searchResultsRecord: SearchResultsRecord;
  temporalContext: TemporalContext;
  figuresSummary: string;
  /** 图表注册表：figureId → 完整元数据，用于系统回填 imageUrl 等字段 */
  figureRegistry: Map<string, FigureRegistryEntry>;
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
    private readonly leaderPlanning: LeaderPlanningService,
    private readonly leaderReview: LeaderReviewService,
    private readonly leaderService: ResearchLeaderService,
    private readonly sectionWriter: SectionWriterService,
    private readonly dataSourceRouter: DataSourceRouterService,
    private readonly eventEmitter: ResearchEventEmitterService,
    private readonly agentActivity: AgentActivityService,
    private readonly dataEnrichment: DataEnrichmentService,
    private readonly leaderTool: LeaderToolService,
    // ★ Phase 2: 维度级别成本追踪（via observability）
    private readonly observability: MissionObservabilityService,
    // ★ v4: 质量门控
    private readonly qualityGate: ReportQualityGateService,
    private readonly progress: DimensionProgressService,
    // ★ Phase 5: 长研究上下文压缩
    @Optional() private readonly contextCompression?: ContextCompressionService,
    // ★ Batch 2: 跨维度事实提取
    @Optional() private readonly contextEvolution?: ContextEvolutionService,
    @Optional() private readonly chatFacade?: ChatFacade,
    // ★ Batch 3: Token 预算智能截断
    @Optional() private readonly tokenBudgetService?: TokenBudgetService,
  ) {}

  /**
   * ★ v4: 清空全局 URL 抓取缓存（每次报告生成前调用）
   */
  clearEvidenceCache(): void {
    this.dataEnrichment.clearFetchCache();
  }

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
    await this.progress.updateDimensionStatus(
      dimension.id,
      DimensionStatus.RESEARCHING,
    );

    const researcherAgentId = `researcher_${dimId}`;
    const researcherAgentName = "研究员";
    const effectiveMissionId = missionId || dimension.id;

    // Suppress unused variable warnings - these are used in the search phase
    void researcherAgentId;
    void researcherAgentName;

    // 1. 获取搜索结果
    void this.progress.emitProgress(
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
      modelId,
    });

    const searchQueryCount = Array.isArray(dimension.searchQueries)
      ? dimension.searchQueries.length
      : 0;

    const searchResult = await this.dataSourceRouter.fetchDataForDimension(
      dimension,
      topic,
      {
        assignedTools,
        assignedSkills,
        ragFusionConfig:
          searchQueryCount >= 1
            ? { enabled: true, maxVariants: Math.min(searchQueryCount + 2, 6) }
            : undefined,
      },
    );

    // 2. 数据增强
    const topicConfig = topic.topicConfig as Record<string, unknown> | null;

    // ★ v4: 二轮迭代搜索 — 从第一轮结果提取关键术语，构造补充搜索
    // quick 模式跳过二轮搜索，standard/thorough 默认启用
    const depthMode = (topicConfig?.depthMode as string) || "standard";
    const enableSecondRound =
      topicConfig?.enableSecondRoundSearch !== false && depthMode !== "quick";
    if (enableSecondRound && searchResult.items.length > 0) {
      try {
        // 从第一轮结果提取关键实体/术语
        const extractedTerms = this.extractKeyTermsFromResults(
          searchResult.items.slice(0, 10),
          dimension.name,
        );

        if (extractedTerms.length > 0) {
          this.logger.log(
            `${logPrefix} [v4] Second-round search: extracted ${extractedTerms.length} key terms: ${extractedTerms.slice(0, 5).join(", ")}`,
          );

          // 构造补充搜索查询
          const supplementaryQueries = extractedTerms
            .slice(0, 3)
            .map((term) => `${dimension.name} ${term}`);

          // 执行第二轮搜索
          const secondRoundResult =
            await this.dataSourceRouter.fetchDataForDimension(
              {
                ...dimension,
                searchQueries: supplementaryQueries,
              } as typeof dimension,
              topic,
              { assignedTools, assignedSkills },
            );

          // 合并去重
          const existingUrls = new Set(
            searchResult.items.map((item) => item.url).filter(Boolean),
          );
          const newItems = secondRoundResult.items.filter(
            (item) => item.url && !existingUrls.has(item.url),
          );

          if (newItems.length > 0) {
            searchResult.items.push(...newItems);
            this.logger.log(
              `${logPrefix} [v4] Second-round added ${newItems.length} new sources (total: ${searchResult.items.length})`,
            );
          } else {
            this.logger.log(
              `${logPrefix} [v4] Second-round found no new sources`,
            );
          }
        }
      } catch (error) {
        this.logger.warn(
          `${logPrefix} [v4] Second-round search failed (non-fatal): ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    this.logger.log(
      `${logPrefix} Search completed: ${searchResult.items.length} sources found`,
    );

    const enrichmentTopN = (topicConfig?.enrichmentTopN as number) || 20;
    const enrichmentMaxLength =
      (topicConfig?.enrichmentMaxLength as number) || 6000;
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
        topicTitle: topic.name,
        dimensionName: dimension.name,
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

    const usedSources = [
      ...new Set((searchResult.sources || []).map((s) => String(s))),
    ].join(", ");

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
      sources: enrichedResults.slice(0, 30).map((item) => {
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
          } catch (error) {
            this.logger.debug(
              `[recordSearchActivity] Failed to parse publishedAt: ${error}`,
            );
          }
        }
        const metadata = item.metadata;
        const isKnowledgeBase =
          String(item.sourceType).toLowerCase() === "local" ||
          metadata?.knowledgeBaseSource === true;

        // Look up scores from fusion scoredItems
        const scoredEntry = searchResult.scoredItems?.find(
          (s) => s.item.url === item.url,
        );

        return {
          title: item.title || "未知标题",
          url: item.url || "",
          domain: item.domain,
          sourceType: String(item.sourceType),
          publishedDate,
          credibilityScore: scoredEntry
            ? Math.round(scoredEntry.credibilityScore * 100)
            : undefined,
          relevanceScore: scoredEntry
            ? Math.round(scoredEntry.relevanceScore * 100)
            : undefined,
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

    // ★ EVENT 类型：将锚定文章作为一级证据注入（前置到最前面）
    if (
      topic.type === "EVENT" &&
      topic.topicConfig &&
      typeof topic.topicConfig === "object"
    ) {
      const topicConfig = topic.topicConfig as Record<string, unknown>;
      if (topicConfig.sourceContent || topicConfig.sourceUrl) {
        const { buildAnchorEvidence } =
          await import("../../utils/event-source-parser.utils");
        const anchorEvidence = buildAnchorEvidence(topicConfig);
        evidenceData.unshift(anchorEvidence as unknown as EnrichedEvidenceData);
        this.logger.log(
          `${logPrefix} [EVENT] Injected anchor evidence: "${anchorEvidence.title}" (${anchorEvidence.fullContent.length} chars)`,
        );
      }
    }

    // ★ 诊断：记录证据数据的实际大小
    const evidenceDataTotalChars = evidenceData.reduce((sum, e) => {
      return (
        sum +
        (e.title?.length || 0) +
        (e.fullContent?.length || 0) +
        (e.snippet?.length || 0) +
        (e.url?.length || 0)
      );
    }, 0);
    this.logger.log(
      `${logPrefix} Evidence data prepared: ${evidenceData.length} items, total ~${evidenceDataTotalChars} chars` +
        ` (largest: ${evidenceData.reduce((max, e) => Math.max(max, (e.fullContent?.length || 0) + (e.snippet?.length || 0)), 0)} chars)`,
    );

    let evidenceSummary =
      createEvidenceSummary(evidenceData) +
      (leaderContextSummary ? `\n\n## 最新背景\n${leaderContextSummary}` : "");

    // ★ 诊断：记录 evidenceSummary 初始大小（在压缩前）
    this.logger.log(
      `${logPrefix} Evidence summary initial size: ${evidenceSummary.length} chars (~${Math.ceil(evidenceSummary.length / 4)} tokens est.)`,
    );

    // ★ Phase 5: 长上下文压缩 — 超过 8000 字符时智能摘要
    if (this.contextCompression && evidenceSummary.length > 8000) {
      try {
        this.logger.log(
          `${logPrefix} Evidence summary too long (${evidenceSummary.length} chars), compressing to ~4000`,
        );
        const compressed = await this.contextCompression.compress(
          evidenceSummary,
          { targetSize: 4000, summaryStyle: "detailed" },
        );
        evidenceSummary = compressed.compressedContext;
        this.logger.log(
          `${logPrefix} Compressed evidence summary: ${compressed.stats.originalLength} → ${compressed.stats.compressedLength} chars`,
        );
      } catch (err) {
        this.logger.warn(
          `${logPrefix} Context compression failed (non-fatal), using original: ${err instanceof Error ? err.message : String(err)}`,
        );
        // fallback: 保持原始文本
      }
    } else if (!this.contextCompression && evidenceSummary.length > 8000) {
      this.logger.debug(
        "[Degraded] ContextCompressionService unavailable, skipping evidence compression",
      );
    }

    // ★ Batch 3: TokenBudgetService — 当 ContextCompression 不可用时的后备截断
    if (this.tokenBudgetService && evidenceSummary.length > 8000) {
      try {
        evidenceSummary = this.tokenBudgetService.smartTruncate(
          evidenceSummary,
          Math.floor(8000 * 1.5), // token estimation
        );
        this.logger.log(
          `${logPrefix} TokenBudget truncated evidence summary to ${evidenceSummary.length} chars`,
        );
      } catch (e) {
        this.logger.debug(`TokenBudgetService truncation failed: ${e}`);
      }
    } else if (!this.tokenBudgetService && evidenceSummary.length > 8000) {
      this.logger.debug(
        "[Degraded] TokenBudgetService unavailable, evidence summary may exceed token budget",
      );
    }

    // ★ 硬截断兜底：当 ContextCompression 和 TokenBudgetService 都不可用时，
    // 必须强制截断，防止 916K+ token 的 prompt 发送给 LLM 导致截断/超时/费用爆炸
    const HARD_TRUNCATE_LIMIT = 12000;
    if (evidenceSummary.length > HARD_TRUNCATE_LIMIT) {
      this.logger.warn(
        `${logPrefix} Evidence summary still too long after compression pipeline (${evidenceSummary.length} chars), hard truncating to ${HARD_TRUNCATE_LIMIT}`,
      );
      evidenceSummary =
        evidenceSummary.slice(0, HARD_TRUNCATE_LIMIT) +
        "\n\n[... 内容已截断，完整证据请参考原始搜索结果 ...]";
    }

    // ★ 诊断：记录 evidenceSummary 最终大小（压缩/截断后）
    this.logger.log(
      `${logPrefix} Evidence summary final size: ${evidenceSummary.length} chars (~${Math.ceil(evidenceSummary.length / 4)} tokens est.)`,
    );

    const { summary: figuresSummary, figureRegistry } =
      buildFiguresSummary(evidenceData);
    if (figuresSummary) {
      this.logger.log(
        `${logPrefix} Figures summary for Leader: ${figureRegistry.size} figures available, ${figuresSummary.length} chars`,
      );
    }

    return {
      dimensionId: dimension.id,
      dimensionName: dimension.name,
      enrichedResults,
      evidenceData: evidenceData,
      evidenceSummary,
      searchResultsRecord,
      temporalContext,
      figuresSummary,
      figureRegistry,
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
    await this.progress.updateDimensionStatus(
      dimension.id,
      DimensionStatus.RESEARCHING,
    );

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

      void this.progress.emitProgress(
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

      const outline = await this.leaderPlanning.planDimensionOutline(
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
      await this.progress.updateDimensionStatus(
        dimension.id,
        DimensionStatus.FAILED,
      );

      void this.progress.emitProgress(
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
    assignedSkills?: string[], // ★ Leader 分配的技能（传递到 chatWithSkills）
    validationContext?: string, // V5: 验证上下文
    maxRevisionRounds?: number, // V5: 最大修订轮次（来自 depthConfig）
  ): Promise<DimensionMissionResult> {
    const dimId = dimension.id.slice(0, 8);
    const logPrefix = `[Dimension:${dimension.name}:${dimId}]`;

    this.logger.log(
      `${logPrefix} Starting writing phase with global outline (${outline.sections.length} sections)${assignedSkills?.length ? `, skills: [${assignedSkills.join(", ")}]` : ""}`,
    );

    const leaderAgentId = "leader-" + dimId;
    const leaderAgentName = "研究组长";
    const researcherAgentId = `researcher_${dimId}`;
    const researcherAgentName = "研究员";
    const effectiveMissionId = missionId || dimension.id;

    try {
      // 1. 校验并清理 Leader 分配的图表
      this.validateAllocatedFigures(outline, searchPhaseResult.figureRegistry);

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
      void this.progress.emitProgress(
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
        modelId,
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
        topic.language, // Language setting
        assignedSkills, // ★ Leader 分配的技能
        topic.type, // ★ 类型感知质量检查
        searchPhaseResult.figureRegistry, // ★ 图表注册表
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

      let extractedClaims: import("../../types/research-depth.types").ExtractedClaim[] =
        [];
      try {
        const claimPromises = allSectionContents.map((sc) =>
          this.leaderReview.extractClaims(sc.sectionId, sc.content),
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
      void this.progress.emitProgress(
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
          topic.language,
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

      // ★ Calculate paragraph offset per section so figure positions become global
      // Uses the same paragraph boundary definition as injectChartsByPosition:
      // a non-empty line followed by a blank line (or end of text), excluding
      // code fences and table separator rows.
      const countParagraphBoundaries = (text: string): number => {
        const lines = text.split("\n");
        let count = 0;
        for (let i = 0; i < lines.length; i++) {
          const trimmed = lines[i].trim();
          if (!trimmed) continue;
          if (trimmed.startsWith("```")) continue;
          if (/^[\|\s\-:]+$/.test(trimmed) && trimmed.includes("-")) continue;
          const nextLine = lines[i + 1];
          if (nextLine === undefined || nextLine.trim() === "") count++;
        }
        return count;
      };
      const sectionParagraphCounts = sectionResults.map((r) =>
        countParagraphBoundaries(`### ${r.title}\n\n${r.content}`),
      );

      let paragraphOffset = 0;
      const allFigureReferencesRaw = sectionResults.flatMap((r, sectionIdx) => {
        const offset = paragraphOffset;
        paragraphOffset += sectionParagraphCounts[sectionIdx];

        return (r.figureReferences || []).map((fig) => ({
          ...fig,
          // ★ Prefix id with section index to avoid cross-section id collisions
          id:
            fig.id && String(fig.id).startsWith(`s${sectionIdx}-`)
              ? String(fig.id)
              : `s${sectionIdx}-${fig.id || "fig"}`,
          // ★ Convert section-local paragraph position to dimension-global
          position: (() => {
            const pos = fig.position ?? "";
            if (/after_paragraph_(\d+)/i.test(pos)) {
              return pos.replace(
                /after_paragraph_(\d+)/i,
                (_: string, n: string) =>
                  `after_paragraph_${parseInt(n, 10) + offset}`,
              );
            }
            if (/end_of_section/i.test(pos)) {
              // Convert to last paragraph of this section
              return `after_paragraph_${offset + sectionParagraphCounts[sectionIdx]}`;
            }
            return pos;
          })(),
        }));
      });
      // ★ Dedup by figureId (preferred) or imageUrl fallback — preserve one ref per figure
      const seenFigKeys = new Set<string>();
      const allFigureReferences = allFigureReferencesRaw.filter((fig) => {
        if (!fig.imageUrl) return false;
        // Use figureId as the dedup key when available, otherwise fall back to imageUrl
        const key = fig.figureId || fig.imageUrl;
        if (seenFigKeys.has(key)) return false;
        seenFigKeys.add(key);
        return true;
      });
      this.logger.log(
        `${logPrefix} Charts from sections: ${allFigureReferences.length} refs, ${allGeneratedCharts.length} generated`,
      );

      // 4.5 ★ 确定性填充 figureReference.source — 用 evidenceCitationIndex 回查证据标题
      // 必须在 saveEvidence/indexMapping 之前执行：此时 evidenceCitationIndex 仍是 promptIndex（1-based），
      // 与 evidenceData 数组下标一致（promptIndex - 1）。saveEvidence 后 index 会被重映射为 DB citationIndex。
      const evidenceData = searchPhaseResult.evidenceData;
      for (const ref of allFigureReferences) {
        if (ref.source) continue; // LLM 已输出 source 的不覆盖
        const promptIdx = ref.evidenceCitationIndex; // 1-based
        if (
          promptIdx !== undefined &&
          promptIdx >= 1 &&
          promptIdx <= evidenceData.length
        ) {
          const evidence = evidenceData[promptIdx - 1];
          if (evidence) {
            ref.source = evidence.title || evidence.domain || evidence.url;
          }
        }
      }

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
            content: replaceEvidenceIds(integratedResult.content, indexMapping),
          };
        }

        if (indexMapping.size > 0) {
          for (const ref of allFigureReferences) {
            if (ref.evidenceCitationIndex !== undefined) {
              const mapped = indexMapping.get(ref.evidenceCitationIndex);
              if (mapped !== undefined) {
                ref.evidenceCitationIndex = mapped;
              }
            }
          }
        }
      } else {
        // ★ 警告：没有 reportId，证据不会被保存到数据库
        // 这会导致参考文献标签为空！
        this.logger.warn(
          `${logPrefix} ⚠️ reportId is undefined! ${searchPhaseResult.evidenceData.length} evidences will NOT be saved. ` +
            `This will result in empty References tab. ` +
            `Ensure executeDimensionMission is called with reportId.`,
        );
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
      await this.progress.updateDimensionStatus(
        dimension.id,
        DimensionStatus.COMPLETED,
        { lastResearchedAt: new Date() },
      );
      this.logger.log(`${logPrefix} Status updated to COMPLETED`);

      // 8. 完成
      void this.progress.emitProgress(
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

      // ★ Phase 2: CostAttribution — 维度级别成本追踪
      this.observability.recordResearchCost(
        topic.userId,
        dimension.name,
        lastActualModel || modelId || "",
        "",
        0,
        0,
        0,
      );

      // ★ Batch 2: 从维度研究结果中提取跨维度事实
      let extractedFacts: EstablishedFact[] | undefined;
      if (
        this.contextEvolution &&
        this.chatFacade &&
        analysisResult?.detailedContent
      ) {
        try {
          const aiCaller: AiCallerFn = async (_model, messages, options) => {
            const resp = await this.chatFacade!.chat({
              messages,
              modelType: AIModelType.CHAT,
              taskProfile: options?.taskProfile ?? {
                creativity: "deterministic",
                outputLength: "medium",
              },
            });
            return { content: resp.content, tokensUsed: resp.tokensUsed ?? 0 };
          };
          const factResult = await this.contextEvolution.extractFacts(
            {
              taskId: dimension.id,
              taskTitle: dimension.name,
              taskOutput: analysisResult.detailedContent.slice(0, 10000),
            },
            aiCaller,
          );
          extractedFacts = factResult.facts;
          this.logger.log(
            `${logPrefix} Extracted ${factResult.facts.length} cross-dimension facts`,
          );
        } catch (err) {
          this.logger.warn(
            `${logPrefix} Fact extraction failed (non-fatal): ${err instanceof Error ? err.message : err}`,
          );
        }
      } else if (!this.contextEvolution || !this.chatFacade) {
        this.logger.debug(
          `[Degraded] ${!this.contextEvolution ? "ContextEvolutionService" : "ChatFacade"} unavailable, skipping cross-dimension fact extraction`,
        );
      }

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
        extractedFacts, // Batch 2: 跨维度事实
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        `${logPrefix} Writing phase FAILED: ${errorMessage}`,
        error instanceof Error ? error.stack : error,
      );

      await this.progress.updateDimensionStatus(
        dimension.id,
        DimensionStatus.FAILED,
      );

      void this.progress.emitProgress(
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
    _maxRevisionRounds?: number, // V5: 最大修订轮次（v4 已替换为质量门控，保留参数向上兼容）
    topicLanguage?: string | null, // Language setting for review
    assignedSkills?: string[], // ★ Leader 分配的技能（注入到 chatWithSkills）
    topicType?: string, // ★ 类型感知质量检查
    figureRegistry?: Map<string, FigureRegistryEntry>, // ★ 图表注册表
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
        evidenceData: this.filterEvidenceForSection(section, evidenceData),
        previousSections: this.getPreviousSections(
          section,
          sectionMap,
          outline,
        ),
        modelId, // ★ 传递模型
        temporalContext, // ★ 传递时间上下文
        allocatedFigures: section.allocatedFigures, // ★ 传递 Leader 预分配的图表
        validationContext, // V5: inject validation context
        topicLanguage, // ★ 传递语言设置
        assignedSkills, // ★ Leader 分配的任务级技能
        figureRegistry, // ★ 图表注册表（用于 backfillFigureUrls）
      }));

      // ★ 发送研究员开始写作事件
      // 进度 = 已完成章节比例映射到 [30, 80] 区间（与 emitProgress 一致）
      const researcherAgentId = `researcher_${dimId}`;
      const groupStartProgress =
        30 + Math.round((sectionResults.length / outline.sections.length) * 50);
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
          progress: groupStartProgress,
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

        // ★ v4: 质量门控替代 LLM 审阅循环
        const qc = this.qualityGate.validateDimensionContent(
          result.content,
          topicLanguage || "zh",
          topicType,
        );

        if (qc.wasAutoFixed) {
          result = { ...result, content: qc.fixedContent };
          this.logger.log(
            `${logPrefix} [QualityGate] Auto-fixed section "${section.title}": ${qc.violations.map((v) => v.rule).join(", ")}`,
          );
        }

        // ★ 记录质量门控结果到 Activity
        await this.agentActivity.recordReviewActivity(
          topicId,
          missionId || dimension.id,
          dimension.id,
          dimension.name,
          qc.passed
            ? `章节「${section.title}」质量门控通过`
            : `章节「${section.title}」质量门控：${qc.violations.map((v) => `${v.rule}(${v.severity})`).join(", ")}`,
          qc.passed,
        );

        // 如果有需要 AI 重写的问题（如语言混杂、内容过短），发送 1 次修订请求
        if (!qc.passed && qc.rewriteGuidance.length > 0) {
          this.logger.log(
            `${logPrefix} [QualityGate] Section "${section.title}" needs AI rewrite: ${qc.rewriteGuidance.join("; ")}`,
          );

          // ★ 发送修订进度事件（通知前端）
          await this.eventEmitter.emitAgentWorking(
            topicId,
            {
              agentId: researcherAgentId,
              agentName: "研究员",
              agentRole: "researcher",
              status: "working",
              taskDescription: `章节「${section.title}」质量门控未通过，正在修订：${qc.violations.map((v) => v.rule).join(", ")}`,
              dimensionId: dimension.id,
              dimensionName: dimension.name,
              progress: progressPercent + 5,
              modelId,
            },
            missionId,
          );

          try {
            const rewrittenResult = await this.sectionWriter.reviseSection({
              section,
              originalContent: result.content,
              reviewFeedback: qc.rewriteGuidance.join("\n"),
              revisionInstructions:
                "请根据以上质量问题修改内容。这是最后一次修改机会，请认真处理所有问题。",
              evidenceData,
              modelId,
              topicLanguage,
              assignedSkills,
            });

            // 对修改后的内容再次运行质量门控（仅自动修复，不再重写）
            const qc2 = this.qualityGate.validateDimensionContent(
              rewrittenResult.content,
              topicLanguage || "zh",
              topicType,
            );
            result = {
              ...rewrittenResult,
              content: qc2.wasAutoFixed
                ? qc2.fixedContent
                : rewrittenResult.content,
            };

            this.logger.log(
              `${logPrefix} [QualityGate] Section "${section.title}" rewritten, passed=${qc2.passed}`,
            );
          } catch (rewriteError) {
            this.logger.warn(
              `${logPrefix} [QualityGate] Rewrite failed for "${section.title}", keeping auto-fixed content: ${rewriteError instanceof Error ? rewriteError.message : String(rewriteError)}`,
            );
          }
        }

        // 保存结果
        sectionMap.set(section.id, result);
        sectionResults.push(result);

        // 发送进度
        void this.progress.emitProgress(
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
   * 根据 section 标题/关键词过滤相关 evidence
   * 使用简单关键词匹配，不需要 LLM 调用
   */
  private filterEvidenceForSection(
    section: SectionPlan,
    evidenceData: EvidenceData[],
  ): EvidenceData[] {
    if (evidenceData.length <= 5) {
      return evidenceData; // 证据太少，全部保留
    }

    // 提取 section 关键词：标题分词 + keyPoints
    const sectionKeywords = this.extractKeywords(
      `${section.title} ${section.keyPoints.join(" ")} ${section.description || ""}`,
    );

    if (sectionKeywords.length === 0) {
      return evidenceData; // 无法提取关键词，全部保留
    }

    // 对每条 evidence 计算相关度分数
    const scored = evidenceData.map((e, index) => {
      const evidenceText = `${e.title || ""} ${e.snippet || ""}`.toLowerCase();
      let score = 0;
      for (const kw of sectionKeywords) {
        if (evidenceText.includes(kw)) {
          score++;
        }
      }
      return { evidence: e, score, originalIndex: index };
    });

    // 按相关度排序
    scored.sort((a, b) => b.score - a.score);

    // 保留相关度 > 0 的 evidence，按分数排序
    const relevant = scored.filter((s) => s.score > 0);
    if (relevant.length >= 5) {
      return relevant.map((s) => s.evidence);
    }

    // 不足 5 条时，补充低分 evidence 到 5 条上限
    // ★ 不再无限制保留完全无关的 evidence
    const result = scored.slice(0, 5);

    // ★ 如果大量 evidence 完全不相关（score=0），记录 warning
    const zeroScoreCount = result.filter((s) => s.score === 0).length;
    if (zeroScoreCount > result.length * 0.5) {
      // 超过一半无关 — 优先返回有分的，限制无关项
      const withScore = result.filter((s) => s.score > 0);
      const withoutScore = result.filter((s) => s.score === 0).slice(0, 2);
      return [...withScore, ...withoutScore].map((s) => s.evidence);
    }

    return result.map((s) => s.evidence);
  }

  /**
   * ★ v4: 从搜索结果中提取关键术语（用于二轮迭代搜索）
   * 使用简单文本分析，不需要 LLM 调用
   */
  private extractKeyTermsFromResults(
    items: Array<{ title?: string; snippet?: string; url?: string }>,
    dimensionName: string,
  ): string[] {
    const termFrequency = new Map<string, number>();
    const dimensionWords = new Set(
      dimensionName
        .toLowerCase()
        .split(/[\s,，、]+/)
        .filter((w) => w.length > 1),
    );

    for (const item of items) {
      const text = `${item.title || ""} ${item.snippet || ""}`;

      // 提取英文多词术语（2-3 个词的短语）
      const englishTerms =
        text.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}/g) || [];
      for (const term of englishTerms) {
        const lower = term.toLowerCase();
        if (!dimensionWords.has(lower) && lower.length > 3) {
          termFrequency.set(lower, (termFrequency.get(lower) || 0) + 1);
        }
      }

      // 提取中文关键词（2-4 字的高频词）
      const chineseTerms = text.match(/[\u4e00-\u9fa5]{2,4}/g) || [];
      for (const term of chineseTerms) {
        if (!dimensionWords.has(term) && term.length >= 2) {
          termFrequency.set(term, (termFrequency.get(term) || 0) + 1);
        }
      }

      // 提取全大写缩写词（如 GPU, LLM, API）
      const acronyms = text.match(/\b[A-Z]{2,6}\b/g) || [];
      for (const acr of acronyms) {
        const lower = acr.toLowerCase();
        if (!dimensionWords.has(lower)) {
          termFrequency.set(acr, (termFrequency.get(acr) || 0) + 1);
        }
      }
    }

    // 按频率排序，取出现 >= 2 次的术语
    return [...termFrequency.entries()]
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([term]) => term);
  }

  /**
   * 从文本中提取关键词（简单分词）
   */
  private extractKeywords(text: string): string[] {
    // 移除常见停用词，按空格和标点分词
    const stopWords = new Set([
      "the",
      "a",
      "an",
      "is",
      "are",
      "was",
      "were",
      "of",
      "in",
      "to",
      "for",
      "and",
      "or",
      "on",
      "at",
      "by",
      "with",
      "from",
      "as",
      "it",
      "that",
      "this",
      "have",
      "been",
      "will",
      "would",
      "could",
      "should",
      "about",
      "into",
      "more",
      "some",
      "than",
      "them",
      "then",
      "these",
      "those",
      "what",
      "when",
      "where",
      "which",
      "while",
      "also",
      "each",
      "only",
      "such",
      "very",
      "just",
      "over",
      "after",
      "before",
      "between",
      "under",
      "through",
      "during",
      "most",
      "other",
      "being",
      "both",
      "does",
      "done",
      "made",
      "make",
      "many",
      "much",
      "must",
      "need",
      "next",
      "like",
      "well",
      "back",
      "even",
      "still",
      "way",
      "的",
      "了",
      "在",
      "是",
      "我",
      "有",
      "和",
      "就",
      "不",
      "人",
      "都",
      "一",
      "一个",
      "上",
      "也",
      "很",
      "到",
      "说",
      "要",
      "去",
      "你",
      "会",
      "着",
      "没有",
      "看",
      "好",
      "自己",
      "这",
      "他",
      "她",
      "它",
      "们",
      "那",
      "对",
      "与",
      "及",
      "其",
      "或",
      "但",
      "而",
      "如",
      "中",
      "以",
      "为",
      "等",
      "所",
      "被",
      "把",
      "从",
      "并",
    ]);

    return text
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fff\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w))
      .filter((w, i, arr) => arr.indexOf(w) === i); // deduplicate
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
    } catch (error) {
      this.logger.debug(`[extractDomainFromUrl] Invalid URL: ${error}`);
      return null;
    }
  }

  /**
   * 准备增强后的证据数据
   * ★ 包含完整网页内容（fullContent）
   */
  private prepareEnrichedEvidenceData(
    enrichedItems: import("../../types/research.types").EnrichedResult[],
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
   * 校验并清理 Leader 分配的 allocatedFigures
   * - 通过 figureRegistry 查找并回填 imageUrl（不信任 LLM 输出的 URL）
   * - 过滤 figureId 不在注册表中的条目
   * - 过滤 imageUrl 无效的条目
   * - 全局去重：确保同一图表不被分配给多个 section
   * - 关键词相关性过滤：图表 caption 必须与 section 标题/描述有交集
   * - 记录分配结果日志
   */
  private validateAllocatedFigures(
    outline: DimensionOutline,
    figureRegistry: Map<string, FigureRegistryEntry>,
  ): void {
    const usedFigureIds = new Set<string>(); // 全局去重 by figureId
    const globalSeenUrls = new Set<string>(); // 全局去重 by imageUrl
    let totalAllocated = 0;

    for (const section of outline.sections) {
      if (!section.allocatedFigures || section.allocatedFigures.length === 0) {
        continue;
      }

      const valid: typeof section.allocatedFigures = [];
      for (const fig of section.allocatedFigures) {
        // 查找注册表
        const entry = figureRegistry.get(fig.figureId);
        if (!entry) {
          this.logger.warn(
            `[validateAllocatedFigures] Section "${section.title}": figureId "${fig.figureId}" not found in registry, skipping`,
          );
          continue;
        }

        // ★ CRITICAL: 始终从注册表回填 imageUrl，不信任 LLM 输出的 URL。
        // 注册表中的 URL 来自 FigureExtractor 的 GET+Range 验证，是可信的。
        fig.imageUrl = entry.imageUrl;
        fig.caption = fig.caption || entry.caption;

        // ★ 回填后统一校验 URL 有效性（拦截 base64/PDF/伪造 URL）
        if (!isValidFigureUrl(fig.imageUrl)) {
          this.logger.warn(
            `[validateAllocatedFigures] Section "${section.title}": invalid URL for ${fig.figureId}, skipping`,
          );
          continue;
        }

        // 全局去重 (by figureId)
        if (usedFigureIds.has(fig.figureId)) {
          this.logger.warn(
            `[validateAllocatedFigures] Section "${section.title}": duplicate ${fig.figureId}, skipping`,
          );
          continue;
        }
        usedFigureIds.add(fig.figureId);

        // 全局去重 (by imageUrl — prevents same image appearing in multiple sections)
        if (globalSeenUrls.has(fig.imageUrl)) {
          this.logger.warn(
            `[validateAllocatedFigures] Section "${section.title}": duplicate imageUrl for ${fig.figureId}, skipping`,
          );
          continue;
        }
        globalSeenUrls.add(fig.imageUrl);
        valid.push(fig);
      }

      // ★ 关键词相关性过滤：图表 caption 必须与 section 标题/描述有交集
      const relevant = valid.filter((fig) => {
        const captionLower = (fig.caption || "").toLowerCase();
        const sectionTitle = (section.title || "").toLowerCase();
        const sectionDesc = (section.description || "").toLowerCase();
        const sectionKeyPoints = (section.keyPoints || [])
          .map((kp: string) => kp.toLowerCase())
          .join(" ");
        const sectionText = `${sectionTitle} ${sectionDesc} ${sectionKeyPoints}`;

        // Extract Chinese bigrams and Latin words from caption for matching
        const chineseChars = captionLower.replace(/[^\u4e00-\u9fff]/g, "");
        const latinWords = captionLower
          .replace(/[\u4e00-\u9fff]+/g, " ")
          .split(/[\s\W]+/)
          .filter((w) => w.length >= 3);

        // Build bigrams from Chinese characters (sliding window of 2)
        const bigrams: string[] = [];
        for (let bi = 0; bi < chineseChars.length - 1; bi++) {
          bigrams.push(chineseChars.substring(bi, bi + 2));
        }
        const allKeywords = [...bigrams, ...latinWords];

        // ★ v6.0: caption 无关键词时放行（图片已通过 Vision LLM 语义审查）
        if (allKeywords.length === 0) {
          this.logger.debug(
            `[validateAllocatedFigures] Figure with empty/generic caption "${fig.caption}" from section "${section.title}" — accepting (already passed upstream filters)`,
          );
          return true;
        }

        // ★ v8: 相关性过滤 — Leader 已做语义判断，关键词匹配仅防明显错配
        const matchedKeywords = allKeywords.filter((kw) =>
          sectionText.includes(kw),
        );

        const isRelevant = matchedKeywords.length >= 1;

        if (!isRelevant) {
          this.logger.warn(
            `[validateAllocatedFigures] Removing irrelevant figure "${fig.figureId}" (caption: "${fig.caption}") from section "${section.title}" — matchCount=${matchedKeywords.length}/${allKeywords.length}`,
          );
        }
        return isRelevant;
      });
      section.allocatedFigures = relevant;
      totalAllocated += relevant.length;
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
   *
   * ★ 使用事务保证原子性：aggregate + createMany + findMany 在同一事务内
   *   防止并发写入时 citationIndex 冲突
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
      credibilityScore: assessCredibility(e),
    }));

    // ★ 使用 interactive transaction 保证原子性
    // 所有操作在同一事务内，防止并发竞态
    let created: { id: string; citationIndex: number | null }[];
    try {
      created = await this.prisma.$transaction(
        async (tx) => {
          // 步骤1：获取当前最大 citationIndex
          const maxIndexResult = await tx.topicEvidence.aggregate({
            where: { reportId },
            _max: { citationIndex: true },
          });
          const startIndex = (maxIndexResult._max.citationIndex || 0) + 1;

          // 步骤2：批量插入（createMany 比循环插入快得多）
          await tx.topicEvidence.createMany({
            data: evidenceWithCredibility.map((evidence, i) => ({
              title: evidence.title,
              url: evidence.url,
              domain: evidence.domain,
              snippet: evidence.snippet,
              sourceType: evidence.sourceType,
              publishedAt: validateDate(evidence.publishedAt),
              credibilityScore: evidence.credibilityScore,
              citationIndex: startIndex + i,
              reportId,
            })),
          });

          // 步骤3：查询刚插入的记录以获取 ID
          // 因为在同一事务内，citationIndex 范围是确定的
          return await tx.topicEvidence.findMany({
            where: {
              reportId,
              citationIndex: {
                gte: startIndex,
                lt: startIndex + evidenceWithCredibility.length,
              },
            },
            orderBy: { citationIndex: "asc" },
            select: { id: true, citationIndex: true },
          });
        },
        { timeout: 120000 },
      );
    } catch (err) {
      if (
        err instanceof PrismaClientKnownRequestError &&
        err.code === "P2003"
      ) {
        this.logger.warn(
          `[saveEvidence] FK constraint violation for reportId=${reportId}: report was deleted. Skipping evidence save.`,
        );
        return { savedIds: [], idMapping: new Map(), indexMapping: new Map() };
      }
      throw err;
    }

    // 构建 tempId -> actualId 映射
    const idMapping = new Map<string, string>();
    // ★ 构建 promptIndex -> actualCitationIndex 映射
    // promptIndex 是 LLM 看到的 [1], [2], [3]...
    // actualCitationIndex 是数据库中的实际编号
    const indexMapping = new Map<number, number>();
    evidenceData.forEach((e, index) => {
      if (created[index]) {
        idMapping.set(e.id, created[index].id);
        // promptIndex = index + 1 (从1开始)
        // actualCitationIndex = created[index].citationIndex
        indexMapping.set(index + 1, created[index].citationIndex!);
      }
    });

    return { savedIds: created.map((e) => e.id), idMapping, indexMapping };
  }

  // ★ Extracted: replaceEvidenceIds, validateDate → content-analysis.utils.ts
  // ★ Extracted: assessCredibility → credibility.utils.ts

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
    const content = integratedResult.content || "";

    return {
      dimensionId,
      summary: integratedResult.metadata.summary,
      keyFindings: integratedResult.metadata.keyFindings.map(
        (finding, index) => ({
          finding,
          significance: (index < 2 ? "high" : index < 4 ? "medium" : "low") as
            | "high"
            | "medium"
            | "low",
          implication: "",
          evidenceIds: [],
        }),
      ),
      trends: extractTrendsFromContent(content),
      challenges: extractChallengesFromContent(content),
      opportunities: extractOpportunitiesFromContent(content),
      evidenceUsed: evidenceIds.length,
      confidenceLevel: integratedResult.metadata.confidenceLevel,
      detailedContent: content,
      figureReferences,
      generatedCharts,
    };
  }

  // ★ Extracted: extractTrendsFromContent, extractChallengesFromContent,
  //   extractOpportunitiesFromContent, extractSectionItems, extractFromHeaders,
  //   extractFromBoldPatterns, extractFromSentences → content-analysis.utils.ts
}
