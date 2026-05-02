/**
 * AI Engine - Tool Pipeline
 * 工具执行管道
 */

import { v4 as uuid } from "uuid";
import { ITool, ToolContext, ToolResult } from "../abstractions/tool.interface";
import { IToolMiddleware, IMiddlewareChain } from "./middleware.interface";
import { ToolError } from "@/modules/ai-engine/tools/abstractions/tool-error";
import { ToolResultCacheService } from "../cache/tool-result-cache.service";

/**
 * 工具执行管道
 * 管理中间件链并执行工具
 */
export class ToolPipeline implements IMiddlewareChain {
  private middlewares: IToolMiddleware[] = [];

  constructor(private readonly cacheService?: ToolResultCacheService) {}

  /**
   * 添加中间件
   */
  use(middleware: IToolMiddleware): this {
    this.middlewares.push(middleware);
    // 按优先级排序
    this.middlewares.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
    return this;
  }

  /**
   * 移除中间件
   */
  remove(name: string): boolean {
    const index = this.middlewares.findIndex((m) => m.name === name);
    if (index !== -1) {
      this.middlewares.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * 获取所有中间件
   */
  getAll(): IToolMiddleware[] {
    return [...this.middlewares];
  }

  /**
   * 执行工具（带中间件链）
   */
  async execute<TInput, TOutput>(
    tool: ITool<TInput, TOutput>,
    input: TInput,
    context: ToolContext,
  ): Promise<ToolResult<TOutput>> {
    let currentInput: unknown = input;
    const startTime = new Date();

    // 确保有执行 ID
    if (!context.executionId) {
      context.executionId = uuid();
    }

    // Resolve missionId from context (playground sets metadata.missionId)
    const missionId =
      (context.metadata?.missionId as string | undefined) ?? context.taskId;

    // Determine whether this tool's results are cacheable
    const cacheable = this.cacheService?.isCacheable(tool.sideEffect) ?? false;
    const cacheKey = cacheable
      ? this.cacheService!.buildKey(missionId, tool.id, input)
      : "";

    try {
      // 执行所有 before 中间件
      for (const middleware of this.middlewares) {
        if (middleware.before) {
          const result = await middleware.before(currentInput, context, tool);
          if (result !== undefined) {
            currentInput = result;
          }
        }
      }

      // Cache lookup: skip tool.execute() on hit
      if (cacheable) {
        const cached =
          await this.cacheService!.tryGet<ToolResult<TOutput>>(cacheKey);
        if (cached !== null) {
          // Stamp fromCache flag and return immediately (skip after-middlewares)
          cached.metadata = {
            ...cached.metadata,
            extra: { ...(cached.metadata.extra ?? {}), fromCache: true },
          };
          return cached;
        }
      }

      // 执行工具
      let result = await tool.execute(currentInput as TInput, context);

      // Write successful result to cache
      if (cacheable && result.success) {
        await this.cacheService!.set(cacheKey, result);
      }

      // 执行所有 after 中间件（逆序）
      for (let i = this.middlewares.length - 1; i >= 0; i--) {
        const middleware = this.middlewares[i];
        if (middleware.after) {
          result = (await middleware.after(
            result,
            context,
            tool,
          )) as ToolResult<TOutput>;
        }
      }

      return result;
    } catch (error) {
      // 执行错误处理中间件
      for (const middleware of this.middlewares) {
        if (middleware.onError) {
          const recovery = await middleware.onError(
            error as Error,
            currentInput,
            context,
            tool,
          );
          if (recovery) {
            return recovery as ToolResult<TOutput>;
          }
        }
      }

      // 没有中间件处理，返回错误结果
      const toolError = ToolError.fromError(error, tool.id);
      return {
        success: false,
        error: {
          code: toolError.code,
          message: toolError.message,
          details: toolError.details,
          retryable: toolError.retryable,
        },
        metadata: {
          executionId: context.executionId,
          startTime,
          endTime: new Date(),
          duration: Date.now() - startTime.getTime(),
        },
      };
    }
  }
}

/**
 * 创建默认的工具管道
 */
export function createDefaultPipeline(): ToolPipeline {
  const pipeline = new ToolPipeline();

  // 可以在这里添加默认中间件
  // pipeline.use(new ValidationMiddleware());
  // pipeline.use(new TimeoutMiddleware());
  // pipeline.use(new LoggingMiddleware());

  return pipeline;
}

/**
 * 工具执行器
 * 封装工具注册表和管道
 */
export class ToolExecutor {
  constructor(private readonly pipeline: ToolPipeline) {}

  /**
   * 执行工具
   */
  async execute<TInput, TOutput>(
    tool: ITool<TInput, TOutput>,
    input: TInput,
    options?: Partial<ToolContext>,
  ): Promise<ToolResult<TOutput>> {
    const context: ToolContext = {
      executionId: uuid(),
      toolId: tool.id,
      createdAt: new Date(),
      ...options,
    };

    return this.pipeline.execute(tool, input, context);
  }
}
