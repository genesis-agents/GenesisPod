import { Injectable, Logger } from "@nestjs/common";
import { RawDataService } from "../rawdata/rawdata.service";

/**
 * MongoDB Compatibility Layer using PostgreSQL
 * Drop-in replacement for MongoDBService
 * All methods delegate to RawDataService with identical API
 */
@Injectable()
export class MongoDBService {
  private readonly logger = new Logger(MongoDBService.name);

  constructor(private rawDataService: RawDataService) {}

  // No-op lifecycle methods (PostgreSQL via Prisma handles connections)
  async onModuleInit() {
    this.logger.log(
      "[MongoDB] PostgreSQL RawData service ready (compatibility mode)",
    );
  }

  async onModuleDestroy() {
    this.logger.log("PostgreSQL connection managed by Prisma");
  }

  /**
   * Get raw data collection (no-op for PostgreSQL)
   */
  getRawDataCollection(): {
    find: () => { toArray: () => Promise<unknown[]> };
    findOne: () => Promise<null>;
    insertOne: () => Promise<{ insertedId: string }>;
    updateOne: () => Promise<{ modifiedCount: number }>;
  } {
    return {
      find: () => ({ toArray: async () => [] }),
      findOne: async () => null,
      insertOne: async () => ({ insertedId: "" }),
      updateOne: async () => ({ modifiedCount: 0 }),
    };
  }

  /**
   * Insert raw data
   */
  async insertRawData(
    source: string,
    data: Record<string, unknown>,
    resourceId?: string,
  ): Promise<string> {
    return this.rawDataService.insertRawData(source, data, resourceId);
  }

  /**
   * Get raw data by ID
   */
  async getRawDataById(id: string): Promise<unknown> {
    return this.rawDataService.getRawDataById(id);
  }

  /**
   * Find raw data by ID (alias)
   */
  async findRawDataById(id: string): Promise<unknown> {
    return this.rawDataService.findRawDataById(id);
  }

  /**
   * Find by external ID
   */
  async findRawDataByExternalId(
    source: string,
    externalId: string,
  ): Promise<unknown> {
    return this.rawDataService.findRawDataByExternalId(source, externalId);
  }

  /**
   * Find across all sources by external ID
   */
  async findRawDataByExternalIdAcrossAllSources(
    externalId: string,
  ): Promise<unknown> {
    return this.rawDataService.findRawDataByExternalIdAcrossAllSources(
      externalId,
    );
  }

  /**
   * Find by title across all sources
   */
  async findRawDataByTitleAcrossAllSources(title: string): Promise<unknown[]> {
    return this.rawDataService.findRawDataByTitleAcrossAllSources(title);
  }

  /**
   * Find by URL across all sources
   */
  async findRawDataByUrlAcrossAllSources(url: string): Promise<unknown> {
    return this.rawDataService.findRawDataByUrlAcrossAllSources(url);
  }

  /**
   * Update raw data
   */
  async updateRawData(
    id: string,
    data: Record<string, unknown>,
    resourceId?: string,
  ): Promise<void> {
    return this.rawDataService.updateRawData(id, data, resourceId);
  }

  /**
   * Link resource to raw data
   */
  async linkResourceToRawData(
    rawDataId: string,
    resourceId: string,
  ): Promise<void> {
    return this.rawDataService.linkResourceToRawData(rawDataId, resourceId);
  }

  /**
   * Batch insert
   */
  async insertManyRawData(
    source: string,
    dataArray: Record<string, unknown>[],
  ): Promise<string[]> {
    return this.rawDataService.insertManyRawData(source, dataArray);
  }

  /**
   * Count by source
   */
  async countBySource(source: string): Promise<number> {
    return this.rawDataService.countBySource(source);
  }

  /**
   * Find by resourceId
   */
  async findRawDataByResourceId(resourceId: string): Promise<unknown> {
    return this.rawDataService.findRawDataByResourceId(resourceId);
  }

  /**
   * Find without resourceId
   */
  async findRawDataWithoutResourceId(
    source?: string,
    limit: number = 100,
  ): Promise<unknown[]> {
    return this.rawDataService.findRawDataWithoutResourceId(source, limit);
  }

  /**
   * Validate data consistency
   */
  async validateDataConsistency(source?: string): Promise<{
    totalRawData: number;
    withResourceRef: number;
    withoutResourceRef: number;
    orphanedRawData: number;
  }> {
    return this.rawDataService.validateDataConsistency(source);
  }

  /**
   * Repair missing resourceId
   */
  async repairMissingResourceId(
    rawDataIds: string[],
    resourceId: string,
  ): Promise<number> {
    return this.rawDataService.repairMissingResourceId(rawDataIds, resourceId);
  }
}
