/**
 * AI Engine Orchestration Services - Interfaces
 * AI 引擎编排服务接口定义
 *
 * 这些接口定义了从 AI Teams 下沉到 AI Engine 的核心能力
 */

// ==================== 通用类型 ====================

import { AIModelType } from "@prisma/client";
import { TaskProfile } from "../../../ai-engine/llm/types";

/**
 * AI 调用函数类型
 * 用于依赖注入，允许上层传入带上下文的 AI 调用实现
 */
export type AiCallerFn = (
  model: string,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  options?: {
    maxTokens?: number;
    temperature?: number;
    taskProfile?: TaskProfile;
  },
) => Promise<{ content: string; tokensUsed: number }>;

/**
 * 团队成员基础信息
 */
export interface TeamMemberInfo {
  id: string;
  agentName: string | null;
  displayName: string;
  aiModel: string;
  isLeader: boolean;
  systemPrompt?: string | null;
  persona?: string | null;
}

/**
 * 任务定义
 */
export interface TaskDefinition {
  id?: string;
  title: string;
  description: string;
  assigneeId: string;
  assigneeName: string;
  reason: string;
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  taskType: string;
  dependsOn: number[];
}

/**
 * 任务分解数据
 */
export interface TaskBreakdownData {
  understanding: string;
  tasks: TaskDefinition[];
  executionPlan: string;
  risks: string;
}

// ==================== 任务分解服务接口 ====================

/**
 * 任务分解输入
 */
export interface DecompositionInput {
  /** 任务内容（AI 生成的分解结果文本） */
  content: string;
  /** 团队成员列表 */
  teamMembers: TeamMemberInfo[];
  /** Mission ID（用于创建任务） */
  missionId?: string;
}

/**
 * 任务分解结果
 */
export interface DecompositionResult {
  /** 解析出的任务列表 */
  tasks: TaskDefinition[];
  /** 任务理解 */
  understanding: string;
  /** 执行计划 */
  executionPlan: string;
  /** 风险提示 */
  risks: string;
  /** 匹配统计 */
  matchStats: {
    totalRows: number;
    matched: number;
    fuzzyMatched: number;
    unmatched: string[];
  };
}

/**
 * 任务分解服务接口
 */
export interface ITaskDecomposerService {
  /**
   * 解析任务分解内容
   */
  parseTaskBreakdown(input: DecompositionInput): DecompositionResult;

  /**
   * 任务分配再平衡
   */
  rebalanceTaskAssignments(
    tasks: TaskDefinition[],
    teamMembers: TeamMemberInfo[],
  ): TaskDefinition[];
}

// ==================== Agent 执行服务接口 ====================

/**
 * 执行上下文
 */
export interface ExecutionContext {
  /** Mission ID */
  missionId: string;
  /** Topic ID */
  topicId: string;
  /** 任务信息 */
  task: {
    id: string;
    title: string;
    description?: string;
    assigneeId: string;
  };
  /** 执行者信息 */
  executor: TeamMemberInfo;
  /** 系统提示词 */
  systemPrompt: string;
  /** 用户提示词 */
  userPrompt: string;
  /** 搜索上下文（可选） */
  searchContext?: string;
  /** 前置任务结果（可选） */
  previousResults?: Record<string, string>;
}

/**
 * 执行配置
 */
export interface ExecutionConfig {
  /** 最大 Token 数 */
  maxTokens?: number;
  /** 温度参数 */
  temperature?: number;
  /** TaskProfile for semantic parameter mapping */
  taskProfile?: TaskProfile;
  /** 是否启用搜索增强 */
  enableSearch?: boolean;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 重试初始延迟（毫秒） */
  retryInitialDelay?: number;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 最大迭代次数（agent execution） */
  maxIterations?: number;
  /** 最大工具调用次数 */
  maxToolCalls?: number;
}

/**
 * 执行结果
 */
export interface ExecutionResult {
  /** 是否成功 */
  success: boolean;
  /** 输出内容 */
  content: string;
  /** Token 使用量 */
  tokensUsed: number;
  /** 执行耗时（毫秒） */
  duration: number;
  /** 错误信息（如果失败） */
  error?: string;
  /** 是否可重试 */
  retryable?: boolean;
  /** 搜索结果（如果启用） */
  searchResults?: Array<{ title: string; url: string; snippet: string }>;
}

/**
 * Agent 执行服务接口
 */
export interface IAgentExecutorService {
  /**
   * 执行单个任务
   */
  executeTask(
    context: ExecutionContext,
    config?: ExecutionConfig,
  ): Promise<ExecutionResult>;

  /**
   * 批量执行任务（并发控制）
   */
  executeTasks(
    contexts: ExecutionContext[],
    config?: ExecutionConfig & { concurrency?: number },
  ): Promise<ExecutionResult[]>;

  /**
   * 检查 Agent 是否可用（熔断器状态）
   */
  isAgentAvailable(agentId: string): boolean;

  /**
   * 记录 Agent 执行结果（用于熔断器）
   */
  recordExecution(agentId: string, success: boolean, duration: number): void;
}

// ==================== 输出审核服务接口 ====================

/**
 * 审核请求
 */
export interface ReviewRequest {
  /** Mission ID */
  missionId: string;
  /** 任务信息 */
  task: {
    id: string;
    title: string;
    description?: string;
  };
  /** 任务输出内容 */
  content: string;
  /** Leader 信息 */
  leader: TeamMemberInfo;
  /** 审核标准（可选） */
  criteria?: ReviewCriteria;
  /** Mission 描述（用于上下文） */
  missionDescription?: string;
  /** 硬约束（可选） */
  constraints?: Array<{ type: string; description: string }>;
}

/**
 * 审核标准
 */
export interface ReviewCriteria {
  /** 内容完整性权重 */
  completenessWeight?: number;
  /** 准确性权重 */
  accuracyWeight?: number;
  /** 逻辑性权重 */
  logicWeight?: number;
  /** 专业性权重 */
  professionalismWeight?: number;
  // ★ v2: 扩展评审维度（10 维）
  evidenceCoverageWeight?: number; // 证据覆盖度权重
  informationDensityWeight?: number; // 信息密度权重
  visualQualityWeight?: number; // 图表专业度权重
  originalityWeight?: number; // 独创性权重
  timelinessWeight?: number; // 时效性权重
  actionabilityWeight?: number; // 可操作性权重
  /** 通过分数阈值（默认 7） */
  passThreshold?: number;
  /** 最大返工次数 */
  maxRevisions?: number;
}

/**
 * 审核结果
 */
export interface ReviewResult {
  /** 是否通过 */
  passed: boolean;
  /** 分数（1-10） */
  score: number;
  /** 各维度分数 (completeness, accuracy, logic, professionalism) */
  scores?: Record<string, number>;
  /** 反馈内容 */
  feedback: string;
  /** 具体问题列表 */
  issues: string[];
  /** 建议的改进方向 */
  suggestions: string[];
  /** Token 使用量 */
  tokensUsed: number;
}

/**
 * 修订请求
 */
export interface RevisionRequest {
  /** 原执行上下文 */
  originalContext: ExecutionContext;
  /** 原输出内容 */
  originalContent: string;
  /** 审核反馈 */
  reviewFeedback: string;
  /** 问题列表 */
  issues: string[];
  /** 修订次数 */
  revisionCount: number;
}

/**
 * 输出审核服务接口
 */
export interface IOutputReviewerService {
  /**
   * 审核任务输出
   * @param request 审核请求
   * @param aiCaller 可选的 AI 调用函数，用于注入上层执行上下文
   */
  reviewOutput(
    request: ReviewRequest,
    aiCaller?: AiCallerFn,
  ): Promise<ReviewResult>;

  /**
   * 为长内容生成摘要（用于审核）
   * @param aiCaller 可选的 AI 调用函数，用于注入上层执行上下文
   */
  summarizeForReview(
    content: string,
    taskTitle: string,
    model: string,
    missionId: string,
    aiCaller?: AiCallerFn,
  ): Promise<{ summary: string; keyExcerpts?: string }>;

  /**
   * 执行任务修订
   * @param request 修订请求
   * @param aiCaller 可选的 AI 调用函数，用于注入上层执行上下文
   */
  executeRevision(
    request: RevisionRequest,
    aiCaller?: AiCallerFn,
  ): Promise<ExecutionResult>;
}

// ==================== 迭代管理服务接口 ====================

/**
 * 结构化输出部分
 */
export interface OutputSection {
  /** 部分 ID（用于选择性更新） */
  id: string;
  /** 标题 */
  title: string;
  /** 内容 */
  content: string;
  /** 层级（用于目录） */
  level: number;
  /** 父部分 ID */
  parentId?: string;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 结构化输出
 */
export interface StructuredOutput {
  /** 输出 ID */
  id: string;
  /** 版本号 */
  version: number;
  /** 标题 */
  title: string;
  /** 摘要 */
  summary?: string;
  /** 部分列表 */
  sections: OutputSection[];
  /** 创建时间 */
  createdAt: Date;
  /** 更新时间 */
  updatedAt: Date;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 迭代请求类型
 */
export type IterationRequestType =
  | "partial_update" // 部分更新（选中的部分）
  | "section_expand" // 扩展某个部分
  | "section_rewrite" // 重写某个部分
  | "add_section" // 添加新部分
  | "refresh" // 刷新（重新搜索 + 更新）
  | "full_update"; // 全量更新

/**
 * 迭代请求
 */
export interface IterationRequest {
  /** 请求类型 */
  type: IterationRequestType;
  /** 目标输出 ID */
  outputId: string;
  /** 选中的部分 ID 列表（用于 partial_update） */
  sectionIds?: string[];
  /** 用户补充指令 */
  userInstruction?: string;
  /** 新搜索关键词（用于 refresh） */
  searchKeywords?: string[];
  /** 新部分信息（用于 add_section） */
  newSection?: {
    title: string;
    afterSectionId?: string;
    description?: string;
  };
}

/**
 * 迭代结果
 */
export interface IterationResult {
  /** 是否成功 */
  success: boolean;
  /** 新版本的输出 */
  output: StructuredOutput;
  /** 变更的部分 ID 列表 */
  changedSectionIds: string[];
  /** 变更摘要 */
  changeSummary: string;
  /** Token 使用量 */
  tokensUsed: number;
  /** 错误信息（如果失败） */
  error?: string;
}

/**
 * 研究上下文（持久化）
 */
export interface ResearchContext {
  /** 上下文 ID */
  id: string;
  /** 研究主题 */
  topic: string;
  /** 累积的知识 */
  accumulatedKnowledge: {
    facts: string[];
    sources: Array<{ url: string; title: string; summary: string }>;
    insights: string[];
  };
  /** 历史搜索 */
  searchHistory: Array<{
    query: string;
    timestamp: Date;
    resultCount: number;
  }>;
  /** 创建时间 */
  createdAt: Date;
  /** 更新时间 */
  updatedAt: Date;
}

// ==================== 上下文演进服务接口 ====================

/**
 * 上下文演进配置
 */
export interface ContextEvolutionConfig {
  /** 最小输出长度（低于此值跳过提取） */
  minOutputLength: number;
  /** 提取时的最大输出长度（截断） */
  maxOutputForExtraction: number;
  /** 事实总数上限 */
  maxFactsCount: number;
  /** 中等重要性事实显示数量上限 */
  maxMediumFactsDisplay: number;
  /** 最小事实陈述长度 */
  minFactStatementLength: number;
  /** 是否启用异步提取 */
  asyncExtraction: boolean;
  /** 用于事实提取的模型 */
  extractionModel: string;
}

/**
 * 默认上下文演进配置
 */
export const DEFAULT_CONTEXT_EVOLUTION_CONFIG: ContextEvolutionConfig = {
  minOutputLength: 200,
  maxOutputForExtraction: 6000,
  maxFactsCount: 100,
  maxMediumFactsDisplay: 10,
  minFactStatementLength: 5,
  asyncExtraction: false,
  extractionModel: AIModelType.CHAT_FAST,
};

/**
 * 已确立的事实 - 在任务执行过程中被确定下来的信息
 *
 * 通用设计：适用于任何类型的任务
 * - 小说：人物出场、情节发展、时间线推进
 * - 技术文档：API定义、术语确定、架构决策
 * - 研究报告：数据来源、结论推导、论点演进
 */
export interface EstablishedFact {
  /** 唯一ID */
  id: string;
  /** 来源任务ID */
  sourceTaskId: string;
  /** 来源任务标题 */
  sourceTaskTitle: string;
  /** 确立时间 */
  establishedAt: string;
  /** 事实陈述 */
  statement: string;
  /**
   * 事实类别（领域无关）
   * - entity_state: 实体状态变化（人物状态、系统状态等）
   * - sequence_point: 序列点（时间线、版本、阶段）
   * - decision: 决策（架构选择、情节走向）
   * - definition: 定义确定（术语、概念、规格）
   * - relationship: 关系建立（人物关系、组件依赖）
   * - constraint_added: 新增约束
   */
  category:
    | "entity_state"
    | "sequence_point"
    | "decision"
    | "definition"
    | "relationship"
    | "constraint_added";
  /** 相关实体名称 */
  relatedEntities?: string[];
  /** 重要程度: high=必须遵守, medium=应该遵守, low=参考信息 */
  importance: "high" | "medium" | "low";
}

/**
 * 事实类别常量
 */
export const FACT_CATEGORIES = [
  "entity_state",
  "sequence_point",
  "decision",
  "definition",
  "relationship",
  "constraint_added",
] as const;

/**
 * 事实重要程度常量
 */
export const FACT_IMPORTANCE_LEVELS = ["high", "medium", "low"] as const;

/**
 * 上下文状态（通用结构，适用于任何任务类型）
 */
export interface ContextState {
  /** 版本号 */
  version: string;
  /** 生成时间 */
  generatedAt: string;
  /** 生成者（Leader ID） */
  generatedBy: string;
  /** 已确立的事实 */
  establishedFacts: EstablishedFact[];
}

/**
 * 事实提取请求
 */
export interface FactExtractionRequest {
  /** 任务ID */
  taskId: string;
  /** 任务标题 */
  taskTitle: string;
  /** 任务输出内容 */
  taskOutput: string;
  /** 现有的已确立事实（避免重复） */
  existingFacts?: EstablishedFact[];
  /** 现有的实体名称（避免重复） */
  existingEntities?: string[];
}

/**
 * 事实提取结果
 */
export interface FactExtractionResult {
  /** 提取出的新事实 */
  facts: EstablishedFact[];
  /** Token 使用量 */
  tokensUsed: number;
}

/**
 * 上下文演进服务接口
 */
export interface IContextEvolutionService {
  /**
   * 从任务输出中提取已确立的事实
   * @param request 提取请求
   * @param aiCaller AI 调用函数（注入上层执行上下文）
   * @param config 可选配置
   */
  extractFacts(
    request: FactExtractionRequest,
    aiCaller: AiCallerFn,
    config?: Partial<ContextEvolutionConfig>,
  ): Promise<FactExtractionResult>;

  /**
   * 合并新事实到现有上下文
   * @param existingFacts 现有事实
   * @param newFacts 新事实
   * @param config 可选配置（用于限制总数）
   */
  mergeFacts(
    existingFacts: EstablishedFact[],
    newFacts: EstablishedFact[],
    config?: Partial<ContextEvolutionConfig>,
  ): EstablishedFact[];

  /**
   * 构建已确立事实的提示词片段（用于审核）
   * @param facts 事实列表
   * @param config 可选配置
   */
  buildFactsPromptSection(
    facts: EstablishedFact[],
    config?: Partial<ContextEvolutionConfig>,
  ): string;
}

// ==================== 上下文初始化服务接口（世界观设定） ====================

/**
 * 世界观设定 - 时代背景
 */
export interface WorldSettingsEra {
  /** 时期（如：明朝天启年间） */
  period: string;
  /** 具体年份（可选，如：天启六年） */
  year?: string;
  /** 时代特征描述 */
  description: string;
}

/**
 * 世界观设定 - 人物
 */
export interface WorldSettingsCharacter {
  /** 人物名 */
  name: string;
  /** 角色定位（如：女主、男主、反派） */
  role: string;
  /** 身份（如：宫女、太子、大太监） */
  identity: string;
  /** 性格特征 */
  traits: string[];
  /** 特殊约束（如：不能说话、左手有胎记） */
  constraints: string[];
}

/**
 * 世界观设定 - 阵营
 */
export interface WorldSettingsFaction {
  /** 阵营名 */
  name: string;
  /** 阵营描述 */
  description: string;
  /** 核心成员 */
  keyMembers: string[];
}

/**
 * 世界观设定（完整结构）
 */
export interface WorldSettings {
  /** 时代背景 */
  era: WorldSettingsEra;
  /** 核心人物 */
  characters: WorldSettingsCharacter[];
  /** 阵营/组织 */
  factions: WorldSettingsFaction[];
  /** 核心规则/设定 */
  coreRules: string[];
  /** 禁止事项 */
  prohibitions: string[];
}

/**
 * 内容类型
 */
export type ContentType = "novel" | "document" | "research" | "other";

/**
 * 硬性约束（与 AI Teams 兼容）
 */
export interface HardConstraint {
  /** 约束ID */
  id: string;
  /** 约束规则 */
  rule: string;
  /** 原因 */
  reason?: string;
  /** 严重程度 */
  severity: "MUST" | "SHOULD";
}

/**
 * 核心实体（与 AI Teams 兼容）
 */
export interface CoreEntity {
  /** 实体名称 */
  name: string;
  /** 类型：人物/概念/术语/指标/组织/地点/... */
  type: string;
  /** 定义说明 */
  definition: string;
  /** 附加属性 */
  attributes?: Record<string, string>;
}

/**
 * 世界观构建结果
 */
export interface WorldBuildingResult {
  /** 是否需要世界观设定 */
  needed: boolean;
  /** 检测到的内容类型 */
  contentType: ContentType;
  /** 生成的世界观设定 */
  settings?: WorldSettings;
  /** 转换后的硬性约束 */
  hardConstraints?: HardConstraint[];
  /** 转换后的核心实体 */
  entities?: CoreEntity[];
  /** 消耗的 tokens */
  tokensUsed: number;
}

// ==================== 约束强制服务接口 ====================

/**
 * 约束类型
 */
export type ConstraintSeverity = "MUST" | "SHOULD" | "MAY";

/**
 * 提取的约束
 */
export interface ExtractedConstraint {
  id: string;
  type: ConstraintSeverity;
  rule: string;
  source: string;
  confidence: number;
}

/**
 * 约束违规
 */
export interface ConstraintViolation {
  constraintId: string;
  rule: string;
  violatingText: string;
  position: number;
  severity: "critical" | "high" | "medium" | "low";
}

/**
 * 输出校验结果
 */
export interface OutputValidationResult {
  isValid: boolean;
  violations: ConstraintViolation[];
  checkedConstraints: number;
  passedConstraints: number;
}

/**
 * 约束强制服务接口
 */
export interface IConstraintEnforcementService {
  /**
   * 从文本中提取约束
   */
  extractConstraints(description: string): ExtractedConstraint[];

  /**
   * 校验输出是否违反约束
   */
  validateOutput(
    output: string,
    constraints: ExtractedConstraint[] | HardConstraint[],
  ): Promise<OutputValidationResult>;

  /**
   * 生成违规报告
   */
  generateViolationReport(violations: ConstraintViolation[]): string;

  /**
   * 格式化约束列表（用于 Prompt 注入）
   */
  formatConstraintsForPrompt(
    constraints: ExtractedConstraint[] | HardConstraint[],
    type?: ConstraintSeverity,
  ): string;

  /**
   * 将提取的约束转换为 HardConstraint
   */
  toHardConstraints(constraints: ExtractedConstraint[]): HardConstraint[];
}

/**
 * 上下文初始化服务接口（世界观设定）
 */
export interface IContextInitializationService {
  /**
   * 检测任务内容类型
   */
  detectContentType(
    title: string,
    description: string,
  ): { needed: boolean; contentType: ContentType };

  /**
   * 生成世界观设定
   */
  generateWorldSettings(
    title: string,
    description: string,
    contentType: ContentType,
    aiCaller: AiCallerFn,
    aiModel: string,
  ): Promise<{ settings: WorldSettings; tokensUsed: number }>;

  /**
   * 将世界观设定转换为硬性约束
   */
  settingsToConstraints(settings: WorldSettings): HardConstraint[];

  /**
   * 将世界观设定转换为核心实体
   */
  settingsToEntities(settings: WorldSettings): CoreEntity[];

  /**
   * 完整的世界观构建流程
   */
  buildWorldContext(
    title: string,
    description: string,
    aiCaller: AiCallerFn,
    aiModel: string,
  ): Promise<WorldBuildingResult>;
}

// ==================== 上下文压缩服务接口 ====================

/**
 * 数据块
 */
export interface DataChunk {
  id: string;
  content: string;
  index: number;
  source: string;
  metadata?: Record<string, unknown>;
}

/**
 * 摘要块
 */
export interface SummaryChunk {
  chunkId: string;
  summary: string;
  keyPoints: string[];
  sourceChunks: string[];
  embedding?: number[];
  wordCount: number;
}

/**
 * 压缩结果
 */
export interface CompressionResult {
  compressedContext: string;
  globalSummary: string;
  chunkSummaries: SummaryChunk[];
  stats: {
    originalLength: number;
    compressedLength: number;
    compressionRatio: number;
    chunkCount: number;
    processingTimeMs: number;
  };
  integrityCheck: {
    allChunksProcessed: boolean;
    coveragePercentage: number;
    missingChunks: string[];
  };
}

/**
 * 压缩选项
 */
export interface CompressionOptions {
  targetSize?: number;
  chunkSize?: number;
  generateEmbeddings?: boolean;
  summaryStyle?: "brief" | "detailed" | "analytical";
  model?: string;
  modelType?: AIModelType;
  concurrency?: number;
}

/**
 * 上下文压缩服务接口
 */
export interface IContextCompressionService {
  /**
   * 压缩大上下文
   */
  compress(
    content: string,
    options?: CompressionOptions,
  ): Promise<CompressionResult>;

  /**
   * 基于查询检索相关上下文
   */
  retrieveRelevantContext(
    query: string,
    summaries: SummaryChunk[],
    topK?: number,
  ): Promise<string[]>;
}

// ==================== 意图检测服务接口 ====================

/**
 * 用户意图类型
 */
export enum UserIntent {
  /** 发起新会话（需要隔离历史） */
  START_NEW_SESSION = "START_NEW_SESSION",
  /** 总结 */
  SUMMARIZE = "SUMMARIZE",
  /** 生成内容 */
  GENERATE = "GENERATE",
  /** 分析 */
  ANALYZE = "ANALYZE",
  /** 继续/追问 */
  CONTINUE = "CONTINUE",
  /** 普通对话 */
  GENERAL_CHAT = "GENERAL_CHAT",
}

/**
 * 上下文策略
 */
export enum ContextStrategy {
  /** 完全隔离，不使用历史 */
  ISOLATED = "ISOLATED",
  /** 引用最近内容 */
  REFERENCE_RECENT = "REFERENCE_RECENT",
  /** 标准上下文 */
  STANDARD = "STANDARD",
  /** 相关性检索 */
  RELEVANCE_BASED = "RELEVANCE_BASED",
}

/**
 * 意图检测配置
 */
export interface IntentDetectionConfig {
  /** 新会话关键词 */
  newSessionKeywords?: string[];
  /** 总结关键词 */
  summarizeKeywords?: string[];
  /** 生成关键词 */
  generateKeywords?: string[];
  /** 分析关键词 */
  analyzeKeywords?: string[];
  /** 继续关键词 */
  continueKeywords?: string[];
  /** 引用关键词 */
  referenceKeywords?: string[];
  /** 自定义意图检测规则 */
  customRules?: Array<{
    intent: UserIntent;
    condition: (content: string, metadata?: Record<string, unknown>) => boolean;
  }>;
}

/**
 * 意图检测结果
 */
export interface IntentDetectionResult {
  /** 检测到的意图 */
  intent: UserIntent;
  /** 推荐的上下文策略 */
  strategy: ContextStrategy;
  /** 置信度 */
  confidence: number;
  /** 匹配的关键词 */
  matchedKeywords?: string[];
}

/**
 * 意图检测服务接口
 */
export interface IIntentDetectionService {
  /**
   * 检测用户意图
   */
  detectIntent(
    content: string,
    metadata?: Record<string, unknown>,
  ): IntentDetectionResult;

  /**
   * 根据意图选择上下文策略
   */
  selectStrategy(intent: UserIntent): ContextStrategy;

  /**
   * 更新配置
   */
  updateConfig(config: Partial<IntentDetectionConfig>): void;
}

/**
 * 迭代管理服务接口
 */
export interface IIterationManagerService {
  /**
   * 执行迭代请求
   */
  executeIteration(
    request: IterationRequest,
    context: ResearchContext,
  ): Promise<IterationResult>;

  /**
   * 获取输出版本历史
   */
  getVersionHistory(outputId: string): Promise<StructuredOutput[]>;

  /**
   * 比较两个版本的差异
   */
  compareVersions(
    outputId: string,
    version1: number,
    version2: number,
  ): Promise<{
    added: OutputSection[];
    removed: OutputSection[];
    modified: Array<{
      sectionId: string;
      before: string;
      after: string;
    }>;
  }>;

  /**
   * 获取或创建研究上下文
   */
  getOrCreateResearchContext(topic: string): Promise<ResearchContext>;

  /**
   * 更新研究上下文
   */
  updateResearchContext(
    contextId: string,
    updates: Partial<ResearchContext>,
  ): Promise<ResearchContext>;
}
