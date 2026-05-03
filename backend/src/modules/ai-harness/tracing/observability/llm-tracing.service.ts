import { Injectable, Logger } from "@nestjs/common";

/**
 * AI Engine 可观测性服务
 *
 * 提供：
 * - LLM 调用追踪
 * - 工具执行追踪
 * - Agent 执行追踪
 * - 性能指标记录
 *
 * 注意：此服务提供本地日志追踪。
 * 详细指标收集由 AIMetricsService 处理并存储到数据库。
 */
@Injectable()
export class LlmTracingService {
  private readonly logger = new Logger(LlmTracingService.name);

  /**
   * 追踪 LLM 调用
   */
  async traceLLMCall<T>(
    operation: string,
    metadata: {
      model: string;
      provider?: string;
      inputTokens?: number;
      userId?: string;
    },
    fn: () => Promise<T>,
  ): Promise<T> {
    const startTime = Date.now();

    try {
      const result = await fn();
      const duration = Date.now() - startTime;

      this.logger.debug(
        `[LLM] ${operation} completed in ${duration}ms (model: ${metadata.model})`,
      );

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(
        `[LLM] ${operation} failed after ${duration}ms (model: ${metadata.model})`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  /**
   * 追踪工具执行
   */
  async traceToolExecution<T>(
    toolId: string,
    _metadata: {
      category?: string;
      userId?: string;
    },
    fn: () => Promise<T>,
  ): Promise<T> {
    const startTime = Date.now();

    try {
      const result = await fn();
      const duration = Date.now() - startTime;

      this.logger.debug(`[Tool] ${toolId} completed in ${duration}ms`);

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(
        `[Tool] ${toolId} failed after ${duration}ms`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  /**
   * 追踪 Agent 执行
   */
  async traceAgentExecution<T>(
    agentId: string,
    _metadata: {
      taskType?: string;
      userId?: string;
    },
    fn: () => Promise<T>,
  ): Promise<T> {
    const startTime = Date.now();

    try {
      const result = await fn();
      const duration = Date.now() - startTime;

      this.logger.debug(`[Agent] ${agentId} completed in ${duration}ms`);

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(
        `[Agent] ${agentId} failed after ${duration}ms`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  /**
   * 追踪 Mission 执行
   */
  async traceMissionExecution<T>(
    missionId: string,
    _metadata: {
      missionType?: string;
      userId?: string;
      topicId?: string;
    },
    fn: () => Promise<T>,
  ): Promise<T> {
    const startTime = Date.now();

    try {
      const result = await fn();
      const duration = Date.now() - startTime;

      this.logger.log(`[Mission] ${missionId} completed in ${duration}ms`);

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(
        `[Mission] ${missionId} failed after ${duration}ms`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  /**
   * 记录 AI 相关的自定义指标
   * 仅记录日志，详细指标收集由 AIMetricsService 处理
   */
  recordMetric(
    name: string,
    value: number,
    tags?: Record<string, string>,
  ): void {
    this.logger.debug(
      `[Metric] ${name}: ${value}`,
      tags ? JSON.stringify(tags) : undefined,
    );
  }
}
