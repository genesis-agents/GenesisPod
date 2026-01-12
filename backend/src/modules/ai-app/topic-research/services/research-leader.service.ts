/**
 * Research Leader Service
 *
 * Leader 驱动的研究协调服务
 * 负责：任务理解、维度规划、Agent 分配、质量审核、报告整合
 */

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { AiChatService } from "../../../ai-engine/llm/services/ai-chat.service";
import { AIModelType, LeaderDecisionType } from "@prisma/client";

// ==================== Types ====================

export interface LeaderPlan {
  /** 任务理解 */
  taskUnderstanding: {
    topic: string;
    scope: string;
    objectives: string[];
    constraints?: string[];
  };
  /** Leader 规划的维度列表 */
  dimensions: LeaderPlannedDimension[];
  /** 执行策略 */
  executionStrategy: {
    parallelism: number; // 并行 Agent 数量
    priorityOrder: string[]; // 维度执行优先级
    estimatedTime?: string; // 预估时间
  };
  /** Agent 分配 */
  agentAssignments: AgentAssignment[];
}

export interface LeaderPlannedDimension {
  id: string;
  name: string;
  description: string;
  searchQueries: string[];
  dataSources: string[];
  priority: number;
}

export interface AgentAssignment {
  agentId: string;
  agentType: "dimension_researcher" | "quality_reviewer" | "report_writer";
  assignedDimensions?: string[];
  role: string;
}

export interface ReviewDecision {
  taskId: string;
  status: "approved" | "needs_revision" | "rejected";
  feedback: string;
  suggestions?: string[];
  revisionInstructions?: string;
}

export interface LeaderModelInfo {
  modelId: string;
  modelName: string;
  provider: string;
  isReasoning: boolean;
}

// ==================== Prompts ====================

const LEADER_PLAN_PROMPT = `你是一位资深的研究协调专家（Research Leader），负责规划和协调深度研究任务。

## 你的角色
- 深度分析用户的研究目标
- 自主决定研究维度（不要使用预设模板）
- 为每个维度设计搜索策略
- 分配 Agent 执行任务

## 用户研究请求
主题：{topic}
类型：{topicType}
描述：{description}
用户指令：{userPrompt}

## 输出要求
请分析用户的研究需求，输出 JSON 格式的研究规划：

\`\`\`json
{
  "taskUnderstanding": {
    "topic": "研究主题的准确表述",
    "scope": "研究范围说明",
    "objectives": ["目标1", "目标2", "目标3"],
    "constraints": ["约束1"]
  },
  "dimensions": [
    {
      "id": "dimension_id",
      "name": "维度名称",
      "description": "维度描述",
      "searchQueries": ["搜索词1", "搜索词2"],
      "dataSources": ["web", "arxiv", "news"],
      "priority": 1
    }
  ],
  "executionStrategy": {
    "parallelism": 3,
    "priorityOrder": ["dimension_id1", "dimension_id2"],
    "estimatedTime": "约 10-15 分钟"
  },
  "agentAssignments": [
    {
      "agentId": "researcher_1",
      "agentType": "dimension_researcher",
      "assignedDimensions": ["dimension_id1", "dimension_id2"],
      "role": "维度研究员"
    },
    {
      "agentId": "reviewer_1",
      "agentType": "quality_reviewer",
      "role": "质量审核员"
    },
    {
      "agentId": "writer_1",
      "agentType": "report_writer",
      "role": "报告撰写员"
    }
  ]
}
\`\`\`

## 注意事项
1. 维度数量根据研究复杂度决定，通常 3-8 个
2. 搜索词要具体、可执行
3. 数据源选择要与维度内容匹配
4. 确保研究全面但聚焦`;

const LEADER_REVIEW_PROMPT = `你是研究团队的 Leader，负责审核研究成果质量。

## 待审核内容
任务类型：{taskType}
维度名称：{dimensionName}
研究结果：
{result}

## 审核标准
1. 内容准确性：信息是否准确、有据可查
2. 覆盖完整性：是否涵盖维度的关键方面
3. 逻辑一致性：论述是否连贯、无矛盾
4. 引用质量：来源是否可信、引用是否规范

## 输出要求
请输出 JSON 格式的审核决策：

\`\`\`json
{
  "status": "approved | needs_revision | rejected",
  "score": 85,
  "feedback": "总体评价",
  "strengths": ["优点1", "优点2"],
  "issues": ["问题1", "问题2"],
  "suggestions": ["建议1", "建议2"],
  "revisionInstructions": "如果需要修订，给出具体指导"
}
\`\`\``;

const LEADER_INTERVENE_PROMPT = `你是研究团队的 Leader，用户通过 @Leader 向你发送了指令。

## 当前研究状态
主题：{topic}
进度：{progress}%
当前阶段：{stage}
已完成维度：{completedDimensions}
进行中维度：{inProgressDimensions}

## 用户指令
{userMessage}

## 你的职责
1. 理解用户的意图
2. 决定是否需要调整研究计划
3. 给出响应和执行方案

## 输出要求
请输出 JSON 格式的响应：

\`\`\`json
{
  "understanding": "对用户指令的理解",
  "action": "adjust_plan | add_dimension | focus_area | provide_update | other",
  "response": "回复给用户的消息",
  "planAdjustments": {
    "newDimensions": [],
    "removeDimensions": [],
    "priorityChanges": {},
    "focusAreas": []
  }
}
\`\`\``;

// ==================== Constants ====================

/**
 * 已知的推理模型 ID 模式
 * 用于自动检测推理模型，即使用户没有手动设置 isReasoning=true
 */
const KNOWN_REASONING_MODEL_PATTERNS = [
  // OpenAI reasoning models
  /^o1/i,
  /^o3/i,
  /^gpt-5/i,
  // DeepSeek reasoning models
  /deepseek.*r1/i,
  /deepseek-reasoner/i,
  // Claude with extended thinking (future)
  /claude.*think/i,
  // Gemini reasoning (future)
  /gemini.*think/i,
  // Grok reasoning (future)
  /grok.*reason/i,
];

/**
 * 检查模型 ID 是否匹配已知的推理模型模式
 */
function isKnownReasoningModel(modelId: string): boolean {
  return KNOWN_REASONING_MODEL_PATTERNS.some((pattern) =>
    pattern.test(modelId),
  );
}

// ==================== Service ====================

@Injectable()
export class ResearchLeaderService {
  private readonly logger = new Logger(ResearchLeaderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiChatService: AiChatService,
  ) {}

  /**
   * 获取用户配置的推理模型
   * 智能选择顺序：
   * 1. 用户显式设置 isReasoning=true 的模型
   * 2. 自动检测已知推理模型（按 model ID 模式匹配）
   * 3. 回退到非 OpenAI 的 CHAT 模型（避免 rate limit）
   * 4. 最后回退到任意可用 CHAT 模型
   */
  async getReasoningModel(): Promise<LeaderModelInfo | null> {
    try {
      // 1. 优先查找用户显式设置 isReasoning=true 的模型
      let model = await this.prisma.aIModel.findFirst({
        where: {
          modelType: AIModelType.CHAT,
          isEnabled: true,
          isReasoning: true,
        },
        orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      });

      if (model) {
        this.logger.log(
          `[getReasoningModel] Found explicitly configured reasoning model: ${model.modelId}`,
        );
        return this.toLeaderModelInfo(model);
      }

      // 2. 自动检测已知推理模型（按 model ID 模式匹配）
      const allChatModels = await this.prisma.aIModel.findMany({
        where: {
          modelType: AIModelType.CHAT,
          isEnabled: true,
        },
        orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      });

      const detectedReasoningModel = allChatModels.find((m) =>
        isKnownReasoningModel(m.modelId),
      );

      if (detectedReasoningModel) {
        this.logger.log(
          `[getReasoningModel] Auto-detected reasoning model by pattern: ${detectedReasoningModel.modelId}`,
        );
        return this.toLeaderModelInfo(detectedReasoningModel, true);
      }

      // 3. 回退到非 OpenAI 的 CHAT 模型（避免 rate limit）
      const nonOpenAIModel = allChatModels.find(
        (m) => m.provider.toLowerCase() !== "openai",
      );

      if (nonOpenAIModel) {
        this.logger.warn(
          `[getReasoningModel] No reasoning model found, using non-OpenAI fallback: ${nonOpenAIModel.modelId} (${nonOpenAIModel.provider})`,
        );
        return this.toLeaderModelInfo(nonOpenAIModel);
      }

      // 4. 最后回退到任意可用 CHAT 模型
      if (allChatModels.length > 0) {
        this.logger.warn(
          `[getReasoningModel] Falling back to default CHAT model: ${allChatModels[0].modelId}`,
        );
        return this.toLeaderModelInfo(allChatModels[0]);
      }

      this.logger.error("[getReasoningModel] No CHAT model available");
      return null;
    } catch (error) {
      this.logger.error(`[getReasoningModel] Failed: ${error}`);
      return null;
    }
  }

  /**
   * 转换数据库模型为 LeaderModelInfo
   */
  private toLeaderModelInfo(
    model: {
      modelId: string;
      name: string;
      provider: string;
      isReasoning: boolean | null;
    },
    autoDetected = false,
  ): LeaderModelInfo {
    return {
      modelId: model.modelId,
      modelName: model.name,
      provider: model.provider,
      isReasoning: model.isReasoning ?? autoDetected,
    };
  }

  /**
   * Leader 规划研究任务
   * 分析用户需求，自主决定维度和执行策略
   */
  async planResearch(
    topicId: string,
    userPrompt?: string,
  ): Promise<LeaderPlan> {
    this.logger.log(`[planResearch] Starting planning for topic ${topicId}`);

    // 1. 获取专题信息
    const topic = await this.prisma.researchTopic.findUnique({
      where: { id: topicId },
      include: { dimensions: true },
    });

    if (!topic) {
      throw new Error(`Topic ${topicId} not found`);
    }

    // 2. 获取推理模型
    const leaderModel = await this.getReasoningModel();
    if (!leaderModel) {
      throw new Error("No reasoning model available for Leader");
    }

    // 3. 构建 prompt
    const prompt = LEADER_PLAN_PROMPT.replace("{topic}", topic.name)
      .replace("{topicType}", topic.type)
      .replace("{description}", topic.description || "无")
      .replace("{userPrompt}", userPrompt || "请进行全面研究");

    // 4. 调用 AI 获取规划
    const startTime = Date.now();
    const response = await this.aiChatService.chat({
      messages: [
        {
          role: "system",
          content: "你是专业的研究协调专家，请输出 JSON 格式的研究规划。",
        },
        { role: "user", content: prompt },
      ],
      model: leaderModel.modelId,
      taskProfile: {
        creativity: "medium",
        outputLength: "extended",
      },
    });
    const latencyMs = Date.now() - startTime;

    // 5. 解析响应
    const plan = this.extractJsonFromResponse<LeaderPlan>(response.content);

    if (!plan) {
      this.logger.error("[planResearch] Failed to parse Leader plan");
      throw new Error("Failed to parse Leader plan");
    }

    this.logger.log(
      `[planResearch] Plan created with ${plan.dimensions.length} dimensions in ${latencyMs}ms`,
    );

    return plan;
  }

  /**
   * Leader 审核任务结果
   */
  async reviewTaskResult(
    missionId: string,
    taskId: string,
    result: any,
    dimensionName?: string,
  ): Promise<ReviewDecision> {
    this.logger.log(`[reviewTaskResult] Reviewing task ${taskId}`);

    // 获取推理模型
    const leaderModel = await this.getReasoningModel();
    if (!leaderModel) {
      throw new Error("No reasoning model available for Leader");
    }

    // 构建 prompt
    const prompt = LEADER_REVIEW_PROMPT.replace(
      "{taskType}",
      "dimension_research",
    )
      .replace("{dimensionName}", dimensionName || "未知")
      .replace("{result}", JSON.stringify(result, null, 2));

    // 调用 AI 审核
    const startTime = Date.now();
    const response = await this.aiChatService.chat({
      messages: [
        {
          role: "system",
          content: "你是研究质量审核专家，请输出 JSON 格式的审核决策。",
        },
        { role: "user", content: prompt },
      ],
      model: leaderModel.modelId,
      taskProfile: {
        creativity: "low",
        outputLength: "medium",
      },
    });
    const latencyMs = Date.now() - startTime;

    // 解析审核结果
    const review = this.extractJsonFromResponse<any>(response.content);

    if (!review) {
      this.logger.warn(
        "[reviewTaskResult] Failed to parse review, defaulting to approved",
      );
      return {
        taskId,
        status: "approved",
        feedback: "审核通过（解析失败，默认通过）",
      };
    }

    // 记录决策
    await this.recordDecision(
      missionId,
      LeaderDecisionType.REVIEW,
      {
        taskId,
        dimensionName,
      },
      review,
      review.feedback,
      leaderModel.modelId,
      latencyMs,
    );

    return {
      taskId,
      status: review.status || "approved",
      feedback: review.feedback || "",
      suggestions: review.suggestions,
      revisionInstructions: review.revisionInstructions,
    };
  }

  /**
   * 处理用户的 @Leader 消息
   */
  async handleUserMessage(
    topicId: string,
    missionId: string,
    userMessage: string,
  ): Promise<{ response: string; planAdjustments?: any }> {
    this.logger.log(
      `[handleUserMessage] Processing @Leader message for topic ${topicId}`,
    );

    // 1. 获取当前状态
    const mission = await this.prisma.researchMission.findUnique({
      where: { id: missionId },
      include: {
        topic: true,
        tasks: true,
      },
    });

    if (!mission) {
      throw new Error(`Mission ${missionId} not found`);
    }

    // 2. 获取推理模型
    const leaderModel = await this.getReasoningModel();
    if (!leaderModel) {
      throw new Error("No reasoning model available for Leader");
    }

    // 3. 计算进度
    const completedTasks = mission.tasks.filter(
      (t) => t.status === "COMPLETED",
    );
    const inProgressTasks = mission.tasks.filter(
      (t) => t.status === "EXECUTING",
    );
    const progress =
      mission.tasks.length > 0
        ? Math.round((completedTasks.length / mission.tasks.length) * 100)
        : 0;

    // 4. 构建 prompt
    const prompt = LEADER_INTERVENE_PROMPT.replace(
      "{topic}",
      mission.topic.name,
    )
      .replace("{progress}", String(progress))
      .replace("{stage}", mission.status)
      .replace(
        "{completedDimensions}",
        completedTasks
          .map((t) => t.dimensionName)
          .filter(Boolean)
          .join(", ") || "无",
      )
      .replace(
        "{inProgressDimensions}",
        inProgressTasks
          .map((t) => t.dimensionName)
          .filter(Boolean)
          .join(", ") || "无",
      )
      .replace("{userMessage}", userMessage);

    // 5. 调用 AI
    const startTime = Date.now();
    const response = await this.aiChatService.chat({
      messages: [
        {
          role: "system",
          content:
            "你是研究协调专家 Leader，请回应用户的指令并输出 JSON 格式的响应。",
        },
        { role: "user", content: prompt },
      ],
      model: leaderModel.modelId,
      taskProfile: {
        creativity: "medium",
        outputLength: "medium",
      },
    });
    const latencyMs = Date.now() - startTime;

    // 6. 解析响应
    const result = this.extractJsonFromResponse<any>(response.content);

    if (!result) {
      return {
        response: "收到您的指令，我会继续推进研究工作。",
      };
    }

    // 7. 记录决策
    await this.recordDecision(
      missionId,
      LeaderDecisionType.INTERVENE,
      { userMessage },
      result,
      result.response,
      leaderModel.modelId,
      latencyMs,
    );

    return {
      response: result.response,
      planAdjustments: result.planAdjustments,
    };
  }

  /**
   * 记录 Leader 决策
   */
  private async recordDecision(
    missionId: string,
    type: LeaderDecisionType,
    input: any,
    decision: any,
    reasoning: string,
    modelUsed?: string,
    latencyMs?: number,
  ): Promise<void> {
    try {
      await this.prisma.leaderDecision.create({
        data: {
          missionId,
          type,
          input,
          decision,
          reasoning,
          modelUsed,
          latencyMs,
        },
      });
    } catch (error) {
      this.logger.error(`[recordDecision] Failed to record decision: ${error}`);
    }
  }

  /**
   * 获取 Leader 决策历史
   */
  async getDecisionHistory(missionId: string): Promise<any[]> {
    return this.prisma.leaderDecision.findMany({
      where: { missionId },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * 从 AI 响应中提取 JSON
   */
  private extractJsonFromResponse<T>(response: string): T | null {
    try {
      // 尝试直接解析
      return JSON.parse(response) as T;
    } catch {
      // 尝试从 markdown 代码块中提取
      const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[1].trim()) as T;
        } catch {
          this.logger.warn(
            "[extractJsonFromResponse] Failed to parse JSON from code block",
          );
        }
      }

      // 尝试找到第一个 { 和最后一个 }
      const start = response.indexOf("{");
      const end = response.lastIndexOf("}");
      if (start !== -1 && end !== -1 && end > start) {
        try {
          return JSON.parse(response.slice(start, end + 1)) as T;
        } catch {
          this.logger.warn(
            "[extractJsonFromResponse] Failed to parse JSON substring",
          );
        }
      }

      this.logger.error(
        "[extractJsonFromResponse] Could not extract JSON from response",
      );
      return null;
    }
  }
}
