import { Injectable, Logger } from "@nestjs/common";
import { AIModelType } from "@prisma/client";
import { AIEngineFacade } from "../../../ai-engine/facade";
import {
  ResearchPlan,
  ResearchPlanStep,
  ResearchStepType,
  AIResearchPlanResponse,
  PreviousReportContext,
} from "./types";

/**
 * 研究规划服务
 * 使用 AI 生成智能研究计划
 *
 * ✅ 已迁移：使用 AIEngineFacade 统一入口
 */
@Injectable()
export class ResearchPlannerService {
  private readonly logger = new Logger(ResearchPlannerService.name);

  constructor(private readonly aiFacade: AIEngineFacade) {}

  /**
   * 生成研究计划
   */
  async generatePlan(
    query: string,
    options?: {
      depth?: "quick" | "standard" | "thorough";
      includeAcademic?: boolean;
      isFollowUp?: boolean;
      previousContext?: PreviousReportContext;
    },
  ): Promise<ResearchPlan> {
    this.logger.debug(
      `Generating research plan for query: ${query.slice(0, 100)}... (follow-up: ${options?.isFollowUp})`,
    );

    const depth = options?.depth || "standard";
    const includeAcademic = options?.includeAcademic ?? true;
    const isFollowUp = options?.isFollowUp ?? false;
    const previousContext = options?.previousContext;

    const systemPrompt = this.buildPlanningPrompt(
      depth,
      includeAcademic,
      isFollowUp,
      previousContext,
    );
    const userPrompt =
      isFollowUp && previousContext
        ? `这是一个追问研究，请在已有研究的基础上继续深入分析：

追问内容：${query}

请分析这个追问，确定需要补充研究的方向，并规划具体的搜索步骤。`
        : `请为以下研究主题生成详细的研究计划：

研究主题：${query}

请分析这个主题，确定研究目标，并规划具体的搜索步骤。`;

    try {
      // ★ 使用 AIEngineFacade 统一入口
      const result = await this.aiFacade.chat({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        modelType: AIModelType.CHAT,
        taskProfile: {
          creativity: "medium",
          outputLength: "short",
        },
      });

      const plan = this.parsePlanResponse(result.content, query);
      this.logger.debug(`Generated plan with ${plan.steps.length} steps`);

      return plan;
    } catch (error) {
      this.logger.error(`Failed to generate research plan: ${error}`);
      // 返回默认计划
      return this.getDefaultPlan(query, depth, includeAcademic);
    }
  }

  /**
   * 构建规划提示词
   */
  private buildPlanningPrompt(
    depth: "quick" | "standard" | "thorough",
    includeAcademic: boolean,
    isFollowUp: boolean = false,
    previousContext?: PreviousReportContext,
  ): string {
    const stepCountGuide = {
      quick: "2-3 个步骤",
      standard: "3-5 个步骤",
      thorough: "5-7 个步骤",
    };

    // 追问模式的特殊提示
    if (isFollowUp && previousContext) {
      const previousSummary = this.formatPreviousContext(previousContext);
      return `你是一个专业的研究规划助手。这是一个追问研究，需要在已有研究的基础上继续深入。

## 已有研究摘要
${previousSummary}

## 任务要求
1. 分析用户的追问内容，理解需要补充研究的方向
2. 制定 ${stepCountGuide[depth]} 的补充搜索计划
3. 避免重复已有研究中已经覆盖的内容
4. 专注于追问涉及的新方向或需要深化的领域

## 可用的搜索步骤类型
- initial_search: 初始广泛搜索，获取概览信息
- deep_dive: 针对特定方面的深入搜索
- academic: 学术论文和研究报告搜索${includeAcademic ? "" : "（本次不使用）"}
- comparison: 对比分析，比较不同观点或方案
- verification: 验证关键信息的准确性

## 输出格式
请以 JSON 格式输出，格式如下：
\`\`\`json
{
  "objective": "追问研究的目标（应该是对原研究的扩展或深化）",
  "approach": "补充研究的方法说明",
  "steps": [
    {
      "type": "deep_dive",
      "query": "具体的搜索查询",
      "rationale": "为什么需要这个搜索，与原研究的关联",
      "estimatedSources": 10
    }
  ]
}
\`\`\`

## 注意事项
- 搜索查询应该针对追问内容，避免重复已有研究
- 每个步骤应该与追问的方向相关
- 可以引用已有研究中的发现来指导新搜索
- 确保补充研究与原研究形成完整的知识体系`;
    }

    // 常规研究模式
    return `你是一个专业的研究规划助手。你的任务是为用户的研究主题制定详细的搜索计划。

## 任务要求
1. 分析用户的研究主题，理解研究目标
2. 制定 ${stepCountGuide[depth]} 的搜索计划
3. 每个步骤需要明确的搜索查询和理由

## 可用的搜索步骤类型
- initial_search: 初始广泛搜索，获取概览信息
- deep_dive: 针对特定方面的深入搜索
- academic: 学术论文和研究报告搜索${includeAcademic ? "" : "（本次不使用）"}
- comparison: 对比分析，比较不同观点或方案
- verification: 验证关键信息的准确性

## 输出格式
请以 JSON 格式输出，格式如下：
\`\`\`json
{
  "objective": "研究目标的简要描述",
  "approach": "研究方法的简要说明",
  "steps": [
    {
      "type": "initial_search",
      "query": "具体的搜索查询",
      "rationale": "为什么需要这个搜索",
      "estimatedSources": 10
    }
  ]
}
\`\`\`

## 注意事项
- 搜索查询应该具体、有针对性
- 每个步骤应该有明确的目的
- 后续步骤可以基于前面步骤可能发现的信息
- 确保覆盖主题的各个重要方面`;
  }

  /**
   * 格式化之前的研究上下文
   */
  private formatPreviousContext(context: PreviousReportContext): string {
    let summary = `### 执行摘要\n${context.executiveSummary}\n\n`;

    if (context.sections && context.sections.length > 0) {
      summary += `### 主要章节\n`;
      for (const section of context.sections) {
        summary += `- **${section.title}**: ${section.content.slice(0, 200)}...\n`;
      }
      summary += "\n";
    }

    summary += `### 结论\n${context.conclusion}\n\n`;

    if (context.references && context.references.length > 0) {
      summary += `### 已引用来源（${context.references.length}个）\n`;
      for (const ref of context.references.slice(0, 5)) {
        summary += `- ${ref.title}\n`;
      }
    }

    return summary;
  }

  /**
   * 解析 AI 响应
   */
  private parsePlanResponse(response: string, query: string): ResearchPlan {
    try {
      // 提取 JSON
      const jsonMatch =
        response.match(/```json\s*([\s\S]*?)\s*```/) ||
        response.match(/\{[\s\S]*"steps"[\s\S]*\}/);

      if (!jsonMatch) {
        this.logger.warn("No JSON found in AI response, using default plan");
        return this.getDefaultPlan(query, "standard", true);
      }

      const jsonStr = jsonMatch[1] || jsonMatch[0];
      const parsed: AIResearchPlanResponse = JSON.parse(jsonStr);

      // 转换为 ResearchPlan 格式
      const steps: ResearchPlanStep[] = parsed.steps.map((step, index) => ({
        id: `step_${index + 1}`,
        type: this.validateStepType(step.type),
        query: step.query,
        rationale: step.rationale,
        estimatedSources: step.estimatedSources || 10,
      }));

      // 估算总时间（每个步骤约 15-30 秒）
      const estimatedTime = steps.length * 20;

      return {
        objective: parsed.objective,
        approach: parsed.approach,
        steps,
        estimatedTime,
      };
    } catch (error) {
      this.logger.error(`Failed to parse plan response: ${error}`);
      return this.getDefaultPlan(query, "standard", true);
    }
  }

  /**
   * 验证步骤类型
   */
  private validateStepType(type: string): ResearchStepType {
    const validTypes: ResearchStepType[] = [
      "initial_search",
      "deep_dive",
      "academic",
      "comparison",
      "verification",
    ];

    if (validTypes.includes(type as ResearchStepType)) {
      return type as ResearchStepType;
    }

    return "deep_dive";
  }

  /**
   * 获取默认研究计划（当 AI 生成失败时）
   */
  private getDefaultPlan(
    query: string,
    depth: "quick" | "standard" | "thorough",
    includeAcademic: boolean,
  ): ResearchPlan {
    const steps: ResearchPlanStep[] = [
      {
        id: "step_1",
        type: "initial_search",
        query: query,
        rationale: "初始广泛搜索，获取主题概览",
        estimatedSources: 10,
      },
    ];

    if (depth !== "quick") {
      steps.push({
        id: "step_2",
        type: "deep_dive",
        query: `${query} 详细分析`,
        rationale: "深入探索主题的核心内容",
        estimatedSources: 10,
      });
    }

    if (includeAcademic && (depth === "standard" || depth === "thorough")) {
      steps.push({
        id: "step_3",
        type: "academic",
        query: `${query} research paper study`,
        rationale: "搜索学术研究和专业报告",
        estimatedSources: 5,
      });
    }

    if (depth === "thorough") {
      steps.push(
        {
          id: "step_4",
          type: "comparison",
          query: `${query} 比较 优缺点`,
          rationale: "对比分析不同观点和方案",
          estimatedSources: 5,
        },
        {
          id: "step_5",
          type: "verification",
          query: `${query} 最新 2024`,
          rationale: "验证信息的时效性和准确性",
          estimatedSources: 5,
        },
      );
    }

    return {
      objective: `深入研究：${query}`,
      approach: "通过多轮迭代搜索，收集全面信息并进行分析综合",
      steps,
      estimatedTime: steps.length * 20,
    };
  }
}
