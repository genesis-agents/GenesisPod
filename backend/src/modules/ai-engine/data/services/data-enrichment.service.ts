/**
 * Data Enrichment Service
 * 数据增强服务 - 丰富原始数据
 */

import { Injectable, Logger, Optional } from "@nestjs/common";
import pLimit from "p-limit";
import {
  IDataEnricher,
  IDataEnrichmentService,
  EnrichmentType,
  EnrichmentOptions,
  EnrichedDataItem,
} from "../abstractions/data-enricher.interface";
import { DataItem } from "../abstractions/data-source.interface";
import { DataCacheService } from "./data-cache.service";

/**
 * 数据增强服务
 * 负责管理多个增强器，对数据进行批量增强
 */
@Injectable()
export class DataEnrichmentService implements IDataEnrichmentService {
  private readonly logger = new Logger(DataEnrichmentService.name);
  private readonly enrichers = new Map<EnrichmentType, IDataEnricher>();
  private readonly defaultConcurrency = 5;

  constructor(@Optional() private readonly cache?: DataCacheService) {}

  /**
   * 注册增强器
   */
  registerEnricher(enricher: IDataEnricher): void {
    if (this.enrichers.has(enricher.type)) {
      this.logger.warn(
        `Enricher ${enricher.type} already registered, replacing...`,
      );
    }
    this.enrichers.set(enricher.type, enricher);
    this.logger.log(`Registered enricher: ${enricher.type}`);
  }

  /**
   * 注销增强器
   */
  unregisterEnricher(type: EnrichmentType): boolean {
    const result = this.enrichers.delete(type);
    if (result) {
      this.logger.log(`Unregistered enricher: ${type}`);
    }
    return result;
  }

  /**
   * 增强数据
   */
  async enrich(
    items: DataItem[],
    options: EnrichmentOptions,
  ): Promise<EnrichedDataItem[]> {
    if (items.length === 0) {
      return [];
    }

    // ★ 缓存检查
    const itemIds = items.map((item) => item.id);
    if (this.cache) {
      const cached = this.cache.getEnrichmentResult(itemIds, options);
      if (cached) {
        this.logger.debug(
          `Cache hit for enrichment of ${itemIds.length} items`,
        );
        return cached;
      }
    }

    const startTime = Date.now();
    const limit = pLimit(this.defaultConcurrency);

    // 过滤出可用的增强器
    const availableEnrichers = await this.getAvailableEnrichersForTypes(
      options.types,
    );

    if (availableEnrichers.length === 0) {
      this.logger.warn(
        `No available enrichers for types: ${options.types.join(", ")}`,
      );
      // 返回未增强的数据
      return items.map((item) => ({
        ...item,
        enrichments: {},
        enrichedAt: new Date(),
      }));
    }

    this.logger.debug(
      `Enriching ${items.length} items with ${availableEnrichers.length} enrichers`,
    );

    // 并发处理
    const tasks = items.map((item) =>
      limit(() => this.enrichItem(item, availableEnrichers, options)),
    );

    const results = await Promise.allSettled(tasks);
    const enrichedItems: EnrichedDataItem[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === "fulfilled") {
        enrichedItems.push(result.value);
      } else {
        // 增强失败时保留原始数据
        this.logger.warn(
          `Failed to enrich item ${items[i].id}: ${result.reason}`,
        );
        enrichedItems.push({
          ...items[i],
          enrichments: {},
          enrichedAt: new Date(),
          enrichmentErrors: [
            {
              type: "content-extraction" as EnrichmentType,
              error: String(result.reason),
            },
          ],
        });
      }
    }

    const duration = Date.now() - startTime;
    this.logger.log(`Enriched ${enrichedItems.length} items in ${duration}ms`);

    // ★ 缓存结果
    if (this.cache && enrichedItems.length > 0) {
      this.cache.setEnrichmentResult(itemIds, options, enrichedItems);
    }

    return enrichedItems;
  }

  /**
   * 增强单条数据
   */
  private async enrichItem(
    item: DataItem,
    enrichers: IDataEnricher[],
    options: EnrichmentOptions,
  ): Promise<EnrichedDataItem> {
    const enrichments: EnrichedDataItem["enrichments"] = {};
    const errors: EnrichedDataItem["enrichmentErrors"] = [];

    for (const enricher of enrichers) {
      try {
        const timeout = options.timeout ?? 30000;
        const result = await Promise.race([
          enricher.enrich(item, options),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error(`Enricher ${enricher.type} timeout`)),
              timeout,
            ),
          ),
        ]);

        Object.assign(enrichments, result);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Enricher ${enricher.type} failed for item ${item.id}: ${errorMessage}`,
        );
        errors.push({
          type: enricher.type,
          error: errorMessage,
        });
      }
    }

    return {
      ...item,
      enrichments,
      enrichedAt: new Date(),
      enrichmentErrors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * 获取指定类型中可用的增强器
   */
  private async getAvailableEnrichersForTypes(
    types: EnrichmentType[],
  ): Promise<IDataEnricher[]> {
    const available: IDataEnricher[] = [];

    for (const type of types) {
      const enricher = this.enrichers.get(type);
      if (!enricher) {
        this.logger.debug(`Enricher ${type} not registered`);
        continue;
      }

      try {
        const isAvailable = await enricher.isAvailable();
        if (isAvailable) {
          available.push(enricher);
        } else {
          this.logger.debug(`Enricher ${type} is not available`);
        }
      } catch (error) {
        this.logger.warn(
          `Failed to check availability for enricher ${type}: ${error}`,
        );
      }
    }

    return available;
  }

  /**
   * 获取可用增强器
   */
  getAvailableEnrichers(): EnrichmentType[] {
    return Array.from(this.enrichers.keys());
  }

  /**
   * 获取增强器
   */
  getEnricher(type: EnrichmentType): IDataEnricher | undefined {
    return this.enrichers.get(type);
  }

  /**
   * 检查增强器是否已注册
   */
  hasEnricher(type: EnrichmentType): boolean {
    return this.enrichers.has(type);
  }

  /**
   * 获取所有增强器的状态
   */
  async getEnrichersStatus(): Promise<
    Array<{
      type: EnrichmentType;
      available: boolean;
    }>
  > {
    const statuses: Array<{
      type: EnrichmentType;
      available: boolean;
    }> = [];

    for (const [type, enricher] of this.enrichers) {
      try {
        const available = await enricher.isAvailable();
        statuses.push({ type, available });
      } catch {
        statuses.push({ type, available: false });
      }
    }

    return statuses;
  }
}
