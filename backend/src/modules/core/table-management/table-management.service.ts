import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";
import {
  TableCategory,
  TableInfoDto,
  TableDetailDto,
  TableDiagnosisDto,
  CleanupResultDto,
  TableStatsDto,
  TableListQueryDto,
  TableListResponseDto,
  HealthStatus,
  CleanupPolicyDto,
  DiagnosisIssue,
  TableColumnDto,
  TableConstraintDto,
} from "./dto/table-info.dto";

/**
 * Table category mapping for all Prisma tables
 * Maps PostgreSQL table names (snake_case) to categories
 */
const TABLE_CATEGORIES: Record<string, TableCategory> = {
  // USER category
  users: TableCategory.USER,
  user_preferences: TableCategory.USER,
  user_quotas: TableCategory.USER,
  user_activities: TableCategory.USER,
  user_sessions: TableCategory.USER,
  accounts: TableCategory.USER,
  verification_tokens: TableCategory.USER,
  api_keys: TableCategory.USER,
  user_ai_preference: TableCategory.USER,

  // RESOURCE category
  resources: TableCategory.RESOURCE,
  resource_versions: TableCategory.RESOURCE,
  resource_tags: TableCategory.RESOURCE,
  resource_relations: TableCategory.RESOURCE,
  notes: TableCategory.RESOURCE,
  comments: TableCategory.RESOURCE,
  workspaces: TableCategory.RESOURCE,
  workspace_members: TableCategory.RESOURCE,
  folders: TableCategory.RESOURCE,
  folder_resources: TableCategory.RESOURCE,
  curated_lists: TableCategory.RESOURCE,
  curated_list_items: TableCategory.RESOURCE,
  reading_list_items: TableCategory.RESOURCE,

  // AI_SESSION category
  topics: TableCategory.AI_SESSION,
  topic_messages: TableCategory.AI_SESSION,
  topic_agents: TableCategory.AI_SESSION,
  ask_sessions: TableCategory.AI_SESSION,
  ask_messages: TableCategory.AI_SESSION,
  conversations: TableCategory.AI_SESSION,
  messages: TableCategory.AI_SESSION,
  debate_sessions: TableCategory.AI_SESSION,
  debate_messages: TableCategory.AI_SESSION,
  debate_agents: TableCategory.AI_SESSION,
  simulation_sessions: TableCategory.AI_SESSION,
  simulation_turns: TableCategory.AI_SESSION,
  agent_tasks: TableCategory.AI_SESSION,
  writing_sessions: TableCategory.AI_SESSION,
  writing_messages: TableCategory.AI_SESSION,
  custom_team_sessions: TableCategory.AI_SESSION,
  custom_team_messages: TableCategory.AI_SESSION,

  // AI_CONFIG category
  ai_models: TableCategory.AI_CONFIG,
  ai_tools: TableCategory.AI_CONFIG,
  ai_skills: TableCategory.AI_CONFIG,
  ai_mcp_servers: TableCategory.AI_CONFIG,
  custom_team_templates: TableCategory.AI_CONFIG,
  custom_team_agents: TableCategory.AI_CONFIG,
  persona_templates: TableCategory.AI_CONFIG,
  prompt_templates: TableCategory.AI_CONFIG,
  brand_kits: TableCategory.AI_CONFIG,
  debate_topic_templates: TableCategory.AI_CONFIG,
  simulation_templates: TableCategory.AI_CONFIG,
  simulation_agent_templates: TableCategory.AI_CONFIG,

  // KNOWLEDGE category (RAG)
  knowledge_bases: TableCategory.KNOWLEDGE,
  knowledge_base_documents: TableCategory.KNOWLEDGE,
  knowledge_base_members: TableCategory.KNOWLEDGE,
  knowledge_base_sources: TableCategory.KNOWLEDGE,
  parent_chunks: TableCategory.KNOWLEDGE,
  child_chunks: TableCategory.KNOWLEDGE,
  child_embeddings: TableCategory.KNOWLEDGE,

  // RESEARCH category
  research_projects: TableCategory.RESEARCH,
  research_project_sources: TableCategory.RESEARCH,
  reports: TableCategory.RESEARCH,
  research_plans: TableCategory.RESEARCH,
  deep_research_sessions: TableCategory.RESEARCH,
  deep_research_steps: TableCategory.RESEARCH,
  deep_research_sources: TableCategory.RESEARCH,

  // OFFICE category
  office_documents: TableCategory.OFFICE,
  office_document_versions: TableCategory.OFFICE,
  office_document_resource_refs: TableCategory.OFFICE,
  slides_sessions: TableCategory.OFFICE,
  slides_checkpoints: TableCategory.OFFICE,
  slides_team_executions: TableCategory.OFFICE,
  slides_team_logs: TableCategory.OFFICE,
  generated_images: TableCategory.OFFICE,

  // INGESTION category
  data_sources: TableCategory.INGESTION,
  collection_tasks: TableCategory.INGESTION,
  import_tasks: TableCategory.INGESTION,
  raw_data: TableCategory.INGESTION,
  parsed_metadata_cache: TableCategory.INGESTION,
  deduplication_records: TableCategory.INGESTION,
  data_quality_metrics: TableCategory.INGESTION,
  blog_collections: TableCategory.INGESTION,
  blog_collection_sources: TableCategory.INGESTION,

  // NOTIFICATION category
  notifications: TableCategory.NOTIFICATION,
  notification_settings: TableCategory.NOTIFICATION,

  // LOG category
  audit_logs: TableCategory.LOG,
  api_request_logs: TableCategory.LOG,
  error_logs: TableCategory.LOG,
  scheduler_logs: TableCategory.LOG,

  // ANALYTICS category
  resource_analytics: TableCategory.ANALYTICS,
  search_analytics: TableCategory.ANALYTICS,
  user_engagement: TableCategory.ANALYTICS,

  // SYSTEM category
  system_settings: TableCategory.SYSTEM,
  feature_flags: TableCategory.SYSTEM,
  secrets: TableCategory.SYSTEM,
  whitelists: TableCategory.SYSTEM,
  whitelist_domains: TableCategory.SYSTEM,
  domain_whitelists: TableCategory.SYSTEM,
  content_filters: TableCategory.SYSTEM,
  release_notes: TableCategory.SYSTEM,
  feedbacks: TableCategory.SYSTEM,

  // CACHE category
  query_cache: TableCategory.CACHE,
  embedding_cache: TableCategory.CACHE,

  // EXTERNAL category
  wechat_data_sources: TableCategory.EXTERNAL,
  wechat_articles: TableCategory.EXTERNAL,
  wechat_sync_tasks: TableCategory.EXTERNAL,
};

/**
 * Cleanup policies for tables
 */
const CLEANUP_POLICIES: Record<string, CleanupPolicyDto> = {
  // Use snake_case column names to match PostgreSQL
  raw_data: {
    type: "age",
    field: "processed_at",
    threshold: 30, // days
    description: "Delete processed raw data older than 30 days",
  },
  collection_tasks: {
    type: "status",
    field: "status",
    condition: "COMPLETED OR FAILED",
    threshold: 7,
    dateField: "created_at",
    description: "Delete completed/failed tasks older than 7 days",
  },
  import_tasks: {
    type: "status",
    field: "status",
    condition: "SUCCESS OR FAILED",
    threshold: 7,
    dateField: "createdAt", // Note: ImportTask model uses camelCase column names (no @map in schema)
    description: "Delete completed/failed import tasks older than 7 days",
  },
  user_activities: {
    type: "age",
    field: "created_at",
    threshold: 30,
    description: "Archive user activities older than 30 days",
  },
  generated_images: {
    type: "status",
    field: "is_bookmarked",
    condition: "false",
    description: "Delete unbookmarked images (keep latest 20 per user)",
  },
  ask_sessions: {
    type: "age",
    field: "updated_at",
    threshold: 30,
    description: "Delete old Ask AI sessions older than 30 days",
  },
  office_documents: {
    type: "age",
    field: "created_at",
    threshold: 7,
    description: "Delete old office documents older than 7 days",
  },
  slides_sessions: {
    type: "age",
    field: "updated_at",
    threshold: 7,
    description: "Delete old slides sessions older than 7 days",
  },
  deep_research_sessions: {
    type: "age",
    field: "created_at",
    threshold: 30,
    description: "Delete old research sessions older than 30 days",
  },
  agent_tasks: {
    type: "age",
    field: "created_at",
    threshold: 7,
    description: "Delete old agent tasks older than 7 days",
  },
};

/**
 * Human-readable display names for tables
 */
const TABLE_DISPLAY_NAMES: Record<string, string> = {
  users: "Users",
  user_preferences: "User Preferences",
  user_quotas: "User Quotas",
  user_activities: "User Activities",
  resources: "Resources",
  topics: "AI Topics",
  topic_messages: "AI Topic Messages",
  ask_sessions: "Ask AI Sessions",
  ask_messages: "Ask AI Messages",
  debate_sessions: "Debate Sessions",
  debate_messages: "Debate Messages",
  knowledge_bases: "Knowledge Bases",
  knowledge_base_documents: "KB Documents",
  parent_chunks: "Parent Chunks",
  child_chunks: "Child Chunks",
  child_embeddings: "Embeddings",
  research_projects: "Research Projects",
  reports: "Reports",
  office_documents: "Office Documents",
  slides_sessions: "Slides Sessions",
  generated_images: "Generated Images",
  data_sources: "Data Sources",
  collection_tasks: "Collection Tasks",
  raw_data: "Raw Data",
  audit_logs: "Audit Logs",
  secrets: "Secrets",
  ai_models: "AI Models",
  ai_tools: "AI Tools",
  ai_skills: "AI Skills",
};

@Injectable()
export class TableManagementService {
  private readonly logger = new Logger(TableManagementService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Format bytes to human-readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }

  /**
   * Get display name for a table
   */
  private getDisplayName(tableName: string): string {
    if (TABLE_DISPLAY_NAMES[tableName]) {
      return TABLE_DISPLAY_NAMES[tableName];
    }
    // Convert snake_case to Title Case
    return tableName
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  /**
   * Get category for a table
   */
  private getCategory(tableName: string): TableCategory {
    return TABLE_CATEGORIES[tableName] || TableCategory.OTHER;
  }

  /**
   * Determine health status based on table metrics
   */
  private determineHealthStatus(
    rowCount: number,
    sizeBytes: number,
    cleanableBytes: number,
    hasCleanupPolicy: boolean,
  ): HealthStatus {
    // Critical: Very large tables or high cleanable percentage
    if (sizeBytes > 1024 * 1024 * 1024) {
      // > 1GB
      return "critical";
    }
    if (cleanableBytes > 0 && cleanableBytes / sizeBytes > 0.5) {
      return "warning";
    }
    // Warning: Large tables without cleanup policy
    if (sizeBytes > 100 * 1024 * 1024 && !hasCleanupPolicy) {
      // > 100MB
      return "warning";
    }
    if (rowCount > 100000 && !hasCleanupPolicy) {
      return "warning";
    }
    return "healthy";
  }

  /**
   * Get list of all tables with their statistics
   */
  async getTableList(query: TableListQueryDto): Promise<TableListResponseDto> {
    const {
      search,
      category,
      sortBy = "size",
      sortOrder = "desc",
      page = 1,
      pageSize = 50,
      healthStatus,
    } = query;

    try {
      // Query PostgreSQL for table sizes
      const tableSizes = await this.prisma.$queryRawUnsafe<
        Array<{
          table_name: string;
          row_estimate: string;
          total_bytes: string;
          table_bytes: string;
          index_bytes: string;
          toast_bytes: string;
        }>
      >(`
        SELECT
          c.relname as table_name,
          c.reltuples::bigint::text as row_estimate,
          pg_total_relation_size(c.oid)::text as total_bytes,
          pg_relation_size(c.oid)::text as table_bytes,
          pg_indexes_size(c.oid)::text as index_bytes,
          COALESCE(pg_relation_size(c.reltoastrelid), 0)::text as toast_bytes
        FROM pg_class c
        WHERE c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
          AND c.relkind = 'r'
        ORDER BY pg_total_relation_size(c.oid) DESC
      `);

      // Transform to TableInfoDto array
      let tables: TableInfoDto[] = tableSizes.map((t) => {
        const tableName = String(t.table_name);
        const rowCount = parseInt(t.row_estimate, 10) || 0;
        const sizeBytes = parseInt(t.total_bytes, 10) || 0;
        const dataSizeBytes = parseInt(t.table_bytes, 10) || 0;
        const indexSizeBytes = parseInt(t.index_bytes, 10) || 0;
        const toastSizeBytes = parseInt(t.toast_bytes, 10) || 0;
        const tableCategory = this.getCategory(tableName);
        const cleanupPolicy = CLEANUP_POLICIES[tableName];
        const hasCleanupPolicy = !!cleanupPolicy;

        // Estimate cleanable bytes (rough estimate based on policy)
        let cleanableBytes = 0;
        if (cleanupPolicy?.type === "age" || cleanupPolicy?.type === "status") {
          cleanableBytes = Math.floor(sizeBytes * 0.3); // Estimate 30% cleanable
        }

        const healthStatus = this.determineHealthStatus(
          rowCount,
          sizeBytes,
          cleanableBytes,
          hasCleanupPolicy,
        );

        return {
          name: tableName,
          displayName: this.getDisplayName(tableName),
          category: tableCategory,
          rowCount,
          sizeBytes,
          sizeFormatted: this.formatBytes(sizeBytes),
          dataSizeBytes,
          indexSizeBytes,
          toastSizeBytes,
          lastUpdated: null, // Would need trigger to track this
          cleanableRows: cleanupPolicy ? Math.floor(rowCount * 0.3) : 0,
          cleanableBytes,
          healthStatus,
          hasCleanupPolicy,
          cleanupPolicy,
        };
      });

      // Apply filters
      if (search) {
        const searchLower = search.toLowerCase();
        tables = tables.filter(
          (t) =>
            t.name.toLowerCase().includes(searchLower) ||
            t.displayName.toLowerCase().includes(searchLower),
        );
      }

      if (category) {
        tables = tables.filter((t) => t.category === category);
      }

      if (healthStatus) {
        tables = tables.filter((t) => t.healthStatus === healthStatus);
      }

      // Apply sorting
      tables.sort((a, b) => {
        let comparison = 0;
        switch (sortBy) {
          case "name":
            comparison = a.name.localeCompare(b.name);
            break;
          case "rows":
            comparison = a.rowCount - b.rowCount;
            break;
          case "size":
            comparison = a.sizeBytes - b.sizeBytes;
            break;
          case "category":
            comparison = a.category.localeCompare(b.category);
            break;
          case "status":
            const statusOrder = { critical: 0, warning: 1, healthy: 2 };
            comparison =
              statusOrder[a.healthStatus] - statusOrder[b.healthStatus];
            break;
          case "cleanable":
            comparison = a.cleanableBytes - b.cleanableBytes;
            break;
          default:
            comparison = a.sizeBytes - b.sizeBytes;
        }
        return sortOrder === "desc" ? -comparison : comparison;
      });

      // Calculate stats
      const stats = this.calculateStats(tables);

      // Apply pagination
      const total = tables.length;
      const start = (page - 1) * pageSize;
      const paginatedTables = tables.slice(start, start + pageSize);

      return {
        tables: paginatedTables,
        total,
        page,
        pageSize,
        stats,
      };
    } catch (error) {
      this.logger.error("Failed to get table list:", error);
      throw error;
    }
  }

  /**
   * Calculate aggregate statistics
   */
  private calculateStats(tables: TableInfoDto[]): TableStatsDto {
    const byCategory = {} as TableStatsDto["byCategory"];

    // Initialize all categories
    Object.values(TableCategory).forEach((cat) => {
      byCategory[cat] = { count: 0, rows: 0, sizeBytes: 0 };
    });

    let totalRows = 0;
    let totalSizeBytes = 0;
    let cleanableSizeBytes = 0;
    let healthy = 0;
    let warning = 0;
    let critical = 0;

    tables.forEach((t) => {
      totalRows += t.rowCount;
      totalSizeBytes += t.sizeBytes;
      cleanableSizeBytes += t.cleanableBytes;

      if (byCategory[t.category]) {
        byCategory[t.category].count++;
        byCategory[t.category].rows += t.rowCount;
        byCategory[t.category].sizeBytes += t.sizeBytes;
      }

      if (t.healthStatus === "healthy") healthy++;
      else if (t.healthStatus === "warning") warning++;
      else critical++;
    });

    return {
      totalTables: tables.length,
      totalRows,
      totalSizeBytes,
      totalSizeFormatted: this.formatBytes(totalSizeBytes),
      cleanableSizeBytes,
      cleanableSizeFormatted: this.formatBytes(cleanableSizeBytes),
      lastAnalyzed: new Date(),
      byCategory,
      healthSummary: { healthy, warning, critical },
    };
  }

  /**
   * Get detailed info for a single table
   */
  async getTableDetail(tableName: string): Promise<TableDetailDto> {
    try {
      // Get basic table info
      const tableInfo = await this.prisma.$queryRawUnsafe<
        Array<{
          row_estimate: string;
          total_bytes: string;
          table_bytes: string;
          index_bytes: string;
          toast_bytes: string;
        }>
      >(
        `
        SELECT
          c.reltuples::bigint::text as row_estimate,
          pg_total_relation_size(c.oid)::text as total_bytes,
          pg_relation_size(c.oid)::text as table_bytes,
          pg_indexes_size(c.oid)::text as index_bytes,
          COALESCE(pg_relation_size(c.reltoastrelid), 0)::text as toast_bytes
        FROM pg_class c
        WHERE c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
          AND c.relkind = 'r'
          AND c.relname = $1
      `,
        tableName,
      );

      if (!tableInfo.length) {
        throw new Error(`Table ${tableName} not found`);
      }

      const info = tableInfo[0];
      const rowCount = parseInt(info.row_estimate, 10) || 0;
      const sizeBytes = parseInt(info.total_bytes, 10) || 0;
      const dataSizeBytes = parseInt(info.table_bytes, 10) || 0;
      const indexSizeBytes = parseInt(info.index_bytes, 10) || 0;
      const toastSizeBytes = parseInt(info.toast_bytes, 10) || 0;

      // Get column info
      const columns = await this.prisma.$queryRawUnsafe<
        Array<{
          column_name: string;
          data_type: string;
          is_nullable: string;
          column_default: string | null;
          is_pk: boolean;
          fk_table: string | null;
        }>
      >(
        `
        SELECT
          c.column_name,
          c.data_type,
          c.is_nullable,
          c.column_default,
          COALESCE(pk.is_pk, false) as is_pk,
          fk.foreign_table_name as fk_table
        FROM information_schema.columns c
        LEFT JOIN (
          SELECT kcu.column_name, true as is_pk
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
          WHERE tc.table_name = $1 AND tc.constraint_type = 'PRIMARY KEY'
        ) pk ON c.column_name = pk.column_name
        LEFT JOIN (
          SELECT kcu.column_name, ccu.table_name as foreign_table_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
          JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
          WHERE tc.table_name = $1 AND tc.constraint_type = 'FOREIGN KEY'
        ) fk ON c.column_name = fk.column_name
        WHERE c.table_name = $1
        ORDER BY c.ordinal_position
      `,
        tableName,
      );

      const schema: TableColumnDto[] = columns.map((col) => ({
        name: col.column_name,
        type: col.data_type,
        nullable: col.is_nullable === "YES",
        defaultValue: col.column_default,
        isPrimaryKey: col.is_pk,
        isForeignKey: !!col.fk_table,
        references: col.fk_table || undefined,
      }));

      // Get sample data (limit to 10 rows)
      let sampleData: Record<string, unknown>[] = [];
      try {
        sampleData = await this.prisma.$queryRawUnsafe(
          `SELECT * FROM "${tableName}" LIMIT 10`,
        );
      } catch (e) {
        this.logger.warn(`Failed to get sample data for ${tableName}:`, e);
      }

      // Get related tables (foreign keys)
      const relatedTables = [
        ...new Set(
          columns.filter((c) => c.fk_table).map((c) => c.fk_table as string),
        ),
      ];

      // Get constraints
      const constraintRows = await this.prisma.$queryRawUnsafe<
        Array<{
          constraint_name: string;
          constraint_type: string;
          column_name: string;
        }>
      >(
        `
        SELECT tc.constraint_name, tc.constraint_type, kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_name = $1
      `,
        tableName,
      );

      const constraintMap = new Map<string, TableConstraintDto>();
      constraintRows.forEach((row) => {
        if (!constraintMap.has(row.constraint_name)) {
          constraintMap.set(row.constraint_name, {
            name: row.constraint_name,
            type: row.constraint_type as TableConstraintDto["type"],
            columns: [],
          });
        }
        constraintMap.get(row.constraint_name)!.columns.push(row.column_name);
      });

      const tableCategory = this.getCategory(tableName);
      const cleanupPolicy = CLEANUP_POLICIES[tableName];
      const hasCleanupPolicy = !!cleanupPolicy;
      const cleanableBytes = cleanupPolicy ? Math.floor(sizeBytes * 0.3) : 0;
      const healthStatus = this.determineHealthStatus(
        rowCount,
        sizeBytes,
        cleanableBytes,
        hasCleanupPolicy,
      );

      return {
        name: tableName,
        displayName: this.getDisplayName(tableName),
        category: tableCategory,
        rowCount,
        sizeBytes,
        sizeFormatted: this.formatBytes(sizeBytes),
        dataSizeBytes,
        indexSizeBytes,
        toastSizeBytes,
        lastUpdated: null,
        cleanableRows: cleanupPolicy ? Math.floor(rowCount * 0.3) : 0,
        cleanableBytes,
        healthStatus,
        hasCleanupPolicy,
        cleanupPolicy,
        schema,
        sampleData,
        relatedTables,
        constraints: Array.from(constraintMap.values()),
      };
    } catch (error) {
      this.logger.error(`Failed to get table detail for ${tableName}:`, error);
      throw error;
    }
  }

  /**
   * Get sample data from a table
   */
  async getTableSample(
    tableName: string,
    limit: number = 10,
  ): Promise<Record<string, unknown>[]> {
    try {
      // Validate table name to prevent SQL injection
      const validTables = await this.prisma.$queryRawUnsafe<
        Array<{ relname: string }>
      >(
        `
        SELECT c.relname
        FROM pg_class c
        WHERE c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
          AND c.relkind = 'r'
          AND c.relname = $1
      `,
        tableName,
      );

      if (!validTables.length) {
        throw new Error(`Table ${tableName} not found`);
      }

      return await this.prisma.$queryRawUnsafe(
        `SELECT * FROM "${tableName}" LIMIT ${Math.min(limit, 100)}`,
      );
    } catch (error) {
      this.logger.error(`Failed to get sample for ${tableName}:`, error);
      throw error;
    }
  }

  /**
   * Diagnose a table for issues and recommendations
   */
  async diagnoseTable(tableName: string): Promise<TableDiagnosisDto> {
    const issues: DiagnosisIssue[] = [];
    const recommendations: string[] = [];

    try {
      const detail = await this.getTableDetail(tableName);

      // Check for large table
      if (detail.sizeBytes > 500 * 1024 * 1024) {
        // > 500MB
        issues.push({
          severity: "critical",
          type: "large_table",
          message: `Table is very large (${detail.sizeFormatted})`,
          details: { size: detail.sizeBytes },
        });
        recommendations.push(
          "Consider archiving old data or implementing partitioning",
        );
      } else if (detail.sizeBytes > 100 * 1024 * 1024) {
        // > 100MB
        issues.push({
          severity: "warning",
          type: "large_table",
          message: `Table is moderately large (${detail.sizeFormatted})`,
          details: { size: detail.sizeBytes },
        });
      }

      // Check for missing cleanup policy
      if (!detail.hasCleanupPolicy && detail.rowCount > 10000) {
        issues.push({
          severity: "warning",
          type: "missing_cleanup",
          message: "No cleanup policy defined for large table",
          details: { rowCount: detail.rowCount },
        });
        recommendations.push(
          "Consider adding a cleanup policy based on age or status",
        );
      }

      // Check for high TOAST ratio (indicates large JSON/text columns)
      if (detail.toastSizeBytes > detail.dataSizeBytes) {
        issues.push({
          severity: "info",
          type: "bloat",
          message: "Table has significant TOAST data (large text/JSON fields)",
          details: {
            toastSize: detail.toastSizeBytes,
            dataSize: detail.dataSizeBytes,
          },
        });
        recommendations.push(
          "Consider compressing or archiving large text/JSON data",
        );
      }

      // Check index ratio
      if (
        detail.indexSizeBytes > detail.dataSizeBytes * 2 &&
        detail.sizeBytes > 10 * 1024 * 1024
      ) {
        issues.push({
          severity: "warning",
          type: "bloat",
          message: "Indexes are unusually large compared to data",
          details: {
            indexSize: detail.indexSizeBytes,
            dataSize: detail.dataSizeBytes,
          },
        });
        recommendations.push("Review indexes for redundancy, consider REINDEX");
      }

      // Calculate health score
      let healthScore = 100;
      issues.forEach((issue) => {
        if (issue.severity === "critical") healthScore -= 30;
        else if (issue.severity === "warning") healthScore -= 15;
        else healthScore -= 5;
      });
      healthScore = Math.max(0, healthScore);

      // Build cleanup suggestion if applicable
      let cleanupSuggestion = undefined;
      if (detail.cleanupPolicy) {
        const policy = detail.cleanupPolicy;
        let query = "";
        let description = "";

        if (policy.type === "age" && policy.field && policy.threshold) {
          query = `DELETE FROM "${tableName}" WHERE "${policy.field}" < NOW() - INTERVAL '${policy.threshold} days'`;
          description = `Delete records older than ${policy.threshold} days based on ${policy.field}`;
        } else if (policy.type === "status" && policy.condition) {
          query = `DELETE FROM "${tableName}" WHERE status IN (${policy.condition
            .split(" OR ")
            .map((s) => `'${s.trim()}'`)
            .join(", ")})`;
          description = `Delete records with status: ${policy.condition}`;
        }

        if (query) {
          cleanupSuggestion = {
            estimatedRows: detail.cleanableRows,
            estimatedBytes: detail.cleanableBytes,
            query,
            description,
          };
        }
      }

      return {
        tableName,
        analyzedAt: new Date(),
        issues,
        recommendations,
        healthScore,
        cleanupSuggestion,
      };
    } catch (error) {
      this.logger.error(`Failed to diagnose table ${tableName}:`, error);
      throw error;
    }
  }

  /**
   * Diagnose all tables
   */
  async diagnoseBatch(): Promise<TableDiagnosisDto[]> {
    const { tables } = await this.getTableList({ pageSize: 1000 });
    const results: TableDiagnosisDto[] = [];

    for (const table of tables) {
      try {
        const diagnosis = await this.diagnoseTable(table.name);
        if (diagnosis.issues.length > 0) {
          results.push(diagnosis);
        }
      } catch (e) {
        this.logger.warn(`Failed to diagnose ${table.name}:`, e);
      }
    }

    return results;
  }

  /**
   * Get aggregate statistics only
   */
  async getStats(): Promise<TableStatsDto> {
    const { stats } = await this.getTableList({ pageSize: 1000 });
    return stats;
  }

  /**
   * Execute cleanup for a specific table
   */
  async cleanupTable(tableName: string): Promise<CleanupResultDto> {
    const startTime = Date.now();
    const policy = CLEANUP_POLICIES[tableName];

    if (!policy) {
      return {
        success: false,
        tableName,
        deletedCount: 0,
        freedBytes: 0,
        freedFormatted: "0 B",
        message: `No cleanup policy defined for table ${tableName}`,
        duration: Date.now() - startTime,
      };
    }

    try {
      let deletedCount = 0;

      // Get size before
      const sizeBefore = await this.prisma.$queryRawUnsafe<
        Array<{ size: string }>
      >(`SELECT pg_total_relation_size('${tableName}')::text as size`);
      const beforeBytes = parseInt(sizeBefore[0]?.size || "0", 10);

      // Execute cleanup based on policy type
      if (policy.type === "age" && policy.field && policy.threshold) {
        const result = await this.prisma.$executeRawUnsafe(`
          DELETE FROM "${tableName}"
          WHERE "${policy.field}" < NOW() - INTERVAL '${policy.threshold} days'
        `);
        deletedCount = result;
      } else if (policy.type === "status" && policy.field && policy.condition) {
        const conditions = policy.condition.split(" OR ").map((s) => s.trim());
        const dateField = policy.dateField || "created_at";
        const result = await this.prisma.$executeRawUnsafe(`
          DELETE FROM "${tableName}"
          WHERE "${policy.field}" IN (${conditions.map((c) => `'${c}'`).join(", ")})
          ${policy.threshold ? `AND "${dateField}" < NOW() - INTERVAL '${policy.threshold} days'` : ""}
        `);
        deletedCount = result;
      }

      // Get size after
      const sizeAfter = await this.prisma.$queryRawUnsafe<
        Array<{ size: string }>
      >(`SELECT pg_total_relation_size('${tableName}')::text as size`);
      const afterBytes = parseInt(sizeAfter[0]?.size || "0", 10);
      const freedBytes = Math.max(0, beforeBytes - afterBytes);

      return {
        success: true,
        tableName,
        deletedCount,
        freedBytes,
        freedFormatted: this.formatBytes(freedBytes),
        message: `Cleaned up ${deletedCount} rows, freed ${this.formatBytes(freedBytes)}`,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      this.logger.error(`Failed to cleanup table ${tableName}:`, error);
      return {
        success: false,
        tableName,
        deletedCount: 0,
        freedBytes: 0,
        freedFormatted: "0 B",
        message: `Cleanup failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Run cleanup on all tables with cleanup policies
   */
  async cleanupBatch(): Promise<CleanupResultDto[]> {
    const results: CleanupResultDto[] = [];
    const tablesWithPolicies = Object.keys(CLEANUP_POLICIES);

    this.logger.log(
      `Running batch cleanup on ${tablesWithPolicies.length} tables`,
    );

    for (const tableName of tablesWithPolicies) {
      try {
        const result = await this.cleanupTable(tableName);
        if (result.deletedCount > 0) {
          results.push(result);
          this.logger.log(
            `Cleaned ${tableName}: ${result.deletedCount} rows, freed ${result.freedFormatted}`,
          );
        }
      } catch (error) {
        this.logger.warn(`Failed to cleanup ${tableName}:`, error);
      }
    }

    this.logger.log(
      `Batch cleanup completed: ${results.length} tables cleaned`,
    );
    return results;
  }
}
