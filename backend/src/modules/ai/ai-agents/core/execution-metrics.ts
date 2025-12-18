/**
 * Execution Metrics
 * 执行监控指标 - 收集和分析工具执行数据
 */

import { Injectable, Logger } from "@nestjs/common";
import { ToolType, AgentType } from "./agent.types";

// ============================================================================
// Types
// ============================================================================

/**
 * 单次工具执行记录
 */
export interface ToolExecutionRecord {
  /**
   * 工具类型
   */
  tool: ToolType;

  /**
   * 任务 ID
   */
  taskId: string;

  /**
   * 开始时间
   */
  startTime: Date;

  /**
   * 结束时间
   */
  endTime: Date;

  /**
   * 执行时长（毫秒）
   */
  duration: number;

  /**
   * 是否成功
   */
  success: boolean;

  /**
   * 错误信息（如果失败）
   */
  error?: string;

  /**
   * 重试次数
   */
  retries: number;

  /**
   * 输入大小（字节）
   */
  inputSize?: number;

  /**
   * 输出大小（字节）
   */
  outputSize?: number;
}

/**
 * 工具统计信息
 */
export interface ToolStats {
  /**
   * 工具类型
   */
  tool: ToolType;

  /**
   * 总调用次数
   */
  totalCalls: number;

  /**
   * 成功次数
   */
  successCount: number;

  /**
   * 失败次数
   */
  failureCount: number;

  /**
   * 成功率
   */
  successRate: number;

  /**
   * 平均执行时间（毫秒）
   */
  avgDuration: number;

  /**
   * 最小执行时间（毫秒）
   */
  minDuration: number;

  /**
   * 最大执行时间（毫秒）
   */
  maxDuration: number;

  /**
   * P50 执行时间（毫秒）
   */
  p50Duration: number;

  /**
   * P95 执行时间（毫秒）
   */
  p95Duration: number;

  /**
   * P99 执行时间（毫秒）
   */
  p99Duration: number;

  /**
   * 总重试次数
   */
  totalRetries: number;

  /**
   * 最后调用时间
   */
  lastCallTime?: Date;
}

/**
 * Agent 执行记录
 */
export interface AgentExecutionRecord {
  /**
   * Agent 类型
   */
  agent: AgentType;

  /**
   * 任务 ID
   */
  taskId: string;

  /**
   * 开始时间
   */
  startTime: Date;

  /**
   * 结束时间
   */
  endTime: Date;

  /**
   * 执行时长（毫秒）
   */
  duration: number;

  /**
   * 是否成功
   */
  success: boolean;

  /**
   * 工具调用次数
   */
  toolCalls: number;

  /**
   * Token 使用量
   */
  tokensUsed: number;

  /**
   * 迭代次数（Function Calling 模式）
   */
  iterations: number;
}

/**
 * 系统整体指标
 */
export interface SystemMetrics {
  /**
   * 总任务数
   */
  totalTasks: number;

  /**
   * 成功任务数
   */
  successfulTasks: number;

  /**
   * 失败任务数
   */
  failedTasks: number;

  /**
   * 总工具调用次数
   */
  totalToolCalls: number;

  /**
   * 总 Token 使用量
   */
  totalTokensUsed: number;

  /**
   * 平均任务时长（毫秒）
   */
  avgTaskDuration: number;

  /**
   * 系统运行时间（毫秒）
   */
  uptime: number;

  /**
   * 最后更新时间
   */
  lastUpdated: Date;
}

// ============================================================================
// Metrics Collector
// ============================================================================

/**
 * 执行指标收集器
 * 收集和分析工具/Agent 执行数据
 */
@Injectable()
export class ExecutionMetricsCollector {
  private readonly logger = new Logger(ExecutionMetricsCollector.name);

  /**
   * 工具执行记录（最近 1000 条）
   */
  private readonly toolRecords: ToolExecutionRecord[] = [];

  /**
   * Agent 执行记录（最近 500 条）
   */
  private readonly agentRecords: AgentExecutionRecord[] = [];

  /**
   * 记录保留数量限制
   */
  private readonly maxToolRecords = 1000;
  private readonly maxAgentRecords = 500;

  /**
   * 系统启动时间
   */
  private readonly startTime = new Date();

  /**
   * 记录工具执行
   */
  recordToolExecution(record: ToolExecutionRecord): void {
    this.toolRecords.push(record);

    // 限制记录数量
    if (this.toolRecords.length > this.maxToolRecords) {
      this.toolRecords.shift();
    }

    this.logger.debug(
      `[recordToolExecution] ${record.tool}: ${record.success ? "success" : "failed"} in ${record.duration}ms`,
    );
  }

  /**
   * 记录 Agent 执行
   */
  recordAgentExecution(record: AgentExecutionRecord): void {
    this.agentRecords.push(record);

    // 限制记录数量
    if (this.agentRecords.length > this.maxAgentRecords) {
      this.agentRecords.shift();
    }

    this.logger.debug(
      `[recordAgentExecution] ${record.agent}: ${record.success ? "success" : "failed"} in ${record.duration}ms`,
    );
  }

  /**
   * 获取工具统计信息
   */
  getToolStats(tool: ToolType): ToolStats {
    const records = this.toolRecords.filter((r) => r.tool === tool);

    if (records.length === 0) {
      return {
        tool,
        totalCalls: 0,
        successCount: 0,
        failureCount: 0,
        successRate: 0,
        avgDuration: 0,
        minDuration: 0,
        maxDuration: 0,
        p50Duration: 0,
        p95Duration: 0,
        p99Duration: 0,
        totalRetries: 0,
      };
    }

    const successRecords = records.filter((r) => r.success);
    const durations = records.map((r) => r.duration).sort((a, b) => a - b);

    return {
      tool,
      totalCalls: records.length,
      successCount: successRecords.length,
      failureCount: records.length - successRecords.length,
      successRate: successRecords.length / records.length,
      avgDuration: this.average(durations),
      minDuration: durations[0],
      maxDuration: durations[durations.length - 1],
      p50Duration: this.percentile(durations, 50),
      p95Duration: this.percentile(durations, 95),
      p99Duration: this.percentile(durations, 99),
      totalRetries: records.reduce((sum, r) => sum + r.retries, 0),
      lastCallTime: records[records.length - 1]?.endTime,
    };
  }

  /**
   * 获取所有工具的统计信息
   */
  getAllToolStats(): ToolStats[] {
    const toolTypes = new Set(this.toolRecords.map((r) => r.tool));
    return Array.from(toolTypes).map((tool) => this.getToolStats(tool));
  }

  /**
   * 获取系统整体指标
   */
  getSystemMetrics(): SystemMetrics {
    const totalTasks = this.agentRecords.length;
    const successfulTasks = this.agentRecords.filter((r) => r.success).length;
    const totalToolCalls = this.toolRecords.length;
    const totalTokensUsed = this.agentRecords.reduce(
      (sum, r) => sum + r.tokensUsed,
      0,
    );
    const avgTaskDuration =
      totalTasks > 0
        ? this.agentRecords.reduce((sum, r) => sum + r.duration, 0) / totalTasks
        : 0;

    return {
      totalTasks,
      successfulTasks,
      failedTasks: totalTasks - successfulTasks,
      totalToolCalls,
      totalTokensUsed,
      avgTaskDuration,
      uptime: Date.now() - this.startTime.getTime(),
      lastUpdated: new Date(),
    };
  }

  /**
   * 获取最近的错误
   */
  getRecentErrors(limit = 10): ToolExecutionRecord[] {
    return this.toolRecords
      .filter((r) => !r.success)
      .slice(-limit)
      .reverse();
  }

  /**
   * 获取性能最慢的工具
   */
  getSlowestTools(limit = 5): ToolStats[] {
    return this.getAllToolStats()
      .sort((a, b) => b.avgDuration - a.avgDuration)
      .slice(0, limit);
  }

  /**
   * 获取失败率最高的工具
   */
  getMostFailingTools(limit = 5): ToolStats[] {
    return this.getAllToolStats()
      .filter((s) => s.totalCalls > 0)
      .sort((a, b) => 1 - a.successRate - (1 - b.successRate))
      .reverse()
      .slice(0, limit);
  }

  /**
   * 清空所有记录
   */
  clear(): void {
    this.toolRecords.length = 0;
    this.agentRecords.length = 0;
    this.logger.log("[clear] All metrics cleared");
  }

  /**
   * 导出所有指标数据
   */
  exportMetrics(): {
    systemMetrics: SystemMetrics;
    toolStats: ToolStats[];
    recentErrors: ToolExecutionRecord[];
    toolRecords: ToolExecutionRecord[];
    agentRecords: AgentExecutionRecord[];
  } {
    return {
      systemMetrics: this.getSystemMetrics(),
      toolStats: this.getAllToolStats(),
      recentErrors: this.getRecentErrors(),
      toolRecords: [...this.toolRecords],
      agentRecords: [...this.agentRecords],
    };
  }

  // ============================================================================
  // 辅助方法
  // ============================================================================

  /**
   * 计算平均值
   */
  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  /**
   * 计算百分位数
   */
  private percentile(sortedValues: number[], p: number): number {
    if (sortedValues.length === 0) return 0;
    const index = Math.ceil((p / 100) * sortedValues.length) - 1;
    return sortedValues[Math.max(0, index)];
  }
}

// ============================================================================
// Metrics Decorator
// ============================================================================

/**
 * 工具执行监控装饰器
 * 自动记录工具执行指标
 */
export function TrackToolExecution(collector: ExecutionMetricsCollector) {
  return function (
    _target: any,
    _propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const startTime = new Date();
      let success = true;
      let error: string | undefined;

      try {
        return await originalMethod.apply(this, args);
      } catch (e) {
        success = false;
        error = e instanceof Error ? e.message : String(e);
        throw e;
      } finally {
        const endTime = new Date();
        const tool = (this as any).type as ToolType;
        const context = args[1] || {};

        collector.recordToolExecution({
          tool,
          taskId: context.taskId || "unknown",
          startTime,
          endTime,
          duration: endTime.getTime() - startTime.getTime(),
          success,
          error,
          retries: 0,
        });
      }
    };

    return descriptor;
  };
}
