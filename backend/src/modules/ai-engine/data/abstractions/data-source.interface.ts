/**
 * Data Source Interface
 * 数据源抽象接口
 */

/**
 * 数据源类型
 */
export type DataSourceType =
  | "web-search" // Google/Bing 搜索
  | "news" // 新闻 API
  | "academic" // 学术论文 (arXiv, PubMed)
  | "financial" // 财务数据 API
  | "social" // 社交媒体
  | "internal" // 内部知识库
  | "custom"; // 自定义源

/**
 * 数据源配置
 */
export interface DataSourceConfig {
  type: DataSourceType;
  priority: number; // 优先级 (1-10)
  maxResults?: number; // 最大结果数
  timeout?: number; // 超时时间 (ms)
  enabled?: boolean; // 是否启用
  credentials?: {
    // 凭证配置
    apiKey?: string;
    endpoint?: string;
  };
}

/**
 * 数据获取请求
 */
export interface DataFetchRequest {
  query: string; // 查询内容
  sources?: DataSourceType[]; // 指定数据源
  context?: {
    // 上下文信息
    domain?: string; // 领域 (research, writing)
    taskType?: string; // 任务类型
    locale?: string; // 语言/地区
  };
  filters?: {
    // 过滤条件
    dateRange?: { start: Date; end: Date };
    domains?: string[]; // 限定域名
    excludeDomains?: string[]; // 排除域名
  };
  options?: {
    maxResults?: number;
    includeMetadata?: boolean;
    deduplication?: boolean;
  };
}

/**
 * 数据获取结果
 */
export interface DataFetchResult {
  items: DataItem[];
  metadata: {
    totalCount: number;
    sources: DataSourceType[];
    fetchedAt: Date;
    queryTime: number; // 查询耗时 (ms)
  };
}

/**
 * 单条数据项
 */
export interface DataItem {
  id: string;
  source: DataSourceType;
  title: string;
  content: string;
  url?: string;
  publishedAt?: Date;
  author?: string;
  relevanceScore?: number; // 相关性评分 (0-1)
  metadata?: Record<string, unknown>;
}

/**
 * 数据源接口
 */
export interface IDataSource {
  readonly type: DataSourceType;
  readonly config: DataSourceConfig;

  /**
   * 检查数据源是否可用
   */
  isAvailable(): Promise<boolean>;

  /**
   * 获取数据
   */
  fetch(request: DataFetchRequest): Promise<DataItem[]>;

  /**
   * 评估查询与此数据源的匹配度
   * @returns 0-1 之间的评分
   */
  evaluateRelevance(
    query: string,
    context?: DataFetchRequest["context"],
  ): number;
}

/**
 * 数据源路由器接口
 */
export interface IDataSourceRouter {
  /**
   * 注册数据源
   */
  registerSource(source: IDataSource): void;

  /**
   * 获取数据
   */
  fetch(request: DataFetchRequest): Promise<DataFetchResult>;

  /**
   * 获取可用数据源
   */
  getAvailableSources(): DataSourceType[];
}
