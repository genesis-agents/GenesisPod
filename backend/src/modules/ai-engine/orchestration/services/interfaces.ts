/**
 * AI Engine Orchestration Services - Interfaces
 * AI 引擎编排服务接口定义
 *
 * 这些接口定义了从 AI Teams 下沉到 AI Engine 的核心能力
 */

// ==================== 通用类型 ====================

/**
 * AI 调用函数类型
 * 用于依赖注入，允许上层传入带上下文的 AI 调用实现
 */
export type AiCallerFn = (
  model: string,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  options?: { maxTokens?: number; temperature?: number },
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
  /** 是否启用搜索增强 */
  enableSearch?: boolean;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 重试初始延迟（毫秒） */
  retryInitialDelay?: number;
  /** 超时时间（毫秒） */
  timeout?: number;
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
