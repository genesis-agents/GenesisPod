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
import { ResearchEventEmitterService } from "./research-event-emitter.service";

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
  /** ★ Leader 为此 Agent 选择的模型 ID（实现多元化） */
  modelId?: string;
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
- **为每个 Agent 选择合适的 AI 模型**（实现研究多元化）

## 用户研究请求
主题：{topic}
类型：{topicType}
描述：{description}
用户指令：{userPrompt}

## 可用 AI 模型
{availableModels}

**模型选择指南（必读）**：
- ⚠️ **必须为每个研究员分配 modelId**：这是必填字段，不能省略！
- 为不同研究员选择不同模型，确保观点多元化
- 技术/数据分析类维度：优先选择 GPT 系列
- 创意/洞察类维度：优先选择 Claude 系列
- 实时信息/新闻类维度：优先选择 Grok 系列（擅长实时信息）
- 中文内容/国内市场类维度：优先选择 DeepSeek、Qwen（通义千问）、GLM 等国产模型
- 快速/基础类维度：可选择 Gemini Flash、DeepSeek-Chat
- **关键要求**：尽量让研究员使用不同的模型，避免所有人都用同一个
- modelId 必须从上面的"可用 AI 模型"列表中选择

## 已有研究维度
{existingDimensions}

**重要**：上面列出的是用户之前创建或系统已规划的维度。你必须：
1. **保留所有已有维度**：这些维度代表用户的研究需求，必须全部包含在规划中
2. **可以新增维度**：如果你认为还有重要的研究角度没有覆盖，可以新增
3. **不要删除已有维度**：除非用户明确要求删除某个维度
4. **可以优化已有维度**：如改进描述、搜索词等，但名称应保持一致

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
      "role": "负责市场趋势维度的深度研究",
      "modelId": "gpt-4o"
    },
    {
      "agentId": "researcher_tech_analysis",
      "agentName": "技术分析研究员",
      "agentType": "dimension_researcher",
      "assignedDimensions": ["dimension_id2"],
      "role": "负责技术分析维度的深度研究",
      "modelId": "claude-3-5-sonnet"
    },
    {
      "agentId": "reviewer_quality",
      "agentName": "质量审核专家",
      "agentType": "quality_reviewer",
      "role": "负责审核所有研究结果的质量",
      "modelId": "gemini-2.0-flash"
    },
    {
      "agentId": "writer_report",
      "agentName": "报告撰写专家",
      "agentType": "report_writer",
      "role": "负责整合研究结果并撰写最终报告",
      "modelId": "gpt-4o"
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
6. **Agent Name 必须有区分度**：每个研究员的名称要体现其负责的维度，如 "市场趋势研究员"
7. ⚠️ **modelId 是必填字段**：每个 dimension_researcher 必须分配一个 modelId，从可用模型列表中选择`;

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

/**
 * ★ Leader 解码用户输入 Prompt
 * 类似 Claude Code CLI：先理解用户意图，再决定如何响应
 */
const LEADER_DECODE_PROMPT = `你是研究团队的 AI Leader。用户发送了一条消息，你需要理解其意图并决定如何响应。

## 当前研究状态
- 主题: {topic}
- 描述: {topicDescription}
- 进度: {progress}%
- 当前阶段: {stage}
- TODO 列表: {todoList}
- 已完成维度: {completedDimensions}
- 进行中维度: {inProgressDimensions}

## 用户消息
{userMessage}

## 决策指南

根据用户消息内容，选择以下响应类型之一：

1. **DIRECT_ANSWER**: 用户在询问信息、状态或简单问题，直接回答即可，不需要创建任务
   - 例如："研究进度如何？"、"现在在做什么？"、"有哪些维度？"

2. **CREATE_TODO**: 用户请求执行新的研究任务，需要创建 TODO 来追踪
   - 例如："深入研究政策环境"、"添加新维度：竞争分析"、"对市场趋势做更详细分析"
   - 必须提供 todoTitle（简洁的任务标题）和 todoDescription（详细描述）

3. **CLARIFY**: 用户请求模糊或有歧义，需要进一步澄清
   - 例如："再研究一下"、"这个不太好"、"改一改"
   - 必须提供 clarifyQuestion 和可选的 options

4. **ACKNOWLEDGE**: 用户表达感谢、确认或闲聊，友好回应即可
   - 例如："好的"、"谢谢"、"不错"

## 输出要求

请输出 JSON 格式：

\`\`\`json
{
  "decisionType": "DIRECT_ANSWER | CREATE_TODO | CLARIFY | ACKNOWLEDGE",
  "understanding": "你对用户消息的理解（1-2句话）",
  "response": "回复给用户的消息（自然、友好、简洁）",
  "todoTitle": "如果创建TODO，填写任务标题",
  "todoDescription": "如果创建TODO，填写任务描述",
  "clarifyQuestion": "如果需要澄清，填写澄清问题",
  "clarifyOptions": ["可选的澄清选项1", "可选的澄清选项2"]
}
\`\`\`

## 回复风格
- 简洁友好，像同事对话
- 如果创建TODO，告诉用户创建了什么任务
- 如果直接回答，给出有用的信息
- 不要过于正式或冗长`;

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
    private readonly eventEmitter: ResearchEventEmitterService,
  ) {}

  /**
   * 获取推理模型信息
   * ★ 委托给 AIEngineFacade 处理模型选择逻辑
   */
  async getReasoningModel(): Promise<LeaderModelInfo | null> {
    this.logger.debug("[getReasoningModel] Starting model selection");

    const allModels = await this.aiFacade.getAvailableModelsExtended();
    this.logger.debug(
      `[getReasoningModel] Found ${allModels.length} available models`,
    );

    // 使用 AIEngineFacade 的能力获取推理模型
    const modelInfo = await this.aiFacade.getReasoningModel();

    if (!modelInfo) {
      this.logger.error("[getReasoningModel] AI Engine returned no model");
      return null;
    }

    this.logger.log(
      `[getReasoningModel] AI Engine selected: ${modelInfo.id} (${modelInfo.provider}, isReasoning: ${modelInfo.isReasoning})`,
    );

    // 警告：如果选择的不是推理模型
    if (!modelInfo.isReasoning) {
      this.logger.warn(
        `[getReasoningModel] Selected model ${modelInfo.id} is not a reasoning model, fallback occurred`,
      );
    }

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

    // 3. 获取可用的 CHAT 模型列表（供 Leader 为 Agent 分配）
    const availableModels = await this.aiFacade.getAvailableModelsExtended();
    const availableModelsText =
      availableModels.length > 0
        ? availableModels
            .map(
              (m) =>
                `- ${m.id}（${m.provider}${m.name !== m.id ? `，${m.name}` : ""}）`,
            )
            .join("\n")
        : "- 使用默认模型";
    this.logger.log(
      `[planResearch] Available models for agents: ${availableModels.map((m) => m.id).join(", ")}`,
    );

    // 4. 构建已有维度信息
    let existingDimensionsText = "无已有维度（首次研究）";
    if (topic.dimensions && topic.dimensions.length > 0) {
      existingDimensionsText = topic.dimensions
        .map(
          (d, i) =>
            `${i + 1}. **${d.name}**\n   - 描述：${d.description || "无"}\n   - 状态：${d.status}\n   - 搜索词：${(d.searchQueries as string[])?.join("、") || "待设定"}`,
        )
        .join("\n");
    }

    // 5. 构建 prompt
    const prompt = LEADER_PLAN_PROMPT.replace("{topic}", topic.name)
      .replace("{topicType}", topic.type)
      .replace("{description}", topic.description || "无")
      .replace("{userPrompt}", userPrompt || "请进行全面研究")
      .replace("{availableModels}", availableModelsText)
      .replace("{existingDimensions}", existingDimensionsText);

    // 6. 调用 AI 获取规划
    const startTime = Date.now();
    let response;
    try {
      response = await this.aiFacade.chat({
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
    } catch (aiError) {
      this.logger.error(
        `[planResearch] AI call failed: ${aiError instanceof Error ? aiError.message : aiError}`,
      );
      throw new Error(
        `AI 调用失败: ${aiError instanceof Error ? aiError.message : "未知错误"}`,
      );
    }
    const latencyMs = Date.now() - startTime;

    // 6. 验证响应
    if (!response || !response.content) {
      this.logger.error("[planResearch] AI returned empty response");
      throw new Error("AI 返回空响应，请稍后重试");
    }

    this.logger.log(
      `[planResearch] AI response received in ${latencyMs}ms, length: ${response.content.length}`,
    );

    // 7. 解析响应
    const plan = this.extractJsonFromResponse<LeaderPlan>(response.content);

    if (!plan) {
      this.logger.error(
        `[planResearch] Failed to parse Leader plan. Response preview: ${response.content.slice(0, 500)}`,
      );
      throw new Error("无法解析 AI 规划响应，请稍后重试");
    }

    // ★ 后处理：如果 Leader 没有为 Agent 分配 modelId，自动轮询分配
    if (availableModels.length > 0 && plan.agentAssignments) {
      let modelIndex = 0;
      const researcherAssignments = plan.agentAssignments.filter(
        (a) => a.agentType === "dimension_researcher",
      );

      for (const assignment of researcherAssignments) {
        if (!assignment.modelId) {
          // 轮询分配模型，实现多元化
          const model = availableModels[modelIndex % availableModels.length];
          assignment.modelId = model.id;
          this.logger.log(
            `[planResearch] Auto-assigned model ${model.id} to ${assignment.agentName || assignment.agentId}`,
          );
          modelIndex++;
        }
      }
    }

    this.logger.log(
      `[planResearch] Plan created with ${plan.dimensions.length} dimensions in ${latencyMs}ms`,
    );

    // ★ 打印 Agent 模型分配情况
    const assignmentSummary = plan.agentAssignments
      ?.filter((a) => a.agentType === "dimension_researcher")
      .map((a) => `${a.agentName || a.agentId}: ${a.modelId || "未分配"}`)
      .join(", ");
    this.logger.log(
      `[planResearch] Agent model assignments: ${assignmentSummary}`,
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
        // ★ 发射 WebSocket 事件到团队互动区
        await this.eventEmitter.emitLeaderResponse(
          topicId,
          missionId,
          quickResponse.response,
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
      const fallbackResponse = "收到您的指令，我会继续推进研究工作。";
      // ★ 发射 WebSocket 事件到团队互动区
      await this.eventEmitter.emitLeaderResponse(
        topicId,
        missionId,
        fallbackResponse,
      );
      return {
        response: fallbackResponse,
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

    // ★ 发射 WebSocket 事件到团队互动区
    await this.eventEmitter.emitLeaderResponse(
      topicId,
      missionId,
      result.response,
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

  // ==================== Leader 解码用户输入 ====================

  /**
   * Leader 解码响应类型
   */
  static readonly DecisionTypes = {
    DIRECT_ANSWER: "DIRECT_ANSWER",
    CREATE_TODO: "CREATE_TODO",
    CLARIFY: "CLARIFY",
    ACKNOWLEDGE: "ACKNOWLEDGE",
  } as const;

  /**
   * ★ Leader 解码用户输入
   * 类似 Claude Code CLI：先理解用户意图，再决定如何响应
   *
   * @param topicId 专题ID
   * @param userMessage 用户消息
   * @param missionId 可选的任务ID（如果已有进行中的任务）
   * @returns 解码结果，包含决策类型和响应
   */
  async decodeUserInput(
    topicId: string,
    userMessage: string,
    missionId?: string,
  ): Promise<{
    decisionType: "DIRECT_ANSWER" | "CREATE_TODO" | "CLARIFY" | "ACKNOWLEDGE";
    understanding: string;
    response: string;
    todoTitle?: string;
    todoDescription?: string;
    clarifyQuestion?: string;
    clarifyOptions?: string[];
  }> {
    this.logger.log(
      `[decodeUserInput] Decoding user input for topic ${topicId}: "${userMessage.substring(0, 50)}..."`,
    );

    // 1. 获取专题信息
    const topic = await this.prisma.researchTopic.findUnique({
      where: { id: topicId },
      include: { dimensions: true },
    });

    if (!topic) {
      throw new Error(`Topic ${topicId} not found`);
    }

    // 2. 获取任务状态（如果有 missionId）
    let mission = null;
    let progress = 0;
    let completedDimensions: string[] = [];
    let inProgressDimensions: string[] = [];
    let todoList = "暂无任务";

    if (missionId) {
      mission = await this.prisma.researchMission.findUnique({
        where: { id: missionId },
        include: { tasks: true },
      });

      if (mission) {
        const completedTasks = mission.tasks.filter(
          (t) => t.status === "COMPLETED",
        );
        const inProgressTasks = mission.tasks.filter(
          (t) => t.status === "EXECUTING",
        );
        progress =
          mission.tasks.length > 0
            ? Math.round((completedTasks.length / mission.tasks.length) * 100)
            : 0;

        completedDimensions = completedTasks
          .map((t) => t.dimensionName)
          .filter(Boolean) as string[];
        inProgressDimensions = inProgressTasks
          .map((t) => t.dimensionName)
          .filter(Boolean) as string[];

        // 构建 TODO 列表摘要
        const pendingTasks = mission.tasks.filter(
          (t) => t.status === "PENDING" || t.status === "ASSIGNED",
        );
        todoList =
          [
            inProgressTasks.length > 0
              ? `进行中: ${inProgressTasks.map((t) => t.title).join(", ")}`
              : null,
            pendingTasks.length > 0
              ? `待处理: ${pendingTasks.map((t) => t.title).join(", ")}`
              : null,
            completedTasks.length > 0
              ? `已完成: ${completedTasks.length} 个`
              : null,
          ]
            .filter(Boolean)
            .join("\n") || "暂无任务";
      }
    }

    // 3. 快速意图检测（简单情况不需要调用 AI）
    const quickResult = this.quickDecodeIntent(
      userMessage,
      progress,
      topic.name,
    );
    if (quickResult) {
      this.logger.log(
        `[decodeUserInput] Quick decode result: ${quickResult.decisionType}`,
      );
      return quickResult;
    }

    // 4. 复杂情况：调用 AI 解码
    const leaderModel = await this.getReasoningModel();
    if (!leaderModel) {
      // 无推理模型时的降级处理
      return {
        decisionType: "ACKNOWLEDGE",
        understanding: "收到您的消息",
        response: `收到！我会处理您的请求："${userMessage}"`,
      };
    }

    // 5. 构建 prompt
    const prompt = LEADER_DECODE_PROMPT.replace("{topic}", topic.name)
      .replace("{topicDescription}", topic.description || "无")
      .replace("{progress}", String(progress))
      .replace("{stage}", mission?.status || "未开始")
      .replace("{todoList}", todoList)
      .replace("{completedDimensions}", completedDimensions.join(", ") || "无")
      .replace(
        "{inProgressDimensions}",
        inProgressDimensions.join(", ") || "无",
      )
      .replace("{userMessage}", userMessage);

    // 6. 调用 AI
    const startTime = Date.now();
    const response = await this.aiFacade.chat({
      messages: [
        {
          role: "system",
          content:
            "你是研究团队的 AI Leader。请理解用户意图并输出 JSON 格式的响应。",
        },
        { role: "user", content: prompt },
      ],
      model: leaderModel.modelId,
      taskProfile: {
        creativity: "low", // 解码任务需要准确性
        outputLength: "short",
      },
    });
    const latencyMs = Date.now() - startTime;

    this.logger.log(`[decodeUserInput] AI response in ${latencyMs}ms`);

    // 7. 解析响应
    const result = this.extractJsonFromResponse<{
      decisionType: string;
      understanding: string;
      response: string;
      todoTitle?: string;
      todoDescription?: string;
      clarifyQuestion?: string;
      clarifyOptions?: string[];
    }>(response.content);

    if (!result) {
      // 解析失败时的降级处理
      return {
        decisionType: "ACKNOWLEDGE",
        understanding: "收到您的消息",
        response: `收到！我会处理您的请求。`,
      };
    }

    // 8. 验证并返回结果
    const validTypes = [
      "DIRECT_ANSWER",
      "CREATE_TODO",
      "CLARIFY",
      "ACKNOWLEDGE",
    ];
    const decisionType = validTypes.includes(result.decisionType)
      ? (result.decisionType as
          | "DIRECT_ANSWER"
          | "CREATE_TODO"
          | "CLARIFY"
          | "ACKNOWLEDGE")
      : "ACKNOWLEDGE";

    return {
      decisionType,
      understanding: result.understanding || "收到您的消息",
      response: result.response || "收到！",
      todoTitle: result.todoTitle,
      todoDescription: result.todoDescription,
      clarifyQuestion: result.clarifyQuestion,
      clarifyOptions: result.clarifyOptions,
    };
  }

  /**
   * 快速意图解码（无需调用 AI）
   * 处理简单、明确的用户输入
   */
  private quickDecodeIntent(
    message: string,
    progress: number,
    topicName: string,
  ): {
    decisionType: "DIRECT_ANSWER" | "CREATE_TODO" | "CLARIFY" | "ACKNOWLEDGE";
    understanding: string;
    response: string;
  } | null {
    const lowerMessage = message.toLowerCase().trim();

    // 进度查询
    if (
      lowerMessage.includes("进度") ||
      lowerMessage.includes("状态") ||
      lowerMessage === "怎么样了"
    ) {
      return {
        decisionType: "DIRECT_ANSWER",
        understanding: "用户询问研究进度",
        response: `「${topicName}」研究进度：${progress}%`,
      };
    }

    // 感谢/确认
    if (
      lowerMessage === "好" ||
      lowerMessage === "好的" ||
      lowerMessage === "谢谢" ||
      lowerMessage === "收到" ||
      lowerMessage === "ok" ||
      lowerMessage === "知道了"
    ) {
      return {
        decisionType: "ACKNOWLEDGE",
        understanding: "用户表示确认",
        response: "好的，有需要随时告诉我！",
      };
    }

    // 模糊请求需要澄清
    if (
      lowerMessage === "再研究一下" ||
      lowerMessage === "改一下" ||
      lowerMessage === "不太好"
    ) {
      return {
        decisionType: "CLARIFY",
        understanding: "用户请求模糊，需要澄清",
        response: "请告诉我具体希望改进哪个方面？",
      };
    }

    // 其他情况需要 AI 处理
    return null;
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
    // 处理空响应
    if (!response || response.trim().length === 0) {
      this.logger.warn("[extractJsonFromResponse] Empty response received");
      return null;
    }

    try {
      // 尝试直接解析
      return JSON.parse(response) as T;
    } catch (directError) {
      this.logger.debug(
        `[extractJsonFromResponse] Direct parse failed: ${directError instanceof Error ? directError.message : directError}`,
      );

      // 尝试从 markdown 代码块中提取
      const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch && jsonMatch[1].trim()) {
        try {
          return JSON.parse(jsonMatch[1].trim()) as T;
        } catch (codeBlockError) {
          this.logger.warn(
            `[extractJsonFromResponse] Failed to parse JSON from code block: ${codeBlockError instanceof Error ? codeBlockError.message : codeBlockError}`,
          );
        }
      }

      // 尝试找到第一个 { 和最后一个 }
      const start = response.indexOf("{");
      const end = response.lastIndexOf("}");
      if (start !== -1 && end !== -1 && end > start) {
        const jsonSubstring = response.slice(start, end + 1);
        try {
          return JSON.parse(jsonSubstring) as T;
        } catch (substringError) {
          this.logger.warn(
            `[extractJsonFromResponse] Failed to parse JSON substring: ${substringError instanceof Error ? substringError.message : substringError}`,
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

    // ★ 添加重试机制，处理 API 临时故障
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 2000;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        // ★ 关键修复：每次重试时重新选择模型，让熔断器自动切换到可用模型
        const leaderModel = await this.getReasoningModel();
        if (!leaderModel) {
          throw new Error("No reasoning model available for Leader");
        }
        this.logger.log(
          `[planDimensionOutline] Attempt ${attempt}/${MAX_RETRIES}: Using model ${leaderModel.modelId}`,
        );

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
            outputLength: "long",
          },
        });
        const latencyMs = Date.now() - startTime;

        // ★ 关键修复：检查 API 是否返回了错误
        if (response.isError) {
          const errorContent = response.content.slice(0, 200);
          this.logger.warn(
            `[planDimensionOutline] Attempt ${attempt}/${MAX_RETRIES}: API returned error: ${errorContent}`,
          );
          // ★ 检测配额超限错误，这类错误切换模型后可能成功
          const isQuotaError =
            errorContent.includes("429") ||
            errorContent.includes("quota") ||
            errorContent.includes("rate limit") ||
            errorContent.includes("temporarily unavailable");
          lastError = new Error(`API error: ${response.content.slice(0, 100)}`);
          if (attempt < MAX_RETRIES) {
            // 配额错误不需要等太久，快速切换到下一个模型
            await this.delay(isQuotaError ? 500 : RETRY_DELAY_MS * attempt);
            continue;
          }
        }

        // ★ 检测是否返回了 HTML 错误页面（API 故障特征）
        if (
          response.content.includes("<!DOCTYPE") ||
          response.content.includes("<html")
        ) {
          this.logger.warn(
            `[planDimensionOutline] Attempt ${attempt}/${MAX_RETRIES}: API returned HTML error page, retrying...`,
          );
          lastError = new Error("API returned HTML error page instead of JSON");
          if (attempt < MAX_RETRIES) {
            await this.delay(RETRY_DELAY_MS * attempt);
            continue;
          }
        }

        const outline = this.extractJsonFromResponse<DimensionOutline>(
          response.content,
        );

        if (!outline || !outline.sections || outline.sections.length === 0) {
          this.logger.warn(
            `[planDimensionOutline] Attempt ${attempt}/${MAX_RETRIES}: Failed to parse JSON, retrying...`,
          );
          lastError = new Error("Failed to parse dimension outline JSON");
          if (attempt < MAX_RETRIES) {
            await this.delay(RETRY_DELAY_MS * attempt);
            continue;
          }
        } else {
          // ★ 成功
          this.logger.log(
            `[planDimensionOutline] Created outline with ${outline.sections.length} sections in ${latencyMs}ms (attempt ${attempt})`,
          );
          return outline;
        }
      } catch (error) {
        this.logger.warn(
          `[planDimensionOutline] Attempt ${attempt}/${MAX_RETRIES} failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
        lastError =
          error instanceof Error ? error : new Error("Unknown API error");
        if (attempt < MAX_RETRIES) {
          await this.delay(RETRY_DELAY_MS * attempt);
        }
      }
    }

    // ★ 所有重试都失败
    this.logger.error(
      `[planDimensionOutline] All ${MAX_RETRIES} attempts failed for dimension: ${dimension.name}`,
    );
    throw new Error(
      `Failed to parse dimension outline after ${MAX_RETRIES} attempts: ${lastError?.message || "Unknown error"}`,
    );
  }

  /** 延迟函数 */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
