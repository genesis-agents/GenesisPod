/**
 * Leader Tool Service
 *
 * 给 Leader 提供工具调用能力，让 Leader 可以主动获取最新数据
 *
 * ★ 架构重构：通过 ToolRegistry 调用工具，不再直接调用 SearchService
 *
 * 核心功能:
 * 1. Leader 可以主动搜索获取最新信息
 * 2. Leader 可以验证数据的时效性和准确性
 * 3. Leader 在规划前可以先了解当前最新状态
 *
 * 解决的问题:
 * - Leader 不清楚"最新"是什么时候
 * - Leader 无法主动获取参考数据来辅助规划
 */

import { Injectable, Logger } from "@nestjs/common";
import { AIEngineFacade } from "@/modules/ai-engine/facade";
import { ToolRegistry } from "@/modules/ai-engine/tools/registry/tool-registry";
import { AIModelType } from "@prisma/client";
import {
  getCurrentDateString,
  getFreshnessRequirementDescription,
} from "../prompts/dimension-research.prompt";
import {
  AICapabilityResolver,
  AICapabilityContext,
} from "@/modules/ai-engine/capabilities/ai-capability-resolver.service";

/**
 * Leader 搜索上下文
 */
export interface LeaderSearchContext {
  topicName: string;
  topicDescription?: string;
  dimensionName: string;
  searchTimeRange?: string;
  userId?: string;
}

/**
 * Leader 搜索结果
 */
export interface LeaderSearchResult {
  query: string;
  results: Array<{
    title: string;
    url: string;
    snippet: string;
    publishedAt?: string;
    domain?: string;
  }>;
  currentDate: string;
  freshnessRequirement: string;
}

/**
 * Leader 规划上下文增强
 */
export interface EnhancedPlanningContext {
  currentDate: string;
  freshnessRequirement: string;
  latestSearchResults: LeaderSearchResult[];
  contextSummary: string;
}

@Injectable()
export class LeaderToolService {
  private readonly logger = new Logger(LeaderToolService.name);

  constructor(
    private readonly aiFacade: AIEngineFacade,
    private readonly toolRegistry: ToolRegistry,
    private readonly capabilityResolver: AICapabilityResolver,
  ) {}

  /**
   * Leader 主动搜索获取最新数据
   * ★ 通过 ToolRegistry 调用 web-search 工具，不再直接调用 SearchService
   *
   * @param context 搜索上下文
   * @param queries 搜索查询列表（可选，Leader 也可以自己生成）
   * @param capabilityContext AI 能力上下文（用于检查工具可用性）
   * @returns 搜索结果
   */
  async searchLatestData(
    context: LeaderSearchContext,
    queries?: string[],
    capabilityContext?: AICapabilityContext,
  ): Promise<LeaderSearchResult[]> {
    const currentDate = getCurrentDateString();
    const freshnessRequirement = getFreshnessRequirementDescription(
      context.searchTimeRange,
    );

    this.logger.log(
      `[searchLatestData] Leader searching for dimension: ${context.dimensionName}`,
    );

    // ★ 检查 web-search 工具是否可用
    if (capabilityContext) {
      const availableTools =
        await this.capabilityResolver.resolveToolsForAgent(capabilityContext);

      if (!availableTools.includes("web-search")) {
        this.logger.warn(
          "[searchLatestData] web-search tool not available in capability context",
        );
        return [];
      }
    }

    // ★ 通过 ToolRegistry 获取 web-search 工具
    const webSearchTool = this.toolRegistry.tryGet("web-search");
    if (!webSearchTool) {
      this.logger.error(
        "[searchLatestData] web-search tool not registered in ToolRegistry",
      );
      return [];
    }

    // 如果没有提供查询，让 Leader 生成查询
    const searchQueries =
      queries && queries.length > 0
        ? queries
        : await this.generateSearchQueries(context);

    const results: LeaderSearchResult[] = [];

    for (const query of searchQueries.slice(0, 3)) {
      // 最多 3 个查询
      const enhancedQuery = this.enhanceQueryWithTimestamp(query);

      this.logger.debug(`[searchLatestData] Searching: "${enhancedQuery}"`);

      try {
        // ★ 通过工具系统执行搜索
        const toolResult = await webSearchTool.execute(
          {
            query: enhancedQuery,
            numResults: 5,
          },
          {
            executionId: `leader-search-${Date.now()}`,
            toolId: "web-search",
            taskId: capabilityContext?.agentId || "leader",
            userId: context.userId || capabilityContext?.userId,
            callerType: "agent",
            createdAt: new Date(),
          },
        );

        if (toolResult.success && toolResult.data) {
          const searchData = toolResult.data as {
            results: Array<{
              title: string;
              url: string;
              content: string;
              publishedDate?: string;
              domain?: string;
            }>;
            success: boolean;
          };

          if (searchData.success && searchData.results) {
            results.push({
              query: enhancedQuery,
              results: searchData.results.map((r) => ({
                title: r.title,
                url: r.url,
                snippet: r.content,
                publishedAt: r.publishedDate,
                domain: r.domain,
              })),
              currentDate,
              freshnessRequirement,
            });
          }
        }
      } catch (error) {
        this.logger.warn(
          `[searchLatestData] Search failed for query "${query}": ${error}`,
        );
      }
    }

    this.logger.log(
      `[searchLatestData] Completed ${results.length} searches with ${results.reduce((sum, r) => sum + r.results.length, 0)} total results`,
    );

    // ★ 记录工具使用日志
    if (capabilityContext && results.length > 0) {
      this.capabilityResolver
        .logCapabilityUsage({
          capabilityType: "tool",
          capabilityId: "web-search",
          agentId: capabilityContext.agentId,
          userId: capabilityContext.userId,
          teamId: capabilityContext.teamId,
          success: true,
        })
        .catch((error) => {
          this.logger.warn(
            `Failed to log capability usage: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
    }

    return results;
  }

  /**
   * 生成增强的规划上下文
   * ★ 包含当前日期、时效性要求、最新搜索结果摘要
   *
   * @param context 搜索上下文
   * @param capabilityContext AI 能力上下文（用于检查工具可用性）
   * @returns 增强的规划上下文
   */
  async generateEnhancedPlanningContext(
    context: LeaderSearchContext,
    capabilityContext?: AICapabilityContext,
  ): Promise<EnhancedPlanningContext> {
    const currentDate = getCurrentDateString();
    const freshnessRequirement = getFreshnessRequirementDescription(
      context.searchTimeRange,
    );

    // ★ 检查工具可用性（如果提供了 capability context）
    if (capabilityContext) {
      const availableTools =
        await this.capabilityResolver.resolveToolsForAgent(capabilityContext);
      this.logger.log(
        `[generateEnhancedPlanningContext] Available tools for Leader: ${availableTools.join(", ")}`,
      );

      // 如果 web-search 不可用，直接返回空上下文
      if (!availableTools.includes("web-search")) {
        this.logger.warn(
          "[generateEnhancedPlanningContext] web-search tool not available, skipping data gathering",
        );
        return {
          currentDate,
          freshnessRequirement,
          latestSearchResults: [],
          contextSummary:
            "（工具不可用，无法获取最新数据，请基于已有证据进行分析）",
        };
      }
    }

    // 先进行搜索获取最新数据（传递 capabilityContext）
    const searchResults = await this.searchLatestData(
      context,
      undefined,
      capabilityContext,
    );

    // 生成上下文摘要
    const contextSummary = await this.summarizeSearchResults(
      context,
      searchResults,
    );

    return {
      currentDate,
      freshnessRequirement,
      latestSearchResults: searchResults,
      contextSummary,
    };
  }

  /**
   * 让 Leader 自己生成搜索查询
   */
  private async generateSearchQueries(
    context: LeaderSearchContext,
  ): Promise<string[]> {
    const currentYear = new Date().getFullYear();

    const prompt = `你是一位研究助手，需要为以下研究任务生成搜索查询词。

## 当前日期
${getCurrentDateString()}

## 研究主题
- 主题名称: ${context.topicName}
- 主题描述: ${context.topicDescription || "无"}

## 研究维度
${context.dimensionName}

## 任务
生成 3 个有效的搜索查询词，用于获取该维度的最新信息。
要求:
1. 查询要精准，能找到最新、最权威的信息
2. 包含当前年份 ${currentYear} 或 "latest" 等时效性关键词
3. 每个查询应该覆盖不同角度

直接输出 3 个查询词，每行一个，不要编号或解释。`;

    try {
      const response = await this.aiFacade.chat({
        messages: [{ role: "user", content: prompt }],
        modelType: AIModelType.CHAT_FAST,
        taskProfile: {
          creativity: "low",
          outputLength: "minimal",
        },
      });

      const queries = response.content
        .split("\n")
        .map((q) => q.trim())
        .filter((q) => q.length > 0)
        .slice(0, 3);

      return queries.length > 0
        ? queries
        : [`${context.topicName} ${context.dimensionName} ${currentYear}`];
    } catch (error) {
      this.logger.warn(
        `[generateSearchQueries] Failed to generate queries: ${error}`,
      );
      const year = new Date().getFullYear();
      return [
        `${context.topicName} ${context.dimensionName} ${year}`,
        `${context.dimensionName} latest trends ${year}`,
      ];
    }
  }

  /**
   * 增强搜索查询，添加时间戳关键词
   */
  private enhanceQueryWithTimestamp(query: string): string {
    const currentYear = new Date().getFullYear();
    const hasYearOrLatest = /20\d{2}|latest|recent|最新|最近/i.test(query);

    if (hasYearOrLatest) {
      return query;
    }

    return `${query} ${currentYear}`;
  }

  /**
   * 汇总搜索结果为上下文描述
   */
  private async summarizeSearchResults(
    context: LeaderSearchContext,
    searchResults: LeaderSearchResult[],
  ): Promise<string> {
    if (
      searchResults.length === 0 ||
      searchResults.every((r) => r.results.length === 0)
    ) {
      return "暂无最新搜索结果，请基于已有证据进行分析。";
    }

    const allResults = searchResults.flatMap((r) => r.results);
    const uniqueResults = this.deduplicateResults(allResults);

    // 生成摘要
    const resultsText = uniqueResults
      .slice(0, 10)
      .map(
        (r, i) =>
          `${i + 1}. [${r.domain || "未知来源"}] ${r.title}${r.publishedAt ? ` (${r.publishedAt})` : ""}`,
      )
      .join("\n");

    const prompt = `请根据以下搜索结果，为研究维度「${context.dimensionName}」生成一段简要的背景概述（100-150字）。

搜索结果:
${resultsText}

要求:
1. 概述该领域的当前状态和最新发展
2. 指出主要的趋势或关注点
3. 用客观、简洁的语言
4. 直接输出概述，不要添加标题或前缀`;

    try {
      const response = await this.aiFacade.chat({
        messages: [{ role: "user", content: prompt }],
        modelType: AIModelType.CHAT_FAST,
        taskProfile: {
          creativity: "low",
          outputLength: "short",
        },
      });

      return response.content.trim();
    } catch (error) {
      this.logger.warn(
        `[summarizeSearchResults] Failed to summarize: ${error}`,
      );
      return `找到 ${uniqueResults.length} 条相关结果，涵盖 ${context.dimensionName} 的最新动态。`;
    }
  }

  /**
   * 去重搜索结果
   */
  private deduplicateResults(
    results: Array<{
      title: string;
      url: string;
      snippet: string;
      publishedAt?: string;
      domain?: string;
    }>,
  ): typeof results {
    const seen = new Set<string>();
    return results.filter((r) => {
      const key = r.url.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }
}
