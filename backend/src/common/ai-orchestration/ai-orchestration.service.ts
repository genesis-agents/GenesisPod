/**
 * AI Orchestration Service (重构版)
 *
 * 统一的 AI 调用编排服务 - 作为所有 AI 调用的唯一入口点 (Facade Pattern)
 *
 * 设计原则：
 * 1. 单一职责 (SRP): 只负责编排，具体调用委托给 Provider
 * 2. 开闭原则 (OCP): 新增 Provider 无需修改此服务
 * 3. 依赖倒置 (DIP): 依赖 IAIProvider 抽象，而非具体实现
 * 4. 里氏替换 (LSP): 所有 Provider 可互相替换
 */

import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ModelSelectorService } from "./model-selector.service";
import { FallbackManagerService } from "./fallback-manager.service";
import { AIProviderFactory } from "./providers";
import { AiTaskType, AiCallInput, AiCallResult, AiCallMetadata } from "./types";
import { AIErrorClassifier } from "./error-classifier";

/**
 * AI 调用追踪记录
 */
interface AiCallTrace {
  traceId: string;
  taskType: AiTaskType;
  modelId: string;
  provider: string;
  startTime: Date;
  endTime?: Date;
  status: "pending" | "success" | "failed";
  tokensUsed?: number;
  latencyMs?: number;
  error?: string;
  metadata?: AiCallMetadata;
}

/**
 * Trace 清理配置
 */
interface TraceCleanupConfig {
  maxSize: number;
  cleanupBatchSize: number;
  maxAgeMs: number;
}

@Injectable()
export class AiOrchestrationService implements OnModuleDestroy {
  private readonly logger = new Logger(AiOrchestrationService.name);

  // 内存中的调用追踪 (生产环境应使用数据库)
  private callTraces: Map<string, AiCallTrace> = new Map();

  // Trace 清理配置
  private readonly traceConfig: TraceCleanupConfig = {
    maxSize: 1000,
    cleanupBatchSize: 100, // 每次清理 100 条
    maxAgeMs: 30 * 60 * 1000, // 30 分钟过期
  };

  // 定时清理器
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly modelSelector: ModelSelectorService,
    private readonly fallbackManager: FallbackManagerService,
    private readonly providerFactory: AIProviderFactory,
    private readonly errorClassifier: AIErrorClassifier,
  ) {
    // 启动定时清理 (每 5 分钟)
    this.cleanupInterval = setInterval(
      () => {
        this.cleanupOldTraces();
      },
      5 * 60 * 1000,
    ).unref();
  }

  onModuleDestroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * 统一的 AI 调用入口
   *
   * 所有 AI 调用都应该通过此方法，包括：
   * - 文本生成 (chat, completion)
   * - 摘要 (summarization)
   * - 翻译 (translation)
   * - 内容提取 (extraction)
   * - 图像生成 (image_generation)
   *
   * @param input AI 调用输入
   * @returns AI 调用结果
   */
  async call(input: AiCallInput): Promise<AiCallResult> {
    const traceId = this.generateTraceId();
    const startTime = Date.now();

    this.logger.log(
      `[${traceId}] AI call started: task=${input.taskType}, source=${input.metadata?.source || "unknown"}`,
    );

    // 创建追踪记录
    const trace: AiCallTrace = {
      traceId,
      taskType: input.taskType,
      modelId: "",
      provider: "",
      startTime: new Date(),
      status: "pending",
      metadata: input.metadata,
    };
    this.callTraces.set(traceId, trace);

    try {
      // 1. 选择模型
      const model = await this.modelSelector.selectModel(input.taskType, {
        preferredModelId: input.modelId,
        strategy: input.strategy,
      });

      if (!model) {
        const error = `No available model for task type: ${input.taskType}`;
        this.completeTrace(traceId, "failed", { error });
        return this.createErrorResult(error, startTime, traceId);
      }

      trace.modelId = model.id;
      trace.provider = model.provider;

      // 2. 获取 Provider
      const provider = this.providerFactory.getProviderForModel(model);
      if (!provider) {
        const error = `No provider available for model: ${model.name} (${model.provider})`;
        this.completeTrace(traceId, "failed", { error });
        return this.createErrorResult(error, startTime, traceId);
      }

      // 3. 获取降级模型链
      const fallbackModels = await this.modelSelector.getFallbackChain(
        input.taskType,
        model.id,
      );

      // 4. 构建调用函数
      const primaryCall = () => provider.execute(model, input);
      const fallbackCalls = fallbackModels.map((m) => {
        const fallbackProvider = this.providerFactory.getProviderForModel(m);
        return {
          model: m,
          call: () =>
            fallbackProvider
              ? fallbackProvider.execute(m, input)
              : Promise.reject(new Error(`No provider for ${m.name}`)),
        };
      });

      // 5. 执行带降级的调用
      const result = await this.fallbackManager.executeWithFallback(
        primaryCall,
        fallbackCalls,
      );

      // 6. 更新追踪和模型状态
      if (result.success) {
        this.modelSelector.reportModelSuccess(result.model);
        this.completeTrace(traceId, "success", {
          tokensUsed: result.tokensUsed,
          latencyMs: Date.now() - startTime,
        });
      } else {
        this.modelSelector.reportModelFailure(
          result.model,
          result.error || "Unknown error",
        );
        this.completeTrace(traceId, "failed", {
          error: result.error,
          latencyMs: Date.now() - startTime,
        });
      }

      result.latencyMs = Date.now() - startTime;
      result.traceId = traceId;

      this.logger.log(
        `[${traceId}] AI call completed: success=${result.success}, latency=${result.latencyMs}ms`,
      );

      return result;
    } catch (error) {
      const classified = this.errorClassifier.classify(error);
      const errorMessage = classified.message;

      this.logger.error(`[${traceId}] AI call failed: ${errorMessage}`);
      this.completeTrace(traceId, "failed", {
        error: errorMessage,
        latencyMs: Date.now() - startTime,
      });

      return {
        success: false,
        error: errorMessage,
        errorType: classified.type,
        model: "unknown",
        provider: "unknown",
        tokensUsed: 0,
        latencyMs: Date.now() - startTime,
        traceId,
      };
    }
  }

  /**
   * 生成追踪 ID
   */
  private generateTraceId(): string {
    return `ai-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * 完成追踪记录
   */
  private completeTrace(
    traceId: string,
    status: "success" | "failed",
    data: {
      tokensUsed?: number;
      latencyMs?: number;
      error?: string;
    },
  ): void {
    const trace = this.callTraces.get(traceId);
    if (trace) {
      trace.endTime = new Date();
      trace.status = status;
      trace.tokensUsed = data.tokensUsed;
      trace.latencyMs = data.latencyMs;
      trace.error = data.error;
    }

    // 检查是否需要清理
    if (this.callTraces.size > this.traceConfig.maxSize) {
      this.cleanupOldTraces();
    }
  }

  /**
   * 清理过期的追踪记录
   *
   * 优化：批量清理，避免每次只删除一条
   */
  private cleanupOldTraces(): void {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [traceId, trace] of this.callTraces) {
      const age = now - trace.startTime.getTime();
      if (age > this.traceConfig.maxAgeMs || trace.status !== "pending") {
        toDelete.push(traceId);
        if (toDelete.length >= this.traceConfig.cleanupBatchSize) {
          break;
        }
      }
    }

    for (const traceId of toDelete) {
      this.callTraces.delete(traceId);
    }

    if (toDelete.length > 0) {
      this.logger.debug(`Cleaned up ${toDelete.length} old traces`);
    }
  }

  /**
   * 创建错误结果
   */
  private createErrorResult(
    error: string,
    startTime: number,
    traceId?: string,
  ): AiCallResult {
    return {
      success: false,
      error,
      model: "none",
      provider: "none",
      tokensUsed: 0,
      latencyMs: Date.now() - startTime,
      traceId,
    };
  }

  /**
   * 获取最近的调用追踪 (用于调试和监控)
   */
  getRecentTraces(limit = 100): AiCallTrace[] {
    return Array.from(this.callTraces.values()).slice(-limit).reverse();
  }

  /**
   * 获取追踪统计信息
   */
  getTraceStats(): {
    totalTraces: number;
    pendingTraces: number;
    successRate: number;
    averageLatencyMs: number;
  } {
    const traces = Array.from(this.callTraces.values());
    const completed = traces.filter((t) => t.status !== "pending");
    const successful = completed.filter((t) => t.status === "success");
    const latencies = completed
      .map((t) => t.latencyMs)
      .filter((l): l is number => l !== undefined);

    return {
      totalTraces: traces.length,
      pendingTraces: traces.length - completed.length,
      successRate:
        completed.length > 0 ? successful.length / completed.length : 0,
      averageLatencyMs:
        latencies.length > 0
          ? latencies.reduce((a, b) => a + b, 0) / latencies.length
          : 0,
    };
  }
}
