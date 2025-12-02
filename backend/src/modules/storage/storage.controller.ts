import {
  Controller,
  Get,
  Post,
  Delete,
  Query,
  Logger,
  BadRequestException,
} from "@nestjs/common";
import {
  StorageService,
  StorageStats,
  CleanupResult,
  DatabaseAnalysis,
} from "./storage.service";

const ADMIN_KEY = "deepdive-admin-cleanup-2024";

@Controller("storage")
export class StorageController {
  private readonly logger = new Logger(StorageController.name);

  constructor(private readonly storageService: StorageService) {}

  /**
   * Validate admin key
   */
  private validateKey(key: string): void {
    if (key !== ADMIN_KEY) {
      throw new BadRequestException("Invalid admin key");
    }
  }

  /**
   * Get comprehensive storage statistics
   */
  @Get("stats")
  async getStorageStats(@Query("key") key: string): Promise<StorageStats> {
    this.validateKey(key);
    this.logger.log("Getting storage statistics");
    return this.storageService.getStorageStats();
  }

  /**
   * Cleanup old images (keep latest 20 unbookmarked per user)
   */
  @Post("cleanup/images")
  async cleanupImages(
    @Query("key") key: string,
    @Query("keepPerUser") keepPerUser?: string,
  ): Promise<CleanupResult> {
    this.validateKey(key);
    const keep = keepPerUser ? parseInt(keepPerUser, 10) : 20;
    this.logger.log(`Cleaning up images, keeping ${keep} per user`);
    return this.storageService.cleanupImages(keep);
  }

  /**
   * Delete ALL images
   */
  @Delete("images/all")
  async deleteAllImages(@Query("key") key: string): Promise<CleanupResult> {
    this.validateKey(key);
    this.logger.log("Deleting all images");
    return this.storageService.deleteAllImages();
  }

  /**
   * Cleanup old raw data
   */
  @Post("cleanup/raw-data")
  async cleanupRawData(
    @Query("key") key: string,
    @Query("daysOld") daysOld?: string,
  ): Promise<CleanupResult> {
    this.validateKey(key);
    const days = daysOld ? parseInt(daysOld, 10) : 30;
    this.logger.log(`Cleaning up raw data older than ${days} days`);
    return this.storageService.cleanupOldRawData(days);
  }

  /**
   * Cleanup old collection tasks
   */
  @Post("cleanup/collection-tasks")
  async cleanupCollectionTasks(
    @Query("key") key: string,
    @Query("daysOld") daysOld?: string,
  ): Promise<CleanupResult> {
    this.validateKey(key);
    const days = daysOld ? parseInt(daysOld, 10) : 7;
    this.logger.log(`Cleaning up collection tasks older than ${days} days`);
    return this.storageService.cleanupOldCollectionTasks(days);
  }

  /**
   * Cleanup old import tasks
   */
  @Post("cleanup/import-tasks")
  async cleanupImportTasks(
    @Query("key") key: string,
    @Query("daysOld") daysOld?: string,
  ): Promise<CleanupResult> {
    this.validateKey(key);
    const days = daysOld ? parseInt(daysOld, 10) : 7;
    this.logger.log(`Cleaning up import tasks older than ${days} days`);
    return this.storageService.cleanupOldImportTasks(days);
  }

  /**
   * Cleanup expired metadata cache
   */
  @Post("cleanup/metadata")
  async cleanupMetadata(@Query("key") key: string): Promise<CleanupResult> {
    this.validateKey(key);
    this.logger.log("Cleaning up expired metadata cache");
    return this.storageService.cleanupExpiredMetadata();
  }

  /**
   * Cleanup old user activities
   */
  @Post("cleanup/user-activities")
  async cleanupUserActivities(
    @Query("key") key: string,
    @Query("daysOld") daysOld?: string,
  ): Promise<CleanupResult> {
    this.validateKey(key);
    const days = daysOld ? parseInt(daysOld, 10) : 30;
    this.logger.log(`Cleaning up user activities older than ${days} days`);
    return this.storageService.cleanupOldUserActivities(days);
  }

  /**
   * Run full cleanup (all categories)
   */
  @Post("cleanup/all")
  async runFullCleanup(@Query("key") key: string): Promise<{
    success: boolean;
    results: CleanupResult[];
    totalDeleted: number;
    totalFreedMB: number;
  }> {
    this.validateKey(key);
    this.logger.log("Running full storage cleanup");
    return this.storageService.runFullCleanup();
  }

  /**
   * Get REAL database table sizes (PostgreSQL system views)
   * This shows actual disk usage, not estimates
   */
  @Get("database-analysis")
  async getDatabaseAnalysis(
    @Query("key") key: string,
  ): Promise<DatabaseAnalysis> {
    this.validateKey(key);
    this.logger.log("Analyzing database table sizes");
    return this.storageService.getDatabaseAnalysis();
  }

  /**
   * Run VACUUM to reclaim space after deletions
   */
  @Post("vacuum")
  async vacuumDatabase(
    @Query("key") key: string,
  ): Promise<{ success: boolean; message: string }> {
    this.validateKey(key);
    this.logger.log("Running VACUUM ANALYZE on database");
    return this.storageService.vacuumDatabase();
  }

  /**
   * Run VACUUM FULL on a specific table to reclaim space to OS
   * WARNING: This locks the table exclusively during operation
   */
  @Post("vacuum-full")
  async vacuumFullTable(
    @Query("key") key: string,
    @Query("table") tableName: string,
  ): Promise<{
    success: boolean;
    message: string;
    beforeMB?: number;
    afterMB?: number;
  }> {
    this.validateKey(key);
    if (!tableName) {
      throw new BadRequestException("Table name is required");
    }
    this.logger.log(`Running VACUUM FULL on ${tableName}`);
    return this.storageService.vacuumFullTable(tableName);
  }

  /**
   * Get full disk usage breakdown including WAL, TOAST, etc.
   */
  @Get("disk-usage")
  async getFullDiskUsage(@Query("key") key: string): Promise<{
    totalDiskMB: number;
    databaseSizeMB: number;
    tableDataMB: number;
    indexesMB: number;
    toastMB: number;
    walEstimateMB: number;
    otherMB: number;
    breakdown: Array<{ category: string; sizeMB: number; percentage: number }>;
  }> {
    this.validateKey(key);
    this.logger.log("Getting full disk usage breakdown");
    return this.storageService.getFullDiskUsage();
  }
}
