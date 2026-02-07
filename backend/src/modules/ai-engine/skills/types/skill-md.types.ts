/**
 * AI Engine - SKILL.md Type Definitions
 *
 * SKILL.md 格式的类型定义，完全兼容 Claude Code Skills 官方格式
 * 同时支持我们的扩展字段，实现最大兼容性和扩展性
 *
 * @see https://code.claude.com/docs/en/skills.md
 */

import type { TaskProfile } from "../../llm/types";

/**
 * Skill 来源类型
 */
export type SkillSource = "local" | "skillsmp" | "custom-url";

/**
 * Skill 领域类型
 */
export type SkillDomain =
  | "writing" // 写作领域
  | "research" // 研究领域
  | "office" // 文档/PPT 领域
  | "simulation" // 模拟领域
  | "general" // 通用领域
  | string; // 允许自定义领域

/**
 * Skill 上下文模式（Claude Code 官方）
 */
export type SkillContextMode = "fork" | "shared";

/**
 * Skill Agent 类型（Claude Code 官方）
 */
export type SkillAgentType = "general-purpose" | "code" | "research" | string;

/**
 * Skill 钩子定义（Claude Code 官方）
 */
export interface SkillHooks {
  /** 工具调用前钩子 */
  PreToolUse?: string[];
  /** 工具调用后钩子 */
  PostToolUse?: string[];
  /** 停止时钩子 */
  Stop?: string[];
}

/**
 * SKILL.md 文件的 Frontmatter 元数据
 *
 * 完全兼容 Claude Code 官方字段，同时支持我们的扩展
 *
 * ## Claude Code 官方字段
 * - name: 必需，小写+连字符
 * - description: 必需，触发条件描述
 * - allowed-tools: 可选，限制可用工具
 * - model: 可选，指定模型
 * - context: 可选，fork = 隔离上下文
 * - agent: 可选，配合 context 使用
 * - hooks: 可选，生命周期钩子
 * - user-invocable: 可选，是否显示在菜单
 *
 * ## 我们的扩展字段
 * - id: 别名，等同于 name
 * - version: 版本号
 * - domain: 领域分类
 * - tags: 标签
 * - taskTypes: 任务类型匹配
 * - priority: 优先级
 */
export interface SkillMdFrontmatter {
  // ========== Claude Code 官方字段 ==========

  /**
   * Skill 名称（Claude Code 官方必需字段）
   * 小写字母、数字、连字符，最大 64 字符
   * 应与目录名匹配
   */
  name: string;

  /**
   * Skill 描述（Claude Code 官方必需字段）
   * 描述能力和触发条件，最大 1024 字符
   * 这是 Claude 自动选择使用 Skill 的关键
   */
  description: string;

  /**
   * 限制可用的工具（Claude Code 官方可选字段）
   * 例如: ['Read', 'Grep', 'Glob'] 表示只读操作
   * 支持 YAML 数组或逗号分隔字符串
   */
  allowedTools?: string[];

  /**
   * 指定模型（Claude Code 官方可选字段）
   * 若省略则使用当前对话模型
   */
  model?: string;

  /**
   * 上下文模式（Claude Code 官方可选字段）
   * 'fork' = 在隔离的子 Agent 上下文中运行
   */
  context?: SkillContextMode;

  /**
   * Agent 类型（Claude Code 官方可选字段）
   * 与 context: fork 一起使用
   */
  agent?: SkillAgentType;

  /**
   * 生命周期钩子（Claude Code 官方可选字段）
   */
  hooks?: SkillHooks;

  /**
   * 是否在斜线菜单中显示（Claude Code 官方可选字段）
   * 默认 true
   */
  userInvocable?: boolean;

  /**
   * 阻止 Claude 通过 Skill 工具调用（Claude Code 官方可选字段）
   * 但允许自动发现
   */
  disableModelInvocation?: boolean;

  /**
   * 参数提示（Claude Code 官方可选字段）
   * 在斜线菜单中显示的参数格式提示
   * 例如: "[file] [options]", "[PR number]"
   */
  argumentHint?: string;

  // ========== 我们的扩展字段 ==========

  /**
   * 唯一标识符（我们的扩展，等同于 name）
   * 为了向后兼容保留，解析时 id = id || name
   */
  id: string;

  /** 版本号（语义化版本） */
  version: string;

  /** 所属领域 */
  domain: SkillDomain;

  /** 标签列表 */
  tags: string[];

  /**
   * 适用的任务类型
   * 用于精确匹配，'*' 表示匹配所有任务
   */
  taskTypes: string[];

  /**
   * 优先级（数字越大越优先）
   * 默认 5，范围 0-100
   */
  priority: number;

  /** 作者 */
  author?: string;

  /** 来源 */
  source: SkillSource;

  /** 远程 URL（当 source 为 skillsmp 或 custom-url 时） */
  sourceUrl?: string;

  /** 依赖的其他 Skills */
  dependencies?: string[];

  /** 最后更新时间 */
  updatedAt?: string;

  /** 是否启用 */
  enabled?: boolean;

  /**
   * Token 预算（估算的 token 消耗）
   * 用于优化加载策略
   */
  tokenBudget?: number;
}

/**
 * 原始 Frontmatter（解析时使用，支持 Claude Code 字段别名）
 * 同时支持 kebab-case（Claude Code 官方）和 camelCase（我们的扩展）
 */
export interface RawSkillMdFrontmatter {
  // Claude Code 官方字段（kebab-case）
  name?: string;
  description?: string;
  "allowed-tools"?: string[] | string;
  model?: string;
  context?: SkillContextMode;
  agent?: SkillAgentType;
  hooks?: SkillHooks;
  "user-invocable"?: boolean;
  "disable-model-invocation"?: boolean;
  "argument-hint"?: string;

  // Claude Code 字段的 camelCase 别名（用于我们的 SKILL.md 格式）
  allowedTools?: string[] | string;
  userInvocable?: boolean;
  disableModelInvocation?: boolean;
  argumentHint?: string;

  // 我们的扩展字段
  id?: string;
  version?: string;
  domain?: SkillDomain;
  tags?: string[];
  taskTypes?: string[];
  priority?: number;
  author?: string;
  source?: SkillSource;
  sourceUrl?: string;
  dependencies?: string[];
  updatedAt?: string;
  enabled?: boolean;
  tokenBudget?: number;
}

/**
 * 解析后的 SKILL.md 完整定义
 */
export interface SkillMdDefinition {
  /** Frontmatter 元数据 */
  metadata: SkillMdFrontmatter;

  /** Markdown 内容（System Prompt 部分） */
  content: string;

  /** 原始文件路径（本地 Skills） */
  filePath?: string;

  /** 加载时间 */
  loadedAt: Date;

  /** 内容的 hash（用于缓存验证） */
  contentHash?: string;
}

/**
 * Skill 搜索结果（用于 SkillsMP）
 */
export interface SkillSearchResult {
  /** Skill ID */
  id: string;

  /** 名称 */
  name: string;

  /** 描述 */
  description: string;

  /** 作者 */
  author: string;

  /** 下载次数 */
  downloads?: number;

  /** 评分 */
  rating?: number;

  /** 标签 */
  tags: string[];

  /** 最后更新时间 */
  updatedAt: string;

  /** 预览 URL */
  previewUrl?: string;
}

/**
 * Skill 过滤器
 */
export interface SkillFilters {
  /** 按领域过滤 */
  domain?: SkillDomain;

  /** 按标签过滤 */
  tags?: string[];

  /** 按作者过滤 */
  author?: string;

  /** 最小评分 */
  minRating?: number;

  /** 排序方式 */
  sortBy?: "downloads" | "rating" | "updatedAt" | "name";

  /** 排序方向 */
  sortOrder?: "asc" | "desc";

  /** 分页 */
  limit?: number;
  offset?: number;
}

/**
 * Skill 更新信息
 */
export interface SkillUpdateInfo {
  /** Skill ID */
  skillId: string;

  /** 当前版本 */
  currentVersion: string;

  /** 最新版本 */
  latestVersion: string;

  /** 是否有更新 */
  hasUpdate: boolean;

  /** 更新日志 */
  changelog?: string;
}

/**
 * Skill 缓存项
 */
export interface SkillCacheItem {
  /** Skill 定义 */
  skill: SkillMdDefinition;

  /** 缓存时间 */
  cachedAt: Date;

  /** 过期时间 */
  expiresAt: Date;

  /** 命中次数 */
  hitCount: number;
}

/**
 * 按任务类型获取 Skills 的选项
 */
export interface GetSkillsOptions {
  /** 任务类型 */
  taskType: string;

  /** 领域 */
  domain: SkillDomain;

  /** 额外指定的 Skill IDs */
  additionalSkillIds?: string[];

  /** 最大 Token 预算 */
  maxTokenBudget?: number;

  /** 是否包含远程 Skills */
  includeRemote?: boolean;

  /** Description 模糊匹配查询（Claude Code 风格） */
  query?: string;
}

/**
 * chatWithSkills 请求参数
 */
export interface ChatWithSkillsRequest {
  /** 消息列表 */
  messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }>;

  /** 任务类型，用于自动选择 Skills */
  taskType: string;

  /** 领域 */
  domain: SkillDomain;

  /** 额外指定的 Skill IDs */
  additionalSkills?: string[];

  /** 传递给 Skill 的上下文变量 */
  skillContext?: Record<string, unknown>;

  /** 任务画像（统一类型定义） */
  taskProfile: TaskProfile;

  /** 模型类型 */
  modelType?: string;

  /** 直接指定模型 */
  model?: string;

  /** 最大 Token 数 */
  maxTokens?: number;

  /** 温度 */
  temperature?: number;

  /** 严格模式 */
  strictMode?: boolean;
}

/**
 * chatWithSkills 响应
 */
export interface ChatWithSkillsResponse {
  /** 响应内容 */
  content: string;

  /** 使用的模型 */
  model: string;

  /** 使用的 Token 数 */
  tokensUsed: number;

  /** 是否为错误响应 */
  isError?: boolean;

  /** 使用的 Skills */
  usedSkills: string[];

  /** Skills System Prompt 的 Token 消耗 */
  skillsTokensUsed: number;

  /** Skills 应用元数据（扩展） */
  skillsMetadata?: {
    /** 可用 Skills 总数 */
    totalAvailable: number;
    /** 实际使用的 Skills 数 */
    totalUsed: number;
    /** 被跳过的 Skills（因 Token 限制） */
    skipped: string[];
    /** 是否被裁剪 */
    wasTrimmed: boolean;
  };
}

/**
 * Skill 来源接口（扩展性设计）
 */
export interface SkillSourceProvider {
  /** 来源名称 */
  name: string;

  /** 优先级（数字越大越优先） */
  priority: number;

  /** 加载所有 Skills */
  loadSkills(): Promise<SkillMdDefinition[]>;

  /** 按 ID 获取 Skill */
  getSkillById?(id: string): Promise<SkillMdDefinition | null>;

  /** 监听变化（热重载） */
  watchChanges?(callback: () => void): void;
}
