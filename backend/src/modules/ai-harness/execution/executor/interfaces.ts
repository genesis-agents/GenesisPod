/**
 * AI Engine Orchestration Services - Interfaces
 * AI 引擎编排服务接口定义
 *
 * 这些接口定义了从 AI Teams 下沉到 AI Engine 的核心能力
 */

// ==================== 通用类型 ====================

import { TaskProfile } from "../../../ai-engine/llm/types";

// 2026-05-01 (PR-X-M2): AiCallerFn 已搬到 ai-engine/llm/types/ai-caller.types.ts
// （L2 LLM 能力概念）。此处 import + re-export 保 ai-harness 内部既有 import 路径稳定。
import type { AiCallerFn as AiCallerFnImpl } from "../../../ai-engine/llm/types/ai-caller.types";
export type AiCallerFn = AiCallerFnImpl;

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
// 2026-05-01 (PR-X-M3): 全部类型已搬到 ai-engine/knowledge/extraction/
// context-evolution.types.ts。此处 re-export 保 ai-harness 内部既有 import 路径稳定。
export {
  DEFAULT_CONTEXT_EVOLUTION_CONFIG,
  FACT_CATEGORIES,
  FACT_IMPORTANCE_LEVELS,
} from "../../../ai-engine/knowledge/extraction/context-evolution.types";
export type {
  ContextEvolutionConfig,
  EstablishedFact,
  ContextState,
  FactExtractionRequest,
  FactExtractionResult,
  IContextEvolutionService,
} from "../../../ai-engine/knowledge/extraction/context-evolution.types";

// （上述类型已全部 re-export 自 ai-engine/knowledge/extraction/context-evolution.types）

// ==================== 上下文初始化服务接口（世界观设定） ====================
// 2026-05-01 (PR-X-M3): 全部类型已搬到 ai-engine/knowledge/world-building/
// world-building.types.ts。此处 re-export 保 ai-harness 内部既有 import 路径稳定。
export type {
  WorldSettingsEra,
  WorldSettingsCharacter,
  WorldSettingsFaction,
  WorldSettings,
  ContentType,
  HardConstraint,
  CoreEntity,
  WorldBuildingResult,
  IContextInitializationService,
} from "../../../ai-engine/knowledge/world-building/world-building.types";

// ==================== 约束强制服务接口 ====================
// IConstraintEnforcementService 引用 HardConstraint，需 type-only 引入便于本地用
import type { HardConstraint } from "../../../ai-engine/knowledge/world-building/world-building.types";

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

// IContextInitializationService 已 re-export 自 ai-engine/knowledge/world-building（上方）

// ==================== 上下文压缩服务接口 ====================
// 2026-05-01 (PR-X-M3): 全部类型已搬到 ai-engine/llm/context/context-compression.types.ts。
// 此处 re-export 保 ai-harness 内部既有 import 路径稳定。
export type {
  DataChunk,
  SummaryChunk,
  CompressionResult,
  CompressionOptions,
  IContextCompressionService,
} from "../../../ai-engine/llm/context/context-compression.types";

// ==================== 意图检测服务接口 ====================
// 2026-05-01 (PR-X-M): 5 个意图检测类型已搬到 ai-engine/llm/intent/intent.types.ts
// （L2 LLM 能力层 owned，避免 ai-engine intent-detection.service 反向 import 本文件）。
// 此处 re-export 保 ai-harness 内部既有 import 路径稳定。新代码请 from
// "@/modules/ai-engine/llm/intent/intent.types"（或 ai-harness/facade 间接走也行）。
export {
  UserIntent,
  ContextStrategy,
} from "../../../ai-engine/llm/intent/intent.types";
export type {
  IntentDetectionConfig,
  IntentDetectionResult,
  IIntentDetectionService,
} from "../../../ai-engine/llm/intent/intent.types";

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
