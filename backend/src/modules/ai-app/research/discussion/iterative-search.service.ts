import { Injectable, Logger } from "@nestjs/common";
// ★ 架构重构：通过 ToolRegistry 调用工具，不再直接调用 SearchService
import { ToolRegistry } from "@/modules/ai-engine/facade";
import type { ToolContext } from "@/modules/ai-engine/facade";
import {
  ResearchPlan,
  ResearchPlanStep,
  SearchRound,
  SearchSource,
} from "./types";

/**
 * 迭代搜索服务
 * 执行研究计划中的搜索步骤，支持流式进度反馈
 */
@Injectable()
export class IterativeSearchService {
  private readonly logger = new Logger(IterativeSearchService.name);

  // ★ 架构重构：通过 ToolRegistry 调用工具，不再直接依赖 SearchService
  constructor(private readonly toolRegistry: ToolRegistry) {}

  /**
   * 创建工具执行上下文
   */
  private createToolContext(toolId: string): ToolContext {
    return {
      executionId: `${toolId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      toolId,
      createdAt: new Date(),
      callerType: "orchestrator",
    };
  }

  /**
   * 执行单个搜索步骤
   * ★ 架构重构：通过 ToolRegistry 调用 web-search 工具
   */
  async executeStep(
    step: ResearchPlanStep,
    round: number,
  ): Promise<SearchRound> {
    this.logger.debug(`Executing search step ${step.id}: ${step.query}`);

    const startTime = Date.now();
    const maxResults = step.type === "academic" ? 10 : 15;

    // 根据步骤类型调整搜索查询
    const searchQuery = this.enhanceQuery(step.query, step.type);

    // ★ 通过 ToolRegistry 获取 web-search 工具
    const webSearchTool = this.toolRegistry.tryGet("web-search");
    if (!webSearchTool) {
      this.logger.error(
        `[executeStep] web-search tool not registered in ToolRegistry`,
      );
      return {
        round,
        stepId: step.id,
        query: step.query,
        resultsCount: 0,
        sources: [],
        timestamp: new Date(),
      };
    }

    try {
      // ★ 通过工具系统执行搜索
      const toolResult = await webSearchTool.execute(
        {
          query: searchQuery,
          numResults: maxResults,
        },
        this.createToolContext("web-search"),
      );

      if (!toolResult.success || !toolResult.data) {
        this.logger.warn(
          `[executeStep] Search failed: ${toolResult.error?.message || "unknown error"}`,
        );
        return {
          round,
          stepId: step.id,
          query: step.query,
          resultsCount: 0,
          sources: [],
          timestamp: new Date(),
        };
      }

      const searchData = toolResult.data as {
        results: Array<{
          title: string;
          url: string;
          content: string;
          domain?: string;
          publishedDate?: string;
          score?: number;
        }>;
        success: boolean;
      };

      if (!searchData.success || !searchData.results) {
        return {
          round,
          stepId: step.id,
          query: step.query,
          resultsCount: 0,
          sources: [],
          timestamp: new Date(),
        };
      }

      const sources: SearchSource[] = searchData.results.map(
        (result, index) => ({
          id: `source_${round}_${index}`,
          title: result.title,
          url: result.url,
          snippet: result.content,
          domain: result.domain || this.extractDomain(result.url),
          publishedDate: result.publishedDate,
          relevanceScore: result.score || 0.5,
        }),
      );

      const searchRound: SearchRound = {
        round,
        stepId: step.id,
        query: step.query,
        resultsCount: sources.length,
        sources,
        timestamp: new Date(),
      };

      const duration = Date.now() - startTime;
      this.logger.debug(
        `Step ${step.id} completed: ${sources.length} results in ${duration}ms`,
      );

      return searchRound;
    } catch (error) {
      this.logger.error(`Search step ${step.id} failed: ${error}`);
      return {
        round,
        stepId: step.id,
        query: step.query,
        resultsCount: 0,
        sources: [],
        timestamp: new Date(),
      };
    }
  }

  /**
   * 执行完整的研究计划
   * 返回生成器以支持流式进度反馈
   */
  async *executeplan(
    plan: ResearchPlan,
    onProgress?: (round: number, total: number, message: string) => void,
  ): AsyncGenerator<SearchRound> {
    const totalSteps = plan.steps.length;

    for (let i = 0; i < totalSteps; i++) {
      const step = plan.steps[i];
      const round = i + 1;

      onProgress?.(
        round,
        totalSteps,
        `正在搜索: ${step.query.slice(0, 50)}...`,
      );

      const searchRound = await this.executeStep(step, round);
      yield searchRound;

      // 避免 API 限速
      if (i < totalSteps - 1) {
        await this.delay(500);
      }
    }
  }

  /**
   * 批量执行搜索计划（非流式）
   */
  async executePlanBatch(plan: ResearchPlan): Promise<SearchRound[]> {
    const rounds: SearchRound[] = [];

    for await (const round of this.executeplan(plan)) {
      rounds.push(round);
    }

    return rounds;
  }

  /**
   * 合并并去重搜索结果
   */
  mergeAndDeduplicate(rounds: SearchRound[]): SearchSource[] {
    const urlSet = new Set<string>();
    const mergedSources: SearchSource[] = [];

    for (const round of rounds) {
      for (const source of round.sources) {
        // 使用 URL 去重
        const normalizedUrl = this.normalizeUrl(source.url);
        if (!urlSet.has(normalizedUrl)) {
          urlSet.add(normalizedUrl);
          mergedSources.push(source);
        }
      }
    }

    // 按相关性排序
    mergedSources.sort((a, b) => b.relevanceScore - a.relevanceScore);

    return mergedSources;
  }

  /**
   * 根据搜索类型增强查询
   */
  private enhanceQuery(query: string, stepType: string): string {
    if (!query) return query;
    switch (stepType) {
      case "academic":
        // 添加学术搜索关键词
        if (
          !query.toLowerCase().includes("research") &&
          !query.toLowerCase().includes("study") &&
          !query.toLowerCase().includes("paper")
        ) {
          return `${query} research paper academic study`;
        }
        return query;

      case "comparison":
        if (
          !query.includes("比较") &&
          !query.includes("comparison") &&
          !query.includes("vs")
        ) {
          return `${query} comparison analysis pros cons`;
        }
        return query;

      case "verification":
        // 添加最新/权威来源
        return `${query} official source ${new Date().getFullYear()}`;

      default:
        return query;
    }
  }

  /**
   * 从 URL 提取域名
   */
  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace("www.", "");
    } catch {
      return "";
    }
  }

  /**
   * 标准化 URL（去除协议、www、尾部斜杠等）
   */
  private normalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      return (
        urlObj.hostname.replace("www.", "") + urlObj.pathname.replace(/\/$/, "")
      );
    } catch {
      return url;
    }
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
