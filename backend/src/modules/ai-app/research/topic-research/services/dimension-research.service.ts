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
} from "../types/research.types";
import type { DataSourceResult } from "../types/data-source.types";
import {
  DIMENSION_RESEARCH_SYSTEM_PROMPT,
  DIMENSION_RESEARCH_USER_PROMPT_TEMPLATE,
  formatEvidenceForPrompt,
  renderPromptTemplate,
} from "../prompts/dimension-research.prompt";
import { DataSourceRouterService } from "./data-source-router.service";

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

      // 3. 准备证据数据（用于 AI 分析）
      const evidenceData = await this.prepareEvidenceData(searchResult.items);

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
    } catch {
      return null;
    }
  }

  /**
   * 准备证据数据（从搜索结果转换为证据数据）
   */
  private async prepareEvidenceData(
    searchItems: DataSourceResult[],
  ): Promise<EvidenceData[]> {
    return searchItems.map((item, index) => ({
      id: `temp-${index}-${Date.now()}`, // 临时 ID，稍后替换为数据库 ID
      title: item.title,
      url: item.url,
      // 优先使用 item.domain，如果没有则从 URL 提取
      domain: item.domain || this.extractDomainFromUrl(item.url),
      snippet: item.snippet || null,
      sourceType: item.sourceType,
      publishedAt: item.publishedAt || null,
      credibilityScore: null, // 稍后评估
    }));
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
    };

    // 渲染用户提示词
    const userPrompt = renderPromptTemplate(
      DIMENSION_RESEARCH_USER_PROMPT_TEMPLATE,
      promptVariables,
    );

    this.logger.debug(`Calling AI for dimension analysis: ${dimension.name}`);

    // 调用 AI (通过 AIEngineFacade 统一入口)
    const response = await this.aiFacade.chat({
      messages: [
        { role: "system", content: DIMENSION_RESEARCH_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      modelType: AIModelType.CHAT, // 使用标准聊天模型
      taskProfile: {
        creativity: "medium", // 需要一定创造性综合
        outputLength: "extended", // 详细深度分析需要更多 tokens
      },
    });

    // 解析 AI 响应
    const aiResult = this.parseAIResponse(response.content);

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
  private getRecencyScore(publishedAt: Date): number {
    const daysSince = Math.floor(
      (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60 * 24),
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
            publishedAt: evidence.publishedAt,
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
