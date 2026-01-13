/**
 * AI Engine Facade Types
 * 统一 API 类型定义
 */

import { AIModelType } from "@prisma/client";

// ==================== 通用类型 ====================

/**
 * 任务画像 - 语义化配置
 * 用于描述任务特征，AI Engine 自动映射到具体参数
 */
export interface TaskProfile {
  /**
   * 创造性等级（可选）
   * - deterministic: 确定性输出（分类、提取、JSON解析）
   * - low: 低创造性（分析、总结）
   * - medium: 中等创造性（对话、研究）
   * - high: 高创造性（创意写作、头脑风暴）
   */
  creativity?: "deterministic" | "low" | "medium" | "high";

  /**
   * 输出长度（可选）
   * - minimal: 最小（分类标签、是否判断）
   * - short: 短（摘要、标题）
   * - medium: 中等（标准分析）
   * - standard: 标准（编辑任务）
   * - long: 长（报告、章节）
   * - extended: 超长（完整文档）
   */
  outputLength?:
    | "minimal"
    | "short"
    | "medium"
    | "standard"
    | "long"
    | "extended";

  /**
   * 响应格式（可选）
   */
  responseFormat?: "text" | "json" | "markdown";
}

// ==================== LLM 能力类型 ====================

/**
 * 聊天消息
 */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  name?: string;
}

/**
 * 聊天请求
 */
export interface ChatRequest {
  /** 消息列表 */
  messages: ChatMessage[];

  /** ★ 推荐：指定模型类型，由 AI Engine 选择具体模型 */
  modelType?: AIModelType;

  /** ★ 推荐：任务画像，AI Engine 自动映射参数 */
  taskProfile?: TaskProfile;

  /** 直接指定模型（不推荐，除非有特殊需求） */
  model?: string;

  /** 直接指定 maxTokens（覆盖 taskProfile） */
  maxTokens?: number;

  /** 直接指定 temperature（覆盖 taskProfile） */
  temperature?: number;

  /** 系统提示词（会自动添加到消息列表） */
  systemPrompt?: string;

  /** 是否启用流式响应 */
  stream?: boolean;

  /** 严格模式：API失败时抛出异常 */
  strictMode?: boolean;
}

/**
 * 聊天响应
 */
export interface ChatResponse {
  /** 响应内容 */
  content: string;

  /** 使用的模型 */
  model: string;

  /** 使用的 token 数 */
  tokensUsed: number;

  /** 是否为错误响应 */
  isError?: boolean;
}

/**
 * 流式响应块
 */
export interface StreamChunk {
  /** 内容片段 */
  content: string;

  /** 是否为最后一块 */
  done: boolean;

  /** 错误信息 */
  error?: string;
}

// ==================== 搜索能力类型 ====================

/**
 * 数据源类型
 */
export type DataSource = "web" | "academic" | "news" | "local" | "github";

/**
 * 搜索请求
 */
export interface SearchRequest {
  /** 搜索查询 */
  query: string;

  /** 数据源（可选，默认自动选择） */
  sources?: DataSource[];

  /** 最大结果数 */
  maxResults?: number;

  /** 时间范围 */
  timeRange?: "day" | "week" | "month" | "year" | "all";

  /** 语言 */
  language?: string;
}

/**
 * 搜索结果项
 */
export interface SearchResultItem {
  /** 标题 */
  title: string;

  /** URL */
  url: string;

  /** 内容摘要 */
  content: string;

  /** 相关性分数 */
  score?: number;

  /** 发布日期 */
  publishedDate?: string;

  /** 域名 */
  domain?: string;

  /** 数据源类型 */
  sourceType?: DataSource;
}

/**
 * 搜索响应
 */
export interface SearchResponse {
  /** 是否成功 */
  success: boolean;

  /** 搜索结果 */
  results: SearchResultItem[];

  /** 错误信息 */
  error?: string;
}

// ==================== Agent 能力类型 ====================

/**
 * Agent 输入
 */
export interface AgentInput {
  /** 任务描述 */
  task: string;

  /** 上下文信息 */
  context?: string;

  /** 可用工具 */
  tools?: string[];

  /** 附加参数 */
  params?: Record<string, unknown>;
}

/**
 * Agent 输出
 */
export interface AgentOutput {
  /** 是否成功 */
  success: boolean;

  /** 输出内容 */
  result: unknown;

  /** 执行步骤 */
  steps?: AgentStep[];

  /** 错误信息 */
  error?: string;

  /** 执行时间（毫秒） */
  executionTime?: number;
}

/**
 * Agent 执行步骤
 */
export interface AgentStep {
  /** 步骤名称 */
  name: string;

  /** 步骤类型 */
  type: "thought" | "action" | "observation";

  /** 内容 */
  content: string;

  /** 时间戳 */
  timestamp: Date;
}

// ==================== 团队能力类型 ====================

/**
 * 团队类型
 */
export type TeamType = "research" | "debate" | "review" | "report" | "custom";

/**
 * 协作模式
 */
export type CollaborationMode = "sequential" | "parallel" | "debate";

/**
 * 团队配置
 */
export interface TeamConfig {
  /** Leader Agent 配置 */
  leader?: {
    role: string;
    systemPrompt?: string;
  };

  /** Member Agent 配置列表 */
  members?: Array<{
    role: string;
    systemPrompt?: string;
    tools?: string[];
  }>;

  /** 协作模式 */
  collaborationMode?: CollaborationMode;

  /** 约束配置 */
  constraints?: ConstraintConfig;
}

/**
 * 任务输入
 */
export interface MissionInput {
  /** 任务目标 */
  goal: string;

  /** 上下文信息 */
  context?: string;

  /** 用户 ID */
  userId?: string;

  /** 会话 ID */
  sessionId?: string;

  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 任务结果
 */
export interface MissionResult {
  /** 是否成功 */
  success: boolean;

  /** 输出内容 */
  output: unknown;

  /** 执行摘要 */
  summary?: string;

  /** 错误信息 */
  error?: string;

  /** 执行时间（毫秒） */
  executionTime?: number;

  /** 使用的 token 数 */
  tokensUsed?: number;
}

/**
 * 进度回调
 */
export type ProgressCallback = (progress: MissionProgress) => void;

/**
 * 任务进度
 */
export interface MissionProgress {
  /** 任务 ID */
  missionId: string;

  /** 阶段 */
  phase: string;

  /** 进度（0-100） */
  progress: number;

  /** 消息 */
  message: string;

  /** 附加数据 */
  data?: unknown;
}

// ==================== 上下文能力类型 ====================

/**
 * 上下文源类型
 */
export type ContextSourceType =
  | "topic"
  | "resource"
  | "memory"
  | "search"
  | "custom";

/**
 * 上下文源
 */
export interface ContextSource {
  /** 源类型 */
  type: ContextSourceType;

  /** 源 ID */
  id?: string;

  /** 直接内容 */
  content?: string;

  /** 权重（用于优先级） */
  weight?: number;
}

/**
 * 构建上下文请求
 */
export interface BuildContextRequest {
  /** 上下文源列表 */
  sources: ContextSource[];

  /** 最大 token 数 */
  maxTokens?: number;

  /** 是否压缩 */
  compress?: boolean;
}

// ==================== 约束能力类型 ====================

/**
 * 约束类型
 */
export type ConstraintType = "token_limit" | "content_filter" | "json_schema";

/**
 * 约束配置
 */
export interface ConstraintConfig {
  /** 最大 token 数 */
  maxTokens?: number;

  /** 最大执行时间（毫秒） */
  maxExecutionTime?: number;

  /** 内容过滤规则 */
  contentFilter?: {
    enabled: boolean;
    rules?: string[];
  };

  /** JSON Schema 验证 */
  jsonSchema?: object;
}

/**
 * 约束检查结果
 */
export interface ConstraintResult {
  /** 是否通过 */
  passed: boolean;

  /** 违规列表 */
  violations?: Array<{
    type: ConstraintType;
    message: string;
  }>;

  /** 调整后的内容（如果有） */
  adjustedContent?: string;
}

// ==================== 模型选择类型 ====================

/**
 * 模型信息
 */
export interface ModelInfo {
  /** 模型 ID */
  id: string;

  /** 显示名称 */
  name: string;

  /** 提供商 */
  provider: string;

  /** 是否为推理模型 */
  isReasoning?: boolean;

  /** 是否可用 */
  isAvailable?: boolean;

  /** 最大 token 数 */
  maxTokens?: number;
}

/**
 * 模型选择选项
 */
export interface ModelSelectionOptions {
  /** 模型类型 */
  modelType?: AIModelType;

  /** 是否需要推理能力 */
  requireReasoning?: boolean;

  /** 首选提供商 */
  preferredProvider?: string;

  /** 最小 maxTokens */
  minMaxTokens?: number;
}

// ==================== Agent 执行类型 ====================

/**
 * Agent 执行请求
 */
export interface AgentExecutionRequest {
  /** Agent 类型或 ID */
  agentType: string;

  /** 任务描述 */
  task: string;

  /** 系统提示词 */
  systemPrompt?: string;

  /** 上下文信息 */
  context?: string;

  /** 使用的模型 */
  model?: string;

  /** 任务画像 */
  taskProfile?: TaskProfile;

  /** 执行配置 */
  config?: {
    maxTokens?: number;
    temperature?: number;
    enableSearch?: boolean;
    maxRetries?: number;
    timeout?: number;
  };

  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * Agent 执行结果
 */
export interface AgentExecutionResult {
  /** 是否成功 */
  success: boolean;

  /** 输出内容 */
  content: string;

  /** Token 使用量 */
  tokensUsed: number;

  /** 执行耗时（毫秒） */
  duration: number;

  /** 错误信息 */
  error?: string;

  /** 是否可重试 */
  retryable?: boolean;

  /** 搜索结果（如果启用） */
  searchResults?: Array<{ title: string; url: string; snippet: string }>;
}

// ==================== Tool 执行类型 ====================

/**
 * Tool 执行请求
 */
export interface ToolExecutionRequest {
  /** 工具 ID */
  toolId: string;

  /** 工具输入参数 */
  input: Record<string, unknown>;

  /** 执行上下文 */
  context?: {
    userId?: string;
    sessionId?: string;
    workspaceId?: string;
  };

  /** 超时时间（毫秒） */
  timeout?: number;
}

/**
 * Tool 执行结果
 */
export interface ToolExecutionResult<T = unknown> {
  /** 是否成功 */
  success: boolean;

  /** 返回数据 */
  data?: T;

  /** 错误信息 */
  error?: {
    code: string;
    message: string;
    retryable?: boolean;
  };

  /** 执行元数据 */
  metadata: {
    executionId: string;
    duration: number;
    tokensUsed?: number;
  };
}

/**
 * 工具信息
 */
export interface ToolInfo {
  /** 工具 ID */
  id: string;

  /** 工具名称 */
  name: string;

  /** 工具描述 */
  description: string;

  /** 工具类别 */
  category: string;

  /** 是否启用 */
  enabled: boolean;

  /** 标签 */
  tags?: string[];
}

// ==================== 记忆能力类型 ====================

/**
 * 记忆类型
 */
export type MemoryType = "short" | "long";

/**
 * 存储记忆请求
 */
export interface StoreMemoryRequest {
  /** 会话 ID */
  sessionId: string;

  /** 内容 */
  content: string;

  /** 记忆类型 */
  type: MemoryType;

  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 检索记忆请求
 */
export interface RetrieveMemoryRequest {
  /** 会话 ID */
  sessionId: string;

  /** 查询（用于相关性检索） */
  query?: string;

  /** 返回数量 */
  topK?: number;
}

/**
 * 记忆项
 */
export interface MemoryItem {
  /** ID */
  id: string;

  /** 内容 */
  content: string;

  /** 记忆类型 */
  type: MemoryType;

  /** 相关性分数 */
  score?: number;

  /** 创建时间 */
  createdAt: Date;

  /** 元数据 */
  metadata?: Record<string, unknown>;
}

// ==================== 工具类别类型 ====================

/**
 * 工具类别
 */
export type ToolCategory =
  | "information"
  | "generation"
  | "processing"
  | "execution"
  | "integration"
  | "memory"
  | "export"
  | "collaboration";
