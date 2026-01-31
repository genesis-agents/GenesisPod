/**
 * Research Leader Service
 *
 * Leader 驱动的研究协调服务
 * 负责：任务理解、维度规划、Agent 分配、质量审核、报告整合
 */

import { Injectable, Logger, forwardRef, Inject } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import { AIEngineFacade } from "@/modules/ai-engine/facade";
import {
  IntentDetectionService,
  UserIntent,
} from "@/modules/ai-engine/orchestration/services";
import { LeaderDecisionType, ResearchTaskStatus } from "@prisma/client";
import { ResearchEventEmitterService } from "./research-event-emitter.service";
import { sanitize } from "../utils/prompt-sanitizer";
import { extractJsonFromAIResponse } from "@/common/utils/json-extraction.utils";
import {
  LeaderToolService,
  LeaderActionType,
  LeaderActionResult,
} from "./leader-tool.service";
import {
  ResearchMissionService,
  TASK_PRIORITY,
} from "./research-mission.service";
import type { GeneratedChart, FigureReference } from "../types/research.types";

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
  /** ★ v8.0: Leader 分配给此 Agent 的技能（用于 UI 展示） */
  skills?: string[];
  /** ★ v8.0: Leader 分配给此 Agent 的工具（用于 UI 展示） */
  tools?: string[];
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
 * ★ v8.1: 分析技能定义（用于动态展示）
 * 包含技能 ID、名称和描述
 */
export const ANALYSIS_SKILL_DEFINITIONS: Array<{
  id: AnalysisSkill;
  name: string;
  description: string;
}> = [
  { id: "trend_analysis", name: "趋势分析", description: "识别和预测发展趋势" },
  {
    id: "swot_analysis",
    name: "SWOT分析",
    description: "分析优势、劣势、机会、威胁",
  },
  {
    id: "competitive_analysis",
    name: "竞争分析",
    description: "分析竞争格局和策略",
  },
  { id: "deep_dive", name: "深度调研", description: "深入挖掘特定主题" },
  {
    id: "data_interpretation",
    name: "数据解读",
    description: "解读数字和统计数据",
  },
  {
    id: "synthesis",
    name: "综合归纳",
    description: "整合多源信息形成洞察",
  },
  {
    id: "critical_thinking",
    name: "批判性思维",
    description: "质疑和验证信息",
  },
  {
    id: "future_projection",
    name: "未来预测",
    description: "基于现状预测发展",
  },
  { id: "cause_effect", name: "因果分析", description: "分析原因和影响" },
  { id: "comparison", name: "对比分析", description: "比较不同方案或事物" },
];

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
 * Leader 预分配给章节的图表
 */
export interface AllocatedFigure {
  /** 证据编号 [1], [2]... */
  evidenceIndex: number;
  /** 该证据中图表索引 */
  figureIndex: number;
  /** 图片 URL */
  imageUrl: string;
  /** 图表标题/说明 */
  caption: string;
  /** 为什么分配给这个章节 */
  relevanceReason: string;
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
  /** ★ Leader 预分配的图表（避免写手重复选图） */
  allocatedFigures?: AllocatedFigure[];
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

/**
 * 全局协调的大纲（Phase 2）
 */
export interface GlobalOutline {
  /** 各维度的协调大纲 */
  dimensions: Array<{
    dimensionId: string;
    dimensionName: string;
    outline: DimensionOutline;
    crossDimensionNotes: string;
  }>;
  /** 全局主题（跨维度共同发现） */
  globalThemes: string[];
  /** 去重规则（避免重复覆盖） */
  deduplicationRules: string[];
}

// ==================== Prompts ====================

const LEADER_PLAN_PROMPT = `你是一位资深的研究协调专家（Research Leader），负责规划和协调深度研究任务。

## 当前时间
**今天是 {currentDate}（{currentYear}年）**
⚠️ 在生成搜索词时，请使用当前年份 {currentYear}，而不是 2024 或其他过去的年份。

## 你的角色
- 深度分析用户的研究目标
- 自主决定研究维度（不要使用预设模板）
- 为每个维度设计搜索策略
- 分配 Agent 执行任务
- **为每个 Agent 动态选择合适的 AI 模型、技能和工具**

## 用户研究请求
主题：{topic}
类型：{topicType}
描述：{description}
用户指令：{userPrompt}

## ⚠️ 核心约束：严格聚焦主题范围
**这是最重要的原则**：所有研究维度必须严格聚焦于用户指定的主题名称所限定的范围。

举例说明：
- 主题"美国AI政策法规洞察" → 只研究政策、法规、监管，**不要**扩展到人才、投资、竞争格局等
- 主题"新能源汽车市场分析" → 只研究市场、销量、品牌，**不要**扩展到电池技术细节、充电桩政策等
- 主题"特斯拉企业研究" → 聚焦特斯拉公司本身，**不要**扩展到整个新能源行业

**禁止**：自作主张扩展研究范围。如果用户想研究更广的范围，他们会在主题名称中说明。

## 可用 AI 模型（动态选择）
{availableModels}

**模型选择指南**：
- ⚠️ **必须为每个研究员分配 modelId**：从上面的可用模型列表中选择
- 为不同研究员选择不同模型，确保观点多元化
- 技术/数据分析类维度：优先选择 GPT 系列
- 创意/洞察类维度：优先选择 Claude 系列
- 实时信息/新闻类维度：优先选择 Grok 系列
- 中文内容/国内市场：优先选择 DeepSeek、Qwen、GLM 等
- **关键要求**：尽量让研究员使用不同的模型，避免所有人都用同一个

## 可用分析技能（根据任务动态选择）
- trend_analysis（趋势分析）: 识别和预测发展趋势
- swot_analysis（SWOT分析）: 分析优势、劣势、机会、威胁
- competitive_analysis（竞争分析）: 分析竞争格局和策略
- deep_dive（深度调研）: 深入挖掘特定主题
- data_interpretation（数据解读）: 解读数字和统计数据
- synthesis（综合归纳）: 整合多源信息形成洞察
- critical_thinking（批判性思维）: 质疑和验证信息
- future_projection（未来预测）: 基于现状预测发展
- cause_effect（因果分析）: 分析原因和影响
- comparison（对比分析）: 比较不同方案或事物
- policy_analysis（政策分析）: 分析政策内容和影响
- regulatory_impact（监管影响评估）: 评估法规对行业的影响
- legislative_tracking（立法追踪）: 追踪法案进程

## 可用研究工具（根据任务动态选择）
- web-search（网络搜索）: 获取最新信息
- data-analysis（数据分析）: 处理数字信息
- rag-search（知识库搜索）: 搜索内部知识库
- federal-register（联邦公报）: 美国行政命令、法规
- congress-gov（国会立法）: 法案、决议、投票
- whitehouse-news（白宫新闻）: 政策公告
- academic-search（学术检索）: 学术论文和研究

## 已有研究维度
{existingDimensions}

**重要**：上面列出的是用户之前创建或系统已规划的维度。你必须：
1. **保留所有已有维度**：这些维度代表用户的研究需求，必须全部包含在规划中
2. **可以新增维度**：如果你认为还有重要的研究角度没有覆盖，可以新增
3. **不要删除已有维度**：除非用户明确要求删除某个维度
4. **可以优化已有维度**：如改进描述、搜索词等，但名称应保持一致

## 输出要求
请分析用户的研究需求，输出 JSON 格式的研究规划。

**skills 和 tools 选择原则**：
- 根据每个研究员负责的维度内容，从上面的可用列表中动态选择最合适的技能和工具
- 政策法规类研究：选择 policy_analysis、legislative_tracking、federal-register 等
- 市场分析类研究：选择 trend_analysis、competitive_analysis、data_interpretation 等
- 技术研究类：选择 deep_dive、comparison、academic-search 等
- 每个研究员的 skills 选 2-4 个，tools 选 1-3 个

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
    "parallelism": 5,
    "priorityOrder": ["dimension_id1", "dimension_id2"],
    "estimatedTime": "约 10-15 分钟"
  },
  "agentAssignments": [
    {
      "agentId": "researcher_xxx",
      "agentName": "xxx研究员",
      "agentType": "dimension_researcher",
      "assignedDimensions": ["dimension_id"],
      "role": "负责xxx维度的深度研究",
      "modelId": "从可用模型列表中选择",
      "skills": ["从可用技能列表中根据任务选择2-4个"],
      "tools": ["从可用工具列表中根据任务选择1-3个"]
    },
    {
      "agentId": "reviewer_quality",
      "agentName": "质量审核专家",
      "agentType": "quality_reviewer",
      "role": "负责审核所有研究结果的质量",
      "modelId": "从可用模型列表中选择",
      "skills": ["critical_thinking", "synthesis"],
      "tools": ["web-search"]
    },
    {
      "agentId": "writer_report",
      "agentName": "报告撰写专家",
      "agentType": "report_writer",
      "role": "负责整合研究结果并撰写最终报告",
      "modelId": "从可用模型列表中选择",
      "skills": ["synthesis"],
      "tools": []
    }
  ]
}
\`\`\`

## 注意事项
1. ⚠️ **严格聚焦主题范围**（最重要）：维度必须与主题名称直接相关，禁止扩展到主题未提及的领域
2. 维度数量根据研究复杂度决定，通常 3-8 个
3. 搜索词要具体、可执行
4. 数据源选择要与维度内容匹配
5. **Agent ID 必须唯一**：使用 "researcher_维度关键词" 格式
6. **Agent Name 必须有区分度**：每个研究员的名称要体现其负责的维度
7. ⚠️ **动态选择**：modelId、skills、tools 必须从上面列出的可用选项中选择，且要根据具体任务需求选择最合适的`;

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

const GLOBAL_OUTLINE_PROMPT = `你是资深的研究协调专家（Research Leader），负责全局协调所有维度的研究大纲。

## 你的核心职责
1. **全局视角** - 同时查看所有维度的搜索结果，理解完整的研究图景
2. **协调去重** - 确保各维度之间分工明确，避免重复覆盖相同内容
3. **规划大纲** - 为每个维度规划完整章节结构，确保广度和深度

## 研究背景
- **专题名称**: {topicName}
- **专题类型**: {topicType}
- **专题描述**: {topicDescription}

## 所有维度的搜索结果

{dimensionSearchResults}

## 输出要求

请输出 JSON 格式的全局协调大纲。关键原则：
1. 查看所有维度的证据后，规划每个维度的章节结构
2. 确保维度之间分工明确，避免重复（例如：如果维度A已覆盖政策历史，维度B就不要再详细展开）
3. 在 crossDimensionNotes 中标注跨维度的协调说明
4. 识别全局主题（多个维度都涉及的重点）
5. 制定去重规则（哪些内容只在特定维度详述）

\`\`\`json
{
  "dimensions": [
    {
      "dimensionId": "dimension_id",
      "dimensionName": "维度名称",
      "outline": {
        "intentUnderstanding": {
          "coreQuestion": "核心问题",
          "scope": {
            "included": ["覆盖方面"],
            "excluded": ["排除方面"]
          },
          "expectedDepth": "detailed",
          "targetAudience": "目标读者",
          "keyFocusAreas": ["重点1", "重点2"]
        },
        "sections": [
          {
            "id": "section_1",
            "title": "章节标题",
            "description": "章节目标",
            "keyPoints": ["要点1", "要点2"],
            "targetWords": 1000,
            "evidenceRequirements": {
              "minReferences": 3,
              "preferredSources": ["来源类型"]
            },
            "dependsOn": [],
            "agentConfig": {
              "tools": ["web-search"],
              "skills": ["trend_analysis"],
              "analysisGuidance": "分析指导",
              "outputStyle": "analytical"
            }
          }
        ],
        "executionPlan": {
          "parallelGroups": [["section_1"]],
          "estimatedTotalWords": 6000
        }
      },
      "crossDimensionNotes": "与其他维度的协调说明，例如：本维度聚焦政策细节，不展开技术背景（详见技术维度）"
    }
  ],
  "globalThemes": ["全局主题1", "全局主题2"],
  "deduplicationRules": [
    "政策历史由政策维度详述，其他维度仅一句话提及",
    "技术细节由技术维度负责，市场维度只引用结论"
  ]
}
\`\`\`

## 章节设计原则
1. 每个维度 5-8 个章节，每章节 800-1500 字
2. 章节之间有逻辑递进
3. 最后一个章节可以是"总结与展望"
4. 总字数目标：每个维度 5000-10000 字

## 字数分配原则
- **核心分析维度**：正常字数预算（5000-10000字）
- **附录/辅助类维度**：字数上限为总预算的15%，即 800-1500 字
- 判断标准：维度名包含"附录"、"方法论"、"参考文献"、"指标体系"、"术语"、"工具清单"等关键词时，视为辅助类维度，应大幅缩减字数
- **维度间篇幅均衡**：核心维度之间的字数差异不应超过 50%，避免某个维度占据过大比例

## 跨维度协调原则
- 共同背景：只在第一个涉及的维度中详述，其他维度简要提及即可
- 重复数据：统一放在最相关的维度，其他维度引用
- 交叉话题：明确由哪个维度负责主要分析，其他维度只给结论
`;

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

## 本专题的其他研究维度（避免重复覆盖）
{otherDimensionsInfo}

**重要**：以上是本专题全部研究维度。你当前规划的是「{dimensionName}」维度。大纲中的章节必须严格聚焦本维度，不要覆盖其他维度已负责的内容。如有交叉话题，仅一句话提及并注明"详见XX维度分析"。

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
      },
      "allocatedFigures": [
        {
          "evidenceIndex": 1,
          "figureIndex": 0,
          "imageUrl": "图片URL",
          "caption": "图表说明",
          "relevanceReason": "与章节内容的关联说明"
        }
      ]
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
- "federal-register": 联邦公报搜索（行政命令、法规、通知）- 适合美国联邦政策研究
- "congress-gov": 国会立法搜索（法案、决议、投票）- 适合立法动态追踪
- "whitehouse-news": 白宫新闻（声明、政策公告）- 适合总统政策和行政动态

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
- "policy_analysis": 政策分析 - 适合分析政策内容、影响、合规性
- "regulatory_impact": 监管影响评估 - 适合评估法规对行业/企业的影响
- "legislative_tracking": 立法追踪 - 适合追踪法案进程和立法动态

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
6. **数据可视化**: 如有图表数据，检查数据是否准确、图表类型是否合适
7. **重复检查**: 是否与前置章节存在大段重复的观点、数据或表述（如有重复，必须在revisionInstructions中指出需删除的重复段落）
8. **文风质量**: 是否存在套话堆砌（如"随着..."、"综上所述..."开头）、机械化过渡语、或缺乏具体分析判断的空洞段落
9. **独立分析深度**（★ 关键指标）: 章节是否包含独立的分析判断，而非仅仅罗列或转述证据内容。具体检查：
   - 是否有因果推理（不只描述现象，还分析原因和后果）
   - 是否有对比分析（与历史数据、行业基准或竞争对手对比）
   - 是否有隐含洞察（从数据中推断出的非显而易见的结论）
   - 如果章节仅是"证据摘要拼接"（各段落以"根据[N]..."开头，缺乏分析），score 不得超过 60 分

## 评分扣分规则
- 纯证据转述无独立分析: -20 分
- 与前置章节重复 >30% 内容: -15 分
- 套话开头（"随着..."、"在当前..."等）: -5 分/处
- 模糊量化词（"许多"、"大量"）代替具体数据: -5 分/处
- 缺少因果分析或对比分析: -10 分

## 前置章节摘要（用于重复检查）
{previousSectionsSummary}

## 输出要求
请输出 JSON 格式的审核决策：

\`\`\`json
{
  "approved": true,
  "score": 85,
  "feedback": "总体评价",
  "chartFeedback": "图表评价（如有）",
  "coveredPoints": ["已覆盖的要点"],
  "missingPoints": ["未覆盖的要点"],
  "analysisDepthScore": "独立分析深度评分（0-100），说明是否有因果推理、对比分析、隐含洞察",
  "revisionInstructions": "如需修改，给出具体指导"
}
\`\`\`

## 审核原则
- 核心底线：章节必须包含独立分析判断，纯证据拼接不通过
- 明确指导：如果不通过，给出具体的修改建议，尤其指出哪些段落需要加入分析
- 不要吹毛求疵：格式、用词等小问题可以忽略，重点关注分析深度和内容质量`;

const INTEGRATE_SECTIONS_PROMPT = `你是研究报告整合专家，负责将多个章节整合成完整的维度分析报告。

## 维度信息
- **维度名称**: {dimensionName}
- **维度描述**: {dimensionDescription}

## 各章节内容
{sectionsContent}

## 整合要求
1. 保持各章节核心论点和独特分析完整，但如果多个章节重复了相同的背景描述、数据点或观点，只保留最详细的版本，删除冗余重复
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
 * ★ v8.1: 增强版 - 包含项目配置上下文，让 Leader 了解自己的能力和团队配置
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

{projectContext}

## 用户消息
{userMessage}

## 决策指南

根据用户消息内容，选择以下响应类型之一：

1. **DIRECT_ANSWER**: 用户在询问信息、状态或简单问题，直接回答即可，不需要创建任务
   - 例如："研究进度如何？"、"现在在做什么？"、"有哪些维度？"
   - ★ 也包括用户询问项目配置的问题，如："你有什么工具？"、"团队有谁？"、"知识库配置了吗？"
   - 对于这类问题，请根据上面的「项目配置」信息给出具体、准确的回答

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
- ★ 如果用户询问工具、团队、知识库等配置问题，根据「项目配置」给出具体信息
- 不要过于正式或冗长
- ★ 不要说"我是2024年的模型"这类泛泛的回答，要针对当前项目给出具体信息`;

const LEADER_INTERVENE_PROMPT = `你是研究团队的 Leader，用户通过 @Leader 向你发送了指令。

## 当前研究状态
主题：{topic}
进度：{progress}%
当前阶段：{stage}
已完成维度：{completedDimensions}
进行中维度：{inProgressDimensions}
当前维度列表：{dimensionList}

## 用户指令
{userMessage}

## ⚠️ 核心规则 - 在输出前必须检查 ⚠️

【规则1 - 维度拆分】仅当用户明确要求拆分时才创建多个维度：
- 触发拆分的关键词：分别、各自、两个维度、三个维度、独立的、拆分成、分开创建
- "分别研究 A 和 B" → 两个 action: {name: "A"}, {name: "B"}
- "新增维度：AI芯片与中美竞争" → 一个 action: {name: "AI芯片与中美竞争"}（无拆分词，保持原样）
- ❗ 没有明确拆分意图时，不要自作主张拆分

【规则2 - 维度合并】用户说"合并 X 和 Y"或"把 X 并入 Y"时：
- 输出 MERGE_DIMENSIONS action: {sourceDimensionNames: ["X"], targetDimensionName: "Y"}

【规则3 - 删除必须执行】用户说"删除/取消/移除"时，必须输出 DELETE_DIMENSION action，不能只回复。

【规则4 - 立即执行】不要说"我会做X"然后不执行，必须在 actions 数组中输出动作。

## 你的职责
1. 准确理解用户的意图（注意：用户说"1"可能是指上一条消息中的选项1）
2. 如果用户要求执行某个动作，你必须在 actions 数组中明确输出要执行的动作
3. 立即执行，不要反复确认

## 可执行的动作类型
- CREATE_DIMENSION: 创建新维度 (params: {name, description?})
- DELETE_DIMENSION: 删除维度 (params: {dimensionName})
- MERGE_DIMENSIONS: 合并维度 (params: {sourceDimensionNames: string[], targetDimensionName: string})
- CANCEL_TASK: 取消任务 (params: {dimensionName 或 taskName})
- UPDATE_DIMENSION: 更新维度 (params: {dimensionName, newName?, newDescription?})
- NO_ACTION: 无需执行动作（仅回复）

## 输出要求
请输出 JSON 格式的响应：

\`\`\`json
{
  "understanding": "对用户指令的理解（一句话）",
  "actions": [
    {
      "type": "CREATE_DIMENSION | DELETE_DIMENSION | CANCEL_TASK | UPDATE_DIMENSION | NO_ACTION",
      "params": {
        "name": "维度名称",
        "dimensionName": "要操作的维度名称",
        "description": "描述（可选）"
      }
    }
  ],
  "response": "执行完成后回复给用户的消息（简洁，确认已执行的动作）"
}
\`\`\`

## 示例

用户: "新增两个章节：思想根源 和 AI政策"
正确输出:
{
  "understanding": "用户要求新增两个独立的研究维度",
  "actions": [
    {"type": "CREATE_DIMENSION", "params": {"name": "思想根源"}},
    {"type": "CREATE_DIMENSION", "params": {"name": "AI政策"}}
  ],
  "response": "已创建两个新的研究维度：「思想根源」和「AI政策」"
}

用户: "删除维度：市场分析"
正确输出:
{
  "understanding": "用户要求删除市场分析维度",
  "actions": [
    {"type": "DELETE_DIMENSION", "params": {"dimensionName": "市场分析"}}
  ],
  "response": "已删除研究维度「市场分析」及其相关任务"
}

## ❌ 错误示例（绝对禁止）

用户: "新增两个章节：AI芯片 和 中美竞争"
错误输出（合并成一个维度）:
{
  "actions": [{"type": "CREATE_DIMENSION", "params": {"name": "AI芯片 & 中美竞争"}}]
}
→ 这是错误的！必须创建两个独立的维度！

用户: "删除维度：市场分析"
错误输出（只回复不执行）:
{
  "actions": [{"type": "NO_ACTION"}],
  "response": "好的，我会删除市场分析维度"
}
→ 这是错误的！必须输出 DELETE_DIMENSION action！`;

// ==================== Service ====================

@Injectable()
export class ResearchLeaderService {
  private readonly logger = new Logger(ResearchLeaderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiFacade: AIEngineFacade,
    private readonly intentDetectionService: IntentDetectionService,
    private readonly eventEmitter: ResearchEventEmitterService,
    private readonly leaderToolService: LeaderToolService,
    @Inject(forwardRef(() => ResearchMissionService))
    private readonly missionService: ResearchMissionService,
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
    // ★ 对重复的 modelId 去重，避免 AI 看到 #2, #3 等后缀后构造无效的 modelId
    const uniqueModels = availableModels.filter(
      (m, i, arr) => arr.findIndex((x) => x.id === m.id) === i,
    );

    // ★ 构建模型名称到真实 modelId 的映射（供后处理还原）
    // 当 displayName 与 modelId 不同时（如 ep-xxx 接入点），用 displayName 作为 prompt 展示名
    const modelNameToIdMap = new Map<string, string>();
    const nameCountMap = new Map<string, number>();
    const uniqueModelsForPrompt = uniqueModels.map((m) => {
      let promptName = m.name !== m.id ? m.name : m.id;

      // ★ 处理同名模型（如多个 Doubao 接入点），用能力类型区分
      const nameKey = promptName.toLowerCase();
      const count = nameCountMap.get(nameKey) || 0;
      nameCountMap.set(nameKey, count + 1);
      if (count > 0) {
        const suffix = m.isReasoning ? "reasoning" : `variant-${count + 1}`;
        promptName = `${promptName} (${suffix})`;
      }

      modelNameToIdMap.set(promptName.toLowerCase(), m.id);
      // 同时映射原始 id，以兼容 AI 直接使用 id 的情况
      modelNameToIdMap.set(m.id.toLowerCase(), m.id);
      return { ...m, promptName };
    });

    const availableModelsText =
      uniqueModelsForPrompt.length > 0
        ? uniqueModelsForPrompt
            .map((m) => `- ${m.promptName}（${m.provider}）`)
            .join("\n")
        : "- 使用默认模型";
    this.logger.log(
      `[planResearch] Available models for agents: ${uniqueModelsForPrompt.map((m) => m.promptName).join(", ")} (${availableModels.length} total, ${uniqueModels.length} unique)`,
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
    // ★ 获取当前日期和年份，确保搜索词使用正确的年份
    const now = new Date();
    const currentYear = now.getFullYear().toString();
    const currentDate = now.toISOString().split("T")[0]; // YYYY-MM-DD 格式

    // ★ Security: 对用户输入进行消毒，防止 Prompt Injection
    const sanitizedUserPrompt = sanitize(userPrompt || "请进行全面研究");

    const prompt = LEADER_PLAN_PROMPT.replace("{topic}", topic.name)
      .replace("{topicType}", topic.type)
      .replace("{description}", topic.description || "无")
      .replace("{userPrompt}", sanitizedUserPrompt)
      .replace("{availableModels}", availableModelsText)
      .replace("{existingDimensions}", existingDimensionsText)
      .replace(/{currentDate}/g, currentDate)
      .replace(/{currentYear}/g, currentYear);

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
    const plan = this.extractJsonFromResponse<LeaderPlan>(
      response.content,
      "dimensions", // requiredKey for validation
    );

    if (!plan) {
      this.logger.error(
        `[planResearch] Failed to parse Leader plan. Response preview: ${response.content.slice(0, 500)}`,
      );
      throw new Error("无法解析 AI 规划响应，请稍后重试");
    }

    // ★ 后处理：确保每个 Agent 都有 modelId、skills、tools
    if (plan.agentAssignments) {
      let modelIndex = 0;

      for (const assignment of plan.agentAssignments) {
        // 0. ★ 将 AI 填写的 displayName 还原为真实 modelId
        if (assignment.modelId) {
          const aiModelId = assignment.modelId.toLowerCase();
          let realId = modelNameToIdMap.get(aiModelId);

          // ★ 模糊匹配：AI 可能返回不完整的名称（如 "Doubao" 而非 "Doubao (豆包)"）
          // 选择最长前缀匹配，避免 "gpt" 误匹配到 "gpt-4o" 而非 "gpt-5.1"
          if (!realId) {
            let bestMatchLen = 0;
            for (const [key, id] of modelNameToIdMap.entries()) {
              if (key.startsWith(aiModelId) || aiModelId.startsWith(key)) {
                const matchLen = Math.min(key.length, aiModelId.length);
                if (matchLen > bestMatchLen) {
                  bestMatchLen = matchLen;
                  realId = id;
                }
              }
            }
          }

          if (realId && realId !== assignment.modelId) {
            this.logger.log(
              `[planResearch] Resolved model name "${assignment.modelId}" → "${realId}" for ${assignment.agentName || assignment.agentId}`,
            );
            assignment.modelId = realId;
          }
        }

        // 1. 为缺少 modelId 的 Agent 自动轮询分配
        if (!assignment.modelId && availableModels.length > 0) {
          const model = availableModels[modelIndex % availableModels.length];
          assignment.modelId = model.id;
          this.logger.log(
            `[planResearch] Auto-assigned model ${model.id} to ${assignment.agentName || assignment.agentId}`,
          );
          modelIndex++;
        }

        // 2. 为研究员确保有 skills（若 AI 未返回则使用默认值）
        if (assignment.agentType === "dimension_researcher") {
          if (!assignment.skills || assignment.skills.length === 0) {
            assignment.skills = [
              "deep_dive",
              "synthesis",
              "data_interpretation",
            ];
            this.logger.debug(
              `[planResearch] Auto-assigned default skills to ${assignment.agentName || assignment.agentId}`,
            );
          }
          if (!assignment.tools || assignment.tools.length === 0) {
            assignment.tools = ["web-search"];
            this.logger.debug(
              `[planResearch] Auto-assigned default tools to ${assignment.agentName || assignment.agentId}`,
            );
          }
        }

        // 3. 为质量审核员确保有 skills
        if (assignment.agentType === "quality_reviewer") {
          if (!assignment.skills || assignment.skills.length === 0) {
            assignment.skills = ["critical_thinking", "synthesis"];
          }
        }

        // 4. 为报告撰写员确保有 skills
        if (assignment.agentType === "report_writer") {
          if (!assignment.skills || assignment.skills.length === 0) {
            assignment.skills = ["synthesis"];
          }
        }
      }
    }

    this.logger.log(
      `[planResearch] Plan created with ${plan.dimensions.length} dimensions in ${latencyMs}ms`,
    );

    // ★ 打印 Agent 分配情况（包含模型、技能、工具）
    const researcherSummary = plan.agentAssignments
      ?.filter((a) => a.agentType === "dimension_researcher")
      .map((a) => {
        const parts = [a.agentName || a.agentId];
        if (a.modelId) parts.push(`model=${a.modelId}`);
        if (a.skills?.length) parts.push(`skills=[${a.skills.join(",")}]`);
        if (a.tools?.length) parts.push(`tools=[${a.tools.join(",")}]`);
        return parts.join(" ");
      })
      .join(" | ");
    this.logger.log(`[planResearch] Agent assignments: ${researcherSummary}`);

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
    const review = this.extractJsonFromResponse<{
      status: "approved" | "needs_revision" | "rejected";
      feedback?: string;
      suggestions?: string[];
      revisionInstructions?: string;
      revisionNeeded?: boolean;
    }>(response.content, "status"); // requiredKey for validation

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
      review.feedback || "",
      leaderModel.modelId,
      latencyMs,
    );

    return {
      taskId,
      status: review.status ?? "approved",
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
  ): Promise<{ response: string; actionResults?: LeaderActionResult[] }> {
    this.logger.log(
      `[handleUserMessage] Processing @Leader message for topic ${topicId}`,
    );

    // ★ Security: 对用户输入进行消毒，防止 Prompt Injection
    const sanitizedMessage = sanitize(userMessage);

    // ★ 保存用户消息到数据库（对话历史）
    await this.eventEmitter.saveUserMessage(
      topicId,
      missionId,
      sanitizedMessage,
    );

    // 0. 使用 AI Engine 的意图检测服务进行快速预检测
    const intentResult =
      this.intentDetectionService.detectIntent(sanitizedMessage);
    this.logger.log(
      `[handleUserMessage] Intent detected: ${intentResult.intent} (confidence: ${intentResult.confidence})`,
    );

    // 1. 获取当前状态（包含 dimensions 用于显示当前维度列表）
    const mission = await this.prisma.researchMission.findUnique({
      where: { id: missionId },
      include: {
        topic: {
          include: {
            dimensions: true,
          },
        },
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
          {
            userMessage: sanitizedMessage,
            detectedIntent: intentResult.intent,
          },
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

    // 5. 构建维度列表（供 Leader 了解当前有哪些维度）
    const dimensionList =
      mission.topic.dimensions && mission.topic.dimensions.length > 0
        ? mission.topic.dimensions
            .map((d, i) => `${i + 1}. ${d.name}（${d.status}）`)
            .join("\n")
        : "无维度";

    // 6. 构建 prompt（添加检测到的意图信息）
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
      .replace("{dimensionList}", dimensionList)
      .replace("{userMessage}", sanitizedMessage);

    // 7. 调用 AI
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

    // 8. 解析响应
    const result = this.extractJsonFromResponse<{
      understanding?: string;
      actions?: Array<{
        type: string;
        params?: Record<string, unknown>;
      }>;
      response: string;
      planAdjustments?: unknown;
    }>(response.content, "response"); // requiredKey for validation

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

    // ★★★ 9. 执行 actions 数组中的动作 ★★★
    const actionResults: LeaderActionResult[] = [];
    if (result.actions && Array.isArray(result.actions)) {
      this.logger.log(
        `[handleUserMessage] Executing ${result.actions.length} actions`,
      );

      for (const action of result.actions) {
        const actionType = action.type as LeaderActionType;
        const params = action.params || {};

        this.logger.log(`[handleUserMessage] Executing action: ${actionType}`);

        try {
          let actionResult: LeaderActionResult;

          switch (actionType) {
            case LeaderActionType.CREATE_DIMENSION: {
              // 创建维度（拆分由 AI 根据用户明确意图决定，代码不强制拆分）
              actionResult = await this.leaderToolService.createDimension({
                topicId,
                name: params.name as string,
                description: params.description as string | undefined,
              });

              // ★ v8.2: 创建维度成功后，自动创建 ResearchTask 并恢复 Mission 执行
              if (actionResult.success && actionResult.data?.dimensionId) {
                const dimensionId = actionResult.data.dimensionId as string;
                const dimensionName = actionResult.data.name as string;

                try {
                  // 为新维度创建 ResearchTask
                  const sanitizedDimName = dimensionName
                    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, "_")
                    .substring(0, 30);
                  const newAgentId = `researcher_${sanitizedDimName}_${Date.now()}`;

                  const task = await this.prisma.researchTask.create({
                    data: {
                      missionId,
                      title: `研究: ${dimensionName}`,
                      description:
                        (params.description as string) ||
                        `Leader 创建的新维度研究：${dimensionName}`,
                      taskType: "dimension_research",
                      dimensionName: dimensionName,
                      dimensionId: dimensionId,
                      assignedAgent: newAgentId,
                      assignedAgentType: "dimension_researcher",
                      priority: TASK_PRIORITY.DIMENSION_RESEARCH_DYNAMIC,
                      status: ResearchTaskStatus.PENDING,
                    },
                  });

                  // 更新 Mission 的 totalTasks 计数
                  await this.prisma.researchMission.update({
                    where: { id: missionId },
                    data: {
                      totalTasks: { increment: 1 },
                    },
                  });

                  // 更新质量审核任务的依赖
                  const qualityReviewTask =
                    await this.prisma.researchTask.findFirst({
                      where: {
                        missionId,
                        taskType: "quality_review",
                      },
                    });

                  if (qualityReviewTask) {
                    const currentDeps =
                      (qualityReviewTask.dependencies as string[]) || [];
                    if (!currentDeps.includes(task.id)) {
                      await this.prisma.researchTask.update({
                        where: { id: qualityReviewTask.id },
                        data: {
                          dependencies: [...currentDeps, task.id],
                        },
                      });
                    }
                  }

                  this.logger.log(
                    `[handleUserMessage] Created ResearchTask ${task.id} for dimension "${dimensionName}"`,
                  );

                  // 触发 Mission 恢复执行
                  this.missionService
                    .resumeExecutionForNewTask(missionId, topicId)
                    .catch((err: Error) => {
                      this.logger.error(
                        `[handleUserMessage] Failed to resume mission: ${err.message}`,
                      );
                    });
                } catch (taskError) {
                  this.logger.error(
                    `[handleUserMessage] Failed to create ResearchTask: ${taskError}`,
                  );
                  // 不影响主流程，只记录错误
                }
              }
              break;
            }

            case LeaderActionType.DELETE_DIMENSION:
              actionResult = await this.leaderToolService.deleteDimension({
                topicId,
                dimensionName: params.dimensionName as string,
              });
              break;

            case LeaderActionType.CANCEL_TASK:
              actionResult = await this.leaderToolService.cancelTask({
                topicId,
                dimensionName: params.dimensionName as string | undefined,
                taskName: params.taskName as string | undefined,
              });
              break;

            case LeaderActionType.UPDATE_DIMENSION:
              actionResult = await this.leaderToolService.updateDimension({
                topicId,
                dimensionName: params.dimensionName as string,
                newName: params.newName as string | undefined,
                newDescription: params.newDescription as string | undefined,
              });
              break;

            case LeaderActionType.MERGE_DIMENSIONS:
              actionResult = await this.leaderToolService.mergeDimensions({
                topicId,
                sourceDimensionNames: params.sourceDimensionNames as string[],
                targetDimensionName: params.targetDimensionName as string,
              });
              break;

            case LeaderActionType.NO_ACTION:
              actionResult = {
                success: true,
                action: LeaderActionType.NO_ACTION,
                message: "无需执行动作",
              };
              break;

            default:
              this.logger.warn(
                `[handleUserMessage] Unknown action type: ${actionType}`,
              );
              actionResult = {
                success: false,
                action: actionType,
                message: `未知的动作类型: ${actionType}`,
              };
          }

          actionResults.push(actionResult);
          this.logger.log(
            `[handleUserMessage] Action result: ${actionResult.success ? "SUCCESS" : "FAILED"} - ${actionResult.message}`,
          );
        } catch (error) {
          this.logger.error(
            `[handleUserMessage] Action execution failed: ${error}`,
          );
          actionResults.push({
            success: false,
            action: actionType,
            message: `执行失败: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      }
    }

    // ★ Fix: 代码级别的删除意图检测和强制执行
    // 如果用户消息明确包含删除意图但 AI 没有输出 DELETE_DIMENSION action，强制执行
    const deleteKeywords = ["删除", "移除", "取消", "去掉", "不要"];
    const hasDeleteIntent = deleteKeywords.some((kw) =>
      sanitizedMessage.includes(kw),
    );
    const hasDeleteAction = actionResults.some(
      (r) => r.action === LeaderActionType.DELETE_DIMENSION,
    );

    if (hasDeleteIntent && !hasDeleteAction) {
      this.logger.warn(
        `[handleUserMessage] Detected delete intent but no DELETE_DIMENSION action, attempting fallback delete`,
      );

      // 尝试从消息中提取维度名称
      // 模式: "删除维度：X" / "删除 X 维度" / "把 X 删除" / "删除「X」"
      const dimensionPatterns = [
        /删除[维度章节]*[：:「\s]*([^」\s,，。]+)/,
        /移除[维度章节]*[：:「\s]*([^」\s,，。]+)/,
        /把[「\s]*([^」\s,，。]+)[」\s]*删除/,
        /不要[「\s]*([^」\s,，。]+)/,
        /取消[「\s]*([^」\s,，。]+)/,
      ];

      let extractedDimensionName: string | null = null;
      for (const pattern of dimensionPatterns) {
        const match = sanitizedMessage.match(pattern);
        if (match && match[1]) {
          extractedDimensionName = match[1].replace(/[「」]/g, "").trim();
          break;
        }
      }

      if (extractedDimensionName) {
        this.logger.log(
          `[handleUserMessage] Fallback: Attempting to delete dimension "${extractedDimensionName}"`,
        );

        try {
          const deleteResult = await this.leaderToolService.deleteDimension({
            topicId,
            dimensionName: extractedDimensionName,
          });
          actionResults.push(deleteResult);

          if (deleteResult.success) {
            this.logger.log(
              `[handleUserMessage] Fallback delete successful: ${deleteResult.message}`,
            );
            // 更新响应以反映删除操作
            result.response = deleteResult.message;
          }
        } catch (error) {
          this.logger.error(
            `[handleUserMessage] Fallback delete failed: ${error}`,
          );
        }
      } else {
        this.logger.warn(
          `[handleUserMessage] Could not extract dimension name from delete intent`,
        );
      }
    }

    // 10. 记录决策（包含动作执行结果）
    await this.recordDecision(
      missionId,
      LeaderDecisionType.INTERVENE,
      { userMessage: sanitizedMessage, detectedIntent: intentResult.intent },
      { ...result, actionResults },
      result.response,
      leaderModel.modelId,
      latencyMs,
    );

    // 11. 构建最终响应（如果有动作执行失败，附加错误信息）
    const failedActions = actionResults.filter((r) => !r.success);
    let finalResponse = result.response;
    if (failedActions.length > 0) {
      const errorMessages = failedActions.map((r) => r.message).join("; ");
      finalResponse += `\n\n⚠️ 部分操作未成功: ${errorMessages}`;
    }

    // ★ 发射 WebSocket 事件到团队互动区
    await this.eventEmitter.emitLeaderResponse(
      topicId,
      missionId,
      finalResponse,
    );

    return {
      response: finalResponse,
      actionResults,
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
  ): { response: string; actionResults?: LeaderActionResult[] } | null {
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
   * ★ v8.1: 构建项目配置上下文
   * 让 Leader 了解当前项目的完整配置，包括：
   * - 知识库配置
   * - 可用工具列表（动态从 AI Engine 获取）
   * - 团队成员配置
   * - 搜索时间范围
   */
  private async buildProjectContext(
    topicId: string,
    missionId?: string,
  ): Promise<string> {
    try {
      // ★ 优化: 使用 Promise.all 并行查询，减少数据库往返
      const [topic, mission] = await Promise.all([
        // 1. 获取专题信息和配置
        this.prisma.researchTopic.findUnique({
          where: { id: topicId },
          include: { dimensions: true },
        }),
        // 2. 获取任务信息（如果有 missionId）
        missionId
          ? this.prisma.researchMission.findUnique({
              where: { id: missionId },
              select: { leaderPlan: true },
            })
          : Promise.resolve(null),
      ]);

      if (!topic) {
        return "## 项目配置\n暂无项目配置信息";
      }

      const topicConfig = (topic.topicConfig as Record<string, unknown>) || {};

      // 3. 获取知识库名称（如果配置了）
      let knowledgeBaseText = "未配置";
      const knowledgeBaseIds = topicConfig.knowledgeBaseIds as
        | string[]
        | undefined;
      if (
        Array.isArray(knowledgeBaseIds) &&
        knowledgeBaseIds.length > 0 &&
        knowledgeBaseIds.every((id) => typeof id === "string" && id.length > 0)
      ) {
        try {
          const knowledgeBases = await this.prisma.knowledgeBase.findMany({
            where: { id: { in: knowledgeBaseIds } },
            select: { id: true, name: true },
          });
          if (knowledgeBases.length > 0) {
            knowledgeBaseText = knowledgeBases
              .map((kb) => `「${kb.name}」`)
              .join(", ");
          }
        } catch (e) {
          this.logger.warn(
            `[buildProjectContext] Failed to fetch knowledge bases: ${e}`,
          );
        }
      }

      // 4. ★ 动态获取可用工具列表（从 AI Engine）- 添加空值防护
      const availableTools = this.aiFacade.getAvailableTools() || [];
      const toolsText =
        availableTools.length > 0
          ? availableTools
              .filter((t) => t && t.name) // 过滤无效工具
              .map(
                (t) =>
                  `- ${t.name}${t.description ? `: ${t.description}` : ""}`,
              )
              .join("\n")
          : "- 暂无可用工具";

      // 5. 获取搜索时间范围配置
      const searchTimeRange =
        (topicConfig.searchTimeRange as string) || "不限（搜索所有时间的内容）";

      // 6. 获取团队成员配置（从 LeaderPlan）
      let teamMembersText = "团队尚未组建";
      const leaderPlan = mission?.leaderPlan as LeaderPlan | null;
      if (
        leaderPlan?.agentAssignments &&
        leaderPlan.agentAssignments.length > 0
      ) {
        teamMembersText = leaderPlan.agentAssignments
          .map((a) => {
            const parts = [
              `- **${a.agentName || a.agentId}** (${a.agentType})`,
            ];
            if (a.modelId) parts.push(`  - 模型: ${a.modelId}`);
            if (a.skills?.length)
              parts.push(`  - 技能: ${a.skills.join(", ")}`);
            if (a.tools?.length) parts.push(`  - 工具: ${a.tools.join(", ")}`);
            if (a.role) parts.push(`  - 职责: ${a.role}`);
            return parts.join("\n");
          })
          .join("\n");
      }

      // 7. 获取研究维度列表
      const dimensionsText =
        topic.dimensions && topic.dimensions.length > 0
          ? topic.dimensions
              .map(
                (d, i) =>
                  `${i + 1}. ${d.name}${d.status === "COMPLETED" ? " ✓" : d.status === "RESEARCHING" ? " ⏳" : ""}`,
              )
              .join("\n")
          : "暂无研究维度";

      // 8. ★ 获取可用分析技能
      const skillsText = ANALYSIS_SKILL_DEFINITIONS.map(
        (s) => `- ${s.name}: ${s.description}`,
      ).join("\n");

      // 构建完整的项目配置上下文
      return `## 项目配置

### 知识库
${knowledgeBaseText}

### 搜索时间范围
${searchTimeRange}

### 可用研究工具
${toolsText}

### 可用分析技能
${skillsText}

### 研究维度
${dimensionsText}

### 研究团队
${teamMembersText}`;
    } catch (error) {
      this.logger.error(
        `[buildProjectContext] Failed to build context: ${error}`,
      );
      return "## 项目配置\n暂无项目配置信息";
    }
  }

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
    // ★ Security: 对用户输入进行消毒，防止 Prompt Injection
    const sanitizedMessage = sanitize(userMessage);

    this.logger.log(
      `[decodeUserInput] Decoding user input for topic ${topicId}: "${sanitizedMessage.substring(0, 50)}..."`,
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

    // 3. ★ v8.1: 构建项目配置上下文（让 Leader 了解自己的能力和团队配置）
    const projectContext = await this.buildProjectContext(topicId, missionId);

    // 4. 快速意图检测（简单情况不需要调用 AI）
    // ★ 跳过快速检测如果用户询问项目配置相关问题
    const isProjectConfigQuestion =
      sanitizedMessage.includes("工具") ||
      sanitizedMessage.includes("技能") ||
      sanitizedMessage.includes("团队") ||
      sanitizedMessage.includes("成员") ||
      sanitizedMessage.includes("知识库") ||
      sanitizedMessage.includes("配置") ||
      sanitizedMessage.includes("你能") ||
      sanitizedMessage.includes("你有");

    if (!isProjectConfigQuestion) {
      const quickResult = this.quickDecodeIntent(
        sanitizedMessage,
        progress,
        topic.name,
      );
      if (quickResult) {
        this.logger.log(
          `[decodeUserInput] Quick decode result: ${quickResult.decisionType}`,
        );
        return quickResult;
      }
    }

    // 5. 复杂情况：调用 AI 解码
    const leaderModel = await this.getReasoningModel();
    if (!leaderModel) {
      // 无推理模型时的降级处理
      return {
        decisionType: "ACKNOWLEDGE",
        understanding: "收到您的消息",
        response: `收到！我会处理您的请求："${sanitizedMessage}"`,
      };
    }

    // 6. 构建 prompt（包含项目配置上下文）
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
      .replace("{projectContext}", projectContext)
      .replace("{userMessage}", sanitizedMessage);

    // 6.5 ★ 获取对话历史（多轮上下文）
    const conversationHistory =
      await this.eventEmitter.getLeaderConversationHistory(
        topicId,
        missionId,
        5, // 最近 5 轮对话
      );

    // 7. 调用 AI（包含对话历史）
    const startTime = Date.now();

    // 构建消息数组：系统提示 + 对话历史 + 当前用户消息
    const messages: Array<{
      role: "system" | "user" | "assistant";
      content: string;
    }> = [
      {
        role: "system",
        content:
          "你是研究团队的 AI Leader。请理解用户意图并输出 JSON 格式的响应。",
      },
    ];

    // 添加对话历史（不包括当前消息，当前消息通过 prompt 发送）
    if (conversationHistory.length > 0) {
      this.logger.debug(
        `[decodeUserInput] Including ${conversationHistory.length} messages from conversation history`,
      );
      messages.push(...conversationHistory);
    }

    // 添加当前用户消息（包含完整上下文的 prompt）
    messages.push({ role: "user", content: prompt });

    const response = await this.aiFacade.chat({
      messages,
      model: leaderModel.modelId,
      taskProfile: {
        creativity: "low", // 解码任务需要准确性
        outputLength: "short",
      },
    });
    const latencyMs = Date.now() - startTime;

    this.logger.log(
      `[decodeUserInput] AI response in ${latencyMs}ms (with ${conversationHistory.length} history messages)`,
    );

    // 7. 解析响应
    const result = this.extractJsonFromResponse<{
      decisionType: string;
      understanding: string;
      response: string;
      todoTitle?: string;
      todoDescription?: string;
      clarifyQuestion?: string;
      clarifyOptions?: string[];
    }>(response.content, "decisionType"); // requiredKey for validation

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
   * ★ v7.2: 为用户请求的任务选择合适的 Agent
   *
   * 功能：
   * 1. 从当前 Mission 的已有 Agent 中选择合适的
   * 2. 如果没有合适的，动态创建新 Agent
   * 3. 返回 Agent 分配信息（包含模型）
   *
   * @param topicId 专题 ID
   * @param missionId 任务 ID
   * @param taskTitle 任务标题
   * @param taskDescription 任务描述
   * @returns Agent 分配信息
   */
  async selectAgentForTask(
    _topicId: string,
    missionId: string,
    taskTitle: string,
    taskDescription?: string,
  ): Promise<AgentAssignment> {
    this.logger.log(
      `[selectAgentForTask] Selecting agent for task: "${taskTitle}"`,
    );

    // 1. 获取当前 Mission 的任务列表，了解已有 Agent
    const mission = await this.prisma.researchMission.findUnique({
      where: { id: missionId },
      include: {
        tasks: {
          where: { assignedAgentType: "dimension_researcher" },
          select: {
            assignedAgent: true,
            assignedAgentType: true,
            modelId: true,
            status: true,
          },
        },
      },
    });

    // 2. 获取可用模型列表（优先用于对话的模型）
    const availableModels = await this.aiFacade.getAvailableModelsExtended();
    // 过滤掉推理模型（用于研究任务的应是普通对话模型）
    const chatModels = availableModels.filter((m) => !m.isReasoning);

    // 3. 统计已有 Agent 的工作负载
    const agentWorkload = new Map<string, number>();
    const agentModels = new Map<string, string>();

    if (mission?.tasks) {
      for (const task of mission.tasks) {
        const agentId = task.assignedAgent;
        const currentLoad = agentWorkload.get(agentId) || 0;
        agentWorkload.set(agentId, currentLoad + 1);
        if (task.modelId) {
          agentModels.set(agentId, task.modelId);
        }
      }
    }

    // 4. 选择策略：优先选择工作负载最少的已有 Agent
    let selectedAgentId: string;
    let selectedModelId: string;
    let agentName: string;

    // 确保有可用模型（如果没有 chat 模型，使用所有可用模型）
    const modelsToUse = chatModels.length > 0 ? chatModels : availableModels;
    const defaultModel = modelsToUse[0]?.id || "gpt-4o";

    if (agentWorkload.size > 0) {
      // 找出工作负载最少的 Agent
      let minLoad = Infinity;
      let minLoadAgent = "";

      for (const [agentId, load] of agentWorkload.entries()) {
        if (load < minLoad) {
          minLoad = load;
          minLoadAgent = agentId;
        }
      }

      selectedAgentId = minLoadAgent;
      selectedModelId = agentModels.get(minLoadAgent) || defaultModel;

      // 从 agentId 提取 Agent 编号用于命名
      // 格式如: researcher_1, researcher_market_trends 等
      const idMatch = selectedAgentId.match(/(\d+)$/);
      const agentNum = idMatch ? idMatch[1] : String(agentWorkload.size);
      agentName = `研究员 ${agentNum}`;

      this.logger.log(
        `[selectAgentForTask] Selected existing agent: ${selectedAgentId} (load: ${minLoad}) with model: ${selectedModelId}`,
      );
    } else {
      // 没有已有 Agent，创建新的
      const timestamp = Date.now();
      selectedAgentId = `researcher_user_${timestamp}`;

      // 随机选择模型实现多元化（确保有模型可选）
      if (modelsToUse.length > 0) {
        const modelIndex = Math.floor(Math.random() * modelsToUse.length);
        selectedModelId = modelsToUse[modelIndex].id;
      } else {
        selectedModelId = "gpt-4o";
      }
      agentName = "新研究员";

      this.logger.log(
        `[selectAgentForTask] Created new agent: ${selectedAgentId} with model: ${selectedModelId}`,
      );
    }

    // 5. 根据任务内容智能选择技能和工具
    const { skills, tools } = this.selectSkillsAndToolsForTask(
      taskTitle,
      taskDescription,
    );

    this.logger.log(
      `[selectAgentForTask] Selected skills: [${skills.join(", ")}], tools: [${tools.join(", ")}]`,
    );

    // 6. 记录 Leader 决策（使用 ADJUST 类型表示动态调整任务分配）
    await this.recordDecision(
      missionId,
      LeaderDecisionType.ADJUST,
      { taskTitle, taskDescription },
      {
        agentId: selectedAgentId,
        agentName,
        modelId: selectedModelId,
        skills,
        tools,
      },
      `Leader 为任务「${taskTitle}」选择了 ${agentName}（${selectedModelId}），技能：[${skills.join(", ")}]，工具：[${tools.join(", ")}]`,
    );

    return {
      agentId: selectedAgentId,
      agentName,
      agentType: "dimension_researcher",
      role: "用户请求研究员",
      modelId: selectedModelId,
      skills,
      tools,
    };
  }

  /**
   * 根据任务标题和描述智能选择技能和工具
   * 用于 Leader 对话创建的任务
   */
  private selectSkillsAndToolsForTask(
    taskTitle: string,
    taskDescription?: string,
  ): { skills: string[]; tools: string[] } {
    const content = `${taskTitle || ""} ${taskDescription || ""}`.toLowerCase();

    // 政策法规类关键词
    const policyKeywords = [
      "政策",
      "法规",
      "监管",
      "立法",
      "法案",
      "法律",
      "policy",
      "regulation",
      "regulatory",
      "legislation",
      "law",
      "compliance",
      "执法",
      "合规",
      "框架",
      "framework",
      "白宫",
      "国会",
      "联邦",
      "行政命令",
    ];

    // 市场分析类关键词
    const marketKeywords = [
      "市场",
      "竞争",
      "格局",
      "份额",
      "趋势",
      "投资",
      "融资",
      "资本",
      "商业",
      "market",
      "competition",
      "trend",
      "investment",
      "business",
      "产业",
      "行业",
      "企业",
      "公司",
    ];

    // 技术研究类关键词
    const techKeywords = [
      "技术",
      "研发",
      "创新",
      "算法",
      "架构",
      "系统",
      "technology",
      "research",
      "innovation",
      "algorithm",
      "infrastructure",
      "基础设施",
      "底层",
      "核心",
    ];

    // 数据分析类关键词
    const dataKeywords = [
      "数据",
      "统计",
      "分析",
      "指标",
      "报告",
      "data",
      "statistics",
      "metrics",
      "analysis",
      "report",
      "增长",
      "下降",
      "百分比",
    ];

    // 战略/综合类关键词
    const strategyKeywords = [
      "战略",
      "布局",
      "发展",
      "规划",
      "展望",
      "预测",
      "未来",
      "strategy",
      "development",
      "outlook",
      "forecast",
      "思想",
      "哲学",
      "根源",
      "动向",
    ];

    let skills: string[] = [];
    let tools: string[] = [];

    // 判断任务类型并选择技能和工具
    const isPolicyRelated = policyKeywords.some((kw) => content.includes(kw));
    const isMarketRelated = marketKeywords.some((kw) => content.includes(kw));
    const isTechRelated = techKeywords.some((kw) => content.includes(kw));
    const isDataRelated = dataKeywords.some((kw) => content.includes(kw));
    const isStrategyRelated = strategyKeywords.some((kw) =>
      content.includes(kw),
    );

    // 政策法规类
    if (isPolicyRelated) {
      skills.push(
        "policy_analysis",
        "regulatory_impact",
        "legislative_tracking",
      );
      tools.push("federal-register", "congress-gov", "whitehouse-news");
    }

    // 市场分析类
    if (isMarketRelated) {
      skills.push(
        "trend_analysis",
        "competitive_analysis",
        "data_interpretation",
      );
      tools.push("web-search", "data-analysis");
    }

    // 技术研究类
    if (isTechRelated) {
      skills.push("deep_dive", "comparison", "synthesis");
      tools.push("academic-search", "web-search");
    }

    // 数据分析类
    if (isDataRelated) {
      skills.push("data_interpretation", "trend_analysis");
      tools.push("data-analysis", "web-search");
    }

    // 战略/综合类
    if (isStrategyRelated) {
      skills.push("future_projection", "cause_effect", "synthesis");
      tools.push("web-search", "news");
    }

    // 去重
    skills = [...new Set(skills)];
    tools = [...new Set(tools)];

    // 如果没有匹配到任何关键词，使用默认值
    if (skills.length === 0) {
      skills = ["deep_dive", "synthesis", "data_interpretation"];
    }
    if (tools.length === 0) {
      tools = ["web-search"];
    }

    // 限制数量：skills 2-4 个，tools 1-3 个
    if (skills.length > 4) {
      skills = skills.slice(0, 4);
    }
    if (tools.length > 3) {
      tools = tools.slice(0, 3);
    }

    return { skills, tools };
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
    if (!message) return null;
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
   * 使用增强的 extractJsonFromAIResponse 工具，支持截断响应修复
   */
  private extractJsonFromResponse<T>(
    response: string,
    requiredKey?: string,
  ): T | null {
    // 处理空响应
    if (!response || response.trim().length === 0) {
      this.logger.warn("[extractJsonFromResponse] Empty response received");
      return null;
    }

    const result = extractJsonFromAIResponse<T>(response, { requiredKey });

    if (result.success && result.data) {
      this.logger.debug(
        `[extractJsonFromResponse] Extracted via method: ${result.method}`,
      );
      return result.data;
    }

    this.logger.error(
      `[extractJsonFromResponse] Could not extract JSON: ${result.error || "unknown error"}`,
    );
    return null;
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
    figuresSummary?: string, // ★ 新增：可用图表列表
    otherDimensions?: Array<{ name: string; description?: string | null }>,
  ): Promise<DimensionOutline> {
    this.logger.log(
      `[planDimensionOutline] Planning outline for dimension: ${dimension.name}`,
    );

    const focusAreas = Array.isArray(dimension.searchQueries)
      ? (dimension.searchQueries as string[]).join(", ")
      : "无";

    const otherDimensionsInfo =
      otherDimensions && otherDimensions.length > 0
        ? otherDimensions
            .filter((d) => d.name !== dimension.name)
            .map(
              (d) =>
                `- **${d.name}**${d.description ? `：${d.description}` : ""}`,
            )
            .join("\n")
        : "无其他维度";

    const prompt = DIMENSION_OUTLINE_PROMPT.replace("{topicName}", topic.name)
      .replace("{topicType}", topic.type)
      .replace("{topicDescription}", topic.description || "无")
      .replace(/\{dimensionName\}/g, () => dimension.name)
      .replace("{dimensionDescription}", dimension.description || "无")
      .replace("{focusAreas}", focusAreas)
      .replace("{evidenceSummary}", evidenceSummary)
      .replace("{otherDimensionsInfo}", otherDimensionsInfo);

    // ★ 注入图表分配信息
    const figuresSection = figuresSummary
      ? `\n\n## 可用图表资源\n${figuresSummary}\n\n**图表分配指令**：请为每个 section 分配 0-2 个最相关的图表。每张图只能分配给一个 section。在 sections 的每个条目中新增 "allocatedFigures" 字段。`
      : "";
    const finalPrompt = prompt + figuresSection;

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
            { role: "user", content: finalPrompt },
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
          "sections", // requiredKey for validation
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
   * Leader 规划全局协调大纲（Phase 2）
   *
   * 核心职责：
   * 1. 全局视角 - 同时查看所有维度的搜索结果
   * 2. 协调去重 - 确保各维度之间分工明确，避免重复
   * 3. 规划大纲 - 为每个维度规划完整章节结构
   *
   * @param topic 研究专题
   * @param dimensionSearchResults 所有维度的搜索结果摘要
   * @returns 全局协调的大纲
   */
  async planGlobalOutline(
    topic: { name: string; type: string; description?: string | null },
    dimensionSearchResults: Array<{
      dimensionId: string;
      dimensionName: string;
      dimensionDescription?: string | null;
      evidenceSummary: string;
      figuresSummary: string;
      searchQueries?: string[] | unknown;
    }>,
  ): Promise<GlobalOutline> {
    this.logger.log(
      `[planGlobalOutline] Planning global coordinated outline for ${dimensionSearchResults.length} dimensions`,
    );

    // 构建所有维度的搜索结果摘要（限制每个维度摘要长度，避免 token 溢出）
    const MAX_EVIDENCE_CHARS = 1200;
    const MAX_FIGURES_CHARS = 300;
    const dimensionSearchResultsText = dimensionSearchResults
      .map((d, index) => {
        const queries = Array.isArray(d.searchQueries)
          ? (d.searchQueries as string[]).join(", ")
          : "无";
        const evidenceText = (d.evidenceSummary || "").substring(
          0,
          MAX_EVIDENCE_CHARS,
        );
        const figuresText = (d.figuresSummary || "").substring(
          0,
          MAX_FIGURES_CHARS,
        );
        return `### 维度 ${index + 1}: ${d.dimensionName}

**描述**: ${d.dimensionDescription || "无"}
**搜索重点**: ${queries}

**搜索结果摘要**:
${evidenceText}

${figuresText ? `**可用图表**:\n${figuresText}` : ""}

---`;
      })
      .join("\n\n");

    const prompt = GLOBAL_OUTLINE_PROMPT.replace("{topicName}", topic.name)
      .replace("{topicType}", topic.type)
      .replace("{topicDescription}", topic.description || "无")
      .replace("{dimensionSearchResults}", dimensionSearchResultsText);

    // 重试机制
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 2000;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const leaderModel = await this.getReasoningModel();
        if (!leaderModel) {
          throw new Error("No reasoning model available for Leader");
        }
        this.logger.log(
          `[planGlobalOutline] Attempt ${attempt}/${MAX_RETRIES}: Using model ${leaderModel.modelId}`,
        );

        const startTime = Date.now();
        const response = await this.aiFacade.chat({
          messages: [
            {
              role: "system",
              content:
                "你是研究协调专家 Leader，负责全局协调各维度的研究大纲。请输出 JSON 格式。",
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

        if (response.isError) {
          const errorContent = response.content.slice(0, 200);
          this.logger.warn(
            `[planGlobalOutline] Attempt ${attempt}/${MAX_RETRIES}: API returned error: ${errorContent}`,
          );
          const isQuotaError =
            errorContent.includes("429") ||
            errorContent.includes("quota") ||
            errorContent.includes("rate limit") ||
            errorContent.includes("temporarily unavailable");
          lastError = new Error(`API error: ${response.content.slice(0, 100)}`);
          if (attempt < MAX_RETRIES) {
            await this.delay(isQuotaError ? 500 : RETRY_DELAY_MS * attempt);
            continue;
          }
        }

        if (
          response.content.includes("<!DOCTYPE") ||
          response.content.includes("<html")
        ) {
          this.logger.warn(
            `[planGlobalOutline] Attempt ${attempt}/${MAX_RETRIES}: API returned HTML error page, retrying...`,
          );
          lastError = new Error("API returned HTML error page instead of JSON");
          if (attempt < MAX_RETRIES) {
            await this.delay(RETRY_DELAY_MS * attempt);
            continue;
          }
        }

        const globalOutline = this.extractJsonFromResponse<GlobalOutline>(
          response.content,
          "dimensions",
        );

        if (
          !globalOutline ||
          !globalOutline.dimensions ||
          globalOutline.dimensions.length === 0
        ) {
          this.logger.warn(
            `[planGlobalOutline] Attempt ${attempt}/${MAX_RETRIES}: Failed to parse JSON, retrying...`,
          );
          lastError = new Error("Failed to parse global outline JSON");
          if (attempt < MAX_RETRIES) {
            await this.delay(RETRY_DELAY_MS * attempt);
            continue;
          }
        } else {
          // Validate: ensure all input dimensions have corresponding outline entries
          const inputNames = new Set(
            dimensionSearchResults.map((d) => d.dimensionName),
          );
          const outlineNames = new Set(
            globalOutline.dimensions.map((d) => d.dimensionName),
          );
          const missing = [...inputNames].filter((n) => !outlineNames.has(n));
          if (missing.length > 0) {
            this.logger.warn(
              `[planGlobalOutline] Outline missing ${missing.length} dimensions: ${missing.join(", ")}. Adding stubs.`,
            );
            // Add stub outlines for missing dimensions
            const APPENDIX_KEYWORDS =
              /附录|方法论|参考文献|指标体系|术语|工具清单|glossary|appendix|methodology/i;
            for (const name of missing) {
              const inputDim = dimensionSearchResults.find(
                (d) => d.dimensionName === name,
              );
              // ★ B4: 附录类维度字数减半
              const isAppendixLike = APPENDIX_KEYWORDS.test(name);
              const stubWords = isAppendixLike ? 400 : 800;
              globalOutline.dimensions.push({
                dimensionId: inputDim?.dimensionId || "",
                dimensionName: name,
                crossDimensionNotes: "",
                outline: {
                  intentUnderstanding: {
                    coreQuestion: name,
                    scope: { included: [name], excluded: [] },
                    expectedDepth: isAppendixLike ? "overview" : "detailed",
                    targetAudience: "general",
                    keyFocusAreas: [name],
                  },
                  sections: [
                    {
                      id: `stub-${name}`,
                      title: name,
                      description: "综合分析",
                      keyPoints: ["综合分析"],
                      targetWords: stubWords,
                      evidenceRequirements: { minReferences: 2 },
                    },
                  ],
                  executionPlan: {
                    parallelGroups: [[`stub-${name}`]],
                    estimatedTotalWords: stubWords,
                  },
                },
              });
            }
          }

          this.logger.log(
            `[planGlobalOutline] Created global outline for ${globalOutline.dimensions.length} dimensions in ${latencyMs}ms (attempt ${attempt})`,
          );
          return globalOutline;
        }
      } catch (error) {
        this.logger.warn(
          `[planGlobalOutline] Attempt ${attempt}/${MAX_RETRIES} failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
        lastError =
          error instanceof Error ? error : new Error("Unknown API error");
        if (attempt < MAX_RETRIES) {
          await this.delay(RETRY_DELAY_MS * attempt);
        }
      }
    }

    this.logger.error(`[planGlobalOutline] All ${MAX_RETRIES} attempts failed`);
    throw new Error(
      `Failed to parse global outline after ${MAX_RETRIES} attempts: ${lastError?.message || "Unknown error"}`,
    );
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
    charts?: {
      generatedCharts?: GeneratedChart[];
      figureReferences?: FigureReference[];
    },
    previousSections?: Array<{ title: string; content: string }>,
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

    const previousSummary =
      previousSections && previousSections.length > 0
        ? previousSections
            .map((s) => `### ${s.title}\n${s.content.substring(0, 800)}...`)
            .join("\n\n")
        : "无前置章节";

    let prompt = SECTION_REVIEW_PROMPT.replace("{sectionTitle}", section.title)
      .replace("{sectionDescription}", section.description)
      .replace("{keyPoints}", section.keyPoints.join(", "))
      .replace("{targetWords}", String(section.targetWords))
      .replace(
        "{minReferences}",
        String(section.evidenceRequirements.minReferences),
      )
      .replace("{sectionContent}", content)
      .replace("{previousSectionsSummary}", previousSummary);

    // ★ 注入图表数据供审核
    if (charts?.generatedCharts?.length || charts?.figureReferences?.length) {
      prompt += `\n\n## 章节图表数据\n\`\`\`json\n${JSON.stringify(charts, null, 2)}\n\`\`\``;
    }

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
    }>(response.content, "approved"); // requiredKey for validation

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

    // 如果只有一个章节，直接返回（但仍提取关键发现）
    if (sectionResults.length === 1) {
      const content = sectionResults[0].content;
      const keyFindings = this.extractKeyFindingsFromContent(content);
      return {
        content: `# ${dimension.name}\n\n${content}`,
        metadata: {
          summary: content.substring(0, 200),
          keyFindings,
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

    // 如果没有推理模型，使用简单拼接（但仍提取关键发现）
    if (!leaderModel) {
      const content = `# ${dimension.name}\n\n${sectionsContent}`;
      const keyFindings = this.extractKeyFindingsFromContent(content);
      return {
        content,
        metadata: {
          summary: `关于"${dimension.name}"的分析报告。`,
          keyFindings,
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
      "content", // requiredKey for validation
    );

    if (!result) {
      // 整合失败，使用简单拼接（但仍提取关键发现）
      const content = `# ${dimension.name}\n\n${sectionsContent}`;
      const keyFindings = this.extractKeyFindingsFromContent(content);
      return {
        content,
        metadata: {
          summary: `关于"${dimension.name}"的分析报告。`,
          keyFindings,
          confidenceLevel: "medium",
        },
        evidenceUsed: this.extractEvidenceIds(content),
        totalWords: content.length,
      };
    }

    // ★ 如果 AI 返回的 keyFindings 为空，尝试从内容中提取
    if (
      !result.metadata?.keyFindings ||
      result.metadata.keyFindings.length === 0
    ) {
      const extractedFindings = this.extractKeyFindingsFromContent(
        result.content || sectionsContent,
      );
      if (extractedFindings.length > 0) {
        result.metadata = {
          ...result.metadata,
          keyFindings: extractedFindings,
        };
        this.logger.log(
          `[integrateDimensionResults] AI returned empty keyFindings, extracted ${extractedFindings.length} from content`,
        );
      }
    }

    this.logger.log(
      `[integrateDimensionResults] Integrated ${sectionResults.length} sections, ${result.totalWords} words, ${result.metadata?.keyFindings?.length || 0} keyFindings`,
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

  /**
   * 从内容中自动提取关键发现
   * 用于 fallback 场景（单章节、无推理模型、整合失败等）
   * 策略：
   * 1. 查找带有特定标记的句子（如"关键"、"重要"、"核心"等）
   * 2. 查找 Markdown 标题后的第一句话
   * 3. 提取带引用的观点
   */
  private extractKeyFindingsFromContent(content: string): string[] {
    const findings: string[] = [];

    // 1. 查找明确标注的关键发现（如"关键发现："后面的内容）
    const markedFindingsMatch = content.match(
      /(?:关键发现|核心观点|主要结论|重要发现)[：:]\s*([^\n]+)/g,
    );
    if (markedFindingsMatch) {
      for (const match of markedFindingsMatch) {
        const finding = match
          .replace(/(?:关键发现|核心观点|主要结论|重要发现)[：:]\s*/, "")
          .trim();
        if (finding.length > 10 && finding.length < 200) {
          findings.push(finding);
        }
      }
    }

    // 2. 从列表项中提取（Markdown 列表）
    const listItemMatches = content.match(/^[-*]\s+.{20,150}(?:。|$)/gm);
    if (listItemMatches && findings.length < 5) {
      for (const item of listItemMatches.slice(0, 5 - findings.length)) {
        const finding = item.replace(/^[-*]\s+/, "").trim();
        if (!findings.includes(finding)) {
          findings.push(finding);
        }
      }
    }

    // 3. 从标题下方第一句话提取（Markdown 标题）
    const headerMatches = content.match(
      /^#{2,4}\s+[^\n]+\n+([^#\n][^\n]{20,150})/gm,
    );
    if (headerMatches && findings.length < 5) {
      for (const match of headerMatches.slice(0, 3)) {
        const lines = match.split("\n").filter((l) => l.trim());
        if (lines.length > 1) {
          const sentence = lines[1].trim().replace(/^[-*]\s+/, "");
          if (sentence.length > 20 && !findings.includes(sentence)) {
            findings.push(sentence);
          }
        }
      }
    }

    // 去重并限制数量
    return [...new Set(findings)].slice(0, 5);
  }
}
