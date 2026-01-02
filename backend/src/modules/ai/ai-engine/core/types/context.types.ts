/**
 * AI Engine - Context Types
 * 执行上下文类型定义
 */

import { Id, JsonObject, RetryConfig, TimeoutConfig } from './common.types';

/**
 * 基础上下文
 * 所有执行上下文的基类
 */
export interface BaseContext {
  /**
   * 执行 ID
   */
  executionId: string;

  /**
   * 请求 ID（用于追踪）
   */
  requestId?: string;

  /**
   * 用户 ID
   */
  userId?: string;

  /**
   * 会话 ID
   */
  sessionId?: string;

  /**
   * 租户 ID（多租户场景）
   */
  tenantId?: string;

  /**
   * 取消信号
   */
  signal?: AbortSignal;

  /**
   * 超时配置
   */
  timeout?: TimeoutConfig;

  /**
   * 重试配置
   */
  retry?: RetryConfig;

  /**
   * 元数据
   */
  metadata?: JsonObject;

  /**
   * 创建时间
   */
  createdAt: Date;
}

/**
 * 工具执行上下文
 */
export interface ToolContext extends BaseContext {
  /**
   * 工具 ID
   */
  toolId: string;

  /**
   * 调用者 ID（Agent 或 Skill）
   */
  callerId?: string;

  /**
   * 调用者类型
   */
  callerType?: 'agent' | 'skill' | 'direct';

  /**
   * 输入 Schema
   */
  inputSchema?: JsonObject;

  /**
   * 输出 Schema
   */
  outputSchema?: JsonObject;

  /**
   * 当前重试次数
   */
  retryCount?: number;

  /**
   * 是否为沙箱模式
   */
  sandbox?: boolean;
}

/**
 * 技能执行上下文
 */
export interface SkillContext extends BaseContext {
  /**
   * 技能 ID
   */
  skillId: string;

  /**
   * 所属领域
   */
  domain?: string;

  /**
   * 调用者 ID（Agent）
   */
  callerId?: string;

  /**
   * 可用工具列表
   */
  availableTools?: string[];

  /**
   * 可用技能列表
   */
  availableSkills?: string[];

  /**
   * 共享状态
   */
  sharedState?: JsonObject;

  /**
   * 转换为工具上下文
   */
  toToolContext?(toolId: string): ToolContext;
}

/**
 * Agent 执行上下文
 */
export interface AgentContext extends BaseContext {
  /**
   * Agent ID
   */
  agentId: string;

  /**
   * 执行模式
   */
  executionMode?: ExecutionMode;

  /**
   * 可用工具列表
   */
  availableTools?: string[];

  /**
   * 可用技能列表
   */
  availableSkills?: string[];

  /**
   * 最大迭代次数
   */
  maxIterations?: number;

  /**
   * 最大工具调用次数
   */
  maxToolCalls?: number;

  /**
   * 对话历史
   */
  conversationHistory?: ConversationMessage[];

  /**
   * 记忆存储
   */
  memory?: MemoryStore;

  /**
   * 共享状态
   */
  sharedState?: JsonObject;

  /**
   * 转换为技能上下文
   */
  toSkillContext?(skillId: string): SkillContext;
}

/**
 * 执行模式
 */
export type ExecutionMode = 'plan-based' | 'reactive' | 'hybrid';

/**
 * 对话消息
 */
export interface ConversationMessage {
  /**
   * 角色
   */
  role: 'system' | 'user' | 'assistant' | 'function' | 'tool';

  /**
   * 内容
   */
  content: string | null;

  /**
   * 工具调用（assistant 消息）
   */
  toolCalls?: ToolCall[];

  /**
   * 工具调用 ID（tool 消息）
   */
  toolCallId?: string;

  /**
   * 函数名称（function 消息，已弃用）
   */
  name?: string;

  /**
   * 时间戳
   */
  timestamp?: Date;
}

/**
 * 工具调用
 */
export interface ToolCall {
  /**
   * 调用 ID
   */
  id: string;

  /**
   * 类型
   */
  type: 'function';

  /**
   * 函数信息
   */
  function: {
    /**
     * 函数名称
     */
    name: string;

    /**
     * 参数（JSON 字符串）
     */
    arguments: string;
  };
}

/**
 * 记忆存储接口（简化版）
 */
export interface MemoryStore {
  /**
   * 获取值
   */
  get(key: string): Promise<unknown>;

  /**
   * 设置值
   */
  set(key: string, value: unknown, ttl?: number): Promise<void>;

  /**
   * 删除值
   */
  delete(key: string): Promise<boolean>;

  /**
   * 清空
   */
  clear(): Promise<void>;
}

/**
 * 编排执行上下文
 */
export interface OrchestrationContext extends BaseContext {
  /**
   * 工作流 ID
   */
  workflowId: string;

  /**
   * 当前步骤 ID
   */
  currentStepId?: string;

  /**
   * 步骤结果映射
   */
  stepResults: Map<string, unknown>;

  /**
   * 步骤状态映射
   */
  stepStatus: Map<string, StepStatus>;

  /**
   * 全局变量
   */
  variables: JsonObject;

  /**
   * 检查点管理器
   */
  checkpointManager?: CheckpointManager;
}

/**
 * 步骤状态
 */
export type StepStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'cancelled';

/**
 * 检查点管理器接口（简化版）
 */
export interface CheckpointManager {
  /**
   * 创建检查点
   */
  create(type: string, state: JsonObject): Promise<string>;

  /**
   * 恢复检查点
   */
  restore(checkpointId: string): Promise<JsonObject>;

  /**
   * 列出检查点
   */
  list(): Promise<CheckpointInfo[]>;
}

/**
 * 检查点信息
 */
export interface CheckpointInfo {
  /**
   * 检查点 ID
   */
  id: string;

  /**
   * 类型
   */
  type: string;

  /**
   * 创建时间
   */
  createdAt: Date;

  /**
   * 元数据
   */
  metadata?: JsonObject;
}

/**
 * 上下文工厂
 */
export interface ContextFactory {
  /**
   * 创建基础上下文
   */
  createBase(options?: Partial<BaseContext>): BaseContext;

  /**
   * 创建工具上下文
   */
  createToolContext(toolId: string, options?: Partial<ToolContext>): ToolContext;

  /**
   * 创建技能上下文
   */
  createSkillContext(skillId: string, options?: Partial<SkillContext>): SkillContext;

  /**
   * 创建 Agent 上下文
   */
  createAgentContext(agentId: string, options?: Partial<AgentContext>): AgentContext;
}
