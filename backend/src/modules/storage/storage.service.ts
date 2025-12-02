import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

export interface StorageCategory {
  name: string;
  displayName: string;
  count: number;
  estimatedSizeMB: number;
  description: string;
  cleanupRecommendation?: string;
  canCleanup: boolean;
}

export interface StorageStats {
  totalCategories: number;
  totalRecords: number;
  estimatedTotalSizeMB: number;
  categories: StorageCategory[];
  recommendations: string[];
}

export interface CleanupResult {
  success: boolean;
  category: string;
  deletedCount: number;
  freedSizeMB: number;
  message: string;
}

export interface TableSize {
  tableName: string;
  rowCount: number;
  totalSizeMB: number;
  dataSizeMB: number;
  indexSizeMB: number;
  toastSizeMB: number; // TOAST is for large text/json data
}

export interface DatabaseAnalysis {
  totalDatabaseSizeMB: number;
  tables: TableSize[];
  largestTables: TableSize[];
  recommendations: string[];
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  // Estimated average size per record in KB
  private readonly SIZE_ESTIMATES = {
    generatedImages: 500, // 500KB per image (base64 stored)
    rawData: 50, // 50KB per raw data record
    resources: 10, // 10KB per resource
    notes: 5, // 5KB per note
    researchProjectSources: 20, // 20KB per source
    collectionTasks: 2, // 2KB per task
    importTasks: 2, // 2KB per import task
    parsedMetadata: 3, // 3KB per metadata
    deduplicationRecords: 1, // 1KB per record
    dataQualityMetrics: 1, // 1KB per metric
    userActivities: 0.5, // 0.5KB per activity
    topicMessages: 2, // 2KB per message
  };

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get comprehensive storage statistics
   */
  async getStorageStats(): Promise<StorageStats> {
    const categories: StorageCategory[] = [];
    const recommendations: string[] = [];

    // 1. Generated Images
    const imageStats = await this.getImageStats();
    categories.push(imageStats);
    if (imageStats.cleanupRecommendation) {
      recommendations.push(imageStats.cleanupRecommendation);
    }

    // 2. Raw Data
    const rawDataStats = await this.getRawDataStats();
    categories.push(rawDataStats);
    if (rawDataStats.cleanupRecommendation) {
      recommendations.push(rawDataStats.cleanupRecommendation);
    }

    // 3. Resources
    const resourceStats = await this.getResourceStats();
    categories.push(resourceStats);

    // 4. Notes
    const noteStats = await this.getNoteStats();
    categories.push(noteStats);

    // 5. Research Project Sources
    const sourceStats = await this.getResearchSourceStats();
    categories.push(sourceStats);

    // 6. Collection Tasks
    const taskStats = await this.getCollectionTaskStats();
    categories.push(taskStats);
    if (taskStats.cleanupRecommendation) {
      recommendations.push(taskStats.cleanupRecommendation);
    }

    // 7. Import Tasks
    const importTaskStats = await this.getImportTaskStats();
    categories.push(importTaskStats);
    if (importTaskStats.cleanupRecommendation) {
      recommendations.push(importTaskStats.cleanupRecommendation);
    }

    // 8. Parsed Metadata (cached)
    const metadataStats = await this.getParsedMetadataStats();
    categories.push(metadataStats);
    if (metadataStats.cleanupRecommendation) {
      recommendations.push(metadataStats.cleanupRecommendation);
    }

    // 9. Deduplication Records
    const dedupStats = await this.getDeduplicationStats();
    categories.push(dedupStats);

    // 10. Data Quality Metrics
    const qualityStats = await this.getDataQualityStats();
    categories.push(qualityStats);

    // 11. User Activities
    const activityStats = await this.getUserActivityStats();
    categories.push(activityStats);
    if (activityStats.cleanupRecommendation) {
      recommendations.push(activityStats.cleanupRecommendation);
    }

    // 12. Topic Messages
    const messageStats = await this.getTopicMessageStats();
    categories.push(messageStats);

    // Calculate totals
    const totalRecords = categories.reduce((sum, cat) => sum + cat.count, 0);
    const estimatedTotalSizeMB = categories.reduce(
      (sum, cat) => sum + cat.estimatedSizeMB,
      0,
    );

    return {
      totalCategories: categories.length,
      totalRecords,
      estimatedTotalSizeMB: Math.round(estimatedTotalSizeMB * 100) / 100,
      categories,
      recommendations,
    };
  }

  // ========== Individual Stats Methods ==========

  private async getImageStats(): Promise<StorageCategory> {
    const total = await this.prisma.generatedImage.count();
    const bookmarked = await this.prisma.generatedImage.count({
      where: { isBookmarked: true },
    });
    const unbookmarked = total - bookmarked;

    const estimatedSizeMB =
      (total * this.SIZE_ESTIMATES.generatedImages) / 1024;

    let cleanupRecommendation: string | undefined;
    if (unbookmarked > 100) {
      cleanupRecommendation = `${unbookmarked} unbookmarked images can be cleaned up to save ~${Math.round((unbookmarked * this.SIZE_ESTIMATES.generatedImages) / 1024)}MB`;
    }

    return {
      name: "generatedImages",
      displayName: "AI Generated Images",
      count: total,
      estimatedSizeMB: Math.round(estimatedSizeMB * 100) / 100,
      description: `${bookmarked} bookmarked, ${unbookmarked} unbookmarked`,
      cleanupRecommendation,
      canCleanup: unbookmarked > 0,
    };
  }

  private async getRawDataStats(): Promise<StorageCategory> {
    const total = await this.prisma.rawData.count();
    const processed = await this.prisma.rawData.count({
      where: { isProcessed: true },
    });
    const unprocessed = total - processed;

    // Get by source breakdown
    const bySource = await this.prisma.rawData.groupBy({
      by: ["source"],
      _count: true,
    });

    const sourceBreakdown = bySource
      .map((s) => `${s.source}: ${s._count}`)
      .join(", ");

    const estimatedSizeMB = (total * this.SIZE_ESTIMATES.rawData) / 1024;

    let cleanupRecommendation: string | undefined;
    // Old processed data (>30 days) can be cleaned
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const oldProcessed = await this.prisma.rawData.count({
      where: {
        isProcessed: true,
        processedAt: { lt: thirtyDaysAgo },
      },
    });
    if (oldProcessed > 50) {
      cleanupRecommendation = `${oldProcessed} processed raw data records older than 30 days can be archived`;
    }

    return {
      name: "rawData",
      displayName: "Raw Data Collection",
      count: total,
      estimatedSizeMB: Math.round(estimatedSizeMB * 100) / 100,
      description: `${processed} processed, ${unprocessed} pending. Sources: ${sourceBreakdown || "none"}`,
      cleanupRecommendation,
      canCleanup: oldProcessed > 0,
    };
  }

  private async getResourceStats(): Promise<StorageCategory> {
    const total = await this.prisma.resource.count();

    // Get by type breakdown
    const byType = await this.prisma.resource.groupBy({
      by: ["type"],
      _count: true,
    });

    const typeBreakdown = byType
      .map((t) => `${t.type}: ${t._count}`)
      .join(", ");

    const estimatedSizeMB = (total * this.SIZE_ESTIMATES.resources) / 1024;

    return {
      name: "resources",
      displayName: "Resources",
      count: total,
      estimatedSizeMB: Math.round(estimatedSizeMB * 100) / 100,
      description: typeBreakdown || "No resources",
      canCleanup: false, // Resources are core data, shouldn't be auto-cleaned
    };
  }

  private async getNoteStats(): Promise<StorageCategory> {
    const total = await this.prisma.note.count();
    const estimatedSizeMB = (total * this.SIZE_ESTIMATES.notes) / 1024;

    return {
      name: "notes",
      displayName: "User Notes",
      count: total,
      estimatedSizeMB: Math.round(estimatedSizeMB * 100) / 100,
      description: `${total} notes from all users`,
      canCleanup: false,
    };
  }

  private async getResearchSourceStats(): Promise<StorageCategory> {
    const total = await this.prisma.researchProjectSource.count();

    // Get by source type
    const byType = await this.prisma.researchProjectSource.groupBy({
      by: ["sourceType"],
      _count: true,
    });

    const typeBreakdown = byType
      .map((t) => `${t.sourceType}: ${t._count}`)
      .join(", ");

    const estimatedSizeMB =
      (total * this.SIZE_ESTIMATES.researchProjectSources) / 1024;

    return {
      name: "researchProjectSources",
      displayName: "Research Project Sources",
      count: total,
      estimatedSizeMB: Math.round(estimatedSizeMB * 100) / 100,
      description: typeBreakdown || "No sources",
      canCleanup: false,
    };
  }

  private async getCollectionTaskStats(): Promise<StorageCategory> {
    const total = await this.prisma.collectionTask.count();

    // Get by status
    const byStatus = await this.prisma.collectionTask.groupBy({
      by: ["status"],
      _count: true,
    });

    const statusBreakdown = byStatus
      .map((s) => `${s.status}: ${s._count}`)
      .join(", ");

    const estimatedSizeMB =
      (total * this.SIZE_ESTIMATES.collectionTasks) / 1024;

    // Old completed/failed tasks (>7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const oldTasks = await this.prisma.collectionTask.count({
      where: {
        status: { in: ["COMPLETED", "FAILED", "CANCELLED"] },
        completedAt: { lt: sevenDaysAgo },
      },
    });

    let cleanupRecommendation: string | undefined;
    if (oldTasks > 20) {
      cleanupRecommendation = `${oldTasks} completed/failed collection tasks older than 7 days can be cleaned`;
    }

    return {
      name: "collectionTasks",
      displayName: "Collection Tasks",
      count: total,
      estimatedSizeMB: Math.round(estimatedSizeMB * 100) / 100,
      description: statusBreakdown || "No tasks",
      cleanupRecommendation,
      canCleanup: oldTasks > 0,
    };
  }

  private async getImportTaskStats(): Promise<StorageCategory> {
    const total = await this.prisma.importTask.count();

    const byStatus = await this.prisma.importTask.groupBy({
      by: ["status"],
      _count: true,
    });

    const statusBreakdown = byStatus
      .map((s) => `${s.status}: ${s._count}`)
      .join(", ");

    const estimatedSizeMB = (total * this.SIZE_ESTIMATES.importTasks) / 1024;

    // Old completed tasks (>7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const oldTasks = await this.prisma.importTask.count({
      where: {
        status: { in: ["SUCCESS", "FAILED", "CANCELLED"] },
        completedAt: { lt: sevenDaysAgo },
      },
    });

    let cleanupRecommendation: string | undefined;
    if (oldTasks > 50) {
      cleanupRecommendation = `${oldTasks} completed import tasks older than 7 days can be cleaned`;
    }

    return {
      name: "importTasks",
      displayName: "Import Tasks",
      count: total,
      estimatedSizeMB: Math.round(estimatedSizeMB * 100) / 100,
      description: statusBreakdown || "No tasks",
      cleanupRecommendation,
      canCleanup: oldTasks > 0,
    };
  }

  private async getParsedMetadataStats(): Promise<StorageCategory> {
    const total = await this.prisma.parsedMetadata.count();

    // Expired metadata
    const expired = await this.prisma.parsedMetadata.count({
      where: {
        expiresAt: { lt: new Date() },
      },
    });

    const estimatedSizeMB = (total * this.SIZE_ESTIMATES.parsedMetadata) / 1024;

    let cleanupRecommendation: string | undefined;
    if (expired > 0) {
      cleanupRecommendation = `${expired} expired metadata cache entries can be cleaned`;
    }

    return {
      name: "parsedMetadata",
      displayName: "Parsed Metadata Cache",
      count: total,
      estimatedSizeMB: Math.round(estimatedSizeMB * 100) / 100,
      description: `${total - expired} active, ${expired} expired`,
      cleanupRecommendation,
      canCleanup: expired > 0,
    };
  }

  private async getDeduplicationStats(): Promise<StorageCategory> {
    const total = await this.prisma.deduplicationRecord.count();
    const estimatedSizeMB =
      (total * this.SIZE_ESTIMATES.deduplicationRecords) / 1024;

    return {
      name: "deduplicationRecords",
      displayName: "Deduplication Records",
      count: total,
      estimatedSizeMB: Math.round(estimatedSizeMB * 100) / 100,
      description: `${total} deduplication records`,
      canCleanup: false,
    };
  }

  private async getDataQualityStats(): Promise<StorageCategory> {
    const total = await this.prisma.dataQualityMetric.count();
    const estimatedSizeMB =
      (total * this.SIZE_ESTIMATES.dataQualityMetrics) / 1024;

    return {
      name: "dataQualityMetrics",
      displayName: "Data Quality Metrics",
      count: total,
      estimatedSizeMB: Math.round(estimatedSizeMB * 100) / 100,
      description: `${total} quality metrics`,
      canCleanup: false,
    };
  }

  private async getUserActivityStats(): Promise<StorageCategory> {
    const total = await this.prisma.userActivity.count();

    // Old activities (>30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const oldActivities = await this.prisma.userActivity.count({
      where: { createdAt: { lt: thirtyDaysAgo } },
    });

    const estimatedSizeMB = (total * this.SIZE_ESTIMATES.userActivities) / 1024;

    let cleanupRecommendation: string | undefined;
    if (oldActivities > 1000) {
      cleanupRecommendation = `${oldActivities} user activity records older than 30 days can be archived`;
    }

    return {
      name: "userActivities",
      displayName: "User Activities",
      count: total,
      estimatedSizeMB: Math.round(estimatedSizeMB * 100) / 100,
      description: `${total - oldActivities} recent, ${oldActivities} older than 30 days`,
      cleanupRecommendation,
      canCleanup: oldActivities > 0,
    };
  }

  private async getTopicMessageStats(): Promise<StorageCategory> {
    const total = await this.prisma.topicMessage.count();
    const estimatedSizeMB = (total * this.SIZE_ESTIMATES.topicMessages) / 1024;

    return {
      name: "topicMessages",
      displayName: "AI Group Messages",
      count: total,
      estimatedSizeMB: Math.round(estimatedSizeMB * 100) / 100,
      description: `${total} messages across all topics`,
      canCleanup: false,
    };
  }

  // ========== Cleanup Methods ==========

  /**
   * Cleanup old unbookmarked images
   */
  async cleanupImages(keepPerUser: number = 20): Promise<CleanupResult> {
    try {
      // Get all users with images
      const userImages = await this.prisma.generatedImage.groupBy({
        by: ["userId"],
        _count: true,
      });

      let totalDeleted = 0;
      let totalFreedKB = 0;

      for (const userGroup of userImages) {
        if (!userGroup.userId) continue;

        // Get unbookmarked images for this user, oldest first
        const unbookmarked = await this.prisma.generatedImage.findMany({
          where: {
            userId: userGroup.userId,
            isBookmarked: false,
          },
          orderBy: { createdAt: "asc" },
          select: { id: true },
        });

        // Keep only the latest 'keepPerUser' unbookmarked images
        const toDelete = unbookmarked.slice(
          0,
          Math.max(0, unbookmarked.length - keepPerUser),
        );

        if (toDelete.length > 0) {
          await this.prisma.generatedImage.deleteMany({
            where: {
              id: { in: toDelete.map((img) => img.id) },
            },
          });
          totalDeleted += toDelete.length;
          totalFreedKB += toDelete.length * this.SIZE_ESTIMATES.generatedImages;
        }
      }

      return {
        success: true,
        category: "generatedImages",
        deletedCount: totalDeleted,
        freedSizeMB: Math.round((totalFreedKB / 1024) * 100) / 100,
        message: `Cleaned up ${totalDeleted} old images, freed ~${Math.round(totalFreedKB / 1024)}MB`,
      };
    } catch (error) {
      this.logger.error("Failed to cleanup images:", error);
      return {
        success: false,
        category: "generatedImages",
        deletedCount: 0,
        freedSizeMB: 0,
        message: `Cleanup failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  /**
   * Delete ALL images
   */
  async deleteAllImages(): Promise<CleanupResult> {
    try {
      const count = await this.prisma.generatedImage.count();
      await this.prisma.generatedImage.deleteMany();

      return {
        success: true,
        category: "generatedImages",
        deletedCount: count,
        freedSizeMB:
          Math.round(
            ((count * this.SIZE_ESTIMATES.generatedImages) / 1024) * 100,
          ) / 100,
        message: `Deleted all ${count} images`,
      };
    } catch (error) {
      this.logger.error("Failed to delete all images:", error);
      return {
        success: false,
        category: "generatedImages",
        deletedCount: 0,
        freedSizeMB: 0,
        message: `Delete failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  /**
   * Cleanup old raw data
   */
  async cleanupOldRawData(daysOld: number = 30): Promise<CleanupResult> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const result = await this.prisma.rawData.deleteMany({
        where: {
          isProcessed: true,
          processedAt: { lt: cutoffDate },
        },
      });

      return {
        success: true,
        category: "rawData",
        deletedCount: result.count,
        freedSizeMB:
          Math.round(
            ((result.count * this.SIZE_ESTIMATES.rawData) / 1024) * 100,
          ) / 100,
        message: `Cleaned up ${result.count} processed raw data records older than ${daysOld} days`,
      };
    } catch (error) {
      this.logger.error("Failed to cleanup raw data:", error);
      return {
        success: false,
        category: "rawData",
        deletedCount: 0,
        freedSizeMB: 0,
        message: `Cleanup failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  /**
   * Cleanup old collection tasks
   */
  async cleanupOldCollectionTasks(daysOld: number = 7): Promise<CleanupResult> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const result = await this.prisma.collectionTask.deleteMany({
        where: {
          status: { in: ["COMPLETED", "FAILED", "CANCELLED"] },
          completedAt: { lt: cutoffDate },
        },
      });

      return {
        success: true,
        category: "collectionTasks",
        deletedCount: result.count,
        freedSizeMB:
          Math.round(
            ((result.count * this.SIZE_ESTIMATES.collectionTasks) / 1024) * 100,
          ) / 100,
        message: `Cleaned up ${result.count} completed collection tasks older than ${daysOld} days`,
      };
    } catch (error) {
      this.logger.error("Failed to cleanup collection tasks:", error);
      return {
        success: false,
        category: "collectionTasks",
        deletedCount: 0,
        freedSizeMB: 0,
        message: `Cleanup failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  /**
   * Cleanup old import tasks
   */
  async cleanupOldImportTasks(daysOld: number = 7): Promise<CleanupResult> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const result = await this.prisma.importTask.deleteMany({
        where: {
          status: { in: ["SUCCESS", "FAILED", "CANCELLED"] },
          completedAt: { lt: cutoffDate },
        },
      });

      return {
        success: true,
        category: "importTasks",
        deletedCount: result.count,
        freedSizeMB:
          Math.round(
            ((result.count * this.SIZE_ESTIMATES.importTasks) / 1024) * 100,
          ) / 100,
        message: `Cleaned up ${result.count} completed import tasks older than ${daysOld} days`,
      };
    } catch (error) {
      this.logger.error("Failed to cleanup import tasks:", error);
      return {
        success: false,
        category: "importTasks",
        deletedCount: 0,
        freedSizeMB: 0,
        message: `Cleanup failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  /**
   * Cleanup expired metadata cache
   */
  async cleanupExpiredMetadata(): Promise<CleanupResult> {
    try {
      const result = await this.prisma.parsedMetadata.deleteMany({
        where: {
          expiresAt: { lt: new Date() },
        },
      });

      return {
        success: true,
        category: "parsedMetadata",
        deletedCount: result.count,
        freedSizeMB:
          Math.round(
            ((result.count * this.SIZE_ESTIMATES.parsedMetadata) / 1024) * 100,
          ) / 100,
        message: `Cleaned up ${result.count} expired metadata cache entries`,
      };
    } catch (error) {
      this.logger.error("Failed to cleanup metadata:", error);
      return {
        success: false,
        category: "parsedMetadata",
        deletedCount: 0,
        freedSizeMB: 0,
        message: `Cleanup failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  /**
   * Cleanup old user activities
   */
  async cleanupOldUserActivities(daysOld: number = 30): Promise<CleanupResult> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const result = await this.prisma.userActivity.deleteMany({
        where: {
          createdAt: { lt: cutoffDate },
        },
      });

      return {
        success: true,
        category: "userActivities",
        deletedCount: result.count,
        freedSizeMB:
          Math.round(
            ((result.count * this.SIZE_ESTIMATES.userActivities) / 1024) * 100,
          ) / 100,
        message: `Cleaned up ${result.count} user activity records older than ${daysOld} days`,
      };
    } catch (error) {
      this.logger.error("Failed to cleanup user activities:", error);
      return {
        success: false,
        category: "userActivities",
        deletedCount: 0,
        freedSizeMB: 0,
        message: `Cleanup failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  /**
   * Get REAL database table sizes using PostgreSQL system views
   * This shows actual disk usage, not estimates
   */
  async getDatabaseAnalysis(): Promise<DatabaseAnalysis> {
    try {
      // Get total database size using $queryRawUnsafe for better compatibility
      const dbSizeResult = await this.prisma.$queryRawUnsafe<
        Array<{ size: string }>
      >("SELECT pg_database_size(current_database())::text as size");

      const totalDatabaseSizeMB =
        Number(dbSizeResult[0]?.size || 0) / (1024 * 1024);

      // Get detailed table sizes - use simpler query for Railway compatibility
      const tableSizes = await this.prisma.$queryRawUnsafe<
        Array<{
          table_name: string;
          row_estimate: string;
          total_bytes: string;
          index_bytes: string;
          table_bytes: string;
        }>
      >(`
        SELECT
          relname as table_name,
          reltuples::bigint::text as row_estimate,
          pg_total_relation_size(oid)::text as total_bytes,
          pg_indexes_size(oid)::text as index_bytes,
          pg_relation_size(oid)::text as table_bytes
        FROM pg_class
        WHERE relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
          AND relkind = 'r'
        ORDER BY pg_total_relation_size(oid) DESC
      `);

      const tables: TableSize[] = tableSizes.map((t) => ({
        tableName: String(t.table_name),
        rowCount: parseInt(t.row_estimate, 10) || 0,
        totalSizeMB:
          Math.round((parseInt(t.total_bytes, 10) / (1024 * 1024)) * 100) / 100,
        dataSizeMB:
          Math.round((parseInt(t.table_bytes, 10) / (1024 * 1024)) * 100) / 100,
        indexSizeMB:
          Math.round((parseInt(t.index_bytes, 10) / (1024 * 1024)) * 100) / 100,
        toastSizeMB: 0,
      }));

      // Get top 5 largest tables
      const largestTables = tables.slice(0, 5);

      // Generate recommendations
      const recommendations: string[] = [];

      // Check for large TOAST data (usually means large JSON/text fields)
      const tablesWithLargeToast = tables.filter((t) => t.toastSizeMB > 10);
      if (tablesWithLargeToast.length > 0) {
        recommendations.push(
          `Tables with large TOAST data (JSON/text): ${tablesWithLargeToast.map((t) => `${t.tableName}(${t.toastSizeMB}MB)`).join(", ")}. Consider archiving old data.`,
        );
      }

      // Check for tables with high row counts
      const highRowTables = tables.filter((t) => t.rowCount > 10000);
      if (highRowTables.length > 0) {
        recommendations.push(
          `Tables with high row counts: ${highRowTables.map((t) => `${t.tableName}(${t.rowCount} rows)`).join(", ")}`,
        );
      }

      // Specific table recommendations
      const rawDataTable = tables.find((t) => t.tableName === "raw_data");
      if (rawDataTable && rawDataTable.totalSizeMB > 50) {
        recommendations.push(
          `raw_data table is ${rawDataTable.totalSizeMB}MB - consider cleaning processed records older than 30 days`,
        );
      }

      const imagesTable = tables.find(
        (t) => t.tableName === "generated_images",
      );
      if (imagesTable && imagesTable.totalSizeMB > 100) {
        recommendations.push(
          `generated_images table is ${imagesTable.totalSizeMB}MB - consider cleaning unbookmarked images`,
        );
      }

      const topicMessagesTable = tables.find(
        (t) => t.tableName === "topic_messages",
      );
      if (topicMessagesTable && topicMessagesTable.totalSizeMB > 50) {
        recommendations.push(
          `topic_messages table is ${topicMessagesTable.totalSizeMB}MB - consider implementing message archiving`,
        );
      }

      // Check if VACUUM is needed (bloat detection)
      const potentialBloat = tables.filter(
        (t) => t.dataSizeMB > 10 && t.rowCount < 1000,
      );
      if (potentialBloat.length > 0) {
        recommendations.push(
          `Potential bloat detected in: ${potentialBloat.map((t) => t.tableName).join(", ")}. Consider running VACUUM FULL.`,
        );
      }

      return {
        totalDatabaseSizeMB: Math.round(totalDatabaseSizeMB * 100) / 100,
        tables,
        largestTables,
        recommendations,
      };
    } catch (error) {
      this.logger.error("Failed to analyze database:", error);
      throw error;
    }
  }

  /**
   * Run VACUUM ANALYZE on all tables to reclaim space
   */
  async vacuumDatabase(): Promise<{ success: boolean; message: string }> {
    try {
      // Note: VACUUM cannot run inside a transaction, so we use a separate connection
      await this.prisma.$executeRawUnsafe("VACUUM ANALYZE");
      return {
        success: true,
        message: "VACUUM ANALYZE completed successfully. Space reclaimed.",
      };
    } catch (error) {
      this.logger.error("Failed to vacuum database:", error);
      return {
        success: false,
        message: `VACUUM failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  /**
   * Run all cleanup operations
   */
  async runFullCleanup(): Promise<{
    success: boolean;
    results: CleanupResult[];
    totalDeleted: number;
    totalFreedMB: number;
  }> {
    const results: CleanupResult[] = [];

    // Run all cleanup operations
    results.push(await this.cleanupImages(20));
    results.push(await this.cleanupOldRawData(30));
    results.push(await this.cleanupOldCollectionTasks(7));
    results.push(await this.cleanupOldImportTasks(7));
    results.push(await this.cleanupExpiredMetadata());
    results.push(await this.cleanupOldUserActivities(30));

    const totalDeleted = results.reduce((sum, r) => sum + r.deletedCount, 0);
    const totalFreedMB = results.reduce((sum, r) => sum + r.freedSizeMB, 0);

    return {
      success: results.every((r) => r.success),
      results,
      totalDeleted,
      totalFreedMB: Math.round(totalFreedMB * 100) / 100,
    };
  }
}
