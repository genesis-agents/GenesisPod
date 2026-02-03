/**
 * Data Source Router Service
 * 数据源路由服务 - 智能选择和获取数据
 */

import { Injectable, Logger, Optional } from "@nestjs/common";
import {
  IDataSource,
  IDataSourceRouter,
  DataSourceType,
  DataFetchRequest,
  DataFetchResult,
  DataItem,
} from "../abstractions/data-source.interface";
import { DataCacheService } from "./data-cache.service";

/**
 * 数据源路由服务
 * 负责管理多个数据源，智能选择最优数据源组合并获取数据
 */
@Injectable()
export class DataSourceRouterService implements IDataSourceRouter {
  private readonly logger = new Logger(DataSourceRouterService.name);
  private readonly sources = new Map<DataSourceType, IDataSource>();

  constructor(@Optional() private readonly cache?: DataCacheService) {}

  /**
   * 注册数据源
   */
  registerSource(source: IDataSource): void {
    if (this.sources.has(source.type)) {
      this.logger.warn(
        `Data source ${source.type} already registered, replacing...`,
      );
    }
    this.sources.set(source.type, source);
    this.logger.log(`Registered data source: ${source.type}`);
  }

  /**
   * 注销数据源
   */
  unregisterSource(type: DataSourceType): boolean {
    const result = this.sources.delete(type);
    if (result) {
      this.logger.log(`Unregistered data source: ${type}`);
    }
    return result;
  }

  /**
   * 智能获取数据
   */
  async fetch(request: DataFetchRequest): Promise<DataFetchResult> {
    const startTime = Date.now();

    // ★ 缓存检查
    if (this.cache) {
      const cached = this.cache.getFetchResult(request);
      if (cached) {
        this.logger.debug(`Cache hit for query: ${request.query}`);
        return cached;
      }
    }

    // 1. 选择数据源
    const selectedSources = await this.selectSources(request);

    if (selectedSources.length === 0) {
      this.logger.warn(
        `No suitable data sources found for query: ${request.query}`,
      );
      return {
        items: [],
        metadata: {
          totalCount: 0,
          sources: [],
          fetchedAt: new Date(),
          queryTime: Date.now() - startTime,
        },
      };
    }

    this.logger.debug(
      `Selected sources for query "${request.query}": ${selectedSources.map((s) => s.type).join(", ")}`,
    );

    // 2. 并行获取数据
    const results = await Promise.allSettled(
      selectedSources.map((source) => this.fetchFromSource(source, request)),
    );

    // 3. 合并结果
    const items: DataItem[] = [];
    const usedSources: DataSourceType[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const source = selectedSources[i];

      if (result.status === "fulfilled") {
        items.push(...result.value);
        usedSources.push(source.type);
        this.logger.debug(
          `Source ${source.type} returned ${result.value.length} items`,
        );
      } else {
        this.logger.warn(`Data source ${source.type} failed: ${result.reason}`);
      }
    }

    // 4. 去重
    const deduplicatedItems =
      request.options?.deduplication !== false
        ? this.deduplicateItems(items)
        : items;

    // 5. 按相关性排序
    const sortedItems = this.sortByRelevance(deduplicatedItems);

    // 6. 限制结果数量
    const maxResults = request.options?.maxResults ?? 50;
    const limitedItems = sortedItems.slice(0, maxResults);

    const queryTime = Date.now() - startTime;
    this.logger.log(
      `Fetch completed: ${limitedItems.length} items from ${usedSources.length} sources in ${queryTime}ms`,
    );

    const result: DataFetchResult = {
      items: limitedItems,
      metadata: {
        totalCount: limitedItems.length,
        sources: usedSources,
        fetchedAt: new Date(),
        queryTime,
      },
    };

    // ★ 缓存结果
    if (this.cache && limitedItems.length > 0) {
      this.cache.setFetchResult(request, result);
    }

    return result;
  }

  /**
   * 选择最优数据源组合
   * ★ 优化：使用并行检查数据源可用性，避免串行阻塞
   */
  private async selectSources(
    request: DataFetchRequest,
  ): Promise<IDataSource[]> {
    const AVAILABILITY_TIMEOUT = 2000; // 可用性检查超时 2 秒

    // 如果指定了数据源，使用指定的
    if (request.sources?.length) {
      const specifiedSources = request.sources
        .map((type) => this.sources.get(type))
        .filter((s): s is IDataSource => s !== undefined);

      // ★ 并行验证可用性
      const availabilityChecks = specifiedSources.map(async (source) => {
        try {
          const isAvailable = await Promise.race([
            source.isAvailable(),
            new Promise<boolean>((resolve) =>
              setTimeout(() => resolve(false), AVAILABILITY_TIMEOUT),
            ),
          ]);
          return isAvailable ? source : null;
        } catch (error) {
          this.logger.warn(
            `Failed to check availability for ${source.type}: ${error}`,
          );
          return null;
        }
      });

      const results = await Promise.all(availabilityChecks);
      return results.filter((s): s is IDataSource => s !== null);
    }

    // ★ 并行评估所有数据源
    const sourceArray = Array.from(this.sources.values());
    const evaluationPromises = sourceArray.map(async (source) => {
      try {
        // 带超时的可用性检查
        const isAvailable = await Promise.race([
          source.isAvailable(),
          new Promise<boolean>((resolve) =>
            setTimeout(() => resolve(false), AVAILABILITY_TIMEOUT),
          ),
        ]);

        if (!isAvailable) {
          return null;
        }

        // 评估相关性
        const relevanceScore = source.evaluateRelevance(
          request.query,
          request.context,
        );

        if (relevanceScore > 0.3) {
          return { source, score: relevanceScore };
        }
        return null;
      } catch (error) {
        this.logger.warn(`Failed to evaluate source ${source.type}: ${error}`);
        return null;
      }
    });

    const candidates = (await Promise.all(evaluationPromises)).filter(
      (c): c is { source: IDataSource; score: number } => c !== null,
    );

    // 按评分排序，取前 3 个
    return candidates
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((c) => c.source);
  }

  /**
   * 从单个数据源获取数据
   */
  private async fetchFromSource(
    source: IDataSource,
    request: DataFetchRequest,
  ): Promise<DataItem[]> {
    const timeout = source.config.timeout ?? 10000;

    return Promise.race([
      source.fetch(request),
      new Promise<DataItem[]>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(`Source ${source.type} timeout after ${timeout}ms`),
            ),
          timeout,
        ),
      ),
    ]);
  }

  /**
   * 去重
   * 基于 URL 或标题+来源进行去重
   */
  private deduplicateItems(items: DataItem[]): DataItem[] {
    const seen = new Set<string>();
    const result: DataItem[] = [];

    for (const item of items) {
      // 优先使用 URL 作为唯一标识
      const key = item.url || `${item.title}-${item.source}`;

      if (!seen.has(key)) {
        seen.add(key);
        result.push(item);
      }
    }

    return result;
  }

  /**
   * 按相关性排序
   */
  private sortByRelevance(items: DataItem[]): DataItem[] {
    return [...items].sort(
      (a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0),
    );
  }

  /**
   * 获取可用数据源
   */
  getAvailableSources(): DataSourceType[] {
    return Array.from(this.sources.keys());
  }

  /**
   * 获取数据源
   */
  getSource(type: DataSourceType): IDataSource | undefined {
    return this.sources.get(type);
  }

  /**
   * 检查数据源是否已注册
   */
  hasSource(type: DataSourceType): boolean {
    return this.sources.has(type);
  }

  /**
   * 获取所有数据源的状态
   */
  async getSourcesStatus(): Promise<
    Array<{
      type: DataSourceType;
      available: boolean;
      priority: number;
    }>
  > {
    const statuses: Array<{
      type: DataSourceType;
      available: boolean;
      priority: number;
    }> = [];

    for (const [type, source] of this.sources) {
      try {
        const available = await source.isAvailable();
        statuses.push({
          type,
          available,
          priority: source.config.priority,
        });
      } catch {
        statuses.push({
          type,
          available: false,
          priority: source.config.priority,
        });
      }
    }

    return statuses.sort((a, b) => b.priority - a.priority);
  }
}
