/**
 * Search Adapter Base Class
 *
 * Provides common patterns for all search adapters:
 * - Timeout wrapping (Promise.race)
 * - Circuit breaker integration
 * - Error handling and logging
 * - Tool execution helper
 */

import { Injectable, Logger, Optional } from "@nestjs/common";
import {
  CircuitBreakerService,
  TaskCompletionType,
} from "@/modules/ai-kernel/facade";
import { ToolRegistry, type ToolContext } from "@/modules/ai-engine/facade";
import type { DataSourceResult } from "../../../types/data-source.types";
import type {
  ISearchAdapter,
  AdapterSearchRequest,
  AdapterSearchResult,
  QueryContext,
} from "../search.types";
import { DataSourceType } from "../../../types/data-source.types";

@Injectable()
export abstract class SearchAdapterBase implements ISearchAdapter {
  protected abstract readonly logger: Logger;

  abstract readonly sourceId: string;
  abstract readonly sourceType: DataSourceType;
  readonly additionalTypes?: DataSourceType[];
  abstract readonly concurrency: number;
  abstract readonly defaultTimeoutMs: number;

  constructor(
    @Optional() protected readonly circuitBreaker?: CircuitBreakerService,
  ) {}

  /**
   * Subclass implements the actual search logic.
   * Timeout and CB are handled by the base class.
   */
  protected abstract doSearch(
    request: AdapterSearchRequest,
  ): Promise<DataSourceResult[]>;

  /**
   * Format a base query for this source. Default: passthrough.
   */
  formatQuery(baseQuery: string, _context?: QueryContext): string {
    return baseQuery;
  }

  /**
   * Check if adapter is operational. Default: always available.
   */
  async isAvailable(): Promise<boolean> {
    return true;
  }

  /**
   * Execute a search with timeout + circuit breaker wrapping.
   */
  async search(request: AdapterSearchRequest): Promise<AdapterSearchResult> {
    const entityId = `datasource:${this.sourceId}`;
    const timeoutMs = request.timeoutMs || this.defaultTimeoutMs;
    const startTime = Date.now();

    // Circuit breaker check
    if (this.circuitBreaker && !this.circuitBreaker.canExecute(entityId)) {
      this.logger.warn(
        `[search] Circuit breaker OPEN for ${entityId}, skipping`,
      );
      return {
        items: [],
        sourceMetrics: {
          sourceId: this.sourceId,
          durationMs: 0,
          queryUsed: request.query,
          error: "circuit_breaker_open",
        },
      };
    }

    // Abort check
    if (request.signal?.aborted) {
      return {
        items: [],
        sourceMetrics: {
          sourceId: this.sourceId,
          durationMs: 0,
          queryUsed: request.query,
          error: "cancelled",
        },
      };
    }

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    try {
      // Execute with timeout
      const searchPromise = this.doSearch(request);
      const timeoutPromise = new Promise<DataSourceResult[]>((_, reject) => {
        timeoutHandle = setTimeout(
          () => reject(new Error(`${this.sourceId} timeout (${timeoutMs}ms)`)),
          timeoutMs,
        );
      });

      const items = await Promise.race([searchPromise, timeoutPromise]);
      clearTimeout(timeoutHandle);
      const durationMs = Date.now() - startTime;

      // Record CB success
      if (this.circuitBreaker) {
        this.circuitBreaker.recordSuccess(entityId, durationMs);
      }

      return {
        items,
        sourceMetrics: {
          sourceId: this.sourceId,
          durationMs,
          queryUsed: request.query,
          totalAvailable: items.length,
        },
      };
    } catch (error) {
      clearTimeout(timeoutHandle);
      const durationMs = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);

      // Record CB failure
      if (this.circuitBreaker) {
        const errorType = errorMsg.includes("timeout")
          ? TaskCompletionType.TIMEOUT
          : TaskCompletionType.API_ERROR;
        this.circuitBreaker.recordFailure(entityId, errorType, errorMsg);
      }

      this.logger.warn(
        `[search] ${this.sourceId} failed (${durationMs}ms): ${errorMsg}`,
      );

      return {
        items: [],
        sourceMetrics: {
          sourceId: this.sourceId,
          durationMs,
          queryUsed: request.query,
          error: errorMsg,
        },
      };
    }
  }

  // ============================================================================
  // Helpers for subclasses
  // ============================================================================

  /**
   * Execute a tool via ToolRegistry and convert results to DataSourceResult[].
   */
  protected async executeToolSearch(
    toolRegistry: ToolRegistry,
    toolId: string,
    input: Record<string, unknown>,
    converter: (toolResult: Record<string, unknown>) => DataSourceResult[],
  ): Promise<DataSourceResult[]> {
    const tool = toolRegistry.tryGet(toolId);
    if (!tool) {
      this.logger.error(`[executeToolSearch] ${toolId} not registered`);
      return [];
    }

    const context: ToolContext = {
      executionId: `topic-insights-${toolId}-${Date.now()}`,
      toolId,
      callerType: "orchestrator",
      createdAt: new Date(),
    };

    const result = await tool.execute(input, context);
    if (!result.success || !result.data) {
      this.logger.warn(
        `[executeToolSearch] ${toolId} returned success=${result.success}`,
      );
      return [];
    }
    return converter(result.data as Record<string, unknown>);
  }
}
