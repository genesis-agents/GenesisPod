import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { AiChatService } from "../../ai-core/ai-chat.service";
import { AIModelType } from "@prisma/client";
import {
  ResearchPlan,
  ResearchPlanStep,
  ResearchStepType,
  AIResearchPlanResponse,
} from "./types";

/**
 * 研究规划服务
 * 使用 AI 生成智能研究计划
 */
@Injectable()
export class ResearchPlannerService {
  private readonly logger = new Logger(ResearchPlannerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiChatService: AiChatService,
  ) {}

  /**
   * 生成研究计划
   */
  async generatePlan(
    query: string,
    options?: {
      depth?: "quick" | "standard" | "thorough";
      includeAcademic?: boolean;
    },
  ): Promise<ResearchPlan> {
    this.logger.debug(
      `Generating research plan for query: ${query.slice(0, 100)}...`,
    );

    const depth = options?.depth || "standard";
    const includeAcademic = options?.includeAcademic ?? true;

    // 获取 AI 模型
    const model = await this.getDefaultModel();

    const systemPrompt = this.buildPlanningPrompt(depth, includeAcademic);
    const userPrompt = `请为以下研究主题生成详细的研究计划：

研究主题：${query}

请分析这个主题，确定研究目标，并规划具体的搜索步骤。`;

    try {
      const result = await this.aiChatService.generateChatCompletionWithKey({
        provider: model.provider,
        modelId: model.modelId,
        apiKey: model.apiKey ?? "",
        apiEndpoint: model.apiEndpoint ?? undefined,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        maxTokens: 2000,
        temperature: 0.7,
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
   * 获取默认 AI 模型
   */
  private async getDefaultModel() {
    // 优先使用 CHAT 类型的默认模型
    let model = await this.prisma.aIModel.findFirst({
      where: {
        modelType: AIModelType.CHAT,
        isDefault: true,
        isEnabled: true,
      },
    });

    if (!model) {
      model = await this.prisma.aIModel.findFirst({
        where: {
          modelType: AIModelType.CHAT,
          isEnabled: true,
        },
      });
    }

    if (!model) {
      throw new Error("No AI model available for research planning");
    }

    return model;
  }

  /**
   * 构建规划提示词
   */
  private buildPlanningPrompt(
    depth: "quick" | "standard" | "thorough",
    includeAcademic: boolean,
  ): string {
    const stepCountGuide = {
      quick: "2-3 个步骤",
      standard: "3-5 个步骤",
      thorough: "5-7 个步骤",
    };

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
