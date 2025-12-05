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
    officeDocuments: 100, // 100KB per PPT document (JSON content)
    officeDocumentVersions: 150, // 150KB per version (full snapshot)
    users: 2, // 2KB per user
    comments: 1, // 1KB per comment
    askSessions: 1, // 1KB per session
    askMessages: 2, // 2KB per message
    topics: 3, // 3KB per topic
    workspaces: 5, // 5KB per workspace
    reports: 10, // 10KB per report
    debateSessions: 5, // 5KB per debate
    brandKits: 20, // 20KB per brand kit
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

    // 13. Office Documents (PPT)
    const officeDocStats = await this.getOfficeDocumentStats();
    categories.push(officeDocStats);
    if (officeDocStats.cleanupRecommendation) {
      recommendations.push(officeDocStats.cleanupRecommendation);
    }

    // 14. Users
    const userStats = await this.getUserStats();
    categories.push(userStats);

    // 15. Comments
    const commentStats = await this.getCommentStats();
    categories.push(commentStats);

    // 16. Ask Sessions
    const askSessionStats = await this.getAskSessionStats();
    categories.push(askSessionStats);
    if (askSessionStats.cleanupRecommendation) {
      recommendations.push(askSessionStats.cleanupRecommendation);
    }

    // 17. Topics (AI Groups)
    const topicStats = await this.getTopicStats();
    categories.push(topicStats);

    // 18. Workspaces
    const workspaceStats = await this.getWorkspaceStats();
    categories.push(workspaceStats);

    // 19. Reports
    const reportStats = await this.getReportStats();
    categories.push(reportStats);

    // 20. Debate Sessions
    const debateStats = await this.getDebateStats();
    categories.push(debateStats);

    // 21. Brand Kits
    const brandKitStats = await this.getBrandKitStats();
    categories.push(brandKitStats);

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

  private async getOfficeDocumentStats(): Promise<StorageCategory> {
    const totalDocs = await this.prisma.officeDocument.count();
    const totalVersions = await this.prisma.officeDocumentVersion.count();

    // Get by type breakdown
    const byType = await this.prisma.officeDocument.groupBy({
      by: ["type"],
      _count: true,
    });

    const typeBreakdown = byType
      .map((t) => `${t.type}: ${t._count}`)
      .join(", ");

    const estimatedSizeMB =
      (totalDocs * this.SIZE_ESTIMATES.officeDocuments +
        totalVersions * this.SIZE_ESTIMATES.officeDocumentVersions) /
      1024;

    // Old documents (>7 days) can be cleaned
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const oldDocs = await this.prisma.officeDocument.count({
      where: {
        createdAt: { lt: sevenDaysAgo },
      },
    });

    let cleanupRecommendation: string | undefined;
    if (oldDocs > 10) {
      cleanupRecommendation = `${oldDocs} PPT documents older than 7 days can be cleaned`;
    }

    return {
      name: "officeDocuments",
      displayName: "Office Documents (PPT)",
      count: totalDocs,
      estimatedSizeMB: Math.round(estimatedSizeMB * 100) / 100,
      description: `${totalDocs} documents, ${totalVersions} versions. Types: ${typeBreakdown || "none"}`,
      cleanupRecommendation,
      canCleanup: totalDocs > 0,
    };
  }

  private async getUserStats(): Promise<StorageCategory> {
    const total = await this.prisma.user.count();
    const estimatedSizeMB = (total * this.SIZE_ESTIMATES.users) / 1024;

    return {
      name: "users",
      displayName: "Users",
      count: total,
      estimatedSizeMB: Math.round(estimatedSizeMB * 100) / 100,
      description: `${total} registered users`,
      canCleanup: false,
    };
  }

  private async getCommentStats(): Promise<StorageCategory> {
    const total = await this.prisma.comment.count();
    const estimatedSizeMB = (total * this.SIZE_ESTIMATES.comments) / 1024;

    return {
      name: "comments",
      displayName: "Comments",
      count: total,
      estimatedSizeMB: Math.round(estimatedSizeMB * 100) / 100,
      description: `${total} comments on resources`,
      canCleanup: false,
    };
  }

  private async getAskSessionStats(): Promise<StorageCategory> {
    const totalSessions = await this.prisma.askSession.count();
    const totalMessages = await this.prisma.askMessage.count();
    const estimatedSizeMB =
      (totalSessions * this.SIZE_ESTIMATES.askSessions +
        totalMessages * this.SIZE_ESTIMATES.askMessages) /
      1024;

    // Old sessions (>30 days) can be cleaned
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const oldSessions = await this.prisma.askSession.count({
      where: { updatedAt: { lt: thirtyDaysAgo } },
    });

    let cleanupRecommendation: string | undefined;
    if (oldSessions > 50) {
      cleanupRecommendation = `${oldSessions} AI chat sessions older than 30 days can be cleaned`;
    }

    return {
      name: "askSessions",
      displayName: "Ask AI Sessions",
      count: totalSessions,
      estimatedSizeMB: Math.round(estimatedSizeMB * 100) / 100,
      description: `${totalSessions} sessions, ${totalMessages} messages`,
      cleanupRecommendation,
      canCleanup: oldSessions > 0,
    };
  }

  private async getTopicStats(): Promise<StorageCategory> {
    const total = await this.prisma.topic.count();
    const estimatedSizeMB = (total * this.SIZE_ESTIMATES.topics) / 1024;

    return {
      name: "topics",
      displayName: "AI Groups (Topics)",
      count: total,
      estimatedSizeMB: Math.round(estimatedSizeMB * 100) / 100,
      description: `${total} AI group conversations`,
      canCleanup: false,
    };
  }

  private async getWorkspaceStats(): Promise<StorageCategory> {
    const total = await this.prisma.workspace.count();
    const estimatedSizeMB = (total * this.SIZE_ESTIMATES.workspaces) / 1024;

    return {
      name: "workspaces",
      displayName: "Workspaces",
      count: total,
      estimatedSizeMB: Math.round(estimatedSizeMB * 100) / 100,
      description: `${total} user workspaces`,
      canCleanup: false,
    };
  }

  private async getReportStats(): Promise<StorageCategory> {
    const total = await this.prisma.report.count();
    const estimatedSizeMB = (total * this.SIZE_ESTIMATES.reports) / 1024;

    return {
      name: "reports",
      displayName: "Reports",
      count: total,
      estimatedSizeMB: Math.round(estimatedSizeMB * 100) / 100,
      description: `${total} generated reports`,
      canCleanup: false,
    };
  }

  private async getDebateStats(): Promise<StorageCategory> {
    const total = await this.prisma.debateSession.count();
    const estimatedSizeMB = (total * this.SIZE_ESTIMATES.debateSessions) / 1024;

    return {
      name: "debateSessions",
      displayName: "Debate Sessions",
      count: total,
      estimatedSizeMB: Math.round(estimatedSizeMB * 100) / 100,
      description: `${total} AI debate sessions`,
      canCleanup: false,
    };
  }

  private async getBrandKitStats(): Promise<StorageCategory> {
    const total = await this.prisma.brandKit.count();
    const estimatedSizeMB = (total * this.SIZE_ESTIMATES.brandKits) / 1024;

    return {
      name: "brandKits",
      displayName: "Brand Kits",
      count: total,
      estimatedSizeMB: Math.round(estimatedSizeMB * 100) / 100,
      description: `${total} brand kits`,
      canCleanup: false,
    };
  }

  // ========== Cleanup Methods ==========

  /**
   * Cleanup old unbookmarked images
   */
  async cleanupImages(keepPerUser: number = 20): Promise<CleanupResult> {
    try {
      // Get all users with images (including null userId)
      const userImages = await this.prisma.generatedImage.groupBy({
        by: ["userId"],
        _count: true,
      });

      let totalDeleted = 0;
      let totalFreedKB = 0;

      for (const userGroup of userImages) {
        // Get unbookmarked images for this user (or null user), oldest first
        // Prisma requires special handling for null values
        const userIdFilter =
          userGroup.userId === null ? { equals: null } : userGroup.userId;

        const unbookmarked = await this.prisma.generatedImage.findMany({
          where: {
            userId: userIdFilter,
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
   * Delete ALL raw data (both processed and pending)
   */
  async deleteAllRawData(): Promise<CleanupResult> {
    try {
      const count = await this.prisma.rawData.count();
      await this.prisma.rawData.deleteMany();

      return {
        success: true,
        category: "rawData",
        deletedCount: count,
        freedSizeMB:
          Math.round(((count * this.SIZE_ESTIMATES.rawData) / 1024) * 100) /
          100,
        message: `Deleted all ${count} raw data records`,
      };
    } catch (error) {
      this.logger.error("Failed to delete all raw data:", error);
      return {
        success: false,
        category: "rawData",
        deletedCount: 0,
        freedSizeMB: 0,
        message: `Delete failed: ${error instanceof Error ? error.message : "Unknown error"}`,
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
   * Cleanup old Ask AI sessions
   */
  async cleanupOldAskSessions(daysOld: number = 30): Promise<CleanupResult> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      // First delete messages from old sessions
      const messagesToDelete = await this.prisma.askMessage.deleteMany({
        where: {
          session: {
            updatedAt: { lt: cutoffDate },
          },
        },
      });

      // Then delete the sessions
      const result = await this.prisma.askSession.deleteMany({
        where: {
          updatedAt: { lt: cutoffDate },
        },
      });

      const freedSizeMB =
        (result.count * this.SIZE_ESTIMATES.askSessions +
          messagesToDelete.count * this.SIZE_ESTIMATES.askMessages) /
        1024;

      return {
        success: true,
        category: "askSessions",
        deletedCount: result.count,
        freedSizeMB: Math.round(freedSizeMB * 100) / 100,
        message: `Cleaned up ${result.count} sessions and ${messagesToDelete.count} messages older than ${daysOld} days`,
      };
    } catch (error) {
      this.logger.error("Failed to cleanup Ask sessions:", error);
      return {
        success: false,
        category: "askSessions",
        deletedCount: 0,
        freedSizeMB: 0,
        message: `Cleanup failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  /**
   * Cleanup old office documents (PPT)
   */
  async cleanupOldOfficeDocuments(daysOld: number = 7): Promise<CleanupResult> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      // Get count before deletion
      const docsToDelete = await this.prisma.officeDocument.count({
        where: {
          createdAt: { lt: cutoffDate },
        },
      });

      const versionsToDelete = await this.prisma.officeDocumentVersion.count({
        where: {
          createdAt: { lt: cutoffDate },
        },
      });

      // Delete resource refs first (due to foreign keys)
      await this.prisma.officeDocumentResourceRef.deleteMany({
        where: {
          document: {
            createdAt: { lt: cutoffDate },
          },
        },
      });

      // Delete versions
      await this.prisma.officeDocumentVersion.deleteMany({
        where: {
          createdAt: { lt: cutoffDate },
        },
      });

      // Delete documents
      await this.prisma.officeDocument.deleteMany({
        where: {
          createdAt: { lt: cutoffDate },
        },
      });

      const freedKB =
        docsToDelete * this.SIZE_ESTIMATES.officeDocuments +
        versionsToDelete * this.SIZE_ESTIMATES.officeDocumentVersions;

      return {
        success: true,
        category: "officeDocuments",
        deletedCount: docsToDelete,
        freedSizeMB: Math.round((freedKB / 1024) * 100) / 100,
        message: `Cleaned up ${docsToDelete} documents and ${versionsToDelete} versions older than ${daysOld} days`,
      };
    } catch (error) {
      this.logger.error("Failed to cleanup office documents:", error);
      return {
        success: false,
        category: "officeDocuments",
        deletedCount: 0,
        freedSizeMB: 0,
        message: `Cleanup failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  /**
   * Delete ALL office documents
   */
  async deleteAllOfficeDocuments(): Promise<CleanupResult> {
    try {
      const docsCount = await this.prisma.officeDocument.count();
      const versionsCount = await this.prisma.officeDocumentVersion.count();

      // Delete in correct order due to foreign keys
      await this.prisma.officeDocumentResourceRef.deleteMany();
      await this.prisma.officeDocumentVersion.deleteMany();
      await this.prisma.officeDocument.deleteMany();

      const freedKB =
        docsCount * this.SIZE_ESTIMATES.officeDocuments +
        versionsCount * this.SIZE_ESTIMATES.officeDocumentVersions;

      return {
        success: true,
        category: "officeDocuments",
        deletedCount: docsCount,
        freedSizeMB: Math.round((freedKB / 1024) * 100) / 100,
        message: `Deleted all ${docsCount} documents and ${versionsCount} versions`,
      };
    } catch (error) {
      this.logger.error("Failed to delete all office documents:", error);
      return {
        success: false,
        category: "officeDocuments",
        deletedCount: 0,
        freedSizeMB: 0,
        message: `Delete failed: ${error instanceof Error ? error.message : "Unknown error"}`,
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

      // Get detailed table sizes including TOAST
      const tableSizes = await this.prisma.$queryRawUnsafe<
        Array<{
          table_name: string;
          row_estimate: string;
          total_bytes: string;
          index_bytes: string;
          table_bytes: string;
          toast_bytes: string;
        }>
      >(`
        SELECT
          c.relname as table_name,
          c.reltuples::bigint::text as row_estimate,
          pg_total_relation_size(c.oid)::text as total_bytes,
          pg_indexes_size(c.oid)::text as index_bytes,
          pg_relation_size(c.oid)::text as table_bytes,
          COALESCE(pg_relation_size(c.reltoastrelid), 0)::text as toast_bytes
        FROM pg_class c
        WHERE c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
          AND c.relkind = 'r'
        ORDER BY pg_total_relation_size(c.oid) DESC
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
        toastSizeMB:
          Math.round((parseInt(t.toast_bytes, 10) / (1024 * 1024)) * 100) / 100,
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
   * Run VACUUM FULL on a specific table to reclaim space to OS
   * WARNING: This locks the table exclusively during operation
   */
  async vacuumFullTable(tableName: string): Promise<{
    success: boolean;
    message: string;
    beforeMB?: number;
    afterMB?: number;
  }> {
    try {
      // Validate table name to prevent SQL injection
      const validTables = [
        "topic_messages",
        "generated_images",
        "resources",
        "raw_data",
        "debate_agents",
        "debate_messages",
        "collection_tasks",
        "import_tasks",
        "user_activities",
        "office_documents",
        "office_document_versions",
        "office_document_resource_refs",
      ];

      if (!validTables.includes(tableName)) {
        return {
          success: false,
          message: `Invalid table name. Allowed tables: ${validTables.join(", ")}`,
        };
      }

      // Get size before
      const beforeSize = await this.prisma.$queryRawUnsafe<
        Array<{ size: string }>
      >(`SELECT pg_total_relation_size('${tableName}')::text as size`);
      const beforeMB = Number(beforeSize[0]?.size || 0) / (1024 * 1024);

      // Run VACUUM FULL
      this.logger.log(`Running VACUUM FULL on ${tableName}...`);
      await this.prisma.$executeRawUnsafe(`VACUUM FULL ${tableName}`);

      // Get size after
      const afterSize = await this.prisma.$queryRawUnsafe<
        Array<{ size: string }>
      >(`SELECT pg_total_relation_size('${tableName}')::text as size`);
      const afterMB = Number(afterSize[0]?.size || 0) / (1024 * 1024);

      const freedMB = Math.round((beforeMB - afterMB) * 100) / 100;

      return {
        success: true,
        message: `VACUUM FULL completed on ${tableName}. Freed ${freedMB}MB (${Math.round(beforeMB * 100) / 100}MB -> ${Math.round(afterMB * 100) / 100}MB)`,
        beforeMB: Math.round(beforeMB * 100) / 100,
        afterMB: Math.round(afterMB * 100) / 100,
      };
    } catch (error) {
      this.logger.error(`Failed to vacuum full ${tableName}:`, error);
      return {
        success: false,
        message: `VACUUM FULL failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  /**
   * Run VACUUM FULL on all major tables to reclaim disk space
   * WARNING: This locks tables during operation - use during low traffic
   */
  async vacuumFullAll(): Promise<{
    success: boolean;
    message: string;
    results: Array<{
      table: string;
      beforeMB: number;
      afterMB: number;
      freedMB: number;
    }>;
    totalFreedMB: number;
  }> {
    const tablesToVacuum = [
      "generated_images",
      "topic_messages",
      "raw_data",
      "office_documents",
      "office_document_versions",
      "resources",
      "debate_messages",
      "user_activities",
    ];

    const results: Array<{
      table: string;
      beforeMB: number;
      afterMB: number;
      freedMB: number;
    }> = [];
    let totalFreedMB = 0;

    try {
      // Get database size before
      const dbSizeBefore = await this.prisma.$queryRawUnsafe<
        Array<{ size: string }>
      >("SELECT pg_database_size(current_database())::text as size");
      const dbBeforeMB = Number(dbSizeBefore[0]?.size || 0) / (1024 * 1024);

      for (const table of tablesToVacuum) {
        try {
          // Get size before
          const beforeSize = await this.prisma.$queryRawUnsafe<
            Array<{ size: string }>
          >(`SELECT pg_total_relation_size('${table}')::text as size`);
          const beforeMB = Number(beforeSize[0]?.size || 0) / (1024 * 1024);

          if (beforeMB < 0.1) {
            // Skip tiny tables
            continue;
          }

          this.logger.log(
            `VACUUM FULL ${table} (${Math.round(beforeMB * 100) / 100}MB)...`,
          );
          await this.prisma.$executeRawUnsafe(`VACUUM FULL ${table}`);

          // Get size after
          const afterSize = await this.prisma.$queryRawUnsafe<
            Array<{ size: string }>
          >(`SELECT pg_total_relation_size('${table}')::text as size`);
          const afterMB = Number(afterSize[0]?.size || 0) / (1024 * 1024);
          const freedMB = Math.round((beforeMB - afterMB) * 100) / 100;

          results.push({
            table,
            beforeMB: Math.round(beforeMB * 100) / 100,
            afterMB: Math.round(afterMB * 100) / 100,
            freedMB,
          });
          totalFreedMB += freedMB;
        } catch (tableError) {
          this.logger.warn(`Failed to vacuum ${table}: ${tableError}`);
        }
      }

      // Get database size after
      const dbSizeAfter = await this.prisma.$queryRawUnsafe<
        Array<{ size: string }>
      >("SELECT pg_database_size(current_database())::text as size");
      const dbAfterMB = Number(dbSizeAfter[0]?.size || 0) / (1024 * 1024);
      const actualFreed = Math.round((dbBeforeMB - dbAfterMB) * 100) / 100;

      return {
        success: true,
        message: `VACUUM FULL completed. Database: ${Math.round(dbBeforeMB)}MB -> ${Math.round(dbAfterMB)}MB (freed ${actualFreed}MB)`,
        results,
        totalFreedMB: actualFreed,
      };
    } catch (error) {
      this.logger.error("Failed to vacuum full all:", error);
      return {
        success: false,
        message: `VACUUM FULL ALL failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        results,
        totalFreedMB,
      };
    }
  }

  /**
   * Force checkpoint and clean WAL to reduce disk usage
   */
  async cleanupWAL(): Promise<{ success: boolean; message: string }> {
    try {
      // Force a checkpoint to flush WAL to disk
      await this.prisma.$executeRawUnsafe("CHECKPOINT");

      // Get WAL stats before
      const walBefore = await this.prisma.$queryRawUnsafe<
        Array<{ wal_bytes: string }>
      >(
        "SELECT pg_wal_lsn_diff(pg_current_wal_lsn(), '0/0')::text as wal_bytes",
      );

      this.logger.log(
        `WAL position: ${Number(walBefore[0]?.wal_bytes || 0) / (1024 * 1024)}MB`,
      );

      return {
        success: true,
        message: `CHECKPOINT completed. WAL logs flushed. Note: Railway volume may not shrink immediately - this prevents future growth.`,
      };
    } catch (error) {
      this.logger.error("Failed to cleanup WAL:", error);
      return {
        success: false,
        message: `WAL cleanup failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  /**
   * Get full disk usage breakdown including WAL, system tables, etc.
   */
  async getFullDiskUsage(): Promise<{
    totalDiskMB: number;
    databaseSizeMB: number;
    tableDataMB: number;
    indexesMB: number;
    toastMB: number;
    walEstimateMB: number;
    otherMB: number;
    breakdown: Array<{ category: string; sizeMB: number; percentage: number }>;
  }> {
    try {
      // Get total database size
      const dbSize = await this.prisma.$queryRawUnsafe<Array<{ size: string }>>(
        "SELECT pg_database_size(current_database())::text as size",
      );
      const databaseSizeMB = Number(dbSize[0]?.size || 0) / (1024 * 1024);

      // Get all table sizes with TOAST
      const tableSizes = await this.prisma.$queryRawUnsafe<
        Array<{
          table_bytes: string;
          index_bytes: string;
          toast_bytes: string;
        }>
      >(`
        SELECT
          SUM(pg_relation_size(c.oid))::text as table_bytes,
          SUM(pg_indexes_size(c.oid))::text as index_bytes,
          SUM(COALESCE(pg_relation_size(c.reltoastrelid), 0))::text as toast_bytes
        FROM pg_class c
        WHERE c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
          AND c.relkind = 'r'
      `);

      const tableDataMB =
        Number(tableSizes[0]?.table_bytes || 0) / (1024 * 1024);
      const indexesMB = Number(tableSizes[0]?.index_bytes || 0) / (1024 * 1024);
      const toastMB = Number(tableSizes[0]?.toast_bytes || 0) / (1024 * 1024);

      // Calculate WAL and other overhead
      const accountedMB = tableDataMB + indexesMB + toastMB;
      const walEstimateMB = Math.max(0, databaseSizeMB - accountedMB);

      // Railway volume is larger than database - the difference is filesystem overhead
      // We can't query this directly, but we can report what we know

      const breakdown = [
        {
          category: "Table Data",
          sizeMB: Math.round(tableDataMB * 100) / 100,
          percentage: Math.round((tableDataMB / databaseSizeMB) * 100),
        },
        {
          category: "Indexes",
          sizeMB: Math.round(indexesMB * 100) / 100,
          percentage: Math.round((indexesMB / databaseSizeMB) * 100),
        },
        {
          category: "TOAST (Large Objects)",
          sizeMB: Math.round(toastMB * 100) / 100,
          percentage: Math.round((toastMB / databaseSizeMB) * 100),
        },
        {
          category: "WAL/System/Other",
          sizeMB: Math.round(walEstimateMB * 100) / 100,
          percentage: Math.round((walEstimateMB / databaseSizeMB) * 100),
        },
      ];

      return {
        totalDiskMB: 406, // From Railway dashboard - hardcoded for now
        databaseSizeMB: Math.round(databaseSizeMB * 100) / 100,
        tableDataMB: Math.round(tableDataMB * 100) / 100,
        indexesMB: Math.round(indexesMB * 100) / 100,
        toastMB: Math.round(toastMB * 100) / 100,
        walEstimateMB: Math.round(walEstimateMB * 100) / 100,
        otherMB: Math.round((406 - databaseSizeMB) * 100) / 100,
        breakdown,
      };
    } catch (error) {
      this.logger.error("Failed to get full disk usage:", error);
      throw error;
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
    results.push(await this.cleanupOldAskSessions(30));
    results.push(await this.cleanupOldOfficeDocuments(7));

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
