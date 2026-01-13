import { Injectable, Logger } from "@nestjs/common";
import { AIModelType } from "@prisma/client";
import { AIEngineFacade } from "../../../ai-engine/facade";
import {
  SearchRound,
  SearchSource,
  Reflection,
  ReflectionDecision,
  ResearchPlan,
  ResearchPlanStep,
  AIReflectionResponse,
} from "./types";

/**
 * 自我反思服务
 * 评估搜索结果质量，决定是否继续搜索
 *
 * ✅ 已迁移：使用 AIEngineFacade 统一入口
 */
@Injectable()
export class SelfReflectionService {
  private readonly logger = new Logger(SelfReflectionService.name);

  constructor(private readonly aiFacade: AIEngineFacade) {}

  /**
   * 对当前搜索结果进行反思评估
   */
  async reflect(
    query: string,
    plan: ResearchPlan,
    searchRounds: SearchRound[],
    currentRound: number,
    maxRounds: number,
  ): Promise<Reflection> {
    this.logger.debug(`Reflecting on round ${currentRound}/${maxRounds}`);

    // 准备搜索结果摘要
    const resultsSummary = this.summarizeResults(searchRounds);

    const systemPrompt = this.buildReflectionPrompt();
    const userPrompt = this.buildUserPrompt(
      query,
      plan,
      resultsSummary,
      currentRound,
      maxRounds,
    );

    try {
      // ★ 使用 AIEngineFacade 统一入口，使用 CHAT_FAST 模型进行快速反思
      const result = await this.aiFacade.chat({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        modelType: AIModelType.CHAT_FAST,
        taskProfile: {
          creativity: "low", // 反思需要较低创造性，保持客观
          outputLength: "minimal", // 反思输出较短
        },
      });

      const reflection = this.parseReflectionResponse(
        result.content,
        currentRound,
      );
      this.logger.debug(`Reflection decision: ${reflection.decision}`);

      return reflection;
    } catch (error) {
      this.logger.error(`Reflection failed: ${error}`);
      // 默认继续搜索
      return this.getDefaultReflection(currentRound, searchRounds);
    }
  }

  /**
   * 快速评估是否需要继续搜索
   */
  shouldContinue(
    reflection: Reflection,
    currentRound: number,
    maxRounds: number,
  ): boolean {
    // 已达到最大轮次
    if (currentRound >= maxRounds) {
      return false;
    }

    // 根据决策判断
    return reflection.decision !== "complete";
  }

  /**
   * 生成调整后的搜索步骤
   */
  generatePivotSteps(
    reflection: Reflection,
    _originalPlan: ResearchPlan,
    completedRounds: number,
  ): ResearchPlanStep[] {
    if (reflection.decision !== "pivot" || !reflection.nextSteps) {
      return [];
    }

    // 基于反思建议生成新的搜索步骤
    return reflection.nextSteps.map((query, index) => ({
      id: `pivot_${completedRounds + 1}_${index + 1}`,
      type: "deep_dive" as const,
      query,
      rationale: `基于反思调整: ${reflection.reasoning}`,
      estimatedSources: 10,
    }));
  }

  /**
   * 汇总搜索结果
   */
  private summarizeResults(searchRounds: SearchRound[]): string {
    const allSources: SearchSource[] = [];
    for (const round of searchRounds) {
      allSources.push(...round.sources);
    }

    // 去重
    const uniqueUrls = new Set<string>();
    const uniqueSources = allSources.filter((s) => {
      if (uniqueUrls.has(s.url)) return false;
      uniqueUrls.add(s.url);
      return true;
    });

    // 提取关键信息
    const domains = [...new Set(uniqueSources.map((s) => s.domain))].slice(
      0,
      10,
    );
    const topSnippets = uniqueSources
      .slice(0, 5)
      .map((s) => `- ${s.title}: ${s.snippet.slice(0, 150)}...`);

    return `
已收集信息摘要：
- 总来源数：${uniqueSources.length}
- 搜索轮次：${searchRounds.length}
- 主要域名：${domains.join(", ")}

代表性内容：
${topSnippets.join("\n")}
`;
  }

  /**
   * 构建反思提示词
   */
  private buildReflectionPrompt(): string {
    return `你是一个研究质量评估助手。你的任务是评估当前搜索结果的质量，并决定下一步行动。

## 评估维度
1. 信息覆盖度：是否涵盖了主题的主要方面？
2. 信息深度：是否有足够深入的分析和数据？
3. 来源质量：来源是否权威可信？
4. 信息新鲜度：信息是否足够新？

## 决策选项
- continue: 继续执行原计划的下一步搜索
- pivot: 调整搜索方向，需要提供新的搜索建议
- complete: 信息已足够充分，可以开始生成报告

## 输出格式
请以 JSON 格式输出：
\`\`\`json
{
  "quality_score": 75,
  "information_coverage": "描述当前信息覆盖情况",
  "gaps_identified": ["信息缺口1", "信息缺口2"],
  "decision": "continue|pivot|complete",
  "reasoning": "决策理由",
  "suggested_queries": ["如果pivot，建议的新搜索查询"]
}
\`\`\``;
  }

  /**
   * 构建用户提示词
   */
  private buildUserPrompt(
    query: string,
    plan: ResearchPlan,
    resultsSummary: string,
    currentRound: number,
    maxRounds: number,
  ): string {
    const remainingSteps = plan.steps
      .slice(currentRound)
      .map((s) => `- ${s.type}: ${s.query}`)
      .join("\n");

    return `## 研究主题
${query}

## 研究目标
${plan.objective}

## 当前进度
第 ${currentRound} 轮 / 最多 ${maxRounds} 轮

## 剩余计划步骤
${remainingSteps || "无"}

## 当前搜索结果
${resultsSummary}

请评估当前信息质量，并决定下一步行动。`;
  }

  /**
   * 解析 AI 反思响应
   */
  private parseReflectionResponse(response: string, round: number): Reflection {
    try {
      const jsonMatch =
        response.match(/```json\s*([\s\S]*?)\s*```/) ||
        response.match(/\{[\s\S]*"decision"[\s\S]*\}/);

      if (!jsonMatch) {
        return this.getDefaultReflection(round, []);
      }

      const jsonStr = jsonMatch[1] || jsonMatch[0];
      const parsed: AIReflectionResponse = JSON.parse(jsonStr);

      return {
        round,
        assessment: parsed.information_coverage,
        gaps: parsed.gaps_identified || [],
        decision: this.validateDecision(parsed.decision),
        reasoning: parsed.reasoning,
        nextSteps: parsed.suggested_queries,
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error(`Failed to parse reflection response: ${error}`);
      return this.getDefaultReflection(round, []);
    }
  }

  /**
   * 验证决策类型
   */
  private validateDecision(decision: string): ReflectionDecision {
    const validDecisions: ReflectionDecision[] = [
      "continue",
      "pivot",
      "complete",
    ];
    if (validDecisions.includes(decision as ReflectionDecision)) {
      return decision as ReflectionDecision;
    }
    return "continue";
  }

  /**
   * 获取默认反思结果
   */
  private getDefaultReflection(
    round: number,
    searchRounds: SearchRound[],
  ): Reflection {
    const totalSources = searchRounds.reduce(
      (sum, r) => sum + r.sources.length,
      0,
    );

    // 如果已经收集了足够的来源，建议完成
    if (totalSources >= 20) {
      return {
        round,
        assessment: "已收集足够的信息来源",
        gaps: [],
        decision: "complete",
        reasoning: "信息量已经充足，可以开始生成报告",
        timestamp: new Date(),
      };
    }

    return {
      round,
      assessment: "需要继续收集更多信息",
      gaps: ["信息覆盖可能不完整"],
      decision: "continue",
      reasoning: "继续执行原计划以收集更多信息",
      timestamp: new Date(),
    };
  }
}
