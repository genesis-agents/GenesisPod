/**
 * Memory Interface
 * 记忆系统接口定义
 */

/**
 * 记忆存储接口
 * 所有记忆存储都必须实现此接口
 */
export interface IMemoryStore {
  /**
   * 获取记忆
   * @param key 键名
   * @returns 存储的值，不存在则返回 undefined
   */
  get(key: string): Promise<unknown>;

  /**
   * 设置记忆
   * @param key 键名
   * @param value 值
   * @param ttl 过期时间（秒），可选
   */
  set(key: string, value: unknown, ttl?: number): Promise<void>;

  /**
   * 删除记忆
   * @param key 键名
   * @returns 是否删除成功
   */
  delete(key: string): Promise<boolean>;

  /**
   * 清空所有记忆
   */
  clear(): Promise<void>;
}

/**
 * 记忆项元数据
 */
export interface MemoryMetadata {
  /**
   * 创建时间
   */
  createdAt: Date;

  /**
   * 更新时间
   */
  updatedAt: Date;

  /**
   * 过期时间（可选）
   */
  expiresAt?: Date;

  /**
   * 重要程度 (0-10)
   */
  importance?: number;

  /**
   * 标签
   */
  tags?: string[];

  /**
   * 自定义元数据
   */
  custom?: Record<string, unknown>;
}

/**
 * 记忆项
 */
export interface MemoryItem {
  /**
   * 键名
   */
  key: string;

  /**
   * 值
   */
  value: unknown;

  /**
   * 元数据
   */
  metadata: MemoryMetadata;
}

/**
 * 长期记忆存储接口
 * 扩展基础存储接口，支持高级查询功能
 */
export interface ILongTermMemoryStore extends IMemoryStore {
  /**
   * 搜索记忆（支持语义搜索）
   * @param query 搜索关键词
   * @param options 搜索选项
   * @returns 匹配的记忆列表
   */
  search(
    query: string,
    options?: SearchOptions,
  ): Promise<MemorySearchResult[]>;

  /**
   * 获取记忆列表
   * @param options 过滤和排序选项
   * @returns 记忆列表
   */
  list(options?: ListOptions): Promise<MemoryItem[]>;

  /**
   * 更新记忆元数据
   * @param key 键名
   * @param metadata 元数据更新
   */
  updateMetadata(
    key: string,
    metadata: Partial<MemoryMetadata>,
  ): Promise<void>;
}

/**
 * 搜索选项
 */
export interface SearchOptions {
  /**
   * 最大结果数
   */
  limit?: number;

  /**
   * 最小相似度阈值 (0-1)
   */
  threshold?: number;

  /**
   * 标签过滤
   */
  tags?: string[];

  /**
   * 类型过滤
   */
  type?: string;
}

/**
 * 搜索结果
 */
export interface MemorySearchResult extends MemoryItem {
  /**
   * 相似度分数 (0-1)
   */
  score: number;
}

/**
 * 列表选项
 */
export interface ListOptions {
  /**
   * 偏移量
   */
  offset?: number;

  /**
   * 限制数量
   */
  limit?: number;

  /**
   * 排序字段
   */
  sortBy?: "createdAt" | "updatedAt" | "importance";

  /**
   * 排序方向
   */
  sortOrder?: "asc" | "desc";

  /**
   * 标签过滤
   */
  tags?: string[];

  /**
   * 类型过滤
   */
  type?: string;
}
