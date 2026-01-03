/**
 * AI Engine - Skill Interface
 * 技能接口定义
 */

import { ValidationResult, JsonObject } from "../../core";

/**
 * 技能层次
 */
export type SkillLayer =
  | "understanding" // 理解层：意图分析、内容分析
  | "planning" // 规划层：大纲规划、叙事规划
  | "design" // 设计层：页面设计、布局选择
  | "content" // 内容层：内容生成、内容压缩
  | "rendering" // 渲染层：模板渲染、图表渲染
  | "optimization" // 优化层：布局优化、节奏控制
  | "quality" // 质量层：质量审核、场景推导
  | string; // 允许自定义层次

/**
 * 内置技能层次常量
 */
export const SKILL_LAYERS = {
  UNDERSTANDING: "understanding",
  PLANNING: "planning",
  DESIGN: "design",
  CONTENT: "content",
  RENDERING: "rendering",
  OPTIMIZATION: "optimization",
  QUALITY: "quality",
} as const;

/**
 * 技能上下文
 */
export interface SkillContext {
  /**
   * 执行 ID
   */
  executionId: string;

  /**
   * 技能 ID
   */
  skillId: string;

  /**
   * 所属领域
   */
  domain?: string;

  /**
   * 用户 ID
   */
  userId?: string;

  /**
   * 会话 ID
   */
  sessionId?: string;

  /**
   * 调用者 ID（Agent）
   */
  callerId?: string;

  /**
   * 取消信号
   */
  signal?: AbortSignal;

  /**
   * 超时时间
   */
  timeout?: number;

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
   * 元数据
   */
  metadata?: JsonObject;

  /**
   * 创建时间
   */
  createdAt: Date;
}

/**
 * 技能结果
 */
export interface SkillResult<T = unknown> {
  /**
   * 是否成功
   */
  success: boolean;

  /**
   * 返回数据
   */
  data?: T;

  /**
   * 错误信息
   */
  error?: SkillResultError;

  /**
   * 执行元数据
   */
  metadata: SkillResultMetadata;

  /**
   * 是否使用了降级策略
   */
  usedFallback?: boolean;
}

/**
 * 技能结果错误
 */
export interface SkillResultError {
  code: string;
  message: string;
  details?: JsonObject;
  retryable?: boolean;
}

/**
 * 技能结果元数据
 */
export interface SkillResultMetadata {
  executionId: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  tokensUsed?: number;
  toolsCalled?: string[];
  skillsCalled?: string[];
}

/**
 * 前置条件结果
 */
export interface PreconditionResult {
  satisfied: boolean;
  reason?: string;
  missingDependencies?: string[];
}

/**
 * 技能接口
 * Skill = Tool 的高级组合 + 业务领域逻辑
 */
export interface ISkill<TInput = unknown, TOutput = unknown> {
  /**
   * 唯一标识符
   */
  readonly id: string;

  /**
   * 名称
   */
  readonly name: string;

  /**
   * 描述
   */
  readonly description: string;

  /**
   * 所属层次
   */
  readonly layer: SkillLayer;

  /**
   * 所属领域
   */
  readonly domain: string;

  /**
   * 依赖的工具
   */
  readonly requiredTools?: string[];

  /**
   * 依赖的其他技能
   */
  readonly requiredSkills?: string[];

  /**
   * 标签
   */
  readonly tags?: string[];

  /**
   * 版本
   */
  readonly version?: string;

  /**
   * 执行技能
   */
  execute(input: TInput, context: SkillContext): Promise<SkillResult<TOutput>>;

  /**
   * 检查前置条件
   */
  checkPreconditions?(context: SkillContext): Promise<PreconditionResult>;

  /**
   * 获取降级技能
   */
  getFallback?(): ISkill<TInput, TOutput> | null;

  /**
   * 验证输入
   */
  validateInput?(input: TInput): ValidationResult;
}

/**
 * 技能定义（用于注册）
 */
export interface SkillDefinition<TInput = unknown, TOutput = unknown> {
  id: string;
  name: string;
  description: string;
  layer: SkillLayer;
  domain: string;
  requiredTools?: string[];
  requiredSkills?: string[];
  tags?: string[];
  version?: string;
  factory?: () => ISkill<TInput, TOutput>;
}

/**
 * 技能配置
 */
export interface SkillConfig {
  /**
   * 超时时间
   */
  timeout?: number;

  /**
   * LLM 配置
   */
  llm?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  };

  /**
   * 是否启用降级
   */
  enableFallback?: boolean;

  /**
   * 自定义配置
   */
  custom?: JsonObject;
}
