/**
 * SQL Executor Tool
 * SQL 查询执行工具 - 执行 SQL 查询并返回结构化结果
 */

import { Injectable, Logger } from "@nestjs/common";
import { BaseTool } from "../../base/base-tool";
import {
  ToolContext,
  JSONSchema,
  ToolCategory,
} from "../../abstractions/tool.interface";

import { PrismaService } from "@/common/prisma/prisma.service";

// ============================================================================
// Types
// ============================================================================

export interface SQLExecutorInput {
  /**
   * SQL 查询语句
   */
  query: string;

  /**
   * 查询参数（用于参数化查询，防止 SQL 注入）
   */
  parameters?: Record<string, unknown>;

  /**
   * 执行选项
   */
  options?: {
    /**
     * 超时时间（毫秒），默认 30000
     */
    timeout?: number;

    /**
     * 最大返回行数，默认 1000
     */
    maxRows?: number;

    /**
     * 是否只读模式，默认 true（建议始终为 true）
     */
    readOnly?: boolean;
  };
}

export interface SQLExecutorOutput {
  /**
   * 是否执行成功
   */
  success: boolean;

  /**
   * 查询结果（SELECT）
   */
  rows?: Array<Record<string, unknown>>;

  /**
   * 影响的行数（INSERT/UPDATE/DELETE）
   */
  rowCount?: number;

  /**
   * 列信息
   */
  columns?: Array<{
    name: string;
    type: string;
  }>;

  /**
   * 错误信息（如果有）
   */
  error?: string;

  /**
   * 执行时间（毫秒）
   */
  executionTime: number;

  /**
   * 元数据
   */
  metadata?: {
    /**
     * 查询类型（SELECT, INSERT, UPDATE, DELETE 等）
     */
    queryType: string;

    /**
     * 是否被截断
     */
    truncated: boolean;
  };
}

// ============================================================================
// Tool Implementation
// ============================================================================

@Injectable()
export class SQLExecutorTool extends BaseTool<
  SQLExecutorInput,
  SQLExecutorOutput
> {
  private readonly logger = new Logger(SQLExecutorTool.name);

  readonly id = "sql-executor";
  readonly category: ToolCategory = "execution";
  readonly name = "SQL 查询执行";
  readonly description =
    "执行 SQL 查询并返回结构化结果。支持参数化查询以防止 SQL 注入。默认只读模式，适用于数据查询和分析场景。";

  readonly inputSchema: JSONSchema = {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "SQL 查询语句。使用 $1, $2 等占位符进行参数化查询。",
      },
      parameters: {
        type: "object",
        description: "查询参数，用于替换占位符",
      },
      options: {
        type: "object",
        description: "执行选项",
        properties: {
          timeout: {
            type: "number",
            description: "超时时间（毫秒），默认 30000",
            default: 30000,
          },
          maxRows: {
            type: "number",
            description: "最大返回行数，默认 1000",
            default: 1000,
          },
          readOnly: {
            type: "boolean",
            description: "是否只读模式，默认 true",
            default: true,
          },
        },
      },
    },
    required: ["query"],
  };

  readonly outputSchema: JSONSchema = {
    type: "object",
    properties: {
      success: {
        type: "boolean",
        description: "是否执行成功",
      },
      rows: {
        type: "array",
        description: "查询结果",
        items: {
          type: "object",
        },
      },
      rowCount: {
        type: "number",
        description: "影响的行数",
      },
      columns: {
        type: "array",
        description: "列信息",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            type: { type: "string" },
          },
        },
      },
      error: {
        type: "string",
        description: "错误信息",
      },
      executionTime: {
        type: "number",
        description: "执行时间（毫秒）",
      },
      metadata: {
        type: "object",
        description: "元数据",
        properties: {
          queryType: { type: "string" },
          truncated: { type: "boolean" },
        },
      },
    },
  };

  constructor(private readonly prisma: PrismaService) {
    super();
    // defaultTimeout set in class property // 60 秒超时
  }

  validateInput(input: SQLExecutorInput) {
    if (!input.query || typeof input.query !== "string") {
      return false;
    }

    const query = input.query.trim();
    if (query.length === 0) {
      return false;
    }

    // 检查是否为安全的 SQL 查询
    if (!this.isQuerySafe(query, input.options?.readOnly ?? true)) {
      this.logger.warn("Unsafe SQL query detected");
      return false;
    }

    return true;
  }

  protected async doExecute(
    input: SQLExecutorInput,
    _context: ToolContext,
  ): Promise<SQLExecutorOutput> {
    const { query, parameters, options } = input;
    const maxRows = options?.maxRows || 1000;
    const readOnly = options?.readOnly ?? true;

    this.logger.log(
      `Executing SQL query (readOnly: ${readOnly}, maxRows: ${maxRows})`,
    );

    const startTime = Date.now();

    try {
      // 检测查询类型
      const queryType = this.detectQueryType(query);

      // 如果是只读模式，只允许 SELECT 查询
      if (readOnly && queryType !== "SELECT") {
        throw new Error(
          `Read-only mode: only SELECT queries are allowed. Got: ${queryType}`,
        );
      }

      // 处理参数化查询
      const processedQuery = this.processParameterizedQuery(
        query,
        parameters || {},
      );

      // 执行查询
      const result = await this.executeQuery(processedQuery, maxRows);
      const executionTime = Date.now() - startTime;

      this.logger.log(
        `SQL execution completed: success=true, rows=${result.rows?.length || 0}, time=${executionTime}ms`,
      );

      return {
        success: true,
        ...result,
        executionTime,
        metadata: {
          queryType,
          truncated: (result.rows?.length || 0) >= maxRows,
        },
      };
    } catch (error: unknown) {
      const executionTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(`SQL execution failed: ${errorMessage}`);

      return {
        success: false,
        error: errorMessage,
        executionTime,
        metadata: {
          queryType: this.detectQueryType(query),
          truncated: false,
        },
      };
    }
  }

  /**
   * 执行 SQL 查询
   */
  private async executeQuery(
    query: string,
    maxRows: number,
  ): Promise<Partial<SQLExecutorOutput>> {
    try {
      // 使用 Prisma 的 $queryRawUnsafe 执行原始 SQL
      // 注意：这里使用 unsafe 是因为我们已经在 validateInput 中进行了安全检查
      const rows = (await this.prisma.$queryRawUnsafe(query)) as Array<
        Record<string, unknown>
      >;

      // 限制返回行数
      const limitedRows = rows.slice(0, maxRows);

      // 提取列信息（从第一行）
      const columns =
        limitedRows.length > 0
          ? Object.keys(limitedRows[0]).map((name) => ({
              name,
              type: typeof limitedRows[0][name],
            }))
          : [];

      return {
        rows: limitedRows,
        rowCount: rows.length,
        columns,
      };
    } catch (error: unknown) {
      throw error;
    }
  }

  /**
   * 检测查询类型
   */
  private detectQueryType(query: string): string {
    const trimmedQuery = query.trim().toUpperCase();

    if (trimmedQuery.startsWith("SELECT")) return "SELECT";
    if (trimmedQuery.startsWith("INSERT")) return "INSERT";
    if (trimmedQuery.startsWith("UPDATE")) return "UPDATE";
    if (trimmedQuery.startsWith("DELETE")) return "DELETE";
    if (trimmedQuery.startsWith("CREATE")) return "CREATE";
    if (trimmedQuery.startsWith("ALTER")) return "ALTER";
    if (trimmedQuery.startsWith("DROP")) return "DROP";
    if (trimmedQuery.startsWith("TRUNCATE")) return "TRUNCATE";

    return "UNKNOWN";
  }

  /**
   * 检查 SQL 查询是否安全
   */
  private isQuerySafe(query: string, readOnly: boolean): boolean {
    const upperQuery = query.toUpperCase();

    // 只读模式：只允许 SELECT 和 WITH (CTE)
    if (readOnly) {
      const allowedKeywords = ["SELECT", "WITH"];
      const startsWithAllowed = allowedKeywords.some((keyword) =>
        upperQuery.trim().startsWith(keyword),
      );

      if (!startsWithAllowed) {
        this.logger.warn(
          `Read-only mode violation: query does not start with SELECT or WITH`,
        );
        return false;
      }
    }

    // 危险关键字检查（适用于所有模式）
    const dangerousKeywords = [
      "DROP DATABASE",
      "DROP SCHEMA",
      "GRANT",
      "REVOKE",
      "SHUTDOWN",
      "EXEC",
      "EXECUTE",
      "xp_",
      "sp_",
    ];

    for (const keyword of dangerousKeywords) {
      if (upperQuery.includes(keyword)) {
        this.logger.warn(`Dangerous keyword detected: ${keyword}`);
        return false;
      }
    }

    // 检查是否包含多个语句（防止 SQL 注入）
    const semicolonCount = (query.match(/;/g) || []).length;
    if (semicolonCount > 1) {
      this.logger.warn("Multiple statements detected");
      return false;
    }

    return true;
  }

  /**
   * 处理参数化查询
   * 将命名参数转换为实际值
   */
  private processParameterizedQuery(
    query: string,
    parameters: Record<string, unknown>,
  ): string {
    let processedQuery = query;

    // 替换命名参数 :paramName
    Object.entries(parameters).forEach(([key, value]) => {
      const placeholder = new RegExp(`:${key}\\b`, "g");
      const escapedValue = this.escapeValue(value);
      processedQuery = processedQuery.replace(placeholder, escapedValue);
    });

    // 替换位置参数 $1, $2, ...
    const positionalParams = Object.values(parameters);
    positionalParams.forEach((value, index) => {
      const placeholder = new RegExp(`\\$${index + 1}\\b`, "g");
      const escapedValue = this.escapeValue(value);
      processedQuery = processedQuery.replace(placeholder, escapedValue);
    });

    return processedQuery;
  }

  /**
   * 转义 SQL 值
   */
  private escapeValue(value: unknown): string {
    if (value === null || value === undefined) {
      return "NULL";
    }

    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }

    if (typeof value === "string") {
      // 转义单引号
      return `'${value.replace(/'/g, "''")}'`;
    }

    if (value instanceof Date) {
      return `'${value.toISOString()}'`;
    }

    // 其他类型转换为 JSON 字符串
    return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  }
}
