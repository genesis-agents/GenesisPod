/**
 * AI Engine - SKILL.md Type Definitions
 *
 * SKILL.md 格式的类型定义，兼容 Claude Code Skills 格式
 * 支持 YAML frontmatter + Markdown 内容
 */

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
 * SKILL.md 文件的 Frontmatter 元数据
 */
export interface SkillMdFrontmatter {
  /** 唯一标识符 */
  id: string;

  /** 显示名称 */
  name: string;

  /** 版本号 */
  version: string;

  /** 所属领域 */
  domain: SkillDomain;

  /** 标签列表 */
  tags: string[];

  /** 适用的任务类型 */
  taskTypes: string[];

  /** 优先级（数字越大越优先） */
  priority: number;

  /** 作者 */
  author?: string;

  /** 来源 */
  source: SkillSource;

  /** 远程 URL（当 source 为 skillsmp 或 custom-url 时） */
  sourceUrl?: string;

  /** 描述 */
  description?: string;

  /** 依赖的其他 Skills */
  dependencies?: string[];

  /** 最后更新时间 */
  updatedAt?: string;

  /** 是否启用 */
  enabled?: boolean;

  /** Token 预算（估算的 token 消耗） */
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

  /** 任务画像 */
  taskProfile: {
    creativity?: "deterministic" | "low" | "medium" | "high";
    outputLength?:
      | "minimal"
      | "short"
      | "medium"
      | "standard"
      | "long"
      | "extended";
    responseFormat?: "text" | "json" | "markdown";
  };

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
}
