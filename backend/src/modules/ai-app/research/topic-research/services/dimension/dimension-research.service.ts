import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import { AIEngineFacade } from "@/modules/ai-engine/facade";
import { extractJsonFromAIResponse } from "@/common/utils/json-extraction.utils";
import { sanitizeObjectContent } from "@/common/utils/sanitize-content.utils";
import { AIModelType, DimensionStatus } from "@prisma/client";
import type { ResearchTopic, TopicDimension } from "@prisma/client";
import type {
  ResearchOptions,
  DimensionAnalysisResult,
  AIDimensionAnalysisResponse,
  EvidenceData,
  FigureReference,
  GeneratedChart,
  EnrichedEvidenceData,
  ExtractedFigure,
} from "../../types/research.types";
import type { DataSourceResult } from "../../types/data-source.types";
import {
  DIMENSION_RESEARCH_SYSTEM_PROMPT,
  DIMENSION_RESEARCH_USER_PROMPT_TEMPLATE,
  formatEvidenceForPrompt,
  renderPromptTemplate,
  getCurrentDateString,
  getFreshnessRequirementDescription,
  getLanguageInstruction,
} from "../../prompts/dimension-research.prompt";
import { DataSourceRouterService } from "../data/data-source-router.service";
import { DataEnrichmentService } from "../data/data-enrichment.service";

/**
 * 维度研究结果（包含证据ID）
 */
export interface DimensionResearchResult {
  analysisResult: DimensionAnalysisResult;
  evidenceIds: string[];
}

/**
 * Dimension Research Service
 *
 * 负责单个维度的研究执行：
 * 1. 调用 DataSourceRouter 获取相关数据
 * 2. 使用 AI 分析数据并生成维度分析
 * 3. 保存分析结果到数据库
 * 4. 管理证据记录
 */
@Injectable()
export class DimensionResearchService {
  private readonly logger = new Logger(DimensionResearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiFacade: AIEngineFacade,
    private readonly dataSourceRouter: DataSourceRouterService,
    private readonly dataEnrichmentService: DataEnrichmentService,
  ) {}

  /**
   * 执行维度研究
   *
   * @param topic 研究专题
   * @param dimension 研究维度
   * @param reportId 报告ID（可选，用于关联证据）
   * @param options 研究选项
   * @returns 维度分析结果和证据ID列表
   */
  async researchDimension(
    topic: ResearchTopic,
    dimension: TopicDimension,
    reportId?: string,
    _options?: ResearchOptions, // 保留参数以供将来使用
  ): Promise<DimensionResearchResult> {
    this.logger.log(
      `Starting research for dimension: ${dimension.name} (${dimension.id})`,
    );

    // 1. 更新维度状态为研究中
    await this.updateDimensionStatus(dimension.id, DimensionStatus.RESEARCHING);

    try {
      // 2. 调用 DataSourceRouter 获取相关数据
      const searchResult = await this.dataSourceRouter.fetchDataForDimension(
        dimension,
        topic,
      );

      this.logger.log(
        `Found ${searchResult.items.length} sources for dimension: ${dimension.name}`,
      );

      // 2.5. ★ 数据增强：抓取完整内容和提取图表
      // ★ 从 topicConfig 获取 enableFigures 配置（默认 true）
      const topicConfig = topic.topicConfig as Record<string, unknown> | null;
      const enableFigures = topicConfig?.enableFigures !== false;

      const enrichedResults =
        await this.dataEnrichmentService.enrichSearchResults(
          searchResult.items,
          {
            topN: 10, // 增强前 10 条结果
            maxContentLength: 3000,
            fetchTimeout: 10000,
            parallel: true,
            enableFigures, // ★ 传递图表提取开关
          },
        );

      const enrichmentStats =
        this.dataEnrichmentService.getEnrichmentStats(enrichedResults);
      this.logger.log(
        `Data enrichment: ${enrichmentStats.fetched}/${enrichmentStats.total} fetched, ${enrichedResults.reduce((sum, r) => sum + (r.extractedFigures?.length || 0), 0)} figures extracted`,
      );

      // 3. 准备证据数据（用于 AI 分析）
      const evidenceData = await this.prepareEvidenceData(enrichedResults);

      // 4. 使用 AI 分析数据
      const analysisResult = await this.analyzeWithAI(
        topic,
        dimension,
        evidenceData,
      );

      // 5. 评估证据可信度
      const evidenceWithCredibility =
        await this.assessCredibility(evidenceData);

      // 6. 保存证据到数据库
      let savedEvidence: Array<{ id: string }> = [];
      if (reportId) {
        savedEvidence = await this.saveEvidence(
          evidenceWithCredibility,
          reportId,
        );
      }

      // 7. 创建证据 ID 映射（原始 ID -> 数据库 ID）
      const evidenceIdMap = new Map<string, string>(
        savedEvidence.map((e, i) => [evidenceData[i].id, e.id]),
      );

      // 8. 替换分析结果中的证据 ID（从临时 ID 替换为数据库 ID）
      const finalResult = this.mapEvidenceIds(analysisResult, evidenceIdMap);

      // 9. 更新维度状态为已完成
      await this.updateDimensionStatus(
        dimension.id,
        DimensionStatus.COMPLETED,
        new Date(),
      );

      this.logger.log(
        `Completed research for dimension: ${dimension.name} (${dimension.id})`,
      );

      return {
        analysisResult: finalResult,
        evidenceIds: savedEvidence.map((e) => e.id),
      };
    } catch (error) {
      // 更新维度状态为失败
      await this.updateDimensionStatus(dimension.id, DimensionStatus.FAILED);

      this.logger.error(
        `Failed to research dimension: ${dimension.name} (${dimension.id})`,
        error instanceof Error ? error.stack : error,
      );

      throw error;
    }
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
   * 准备证据数据（从搜索结果转换为证据数据）
   * ★ 支持 EnrichedResult，包含 fullContent 和 extractedFigures
   */
  private async prepareEvidenceData(
    searchItems: DataSourceResult[],
  ): Promise<EnrichedEvidenceData[]> {
    return searchItems.map((item, index) => {
      // 类型断言：检查是否为 EnrichedResult
      const enrichedItem = item as DataSourceResult & {
        fullContent?: string | null;
        contentSource?: "fetched" | "snippet";
        extractedFigures?: ExtractedFigure[];
      };

      return {
        id: `temp-${index}-${Date.now()}`, // 临时 ID，稍后替换为数据库 ID
        title: item.title,
        url: item.url,
        // 优先使用 item.domain，如果没有则从 URL 提取
        domain: item.domain || this.extractDomainFromUrl(item.url),
        snippet: item.snippet || null,
        sourceType: item.sourceType,
        publishedAt: item.publishedAt || null,
        credibilityScore: null, // 稍后评估
        // ★ 新增：完整内容和图表
        fullContent: enrichedItem.fullContent || null,
        contentSource: enrichedItem.contentSource,
        extractedFigures: enrichedItem.extractedFigures,
      };
    });
  }

  /**
   * 使用 AI 分析维度数据
   */
  private async analyzeWithAI(
    topic: ResearchTopic,
    dimension: TopicDimension,
    evidenceData: EvidenceData[],
  ): Promise<DimensionAnalysisResult> {
    // 格式化证据列表
    const evidenceFormatted = formatEvidenceForPrompt(evidenceData);

    // ★ 从专题配置获取搜索时间范围
    const topicConfig = topic.topicConfig as Record<string, unknown> | null;
    const searchTimeRange = topicConfig?.searchTimeRange as string | undefined;

    // ★ 根据专题语言设置获取语言指令
    const languageInstruction = getLanguageInstruction(topic.language || "zh");

    // 准备提示词变量
    const promptVariables = {
      topicName: topic.name,
      topicType: topic.type,
      topicDescription: topic.description || "无",
      dimensionName: dimension.name,
      dimensionDescription: dimension.description || "无",
      focusAreas: Array.isArray(dimension.searchQueries)
        ? (dimension.searchQueries as string[]).join(", ")
        : "无",
      evidenceList: evidenceFormatted,
      // ★ 时间上下文：确保 AI 使用最新数据而非训练数据
      currentDate: getCurrentDateString(),
      freshnessRequirement: getFreshnessRequirementDescription(searchTimeRange),
      // ★ 语言指令：根据专题设置使用相应语言
      languageInstruction,
    };

    // ★ 渲染系统提示词（包含语言指令）
    const systemPrompt = renderPromptTemplate(
      DIMENSION_RESEARCH_SYSTEM_PROMPT,
      {
        languageInstruction,
      },
    );

    // 渲染用户提示词
    const userPrompt = renderPromptTemplate(
      DIMENSION_RESEARCH_USER_PROMPT_TEMPLATE,
      promptVariables,
    );

    this.logger.debug(
      `Calling AI for dimension analysis: ${dimension.name} (language: ${topic.language || "zh"})`,
    );

    // 调用 AI (通过 AIEngineFacade 统一入口)
    // ★ 维度研究需要充足的输出空间（4000-8000字 ≈ 12000-24000 tokens）
    const response = await this.aiFacade.chat({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      modelType: AIModelType.CHAT,
      taskProfile: {
        creativity: "medium",
        outputLength: "extended",
      },
      maxTokens: 32000, // 覆盖 extended 默认的 16000，确保深度分析不被截断
    });

    // 解析 AI 响应
    let aiResult = this.parseAIResponse(response.content);

    // ★ 内容长度校验 + 多轮自动续写：循环请求直到达到最低标准
    const MIN_DETAILED_CONTENT_CHARS = 8000;
    const MAX_CONTINUATION_ROUNDS = 3;
    for (let round = 0; round < MAX_CONTINUATION_ROUNDS; round++) {
      const currentLength = (aiResult.detailedContent || "").length;
      if (currentLength >= MIN_DETAILED_CONTENT_CHARS) break;

      this.logger.warn(
        `[ContentCheck] Round ${round + 1}: detailedContent only ${currentLength} chars (min: ${MIN_DETAILED_CONTENT_CHARS}), requesting continuation for ${dimension.name}`,
      );
      try {
        const continuationResponse = await this.aiFacade.chat({
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: `你正在为维度「${dimension.name}」撰写深度分析报告。以下是你已经写好的内容（${currentLength}字符），但远未达到 18000 字符的最低标准。

已有内容末尾：
${(aiResult.detailedContent || "").slice(-2000)}

请从上面结束的地方继续扩写，只输出需要追加的 Markdown 内容（不需要 JSON）。要求：
1. 补充深度数据分析、行业案例、专家观点引用
2. 每个论点要有 2-3 段详细论述，包含具体数据支撑
3. 至少再写 ${MIN_DETAILED_CONTENT_CHARS - currentLength} 字符
4. 使用专业的分析报告语气，段落之间逻辑衔接自然`,
            },
          ],
          modelType: AIModelType.CHAT,
          taskProfile: { creativity: "medium", outputLength: "extended" },
          maxTokens: 32000,
        });
        const continuation = continuationResponse.content?.trim() || "";
        if (continuation.length > 300) {
          aiResult = {
            ...aiResult,
            detailedContent:
              (aiResult.detailedContent || "") + "\n\n" + continuation,
          };
          this.logger.log(
            `[ContentCheck] Round ${round + 1}: Appended ${continuation.length} chars. Total: ${aiResult.detailedContent.length} chars`,
          );
        } else {
          this.logger.warn(
            `[ContentCheck] Round ${round + 1}: continuation too short (${continuation.length}), stopping`,
          );
          break;
        }
      } catch (err) {
        this.logger.warn(
          `[ContentCheck] Round ${round + 1} failed: ${(err as Error).message}`,
        );
        break;
      }
    }

    // ★ keyFindings 质量校验 + 补充请求 (#23)
    const findings = aiResult.dimensionAnalysis.keyFindings || [];
    const shortFindings = findings.filter(
      (f) =>
        (f.finding || "").length < 80 ||
        !(f as Record<string, unknown>).implication,
    );
    if (shortFindings.length > 0 || findings.length < 5) {
      this.logger.warn(
        `[QualityCheck] keyFindings quality issue: ${findings.length} findings, ${shortFindings.length} too short/missing implication for ${dimension.name}`,
      );
      try {
        const kfResponse = await this.aiFacade.chat({
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: `基于以下维度研究内容，生成 5-8 个高质量关键发现。

维度: ${dimension.name}
研究内容摘要: ${(aiResult.detailedContent || "").substring(0, 8000)}

要求严格按以下 JSON 数组格式输出：
\`\`\`json
[
  {
    "finding": "【100-200字】详细描述核心发现，必须包含具体数据、关键事实、趋势方向",
    "significance": "high|medium|low",
    "implication": "【50-100字】深层含义：对行业的影响、投资启示、未来演变",
    "evidenceIds": ["evidence-1", "evidence-2"]
  }
]
\`\`\`

每个 finding 必须 100-200字，每个 implication 必须 50-100字。严禁输出简短片段。`,
            },
          ],
          modelType: AIModelType.CHAT,
          taskProfile: { creativity: "low", outputLength: "medium" },
          maxTokens: 8000,
        });
        const kfExtracted = extractJsonFromAIResponse<
          Array<{
            finding: string;
            significance: string;
            implication: string;
            evidenceIds: string[];
          }>
        >(kfResponse.content, {});
        if (
          kfExtracted.success &&
          Array.isArray(kfExtracted.data) &&
          kfExtracted.data.length >= 3
        ) {
          const validSignificance = ["high", "medium", "low"] as const;
          aiResult = {
            ...aiResult,
            dimensionAnalysis: {
              ...aiResult.dimensionAnalysis,
              keyFindings: kfExtracted.data.map((f) => ({
                finding: f.finding || "",
                significance: (validSignificance.includes(
                  f.significance as "high" | "medium" | "low",
                )
                  ? f.significance
                  : "medium") as "high" | "medium" | "low",
                implication: f.implication || "",
                evidenceIds: f.evidenceIds || [],
              })),
            },
          };
          this.logger.log(
            `[QualityCheck] Replaced keyFindings with ${kfExtracted.data.length} enhanced findings`,
          );
        }
      } catch (err) {
        this.logger.warn(
          `[QualityCheck] keyFindings enhancement failed: ${(err as Error).message}`,
        );
      }
    }

    // ★ trends/challenges/opportunities 空值补充 (#25)
    const da = aiResult.dimensionAnalysis;
    const missingFields: string[] = [];
    if (!da.trends?.length) missingFields.push("trends");
    if (!da.challenges?.length) missingFields.push("challenges");
    if (!da.opportunities?.length) missingFields.push("opportunities");
    if (missingFields.length > 0) {
      this.logger.warn(
        `[QualityCheck] Missing structured fields: ${missingFields.join(", ")} for ${dimension.name}`,
      );
      try {
        const structResponse = await this.aiFacade.chat({
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: `基于以下维度研究内容，提取结构化分析数据。

维度: ${dimension.name}
研究内容: ${(aiResult.detailedContent || "").substring(0, 6000)}

严格按以下 JSON 格式输出：
\`\`\`json
{
  "trends": [
    {"trend": "趋势描述(50-100字)", "direction": "increasing|decreasing|stable|emerging", "timeframe": "时间范围", "evidenceIds": []}
  ],
  "challenges": [
    {"challenge": "挑战描述(50-100字)", "impact": "影响描述", "evidenceIds": []}
  ],
  "opportunities": [
    {"opportunity": "机会描述(50-100字)", "potential": "潜力描述", "evidenceIds": []}
  ]
}
\`\`\`
每个字段至少 3 项。`,
            },
          ],
          modelType: AIModelType.CHAT,
          taskProfile: { creativity: "low", outputLength: "short" },
          maxTokens: 4000,
        });
        const structExtracted = extractJsonFromAIResponse<{
          trends?: Array<{
            trend: string;
            direction: string;
            timeframe: string;
            evidenceIds: string[];
          }>;
          challenges?: Array<{
            challenge: string;
            impact: string;
            evidenceIds: string[];
          }>;
          opportunities?: Array<{
            opportunity: string;
            potential: string;
            evidenceIds: string[];
          }>;
        }>(structResponse.content, {});
        if (structExtracted.success && structExtracted.data) {
          const d = structExtracted.data;
          const validDirections = [
            "increasing",
            "decreasing",
            "stable",
            "emerging",
          ] as const;
          type Direction = (typeof validDirections)[number];
          aiResult = {
            ...aiResult,
            dimensionAnalysis: {
              ...aiResult.dimensionAnalysis,
              trends: d.trends?.length
                ? d.trends.map((t) => ({
                    trend: t.trend || "",
                    direction: (validDirections.includes(
                      t.direction as Direction,
                    )
                      ? t.direction
                      : "emerging") as Direction,
                    timeframe: t.timeframe || "",
                    evidenceIds: t.evidenceIds || [],
                  }))
                : aiResult.dimensionAnalysis.trends,
              challenges: d.challenges?.length
                ? d.challenges.map((c) => ({
                    challenge: c.challenge || "",
                    impact: c.impact || "",
                    evidenceIds: c.evidenceIds || [],
                  }))
                : aiResult.dimensionAnalysis.challenges,
              opportunities: d.opportunities?.length
                ? d.opportunities.map((o) => ({
                    opportunity: o.opportunity || "",
                    potential: o.potential || "",
                    evidenceIds: o.evidenceIds || [],
                  }))
                : aiResult.dimensionAnalysis.opportunities,
            },
          };
          this.logger.log(
            `[QualityCheck] Filled structured fields: trends=${d.trends?.length || 0}, challenges=${d.challenges?.length || 0}, opportunities=${d.opportunities?.length || 0}`,
          );
        }
      } catch (err) {
        this.logger.warn(
          `[QualityCheck] Structured fields fill failed: ${(err as Error).message}`,
        );
      }
    }

    // ★ 诊断日志：检查 AI 输出的图表数据
    const figRefsCount = aiResult.figureReferences?.length ?? 0;
    const genChartsCount = aiResult.generatedCharts?.length ?? 0;
    this.logger.log(
      `[Charts] AI output: figureReferences=${figRefsCount}, generatedCharts=${genChartsCount}`,
    );
    if (figRefsCount > 0 && aiResult.figureReferences) {
      this.logger.debug(
        `[Charts] figureReferences preview: ${JSON.stringify(aiResult.figureReferences[0])}`,
      );
    }

    // 转换为标准格式
    return {
      dimensionId: dimension.id,
      summary: aiResult.dimensionAnalysis.summary,
      keyFindings: aiResult.dimensionAnalysis.keyFindings,
      trends: aiResult.dimensionAnalysis.trends,
      challenges: aiResult.dimensionAnalysis.challenges,
      opportunities: aiResult.dimensionAnalysis.opportunities,
      evidenceUsed: aiResult.evidenceUsage.total,
      confidenceLevel: aiResult.dimensionAnalysis.confidenceLevel,
      detailedContent: aiResult.detailedContent,
      // ★ 新增：图表引用和生成图表
      figureReferences: aiResult.figureReferences,
      generatedCharts: aiResult.generatedCharts,
    };
  }

  /**
   * 解析 AI 响应
   * 使用共享的 JSON 提取工具，支持：
   * - 直接 JSON 解析
   * - ```json 代码块提取
   * - ``` 代码块提取
   * - 带 requiredKey 的 JSON 对象查找
   * - 截断 JSON 修复
   */
  private parseAIResponse(content: string): AIDimensionAnalysisResponse {
    const extractionResult =
      extractJsonFromAIResponse<AIDimensionAnalysisResponse>(content, {
        requiredKey: "dimensionAnalysis",
      });

    if (extractionResult.success && extractionResult.data) {
      this.logger.debug(
        `Successfully extracted JSON using method: ${extractionResult.method}`,
      );
      return this.validateAndNormalizeResponse(extractionResult.data);
    }

    // 所有方法都失败，记录错误并创建后备响应
    this.logger.error(
      "Failed to parse AI response, content preview:",
      content.substring(0, 500),
    );
    this.logger.warn("Creating fallback response due to parse failure");
    return this.createFallbackResponse(content);
  }

  /**
   * 验证并标准化响应
   * ★ 同时清理 AI 生成内容中的格式问题（如引用后的孤立下划线）
   */
  private validateAndNormalizeResponse(
    parsed: unknown,
  ): AIDimensionAnalysisResponse {
    const response = parsed as AIDimensionAnalysisResponse;

    // 确保必需字段存在
    if (!response.dimensionAnalysis) {
      throw new Error("Missing dimensionAnalysis field");
    }

    // 标准化字段
    const normalized: AIDimensionAnalysisResponse = {
      dimensionAnalysis: {
        summary: response.dimensionAnalysis.summary || "",
        keyFindings: response.dimensionAnalysis.keyFindings || [],
        trends: response.dimensionAnalysis.trends || [],
        keyPlayers: response.dimensionAnalysis.keyPlayers || [],
        challenges: response.dimensionAnalysis.challenges || [],
        opportunities: response.dimensionAnalysis.opportunities || [],
        dataGaps: response.dimensionAnalysis.dataGaps || [],
        confidenceLevel: response.dimensionAnalysis.confidenceLevel || "medium",
        confidenceReason: response.dimensionAnalysis.confidenceReason || "",
      },
      detailedContent: response.detailedContent || "",
      // ★ 新增：图表引用和生成图表
      figureReferences: this.normalizeFigureReferences(
        response.figureReferences,
      ),
      generatedCharts: this.normalizeGeneratedCharts(response.generatedCharts),
      evidenceUsage: response.evidenceUsage || {
        total: 0,
        highCredibility: 0,
        mediumCredibility: 0,
        lowCredibility: 0,
      },
    };

    // ★ 清理 AI 生成内容中的格式问题（如引用后的孤立下划线 [1]__）
    return sanitizeObjectContent(normalized);
  }

  /**
   * 标准化图表引用列表
   */
  private normalizeFigureReferences(
    refs: FigureReference[] | undefined,
  ): FigureReference[] {
    if (!refs || !Array.isArray(refs)) {
      return [];
    }
    return refs.map((ref, idx) => ({
      id: `fig-${idx + 1}`,
      evidenceCitationIndex: ref.evidenceCitationIndex || 0,
      figureIndex: ref.figureIndex || 0,
      imageUrl: ref.imageUrl,
      caption: ref.caption || "",
      position: ref.position || `after_paragraph_${idx + 1}`,
      source: ref.source,
      relevance: ref.relevance,
    }));
  }

  /**
   * 标准化生成图表列表
   */
  private normalizeGeneratedCharts(
    charts: GeneratedChart[] | undefined,
  ): GeneratedChart[] {
    if (!charts || !Array.isArray(charts)) {
      return [];
    }
    return charts.map((chart, idx) => ({
      id: `chart-${idx + 1}`,
      type: chart.type || "bar",
      title: chart.title || `图表 ${idx + 1}`,
      position: chart.position || `after_paragraph_${idx + 1}`,
      data: Array.isArray(chart.data) ? chart.data : [],
      source: chart.source || "基于证据数据生成",
      reason: chart.reason,
    }));
  }

  /**
   * 创建后备响应（当解析完全失败时）
   */
  private createFallbackResponse(content: string): AIDimensionAnalysisResponse {
    this.logger.warn("Creating fallback response due to parse failure");
    return {
      dimensionAnalysis: {
        summary:
          "由于AI响应格式问题，无法完整解析分析结果。原始内容已保存在详细分析中。",
        keyFindings: [],
        trends: [],
        keyPlayers: [],
        challenges: [],
        opportunities: [],
        dataGaps: ["AI响应解析失败，需要重新研究此维度"],
        confidenceLevel: "low",
        confidenceReason: "AI响应格式不正确，无法提取结构化信息",
      },
      detailedContent: content.substring(0, 10000), // 保留原始内容的前10000字符
      evidenceUsage: {
        total: 0,
        highCredibility: 0,
        mediumCredibility: 0,
        lowCredibility: 0,
      },
    };
  }

  /**
   * 评估证据可信度
   *
   * 基于以下因素：
   * 1. 域名权威性
   * 2. 来源类型
   * 3. 时效性
   */
  private async assessCredibility(
    evidenceData: EvidenceData[],
  ): Promise<EvidenceData[]> {
    return evidenceData.map((evidence) => {
      let score = 50; // 基础分数

      // 1. 域名权威性 (30 分)
      if (evidence.domain) {
        const domainScore = this.getDomainAuthorityScore(evidence.domain);
        score += domainScore * 0.3;
      }

      // 2. 来源类型 (30 分)
      if (evidence.sourceType) {
        const sourceScore = this.getSourceTypeScore(evidence.sourceType);
        score += sourceScore * 0.3;
      }

      // 3. 时效性 (20 分)
      if (evidence.publishedAt) {
        const recencyScore = this.getRecencyScore(evidence.publishedAt);
        score += recencyScore * 0.2;
      }

      return {
        ...evidence,
        credibilityScore: Math.round(Math.min(100, Math.max(0, score))),
      };
    });
  }

  /**
   * 获取域名权威性分数 (0-100)
   */
  private getDomainAuthorityScore(domain: string): number {
    const highAuthority = [
      "gov",
      "edu",
      "nature.com",
      "science.org",
      "arxiv.org",
      "springer.com",
      "ieee.org",
      "acm.org",
    ];
    const mediumAuthority = [
      "reuters.com",
      "bloomberg.com",
      "wsj.com",
      "ft.com",
      "economist.com",
      "techcrunch.com",
      "wired.com",
    ];

    if (highAuthority.some((auth) => domain.includes(auth))) return 100;
    if (mediumAuthority.some((auth) => domain.includes(auth))) return 70;
    return 40;
  }

  /**
   * 获取来源类型分数 (0-100)
   */
  private getSourceTypeScore(sourceType: string): number {
    if (!sourceType) return 40;
    const scores: Record<string, number> = {
      academic: 100,
      news: 70,
      web: 50,
      github: 60,
      rss: 50,
      local: 80,
    };
    return scores[sourceType.toLowerCase()] || 40;
  }

  /**
   * 获取时效性分数 (0-100)
   */
  private getRecencyScore(publishedAt: Date | string): number {
    // 确保是 Date 对象
    const date =
      publishedAt instanceof Date ? publishedAt : new Date(publishedAt);

    // 检查是否为有效日期
    if (isNaN(date.getTime())) {
      return 50; // 无法解析日期时返回中等分数
    }

    const daysSince = Math.floor(
      (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (daysSince <= 30) return 100; // 1 个月内
    if (daysSince <= 90) return 80; // 3 个月内
    if (daysSince <= 180) return 60; // 6 个月内
    if (daysSince <= 365) return 40; // 1 年内
    return 20; // 超过 1 年
  }

  /**
   * 保存证据到数据库
   *
   * @param evidenceData 证据数据列表
   * @param reportId 报告ID
   * @returns 保存的证据列表
   */
  private async saveEvidence(
    evidenceData: EvidenceData[],
    reportId: string,
  ): Promise<Array<{ id: string; title: string; url: string }>> {
    if (evidenceData.length === 0) {
      return [];
    }

    // 使用事务批量创建
    const created = await this.prisma.$transaction(
      evidenceData.map((evidence) =>
        this.prisma.topicEvidence.create({
          data: {
            title: evidence.title,
            url: evidence.url,
            domain: evidence.domain,
            snippet: evidence.snippet,
            sourceType: evidence.sourceType,
            // ★ 验证日期有效性，无效日期设为 null
            publishedAt: this.validateDate(evidence.publishedAt),
            credibilityScore: evidence.credibilityScore,
            reportId,
          },
          select: {
            id: true,
            title: true,
            url: true,
          },
        }),
      ),
    );

    return created;
  }

  /**
   * 验证日期有效性
   * ★ 修复：避免 Invalid Date 导致 Prisma 验证错误
   */
  private validateDate(date: Date | string | null | undefined): Date | null {
    if (!date) {
      return null;
    }
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) {
      return null;
    }
    return d;
  }

  /**
   * 映射证据 ID（从临时 ID 替换为数据库 ID）
   */
  private mapEvidenceIds(
    result: DimensionAnalysisResult,
    evidenceIdMap: Map<string, string>,
  ): DimensionAnalysisResult {
    const mapIds = (ids: string[]): string[] =>
      ids.map((id) => evidenceIdMap.get(id) || id);

    return {
      ...result,
      keyFindings: result.keyFindings.map((finding) => ({
        ...finding,
        evidenceIds: mapIds(finding.evidenceIds),
      })),
      trends: result.trends.map((trend) => ({
        ...trend,
        evidenceIds: mapIds(trend.evidenceIds),
      })),
      challenges: result.challenges.map((challenge) => ({
        ...challenge,
        evidenceIds: mapIds(challenge.evidenceIds),
      })),
      opportunities: result.opportunities.map((opportunity) => ({
        ...opportunity,
        evidenceIds: mapIds(opportunity.evidenceIds),
      })),
    };
  }

  /**
   * 更新维度状态
   * 使用 updateMany 以优雅处理记录不存在的情况（任务可能已被取消/删除）
   */
  private async updateDimensionStatus(
    dimensionId: string,
    status: DimensionStatus,
    lastResearchedAt?: Date,
  ): Promise<void> {
    const result = await this.prisma.topicDimension.updateMany({
      where: { id: dimensionId },
      data: {
        status,
        lastResearchedAt: lastResearchedAt || undefined,
      },
    });

    if (result.count === 0) {
      this.logger.warn(
        `[updateDimensionStatus] Dimension ${dimensionId} not found, may have been deleted`,
      );
    }
  }
}
