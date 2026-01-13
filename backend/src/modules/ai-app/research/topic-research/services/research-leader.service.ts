/**
 * Research Leader Service
 *
 * Leader 驱动的研究协调服务
 * 负责：任务理解、维度规划、Agent 分配、质量审核、报告整合
 */

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import { AIEngineFacade } from "@/modules/ai-engine/facade";
import {
  IntentDetectionService,
  UserIntent,
} from "@/modules/ai-engine/orchestration/services";
import { LeaderDecisionType } from "@prisma/client";

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
  /** Agent 显示名称（用于日志和 UI 展示） */
  agentName?: string;
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

// ==================== 维度分析 Types ====================

/**
 * Leader 对维度研究意图的理解
 */
export interface DimensionIntentUnderstanding {
  /** 用户真正想知道什么 */
  coreQuestion: string;
  /** 研究范围 */
  scope: {
    included: string[];
    excluded: string[];
  };
  /** 期望深度 */
  expectedDepth: "overview" | "detailed" | "comprehensive";
  /** 目标受众 */
  targetAudience: string;
  /** 关键关注点 */
  keyFocusAreas: string[];
}

/**
 * Agent 可用的分析技能（语义层面的能力）
 * 这些技能指导 Agent 如何分析和思考问题
 */
export type AnalysisSkill =
  | "trend_analysis" // 趋势分析：识别和预测发展趋势
  | "swot_analysis" // SWOT 分析：优势、劣势、机会、威胁
  | "competitive_analysis" // 竞争分析：分析竞争格局和策略
  | "deep_dive" // 深度调研：深入挖掘特定主题
  | "data_interpretation" // 数据解读：解读数字和统计数据
  | "synthesis" // 综合归纳：整合多源信息形成洞察
  | "critical_thinking" // 批判性思维：质疑和验证信息
  | "future_projection" // 未来预测：基于现状预测发展
  | "cause_effect" // 因果分析：分析原因和影响
  | "comparison"; // 对比分析：比较不同方案或事物

/**
 * Agent 章节配置
 * Leader 为 Agent 指定的执行配置
 */
export interface AgentSectionConfig {
  /**
   * AI Engine 工具列表（可选）
   * 使用 AI Engine 的 BUILTIN_TOOLS 常量
   * 如: "web-search", "data-analysis", "rag-search"
   */
  tools?: string[];

  /**
   * 分析技能列表
   * 指导 Agent 如何分析问题
   */
  skills?: AnalysisSkill[];

  /**
   * 分析指导
   * Leader 对 Agent 的具体指导，如分析角度、注意事项
   */
  analysisGuidance?: string;

  /**
   * 数据源偏好
   * 指定优先使用的数据源类型
   */
  preferredDataSources?: ("web" | "academic" | "news" | "internal")[];

  /**
   * 输出风格
   * 指导输出的风格和语气
   */
  outputStyle?: "analytical" | "narrative" | "concise" | "detailed";
}

/**
 * Leader 规划的章节
 */
export interface SectionPlan {
  id: string;
  title: string;
  description: string;
  keyPoints: string[];
  targetWords: number;
  evidenceRequirements: {
    minReferences: number;
    preferredSources?: string[];
  };
  dependsOn?: string[];
  /** Agent 执行配置 */
  agentConfig?: AgentSectionConfig;
}

/**
 * Leader 规划的维度分析大纲
 */
export interface DimensionOutline {
  /** 意图理解 */
  intentUnderstanding: DimensionIntentUnderstanding;
  /** 章节列表 */
  sections: SectionPlan[];
  /** 执行策略 */
  executionPlan: {
    parallelGroups: string[][];
    estimatedTotalWords: number;
  };
}

/**
 * 章节审核决策
 */
export interface SectionReviewDecision {
  sectionId: string;
  approved: boolean;
  score: number;
  feedback: string;
  revisionInstructions?: string;
}

/**
 * 整合后的维度分析结果
 */
export interface IntegratedDimensionResult {
  content: string;
  metadata: {
    summary: string;
    keyFindings: string[];
    confidenceLevel: "high" | "medium" | "low";
  };
  evidenceUsed: string[];
  totalWords: number;
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
      "agentId": "researcher_market_trends",
      "agentName": "市场趋势研究员",
      "agentType": "dimension_researcher",
      "assignedDimensions": ["dimension_id1"],
      "role": "负责市场趋势维度的深度研究"
    },
    {
      "agentId": "researcher_tech_analysis",
      "agentName": "技术分析研究员",
      "agentType": "dimension_researcher",
      "assignedDimensions": ["dimension_id2"],
      "role": "负责技术分析维度的深度研究"
    },
    {
      "agentId": "reviewer_quality",
      "agentName": "质量审核专家",
      "agentType": "quality_reviewer",
      "role": "负责审核所有研究结果的质量"
    },
    {
      "agentId": "writer_report",
      "agentName": "报告撰写专家",
      "agentType": "report_writer",
      "role": "负责整合研究结果并撰写最终报告"
    }
  ]
}
\`\`\`

## 注意事项
1. 维度数量根据研究复杂度决定，通常 3-8 个
2. 搜索词要具体、可执行
3. 数据源选择要与维度内容匹配
4. 确保研究全面但聚焦
5. **Agent ID 必须唯一**：使用 "researcher_维度关键词" 格式，如 "researcher_market_trends"
6. **Agent Name 必须有区分度**：每个研究员的名称要体现其负责的维度，如 "市场趋势研究员"`;

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

// ==================== 维度分析 Prompts ====================

const DIMENSION_OUTLINE_PROMPT = `你是资深的研究协调专家（Research Leader），负责规划维度分析的完整大纲。

## 你的核心职责
1. **深入理解用户意图** - 不只是表面需求，要理解用户真正想知道什么
2. **规划完整大纲** - 保证广度和覆盖度，不遗漏重要方面
3. **设计章节结构** - 每个章节有明确的目标、要点、字数要求

## 研究背景
- **专题名称**: {topicName}
- **专题类型**: {topicType}
- **专题描述**: {topicDescription}

## 当前维度
- **维度名称**: {dimensionName}
- **维度描述**: {dimensionDescription}
- **研究重点**: {focusAreas}

## 可用证据概览
{evidenceSummary}

## 输出要求

请输出 JSON 格式的维度分析大纲：

\`\`\`json
{
  "intentUnderstanding": {
    "coreQuestion": "用户真正想知道的核心问题（一句话）",
    "scope": {
      "included": ["应该覆盖的方面1", "方面2", "方面3"],
      "excluded": ["明确不涉及的方面"]
    },
    "expectedDepth": "detailed",
    "targetAudience": "目标读者描述",
    "keyFocusAreas": ["重点1", "重点2"]
  },
  "sections": [
    {
      "id": "section_1",
      "title": "章节标题",
      "description": "这个章节要回答什么问题",
      "keyPoints": ["必须覆盖的要点1", "要点2", "要点3"],
      "targetWords": 1000,
      "evidenceRequirements": {
        "minReferences": 3,
        "preferredSources": ["优先使用的来源类型"]
      },
      "dependsOn": [],
      "agentConfig": {
        "tools": ["web-search", "data-analysis"],
        "skills": ["trend_analysis", "data_interpretation"],
        "analysisGuidance": "针对该章节的分析指导，如：关注最新数据，对比历史趋势",
        "preferredDataSources": ["web", "academic"],
        "outputStyle": "analytical"
      }
    }
  ],
  "executionPlan": {
    "parallelGroups": [["section_1", "section_2"], ["section_3"]],
    "estimatedTotalWords": 6000
  }
}
\`\`\`

## 章节设计原则
1. 章节数量：根据维度复杂度决定（通常 5-8 个）
2. 每个章节 800-1500 字，确保内容充实、有深度
3. 章节要有逻辑递进，避免重复
4. 最后一个章节可以是"总结与展望"
5. 如果某些章节有依赖关系，在 dependsOn 中注明
6. **重要**：总字数目标 5000-10000 字，确保报告有足够的深度和广度

## agentConfig 配置指南
为每个章节配置 Agent 的能力和指导：

### tools（可选工具）
- "web-search": 网页搜索，获取最新信息
- "data-analysis": 数据分析，处理数字信息
- "rag-search": 内部知识库搜索

### skills（分析技能）
- "trend_analysis": 趋势分析 - 适合分析发展方向、变化趋势
- "swot_analysis": SWOT 分析 - 适合分析优劣势、机会威胁
- "competitive_analysis": 竞争分析 - 适合分析市场竞争格局
- "deep_dive": 深度调研 - 适合深入探究某个具体问题
- "data_interpretation": 数据解读 - 适合解读数字、统计数据
- "synthesis": 综合归纳 - 适合整合多方信息形成结论
- "critical_thinking": 批判性思维 - 适合质疑验证、多角度分析
- "future_projection": 未来预测 - 适合预测发展走向
- "cause_effect": 因果分析 - 适合分析原因和影响
- "comparison": 对比分析 - 适合比较不同方案或事物

### outputStyle
- "analytical": 分析型 - 逻辑严谨，数据支撑
- "narrative": 叙事型 - 故事性强，易于理解
- "concise": 简洁型 - 精炼要点，去除冗余
- "detailed": 详细型 - 面面俱到，深入展开`;

const SECTION_REVIEW_PROMPT = `你是研究质量审核专家，负责审核单个章节的内容质量。

## 章节信息
- **章节标题**: {sectionTitle}
- **章节描述**: {sectionDescription}
- **必须覆盖的要点**: {keyPoints}
- **目标字数**: {targetWords}
- **最少引用数**: {minReferences}

## 待审核内容
{sectionContent}

## 审核标准
1. **完成度**: 是否覆盖了所有必须的要点
2. **字数**: 是否接近目标字数（±20% 可接受）
3. **引用**: 是否满足最少引用数要求
4. **质量**: 内容是否有深度，不是泛泛而谈
5. **准确性**: 内容是否准确，没有明显错误

## 输出要求
请输出 JSON 格式的审核决策：

\`\`\`json
{
  "approved": true,
  "score": 85,
  "feedback": "总体评价",
  "coveredPoints": ["已覆盖的要点"],
  "missingPoints": ["未覆盖的要点"],
  "revisionInstructions": "如需修改，给出具体指导"
}
\`\`\`

## 审核原则
- 宽进严出：只要完成核心要求就通过
- 不要吹毛求疵：小问题可以忽略
- 明确指导：如果不通过，给出具体的修改建议`;

const INTEGRATE_SECTIONS_PROMPT = `你是研究报告整合专家，负责将多个章节整合成完整的维度分析报告。

## 维度信息
- **维度名称**: {dimensionName}
- **维度描述**: {dimensionDescription}

## 各章节内容
{sectionsContent}

## 整合要求
1. 保持各章节内容完整，不要删减
2. 添加必要的过渡语句，使章节之间衔接自然
3. 在开头添加一个 50-100 字的整体概述
4. 在结尾提炼 3-5 个关键发现
5. 统一引用格式（使用 [n] 格式）

## 输出要求
请输出 JSON 格式的整合结果：

\`\`\`json
{
  "content": "完整的 Markdown 格式报告",
  "metadata": {
    "summary": "50-100字的整体概述",
    "keyFindings": ["关键发现1", "关键发现2", "关键发现3"],
    "confidenceLevel": "high"
  },
  "evidenceUsed": ["证据ID列表"],
  "totalWords": 3500
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

// ==================== Service ====================

@Injectable()
export class ResearchLeaderService {
  private readonly logger = new Logger(ResearchLeaderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiFacade: AIEngineFacade,
    private readonly intentDetectionService: IntentDetectionService,
  ) {}

  /**
   * 获取推理模型信息
   * ★ 委托给 AIEngineFacade 处理模型选择逻辑
   */
  async getReasoningModel(): Promise<LeaderModelInfo | null> {
    // 使用 AIEngineFacade 的能力获取推理模型
    const modelInfo = await this.aiFacade.getReasoningModel();

    if (!modelInfo) {
      this.logger.error("[getReasoningModel] AI Engine returned no model");
      return null;
    }

    this.logger.log(
      `[getReasoningModel] AI Engine selected: ${modelInfo.id} (${modelInfo.provider}, isReasoning: ${modelInfo.isReasoning})`,
    );

    return {
      modelId: modelInfo.id,
      modelName: modelInfo.name,
      provider: modelInfo.provider,
      isReasoning: modelInfo.isReasoning ?? false,
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
    const response = await this.aiFacade.chat({
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
    const response = await this.aiFacade.chat({
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
   * ★ 使用 IntentDetectionService 预检测意图，优化简单请求的响应
   */
  async handleUserMessage(
    topicId: string,
    missionId: string,
    userMessage: string,
  ): Promise<{ response: string; planAdjustments?: any }> {
    this.logger.log(
      `[handleUserMessage] Processing @Leader message for topic ${topicId}`,
    );

    // 0. 使用 AI Engine 的意图检测服务进行快速预检测
    const intentResult = this.intentDetectionService.detectIntent(userMessage);
    this.logger.log(
      `[handleUserMessage] Intent detected: ${intentResult.intent} (confidence: ${intentResult.confidence})`,
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

    // 2. 计算进度
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

    // 3. 对于高置信度的简单意图，快速响应（无需调用推理模型）
    if (intentResult.confidence >= 0.75) {
      const quickResponse = this.handleQuickIntent(
        intentResult.intent,
        mission,
        progress,
        completedTasks.length,
        inProgressTasks.length,
      );
      if (quickResponse) {
        this.logger.log(
          `[handleUserMessage] Quick response for intent: ${intentResult.intent}`,
        );
        await this.recordDecision(
          missionId,
          LeaderDecisionType.INTERVENE,
          { userMessage, detectedIntent: intentResult.intent },
          { action: "quick_response" },
          quickResponse.response,
          "intent_detection_service",
          0,
        );
        return quickResponse;
      }
    }

    // 4. 复杂意图：调用推理模型处理
    const leaderModel = await this.getReasoningModel();
    if (!leaderModel) {
      throw new Error("No reasoning model available for Leader");
    }

    // 5. 构建 prompt（添加检测到的意图信息）
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

    // 6. 调用 AI
    const startTime = Date.now();
    const response = await this.aiFacade.chat({
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

    // 7. 解析响应
    const result = this.extractJsonFromResponse<any>(response.content);

    if (!result) {
      return {
        response: "收到您的指令，我会继续推进研究工作。",
      };
    }

    // 8. 记录决策
    await this.recordDecision(
      missionId,
      LeaderDecisionType.INTERVENE,
      { userMessage, detectedIntent: intentResult.intent },
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
   * 快速处理简单意图（无需调用推理模型）
   * ★ 使用 IntentDetectionService 检测结果
   */
  private handleQuickIntent(
    intent: UserIntent,
    mission: { topic: { name: string }; status: string },
    progress: number,
    completedCount: number,
    inProgressCount: number,
  ): { response: string; planAdjustments?: any } | null {
    switch (intent) {
      case UserIntent.CONTINUE:
        // 继续研究：返回当前进度并确认继续
        return {
          response: `好的，继续推进「${mission.topic.name}」的研究工作。当前进度：${progress}%，已完成 ${completedCount} 个维度，${inProgressCount} 个维度正在进行中。`,
        };

      case UserIntent.SUMMARIZE:
        // 总结请求：提供当前状态摘要（详细总结仍需调用AI）
        if (progress < 50) {
          return {
            response: `研究「${mission.topic.name}」进度 ${progress}%，目前还在收集资料阶段。已完成 ${completedCount} 个维度，${inProgressCount} 个正在进行。建议等待更多维度完成后再生成详细总结。`,
          };
        }
        // 进度较高时，需要详细总结，交给AI处理
        return null;

      case UserIntent.GENERAL_CHAT:
        // 一般聊天：简短友好回复
        return {
          response: `您好！我是负责「${mission.topic.name}」研究的 Leader。当前研究进度 ${progress}%。有什么我可以帮您的吗？`,
        };

      default:
        // 其他意图需要AI处理
        return null;
    }
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

  // ==================== 维度分析核心方法 ====================

  /**
   * Leader 规划维度分析大纲
   *
   * 核心职责：
   * 1. 理解用户意图
   * 2. 规划完整章节结构
   * 3. 确保广度和覆盖度
   */
  async planDimensionOutline(
    topic: { name: string; type: string; description?: string | null },
    dimension: {
      name: string;
      description?: string | null;
      searchQueries?: string[] | unknown;
    },
    evidenceSummary: string,
  ): Promise<DimensionOutline> {
    this.logger.log(
      `[planDimensionOutline] Planning outline for dimension: ${dimension.name}`,
    );

    const leaderModel = await this.getReasoningModel();
    if (!leaderModel) {
      throw new Error("No reasoning model available for Leader");
    }

    const focusAreas = Array.isArray(dimension.searchQueries)
      ? (dimension.searchQueries as string[]).join(", ")
      : "无";

    const prompt = DIMENSION_OUTLINE_PROMPT.replace("{topicName}", topic.name)
      .replace("{topicType}", topic.type)
      .replace("{topicDescription}", topic.description || "无")
      .replace("{dimensionName}", dimension.name)
      .replace("{dimensionDescription}", dimension.description || "无")
      .replace("{focusAreas}", focusAreas)
      .replace("{evidenceSummary}", evidenceSummary);

    const startTime = Date.now();
    const response = await this.aiFacade.chat({
      messages: [
        {
          role: "system",
          content:
            "你是研究协调专家 Leader，负责规划维度分析大纲。请输出 JSON 格式。",
        },
        { role: "user", content: prompt },
      ],
      model: leaderModel.modelId,
      taskProfile: {
        creativity: "medium",
        outputLength: "long", // 大纲不需要太长
      },
    });
    const latencyMs = Date.now() - startTime;

    const outline = this.extractJsonFromResponse<DimensionOutline>(
      response.content,
    );

    if (!outline || !outline.sections || outline.sections.length === 0) {
      this.logger.error("[planDimensionOutline] Failed to parse outline");
      throw new Error("Failed to parse dimension outline");
    }

    this.logger.log(
      `[planDimensionOutline] Created outline with ${outline.sections.length} sections in ${latencyMs}ms`,
    );

    return outline;
  }

  /**
   * Leader 审核章节输出
   *
   * 多轮审核机制：
   * - 检查是否完成要求
   * - 不通过则返回修改指导
   * - 最多允许 3 次修订
   */
  async reviewSectionOutput(
    section: SectionPlan,
    content: string,
    revisionCount: number = 0,
  ): Promise<SectionReviewDecision> {
    this.logger.log(
      `[reviewSectionOutput] Reviewing section: ${section.title} (revision ${revisionCount})`,
    );

    const leaderModel = await this.getReasoningModel();
    if (!leaderModel) {
      // 无推理模型时，默认通过
      return {
        sectionId: section.id,
        approved: true,
        score: 70,
        feedback: "审核通过（无推理模型，默认通过）",
      };
    }

    const prompt = SECTION_REVIEW_PROMPT.replace(
      "{sectionTitle}",
      section.title,
    )
      .replace("{sectionDescription}", section.description)
      .replace("{keyPoints}", section.keyPoints.join(", "))
      .replace("{targetWords}", String(section.targetWords))
      .replace(
        "{minReferences}",
        String(section.evidenceRequirements.minReferences),
      )
      .replace("{sectionContent}", content);

    const response = await this.aiFacade.chat({
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

    const review = this.extractJsonFromResponse<{
      approved: boolean;
      score: number;
      feedback: string;
      revisionInstructions?: string;
    }>(response.content);

    if (!review) {
      // 解析失败，默认通过
      return {
        sectionId: section.id,
        approved: true,
        score: 70,
        feedback: "审核通过（解析失败，默认通过）",
      };
    }

    // 如果已经修订多次，强制通过
    if (!review.approved && revisionCount >= 2) {
      this.logger.warn(
        `[reviewSectionOutput] Max revisions reached, forcing approval for ${section.title}`,
      );
      return {
        sectionId: section.id,
        approved: true,
        score: Math.max(review.score, 60),
        feedback: `${review.feedback}（已达最大修订次数，强制通过）`,
      };
    }

    return {
      sectionId: section.id,
      approved: review.approved,
      score: review.score,
      feedback: review.feedback,
      revisionInstructions: review.revisionInstructions,
    };
  }

  /**
   * Leader 整合各章节内容
   *
   * 将多个章节整合成完整报告：
   * - 添加过渡语句
   * - 提取关键发现
   * - 生成总结
   */
  async integrateDimensionResults(
    dimension: { name: string; description?: string | null },
    sectionResults: Array<{ title: string; content: string }>,
  ): Promise<IntegratedDimensionResult> {
    this.logger.log(
      `[integrateDimensionResults] Integrating ${sectionResults.length} sections for ${dimension.name}`,
    );

    // 如果只有一个章节，直接返回
    if (sectionResults.length === 1) {
      const content = sectionResults[0].content;
      return {
        content: `# ${dimension.name}\n\n${content}`,
        metadata: {
          summary: content.substring(0, 200),
          keyFindings: [],
          confidenceLevel: "medium",
        },
        evidenceUsed: this.extractEvidenceIds(content),
        totalWords: content.length,
      };
    }

    const leaderModel = await this.getReasoningModel();

    // 构建章节内容
    const sectionsContent = sectionResults
      .map((s, i) => `### ${i + 1}. ${s.title}\n\n${s.content}`)
      .join("\n\n---\n\n");

    // 如果没有推理模型，使用简单拼接
    if (!leaderModel) {
      const content = `# ${dimension.name}\n\n${sectionsContent}`;
      return {
        content,
        metadata: {
          summary: `关于"${dimension.name}"的分析报告。`,
          keyFindings: [],
          confidenceLevel: "medium",
        },
        evidenceUsed: this.extractEvidenceIds(content),
        totalWords: content.length,
      };
    }

    const prompt = INTEGRATE_SECTIONS_PROMPT.replace(
      "{dimensionName}",
      dimension.name,
    )
      .replace("{dimensionDescription}", dimension.description || "无")
      .replace("{sectionsContent}", sectionsContent);

    const response = await this.aiFacade.chat({
      messages: [
        {
          role: "system",
          content: "你是研究报告整合专家，请输出 JSON 格式的整合结果。",
        },
        { role: "user", content: prompt },
      ],
      model: leaderModel.modelId,
      taskProfile: {
        creativity: "low",
        outputLength: "extended",
      },
    });

    const result = this.extractJsonFromResponse<IntegratedDimensionResult>(
      response.content,
    );

    if (!result) {
      // 整合失败，使用简单拼接
      const content = `# ${dimension.name}\n\n${sectionsContent}`;
      return {
        content,
        metadata: {
          summary: `关于"${dimension.name}"的分析报告。`,
          keyFindings: [],
          confidenceLevel: "medium",
        },
        evidenceUsed: this.extractEvidenceIds(content),
        totalWords: content.length,
      };
    }

    this.logger.log(
      `[integrateDimensionResults] Integrated ${sectionResults.length} sections, ${result.totalWords} words`,
    );

    return result;
  }

  /**
   * 从内容中提取证据 ID
   */
  private extractEvidenceIds(content: string): string[] {
    const matches = content.match(/\[temp-\d+-\d+\]/g) || [];
    return [...new Set(matches.map((m) => m.slice(1, -1)))];
  }
}
